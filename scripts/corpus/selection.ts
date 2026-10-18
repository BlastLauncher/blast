// Pure selection rules for the curated corpus set (task 0023). The selector
// entry point (`select.ts`) feeds these functions the pinned corpus manifests
// and candidate sources; every rule here is static and deterministic, and the
// tests drive it with fixture manifests only, so the same corpus always
// selects the same extensions. Nothing here runs git, reads files or touches
// the network.
import { createHash } from "node:crypto";
import type { Source } from "./usage.ts";

/** Runtime dependencies the shared Blast dependency policy can provide. */
export const PROVIDED_DEPENDENCIES = ["@raycast/api", "@raycast/utils"] as const;

/** Hooks exported by the pinned `@raycast/utils` (2.3.2) that mark the utils stratum. */
export const UTILS_HOOKS = [
  "useAI",
  "useCachedPromise",
  "useCachedState",
  "useExec",
  "useFetch",
  "useForm",
  "useFrecencySorting",
  "useLocalStorage",
  "usePromise",
  "useSQL",
  "useStreamJSON",
] as const;

/**
 * Static source rules that reject a candidate. The curated commands run offline
 * against a deny-all broker, so anything that shells out, scripts another
 * application or writes to the filesystem would fail for reasons that say
 * nothing about Blast's API coverage.
 */
export const EXCLUSIONS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "child_process", pattern: /\bchild_process\b/ },
  { id: "applescript", pattern: /applescript|osascript|tell application/i },
  {
    id: "filesystem-write",
    pattern:
      /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rm|rmSync|rmdir|unlink|unlinkSync|rename|renameSync|copyFile|copyFileSync|truncate|truncateSync|chmod|chmodSync|symlink|symlinkSync|linkSync)\s*\(/,
  },
  // Raycast's native Swift bridge: an extension-specific module Blast can
  // never provide, so the same rule that rejects an unprovided npm dependency.
  { id: "native-module", pattern: /["']swift:/ },
];

/**
 * Static source rules that mark network access. A match does not reject a
 * candidate — the smoke run is offline either way — it only ranks it after
 * every candidate that never talks to a network.
 */
export const NETWORK_PATTERNS: readonly RegExp[] = [
  /\bfetch\s*\(/,
  /\baxios\b/,
  /XMLHttpRequest/,
  /\bhttps?\.(?:get|request)\s*\(/,
  /["'](?:node:)?https?["']/,
  /\buseFetch\b/,
  /\buseStreamJSON\b/,
];

const FORM_PATTERN = /<Form[\s/>.]|\bAction\.SubmitForm\b/;
const DETAIL_PATTERN = /<Detail[\s/>.]|\bList\.Item\.Detail\b/;
const LIST_PATTERN = /<List[\s/>.]/;
const UTILS_IMPORT_PATTERN = /from\s+["']@raycast\/utils["']/;
const UTILS_HOOK_PATTERN = new RegExp(`\\b(?:${UTILS_HOOKS.join("|")})\\s*[({<]`);

export type ManifestCommand = { name?: string; mode?: string };
export type Manifest = {
  commands?: ManifestCommand[];
  dependencies?: Record<string, unknown>;
};

/** `view` is Raycast's default mode, so a command without one counts as a view. */
export function viewCommands(manifest: Manifest): string[] {
  return (manifest.commands ?? [])
    .filter((command) => typeof command?.name === "string" && (command.mode ?? "view") === "view")
    .map((command) => command.name as string)
    .toSorted();
}

export function unprovidedDependencies(
  manifest: Manifest,
  provided: readonly string[] = PROVIDED_DEPENDENCIES,
): string[] {
  return Object.keys(manifest.dependencies ?? {})
    .filter((name) => !provided.includes(name))
    .toSorted();
}

/** Manifest-level verdict; source-level rules are applied by `analyzeSources`. */
export function manifestRejections(manifest: Manifest): string[] {
  const rejections: string[] = [];
  const unprovided = unprovidedDependencies(manifest);
  if (unprovided.length > 0) rejections.push(`unprovided dependencies: ${unprovided.join(", ")}`);
  if (viewCommands(manifest).length === 0) rejections.push("no view command");
  return rejections;
}

export function exclusionIds(sources: Iterable<Source>): string[] {
  const found = new Set<string>();
  for (const { source } of sources) {
    for (const { id, pattern } of EXCLUSIONS) if (pattern.test(source)) found.add(id);
  }
  return [...found].toSorted();
}

export function usesNetwork(sources: Iterable<Source>): boolean {
  for (const { source } of sources) {
    if (NETWORK_PATTERNS.some((pattern) => pattern.test(source))) return true;
  }
  return false;
}

function usesUtilsHook(sources: Iterable<Source>): boolean {
  for (const { source } of sources) {
    if (UTILS_IMPORT_PATTERN.test(source) && UTILS_HOOK_PATTERN.test(source)) return true;
  }
  return false;
}

/**
 * How one extension renders its commands. The strata are exclusive and ordered
 * by how much the smoke run learns from them: a Form or Detail command
 * exercises components, a utils hook exercises the shared dependency, and
 * `list-only` is the baseline the first curated set already covers.
 */
export type Stratum = "form" | "detail" | "utils" | "list-only" | "none";

export function stratumOf(sources: Source[]): Stratum {
  const text = sources.map(({ source }) => source).join("\n");
  if (FORM_PATTERN.test(text)) return "form";
  if (DETAIL_PATTERN.test(text)) return "detail";
  if (usesUtilsHook(sources)) return "utils";
  if (LIST_PATTERN.test(text)) return "list-only";
  return "none";
}

export type Candidate = {
  name: string;
  viewCommands: string[];
  exclusions: string[];
  network: boolean;
  stratum: Stratum;
};

export function analyzeSources(name: string, views: string[], sources: Source[]): Candidate {
  return {
    name,
    viewCommands: views,
    exclusions: exclusionIds(sources),
    network: usesNetwork(sources),
    stratum: stratumOf(sources),
  };
}

export function eligible(candidate: Candidate): boolean {
  return (
    candidate.exclusions.length === 0 &&
    candidate.stratum !== "none" &&
    candidate.viewCommands.length > 0
  );
}

/** The deterministic pick order: name hash ascending. */
export function rank(name: string): string {
  return createHash("sha256").update(name).digest("hex");
}

/** Preferences first (offline before network), then the name hash. */
export function ranked(candidates: Candidate[]): Candidate[] {
  return [...candidates].toSorted(
    (a, b) =>
      Number(a.network) - Number(b.network) ||
      rank(a.name).localeCompare(rank(b.name)) ||
      a.name.localeCompare(b.name),
  );
}

export const STRATA = ["form", "detail", "utils", "list-only"] as const;
/** Every stratum the selector can pick for; `none` never is one. */
export type PickStratum = (typeof STRATA)[number];
export type Quotas = Record<PickStratum, number>;

/**
 * The target mix for the curated set: about 40 extensions. The ten extensions
 * kept from the first curated set are all List-centric, so they already fill
 * the `list-only` quota and only the three new strata have to be picked.
 */
export const DEFAULT_QUOTAS: Quotas = { form: 10, detail: 10, utils: 10, "list-only": 10 };

/**
 * The first curated set (task 0014), always first in `curated`. It is
 * List-centric, so it already fills the `list-only` quota, and it is fixed
 * here rather than read back from `compat/corpus.json` so the selection stays
 * a pure function of the corpus pin: running the selector twice reproduces
 * the same file.
 */
export const KEPT_CURATED = [
  "fibonacci-sequence",
  "ohmyzsh-git-alias",
  "axios-docs",
  "radix",
  "px-to-rem-converter",
  "ratio-calculator",
  "code-review-emojis",
  "biaodian",
  "markdown-reference",
  "conventional-commits",
];

/** Candidates whose sources are checked out per sparse-checkout batch. */
export const SCAN_BATCH = 64;

/**
 * How far the selector reads looking for candidates that never use a network:
 * an upper bound on the checkout, not a target. Candidates are scanned in rank
 * order, so a larger cap only reaches further down the same list.
 */
export const SCAN_CAP = 768;

export type Selection = {
  /** The extensions kept from the previous set, always first in `curated`. */
  kept: string[];
  /** New picks per stratum, in rank order. */
  picks: Record<PickStratum, string[]>;
  curated: string[];
  /** How many picks each stratum is still short of its quota. */
  missing: Record<PickStratum, number>;
};

export function selectCurated(
  kept: string[],
  candidates: Candidate[],
  quotas: Quotas = DEFAULT_QUOTAS,
): Selection {
  const order = ranked(
    candidates.filter((candidate) => eligible(candidate) && !kept.includes(candidate.name)),
  );
  const picks: Record<PickStratum, string[]> = { form: [], detail: [], utils: [], "list-only": [] };
  const missing: Record<PickStratum, number> = { form: 0, detail: 0, utils: 0, "list-only": 0 };
  for (const stratum of STRATA) {
    const room = quotas[stratum] - (stratum === "list-only" ? kept.length : 0);
    for (const candidate of order) {
      if (picks[stratum].length >= room) break;
      if (candidate.stratum === stratum) picks[stratum].push(candidate.name);
    }
    missing[stratum] = Math.max(0, room - picks[stratum].length);
  }
  return {
    kept,
    picks,
    curated: [...kept, ...STRATA.flatMap((stratum) => picks[stratum])],
    missing,
  };
}

/** Every member of each stratum, including the kept extensions. */
export function strataMembers(selection: Selection): Record<PickStratum, string[]> {
  return {
    form: [...selection.picks.form],
    detail: [...selection.picks.detail],
    utils: [...selection.picks.utils],
    "list-only": [...selection.kept, ...selection.picks["list-only"]],
  };
}

/** Eligible candidates per stratum, split by whether they reach a network. */
export function capacity(candidates: Candidate[], network: boolean): Record<PickStratum, number> {
  const counts: Record<PickStratum, number> = { form: 0, detail: 0, utils: 0, "list-only": 0 };
  for (const candidate of candidates) {
    if (candidate.stratum === "none" || candidate.network !== network) continue;
    if (eligible(candidate)) counts[candidate.stratum] += 1;
  }
  return counts;
}

/** True once every quota can be filled from candidates that never use a network. */
export function offlineQuotasMet(
  kept: string[],
  candidates: Candidate[],
  quotas: Quotas = DEFAULT_QUOTAS,
): boolean {
  const offline = capacity(candidates, false);
  return STRATA.every(
    (stratum) => offline[stratum] >= quotas[stratum] - (stratum === "list-only" ? kept.length : 0),
  );
}

/** What `compat/corpus.json` records about the selection; JSON-serializable. */
export const SELECTION_CRITERIA = {
  script: "scripts/corpus/select.ts",
  dependencies: [...PROVIDED_DEPENDENCIES],
  minViewCommands: 1,
  excludedSources: EXCLUSIONS.map(({ id }) => id),
  preferred: "no network access (fetch, axios, http(s), useFetch, useStreamJSON)",
  order: "sha256(name) ascending; candidates without network access are picked first",
  quotas: DEFAULT_QUOTAS,
  scan: { batch: SCAN_BATCH, cap: SCAN_CAP },
  note: "the list-only quota is already met by the extensions kept from the first curated set",
};

export type PinStats = { scanned: number; eligible: number };

/** The committed `compat/corpus.json`: the pin plus how the set was chosen. */
export function renderPin(
  base: { repository: string; commit: string },
  selection: Selection,
  stats: PinStats,
): string {
  return `${JSON.stringify(
    {
      repository: base.repository,
      commit: base.commit,
      curated: selection.curated,
      selection: {
        criteria: SELECTION_CRITERIA,
        strata: strataMembers(selection),
        scanned: stats.scanned,
        eligible: stats.eligible,
      },
    },
    null,
    2,
  )}\n`;
}
