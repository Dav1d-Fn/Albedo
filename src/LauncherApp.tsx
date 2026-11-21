import React, { CSSProperties } from "react";
import { UiText } from "./i18n/UiText";
import { InputRouter } from "./input/InputRouter";
import { ModeText } from "./model/ModeText";
import { DefaultSettings } from "./model/DefaultSettings";
import { DevicePalette } from "./model/DevicePalette";
import { GameArt } from "./model/GameArt";
import { AfterStreamAction, ArtKind, BackdropKind, DeviceId, UiLanguage, DeviceProfile, DiscoveredHost, LibraryEntry, PadButton, PcDisplayMode, Settings, StreamMode, SunshineLoginDraft, SteamGridDbKeyCheck, ImageDialogState, ImageDialogRow, RunningHostApp } from "./model/Types";
import { AvailableUpdate, Backend } from "./services/Backend";
import { CompanionArt } from "./services/CompanionArt";
import { AfterStreamDialog } from "./views/AfterStreamDialog";
import { SwitchGameDialog } from "./views/SwitchGameDialog";
import { StreamSummaryDialog } from "./views/StreamSummaryDialog";
import { ConnectScreen } from "./views/ConnectScreen";
import { ConnectionScreen } from "./views/ConnectionScreen";
import { DetailScreen } from "./views/DetailScreen";
import { EditorRows } from "./views/EditorRows";
import { EditorScreen } from "./views/EditorScreen";
import { HintBar } from "./views/HintBar";
import { HomeScreen } from "./views/HomeScreen";
import { ImageDialog } from "./views/ImageDialog";
import { SearchName } from "./model/SearchName";
import { LibraryScreen } from "./views/LibraryScreen";
import { StreamScreen } from "./views/StreamScreen";
import { SunshineLoginDialog } from "./views/SunshineLoginDialog";
import { ToastCard, ToastContent } from "./views/ToastCard";
import { UpdateDialog } from "./views/UpdateDialog";

export type ScreenName = "home" | "detail" | "connect" | "stream" | "afterStream" | "streamSummary" | "editor" | "connection" | "library";

export type HostState = "loading" | "online" | "error";

export interface LauncherState
{
  settings: Settings | null;
  screen: ScreenName;
  /** Home: focus is on the game rail or on the top bar. */
  zone: "games" | "top";
  /** Index into `games`; -1 = the "Fortsetzen" tile in front of them (see `resumeGame`). */
  gameIndex: number;
  topIndex: number;
  detailIndex: number;
  /** Device and mode currently used for starting games. */
  device: DeviceId;
  currentModes: Record<DeviceId, number>;
  /** Names of the connected external screens (EDID); empty = Deck without dock. */
  displayNames: string[];
  automatic: boolean;
  games: string[];
  /** Game name -> cover image (`data:` URL) from Moonlight's cache. */
  boxArt: Record<string, string>;
  hostState: HostState;
  hostError: string;
  /** The PC address that answered last (home network or Tailscale); "" = not checked yet. */
  activeHost: string;
  toast: ToastContent | null;
  connectSteps: string[];
  connectStep: number;
  lastLaunchError: string;
  /** Dialog after a normal disconnect: 0 = keep the game running, 1 = quit it on the PC. */
  afterStreamIndex: number;
  afterStreamRemember: boolean;
  /** Moonlight's statistics of the last stream (English lines), shown after it when `showStreamSummary` is on. */
  streamSummary: string[];
  /** Editor state. */
  editDevice: DeviceId;
  editModeIndex: number;
  /** Left list entry: "device" = the device settings entry on top, "profile" = the profile at `editModeIndex`. */
  editSection: "device" | "profile";
  editZone: "modes" | "rows" | "actions";
  /** Button under the mode list (see `editorActions`). */
  editActionIndex: number;
  /** "mode"/"device" after the first A on a delete button; the second A deletes. */
  editConfirmDelete: "" | "mode" | "device";
  editRow: number;
  bumps: Record<string, number>;
  /** Modes of the PC's virtual monitor, for the "no matching mode" hint; null = unknown (no companion). */
  pcDisplayModes: PcDisplayMode[] | null;
  /** Connection screen: found hosts on the left, pairing and Moonlight on the right. */
  discoveredHosts: DiscoveredHost[];
  searchingHosts: boolean;
  connectionZone: "hosts" | "rows";
  connectionHostIndex: number;
  connectionRow: number;
  manualHostDraft: string;
  /** Text field for another address of the PC, e.g. its Tailscale IP. */
  extraAddressDraft: string;
  /** SteamGridDB key being typed on the connection screen; saved on A. */
  steamGridDbKeyDraft: string;
  steamGridDbKeyCheck: SteamGridDbKeyCheck;
  pairState: "idle" | "pairing" | "paired" | "error";
  pairPin: string;
  pairMessage: string;
  /** "Hinzufügen" screen: everything the companion on the PC can add to Sunshine. */
  library: LibraryEntry[];
  libraryState: "loading" | "ready" | "error";
  libraryError: string;
  libraryGroupIndex: number;
  libraryItemIndex: number;
  /** Entry id -> cover `data:` URL; null = the PC has none. */
  libraryCovers: Record<string, string | null>;
  /** Id of the entry that is being added or removed right now. */
  libraryBusyId: string;
  /** Something was added or removed, the game list needs a reload on the way back. */
  libraryChanged: boolean;
  /** Why the companion cannot add or remove right now (e.g. its Sunshine login is missing); null = it can. */
  librarySunshineProblem: string | null;
  /** Open Sunshine login dialog on the "Hinzufügen" screen, null = closed. */
  sunshineLogin: SunshineLoginDraft | null;
  /** "Update verfügbar" dialog, null = closed; `installing` while the new AppImage downloads. */
  update: (AvailableUpdate & { installing: boolean; error: string }) | null;
  /** Game name -> logo `data:` URL from the companion (Steam logo or set by hand). */
  logos: Record<string, string>;
  /** "Bild setzen" dialog on the detail page, null = closed. */
  imageDialog: ImageDialogState | null;
  /** What runs on the PC (streamed or paused); null = nothing or unknown. */
  runningApp: RunningHostApp | null;
  /** "X läuft noch – beenden und Y starten?" on the detail page; null = closed. */
  switchGame: { nextGame: string; choiceIndex: number } | null;
  /** Title image or screenshots behind home and detail; the last one is on top and fades in. */
  backdropLayers: BackdropLayer[];
  /** Design is drawn at 1280px width and zoomed to the window. */
  zoom: number;
}

export interface BackdropLayer
{
  id: number;
  gameName: string;
  /** `data:` URL of the picture. */
  image: string;
}

/** Root component: owns all state and turns controller buttons into actions. */
export default class LauncherApp extends React.Component<object, LauncherState>
{
  private static readonly designWidth = 1280;

  private static readonly displayPollMilliseconds = 3000;

  private static readonly connectStepMilliseconds = 450;

  /** Timers stop while the Deck sleeps; a poll this much later than planned means it woke up. */
  private static readonly sleepGapMilliseconds = 15000;

  public readonly backend = new Backend();

  private readonly companionArt = new CompanionArt(this.backend);

  /** Counts stream starts; B on the connect screen bumps it, so a start already on its way is dropped. */
  private launchAttempt = 0;

  /** The user ended a hanging Moonlight; its "stream-ended" is then no error. */
  private streamAbortRequested = false;

  /** When the display poll ran last; a big gap means the Deck was asleep. */
  private lastPollTime = Date.now();

  /** Rotates the screenshot backdrop. */
  private backdropTimer = 0;

  /** Counts backdrop loads, so a slow answer for a game that is no longer selected is dropped. */
  private backdropRequest = 0;

  /** Gives each backdrop layer its own React key, so a new picture fades in over the old one. */
  private backdropLayerCounter = 0;

  private readonly inputRouter = new InputRouter(this.backend, (button) => this.press(button));

  private timers: number[] = [];

  private toastTimers: number[] = [];

  private displayPollTimer = 0;

  private unlistenStreamEnded: (() => void) | null = null;

  private mounted = false;

  public constructor(props: object)
  {
    super(props);
    this.state =
    {
      settings: null,
      screen: "home",
      zone: "games",
      gameIndex: 0,
      topIndex: 1,
      detailIndex: 0,
      device: "handheld",
      currentModes: { handheld: 0, tv: 0 },
      displayNames: [],
      automatic: true,
      games: [],
      boxArt: {},
      hostState: "loading",
      hostError: "",
      activeHost: "",
      toast: null,
      connectSteps: [],
      connectStep: 0,
      lastLaunchError: "",
      editDevice: "handheld",
      editModeIndex: 0,
      editSection: "profile",
      editZone: "modes",
      editActionIndex: 0,
      editConfirmDelete: "",
      editRow: 0,
      bumps: {},
      pcDisplayModes: null,
      discoveredHosts: [],
      searchingHosts: false,
      connectionZone: "hosts",
      connectionHostIndex: 0,
      connectionRow: 0,
      manualHostDraft: "",
      extraAddressDraft: "",
      steamGridDbKeyDraft: "",
      steamGridDbKeyCheck: "unchecked",
      pairState: "idle",
      pairPin: "",
      pairMessage: "",
      afterStreamIndex: 0,
      afterStreamRemember: false,
      streamSummary: [],
      library: [],
      libraryState: "loading",
      libraryError: "",
      libraryGroupIndex: 0,
      libraryItemIndex: 0,
      libraryCovers: {},
      libraryBusyId: "",
      libraryChanged: false,
      librarySunshineProblem: null,
      sunshineLogin: null,
      update: null,
      backdropLayers: [],
      logos: {},
      imageDialog: null,
      runningApp: null,
      switchGame: null,
      zoom: Math.max(window.innerWidth, 320) / LauncherApp.designWidth,
    };
  }

  // ---------------------------------------------------------------- lifecycle

  public async componentDidMount(): Promise<void>
  {
    this.mounted = true;
    this.inputRouter.attach();
    window.addEventListener("resize", this.handleResize);

    const unlisten = await this.backend.onStreamEnded((event) => this.handleStreamEnded(event.exitCode, event.errorTail, event.videoStats ?? []));
    if (!this.mounted)
    {
      unlisten();
      return;
    }
    this.unlistenStreamEnded = unlisten;

    const settings = await this.backend.loadSettings();
    UiText.use(settings.language);
    this.backend.setLanguage(UiText.language);
    const displayNames = await this.backend.externalDisplayNames();
    const device = this.detectedDevice(settings, displayNames) ?? settings.deviceOrder[0];
    const currentModes: Record<DeviceId, number> = {};
    for (const deviceId of settings.deviceOrder)
    {
      currentModes[deviceId] = settings.profiles[deviceId].defaultModeIndex;
    }
    this.setState({
      settings,
      displayNames,
      device,
      editDevice: device,
      currentModes,
    });
    if (settings.host === "")
    {
      this.openConnection();
    }
    else
    {
      this.reloadGames(settings);
    }
    this.displayPollTimer = window.setInterval(() => this.pollDisplay(), LauncherApp.displayPollMilliseconds);
    this.checkForUpdate();
  }

  public componentDidUpdate(_previousProps: object, previousState: LauncherState): void
  {
    const previousGame = this.selectedGame(previousState);
    const previousKind = previousState.settings === null ? undefined : LauncherApp.backdropKindIn(previousState.settings, previousGame);
    const currentKind = this.state.settings === null ? undefined : LauncherApp.backdropKindIn(this.state.settings, this.selectedGame());
    if (this.selectedGame() !== previousGame || currentKind !== previousKind)
    {
      this.updateBackdrop();
    }
  }

  public componentWillUnmount(): void
  {
    this.mounted = false;
    window.clearTimeout(this.backdropTimer);
    window.clearInterval(this.artPollTimer);
    this.inputRouter.detach();
    window.removeEventListener("resize", this.handleResize);
    window.clearInterval(this.displayPollTimer);
    this.unlistenStreamEnded?.();
    this.clearTimers();
    this.toastTimers.forEach((timer) => window.clearTimeout(timer));
  }

  private readonly handleResize = (): void =>
  {
    this.setState({ zoom: Math.max(window.innerWidth, 320) / LauncherApp.designWidth });
  };

  // ---------------------------------------------------------------- helpers used by views

  public get settings(): Settings
  {
    return this.state.settings!;
  }

  public profile(device: DeviceId = this.state.device): DeviceProfile
  {
    return this.settings.profiles[device];
  }

  public activeMode(device: DeviceId = this.state.device): StreamMode
  {
    const profile = this.profile(device);
    return profile.modes[this.currentModeIndex(device)] ?? profile.modes[0];
  }

  /** Mode picked for the device right now; a device added in this session starts at its default. */
  public currentModeIndex(device: DeviceId = this.state.device): number
  {
    return this.state.currentModes[device] ?? this.profile(device).defaultModeIndex;
  }

  /** The device's colour as CSS value; the UI tints with it. */
  public accentColor(device: DeviceId = this.state.device): string
  {
    const profile = this.settings.profiles[device];
    return DevicePalette.colors[profile?.color ?? "blue"] ?? DevicePalette.colors.blue;
  }

  public selectedGame(state: LauncherState = this.state): string | undefined
  {
    if (state.gameIndex === -1)
    {
      return this.resumeGame(state);
    }
    return state.games[state.gameIndex];
  }

  /**
   * The app behind the "Fortsetzen" tile: whatever runs on the PC, in the launcher's list or not;
   * undefined = no tile. Moonlight resumes by name, so an id it has no name for gets no tile.
   */
  public resumeGame(state: LauncherState = this.state): string | undefined
  {
    return state.runningApp?.appName ?? undefined;
  }

  public isRunning(gameName: string | undefined): boolean
  {
    return gameName !== undefined && this.state.runningApp?.appName === gameName;
  }

  public hostDisplayName(): string
  {
    return this.settings.hostName || this.settings.host || UiText.current.common.noPc;
  }

  /** All addresses of the PC in the order they are tried: home network first, then the extra ones. */
  public hostAddresses(settings: Settings = this.settings): string[]
  {
    const addresses: string[] = [];
    for (const address of [settings.host, ...settings.extraHostAddresses])
    {
      const trimmedAddress = address.trim();
      if (trimmedAddress !== "" && !addresses.includes(trimmedAddress))
      {
        addresses.push(trimmedAddress);
      }
    }
    return addresses;
  }

  /** Address for calls right now: the one that answered last, else the home address. */
  public connectedHost(): string
  {
    return this.state.activeHost || this.settings.host;
  }

  /**
   * Asks which address the PC answers on, like Moonlight with its local and remote address.
   * When none answers the first one is used, so the error comes from the real call.
   */
  private async resolveHost(settings: Settings = this.settings): Promise<string>
  {
    const addresses = this.hostAddresses(settings);
    let activeHost = addresses[0] ?? "";
    if (addresses.length > 1)
    {
      try
      {
        activeHost = (await this.backend.pickHostAddress(addresses)) ?? activeHost;
      }
      catch (pickError)
      {
        console.warn("address check failed", pickError);
      }
    }
    this.setState({ activeHost });
    return activeHost;
  }

  public isRemembered(gameName: string | undefined, device: DeviceId = this.state.device): boolean
  {
    return gameName !== undefined && this.settings.rememberedModes[gameName + "|" + device] !== undefined;
  }

  // ---------------------------------------------------------------- device detection

  /**
   * Which device the connected screens suggest, or null when no device's rule fits.
   * A device bound to one screen by name wins over "Dock mit Bildschirm", so two TVs can be told apart.
   */
  private detectedDevice(settings: Settings, displayNames: string[]): DeviceId | null
  {
    const order = settings.deviceOrder;
    const byScreenName = order.find((deviceId) =>
    {
      const profile = settings.profiles[deviceId];
      return profile.autoRule === "Dieser Bildschirm" && profile.displayName !== "" && displayNames.includes(profile.displayName);
    });
    if (byScreenName !== undefined)
    {
      return byScreenName;
    }
    const wantedRule = displayNames.length > 0 ? "Dock mit Bildschirm" : "Deck ohne Dock";
    return order.find((deviceId) => settings.profiles[deviceId].autoRule === wantedRule) ?? null;
  }

  public detectedDeviceName(): string
  {
    const detected = this.detectedDevice(this.settings, this.state.displayNames);
    return detected === null ? UiText.current.home.noDevice : this.profile(detected).name;
  }

  private async pollDisplay(): Promise<void>
  {
    const now = Date.now();
    const asleep = now - this.lastPollTime > LauncherApp.displayPollMilliseconds + LauncherApp.sleepGapMilliseconds;
    this.lastPollTime = now;
    if (asleep)
    {
      this.handleWakeUp();
    }

    const displayNames = await this.backend.externalDisplayNames();
    if (displayNames.join("|") === this.state.displayNames.join("|") || this.state.settings === null)
    {
      return;
    }
    this.setState({ displayNames });
    const detected = this.detectedDevice(this.settings, displayNames);
    if (this.state.automatic && detected !== null && detected !== this.state.device && this.state.screen !== "stream")
    {
      this.setDevice(detected, displayNames.length > 0 ? UiText.current.toasts.screenDetected : UiText.current.toasts.screenDisconnected, true);
    }
  }

  // ---------------------------------------------------------------- settings

  private updateSettings(change: (settings: Settings) => Settings): void
  {
    const settings = change(this.settings);
    this.setState({ settings });
    this.backend.saveSettings(settings).catch((saveError) => this.showError(UiText.current.toasts.saveFailed, String(saveError)));
  }

  private updateProfile(device: DeviceId, change: (profile: DeviceProfile) => DeviceProfile): void
  {
    this.updateSettings((settings) => ({
      ...settings,
      profiles: { ...settings.profiles, [device]: change(settings.profiles[device]) },
    }));
  }

  // ---------------------------------------------------------------- games

  public async reloadGames(settings: Settings = this.settings): Promise<void>
  {
    if (settings.host === "")
    {
      this.setState({ games: [], hostState: "error", hostError: UiText.current.home.noPcYet });
      return;
    }
    this.setState({ hostState: "loading", hostError: "" });
    try
    {
      const host = await this.resolveHost(settings);
      const games = await this.backend.fetchGames(settings, host);
      this.setState((state) => ({
        games,
        hostState: "online",
        gameIndex: Math.min(state.gameIndex, Math.max(0, games.length - 1)),
      }));
      this.loadBoxArt(settings, host, games);
      this.refreshRunningApp(settings, host, true);
    }
    catch (fetchError)
    {
      this.setState({ hostState: "error", hostError: String(fetchError) });
    }
  }

  /**
   * Covers are optional: without them the placeholders stay, so errors are only logged.
   * Moonlight's cache first, then the companion for games Moonlight has no cover for.
   */
  private async loadBoxArt(settings: Settings, host: string, games: string[]): Promise<void>
  {
    let boxArt: Record<string, string> = {};
    try
    {
      boxArt = (await this.backend.loadBoxArt(settings, this.hostAddresses(settings))) ?? {};
    }
    catch (artError)
    {
      console.warn("no cover art", artError);
    }
    this.setState({ boxArt });

    const companionArt = await this.companionArt.coversAndLogos(host, games);
    // The companion's cover wins: it may be one set by hand.
    this.setState((state) => ({ boxArt: { ...state.boxArt, ...companionArt.covers }, logos: companionArt.logos }));
    // The companion's library is known now, so the selected game can get its backdrop.
    this.updateBackdrop(host);
  }

  /**
   * Asks Sunshine what runs right now. Called on start, wake-up, reload, after streams and quits, never in a loop.
   * `selectResumeTile`: a game that just showed up as running gets the "Fortsetzen" tile selected.
   * Errors count as "nothing known to run"; the start of a stream reports a PC that does not answer.
   */
  private async refreshRunningApp(settings: Settings = this.settings, host: string = this.connectedHost(), selectResumeTile: boolean = false): Promise<RunningHostApp | null>
  {
    let runningApp: RunningHostApp | null = null;
    try
    {
      runningApp = await this.backend.runningHostApp(settings, host, this.hostAddresses(settings));
    }
    catch (runningError)
    {
      console.warn("cannot ask what runs on the PC", runningError);
    }
    this.setState((state) =>
    {
      const newlyRunning = runningApp !== null && runningApp.appId !== state.runningApp?.appId;
      const nextState = { ...state, runningApp };
      const hasResumeTile = this.resumeGame(nextState) !== undefined;
      let gameIndex = state.gameIndex;
      if (selectResumeTile && newlyRunning && hasResumeTile && state.screen === "home")
      {
        gameIndex = -1;
      }
      else if (gameIndex === -1 && !hasResumeTile)
      {
        gameIndex = 0;
      }
      return { runningApp, gameIndex };
    });
    return runningApp;
  }

  public artFor(gameName: string): GameArt
  {
    return new GameArt(gameName, this.state.boxArt[gameName]);
  }

  // ---------------------------------------------------------------- toasts and timers

  /** Matches the 1.9 s pop animation of normal toasts in styles.css. */
  private static readonly toastMilliseconds = 1950;

  /** Errors need time to be read on the Deck; A or B closes them earlier. */
  private static readonly errorToastMilliseconds = 6000;

  private showToast(toast: ToastContent): void
  {
    this.toastTimers.forEach((timer) => window.clearTimeout(timer));
    this.setState({ toast: null });
    const visibleMilliseconds = toast.kind === "error" ? LauncherApp.errorToastMilliseconds : LauncherApp.toastMilliseconds;
    this.toastTimers =
    [
      window.setTimeout(() => this.setState({ toast }), 30),
      window.setTimeout(() => this.setState({ toast: null }), visibleMilliseconds),
    ];
  }

  private closeToast(): void
  {
    this.toastTimers.forEach((timer) => window.clearTimeout(timer));
    this.toastTimers = [];
    this.setState({ toast: null });
  }

  public isErrorToastShown(): boolean
  {
    return this.state.toast !== null && this.state.toast.kind === "error";
  }

  private showError(title: string, message: string): void
  {
    this.showToast({ kind: "error", eyebrow: UiText.current.common.error, name: title, spec: "", sub: message });
  }

  private deviceToast(device: DeviceId, eyebrow: string, modeIndex: number): void
  {
    const profile = this.profile(device);
    const mode = profile.modes[modeIndex] ?? profile.modes[0];
    this.showToast({
      kind: profile.icon,
      eyebrow,
      name: profile.name,
      spec: ModeText.spec(mode),
      sub: ModeText.extra(mode) + " · " + profile.audio,
    });
  }

  private later(action: () => void, milliseconds: number): void
  {
    this.timers.push(window.setTimeout(action, milliseconds));
  }

  private clearTimers(): void
  {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
  }

  // ---------------------------------------------------------------- device and mode switching

  /** Mode index for a device, using the one remembered for the selected game on the detail page. */
  private modeIndexFor(device: DeviceId, screen: ScreenName, gameName: string | undefined): number
  {
    if (screen === "detail" && gameName !== undefined)
    {
      const remembered = this.settings.rememberedModes[gameName + "|" + device];
      if (remembered !== undefined && remembered < this.profile(device).modes.length)
      {
        return remembered;
      }
    }
    // A device added in this session has no current mode yet.
    return this.state.currentModes[device] ?? this.profile(device).defaultModeIndex;
  }

  private setDevice(device: DeviceId, eyebrow: string, automatic: boolean): void
  {
    const modeIndex = this.modeIndexFor(device, this.state.screen, this.selectedGame());
    this.setState((state) => ({
      device,
      automatic,
      currentModes: { ...state.currentModes, [device]: modeIndex },
    }));
    this.deviceToast(device, eyebrow, modeIndex);
  }

  public toggleDevice(): void
  {
    const order = this.settings.deviceOrder;
    const next = order[(order.indexOf(this.state.device) + 1) % order.length];
    const isAutomatic = next === this.detectedDevice(this.settings, this.state.displayNames);
    this.setDevice(next, isAutomatic ? UiText.current.toasts.backToAutomatic : UiText.current.toasts.pickedManually, isAutomatic);
  }

  public setMode(modeIndex: number): void
  {
    const device = this.state.device;
    const gameName = this.selectedGame();
    this.setState((state) => ({ currentModes: { ...state.currentModes, [device]: modeIndex } }));

    // On the detail page a remembered mode follows the new choice.
    if (this.state.screen === "detail" && this.isRemembered(gameName))
    {
      this.updateSettings((settings) => ({
        ...settings,
        rememberedModes: { ...settings.rememberedModes, [gameName + "|" + device]: modeIndex },
      }));
    }

    const mode = this.profile(device).modes[modeIndex];
    this.showToast({
      kind: this.profile(device).icon,
      eyebrow: UiText.current.toasts.profileOf(this.profile(device).name),
      name: ModeText.label(mode) + " FPS",
      spec: ModeText.bitrate(mode.bitrateMbps),
      sub: ModeText.extra(mode),
    });
  }

  public cycleMode(direction: number): void
  {
    const count = this.profile().modes.length;
    this.setMode((this.currentModeIndex() + direction + count) % count);
  }

  public toggleRemember(): void
  {
    const gameName = this.selectedGame();
    if (gameName === undefined)
    {
      return;
    }
    const key = gameName + "|" + this.state.device;
    this.updateSettings((settings) =>
    {
      const rememberedModes = { ...settings.rememberedModes };
      if (rememberedModes[key] !== undefined)
      {
        delete rememberedModes[key];
      }
      else
      {
        rememberedModes[key] = this.state.currentModes[this.state.device];
      }
      return { ...settings, rememberedModes };
    });
  }

  // ---------------------------------------------------------------- input dispatch

  public press(button: PadButton): void
  {
    if (this.state.settings === null)
    {
      return;
    }
    // An open error toast takes A and B, so closing it does not also start or leave something.
    if (this.isErrorToastShown() && (button === "A" || button === "B"))
    {
      return this.closeToast();
    }
    if (this.state.update !== null)
    {
      return this.updateButton(button);
    }

    const screen = this.state.screen;
    // X and L1/R1 switch device and mode on home and detail, but not while the picture dialog is open.
    const quickSwitch = (screen === "home" || screen === "detail") && this.state.imageDialog === null;

    if (button === "X" && quickSwitch)
    {
      return this.toggleDevice();
    }
    if ((button === "L1" || button === "R1") && quickSwitch)
    {
      return this.cycleMode(button === "L1" ? -1 : 1);
    }

    switch (screen)
    {
      case "home":
        return this.homeButton(button);
      case "detail":
        return this.detailButton(button);
      case "editor":
        return this.editorButton(button);
      case "connect":
        if (button === "B")
        {
          this.cancelConnect();
        }
        return;
      case "connection":
        return this.connectionButton(button);
      case "library":
        return this.libraryButton(button);
      case "stream":
        // Moonlight owns the controller; buttons only arrive here when the launcher has the focus,
        // e.g. Moonlight hangs or shows an error behind it. B ends it, so the launcher never gets stuck.
        if (button === "B")
        {
          this.abortStream();
        }
        return;
      case "afterStream":
        return this.afterStreamButton(button);
      case "streamSummary":
        if (button === "A" || button === "B")
        {
          this.closeStreamSummary();
        }
        return;
    }
  }

  private homeButton(button: PadButton): void
  {
    const state = this.state;
    if (button === "MENU")
    {
      return this.openEditor();
    }
    if (button === "Y")
    {
      this.reloadGames();
      return;
    }

    if (state.zone === "games")
    {
      if (button === "LEFT")
      {
        // -1 is the "Fortsetzen" tile in front of the games, when something runs.
        const firstIndex = this.resumeGame() !== undefined ? -1 : 0;
        this.setState({ gameIndex: Math.max(firstIndex, state.gameIndex - 1) });
      }
      else if (button === "RIGHT")
      {
        // One step past the last game is the "Hinzufügen" tile.
        this.setState({ gameIndex: Math.min(state.games.length, state.gameIndex + 1) });
      }
      else if (button === "UP")
      {
        this.setState({ zone: "top" });
      }
      else if (button === "A")
      {
        if (this.isAddTileSelected())
        {
          this.openLibrary();
        }
        else if (state.gameIndex === -1)
        {
          this.resumeRunningGame();
        }
        else
        {
          this.openGame(state.gameIndex);
        }
      }
    }
    else
    {
      if (button === "LEFT")
      {
        this.setState({ topIndex: Math.max(0, state.topIndex - 1) });
      }
      else if (button === "RIGHT")
      {
        this.setState({ topIndex: Math.min(2, state.topIndex + 1) });
      }
      else if (button === "DOWN")
      {
        this.setState({ zone: "games" });
      }
      else if (button === "A")
      {
        this.activateTop(state.topIndex);
      }
    }
  }

  /** A on the "Fortsetzen" tile: straight back into the running game with the active profile. */
  public resumeRunningGame(): void
  {
    const gameName = this.resumeGame();
    if (gameName === undefined)
    {
      return;
    }
    // In the list it becomes a normal game for the detail page and the after-stream dialog;
    // otherwise indexOf gives -1, the resume tile, which keeps naming it.
    this.setState({ gameIndex: this.state.games.indexOf(gameName), zone: "games", detailIndex: 0 });
    this.startStream(gameName);
  }

  public activateTop(topIndex: number): void
  {
    this.setState({ zone: "top", topIndex });
    if (topIndex === 0)
    {
      this.openConnection();
    }
    else if (topIndex === 1)
    {
      this.toggleDevice();
    }
    else
    {
      this.openEditor();
    }
  }

  public openGame(gameIndex: number): void
  {
    const gameName = this.state.games[gameIndex];
    if (gameName === undefined)
    {
      return;
    }
    const device = this.state.device;
    const modeIndex = this.modeIndexFor(device, "detail", gameName);
    this.setState((state) => ({
      screen: "detail",
      gameIndex,
      zone: "games",
      detailIndex: 0,
      lastLaunchError: "",
      currentModes: { ...state.currentModes, [device]: modeIndex },
    }));
  }

  /** Spielen, Gerät, Danach, Bild setzen. */
  public static readonly detailButtonCount = 4;

  private detailButton(button: PadButton): void
  {
    if (this.state.imageDialog !== null)
    {
      this.imageDialogButton(button);
      return;
    }
    if (this.state.switchGame !== null)
    {
      this.switchGameButton(button);
      return;
    }
    if (button === "LEFT")
    {
      this.setState({ detailIndex: Math.max(0, this.state.detailIndex - 1) });
    }
    else if (button === "RIGHT")
    {
      this.setState({ detailIndex: Math.min(LauncherApp.detailButtonCount - 1, this.state.detailIndex + 1) });
    }
    else if (button === "A")
    {
      this.detailAction(this.state.detailIndex);
    }
    else if (button === "Y")
    {
      this.toggleRemember();
    }
    else if (button === "B")
    {
      this.setState({ screen: "home" });
    }
  }

  public detailAction(detailIndex: number): void
  {
    this.setState({ detailIndex });
    if (detailIndex === 0)
    {
      this.playSelectedGame();
    }
    else if (detailIndex === 1)
    {
      this.toggleDevice();
    }
    else if (detailIndex === 2)
    {
      this.cycleAfterStreamForGame();
    }
    else
    {
      this.openImageDialog();
    }
  }

  // ---------------------------------------------------------------- "Bild setzen": pictures from the phone

  public static readonly artKinds: ArtKind[] = ["cover", "hero", "logo"];

  /** Options of the dialog's backdrop row; undefined = the default. */
  public static readonly backdropChoices: (BackdropKind | undefined)[] = [undefined, "hero", "screenshots", "cover", "none"];

  /** How often the open dialog asks the companion whether a picture arrived. */
  private static readonly artPollMilliseconds = 2000;

  private artPollTimer = 0;

  /** A poll round is waiting for the PC; the timer and a just applied picture must not both reload and toast. */
  private artPollRunning = false;

  public openImageDialog(): void
  {
    const dialog: ImageDialogState =
    {
      row: "kind",
      kind: "cover",
      token: null,
      loading: false,
      error: "",
      query: SearchName.fromAppName(this.selectedGame() ?? ""),
      candidates: [],
      candidateIndex: 0,
      searching: false,
      searchProblem: "",
      applying: false,
      artVersion: -1,
      heroPreview: null,
    };
    // Polling starts once the dialog is in the state, its first round would otherwise stop it again.
    this.setState({ imageDialog: dialog }, () =>
    {
      this.showArtKind("cover");
      this.startArtPolling();
    });
  }

  public closeImageDialog(): void
  {
    window.clearInterval(this.artPollTimer);
    this.setState({ imageDialog: null });
  }

  private changeImageDialog(change: Partial<ImageDialogState>): void
  {
    this.setState((state) => (state.imageDialog === null ? null : { imageDialog: { ...state.imageDialog, ...change } }));
  }

  /**
   * Rows the dialog shows right now. The backdrop choice only decides the automatic picture behind
   * the menu; a title image set by hand always wins, so the row is left out while the game has one.
   */
  public imageDialogRows(): ImageDialogRow[]
  {
    const gameName = this.selectedGame();
    if (gameName !== undefined && this.companionArt.hasCustomArt(gameName, "hero"))
    {
      return ["kind", "search", "pictures"];
    }
    return ["kind", "search", "pictures", "backdrop"];
  }

  /** QR code and found pictures for this picture kind. */
  private showArtKind(kind: ArtKind): void
  {
    this.loadUploadToken(kind);
    this.searchArt(kind);
    this.loadHeroPreview();
  }

  /** The current title image for the preview next to the kinds; covers and logos are already in the state. */
  private async loadHeroPreview(): Promise<void>
  {
    const gameName = this.selectedGame() ?? "";
    const heroPreview = await this.companionArt.backdropImage(this.connectedHost(), gameName, "hero", 0);
    this.changeImageDialog({ heroPreview });
  }

  /** The current picture of the shown kind, null when the game has none. */
  public currentArt(kind: ArtKind): string | null
  {
    const gameName = this.selectedGame() ?? "";
    if (kind === "cover")
    {
      return this.state.boxArt[gameName] ?? null;
    }
    if (kind === "logo")
    {
      return this.state.logos[gameName] ?? null;
    }
    return this.state.imageDialog?.heroPreview ?? null;
  }

  /** Asks the companion for a fresh upload page for this picture kind; the QR code shows it. */
  public async loadUploadToken(kind: ArtKind): Promise<void>
  {
    const entryId = this.companionArt.entryId(this.selectedGame() ?? "");
    if (entryId === undefined)
    {
      this.changeImageDialog({ kind, token: null, loading: false, error: UiText.current.imageDialog.unknownToHelper });
      return;
    }
    this.changeImageDialog({ kind, token: null, loading: true, error: "" });
    try
    {
      const token = await this.backend.companionUploadToken(this.connectedHost(), entryId, kind);
      // Only show it if the user did not switch to another kind meanwhile.
      if (this.state.imageDialog?.kind === kind)
      {
        this.changeImageDialog({ token, loading: false });
      }
    }
    catch (tokenError)
    {
      this.changeImageDialog({ loading: false, error: String(tokenError) });
    }
  }

  /**
   * Pictures of this kind for the dialog's search name: Steam shop and libretro (no key needed)
   * and SteamGridDB (with a key). `query` is a newly typed name, otherwise the current one stays.
   */
  private async searchArt(kind: ArtKind, query?: string): Promise<void>
  {
    const gameName = this.selectedGame() ?? "";
    const entryId = this.companionArt.entryId(gameName);
    const searchName = (query ?? this.state.imageDialog?.query ?? "").trim();
    // Without a companion entry a found picture could not be stored on the PC.
    if (entryId === undefined || searchName === "")
    {
      this.changeImageDialog({ candidates: [], candidateIndex: 0, searching: false, searchProblem: "" });
      return;
    }
    this.changeImageDialog({ query: searchName, candidates: [], candidateIndex: 0, searching: true, searchProblem: "" });
    // A typed name searches for that name only; the game's own Steam appid would bring its pictures back.
    const searchesOwnName = searchName === SearchName.fromAppName(gameName);
    const stillWanted = () => this.state.imageDialog?.kind === kind && this.state.imageDialog.query === searchName;
    try
    {
      const result = await this.backend.searchArt(searchName, searchesOwnName ? entryId : "", this.companionArt.system(gameName), kind, this.settings.steamGridDbKey);
      if (stillWanted())
      {
        this.changeImageDialog({ candidates: result.candidates, searching: false, searchProblem: result.problem ?? "" });
      }
    }
    catch (searchError)
    {
      if (stillWanted())
      {
        this.changeImageDialog({ searching: false, searchProblem: String(searchError) });
      }
    }
  }

  /** The search field; A focuses it, so the Deck's on-screen keyboard (Steam + X) can type into it. */
  public focusArtSearch(): void
  {
    this.changeImageDialog({ row: "search" });
    document.getElementById("art-search")?.focus();
  }

  /** Enter in the search field (or leaving it): search for the typed name. */
  public submitArtSearch(): void
  {
    const dialog = this.state.imageDialog;
    const field = document.getElementById("art-search") as HTMLInputElement | null;
    field?.blur();
    if (dialog !== null && field !== null && field.value.trim() !== dialog.query)
    {
      this.searchArt(dialog.kind, field.value);
    }
  }

  /** A on a found picture: the PC stores it like a phone upload, the version poll then reloads. */
  public async applyArtCandidate(candidateIndex: number): Promise<void>
  {
    const dialog = this.state.imageDialog;
    const entryId = this.companionArt.entryId(this.selectedGame() ?? "");
    const candidate = dialog?.candidates[candidateIndex];
    if (dialog === null || entryId === undefined || candidate === undefined || dialog.applying)
    {
      return;
    }
    this.changeImageDialog({ row: "pictures", candidateIndex, applying: true });
    try
    {
      await this.backend.applyArt(this.connectedHost(), entryId, dialog.kind, candidate.imageUrl);
      // Show it right away instead of waiting for the next poll round.
      await this.pollArtVersion();
    }
    catch (applyError)
    {
      this.showError(UiText.current.toasts.imageNotApplied, String(applyError));
    }
    finally
    {
      this.changeImageDialog({ applying: false });
    }
  }

  private startArtPolling(): void
  {
    window.clearInterval(this.artPollTimer);
    this.artPollTimer = window.setInterval(() => this.pollArtVersion(), LauncherApp.artPollMilliseconds);
    this.pollArtVersion();
  }

  /** A different art version than at the start means a picture came in or was reset: reload covers, logos and backdrop. */
  private async pollArtVersion(): Promise<void>
  {
    if (this.artPollRunning)
    {
      return;
    }
    this.artPollRunning = true;
    try
    {
      await this.pollArtVersionOnce();
    }
    finally
    {
      this.artPollRunning = false;
    }
  }

  private async pollArtVersionOnce(): Promise<void>
  {
    const dialog = this.state.imageDialog;
    if (dialog === null)
    {
      window.clearInterval(this.artPollTimer);
      return;
    }
    let artVersion: number;
    try
    {
      artVersion = await this.backend.companionArtVersion(this.connectedHost());
    }
    catch (versionError)
    {
      console.warn("art version", versionError);
      return;
    }
    if (dialog.artVersion < 0)
    {
      this.changeImageDialog({ artVersion });
      return;
    }
    // Any change counts: the companion's counter starts at 0 again when its service restarts.
    if (artVersion !== dialog.artVersion)
    {
      this.changeImageDialog({ artVersion });
      await this.reloadArt();
      await this.loadHeroPreview();
      // One step back to the kinds, so cover, title image and logo can be changed one after the other.
      this.changeImageDialog({ row: "kind" });
      this.showToast({ kind: "ok", eyebrow: UiText.current.detail.setImage, name: UiText.current.toasts.imageApplied, spec: "", sub: this.selectedGame() ?? "" });
      // The page on the phone may have been used up; a new code for the next picture.
      this.loadUploadToken(this.state.imageDialog?.kind ?? dialog.kind);
    }
  }

  private async reloadArt(): Promise<void>
  {
    await this.loadBoxArt(this.settings, this.connectedHost(), this.state.games);
  }

  /** X in the dialog: drop the picture set by hand for the shown kind. */
  private async resetArt(): Promise<void>
  {
    const dialog = this.state.imageDialog;
    const entryId = this.companionArt.entryId(this.selectedGame() ?? "");
    if (dialog === null || entryId === undefined)
    {
      return;
    }
    try
    {
      await this.backend.companionResetArt(this.connectedHost(), entryId, dialog.kind);
      // The version poll picks the change up and reloads.
    }
    catch (resetError)
    {
      this.showError(UiText.current.toasts.resetFailed, String(resetError));
    }
  }

  public chooseArtKind(kind: ArtKind): void
  {
    this.changeImageDialog({ row: "kind" });
    this.showArtKind(kind);
  }

  public chooseBackdropForGame(choice: BackdropKind | undefined): void
  {
    const gameName = this.selectedGame();
    if (gameName === undefined)
    {
      return;
    }
    this.changeImageDialog({ row: "backdrop" });
    this.setBackdropKindForGame(gameName, choice);
  }

  private imageDialogButton(button: PadButton): void
  {
    const dialog = this.state.imageDialog;
    if (dialog === null)
    {
      return;
    }
    // While typing only A (Enter) and B (Escape) arrive here; both end typing, A also searches.
    if (document.activeElement instanceof HTMLInputElement && document.activeElement.id === "art-search")
    {
      if (button === "A")
      {
        this.submitArtSearch();
      }
      else
      {
        document.activeElement.value = dialog.query;
        document.activeElement.blur();
      }
      // Re-render, so the hint bar no longer shows the typing hints.
      this.changeImageDialog({ row: "search" });
      return;
    }
    if (button === "B")
    {
      this.closeImageDialog();
      return;
    }
    const rows = this.imageDialogRows();
    if (button === "UP" || button === "DOWN")
    {
      const rowIndex = Math.max(0, rows.indexOf(dialog.row)) + (button === "UP" ? -1 : 1);
      this.changeImageDialog({ row: rows[Math.min(rows.length - 1, Math.max(0, rowIndex))] });
      return;
    }
    if (button === "X" && dialog.row !== "backdrop")
    {
      this.resetArt();
      return;
    }
    if (button === "A" && dialog.row === "search")
    {
      this.focusArtSearch();
      return;
    }
    if (button === "A" && dialog.row === "pictures")
    {
      this.applyArtCandidate(dialog.candidateIndex);
      return;
    }
    if (button !== "LEFT" && button !== "RIGHT")
    {
      return;
    }
    const step = button === "LEFT" ? -1 : 1;
    if (dialog.row === "kind")
    {
      const kinds = LauncherApp.artKinds;
      const kindIndex = Math.min(kinds.length - 1, Math.max(0, kinds.indexOf(dialog.kind) + step));
      if (kinds[kindIndex] !== dialog.kind)
      {
        this.showArtKind(kinds[kindIndex]);
      }
    }
    else if (dialog.row === "pictures")
    {
      const candidateIndex = Math.min(dialog.candidates.length - 1, Math.max(0, dialog.candidateIndex + step));
      this.changeImageDialog({ candidateIndex: Math.max(0, candidateIndex) });
    }
    else if (dialog.row === "backdrop")
    {
      const choices = LauncherApp.backdropChoices;
      const current = choices.indexOf(this.backdropKindOverride(this.selectedGame()));
      const choiceIndex = Math.min(choices.length - 1, Math.max(0, current + step));
      this.chooseBackdropForGame(choices[choiceIndex]);
    }
  }

  // ---------------------------------------------------------------- streaming

  /**
   * After standby the network and the PC may be gone or changed: reload the list (it checks the address again).
   * A stream that was running stays, Moonlight notices the dead connection itself and B can end it.
   */
  private handleWakeUp(): void
  {
    console.info("woke up from standby, checking the PC again");
    const screen = this.state.screen;
    if (screen === "stream" || screen === "connect")
    {
      return;
    }
    this.reloadGames();
  }

  /**
   * "Spielen": asks Sunshine first, since the cached answer may be old. The running game itself just resumes;
   * another one would make Moonlight ask on its own, so the launcher asks instead and quits it first.
   */
  private async playSelectedGame(): Promise<void>
  {
    const gameName = this.selectedGame();
    if (gameName === undefined)
    {
      return;
    }
    const runningApp = await this.refreshRunningApp();
    if (runningApp === null || runningApp.appName === gameName)
    {
      this.startStream(gameName);
      return;
    }
    this.setState({ switchGame: { nextGame: gameName, choiceIndex: 0 } });
  }

  private switchGameButton(button: PadButton): void
  {
    const switchGame = this.state.switchGame!;
    if (button === "LEFT" || button === "RIGHT")
    {
      this.setState({ switchGame: { ...switchGame, choiceIndex: button === "LEFT" ? 0 : 1 } });
    }
    else if (button === "A")
    {
      this.chooseSwitchGame(switchGame.choiceIndex);
    }
    else if (button === "B")
    {
      this.chooseSwitchGame(1);
    }
  }

  /** 0 = quit the running game and start the selected one, 1 = cancel. */
  public async chooseSwitchGame(choiceIndex: number): Promise<void>
  {
    const switchGame = this.state.switchGame;
    this.setState({ switchGame: null });
    if (switchGame === null || choiceIndex !== 0)
    {
      return;
    }
    const quit = await this.quitHostApp(this.state.runningApp?.appName ?? "");
    if (quit)
    {
      this.startStream(switchGame.nextGame);
    }
  }

  private startStream(gameName: string | undefined = this.selectedGame()): void
  {
    if (gameName === undefined)
    {
      return;
    }
    const device = this.state.device;
    const profile = this.profile(device);
    const mode = this.activeMode(device);
    const steps =
    [
      UiText.current.connect.connectingTo(this.hostDisplayName()),
      UiText.current.connect.applyingProfile(profile.name, ModeText.spec(mode)),
      UiText.current.connect.startingMoonlight(gameName),
    ];

    this.clearTimers();
    this.launchAttempt += 1;
    const launchAttempt = this.launchAttempt;
    this.setState({ screen: "connect", connectSteps: steps, connectStep: 0, lastLaunchError: "" });
    steps.forEach((_, stepIndex) =>
    {
      this.later(() => this.setState({ connectStep: stepIndex + 1 }), LauncherApp.connectStepMilliseconds * (stepIndex + 1));
    });
    this.later(async () =>
    {
      try
      {
        // The Deck may have changed networks (home ↔ Tailscale) or just woke up: check the PC answers at all,
        // otherwise Moonlight would only wait for it.
        const host = await this.backend.pickHostAddress(this.hostAddresses());
        if (launchAttempt !== this.launchAttempt)
        {
          return;
        }
        if (host === null)
        {
          this.setState({ screen: "detail", lastLaunchError: UiText.current.detail.pcNotAnswering(this.hostDisplayName()) });
          return;
        }
        this.setState({ activeHost: host });
        await this.backend.startStream(this.settings, host, gameName, profile, mode);
        if (launchAttempt !== this.launchAttempt)
        {
          // B was pressed while Moonlight was starting.
          this.streamAbortRequested = true;
          this.backend.stopStream();
          return;
        }
        this.setState({ screen: "stream" });
      }
      catch (launchError)
      {
        if (launchAttempt === this.launchAttempt)
        {
          this.setState({ screen: "detail", lastLaunchError: String(launchError) });
        }
      }
    }, LauncherApp.connectStepMilliseconds * steps.length + 300);
  }

  /** B on the connect screen: back to the detail page, a start already on its way is dropped. */
  private cancelConnect(): void
  {
    this.clearTimers();
    this.launchAttempt += 1;
    this.setState({ screen: "detail" });
  }

  /** B while the stream screen has the focus: ends Moonlight (it hangs or shows an error nobody can see). */
  private async abortStream(): Promise<void>
  {
    this.streamAbortRequested = true;
    const wasRunning = await this.backend.stopStream();
    if (!wasRunning)
    {
      // Moonlight is gone already but its "stream-ended" never came: do not wait for it.
      this.streamAbortRequested = false;
      this.setState({ screen: "detail", lastLaunchError: "" });
    }
  }

  private handleStreamEnded(exitCode: number | null, errorTail: string, videoStats: string[]): void
  {
    // Paused or quit by Moonlight: the "Fortsetzen" tile has to follow.
    this.refreshRunningApp();

    if (this.streamAbortRequested)
    {
      this.streamAbortRequested = false;
      this.setState({ screen: "detail", lastLaunchError: "" });
      this.showToast({ kind: "ok", eyebrow: this.hostDisplayName(), name: UiText.current.toasts.streamAborted, spec: "", sub: UiText.current.toasts.streamAbortedText });
      return;
    }

    const failed = exitCode !== 0;
    if (failed)
    {
      this.setState({
        screen: "detail",
        lastLaunchError: UiText.current.detail.moonlightExited(exitCode, errorTail),
      });
      return;
    }

    // The pause/quit dialog shows the statistics too; otherwise they get a dialog of their own.
    const streamSummary = this.settings.showStreamSummary ? videoStats : [];
    const afterStream = this.afterStreamFor(this.selectedGame());
    if (afterStream === "ask")
    {
      this.setState({ screen: "afterStream", afterStreamIndex: 0, afterStreamRemember: false, lastLaunchError: "", streamSummary });
      return;
    }
    this.setState({ screen: streamSummary.length > 0 ? "streamSummary" : "detail", lastLaunchError: "", streamSummary });
    if (afterStream === "quit")
    {
      this.quitHostApp();
    }
  }

  // ---------------------------------------------------------------- after the stream: pause or quit

  /** Options of the after-stream dialog and the connection screen row, in display order. */
  public static readonly afterStreamChoices: AfterStreamAction[] = ["keep", "quit"];

  private afterStreamButton(button: PadButton): void
  {
    if (button === "LEFT")
    {
      this.setState({ afterStreamIndex: 0 });
    }
    else if (button === "RIGHT")
    {
      this.setState({ afterStreamIndex: 1 });
    }
    else if (button === "Y")
    {
      this.toggleAfterStreamRemember();
    }
    else if (button === "A")
    {
      this.chooseAfterStream(this.state.afterStreamIndex);
    }
    else if (button === "B")
    {
      // Backing out keeps the game running, which is what Moonlight did anyway.
      this.chooseAfterStream(0);
    }
  }

  public toggleAfterStreamRemember(): void
  {
    this.setState((state) => ({ afterStreamRemember: !state.afterStreamRemember }));
  }

  public chooseAfterStream(choiceIndex: number): void
  {
    const choice = LauncherApp.afterStreamChoices[choiceIndex];
    const gameName = this.selectedGame();
    if (this.state.afterStreamRemember && gameName !== undefined)
    {
      // "Entscheidung merken" only applies to this game; the default stays "ask".
      this.setAfterStreamForGame(gameName, choice);
    }
    this.setState({ screen: "detail", afterStreamIndex: choiceIndex });
    if (choice === "quit")
    {
      this.quitHostApp();
    }
  }

  public closeStreamSummary(): void
  {
    this.setState({ screen: "detail" });
  }

  /** Connection screen row: statistics after the stream on/off. */
  public toggleStreamSummary(): void
  {
    this.updateSettings((settings) => ({ ...settings, showStreamSummary: !settings.showStreamSummary }));
  }

  // ---------------------------------------------------------------- backdrop picture behind the menu

  public static readonly backdropKinds: BackdropKind[] = ["hero", "screenshots", "cover", "none"];

  /** Screenshots change this often while a game stays selected. */
  private static readonly backdropRotationMilliseconds = 8000;

  /** The game's own backdrop kind, else the default. */
  private static backdropKindIn(settings: Settings, gameName: string | undefined): BackdropKind
  {
    if (gameName !== undefined && gameName in settings.backdropKindPerGame)
    {
      return settings.backdropKindPerGame[gameName];
    }
    return settings.backdropKind;
  }

  /** A title image set by hand always wins: it is the picture the user chose for behind the menu. */
  public backdropKindFor(gameName: string | undefined): BackdropKind
  {
    if (gameName !== undefined && this.companionArt.hasCustomArt(gameName, "hero"))
    {
      return "hero";
    }
    return LauncherApp.backdropKindIn(this.settings, gameName);
  }

  /** The game's own backdrop kind, undefined = it follows the default. */
  public backdropKindOverride(gameName: string | undefined): BackdropKind | undefined
  {
    if (gameName === undefined)
    {
      return undefined;
    }
    return this.settings.backdropKindPerGame[gameName];
  }

  /** `undefined` removes the game's own kind, so it follows the default again. */
  public setBackdropKindForGame(gameName: string, backdropKind: BackdropKind | undefined): void
  {
    this.updateSettings((settings) =>
    {
      const backdropKindPerGame = { ...settings.backdropKindPerGame };
      if (backdropKind === undefined)
      {
        delete backdropKindPerGame[gameName];
      }
      else
      {
        backdropKindPerGame[gameName] = backdropKind;
      }
      return { ...settings, backdropKindPerGame };
    });
  }

  /** Art for the large backdrop: "Kein Bild" drops the cover there, the rail keeps it. */
  public backdropArtFor(gameName: string): GameArt
  {
    if (this.backdropKindFor(gameName) === "none")
    {
      return new GameArt(gameName);
    }
    return this.artFor(gameName);
  }

  /** Loads the title image or first screenshot of the selected game; the blurred cover shows until it is there. */
  private updateBackdrop(host: string = this.connectedHost()): void
  {
    window.clearTimeout(this.backdropTimer);
    this.backdropRequest += 1;
    if (this.state.settings === null)
    {
      // Startup: loadBoxArt can finish before React applied the loaded settings;
      // componentDidUpdate calls this again once they are in the state.
      return;
    }
    const gameName = this.selectedGame();
    const kind = this.backdropKindFor(gameName);
    if (gameName === undefined || kind === "cover" || kind === "none")
    {
      this.setState({ backdropLayers: [] });
      return;
    }
    this.showBackdropStep(host, gameName, 0, this.backdropRequest);
  }

  private async showBackdropStep(host: string, gameName: string, step: number, request: number): Promise<void>
  {
    const kind = this.backdropKindFor(gameName);
    const image = await this.companionArt.backdropImage(host, gameName, kind, step);
    if (request !== this.backdropRequest || !this.mounted)
    {
      return;
    }
    if (image !== null)
    {
      this.backdropLayerCounter += 1;
      const layer = { id: this.backdropLayerCounter, gameName, image };
      // Keep the previous picture underneath while the new one fades in.
      this.setState((state) => ({ backdropLayers: [...state.backdropLayers.slice(-1), layer] }));
    }
    if (this.companionArt.backdropCount(gameName, kind) > 1)
    {
      this.backdropTimer = window.setTimeout(
        () => this.showBackdropStep(host, gameName, step + 1, request),
        LauncherApp.backdropRotationMilliseconds,
      );
    }
  }

  /** Connection screen row: Titelbild → Screenshots → Cover → Kein Bild. */
  private cycleBackdropKind(): void
  {
    const order = LauncherApp.backdropKinds;
    const nextIndex = (order.indexOf(this.settings.backdropKind) + 1) % order.length;
    this.setBackdropKind(order[nextIndex]);
  }

  public setBackdropKind(backdropKind: BackdropKind): void
  {
    this.updateSettings((settings) => ({ ...settings, backdropKind }));
  }

  /** Connection screen row: ask → keep → quit → ask. */
  private cycleAfterStream(): void
  {
    const order: AfterStreamAction[] = ["ask", "keep", "quit"];
    const nextIndex = (order.indexOf(this.settings.afterStream) + 1) % order.length;
    this.setAfterStream(order[nextIndex]);
  }

  public setAfterStream(afterStream: AfterStreamAction): void
  {
    this.updateSettings((settings) => ({ ...settings, afterStream }));
  }

  /** What happens after this game's stream: its own setting, else the default. */
  public afterStreamFor(gameName: string | undefined): AfterStreamAction
  {
    if (gameName !== undefined && gameName in this.settings.afterStreamPerGame)
    {
      return this.settings.afterStreamPerGame[gameName];
    }
    return this.settings.afterStream;
  }

  /** The game's own after-stream setting, undefined = it follows the default. */
  public afterStreamOverride(gameName: string | undefined): AfterStreamAction | undefined
  {
    if (gameName === undefined)
    {
      return undefined;
    }
    return this.settings.afterStreamPerGame[gameName];
  }

  /** `undefined` removes the game's own setting, so it follows the default again. */
  public setAfterStreamForGame(gameName: string, afterStream: AfterStreamAction | undefined): void
  {
    this.updateSettings((settings) =>
    {
      const afterStreamPerGame = { ...settings.afterStreamPerGame };
      if (afterStream === undefined)
      {
        delete afterStreamPerGame[gameName];
      }
      else
      {
        afterStreamPerGame[gameName] = afterStream;
      }
      return { ...settings, afterStreamPerGame };
    });
  }

  /** Detail page button: Standard → Fragen → Pausieren → Beenden → Standard. */
  public cycleAfterStreamForGame(): void
  {
    const gameName = this.selectedGame();
    if (gameName === undefined)
    {
      return;
    }
    const order: (AfterStreamAction | undefined)[] = [undefined, "ask", "keep", "quit"];
    const nextIndex = (order.indexOf(this.afterStreamOverride(gameName)) + 1) % order.length;
    this.setAfterStreamForGame(gameName, order[nextIndex]);
  }

  /** Ends the game on the PC; false when that failed (the error is shown). */
  private async quitHostApp(gameName: string = this.selectedGame() ?? ""): Promise<boolean>
  {
    try
    {
      await this.backend.quitHostApp(this.settings, this.connectedHost());
      this.showToast({ kind: "ok", eyebrow: this.hostDisplayName(), name: UiText.current.toasts.quit, spec: "", sub: UiText.current.toasts.noLongerRunning(gameName) });
      this.refreshRunningApp();
      return true;
    }
    catch (quitError)
    {
      this.showError(UiText.current.toasts.quitFailed, String(quitError));
      return false;
    }
  }

  // ---------------------------------------------------------------- editor

  public openEditor(): void
  {
    const device = this.state.device;
    this.setState({ screen: "editor", editDevice: device, editModeIndex: this.currentModeIndex(device), editSection: "profile", editZone: "modes", editRow: 0, editConfirmDelete: "" });
    this.loadPcDisplayModes();
  }

  /** Asks the companion which modes the PC's virtual monitor has; without companion there is simply no hint. */
  private async loadPcDisplayModes(): Promise<void>
  {
    try
    {
      const host = await this.resolveHost();
      const pcDisplayModes = await this.backend.companionDisplayModes(host);
      this.setState({ pcDisplayModes });
    }
    catch (modesError)
    {
      console.info("PC display modes unknown:", modesError);
      this.setState({ pcDisplayModes: null });
    }
  }

  public switchEditDevice(device: DeviceId): void
  {
    // The selected entry kind stays, so L1/R1 in the device settings compares devices' settings.
    this.setState({ editDevice: device, editModeIndex: this.currentModeIndex(device), editZone: "modes", editConfirmDelete: "" });
  }

  /** L1/R1 in the editor: previous/next device in switch order. */
  private stepEditDevice(direction: number): void
  {
    const order = this.settings.deviceOrder;
    const index = (order.indexOf(this.state.editDevice) + direction + order.length) % order.length;
    this.switchEditDevice(order[index]);
  }

  /** Buttons under the profile list, reached with DOWN past the last profile. "Gerät löschen" is in the device settings. */
  public static readonly editorActions = ["addMode", "makeDefault", "deleteMode", "addDevice"] as const;

  /** Left list click: the device settings entry or a profile. */
  public selectEditEntry(section: "device" | "profile", modeIndex: number): void
  {
    this.setState({ editSection: section, editModeIndex: modeIndex, editZone: "modes", editConfirmDelete: "" });
  }

  private editorButton(button: PadButton): void
  {
    const state = this.state;
    if (document.activeElement instanceof HTMLInputElement)
    {
      // Renaming: Enter/Escape (A/B) end the text field, nothing else is a launcher button meanwhile.
      (document.activeElement as HTMLInputElement).blur();
      return;
    }
    if (button === "L1" || button === "R1")
    {
      return this.stepEditDevice(button === "L1" ? -1 : 1);
    }
    // A pending "really delete?" only survives the button that confirms it:
    // X in the list and rows, A on the buttons and on the "Gerät löschen" row.
    const onDeleteRow = state.editZone === "rows" && EditorRows.rows[state.editRow].type === "delete";
    const confirms = state.editZone === "actions" ? button === "A" : button === "X" || (onDeleteRow && button === "A");
    if (state.editConfirmDelete !== "" && !confirms)
    {
      this.setState({ editConfirmDelete: "" });
    }

    if (state.editZone === "modes")
    {
      const count = this.profile(state.editDevice).modes.length;
      const onDeviceEntry = state.editSection === "device";
      if (button === "UP")
      {
        if (onDeviceEntry)
        {
          return;
        }
        if (state.editModeIndex === 0)
        {
          this.setState({ editSection: "device" });
        }
        else
        {
          this.setState({ editModeIndex: state.editModeIndex - 1 });
        }
      }
      else if (button === "DOWN")
      {
        if (onDeviceEntry)
        {
          this.setState({ editSection: "profile", editModeIndex: 0 });
        }
        else if (state.editModeIndex >= count - 1)
        {
          this.setState({ editZone: "actions", editActionIndex: 0, editConfirmDelete: "" });
        }
        else
        {
          this.setState({ editModeIndex: state.editModeIndex + 1 });
        }
      }
      else if (button === "RIGHT" || button === "A")
      {
        this.setState({ editZone: "rows", editRow: EditorRows.indices(onDeviceEntry ? "device" : "mode")[0] });
      }
      else if (button === "Y")
      {
        if (!onDeviceEntry)
        {
          this.makeDefault();
        }
      }
      else if (button === "X")
      {
        if (onDeviceEntry)
        {
          this.deleteDevice();
        }
        else
        {
          this.deleteMode();
        }
      }
      else if (button === "B" || button === "MENU")
      {
        this.setState({ screen: "home" });
      }
    }
    else if (state.editZone === "actions")
    {
      // The buttons are a grid of two columns.
      const actionCount = LauncherApp.editorActions.length;
      const columnCount = 2;
      if (button === "UP")
      {
        if (state.editActionIndex >= columnCount)
        {
          this.setState({ editActionIndex: state.editActionIndex - columnCount, editConfirmDelete: "" });
        }
        else
        {
          this.setState({ editZone: "modes", editConfirmDelete: "" });
        }
      }
      else if (button === "DOWN")
      {
        if (state.editActionIndex + columnCount < actionCount)
        {
          this.setState({ editActionIndex: state.editActionIndex + columnCount, editConfirmDelete: "" });
        }
      }
      else if (button === "LEFT")
      {
        this.setState({ editActionIndex: Math.max(0, state.editActionIndex - 1), editConfirmDelete: "" });
      }
      else if (button === "RIGHT")
      {
        this.setState({ editActionIndex: Math.min(actionCount - 1, state.editActionIndex + 1), editConfirmDelete: "" });
      }
      else if (button === "A")
      {
        this.runEditorAction(state.editActionIndex);
      }

      else if (button === "B" || button === "MENU")
      {
        this.setState({ screen: "home" });
      }
    }
    else
    {
      // UP/DOWN stay inside the rows of the selected entry (profile values or device settings).
      const sectionRows = EditorRows.indices(EditorRows.rows[state.editRow].scope);
      const positionInSection = sectionRows.indexOf(state.editRow);
      if (button === "UP")
      {
        this.setState({ editRow: sectionRows[Math.max(0, positionInSection - 1)] });
      }
      else if (button === "DOWN")
      {
        this.setState({ editRow: sectionRows[Math.min(sectionRows.length - 1, positionInSection + 1)] });
      }
      else if (button === "LEFT")
      {
        this.changeValue(state.editRow, -1, false);
      }
      else if (button === "RIGHT")
      {
        this.changeValue(state.editRow, 1, false);
      }
      else if (button === "A")
      {
        this.activateEditorRow(state.editRow);
      }
      else if (button === "X")
      {
        // X deletes what the focused row belongs to: the profile or the whole device.
        if (EditorRows.rows[state.editRow].scope === "mode")
        {
          this.deleteMode();
        }
        else
        {
          this.deleteDevice();
        }
      }
      else if (button === "B")
      {
        this.setState({ editZone: "modes" });
      }
      else if (button === "MENU")
      {
        this.setState({ screen: "home" });
      }
    }
  }

  /** A on a row: text rows start typing, the screen row takes the connected screen, others step. */
  public activateEditorRow(rowIndex: number): void
  {
    const row = EditorRows.rows[rowIndex];
    this.setState({ editRow: rowIndex, editZone: "rows" });
    if (row.type === "text")
    {
      document.getElementById("device-name")?.focus();
    }
    else if (row.key === "resolution" || row.key === "fps")
    {
      // Own values: typed with the Deck's on-screen keyboard (Steam + X), left/right still step.
      const valueField = document.getElementById("mode-" + row.key) as HTMLInputElement | null;
      valueField?.focus();
      valueField?.select();
    }
    else if (row.type === "screen")
    {
      this.takeConnectedScreen();
    }
    else if (row.type === "delete")
    {
      this.deleteDevice();
    }
    else
    {
      this.changeValue(rowIndex, 1, true);
    }
  }

  public runEditorAction(actionIndex: number): void
  {
    this.setState({ editZone: "actions", editActionIndex: actionIndex });
    const action = LauncherApp.editorActions[actionIndex];
    if (action === "addMode")
    {
      this.addMode();
    }
    else if (action === "makeDefault")
    {
      this.makeDefault();
    }
    else if (action === "deleteMode")
    {
      this.deleteMode();
    }
    else
    {
      this.addDevice();
    }
  }

  public changeValue(rowIndex: number, direction: number, wrap: boolean): void
  {
    if (EditorRows.rows[rowIndex].type === "delete")
    {
      // A button, not a value.
      return;
    }
    const profile = this.profile(this.state.editDevice);
    const nextValue = EditorRows.step(rowIndex, profile, this.state.editModeIndex, direction, wrap, this.state.pcDisplayModes);
    this.setValue(rowIndex, nextValue);
  }

  public setValue(rowIndex: number, value: unknown): void
  {
    const { editDevice, editModeIndex } = this.state;
    const bumpKey = editDevice + editModeIndex + EditorRows.rows[rowIndex].key;
    const pcModes = this.state.pcDisplayModes;
    this.updateProfile(editDevice, (profile) =>
    {
      const changed = EditorRows.apply(rowIndex, profile, editModeIndex, value);
      if (EditorRows.rows[rowIndex].key !== "resolution")
      {
        return changed;
      }
      // A new resolution keeps an FPS the PC's monitor has there.
      const fpsRow = EditorRows.rows.findIndex((row) => row.key === "fps");
      return EditorRows.apply(fpsRow, changed, editModeIndex, EditorRows.fittingFps(changed.modes[editModeIndex], pcModes));
    });
    this.setState((state) => ({
      editRow: rowIndex,
      editZone: "rows",
      bumps: { ...state.bumps, [bumpKey]: (state.bumps[bumpKey] ?? 0) + 1 },
    }));
  }

  /** Resolution or FPS typed into its field; text that is no valid value leaves the old one. */
  public typeModeValue(rowIndex: number, text: string): void
  {
    const rowKey = EditorRows.rows[rowIndex].key as "resolution" | "fps";
    const typedValue = EditorRows.parseTyped(rowKey, text);
    const profile = this.profile(this.state.editDevice);
    if (typedValue === null || typedValue === EditorRows.value(rowIndex, profile, this.state.editModeIndex))
    {
      // Bumps the field so it shows the kept value again.
      this.setState((state) =>
      {
        const bumpKey = state.editDevice + state.editModeIndex + rowKey;
        return { bumps: { ...state.bumps, [bumpKey]: (state.bumps[bumpKey] ?? 0) + 1 } };
      });
      return;
    }
    this.setValue(rowIndex, typedValue);
  }

  /** Name field of the edited device; empty names are not kept. */
  public renameEditDevice(name: string): void
  {
    this.updateProfile(this.state.editDevice, (profile) => ({ ...profile, name }));
  }

  public finishRename(): void
  {
    const profile = this.profile(this.state.editDevice);
    if (profile.name.trim() === "")
    {
      this.renameEditDevice(UiText.current.common.defaultDeviceName);
    }
  }

  /** Binds the edited device to the screen connected right now, so it is picked whenever that screen is there. */
  public takeConnectedScreen(): void
  {
    const screenName = this.state.displayNames[0];
    if (screenName === undefined)
    {
      this.showError(UiText.current.editor.noScreenTitle, UiText.current.editor.noScreenText);
      return;
    }
    this.updateProfile(this.state.editDevice, (profile) => ({ ...profile, autoRule: "Dieser Bildschirm", displayName: screenName }));
    this.showToast({ kind: this.profile(this.state.editDevice).icon, eyebrow: UiText.current.editor.automaticWith, name: screenName, spec: "", sub: UiText.current.editor.pickedForScreen(this.profile(this.state.editDevice).name) });
  }

  public makeDefault(): void
  {
    const modeIndex = this.state.editModeIndex;
    this.updateProfile(this.state.editDevice, (profile) => ({ ...profile, defaultModeIndex: modeIndex }));
  }

  public addMode(): void
  {
    const device = this.state.editDevice;
    const profile = this.profile(device);
    if (profile.modes.length >= 6)
    {
      return;
    }
    const copy = { ...profile.modes[this.state.editModeIndex] };
    this.updateProfile(device, (current) => ({ ...current, modes: [...current.modes, copy] }));
    this.setState({ editModeIndex: profile.modes.length, editSection: "profile", editZone: "rows", editRow: 0 });
  }

  /**
   * Deletes the selected mode; the last mode of a device stays. Default, current and remembered
   * mode indices after it move up by one, the ones pointing at it fall back to the first mode.
   */
  public deleteMode(): void
  {
    const device = this.state.editDevice;
    const deletedIndex = this.state.editModeIndex;
    const profile = this.profile(device);
    if (profile.modes.length <= 1)
    {
      this.showError(UiText.current.editor.deleteProfile, UiText.current.editor.lastProfileStays);
      return;
    }
    if (this.state.editConfirmDelete !== "mode")
    {
      this.setState({ editConfirmDelete: "mode" });
      return;
    }

    const shiftIndex = (modeIndex: number) =>
    {
      if (modeIndex === deletedIndex)
      {
        return 0;
      }
      return modeIndex > deletedIndex ? modeIndex - 1 : modeIndex;
    };
    this.updateSettings((settings) =>
    {
      const current = settings.profiles[device];
      const modes = current.modes.filter((_, modeIndex) => modeIndex !== deletedIndex);
      const rememberedModes: Record<string, number> = {};
      for (const [rememberKey, modeIndex] of Object.entries(settings.rememberedModes))
      {
        rememberedModes[rememberKey] = rememberKey.endsWith("|" + device) ? shiftIndex(modeIndex) : modeIndex;
      }
      return {
        ...settings,
        profiles: { ...settings.profiles, [device]: { ...current, modes, defaultModeIndex: shiftIndex(current.defaultModeIndex) } },
        rememberedModes,
      };
    });
    this.setState((state) => ({
      editModeIndex: Math.max(0, Math.min(deletedIndex, profile.modes.length - 2)),
      editConfirmDelete: "",
      currentModes: { ...state.currentModes, [device]: shiftIndex(state.currentModes[device] ?? 0) },
    }));
  }

  /** New device with the modes of the edited one, the next free colour and a screen symbol. */
  public addDevice(): void
  {
    const settings = this.settings;
    if (settings.deviceOrder.length >= LauncherApp.maximumDevices)
    {
      this.showError(UiText.current.editor.addDeviceTitle, UiText.current.editor.tooManyDevices(LauncherApp.maximumDevices));
      return;
    }
    const template = this.profile(this.state.editDevice);
    const deviceId = "device-" + Date.now().toString(36);
    const usedColors = settings.deviceOrder.map((existingId) => settings.profiles[existingId].color);
    const profile: DeviceProfile =
    {
      ...template,
      name: UiText.current.common.numberedDeviceName(settings.deviceOrder.length + 1),
      color: DevicePalette.nextFreeColor(usedColors),
      icon: "tv",
      autoRule: "Nur manuell",
      displayName: "",
      modes: template.modes.map((mode) => ({ ...mode })),
    };
    this.updateSettings((current) => ({
      ...current,
      profiles: { ...current.profiles, [deviceId]: profile },
      deviceOrder: [...current.deviceOrder, deviceId],
    }));
    this.setState((state) => ({
      editDevice: deviceId,
      editModeIndex: profile.defaultModeIndex,
      editSection: "device",
      editZone: "rows",
      editRow: EditorRows.rows.findIndex((row) => row.key === "name"),
      editConfirmDelete: "",
      currentModes: { ...state.currentModes, [deviceId]: profile.defaultModeIndex },
    }));
  }

  /** Deletes the edited device after a second A; one device always stays. Its remembered modes go too. */
  public deleteDevice(): void
  {
    const settings = this.settings;
    const device = this.state.editDevice;
    if (settings.deviceOrder.length <= 1)
    {
      this.showError(UiText.current.editor.deleteDevice, UiText.current.editor.oneDeviceStaysText);
      return;
    }
    if (this.state.editConfirmDelete !== "device")
    {
      this.setState({ editConfirmDelete: "device" });
      return;
    }

    const deviceOrder = settings.deviceOrder.filter((deviceId) => deviceId !== device);
    const fallbackDevice = deviceOrder[0];
    // When the active device goes, take the one the screens suggest now, like at start.
    const remainingSettings = { ...settings, deviceOrder };
    const activeFallback = this.detectedDevice(remainingSettings, this.state.displayNames) ?? fallbackDevice;
    // Move off the device first, so nothing renders a profile that is gone.
    this.setState((state) => ({
      editDevice: fallbackDevice,
      editModeIndex: this.currentModeIndex(fallbackDevice),
      editSection: "profile",
      editZone: "modes",
      editConfirmDelete: "",
      device: state.device === device ? activeFallback : state.device,
    }));
    this.updateSettings((current) =>
    {
      const profiles = { ...current.profiles };
      delete profiles[device];
      const rememberedModes: Record<string, number> = {};
      for (const [rememberKey, modeIndex] of Object.entries(current.rememberedModes))
      {
        if (!rememberKey.endsWith("|" + device))
        {
          rememberedModes[rememberKey] = modeIndex;
        }
      }
      return { ...current, profiles, deviceOrder, rememberedModes };
    });
  }

  /** The switch on home gets too narrow beyond this. */
  public static readonly maximumDevices = 4;

  // ---------------------------------------------------------------- adding games through the PC companion

  /** Covers per row on the "Hinzufügen" screen. */
  public static readonly libraryColumns = 6;

  /** The rail's last position is the "Hinzufügen" tile, not a game. */
  public isAddTileSelected(): boolean
  {
    return this.state.gameIndex === this.state.games.length;
  }

  public openLibrary(): void
  {
    this.setState({ screen: "library", libraryGroupIndex: 0, libraryItemIndex: 0, libraryChanged: false, sunshineLogin: null });
    this.loadLibrary();
  }

  public async loadLibrary(): Promise<void>
  {
    this.setState({ libraryState: "loading", libraryError: "" });
    try
    {
      const host = await this.resolveHost();
      const companionLibrary = await this.backend.companionLibrary(host);
      // Covers only after React applied the new library, else the first group finds no entries.
      this.setState({
        library: companionLibrary.entries,
        librarySunshineProblem: companionLibrary.sunshineProblem,
        libraryState: "ready",
      }, () => this.loadLibraryCovers());
    }
    catch (libraryError)
    {
      this.setState({ libraryState: "error", libraryError: String(libraryError) });
    }
  }

  /** Group names in the order the companion sent them. */
  public libraryGroups(): string[]
  {
    const groups: string[] = [];
    for (const entry of this.state.library)
    {
      if (!groups.includes(entry.group))
      {
        groups.push(entry.group);
      }
    }
    return groups;
  }

  public libraryEntriesOfGroup(groupIndex: number = this.state.libraryGroupIndex): LibraryEntry[]
  {
    const group = this.libraryGroups()[groupIndex];
    return this.state.library.filter((entry) => entry.group === group);
  }

  public selectedLibraryEntry(): LibraryEntry | undefined
  {
    return this.libraryEntriesOfGroup()[this.state.libraryItemIndex];
  }

  /** Fetches the covers of the shown group one after another; already loaded ones are kept. */
  private async loadLibraryCovers(): Promise<void>
  {
    const groupIndex = this.state.libraryGroupIndex;
    for (const entry of this.libraryEntriesOfGroup(groupIndex))
    {
      const stillOnThisGroup = this.state.screen === "library" && this.state.libraryGroupIndex === groupIndex;
      if (!stillOnThisGroup)
      {
        return;
      }
      if (!entry.hasCover || entry.id in this.state.libraryCovers)
      {
        continue;
      }
      let cover: string | null = null;
      try
      {
        cover = await this.backend.companionCover(this.connectedHost(), entry.id);
      }
      catch (coverError)
      {
        console.warn("cover failed", entry.id, coverError);
      }
      this.setState((state) => ({ libraryCovers: { ...state.libraryCovers, [entry.id]: cover } }));
    }
  }

  public switchLibraryGroup(direction: number): void
  {
    const groupCount = this.libraryGroups().length;
    if (groupCount === 0)
    {
      return;
    }
    const groupIndex = (this.state.libraryGroupIndex + direction + groupCount) % groupCount;
    this.setState({ libraryGroupIndex: groupIndex, libraryItemIndex: 0 }, () => this.loadLibraryCovers());
  }

  private libraryButton(button: PadButton): void
  {
    const state = this.state;
    const entryCount = this.libraryEntriesOfGroup().length;
    const columns = LauncherApp.libraryColumns;

    if (state.sunshineLogin !== null)
    {
      this.sunshineLoginButton(button);
      return;
    }

    if (button === "B")
    {
      this.closeLibrary();
    }
    else if (button === "MENU")
    {
      this.openSunshineLogin();
    }
    else if (button === "Y")
    {
      this.loadLibrary();
    }
    else if (button === "L1" || button === "R1")
    {
      this.switchLibraryGroup(button === "L1" ? -1 : 1);
    }
    else if (button === "LEFT")
    {
      this.setState({ libraryItemIndex: Math.max(0, state.libraryItemIndex - 1) });
    }
    else if (button === "RIGHT")
    {
      this.setState({ libraryItemIndex: Math.min(entryCount - 1, state.libraryItemIndex + 1) });
    }
    else if (button === "UP")
    {
      this.setState({ libraryItemIndex: Math.max(0, state.libraryItemIndex - columns) });
    }
    else if (button === "DOWN")
    {
      this.setState({ libraryItemIndex: Math.min(entryCount - 1, state.libraryItemIndex + columns) });
    }
    else if (button === "A")
    {
      this.addLibraryEntry(state.libraryItemIndex);
    }
    else if (button === "X")
    {
      this.removeLibraryEntry(state.libraryItemIndex);
    }
  }

  public async addLibraryEntry(itemIndex: number): Promise<void>
  {
    this.setState({ libraryItemIndex: itemIndex });
    const entry = this.libraryEntriesOfGroup()[itemIndex];
    if (entry === undefined || this.state.libraryBusyId !== "")
    {
      return;
    }
    if (this.state.librarySunshineProblem !== null && !entry.inSunshine)
    {
      // Adding would fail anyway; let the user fix the login first.
      this.openSunshineLogin();
      return;
    }
    if (entry.inSunshine)
    {
      this.showToast({ kind: "ok", eyebrow: UiText.current.toasts.alreadyInList, name: entry.name, spec: "", sub: UiText.current.toasts.xRemovesIt });
      return;
    }

    this.setState({ libraryBusyId: entry.id });
    try
    {
      const appName = await this.backend.companionAddApp(this.connectedHost(), entry.id);
      this.markLibraryEntry(entry.id, true);
      this.showToast({ kind: "ok", eyebrow: UiText.current.toasts.added, name: appName, spec: "", sub: UiText.current.toasts.nowInList });
    }
    catch (addError)
    {
      this.showError(UiText.current.toasts.addFailed, String(addError));
    }
    finally
    {
      this.setState({ libraryBusyId: "" });
    }
  }

  public async removeLibraryEntry(itemIndex: number): Promise<void>
  {
    const entry = this.libraryEntriesOfGroup()[itemIndex];
    if (entry === undefined || !entry.inSunshine || this.state.libraryBusyId !== "")
    {
      return;
    }
    if (this.state.librarySunshineProblem !== null)
    {
      this.openSunshineLogin();
      return;
    }

    this.setState({ libraryBusyId: entry.id });
    try
    {
      await this.backend.companionRemoveApp(this.connectedHost(), entry.name);
      this.markLibraryEntry(entry.id, false);
      this.showToast({ kind: "ok", eyebrow: UiText.current.toasts.removed, name: entry.name, spec: "", sub: UiText.current.toasts.noLongerInList });
    }
    catch (removeError)
    {
      this.showError(UiText.current.toasts.removeFailed, String(removeError));
    }
    finally
    {
      this.setState({ libraryBusyId: "" });
    }
  }

  private markLibraryEntry(entryId: string, inSunshine: boolean): void
  {
    this.setState((state) => ({
      library: state.library.map((entry) => (entry.id === entryId ? { ...entry, inSunshine } : entry)),
      libraryChanged: true,
    }));
  }

  // ---------------------------------------------------------------- Sunshine login for the PC companion

  /** Element ids of the dialog's two text fields, by row. */
  public static readonly sunshineLoginFieldIds = ["sunshine-login-user", "sunshine-login-password"];

  /** Prefilled with the login from settings.json, which is usually the same Sunshine web UI login. */
  public openSunshineLogin(): void
  {
    const draft: SunshineLoginDraft =
    {
      user: this.settings.sunshineUser,
      password: this.settings.sunshinePassword,
      row: 0,
      busy: false,
      error: "",
    };
    this.setState({ sunshineLogin: draft }, () => this.focusSunshineLoginRow(0));
  }

  public closeSunshineLogin(): void
  {
    (document.activeElement as HTMLElement | null)?.blur();
    this.setState({ sunshineLogin: null });
  }

  public changeSunshineLogin(change: Partial<SunshineLoginDraft>): void
  {
    this.setState((state) => (state.sunshineLogin === null ? null : { sunshineLogin: { ...state.sunshineLogin, ...change } }));
  }

  /** Rows 0 and 1 are text fields and get the keyboard focus; row 2 is the save button. */
  public focusSunshineLoginRow(row: number): void
  {
    this.changeSunshineLogin({ row });
    const fieldId = LauncherApp.sunshineLoginFieldIds[row];
    if (fieldId === undefined)
    {
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    document.getElementById(fieldId)?.focus();
  }

  private sunshineLoginButton(button: PadButton): void
  {
    const draft = this.state.sunshineLogin;
    if (draft === null || draft.busy)
    {
      return;
    }
    const typing = document.activeElement instanceof HTMLInputElement;

    if (button === "UP")
    {
      this.focusSunshineLoginRow(Math.max(0, draft.row - 1));
    }
    else if (button === "DOWN")
    {
      this.focusSunshineLoginRow(Math.min(2, draft.row + 1));
    }
    else if (button === "A")
    {
      // Enter in the user field moves on to the password, everywhere else it saves.
      if (draft.row === 0)
      {
        this.focusSunshineLoginRow(1);
      }
      else
      {
        this.submitSunshineLogin();
      }
    }
    else if (button === "B")
    {
      if (typing)
      {
        (document.activeElement as HTMLInputElement).blur();
      }
      else
      {
        this.closeSunshineLogin();
      }
    }
  }

  public async submitSunshineLogin(): Promise<void>
  {
    const draft = this.state.sunshineLogin;
    if (draft === null || draft.busy)
    {
      return;
    }
    if (draft.user.trim() === "" || draft.password === "")
    {
      this.changeSunshineLogin({ error: UiText.current.sunshineLogin.enterBoth });
      return;
    }

    (document.activeElement as HTMLElement | null)?.blur();
    this.changeSunshineLogin({ busy: true, error: "", row: 2 });
    try
    {
      const user = draft.user.trim();
      await this.backend.companionSetSunshineLogin(this.connectedHost(), user, draft.password);
      this.updateSettings((settings) => ({ ...settings, sunshineUser: user, sunshinePassword: draft.password }));
      this.setState({ sunshineLogin: null });
      this.showToast({ kind: "ok", eyebrow: UiText.current.common.pcHelper, name: UiText.current.toasts.loginSaved, spec: "", sub: UiText.current.toasts.gamesCanBeAdded });
      // Ask the companion again, so the hint only disappears once it really reaches Sunshine.
      this.loadLibrary();
    }
    catch (loginError)
    {
      this.changeSunshineLogin({ busy: false, error: String(loginError) });
    }
  }

  private closeLibrary(): void
  {
    const changed = this.state.libraryChanged;
    this.setState({ screen: "home", zone: "games" });
    if (changed)
    {
      this.reloadGames();
    }
  }

  // ---------------------------------------------------------------- connection and pairing

  /** Rows on the right side of the connection screen. */
  public static readonly connectionRows = ["pair", "addresses", "moonlight", "afterStream", "streamSummary", "backdrop", "steamGridDb", "language"] as const;

  public openConnection(): void
  {
    this.setState({ screen: "connection", connectionZone: "hosts", connectionHostIndex: 0, pairState: "idle", pairMessage: "" });
    this.searchHosts();
  }

  public async searchHosts(): Promise<void>
  {
    if (this.state.searchingHosts)
    {
      return;
    }
    this.setState({ searchingHosts: true });
    try
    {
      const discoveredHosts = await this.backend.discoverHosts();
      this.setState({ discoveredHosts });
    }
    catch (searchError)
    {
      this.showError(UiText.current.toasts.searchFailed, String(searchError));
    }
    finally
    {
      this.setState({ searchingHosts: false });
    }
  }

  /** Index of the "enter IP manually" entry, after the found hosts. */
  public manualHostIndex(): number
  {
    return this.state.discoveredHosts.length;
  }

  public chooseHost(host: string, hostName: string): void
  {
    const trimmedHost = host.trim();
    if (trimmedHost === "")
    {
      return;
    }
    // Another named PC brings its own addresses; the same PC (or a typed address) keeps the extra ones.
    const isOtherPc = hostName !== "" && this.settings.hostName !== "" && hostName !== this.settings.hostName;
    const extraHostAddresses = isOtherPc ? [] : this.settings.extraHostAddresses.filter((address) => address !== trimmedHost);
    const changedSettings = { ...this.settings, host: trimmedHost, hostName, extraHostAddresses };
    this.updateSettings(() => changedSettings);
    this.setState({ pairState: "idle", pairMessage: "", connectionZone: "rows", connectionRow: 0, activeHost: "" });
    this.reloadGames(changedSettings);
  }

  /** Row index of the extra addresses on the connection screen. */
  public static readonly addressesRowIndex = LauncherApp.connectionRows.indexOf("addresses");

  public static readonly backdropRowIndex = LauncherApp.connectionRows.indexOf("backdrop");

  public static readonly streamSummaryRowIndex = LauncherApp.connectionRows.indexOf("streamSummary");

  public static readonly steamGridDbRowIndex = LauncherApp.connectionRows.indexOf("steamGridDb");

  public static readonly languageRowIndex = LauncherApp.connectionRows.indexOf("language");

  /** Stores the language and applies it right away; the Rust side and the companion follow. */
  public setLanguage(language: UiLanguage): void
  {
    UiText.use(language);
    this.backend.setLanguage(language);
    this.updateSettings((settings) => ({ ...settings, language }));
  }

  /** A on the language row: the next language. */
  private cycleLanguage(): void
  {
    const languages = UiText.languages;
    this.setLanguage(languages[(languages.indexOf(UiText.language) + 1) % languages.length]);
  }

  /** The key field; A focuses it, so the Deck's on-screen keyboard (Steam + X) can type into it. */
  public focusSteamGridDbKey(): void
  {
    this.setState({ connectionZone: "rows", connectionRow: LauncherApp.steamGridDbRowIndex });
    document.getElementById("steamgriddb-key")?.focus();
  }

  /** Stores the typed SteamGridDB key; an empty field keeps the stored one (X removes it). */
  public saveSteamGridDbKey(typedKey: string): void
  {
    const steamGridDbKey = typedKey.trim();
    this.setState({ steamGridDbKeyDraft: "" });
    if (steamGridDbKey === "")
    {
      return;
    }
    this.updateSettings((settings) => ({ ...settings, steamGridDbKey }));
    // ponytail: no check yet; the PC helper's key check endpoint sets "checking" and the result here once it exists.
    this.setState({ steamGridDbKeyCheck: "unchecked" });
    this.showToast({ kind: "ok", eyebrow: "SteamGridDB", name: UiText.current.toasts.keySaved, spec: "", sub: UiText.current.toasts.keySavedText });
  }

  public removeSteamGridDbKey(): void
  {
    this.updateSettings((settings) => ({ ...settings, steamGridDbKey: "" }));
    this.setState({ steamGridDbKeyCheck: "unchecked" });
  }

  public focusExtraAddress(): void
  {
    this.setState({ connectionZone: "rows", connectionRow: LauncherApp.addressesRowIndex });
    document.getElementById("extra-address")?.focus();
  }

  /** Another address of the same PC, e.g. its Tailscale IP; tried after the home address. */
  public addExtraAddress(address: string): void
  {
    const trimmedAddress = address.trim();
    if (trimmedAddress === "" || this.hostAddresses().includes(trimmedAddress))
    {
      this.setState({ extraAddressDraft: "" });
      return;
    }
    const changedSettings = { ...this.settings, extraHostAddresses: [...this.settings.extraHostAddresses, trimmedAddress] };
    this.updateSettings(() => changedSettings);
    this.setState({ extraAddressDraft: "" });
    this.reloadGames(changedSettings);
  }

  public removeLastExtraAddress(): void
  {
    if (this.settings.extraHostAddresses.length === 0)
    {
      return;
    }
    const changedSettings = { ...this.settings, extraHostAddresses: this.settings.extraHostAddresses.slice(0, -1) };
    this.updateSettings(() => changedSettings);
    this.reloadGames(changedSettings);
  }

  public focusManualHost(): void
  {
    this.setState({ connectionZone: "hosts", connectionHostIndex: this.manualHostIndex() });
    document.getElementById("manual-host")?.focus();
  }

  public async startPairing(): Promise<void>
  {
    if (this.settings.host === "" || this.state.pairState === "pairing")
    {
      return;
    }
    const pairPin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    this.setState({ pairState: "pairing", pairPin, pairMessage: "" });
    try
    {
      const host = await this.resolveHost();
      await this.backend.pairHost(this.settings, host, pairPin);
      this.setState({ pairState: "paired" });
      this.reloadGames();
    }
    catch (pairError)
    {
      this.setState({ pairState: "error", pairMessage: String(pairError) });
    }
  }

  public toggleMoonlightCommand(): void
  {
    const usesFlatpak = this.settings.moonlightCommand[0] === "flatpak";
    const moonlightCommand = usesFlatpak ? DefaultSettings.systemMoonlight : DefaultSettings.flatpakMoonlight;
    this.updateSettings((settings) => ({ ...settings, moonlightCommand }));
  }

  private connectionButton(button: PadButton): void
  {
    const state = this.state;
    const typing = document.activeElement instanceof HTMLInputElement;
    if (typing)
    {
      if (button === "A")
      {
        if ((document.activeElement as HTMLInputElement).id === "extra-address")
        {
          this.addExtraAddress(state.extraAddressDraft);
        }
        else if ((document.activeElement as HTMLInputElement).id === "steamgriddb-key")
        {
          this.saveSteamGridDbKey(state.steamGridDbKeyDraft);
        }
        else
        {
          this.chooseHost(state.manualHostDraft, "");
        }
      }
      (document.activeElement as HTMLInputElement).blur();
      return;
    }

    if (button === "Y")
    {
      this.searchHosts();
      return;
    }
    if (button === "B" || button === "MENU")
    {
      this.setState({ screen: "home" });
      return;
    }

    if (state.connectionZone === "hosts")
    {
      if (button === "UP")
      {
        this.setState({ connectionHostIndex: Math.max(0, state.connectionHostIndex - 1) });
      }
      else if (button === "DOWN")
      {
        this.setState({ connectionHostIndex: Math.min(this.manualHostIndex(), state.connectionHostIndex + 1) });
      }
      else if (button === "RIGHT")
      {
        this.setState({ connectionZone: "rows" });
      }
      else if (button === "A")
      {
        const host = state.discoveredHosts[state.connectionHostIndex];
        if (host === undefined)
        {
          this.focusManualHost();
        }
        else
        {
          this.chooseHost(host.address, host.name);
        }
      }
    }
    else
    {
      if (button === "UP")
      {
        this.setState({ connectionRow: Math.max(0, state.connectionRow - 1) });
      }
      else if (button === "DOWN")
      {
        this.setState({ connectionRow: Math.min(LauncherApp.connectionRows.length - 1, state.connectionRow + 1) });
      }
      else if (button === "LEFT")
      {
        this.setState({ connectionZone: "hosts" });
      }
      else if (button === "A")
      {
        this.activateConnectionRow(state.connectionRow);
      }
      else if (button === "X" && state.connectionRow === LauncherApp.addressesRowIndex)
      {
        this.removeLastExtraAddress();
      }
      else if (button === "X" && state.connectionRow === LauncherApp.steamGridDbRowIndex)
      {
        this.removeSteamGridDbKey();
      }
    }
  }

  public activateConnectionRow(rowIndex: number): void
  {
    this.setState({ connectionZone: "rows", connectionRow: rowIndex });
    const row = LauncherApp.connectionRows[rowIndex];
    if (row === "pair")
    {
      this.startPairing();
    }
    else if (row === "addresses")
    {
      this.focusExtraAddress();
    }
    else if (row === "moonlight")
    {
      this.toggleMoonlightCommand();
    }
    else if (row === "afterStream")
    {
      this.cycleAfterStream();
    }
    else if (row === "streamSummary")
    {
      this.toggleStreamSummary();
    }
    else if (row === "backdrop")
    {
      this.cycleBackdropKind();
    }
    else if (row === "steamGridDb")
    {
      this.focusSteamGridDbKey();
    }
    else if (row === "language")
    {
      this.cycleLanguage();
    }
  }

  // ---------------------------------------------------------------- self-update

  /** Asks GitHub once at start; the dialog never opens over a stream that is starting or running. */
  private async checkForUpdate(): Promise<void>
  {
    const available = await this.backend.checkForUpdate();
    if (available !== null && this.mounted && this.state.screen !== "connect" && this.state.screen !== "stream")
    {
      this.setState({ update: { ...available, installing: false, error: "" } });
    }
  }

  private updateButton(button: PadButton): void
  {
    const update = this.state.update;
    if (update === null || update.installing)
    {
      return;
    }
    if (button === "A")
    {
      this.installUpdate();
    }
    else if (button === "B")
    {
      this.setState({ update: null });
    }
  }

  public async installUpdate(): Promise<void>
  {
    const update = this.state.update;
    if (update === null)
    {
      return;
    }
    this.setState({ update: { ...update, installing: true, error: "" } });
    try
    {
      // Restarts the launcher on success, so nothing after this line runs then.
      await this.backend.installUpdate();
    }
    catch (installError)
    {
      this.setState({ update: { ...update, installing: false, error: String(installError) } });
    }
  }

  public closeUpdate(): void
  {
    this.setState({ update: null });
  }

  // ---------------------------------------------------------------- render

  public render(): React.ReactNode
  {
    const state = this.state;
    if (state.settings === null)
    {
      return <div className="app" style={{ width: "100vw", height: "100vh", background: "#08080B" }} />;
    }

    const accentDevice = state.screen === "editor" ? state.editDevice : state.device;
    const innerStyle = {
      "--acc": this.accentColor(accentDevice),
      width: LauncherApp.designWidth,
      height: window.innerHeight / state.zoom,
      zoom: state.zoom,
    } as CSSProperties;

    return (
      <div
        className="app"
        style={{ width: "100vw", height: "100vh", fontFamily: "'Inter Variable', Inter, system-ui, sans-serif", color: "#F5F5F7", background: "#08080B" }}
      >
        <div className="inner" style={innerStyle}>
          {state.screen === "home" && <HomeScreen app={this} />}
          {(state.screen === "detail" || state.screen === "afterStream" || state.screen === "streamSummary") && <DetailScreen app={this} />}
          {state.screen === "connect" && <ConnectScreen app={this} />}
          {state.screen === "stream" && <StreamScreen app={this} />}
          {state.screen === "editor" && <EditorScreen app={this} />}
          {state.screen === "connection" && <ConnectionScreen app={this} />}
          {state.screen === "library" && <LibraryScreen app={this} />}
          <div className="ambient" />
          {state.screen === "afterStream" && <AfterStreamDialog app={this} />}
          {state.screen === "detail" && state.switchGame !== null && <SwitchGameDialog app={this} />}
          {state.screen === "streamSummary" && <StreamSummaryDialog app={this} />}
          {state.screen === "detail" && state.imageDialog !== null && <ImageDialog app={this} />}
          {state.screen === "library" && state.sunshineLogin !== null && <SunshineLoginDialog app={this} />}
          {state.update !== null && <UpdateDialog app={this} />}
          <HintBar app={this} />
          {state.toast !== null && <ToastCard toast={state.toast} />}
        </div>
      </div>
    );
  }
}
