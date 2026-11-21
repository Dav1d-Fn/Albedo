/** One item of GET /api/library (companion/API.md). */
export interface LibraryEntry
{
  id: string;
  name: string;
  group: string;
  detectedGroup: string;
  customGroup: boolean;
  hasCover: boolean;
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

export interface DisplayModes
{
  output: string;
  modes: DisplayMode[];
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
