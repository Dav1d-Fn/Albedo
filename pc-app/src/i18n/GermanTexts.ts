/** Every German text of the PC app. `EnglishTexts.ts` has the same keys (tsc checks it). */
export const germanTexts =
{
  appSubtitle: "PC-Helfer",

  nav:
  {
    library: "Bibliothek",
    devices: "Geräte",
    status: "Status & Login",
  },

  sidebar:
  {
    companionRunning: "Helfer läuft",
    companionDown: "Helfer läuft nicht",
    sunshineConnected: "Sunshine verbunden",
    sunshineProblem: "Sunshine: Problem",
    modes: "Modi",
    noModes: "Monitor unbekannt",
  },

  common:
  {
    cancel: "Abbrechen",
    no: "Nein",
    remove: "Entfernen",
    reload: "Neu einlesen",
    retry: "Nochmal versuchen",
  },

  library:
  {
    title: "Bibliothek",
    searchPlaceholder: "Spiele und Programme suchen",
    all: "Alle",
    inSunshine: "In Sunshine",
    ownGroup: "eigene Gruppe",
    inSunshineOf: (inSunshine: number, total: number) => `${inSunshine} von ${total} in Sunshine`,
    nothingFound: "Nichts gefunden.",
    loading: "Lese die Bibliothek …",
    companionDown: "Der PC-Helfer antwortet nicht. Läuft der Dienst „streaming-launcher-companion“?",
    sunshineHint: "Hinzufügen und Entfernen geht gerade nicht:",
    toLogin: "Zum Login",
    pickHint: "Wähle links ein Spiel.",
  },

  entry:
  {
    inSunshineAs: (name: string) => `In Sunshine als „${name}“`,
    notInSunshine: "Noch nicht in Sunshine",
    add: "Hinzufügen",
    added: (name: string) => `„${name}“ ist jetzt in Sunshine.`,
    removed: (name: string) => `„${name}“ ist aus Sunshine entfernt.`,
    group: "Gruppe",
    detected: "erkannt",
    own: "eigene",
    newGroup: "Neue Gruppe …",
    createGroup: "Anlegen",
    backToDetected: "Zurück zur Erkennung",
    groupAppliesOnDeck: "Gilt auch im Launcher auf dem Deck.",
    groupChanged: (group: string) => `Gruppe: ${group}`,
    pictures: "Bilder",
    customPicture: "EIGENES",
    setPicture: "Bild setzen …",
    reset: (kind: string) => `${kind} zurücksetzen`,
    resetDone: (kind: string) => `${kind} ist wieder automatisch.`,
    sources:
    {
      preset: "Voreinstellung",
      steam: "Steam",
      shortcut: "Nicht-Steam-Verknüpfung",
      heroic: "Heroic",
      lutris: "Lutris",
      prism: "Prism Launcher",
      desktop: "Programm",
    } as Record<string, string>,
  },

  artKinds:
  {
    cover: "Cover",
    hero: "Titelbild",
    logo: "Logo",
  } as Record<string, string>,

  art:
  {
    title: (name: string) => `Bild setzen – ${name}`,
    subtitle: "Ersetzt das Bild überall, auch in Sunshine und im Launcher.",
    close: "Schließen",
    kind: "Art des Bildes",
    query: "Suchbegriff",
    search: "Suchen",
    searching: "Suche …",
    allSources: "Alle",
    noResults: "Keine Bilder gefunden. Anderer Suchbegriff?",
    ownPicture: "Eigenes Bild",
    dropHint: "Datei hierher ziehen oder auswählen. PNG, JPG, WebP … bis 15 MB, wird zugeschnitten.",
    pickFile: "Datei auswählen …",
    dropNow: "Loslassen zum Setzen",
    uploading: "Lade hoch …",
    noKeyHint: "Ohne SteamGridDB-Schlüssel sucht der Helfer nur im Steam-Shop und bei libretro. Schlüssel unter „Status & Login“.",
    resetToAuto: "Auf automatisch zurücksetzen",
    apply: (kind: string) => `Als ${kind} setzen`,
    applied: (kind: string) => `${kind} gesetzt.`,
    notAnImage: "Das ist kein Bild.",
    tooLarge: "Bild zu groß (höchstens 15 MB).",
  },

  devices:
  {
    title: "Geräte",
    lead: "Steam Deck, Handy oder TV mit Moonlight an diesem PC anmelden.",
    pairTitle: "Neues Gerät koppeln",
    step1: "In Moonlight auf dem Gerät diesen PC wählen (oder im Albedo-Launcher „Koppeln“).",
    step2: "Die vierstellige PIN, die das Gerät zeigt, hier eintippen.",
    waiting: "Wartet aufs Koppeln",
    noneWaiting: "Noch kein Gerät wartet. Wähle den PC in Moonlight.",
    pin: "PIN",
    deviceName: "Name für das Gerät",
    pair: "Koppeln",
    paired: (name: string) => `„${name}“ ist gekoppelt.`,
    pairedTitle: "Gekoppelte Geräte",
    none: "Noch kein Gerät gekoppelt.",
    reallyRemove: "Wirklich?",
    unpaired: (name: string) => `„${name}“ ist entkoppelt.`,
    unpairHint: "Ein entferntes Gerät muss neu gekoppelt werden, bevor es wieder streamen kann.",
  },

  status:
  {
    title: "Status & Login",
    companion: "Helfer-Dienst",
    running: "Läuft",
    notRunning: "Läuft nicht",
    notRunningHint: "systemctl --user start streaming-launcher-companion",
    sunshine: "Sunshine",
    connected: "Verbunden",
    problem: "Problem",
    blocked: "Hinzufügen und Entfernen geht erst mit Login",
    monitor: "Virtueller Monitor",
    modesCount: (count: number) => `${count} Modi`,
    upTo: (mode: string) => `bis ${mode}`,
    unknown: "Unbekannt",
    loginTitle: "Sunshine-Login",
    loginLead: "Trag denselben Benutzer ein wie in der Sunshine-Weboberfläche.",
    user: "Benutzer",
    password: "Passwort",
    loginHelp: "Wird erst geprüft, dann gespeichert. Das Passwort bleibt auf diesem PC.",
    saveLogin: "Prüfen und speichern",
    loginSaved: "Sunshine-Login gespeichert.",
    modesTitle: (output: string) => `Modi von ${output}`,
    modesLead: "Der PC passt sich der Auflösung des Geräts an",
    settings: "Einstellungen",
    language: "Sprache",
    system: "System",
    gridDbKey: "SteamGridDB-Schlüssel (optional)",
    gridDbPlaceholder: "Für mehr Bilder in der Bildersuche",
  },
};

export type TextTable = typeof germanTexts;
