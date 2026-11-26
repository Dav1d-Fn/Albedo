import { TextTable } from "./GermanTexts";

/** Every English text of the PC app, same keys as `germanTexts`. */
export const englishTexts: TextTable =
{
  appSubtitle: "Companion",

  nav:
  {
    library: "Library",
    devices: "Devices",
    status: "Status & login",
  },

  sidebar:
  {
    companionRunning: "Companion running",
    companionDown: "Companion not running",
    sunshineConnected: "Sunshine connected",
    sunshineProblem: "Sunshine: problem",
    modes: "modes",
    noModes: "Monitor unknown",
  },

  common:
  {
    cancel: "Cancel",
    no: "No",
    remove: "Remove",
    reload: "Rescan",
    retry: "Try again",
  },

  library:
  {
    title: "Library",
    searchPlaceholder: "Search games and apps",
    all: "All",
    inSunshine: "In Sunshine",
    ownGroup: "own group",
    inSunshineOf: (inSunshine: number, total: number) => `${inSunshine} of ${total} in Sunshine`,
    nothingFound: "Nothing found.",
    loading: "Reading the library …",
    companionDown: "The PC companion does not answer. Is port 47995 taken by another program (old service \"albedo-companion\")? Then quit Albedo Companion from the tray icon and start it again.",
    sunshineHint: "Adding and removing doesn't work right now:",
    toLogin: "To the login",
    pickHint: "Pick a game on the left.",
  },

  entry:
  {
    inSunshineAs: (name: string) => `In Sunshine as "${name}"`,
    notInSunshine: "Not in Sunshine yet",
    add: "Add",
    added: (name: string) => `"${name}" is in Sunshine now.`,
    removed: (name: string) => `"${name}" was removed from Sunshine.`,
    group: "Group",
    detected: "detected",
    own: "own",
    newGroup: "New group …",
    createGroup: "Create",
    backToDetected: "Back to detection",
    groupAppliesOnDeck: "Also applies in the launcher on the Deck.",
    groupChanged: (group: string) => `Group: ${group}`,
    pictures: "Pictures",
    customPicture: "CUSTOM",
    setPicture: "Set picture …",
    reset: (kind: string) => `Reset ${kind.toLowerCase()}`,
    resetDone: (kind: string) => `${kind} is automatic again.`,
    sources:
    {
      preset: "Preset",
      steam: "Steam",
      shortcut: "Non-Steam shortcut",
      heroic: "Heroic",
      lutris: "Lutris",
      prism: "Prism Launcher",
      desktop: "App",
    } as Record<string, string>,
  },

  artKinds:
  {
    cover: "Cover",
    hero: "Title art",
    logo: "Logo",
  } as Record<string, string>,

  art:
  {
    title: (name: string) => `Set picture – ${name}`,
    subtitle: "Replaces the picture everywhere, in Sunshine and in the launcher too.",
    close: "Close",
    kind: "Kind of picture",
    query: "Search text",
    search: "Search",
    searching: "Searching …",
    allSources: "All",
    noResults: "No pictures found. Another search text?",
    ownPicture: "Own picture",
    dropHint: "Drop a file here or pick one. PNG, JPG, WebP … up to 15 MB, gets cropped.",
    pickFile: "Pick file …",
    dropNow: "Drop to set",
    uploading: "Uploading …",
    noKeyHint: "Without a SteamGridDB key the companion only searches the Steam shop and libretro. Key under \"Status & login\".",
    resetToAuto: "Reset to automatic",
    current: (kind: string) => `Current: ${kind.toLowerCase()}`,
    currentCustom: "custom",
    currentAutomatic: "automatic",
    noPicture: "No picture",
    apply: (kind: string) => `Set as ${kind.toLowerCase()}`,
    applied: (kind: string) => `${kind} set.`,
    notAnImage: "That is not an image.",
    tooLarge: "Image too large (15 MB at most).",
  },

  devices:
  {
    title: "Devices",
    lead: "Sign in a Steam Deck, phone or TV with Moonlight to this PC.",
    pairTitle: "Pair a new device",
    step1: "In Moonlight on the device, pick this PC (or \"Pair\" in the Albedo launcher).",
    step2: "Type the four-digit PIN the device shows here.",
    waiting: "Waiting to pair",
    noneWaiting: "No device is waiting yet. Pick the PC in Moonlight.",
    pin: "PIN",
    deviceName: "Name for the device",
    pair: "Pair",
    paired: (name: string) => `"${name}" is paired.`,
    pairedTitle: "Paired devices",
    none: "No device paired yet.",
    reallyRemove: "Really?",
    unpaired: (name: string) => `"${name}" was unpaired.`,
    unpairHint: "A removed device has to pair again before it can stream.",
  },

  status:
  {
    title: "Status & login",
    companion: "Companion for the Deck",
    running: "Running",
    notRunning: "Not running",
    notRunningHint: "Port taken? Quit Albedo Companion (tray) and start it again",
    sunshine: "Sunshine",
    connected: "Connected",
    problem: "Problem",
    blocked: "Adding and removing needs the login",
    monitor: "Virtual monitor",
    modesCount: (count: number) => `${count} modes`,
    upTo: (mode: string) => `up to ${mode}`,
    unknown: "Unknown",
    loginTitle: "Sunshine login",
    loginLead: "Enter the same user as in Sunshine's web UI.",
    user: "User",
    password: "Password",
    loginHelp: "Checked first, then saved. The password stays on this PC.",
    saveLogin: "Check and save",
    loginSaved: "Sunshine login saved.",
    modesTitle: (output: string) => `Modes of ${output}`,
    modesLead: "The PC follows the device's resolution",
    settings: "Settings",
    language: "Language",
    system: "System",
    gridDbKey: "SteamGridDB key (optional)",
    gridDbPlaceholder: "For more pictures in the picture search",
    gridDbGetKey: "Get a key",
    gridDbNewKey: "Type a new key to replace the stored one",
    gridDbRemove: "Remove",
    gridDbSaved: (lastCharacters: string) => "Stored (…" + lastCharacters + "), also used by the Steam Deck.",
    gridDbNeedsCompanion: "The key is kept by the companion, which is not answering right now.",
    gridDbChecking: "Checking key …",
    gridDbWorks: "Works ✓",
  },
};
