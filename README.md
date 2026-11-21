# Albedo

Per Controller bedienbares Menü für Moonlight auf dem Steam Deck. Zeigt die Spiele (Sunshine-Apps)
vom Gaming-PC und startet Moonlight mit Auflösung, FPS, Bitrate, Codec und HDR des aktiven
Geräte-Modus (Handheld/TV). Wenn Moonlight beendet wird, ist man wieder im Launcher.

## Auf dem PC ausprobieren

```bash
npm install
npm run tauri dev
```

- Beim ersten Start öffnet sich „Verbindung“: PC wählen (wird per mDNS gefunden) oder IP eintippen,
  dann „Koppeln“ → die angezeigte PIN in der Sunshine-Weboberfläche unter „PIN“ eingeben.
- Probelauf ohne an sich selbst zu streamen: `STREAMING_LAUNCHER_DRY_RUN=1 npm run tauri dev`
  (loggt den Moonlight-Befehl, startet statt Moonlight nur `sleep 2`).
- Nur Oberfläche im Browser, mit Testdaten: `npm run dev` und http://localhost:1430 öffnen.
- Einstellungen: `~/.config/de.davidf.streaminglauncher/settings.json`
- Nach dem Trennen in Moonlight fragt der Launcher, ob das Spiel auf dem PC weiterlaufen (Pausieren) oder
  beendet werden soll. Mit Y lässt sich die Entscheidung merken; ändern unter „Verbindung“ → „Nach dem Stream“.

Tasten: Pfeile, Enter = A, Esc = B, X = Gerät, Q/E = L1/R1 (Modus), Y = merken/neu laden, M = Profile.

## Aufs Steam Deck

Im Desktop-Modus die Konsole öffnen und ausführen:

```bash
curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/streaming-launcher/main/deck/install.sh | bash
```

Das Skript lädt das neueste AppImage nach `~/Applications/`, bietet an, Moonlight (Flatpak) zu installieren,
beendet Steam nach Rückfrage und trägt den Launcher als Nicht-Steam-Spiel mit Cover, Titelbild, Logo und
Startoption ein. Danach startet Steam wieder. Nochmal ausführen aktualisiert den Eintrag, auch einen von Hand
angelegten, statt einen zweiten anzulegen. `shortcuts.vdf` wird vorher gesichert (`shortcuts.vdf.bak-…`).
Entfernen: dasselbe mit `bash -s -- --uninstall` am Ende.

Danach im Game Mode starten und einmal **koppeln** (PIN in Sunshine eingeben).

**Updates** kommen aus der App: Beim Start fragt der Launcher „Update verfügbar“, A installiert und startet neu.
Das klappt nur, solange das Repo öffentlich ist (Releases ohne Token).

**Solange das Repo privat ist:** AppImage am PC holen und mit dem Repo-Ordner aufs Deck kopieren:

```bash
gh release download --pattern '*.AppImage' --dir deck/
```

```bash
scp -r deck artwork deck@steamdeck:~/streaming-launcher-install/
```

Auf dem Deck dann `bash ~/streaming-launcher-install/deck/install.sh` ausführen.

### Release bauen

Version in `src-tauri/tauri.conf.json` erhöhen, dann Tag pushen. GitHub Actions baut das AppImage auf
Ubuntu 22.04 (glibc passt zu SteamOS), signiert es und legt das Release samt `latest.json` an:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

Der Signierschlüssel liegt nur in den Repo-Secrets `TAURI_SIGNING_PRIVATE_KEY` und
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (Kopie unter `~/.tauri/` am PC, nicht verlieren: ohne ihn nehmen
installierte Launcher keine Updates mehr an). Lokal bauen geht weiter ohne Schlüssel:
`nice -n 19 npm run tauri build -- --bundles appimage`.

Die Startoption `WEBKIT_DISABLE_DMABUF_RENDERER=1 %command%` setzt das Skript; ohne sie bleibt das Fenster
unter gamescope schwarz (WebKitGTK). Controller: Der Launcher liest das Gamepad selbst
(`gilrs`); die Steam-Input-Vorlage „Gamepad“ reicht. Tastatur geht immer.

Noch nicht auf dem Deck getestet: Fensterwechsel Launcher ↔ Moonlight unter gamescope, Dock-Erkennung
über `/sys/class/drm`.
