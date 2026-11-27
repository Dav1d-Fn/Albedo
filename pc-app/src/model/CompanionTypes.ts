/** One item of GET /api/library (companion/API.md). */
export interface LibraryEntry
{
  id: string;
  name: string;
  group: string;
  detectedGroup: string;
  customGroup: boolean;
  hasCover: boolean;
  /** The cover is only a card made from the program's icon. */
  coverIsIcon?: boolean;
  hasHero: boolean;
  hasLogo: boolean;
  inSunshine: boolean;
  customArt: string[];
  system: string | null;
}

export interface Library
{
  entries: LibraryEntry[];
  sunshineProblem: string | null;
}

/** Version and self-update state (`GET /api/update`). */
export interface UpdateStatus
{
  version: string;
  apiVersion: number;
  state: "idle" | "available" | "postponed" | "downloading" | "installing" | "restarting" | "failed" | "unsupported";
  available: { version: string; notes: string } | null;
  progress: { downloaded: number; total: number | null } | null;
  message: string;
}

export interface Health
{
  name: string;
  version: string;
  host: string;
}

export interface DisplayMode
{
  width: number;
  height: number;
  refreshRate: number;
}

export type DisplayRouteTarget = "virtual" | "dummy" | "main";

/** One way a stream can show on the PC (`routes` of GET /api/display-modes). */
export interface DisplayRoute
{
  target: DisplayRouteTarget;
  output: string;
  connected: boolean;
  canAddModes: boolean;
  modes: DisplayMode[];
}

/** One connector the desktop reports, with or without monitor. */
export interface DisplayOutputInfo
{
  name: string;
  connected: boolean;
  enabled: boolean;
  primary: boolean;
  modes: DisplayMode[];
}

export interface DisplayModes
{
  backend: string;
  /** What "Automatic" picks right now. */
  defaultTarget: DisplayRouteTarget | "none";
  routes: DisplayRoute[];
  /** The connectors in ~/.config/sunshine-match-client.conf, null = not set. */
  setup: { virtual: string | null; dummy: string | null; main: string | null };
  outputs: DisplayOutputInfo[];
  /** The default route's output and modes, "" / [] without one. */
  output: string;
  modes: DisplayMode[];
}

/** GET /api/display-test: the switch test of one route. */
export interface DisplayTestStatus
{
  state: "idle" | "switching" | "showing" | "restoring" | "done" | "unchanged" | "failed";
  target?: DisplayRouteTarget;
  mode?: string;
  output?: string;
  secondsLeft?: number;
  message?: string;
  dryRun?: boolean;
}

/** GET /api/display-modes/request: adding a mode to the virtual monitor's EDID. */
export interface ModeRequestStatus
{
  state: "idle" | "waiting" | "done" | "reboot" | "cancelled" | "failed" | "dryRun";
  mode?: string;
  message?: string;
}

export interface PairedClient
{
  uuid: string;
  name: string;
}

export interface PendingPairing
{
  id: string;
  name: string;
  address: string;
}

/** One result of the picture search (src-tauri/src/art_candidate.rs). */
export interface ArtCandidate
{
  imageUrl: string;
  thumbnailUrl: string;
  source: string;
  label: string;
}

export interface ArtSearchResult
{
  candidates: ArtCandidate[];
  problem: string | null;
}

export type ArtKind = "cover" | "hero" | "logo";
