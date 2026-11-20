import React, { CSSProperties } from "react";
import { InputRouter } from "./input/InputRouter";
import { ModeText } from "./model/ModeText";
import { DeviceId, DeviceProfile, PadButton, Settings, StreamMode } from "./model/Types";
import { Backend } from "./services/Backend";
import { ConnectScreen } from "./views/ConnectScreen";
import { DetailScreen } from "./views/DetailScreen";
import { EditorRows } from "./views/EditorRows";
import { EditorScreen } from "./views/EditorScreen";
import { HintBar } from "./views/HintBar";
import { HomeScreen } from "./views/HomeScreen";
import { StreamScreen } from "./views/StreamScreen";
import { ToastCard, ToastContent } from "./views/ToastCard";

export type ScreenName = "home" | "detail" | "connect" | "stream" | "editor";

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
  hostState: HostState;
  hostError: string;
  toast: ToastContent | null;
  connectSteps: string[];
  connectStep: number;
  lastLaunchError: string;
  /** Editor state. */
  editDevice: DeviceId;
  editModeIndex: number;
  editZone: "modes" | "rows";
  editRow: number;
  bumps: Record<string, number>;
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
      hostState: "loading",
      hostError: "",
      toast: null,
      connectSteps: [],
      connectStep: 0,
      lastLaunchError: "",
      editDevice: "handheld",
      editModeIndex: 0,
      editZone: "modes",
      editRow: 0,
      bumps: {},
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
    this.reloadGames(settings);
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
    this.setState({ hostState: "loading", hostError: "" });
    try
    {
      const games = await this.backend.fetchGames(settings);
      this.setState((state) => ({
        games,
        hostState: "online",
        gameIndex: Math.min(state.gameIndex, Math.max(0, games.length - 1)),
      }));
    }
    catch (fetchError)
    {
      this.setState({ hostState: "error", hostError: String(fetchError) });
    }
  }

  // ---------------------------------------------------------------- toasts and timers

  private showToast(toast: ToastContent): void
  {
    this.toastTimers.forEach((timer) => window.clearTimeout(timer));
    this.setState({ toast: null });
    this.toastTimers =
    [
      window.setTimeout(() => this.setState({ toast }), 30),
      window.setTimeout(() => this.setState({ toast: null }), 1950),
    ];
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
      case "stream":
        // Moonlight owns the controller now; we come back via the "stream-ended" event.
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
        this.setState({ gameIndex: Math.max(0, state.gameIndex - 1) });
      }
      else if (button === "RIGHT")
      {
        this.setState({ gameIndex: Math.min(state.games.length - 1, state.gameIndex + 1) });
      }
      else if (button === "UP")
      {
        this.setState({ zone: "top" });
      }
      else if (button === "A")
      {
        this.openGame(state.gameIndex);
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
      this.reloadGames();
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
      "Verbinde mit " + this.settings.host,
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
        await this.backend.startStream(this.settings, gameName, profile, mode);
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
    this.setState({
      screen: "detail",
      lastLaunchError: failed ? "Moonlight beendet mit Code " + exitCode + (errorTail ? ": " + errorTail : "") : "",
    });
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
          {state.screen === "detail" && <DetailScreen app={this} />}
          {state.screen === "connect" && <ConnectScreen app={this} />}
          {state.screen === "stream" && <StreamScreen app={this} />}
          {state.screen === "editor" && <EditorScreen app={this} />}
          <div className="ambient" />
          <HintBar app={this} />
          {state.toast !== null && <ToastCard toast={state.toast} />}
        </div>
      </div>
    );
  }
}
