import { Component } from "react";
import { UiText } from "./i18n/UiText";
import { AppSettings, AppSettingsValues } from "./model/AppSettings";
import {
  ArtKind,
  ArtSearchResult,
  DisplayModes,
  Health,
  Library,
  LibraryEntry,
  PairedClient,
  PendingPairing,
} from "./model/CompanionTypes";
import { Companion } from "./services/Companion";
import { ArtDialog } from "./views/ArtDialog";
import { DevicesScreen } from "./views/DevicesScreen";
import { LibraryScreen } from "./views/LibraryScreen";
import { Sidebar } from "./views/Sidebar";
import { StatusScreen } from "./views/StatusScreen";
import { Toast } from "./views/Toast";

export type Screen = "library" | "devices" | "status";

/** Chip filters besides the groups. */
export const FILTER_ALL = "\u0000all";
export const FILTER_IN_SUNSHINE = "\u0000sunshine";

export interface ArtDialogState
{
  kind: ArtKind;
  query: string;
  searching: boolean;
  result: ArtSearchResult | null;
  /** "" = every source. */
  sourceFilter: string;
  selectedUrl: string | null;
  busy: boolean;
  dragOver: boolean;
}

export interface LibrarySection
{
  group: string;
  custom: boolean;
  entries: LibraryEntry[];
  inSunshineCount: number;
  totalInGroup: number;
}

export interface PcAppState
{
  screen: Screen;
  settings: AppSettingsValues;
  health: Health | null;
  companionDown: boolean;
  library: Library | null;
  displayModes: DisplayModes | null;
  groupFilter: string;
  searchText: string;
  selectedId: string | null;
  groupMenuOpen: boolean;
  newGroupName: string;
  busy: boolean;
  /** Goes up after every picture change, part of the picture URLs. */
  artVersion: number;
  artDialog: ArtDialogState | null;
  clients: PairedClient[] | null;
  /** Null when Sunshine has no list of waiting devices. */
  pairings: PendingPairing[] | null;
  selectedPairingId: string | null;
  pin: string;
  deviceName: string;
  confirmUnpairUuid: string | null;
  loginUser: string;
  loginPassword: string;
  toast: { text: string; error: boolean } | null;
  /** Result of the last SteamGridDB key check: "" = not checked, "checking", "ok", or the error. */
  steamGridDbKeyCheck: string;
}

/** Root of the PC app: owns all state and every action; the views only render and call these methods. */
export default class PcApp extends Component<object, PcAppState>
{
  private static readonly PAIRING_POLL_MILLISECONDS = 2000;
  private static readonly TOAST_MILLISECONDS = 4000;

  private static readonly KEY_CHECK_DELAY_MILLISECONDS = 800;

  private pairingPollTimer: number | undefined;
  private keyCheckTimer: number | undefined;
  private toastTimer: number | undefined;

  public constructor(props: object)
  {
    super(props);
    this.state =
    {
      screen: "library",
      settings: AppSettings.load(),
      health: null,
      companionDown: false,
      library: null,
      displayModes: null,
      groupFilter: FILTER_ALL,
      searchText: "",
      selectedId: null,
      groupMenuOpen: false,
      newGroupName: "",
      busy: false,
      artVersion: Date.now(),
      artDialog: null,
      clients: null,
      pairings: null,
      selectedPairingId: null,
      pin: "",
      deviceName: "Steam Deck",
      confirmUnpairUuid: null,
      loginUser: "",
      loginPassword: "",
      toast: null,
      steamGridDbKeyCheck: "",
    };
    UiText.use(this.state.settings.language);
  }

  public componentDidMount(): void
  {
    void Companion.setLanguage(UiText.language).then(() => this.reloadAll());
  }

  public componentWillUnmount(): void
  {
    window.clearInterval(this.pairingPollTimer);
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.keyCheckTimer);
  }

  public render()
  {
    UiText.use(this.state.settings.language);
    return (
      <div className="win" onClick={() => this.closeGroupMenu()}>
        <Sidebar app={this} state={this.state} />
        {this.state.screen === "library" && <LibraryScreen app={this} state={this.state} />}
        {this.state.screen === "devices" && <DevicesScreen app={this} state={this.state} />}
        {this.state.screen === "status" && <StatusScreen app={this} state={this.state} />}
        {this.state.artDialog && <ArtDialog app={this} state={this.state} dialog={this.state.artDialog} />}
        {this.state.toast && <Toast text={this.state.toast.text} error={this.state.toast.error} />}
      </div>
    );
  }

  // ------------------------------------------------------------ loading

  public async reloadAll(): Promise<void>
  {
    try
    {
      const health = await Companion.health();
      this.setState({ health, companionDown: false });
    }
    catch
    {
      this.setState({ health: null, companionDown: true });
      return;
    }
    await Promise.all([this.reloadLibrary(), this.reloadDisplayModes()]);
  }

  public async reloadLibrary(): Promise<void>
  {
    try
    {
      const library = await Companion.library();
      const selectedStillThere = library.entries.some((entry) => entry.id === this.state.selectedId);
      this.setState({
        library,
        companionDown: false,
        selectedId: selectedStillThere ? this.state.selectedId : (library.entries[0]?.id ?? null),
      });
    }
    catch (error)
    {
      this.showError(error);
    }
  }

  private async reloadDisplayModes(): Promise<void>
  {
    try
    {
      this.setState({ displayModes: await Companion.displayModes() });
    }
    catch
    {
      this.setState({ displayModes: null });
    }
  }

  // ------------------------------------------------------------ navigation

  public showScreen(screen: Screen): void
  {
    window.clearInterval(this.pairingPollTimer);
    this.setState({ screen, confirmUnpairUuid: null });
    if (screen === "status")
    {
      void this.checkSteamGridDbKey();
    }
    if (screen === "devices")
    {
      void this.reloadDevices();
      this.pairingPollTimer = window.setInterval(() => void this.reloadPairings(), PcApp.PAIRING_POLL_MILLISECONDS);
    }
  }

  // ------------------------------------------------------------ library

  public setGroupFilter(groupFilter: string): void
  {
    this.setState({ groupFilter });
  }

  public setSearchText(searchText: string): void
  {
    this.setState({ searchText });
  }

  public selectEntry(entryId: string): void
  {
    this.setState({ selectedId: entryId, groupMenuOpen: false, newGroupName: "" });
  }

  public selectedEntry(): LibraryEntry | null
  {
    return this.state.library?.entries.find((entry) => entry.id === this.state.selectedId) ?? null;
  }

  /** Every group in the order the companion sorts them. */
  public groups(): string[]
  {
    const groups: string[] = [];
    for (const entry of this.state.library?.entries ?? [])
    {
      if (!groups.includes(entry.group))
      {
        groups.push(entry.group);
      }
    }
    return groups;
  }

  /** Groups the group menu offers: the shown ones plus detected groups no entry is in any more. */
  public groupChoices(): string[]
  {
    const choices = this.groups();
    for (const entry of this.state.library?.entries ?? [])
    {
      if (!choices.includes(entry.detectedGroup))
      {
        choices.push(entry.detectedGroup);
      }
    }
    return choices;
  }

  /** Groups a user created: they appear on entries only as a changed group, never as a detected one. */
  public isOwnGroup(group: string): boolean
  {
    const entries = this.state.library?.entries ?? [];
    return !entries.some((entry) => entry.detectedGroup === group);
  }

  public entriesInGroup(group: string): LibraryEntry[]
  {
    return (this.state.library?.entries ?? []).filter((entry) => entry.group === group);
  }

  /** What the grid shows: the chip filter and the search applied, grouped. */
  public visibleSections(): LibrarySection[]
  {
    const searchWords = this.state.searchText.toLowerCase().split(/\s+/).filter((word) => word.length > 0);
    const sections: LibrarySection[] = [];
    for (const group of this.groups())
    {
      const groupEntries = this.entriesInGroup(group);
      const groupMatches = this.state.groupFilter === FILTER_ALL
        || this.state.groupFilter === FILTER_IN_SUNSHINE
        || this.state.groupFilter === group;
      if (!groupMatches)
      {
        continue;
      }
      const shownEntries = groupEntries.filter((entry) =>
      {
        const sunshineMatches = this.state.groupFilter !== FILTER_IN_SUNSHINE || entry.inSunshine;
        const lowerName = entry.name.toLowerCase();
        return sunshineMatches && searchWords.every((word) => lowerName.includes(word));
      });
      if (shownEntries.length > 0)
      {
        sections.push({
          group,
          custom: this.isOwnGroup(group),
          entries: shownEntries,
          inSunshineCount: groupEntries.filter((entry) => entry.inSunshine).length,
          totalInGroup: groupEntries.length,
        });
      }
    }
    return sections;
  }

  public async addSelectedToSunshine(): Promise<void>
  {
    const entry = this.selectedEntry();
    if (!entry)
    {
      return;
    }
    await this.runBusy(async () =>
    {
      const appName = await Companion.addApp(entry.id);
      this.showToast(UiText.current.entry.added(appName));
      await this.reloadLibrary();
    });
  }

  public async removeSelectedFromSunshine(): Promise<void>
  {
    const entry = this.selectedEntry();
    if (!entry)
    {
      return;
    }
    await this.runBusy(async () =>
    {
      await Companion.removeApp(entry.name);
      this.showToast(UiText.current.entry.removed(entry.name));
      await this.reloadLibrary();
    });
  }

  // ------------------------------------------------------------ group of the selected entry

  public toggleGroupMenu(): void
  {
    this.setState({ groupMenuOpen: !this.state.groupMenuOpen, newGroupName: "" });
  }

  public closeGroupMenu(): void
  {
    if (this.state.groupMenuOpen)
    {
      this.setState({ groupMenuOpen: false });
    }
  }

  public setNewGroupName(newGroupName: string): void
  {
    this.setState({ newGroupName });
  }

  /** null = back to the detected group. */
  public async moveSelectedToGroup(group: string | null): Promise<void>
  {
    const entry = this.selectedEntry();
    const trimmedGroup = group?.trim() ?? null;
    if (!entry || trimmedGroup === "")
    {
      return;
    }
    this.setState({ groupMenuOpen: false, newGroupName: "" });
    await this.runBusy(async () =>
    {
      await Companion.setGroup(entry.id, trimmedGroup);
      this.showToast(UiText.current.entry.groupChanged(trimmedGroup ?? entry.detectedGroup));
      await this.reloadLibrary();
    });
  }

  // ------------------------------------------------------------ pictures

  public pictureUrl(kind: ArtKind, entryId: string): string
  {
    return Companion.pictureUrl(kind, entryId, this.state.artVersion);
  }

  public async resetPicture(kind: ArtKind): Promise<void>
  {
    const entry = this.selectedEntry();
    if (!entry)
    {
      return;
    }
    await this.runBusy(async () =>
    {
      await Companion.resetArt(entry.id, kind);
      this.showToast(UiText.current.entry.resetDone(UiText.current.artKinds[kind]));
      await this.afterPictureChange();
    });
  }

  public openArtDialog(kind: ArtKind = "cover"): void
  {
    const entry = this.selectedEntry();
    if (!entry)
    {
      return;
    }
    this.setState({
      artDialog: {
        kind,
        query: entry.name,
        searching: false,
        result: null,
        sourceFilter: "",
        selectedUrl: null,
        busy: false,
        dragOver: false,
      },
    }, () => void this.searchArt());
  }

  public closeArtDialog(): void
  {
    this.setState({ artDialog: null });
  }

  public setArtKind(kind: ArtKind): void
  {
    this.updateArtDialog({ kind, result: null, selectedUrl: null, sourceFilter: "" });
    window.setTimeout(() => void this.searchArt());
  }

  public setArtQuery(query: string): void
  {
    this.updateArtDialog({ query });
  }

  public setArtSourceFilter(sourceFilter: string): void
  {
    this.updateArtDialog({ sourceFilter });
  }

  public selectArtCandidate(imageUrl: string): void
  {
    this.updateArtDialog({ selectedUrl: imageUrl });
  }

  public setArtDragOver(dragOver: boolean): void
  {
    if (this.state.artDialog?.dragOver !== dragOver)
    {
      this.updateArtDialog({ dragOver });
    }
  }

  public async searchArt(): Promise<void>
  {
    const entry = this.selectedEntry();
    const dialog = this.state.artDialog;
    if (!entry || !dialog)
    {
      return;
    }
    this.updateArtDialog({ searching: true, selectedUrl: null });
    // The exact Steam game only while the search text is still the entry's name.
    const entryIdForSearch = dialog.query === entry.name ? entry.id : "";
    let result: ArtSearchResult;
    try
    {
      result = await Companion.searchArt(dialog.query, entryIdForSearch, entry.system, dialog.kind, this.state.settings.steamGridDbKey);
    }
    catch (error)
    {
      result = { candidates: [], problem: String(error) };
    }
    this.updateArtDialog({ searching: false, result });
  }

  public async applySelectedArt(): Promise<void>
  {
    const entry = this.selectedEntry();
    const dialog = this.state.artDialog;
    if (!entry || !dialog?.selectedUrl)
    {
      return;
    }
    const imageUrl = dialog.selectedUrl;
    await this.runArtUpload(() => Companion.applyArt(entry.id, dialog.kind, imageUrl));
  }

  /** A file from the file picker or dropped onto the dialog. */
  public async uploadArtFile(file: File | undefined): Promise<void>
  {
    this.setArtDragOver(false);
    const entry = this.selectedEntry();
    const dialog = this.state.artDialog;
    if (!entry || !dialog || !file)
    {
      return;
    }
    if (!file.type.startsWith("image/"))
    {
      this.showToast(UiText.current.art.notAnImage, true);
      return;
    }
    if (file.size > 15 * 1024 * 1024)
    {
      this.showToast(UiText.current.art.tooLarge, true);
      return;
    }
    const imageBytes = await file.arrayBuffer();
    await this.runArtUpload(() => Companion.uploadArt(entry.id, dialog.kind, imageBytes));
  }

  public async resetArtFromDialog(): Promise<void>
  {
    const dialog = this.state.artDialog;
    if (dialog)
    {
      // Stays open: the automatic picture shows up as the current one right away.
      await this.resetPicture(dialog.kind);
    }
  }

  private async runArtUpload(upload: () => Promise<void>): Promise<void>
  {
    const kind = this.state.artDialog?.kind ?? "cover";
    this.updateArtDialog({ busy: true });
    try
    {
      await upload();
      // The dialog stays open on the same game, so the next kind (cover, title art, logo) is one click away.
      this.updateArtDialog({ busy: false, selectedUrl: null });
      this.showToast(UiText.current.art.applied(UiText.current.artKinds[kind]));
      await this.afterPictureChange();
    }
    catch (error)
    {
      this.updateArtDialog({ busy: false });
      this.showError(error);
    }
  }

  private async afterPictureChange(): Promise<void>
  {
    this.setState({ artVersion: Date.now() });
    await this.reloadLibrary();
  }

  private updateArtDialog(change: Partial<ArtDialogState>): void
  {
    this.setState((previous) => ({
      artDialog: previous.artDialog ? { ...previous.artDialog, ...change } : null,
    }));
  }

  // ------------------------------------------------------------ devices

  public async reloadDevices(): Promise<void>
  {
    await this.reloadPairings();
    try
    {
      this.setState({ clients: await Companion.pairedClients() });
    }
    catch (error)
    {
      this.setState({ clients: null });
      this.showError(error);
    }
  }

  private async reloadPairings(): Promise<void>
  {
    const pairings = await Companion.pendingPairings();
    const selectedStillWaiting = pairings?.some((pairing) => pairing.id === this.state.selectedPairingId) ?? false;
    let selectedPairingId = selectedStillWaiting ? this.state.selectedPairingId : null;
    if (!selectedPairingId && pairings && pairings.length === 1)
    {
      selectedPairingId = pairings[0].id;
    }
    const pickedPairing = pairings?.find((pairing) => pairing.id === selectedPairingId);
    const deviceNameUntouched = this.state.deviceName === "Steam Deck" || this.state.deviceName === "";
    this.setState({
      pairings,
      selectedPairingId,
      deviceName: pickedPairing?.name && deviceNameUntouched ? pickedPairing.name : this.state.deviceName,
    });
  }

  public selectPairing(pairingId: string): void
  {
    this.setState({ selectedPairingId: pairingId });
  }

  public setPin(pin: string): void
  {
    this.setState({ pin: pin.replace(/\D/g, "").slice(0, 4) });
  }

  public setDeviceName(deviceName: string): void
  {
    this.setState({ deviceName });
  }

  public async pair(): Promise<void>
  {
    const deviceName = this.state.deviceName.trim() || "Moonlight";
    await this.runBusy(async () =>
    {
      await Companion.pair(this.state.pin, deviceName, this.state.selectedPairingId);
      this.setState({ pin: "" });
      this.showToast(UiText.current.devices.paired(deviceName));
      await this.reloadDevices();
    });
  }

  /** First press asks, the second removes. */
  public async unpair(client: PairedClient): Promise<void>
  {
    if (this.state.confirmUnpairUuid !== client.uuid)
    {
      this.setState({ confirmUnpairUuid: client.uuid });
      return;
    }
    this.setState({ confirmUnpairUuid: null });
    await this.runBusy(async () =>
    {
      await Companion.unpair(client.uuid);
      this.showToast(UiText.current.devices.unpaired(client.name));
      await this.reloadDevices();
    });
  }

  public cancelUnpair(): void
  {
    this.setState({ confirmUnpairUuid: null });
  }

  // ------------------------------------------------------------ status and settings

  public setLoginUser(loginUser: string): void
  {
    this.setState({ loginUser });
  }

  public setLoginPassword(loginPassword: string): void
  {
    this.setState({ loginPassword });
  }

  public async saveSunshineLogin(): Promise<void>
  {
    await this.runBusy(async () =>
    {
      await Companion.setSunshineLogin(this.state.loginUser.trim(), this.state.loginPassword);
      this.setState({ loginPassword: "" });
      this.showToast(UiText.current.status.loginSaved);
      await this.reloadLibrary();
    });
  }

  public changeSettings(change: Partial<AppSettingsValues>): void
  {
    const settings = { ...this.state.settings, ...change };
    AppSettings.save(settings);
    UiText.use(settings.language);
    this.setState({ settings });
    if (change.steamGridDbKey !== undefined)
    {
      // Checked once typing pauses, not on every key press.
      window.clearTimeout(this.keyCheckTimer);
      this.setState({ steamGridDbKeyCheck: "" });
      this.keyCheckTimer = window.setTimeout(() => void this.checkSteamGridDbKey(), PcApp.KEY_CHECK_DELAY_MILLISECONDS);
    }
    if (change.language !== undefined)
    {
      // Names, groups and errors from the companion come in the new language, so a group filter
      // ("Nicht-Steam" → "Non-Steam") would no longer match.
      this.setState({ groupFilter: FILTER_ALL });
      void Companion.setLanguage(UiText.language).then(() => this.reloadAll());
    }
  }

  /** One real request through the companion; the result shows under the key field. */
  public async checkSteamGridDbKey(): Promise<void>
  {
    const key = this.state.settings.steamGridDbKey;
    if (key === "")
    {
      this.setState({ steamGridDbKeyCheck: "" });
      return;
    }
    this.setState({ steamGridDbKeyCheck: "checking" });
    let result: string;
    try
    {
      await Companion.testSteamGridDbKey(key);
      result = "ok";
    }
    catch (error)
    {
      result = String(error);
    }
    // A newer key may have been typed meanwhile; only its own check counts.
    if (this.state.settings.steamGridDbKey === key)
    {
      this.setState({ steamGridDbKeyCheck: result });
    }
  }

  public openSteamGridDbKeyPage(): void
  {
    void Companion.openSteamGridDbKeyPage();
  }

  // ------------------------------------------------------------ helpers

  private async runBusy(action: () => Promise<void>): Promise<void>
  {
    if (this.state.busy)
    {
      return;
    }
    this.setState({ busy: true });
    try
    {
      await action();
    }
    catch (error)
    {
      this.showError(error);
    }
    finally
    {
      this.setState({ busy: false });
    }
  }

  private showError(error: unknown): void
  {
    this.showToast(String(error), true);
  }

  private showToast(text: string, error: boolean = false): void
  {
    window.clearTimeout(this.toastTimer);
    this.setState({ toast: { text, error } });
    this.toastTimer = window.setTimeout(() => this.setState({ toast: null }), PcApp.TOAST_MILLISECONDS);
  }
}
