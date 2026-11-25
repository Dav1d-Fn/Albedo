#!/usr/bin/env bash
# Installs the launcher on a Steam Deck (desktop mode) and adds it to Steam as a non-Steam game
# with artwork. Running it again updates the existing entry instead of adding a second one.
#
#   bash install.sh                      # AppImage next to this script or the latest GitHub release
#   bash install.sh --appimage FILE      # a specific AppImage
#   bash install.sh --uninstall          # remove AppImage, Steam entry and artwork
#   bash install.sh --yes                # answer every question with yes (e.g. closing Steam)
#
# Also works as a one-liner once the repository is public:
#   curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/albedo/main/deck/install.sh | bash
set -euo pipefail

# ------------------------------------------------------------------ names and paths

APP_NAME="Albedo"
# Earlier names and file name parts: an existing Steam entry with one of these is taken over.
KNOWN_NAMES="Streaming-Launcher Albedo"
KNOWN_EXE_PARTS="streaming-launcher streaming_launcher albedo.appimage albedo_"
REPO="Dav1d-Fn/albedo"
CONFIG_DIR="$HOME/.config/de.davidf.albedo"
# App id before the rename to Albedo: the app moves this folder to CONFIG_DIR on its first start,
# --uninstall also removes what an old version left (settings, picture cache, WebKit data).
LEGACY_APP_DIRS="$HOME/.config/de.davidf.streaminglauncher $HOME/.cache/de.davidf.streaminglauncher $HOME/.local/share/de.davidf.streaminglauncher"
MOONLIGHT_FLATPAK="com.moonlight_stream.Moonlight"
# Empty on purpose: also clears WEBKIT_DISABLE_DMABUF_RENDERER=1 that older installers set,
# it forces WebKitGTK into software rendering and drops the home screen to a few FPS.
LAUNCH_OPTIONS=""

INSTALL_DIR="$HOME/Applications"
# Fixed file name without version: the updater in the app replaces exactly this file.
APPIMAGE_TARGET="$INSTALL_DIR/$APP_NAME.AppImage"
STEAM_USERDATA="$HOME/.local/share/Steam/userdata"
ARTWORK_FILES="cover.png wide.png hero.png logo.png icon.png"

SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]
then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# ------------------------------------------------------------------ arguments

MODE="install"
APPIMAGE_SOURCE=""
ASSUME_YES=0
while [[ $# -gt 0 ]]
do
    case "$1" in
        --appimage)
            APPIMAGE_SOURCE="$2"
            shift 2
            ;;
        --uninstall)
            MODE="uninstall"
            shift
            ;;
        --yes|-y)
            ASSUME_YES=1
            shift
            ;;
        *)
            echo "Unbekannte Option: $1" >&2
            exit 2
            ;;
    esac
done

# ------------------------------------------------------------------ helpers

say()
{
    echo -e "\033[1;34m==>\033[0m $*"
}

warn()
{
    echo -e "\033[1;33m!!\033[0m $*" >&2
}

# Asks a yes/no question on the terminal, also when the script itself comes through a pipe (curl | bash).
ask()
{
    if [[ $ASSUME_YES -eq 1 ]]
    then
        return 0
    fi
    local answer=""
    read -r -p "$1 [J/n] " answer </dev/tty || answer="n"
    [[ -z "$answer" || "$answer" =~ ^[JjYy] ]]
}

steam_is_running()
{
    pgrep -x steam >/dev/null 2>&1
}

STEAM_WAS_RUNNING=0

stop_steam()
{
    if ! steam_is_running
    then
        return 0
    fi
    if ! ask "Steam muss kurz beendet werden, damit der Eintrag gespeichert wird. Jetzt beenden?"
    then
        echo "Abgebrochen, nichts geändert."
        exit 1
    fi
    STEAM_WAS_RUNNING=1
    say "Beende Steam …"
    steam -shutdown >/dev/null 2>&1 || true
    local waitedSeconds=0
    while steam_is_running
    do
        sleep 1
        waitedSeconds=$((waitedSeconds + 1))
        if [[ $waitedSeconds -ge 60 ]]
        then
            warn "Steam lässt sich nicht beenden. Bitte von Hand schließen und das Skript neu starten."
            exit 1
        fi
    done
}

start_steam_again()
{
    if [[ $STEAM_WAS_RUNNING -eq 1 ]]
    then
        say "Starte Steam wieder …"
        setsid steam >/dev/null 2>&1 < /dev/null &
    fi
}

# Every Steam account on this device that has a config folder.
steam_user_config_dirs()
{
    local userDir
    for userDir in "$STEAM_USERDATA"/*/
    do
        local userId
        userId="$(basename "$userDir")"
        if [[ "$userId" =~ ^[0-9]+$ && "$userId" != "0" && -d "$userDir/config" ]]
        then
            echo "${userDir%/}/config"
        fi
    done
}

# Prints the path of the AppImage to install; downloads the latest release if none is given or found.
find_appimage()
{
    if [[ -n "$APPIMAGE_SOURCE" ]]
    then
        echo "$APPIMAGE_SOURCE"
        return 0
    fi
    if [[ -n "$SCRIPT_DIR" ]]
    then
        local candidate
        for candidate in "$SCRIPT_DIR"/*.AppImage "$SCRIPT_DIR"/../*.AppImage
        do
            if [[ -f "$candidate" ]]
            then
                echo "$candidate"
                return 0
            fi
        done
    fi
    say "Lade die neueste Version von GitHub …" >&2
    local downloadUrl
    downloadUrl="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
        | python3 -c 'import json, sys; print(next(asset["browser_download_url"] for asset in json.load(sys.stdin)["assets"] if asset["name"].endswith(".AppImage") and "Companion" not in asset["name"]))' \
        2>/dev/null)" || true
    if [[ -z "$downloadUrl" ]]
    then
        warn "Kein Release gefunden (Repo privat oder offline?). AppImage aufs Deck kopieren und mit --appimage DATEI angeben."
        exit 1
    fi
    curl -fL --progress-bar -o "$WORK_DIR/download.AppImage" "$downloadUrl"
    echo "$WORK_DIR/download.AppImage"
}

# Prints a folder with cover.png, wide.png, … from the repository next to this script or from GitHub.
find_artwork()
{
    local localDir
    for localDir in "$SCRIPT_DIR/../artwork/steam" "$SCRIPT_DIR/artwork/steam" "$SCRIPT_DIR/artwork"
    do
        if [[ -n "$SCRIPT_DIR" && -f "$localDir/cover.png" ]]
        then
            echo "$localDir"
            return 0
        fi
    done
    local artworkFile
    mkdir -p "$WORK_DIR/artwork"
    for artworkFile in $ARTWORK_FILES
    do
        curl -fsSL -o "$WORK_DIR/artwork/$artworkFile" \
            "https://raw.githubusercontent.com/$REPO/main/artwork/steam/$artworkFile" 2>/dev/null \
            || rm -f "$WORK_DIR/artwork/$artworkFile"
    done
    echo "$WORK_DIR/artwork"
}

# Runs the shortcuts.vdf editor below with: add|remove <config dir> [<exe> <artwork dir>].
edit_shortcuts()
{
    APP_NAME="$APP_NAME" KNOWN_NAMES="$KNOWN_NAMES" KNOWN_EXE_PARTS="$KNOWN_EXE_PARTS" \
        LAUNCH_OPTIONS="$LAUNCH_OPTIONS" python3 - "$@" <<'PYTHON'
import os
import shutil
import struct
import sys
import time
import zlib


class BinaryVdf:
    """Reads and writes Steam's binary KeyValues format (shortcuts.vdf) without losing unknown fields."""

    MAP = 0x00
    STRING = 0x01
    INT32 = 0x02
    END = 0x08
    # Other value types Steam may write, with their size in bytes; they are kept as raw bytes.
    FIXED_SIZES = {0x03: 4, 0x04: 4, 0x05: 4, 0x06: 4, 0x07: 8, 0x0A: 8}

    def __init__(self, data):
        self.data = data
        self.position = 0

    @classmethod
    def parse(cls, data):
        if not data:
            return {"shortcuts": {}}
        return cls(data).read_map()

    def read_cstring(self):
        end = self.data.index(b"\x00", self.position)
        text = self.data[self.position:end].decode("utf-8", "surrogateescape")
        self.position = end + 1
        return text

    def read_map(self):
        result = {}
        while self.position < len(self.data):
            valueType = self.data[self.position]
            self.position += 1
            if valueType == self.END:
                return result
            key = self.read_cstring()
            if valueType == self.MAP:
                result[key] = self.read_map()
            elif valueType == self.STRING:
                result[key] = self.read_cstring()
            elif valueType == self.INT32:
                result[key] = struct.unpack_from("<I", self.data, self.position)[0]
                self.position += 4
            elif valueType in self.FIXED_SIZES:
                size = self.FIXED_SIZES[valueType]
                result[key] = (valueType, self.data[self.position:self.position + size])
                self.position += size
            else:
                raise ValueError("unknown VDF type %d at byte %d" % (valueType, self.position))
        return result

    @classmethod
    def dump(cls, tree):
        output = bytearray()
        cls.write_map(tree, output)
        return bytes(output)

    @classmethod
    def write_map(cls, tree, output):
        for key, value in tree.items():
            encodedKey = key.encode("utf-8", "surrogateescape") + b"\x00"
            if isinstance(value, dict):
                output += bytes([cls.MAP]) + encodedKey
                cls.write_map(value, output)
            elif isinstance(value, str):
                output += bytes([cls.STRING]) + encodedKey + value.encode("utf-8", "surrogateescape") + b"\x00"
            elif isinstance(value, int):
                output += bytes([cls.INT32]) + encodedKey + struct.pack("<I", value & 0xFFFFFFFF)
            else:
                rawType, rawBytes = value
                output += bytes([rawType]) + encodedKey + rawBytes
        output.append(cls.END)


class ShortcutEntry:
    """One non-Steam game in shortcuts.vdf; Steam's key spelling varies, so lookups ignore case."""

    def __init__(self, fields):
        self.fields = fields

    def get(self, name, default=None):
        for key, value in self.fields.items():
            if key.lower() == name.lower():
                return value
        return default

    def set(self, name, value):
        for key in list(self.fields):
            if key.lower() == name.lower():
                self.fields[key] = value
                return
        self.fields[name] = value

    def is_ours(self, knownNames, knownExeParts):
        appName = str(self.get("AppName", ""))
        exe = str(self.get("Exe", "")).lower()
        return appName in knownNames or any(part in exe for part in knownExeParts)


class SteamShortcuts:
    """Adds, updates and removes the launcher's entry in one Steam account's shortcuts.vdf."""

    ARTWORK_TARGETS = {
        "cover.png": "{id}p.png",
        "wide.png": "{id}.png",
        "hero.png": "{id}_hero.png",
        "logo.png": "{id}_logo.png",
        "icon.png": "{id}_icon.png",
    }

    def __init__(self, configDir):
        self.configDir = configDir
        self.path = os.path.join(configDir, "shortcuts.vdf")
        self.gridDir = os.path.join(configDir, "grid")
        data = b""
        if os.path.exists(self.path):
            with open(self.path, "rb") as vdfFile:
                data = vdfFile.read()
        self.tree = BinaryVdf.parse(data)
        self.tree.setdefault("shortcuts", {})
        self.knownNames = set(os.environ["KNOWN_NAMES"].split()) | {os.environ["APP_NAME"]}
        self.knownExeParts = os.environ["KNOWN_EXE_PARTS"].lower().split()

    @staticmethod
    def legacy_app_id(exe, appName):
        """The id Steam itself derives for a non-Steam game: CRC32 of exe + name with the top bit set."""
        return (zlib.crc32((exe + appName).encode("utf-8")) & 0xFFFFFFFF) | 0x80000000

    def entries(self):
        return [ShortcutEntry(fields) for fields in self.tree["shortcuts"].values()]

    def own_entries(self):
        return [entry for entry in self.entries() if entry.is_ours(self.knownNames, self.knownExeParts)]

    def keep_only(self, entries):
        """Rewrites the list with the given entries, numbered 0..n-1 like Steam does."""
        self.tree["shortcuts"] = {str(index): entry.fields for index, entry in enumerate(entries)}

    def add_or_update(self, exePath, artworkDir):
        appName = os.environ["APP_NAME"]
        quotedExe = '"%s"' % exePath
        quotedStartDir = '"%s"' % os.path.dirname(exePath)
        ownEntries = self.own_entries()
        if ownEntries:
            # Take over the first existing entry (keeps play time and collections), drop duplicates.
            entry = ownEntries[0]
            otherEntries = [other for other in self.entries() if not other.is_ours(self.knownNames, self.knownExeParts)]
            self.keep_only(otherEntries + [entry])
            previousExe = str(entry.get("Exe", "")).strip('"')
            print("Vorhandener Eintrag übernommen: %s" % entry.get("AppName", ""), file=sys.stderr)
        else:
            entry = ShortcutEntry({})
            self.keep_only(self.entries() + [entry])
            previousExe = ""
            entry.set("IsHidden", 0)
            entry.set("AllowDesktopConfig", 1)
            entry.set("AllowOverlay", 1)
            entry.set("OpenVR", 0)
            entry.set("Devkit", 0)
            entry.set("DevkitGameID", "")
            entry.set("DevkitOverrideAppID", 0)
            entry.set("LastPlayTime", int(time.time()))
            entry.set("FlatpakAppID", "")
            entry.set("tags", {})

        appId = entry.get("appid")
        if not isinstance(appId, int) or appId == 0:
            appId = self.legacy_app_id(quotedExe, appName)
        entry.set("appid", appId)
        entry.set("AppName", appName)
        entry.set("Exe", quotedExe)
        entry.set("StartDir", quotedStartDir)
        entry.set("ShortcutPath", "")
        entry.set("LaunchOptions", os.environ["LAUNCH_OPTIONS"])

        iconPath = self.copy_artwork(appId, artworkDir)
        entry.set("icon", iconPath)
        self.save()
        print("%d %s" % (appId, previousExe))

    def copy_artwork(self, appId, artworkDir):
        """Copies the pictures into grid/ under Steam's file names; returns the icon path ("" if none)."""
        os.makedirs(self.gridDir, exist_ok=True)
        iconPath = ""
        for sourceName, targetPattern in self.ARTWORK_TARGETS.items():
            source = os.path.join(artworkDir, sourceName)
            if not os.path.isfile(source):
                continue
            target = os.path.join(self.gridDir, targetPattern.format(id=appId))
            shutil.copyfile(source, target)
            if sourceName == "icon.png":
                iconPath = target
        return iconPath

    def remove(self):
        ownEntries = self.own_entries()
        for entry in ownEntries:
            appId = entry.get("appid")
            if isinstance(appId, int):
                for targetPattern in self.ARTWORK_TARGETS.values():
                    target = os.path.join(self.gridDir, targetPattern.format(id=appId))
                    if os.path.exists(target):
                        os.remove(target)
        self.keep_only([other for other in self.entries() if not other.is_ours(self.knownNames, self.knownExeParts)])
        if ownEntries:
            self.save()
        # First line: how many entries went; then the program of each, so the shell can delete old AppImages.
        print(len(ownEntries))
        for entry in ownEntries:
            print(entry.get("Exe", "").strip('"'))

    def save(self):
        if os.path.exists(self.path):
            backupPath = self.path + ".bak-" + time.strftime("%Y%m%d-%H%M%S")
            shutil.copyfile(self.path, backupPath)
        temporaryPath = self.path + ".tmp"
        with open(temporaryPath, "wb") as vdfFile:
            vdfFile.write(BinaryVdf.dump(self.tree))
        os.replace(temporaryPath, self.path)


command = sys.argv[1]
shortcuts = SteamShortcuts(sys.argv[2])
if command == "add":
    shortcuts.add_or_update(sys.argv[3], sys.argv[4])
elif command == "remove":
    shortcuts.remove()
elif command == "list":
    for listedEntry in shortcuts.entries():
        print("%s\t%s\t%s" % (listedEntry.get("appid"), listedEntry.get("AppName"), listedEntry.get("Exe")))
PYTHON
}

# ------------------------------------------------------------------ install and uninstall

offer_moonlight()
{
    if flatpak info "$MOONLIGHT_FLATPAK" >/dev/null 2>&1
    then
        return 0
    fi
    if ask "Moonlight (Flatpak) fehlt. Jetzt installieren?"
    then
        say "Installiere Moonlight …"
        flatpak install --user -y flathub "$MOONLIGHT_FLATPAK" </dev/tty \
            || warn "Moonlight-Installation fehlgeschlagen. Später im Discover-Store installieren."
    fi
}

install_launcher()
{
    local configDirs
    configDirs="$(steam_user_config_dirs)"
    if [[ -z "$configDirs" ]]
    then
        warn "Kein Steam-Konto unter $STEAM_USERDATA gefunden. Steam einmal starten und anmelden."
        exit 1
    fi

    local appImageSource
    appImageSource="$(find_appimage)"
    local artworkDir
    artworkDir="$(find_artwork)"

    say "Kopiere AppImage nach $APPIMAGE_TARGET"
    mkdir -p "$INSTALL_DIR"
    if [[ "$(realpath "$appImageSource")" != "$(realpath -m "$APPIMAGE_TARGET")" ]]
    then
        cp "$appImageSource" "$APPIMAGE_TARGET.part"
        mv "$APPIMAGE_TARGET.part" "$APPIMAGE_TARGET"
    fi
    chmod +x "$APPIMAGE_TARGET"

    offer_moonlight
    stop_steam

    local configDir
    while read -r configDir
    do
        say "Steam-Eintrag in $configDir"
        local result
        result="$(edit_shortcuts add "$configDir" "$APPIMAGE_TARGET" "$artworkDir")"
        local previousExe="${result#* }"
        # A manually installed, versioned AppImage in ~/Applications is replaced by the fixed file name.
        if [[ -n "$previousExe" && "$previousExe" != "$APPIMAGE_TARGET" && "$previousExe" == "$INSTALL_DIR"/*.AppImage && -f "$previousExe" ]]
        then
            say "Entferne alte Datei $previousExe"
            rm -f "$previousExe"
        fi
    done <<< "$configDirs"

    start_steam_again
    say "Fertig. Im Game Mode unter Bibliothek → Nicht-Steam steht jetzt „$APP_NAME“."
}

uninstall_launcher()
{
    stop_steam
    local configDir
    while read -r configDir
    do
        if [[ -n "$configDir" ]]
        then
            local removeResult
            removeResult="$(edit_shortcuts remove "$configDir")"
            say "$(head -n 1 <<< "$removeResult") Steam-Eintrag/Einträge entfernt in $configDir"
            # Entries under an earlier name point to their own AppImage (e.g. Streaming-Launcher.AppImage).
            local removedExe
            while read -r removedExe
            do
                if [[ "$removedExe" == "$INSTALL_DIR"/*.AppImage && -f "$removedExe" ]]
                then
                    say "Entferne $removedExe"
                    rm -f "$removedExe"
                fi
            done <<< "$(tail -n +2 <<< "$removeResult")"
        fi
    done <<< "$(steam_user_config_dirs)"
    rm -f "$APPIMAGE_TARGET"
    start_steam_again
    # --yes never deletes settings, that needs a real answer.
    local settingsDirs=""
    local settingsDir
    for settingsDir in "$CONFIG_DIR" $LEGACY_APP_DIRS
    do
        if [[ -d "$settingsDir" ]]
        then
            settingsDirs+="$settingsDir "
        fi
    done
    if [[ -n "$settingsDirs" && $ASSUME_YES -eq 0 ]] && ask "Auch die Einstellungen (${settingsDirs% }) löschen?"
    then
        # Unquoted on purpose: one word per folder (the paths have no spaces).
        rm -rf $settingsDirs
    fi
    say "Deinstalliert."
}

if [[ "$MODE" == "uninstall" ]]
then
    uninstall_launcher
else
    install_launcher
fi
