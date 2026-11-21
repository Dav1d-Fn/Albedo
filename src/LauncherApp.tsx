import React, { CSSProperties } from "react";
import { InputRouter } from "./input/InputRouter";
import { ModeText } from "./model/ModeText";
import { DefaultSettings } from "./model/DefaultSettings";
import { GameArt } from "./model/GameArt";
import { AfterStreamAction, DeviceId, DeviceProfile, DiscoveredHost, LibraryEntry, PadButton, Settings, StreamMode, SunshineLoginDraft } from "./model/Types";
import { Backend } from "./services/Backend";
import { AfterStreamDialog } from "./views/AfterStreamDialog";
import { ConnectScreen } from "./views/ConnectScreen";
import { ConnectionScreen } from "./views/ConnectionScreen";
import { DetailScreen } from "./views/DetailScreen";
import { EditorRows } from "./views/EditorRows";
import { EditorScreen } from "./views/EditorScreen";
import { HintBar } from "./views/HintBar";
import { HomeScreen } from "./views/HomeScreen";
import { LibraryScreen } from "./views/LibraryScreen";
import { StreamScreen } from "./views/StreamScreen";
import { SunshineLoginDialog } from "./views/SunshineLoginDialog";
import { ToastCard, ToastContent } from "./views/ToastCard";

export type ScreenName = "home" | "detail" | "connect" | "stream" | "afterStream" | "editor" | "connection" | "library";

export type HostState = "loading" | "online" | "error";

export interface LauncherState
{
  settings: Settings | null;
  screen: ScreenName;
  /** Home: focus is on the game rail or on the top bar. */
  zone: "games" | "top";
  gameIndex: number;
  topIndex: number;
  detailIndex: number;
  /** Device and mode currently used for starting games. */
  device: DeviceId;
  currentModes: Record<DeviceId, number>;
  externalDisplay: boolean;
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
  /** Editor state. */
  editDevice: DeviceId;
  editModeIndex: number;
  editZone: "modes" | "rows";
  editRow: number;
  bumps: Record<string, number>;
  /** Connection screen: found hosts on the left, pairing and Moonlight on the right. */
  discoveredHosts: DiscoveredHost[];
  searchingHosts: boolean;
  connectionZone: "hosts" | "rows";
  connectionHostIndex: number;
  connectionRow: number;
  manualHostDraft: string;
  /** Text field for another address of the PC, e.g. its Tailscale IP. */
  extraAddressDraft: string;
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
  /** Design is drawn at 1280px width and zoomed to the window. */
  zoom: number;
}

/** Root component: owns all state and turns controller buttons into actions. */
export default class LauncherApp extends React.Component<object, LauncherState>
{
  private static readonly designWidth = 1280;

  private static readonly displayPollMilliseconds = 3000;

  private static readonly connectStepMilliseconds = 450;

  public readonly backend = new Backend();

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
      externalDisplay: false,
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
      editZone: "modes",
      editRow: 0,
      bumps: {},
      discoveredHosts: [],
      searchingHosts: false,
      connectionZone: "hosts",
      connectionHostIndex: 0,
      connectionRow: 0,
      manualHostDraft: "",
      extraAddressDraft: "",
      pairState: "idle",
      pairPin: "",
      pairMessage: "",
      afterStreamIndex: 0,
      afterStreamRemember: false,
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
      zoom: Math.max(window.innerWidth, 320) / LauncherApp.designWidth,
    };
  }

  // ---------------------------------------------------------------- lifecycle

  public async componentDidMount(): Promise<void>
  {
    this.mounted = true;
    this.inputRouter.attach();
    window.addEventListener("resize", this.handleResize);

    const unlisten = await this.backend.onStreamEnded((event) => this.handleStreamEnded(event.exitCode, event.errorTail));
    if (!this.mounted)
    {
      unlisten();
      return;
    }
    this.unlistenStreamEnded = unlisten;

    const settings = await this.backend.loadSettings();
    const externalDisplay = await this.backend.hasExternalDisplay();
    const device = this.detectedDevice(settings, externalDisplay) ?? "handheld";
    this.setState({
      settings,
      externalDisplay,
      device,
      editDevice: device,
      currentModes:
      {
        handheld: settings.profiles.handheld.defaultModeIndex,
        tv: settings.profiles.tv.defaultModeIndex,
      },
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
  }

  public componentWillUnmount(): void
  {
    this.mounted = false;
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
    return profile.modes[this.state.currentModes[device]] ?? profile.modes[0];
  }

  public selectedGame(): string | undefined
  {
    return this.state.games[this.state.gameIndex];
  }

  public hostDisplayName(): string
  {
    return this.settings.hostName || this.settings.host || "Kein PC";
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

  /** Which device the hardware suggests, or null when that device is set to manual only. */
  private detectedDevice(settings: Settings, externalDisplay: boolean): DeviceId | null
  {
    const device: DeviceId = externalDisplay ? "tv" : "handheld";
    return settings.profiles[device].autoRule === "Nur manuell" ? null : device;
  }

  public detectedDeviceName(): string
  {
    const detected = this.detectedDevice(this.settings, this.state.externalDisplay);
    return detected === null ? "keins" : ModeText.deviceNames[detected];
  }

  private async pollDisplay(): Promise<void>
  {
    const externalDisplay = await this.backend.hasExternalDisplay();
    if (externalDisplay === this.state.externalDisplay || this.state.settings === null)
    {
      return;
    }
    this.setState({ externalDisplay });
    const detected = this.detectedDevice(this.settings, externalDisplay);
    if (this.state.automatic && detected !== null && detected !== this.state.device && this.state.screen !== "stream")
    {
      this.setDevice(detected, externalDisplay ? "Bildschirm erkannt · automatisch" : "Bildschirm getrennt · automatisch", true);
    }
  }

  // ---------------------------------------------------------------- settings

  private updateSettings(change: (settings: Settings) => Settings): void
  {
    const settings = change(this.settings);
    this.setState({ settings });
    this.backend.saveSettings(settings).catch((saveError) => this.showError("Speichern fehlgeschlagen", String(saveError)));
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
      this.setState({ games: [], hostState: "error", hostError: "Noch kein PC eingerichtet · A auf dem PC-Feld" });
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
      this.loadBoxArt(settings);
    }
    catch (fetchError)
    {
      this.setState({ hostState: "error", hostError: String(fetchError) });
    }
  }

  /** Covers are optional: without them the placeholders stay, so errors are only logged. */
  private async loadBoxArt(settings: Settings): Promise<void>
  {
    try
    {
      const boxArt = await this.backend.loadBoxArt(settings, this.hostAddresses(settings));
      this.setState({ boxArt: boxArt ?? {} });
    }
    catch (artError)
    {
      console.warn("no cover art", artError);
    }
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
    this.showToast({ kind: "error", eyebrow: "Fehler", name: title, spec: "", sub: message });
  }

  private deviceToast(device: DeviceId, eyebrow: string, modeIndex: number): void
  {
    const profile = this.profile(device);
    const mode = profile.modes[modeIndex] ?? profile.modes[0];
    this.showToast({
      kind: device,
      eyebrow,
      name: ModeText.deviceNames[device],
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
    return this.state.currentModes[device];
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
    const next: DeviceId = this.state.device === "tv" ? "handheld" : "tv";
    const isAutomatic = next === this.detectedDevice(this.settings, this.state.externalDisplay);
    this.setDevice(next, isAutomatic ? "Zurück auf automatisch" : "Manuell gewählt", isAutomatic);
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
      kind: device,
      eyebrow: ModeText.deviceNames[device] + " · Modus",
      name: ModeText.label(mode) + " FPS",
      spec: mode.bitrateMbps + " Mbit/s",
      sub: ModeText.extra(mode),
    });
  }

  public cycleMode(direction: number): void
  {
    const count = this.profile().modes.length;
    this.setMode((this.state.currentModes[this.state.device] + direction + count) % count);
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

    const screen = this.state.screen;
    const quickSwitch = screen === "home" || screen === "detail";

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
          this.clearTimers();
          this.setState({ screen: "detail" });
        }
        return;
      case "connection":
        return this.connectionButton(button);
      case "library":
        return this.libraryButton(button);
      case "stream":
        // Moonlight owns the controller now; we come back via the "stream-ended" event.
        return;
      case "afterStream":
        return this.afterStreamButton(button);
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
        this.setState({ gameIndex: Math.max(0, state.gameIndex - 1) });
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

  private detailButton(button: PadButton): void
  {
    if (button === "LEFT")
    {
      this.setState({ detailIndex: 0 });
    }
    else if (button === "RIGHT")
    {
      this.setState({ detailIndex: 1 });
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
      this.startStream();
    }
    else
    {
      this.toggleDevice();
    }
  }

  // ---------------------------------------------------------------- streaming

  private startStream(): void
  {
    const gameName = this.selectedGame();
    if (gameName === undefined)
    {
      return;
    }
    const device = this.state.device;
    const profile = this.profile(device);
    const mode = this.activeMode(device);
    const steps =
    [
      "Verbinde mit " + this.hostDisplayName(),
      ModeText.deviceNames[device] + " setzen · " + ModeText.spec(mode),
      "Moonlight starten · " + gameName,
    ];

    this.clearTimers();
    this.setState({ screen: "connect", connectSteps: steps, connectStep: 0, lastLaunchError: "" });
    steps.forEach((_, stepIndex) =>
    {
      this.later(() => this.setState({ connectStep: stepIndex + 1 }), LauncherApp.connectStepMilliseconds * (stepIndex + 1));
    });
    this.later(async () =>
    {
      try
      {
        // The Deck may have changed networks since the list was loaded (home ↔ Tailscale).
        const host = await this.resolveHost();
        await this.backend.startStream(this.settings, host, gameName, profile, mode);
        this.setState({ screen: "stream" });
      }
      catch (launchError)
      {
        this.setState({ screen: "detail", lastLaunchError: String(launchError) });
      }
    }, LauncherApp.connectStepMilliseconds * steps.length + 300);
  }

  private handleStreamEnded(exitCode: number | null, errorTail: string): void
  {
    const failed = exitCode !== 0;
    if (failed)
    {
      this.setState({
        screen: "detail",
        lastLaunchError: "Moonlight beendet mit Code " + exitCode + (errorTail ? ": " + errorTail : ""),
      });
      return;
    }

    const afterStream = this.settings.afterStream;
    if (afterStream === "ask")
    {
      this.setState({ screen: "afterStream", afterStreamIndex: 0, afterStreamRemember: false, lastLaunchError: "" });
      return;
    }
    this.setState({ screen: "detail", lastLaunchError: "" });
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
    if (this.state.afterStreamRemember)
    {
      this.setAfterStream(choice);
    }
    this.setState({ screen: "detail", afterStreamIndex: choiceIndex });
    if (choice === "quit")
    {
      this.quitHostApp();
    }
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

  private async quitHostApp(): Promise<void>
  {
    const gameName = this.selectedGame() ?? "";
    try
    {
      await this.backend.quitHostApp(this.settings, this.connectedHost());
      this.showToast({ kind: "ok", eyebrow: this.hostDisplayName(), name: "Beendet", spec: "", sub: gameName + " läuft nicht mehr auf dem PC" });
    }
    catch (quitError)
    {
      this.showError("Beenden fehlgeschlagen", String(quitError));
    }
  }

  // ---------------------------------------------------------------- editor

  public openEditor(): void
  {
    const device = this.state.device;
    this.setState({ screen: "editor", editDevice: device, editModeIndex: this.state.currentModes[device], editZone: "modes", editRow: 0 });
  }

  public switchEditDevice(device: DeviceId): void
  {
    this.setState({ editDevice: device, editModeIndex: this.state.currentModes[device], editZone: "modes" });
  }

  private editorButton(button: PadButton): void
  {
    const state = this.state;
    if (button === "L1" || button === "R1")
    {
      return this.switchEditDevice(button === "L1" ? "handheld" : "tv");
    }

    if (state.editZone === "modes")
    {
      const count = this.profile(state.editDevice).modes.length;
      if (button === "UP")
      {
        this.setState({ editModeIndex: Math.max(0, state.editModeIndex - 1) });
      }
      else if (button === "DOWN")
      {
        this.setState({ editModeIndex: Math.min(count - 1, state.editModeIndex + 1) });
      }
      else if (button === "RIGHT" || button === "A")
      {
        this.setState({ editZone: "rows", editRow: 0 });
      }
      else if (button === "Y")
      {
        this.makeDefault();
      }
      else if (button === "X")
      {
        this.addMode();
      }
      else if (button === "B" || button === "MENU")
      {
        this.setState({ screen: "home" });
      }
    }
    else
    {
      if (button === "UP")
      {
        this.setState({ editRow: Math.max(0, state.editRow - 1) });
      }
      else if (button === "DOWN")
      {
        this.setState({ editRow: Math.min(EditorRows.rows.length - 1, state.editRow + 1) });
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
        this.changeValue(state.editRow, 1, true);
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

  public changeValue(rowIndex: number, direction: number, wrap: boolean): void
  {
    const profile = this.profile(this.state.editDevice);
    const nextValue = EditorRows.step(rowIndex, profile, this.state.editModeIndex, direction, wrap);
    this.setValue(rowIndex, nextValue);
  }

  public setValue(rowIndex: number, value: unknown): void
  {
    const { editDevice, editModeIndex } = this.state;
    const bumpKey = editDevice + editModeIndex + EditorRows.rows[rowIndex].key;
    this.updateProfile(editDevice, (profile) => EditorRows.apply(rowIndex, profile, editModeIndex, value));
    this.setState((state) => ({
      editRow: rowIndex,
      editZone: "rows",
      bumps: { ...state.bumps, [bumpKey]: (state.bumps[bumpKey] ?? 0) + 1 },
    }));
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
    this.setState({ editModeIndex: profile.modes.length, editZone: "rows", editRow: 0 });
  }

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
      this.setState({
        library: companionLibrary.entries,
        librarySunshineProblem: companionLibrary.sunshineProblem,
        libraryState: "ready",
      });
      this.loadLibraryCovers();
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
      this.showToast({ kind: "ok", eyebrow: "Schon in der Liste", name: entry.name, spec: "", sub: "X entfernt es wieder" });
      return;
    }

    this.setState({ libraryBusyId: entry.id });
    try
    {
      const appName = await this.backend.companionAddApp(this.connectedHost(), entry.id);
      this.markLibraryEntry(entry.id, true);
      this.showToast({ kind: "ok", eyebrow: "Hinzugefügt", name: appName, spec: "", sub: "Steht jetzt in der Spieleliste" });
    }
    catch (addError)
    {
      this.showError("Hinzufügen fehlgeschlagen", String(addError));
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
      this.showToast({ kind: "ok", eyebrow: "Entfernt", name: entry.name, spec: "", sub: "Nicht mehr in der Spieleliste" });
    }
    catch (removeError)
    {
      this.showError("Entfernen fehlgeschlagen", String(removeError));
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
      this.changeSunshineLogin({ error: "Benutzername und Passwort eintragen." });
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
      this.showToast({ kind: "ok", eyebrow: "PC-Helfer", name: "Sunshine-Login gespeichert", spec: "", sub: "Spiele können jetzt hinzugefügt werden" });
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
  public static readonly connectionRows = ["pair", "addresses", "moonlight", "afterStream"] as const;

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
      this.showError("Suche fehlgeschlagen", String(searchError));
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
    else
    {
      this.cycleAfterStream();
    }
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
      "--acc": ModeText.accentColors[accentDevice],
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
          {(state.screen === "detail" || state.screen === "afterStream") && <DetailScreen app={this} />}
          {state.screen === "connect" && <ConnectScreen app={this} />}
          {state.screen === "stream" && <StreamScreen app={this} />}
          {state.screen === "editor" && <EditorScreen app={this} />}
          {state.screen === "connection" && <ConnectionScreen app={this} />}
          {state.screen === "library" && <LibraryScreen app={this} />}
          <div className="ambient" />
          {state.screen === "afterStream" && <AfterStreamDialog app={this} />}
          {state.screen === "library" && state.sunshineLogin !== null && <SunshineLoginDialog app={this} />}
          <HintBar app={this} />
          {state.toast !== null && <ToastCard toast={state.toast} />}
        </div>
      </div>
    );
  }
}
