// Pure selection rules for the curated corpus set (tasks 0023 and 0033). The
// selector entry point (`select.ts`) feeds these functions the pinned corpus
// manifests and candidate sources; every rule here is static and
// deterministic, and the tests drive it with fixture manifests only, so the
// same corpus always selects the same extensions. Nothing here runs git, reads
// files or touches the network.
//
// Two kinds of stratum share the pick loop. The exclusive `Stratum` (form,
// detail, utils, list-only) classifies a whole extension once and keeps the
// first 40 picks unchanged; the additive `FeatureStratum` (task 0033) tags
// extensions that use a harder component or API without reclassifying them,
// so adding the new strata never moves an earlier pick.
import { createHash } from "node:crypto";
// The specifier rules live in `imports.ts` so the dependency scan reads the
// same ones rather than a copy of the regex.
import { unprovidedImports } from "./imports.ts";
import type { Source } from "./imports.ts";

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
 * The exclusion the import rules cannot express as a source pattern: a manifest
 * can declare only `@raycast/api` and `@raycast/utils` and still import
 * something else (or a tsconfig path alias), which bundles as a missing
 * dependency. That is a selection miss, not an API gap, so those candidates
 * are rejected too.
 */
export const IMPORT_EXCLUSION = "unprovided-import";

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

// Feature patterns (task 0033). Each one names a component or API the first 40
// picks do not reach, so the smoke report keeps finding real gaps.
const GRID_PATTERN = /<Grid[\s/>.]/;
const MENU_BAR_PATTERN = /<MenuBarExtra[\s/>.]/;
/**
 * `ActionPanel.Submenu`, or an `Action.*` variant the first curated set does
 * not already exercise: CopyToClipboard, OpenInBrowser, Paste, Push and
 * SubmitForm are covered (SubmitForm by the Form strata), so the selector looks
 * past exactly those five.
 */
const ACTION_VARIANT_PATTERN =
  /<ActionPanel\.Submenu[\s/>.]|<Action\.(?!CopyToClipboard\b|OpenInBrowser\b|Paste\b|Push\b|SubmitForm\b)[A-Z]\w*/;
const SELECTION_API_PATTERN =
  /\b(?:getSelectedText|getSelectedFinderItems)\s*\(|Form\.FilePicker\b/;

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
  const list = [...sources];
  for (const { source } of list) {
    for (const { id, pattern } of EXCLUSIONS) if (pattern.test(source)) found.add(id);
  }
  if (unprovidedImports(list).length > 0) found.add(IMPORT_EXCLUSION);
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

/**
 * The additive strata: extension-level tags for the harder components and APIs
 * (task 0033). They are matched independently of `Stratum`, in the fixed order
 * below, and a candidate can carry several.
 */
export const FEATURE_STRATA = ["grid", "menu-bar", "action-variants", "selection-apis"] as const;
export type FeatureStratum = (typeof FEATURE_STRATA)[number];

export function featuresOf(sources: Iterable<Source>): FeatureStratum[] {
  const text = [...sources].map(({ source }) => source).join("\n");
  const features: FeatureStratum[] = [];
  if (GRID_PATTERN.test(text)) features.push("grid");
  if (MENU_BAR_PATTERN.test(text)) features.push("menu-bar");
  if (ACTION_VARIANT_PATTERN.test(text)) features.push("action-variants");
  if (SELECTION_API_PATTERN.test(text)) features.push("selection-apis");
  return features;
}

export type Candidate = {
  name: string;
  viewCommands: string[];
  exclusions: string[];
  network: boolean;
  stratum: Stratum;
  /** Additive strata the extension's sources match, in `FEATURE_STRATA` order. */
  features: FeatureStratum[];
};

export function analyzeSources(name: string, views: string[], sources: Source[]): Candidate {
  return {
    name,
    viewCommands: views,
    exclusions: exclusionIds(sources),
    network: usesNetwork(sources),
    stratum: stratumOf(sources),
    features: featuresOf(sources),
  };
}

export function eligible(candidate: Candidate): boolean {
  return (
    candidate.exclusions.length === 0 &&
    candidate.viewCommands.length > 0 &&
    (candidate.stratum !== "none" || candidate.features.length > 0)
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
/** An exclusive stratum name (as opposed to `Stratum`, which also has `none`). */
export type ExclusiveStratum = Exclude<Stratum, "none">;
/** Every stratum the selector picks for: the exclusive four, then the additive ones. */
export const PICK_STRATA = [...STRATA, ...FEATURE_STRATA] as const;
export type PickStratum = (typeof PICK_STRATA)[number];
export type Quotas = Record<PickStratum, number>;

export function isFeatureStratum(stratum: PickStratum): stratum is FeatureStratum {
  return (FEATURE_STRATA as readonly string[]).includes(stratum);
}

/** Whether a candidate answers a pick stratum: exclusive by view, additive by feature. */
export function matchesStratum(candidate: Candidate, stratum: PickStratum): boolean {
  return isFeatureStratum(stratum)
    ? candidate.features.includes(stratum)
    : candidate.stratum === stratum;
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

function emptyLists<K extends string>(keys: readonly K[]): Record<K, string[]> {
  return Object.fromEntries(keys.map((key) => [key, [] as string[]])) as Record<K, string[]>;
}

/** How many picks a stratum still needs; only `list-only` accounts for the kept set. */
function room(stratum: PickStratum, kept: number, quotas: Quotas): number {
  return quotas[stratum] - (stratum === "list-only" ? kept : 0);
}

/**
 * The target mix for the curated set: 40 extensions, then about 20 harder ones
 * (task 0033), five per additive stratum. The ten extensions kept from the
 * first curated set are all List-centric, so they already fill the `list-only`
 * quota.
 */
export const DEFAULT_QUOTAS: Quotas = {
  form: 10,
  detail: 10,
  utils: 10,
  "list-only": 10,
  grid: 5,
  "menu-bar": 5,
  "action-variants": 5,
  "selection-apis": 5,
};

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
  const order = ranked(candidates.filter(eligible));
  const picks = emptyLists(PICK_STRATA);
  const missing = emptyCounts(PICK_STRATA);
  // The exclusive strata are disjoint, so excluding earlier picks leaves their
  // selection exactly as it was before the additive strata existed.
  const taken = new Set(kept);
  for (const stratum of PICK_STRATA) {
    const needed = room(stratum, kept.length, quotas);
    for (const candidate of order) {
      if (picks[stratum].length >= needed) break;
      if (taken.has(candidate.name) || !matchesStratum(candidate, stratum)) continue;
      picks[stratum].push(candidate.name);
      taken.add(candidate.name);
    }
    missing[stratum] = Math.max(0, needed - picks[stratum].length);
  }
  return {
    kept,
    picks,
    curated: [...kept, ...PICK_STRATA.flatMap((stratum) => picks[stratum])],
    missing,
  };
}

/** Every member of each stratum, including the kept extensions. */
export function strataMembers(selection: Selection): Record<PickStratum, string[]> {
  const members = emptyLists(PICK_STRATA);
  for (const stratum of STRATA) members[stratum] = [...selection.picks[stratum]];
  members["list-only"] = [...selection.kept, ...selection.picks["list-only"]];
  for (const stratum of FEATURE_STRATA) members[stratum] = [...selection.picks[stratum]];
  return members;
}

/** Eligible candidates per exclusive stratum, split by whether they reach a network. */
export function capacity(
  candidates: Candidate[],
  network: boolean,
): Record<ExclusiveStratum, number> {
  const counts = emptyCounts(STRATA);
  for (const candidate of candidates) {
    if (candidate.stratum === "none" || candidate.network !== network) continue;
    if (eligible(candidate)) counts[candidate.stratum] += 1;
  }
  return counts;
}

/** Eligible candidates per additive stratum, split by whether they reach a network. */
export function featureCapacity(
  candidates: Candidate[],
  network: boolean,
): Record<FeatureStratum, number> {
  const counts = emptyCounts(FEATURE_STRATA);
  for (const candidate of candidates) {
    if (candidate.network !== network || !eligible(candidate)) continue;
    for (const feature of candidate.features) counts[feature] += 1;
  }
  return counts;
}

/** True once every quota can be filled from candidates that never use a network. */
export function offlineQuotasMet(
  kept: string[],
  candidates: Candidate[],
  quotas: Quotas = DEFAULT_QUOTAS,
): boolean {
  const exclusive = capacity(candidates, false);
  const features = featureCapacity(candidates, false);
  return PICK_STRATA.every((stratum) =>
    isFeatureStratum(stratum)
      ? features[stratum] >= room(stratum, kept.length, quotas)
      : exclusive[stratum] >= room(stratum, kept.length, quotas),
  );
}

/** What `compat/corpus.json` records about the selection; JSON-serializable. */
export const SELECTION_CRITERIA = {
  script: "scripts/corpus/select.ts",
  dependencies: [...PROVIDED_DEPENDENCIES],
  minViewCommands: 1,
  excludedSources: [...EXCLUSIONS.map(({ id }) => id), IMPORT_EXCLUSION],
  preferred: "no network access (fetch, axios, http(s), useFetch, useStreamJSON)",
  order: "sha256(name) ascending; candidates without network access are picked first",
  quotas: DEFAULT_QUOTAS,
  featureStrata: {
    grid: "<Grid",
    "menu-bar": "<MenuBarExtra",
    "action-variants":
      "ActionPanel.Submenu, or an Action.* variant beyond CopyToClipboard/OpenInBrowser/Paste/Push",
    "selection-apis": "Form.FilePicker, getSelectedText or getSelectedFinderItems",
  },
  scan: { batch: SCAN_BATCH, cap: SCAN_CAP },
  note: "the list-only quota is already met by the extensions kept from the first curated set; the first four strata keep the first 40 picks unchanged",
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
