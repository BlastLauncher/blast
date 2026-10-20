// Pure selection rules for the dependency-heavy corpus set (task 0070): the
// extensions that declare packages beyond the shared allowlist, so the smoke
// run has to install them (decision 0008). Same shape as `selection.ts`: the
// entry point (`select-deps.ts`) feeds these functions manifests, lockfile
// sizes and sources read from the pinned corpus, every rule is static and
// deterministic, and nothing here runs git, reads files or touches the network.
import { isBuiltin } from "node:module";
import type { Source } from "./imports.ts";
import {
  EXCLUSIONS,
  rank,
  unprovidedDependencies,
  usesNetwork,
  viewCommands,
  type Manifest,
} from "./selection.ts";

export const DEPS_PIN_PATH = "compat/corpus-deps.json";
/** Extensions in the committed set. */
export const DEPS_COUNT = 25;
/**
 * A lockfile this large pins several hundred packages, which makes one install
 * minutes long and tens of megabytes; the set is for breadth, not stress.
 */
export const MAX_LOCK_BYTES = 300_000;
/** Packages whose lockfile entries are installed when they are declared. */
export const MAX_UNPROVIDED_DEPENDENCIES = 6;
/** Most-imported unprovided packages that get a group, and candidates read per group. */
export const GROUP_LIMIT = 40;
export const PER_GROUP = 6;

/**
 * Packages that ship native code or fetch a binary in an install script. Installs
 * run with `--ignore-scripts` (decision 0008), so they would only fail at runtime
 * for a reason that says nothing about Blast.
 */
export const NATIVE_PACKAGES: readonly (string | RegExp)[] = [
  "sharp",
  "sqlite3",
  "better-sqlite3",
  "bcrypt",
  "canvas",
  "fsevents",
  "keytar",
  "node-pty",
  "node-gyp",
  "bufferutil",
  "utf-8-validate",
  "cpu-features",
  "re2",
  "puppeteer",
  "playwright",
  "electron",
  "esbuild",
  "@swc/core",
  /^@napi-rs\//,
  /^@parcel\/watcher/,
];

/** Version specifiers that do not come from the npm registry or the lockfile's pins. */
const NON_REGISTRY_SPEC = /^(?:file:|link:|workspace:|git[+:]|github:|https?:|[\w.-]+\/[\w.-]+$)/;

export function isNativePackage(name: string): boolean {
  return NATIVE_PACKAGES.some((entry) =>
    typeof entry === "string" ? entry === name : entry.test(name),
  );
}

/** Runtime-supplied or erased packages that never need an install (decision 0008). */
function isInstalledPackage(name: string): boolean {
  return (
    !name.startsWith("@types/") &&
    name !== "@raycast/api" &&
    !/^react(?:\/|$)/.test(name) &&
    !isBuiltin(name)
  );
}

/** Declared dependencies the shared allowlist does not provide, that npm would install. */
export function installedDependencies(manifest: Manifest): string[] {
  return unprovidedDependencies(manifest).filter(isInstalledPackage);
}

/**
 * Manifest-level verdict. A set that needs an install must have at least one
 * unprovided package, a lockfile to pin it, a view command, and nothing that
 * cannot install under `--ignore-scripts` or does not come from the registry.
 */
export function depsManifestRejections(manifest: Manifest, hasLock: boolean): string[] {
  const rejections: string[] = [];
  const unprovided = installedDependencies(manifest);
  if (unprovided.length === 0) rejections.push("no unprovided dependency");
  if (unprovided.length > MAX_UNPROVIDED_DEPENDENCIES)
    rejections.push(`more than ${MAX_UNPROVIDED_DEPENDENCIES} unprovided dependencies`);
  if (!hasLock) rejections.push("no package-lock.json");
  if (viewCommands(manifest).length === 0) rejections.push("no view command");
  const native = Object.keys(manifest.dependencies ?? {}).filter(isNativePackage);
  if (native.length > 0) rejections.push(`native packages: ${native.toSorted().join(", ")}`);
  const nonRegistry = Object.entries(manifest.dependencies ?? {})
    .filter(([name, spec]) => isInstalledPackage(name) && NON_REGISTRY_SPEC.test(String(spec)))
    .map(([name]) => name);
  if (nonRegistry.length > 0)
    rejections.push(`non-registry specifiers: ${nonRegistry.toSorted().join(", ")}`);
  return rejections;
}

/**
 * The static source rules of the main selector minus the import rule: here
 * unprovided imports are the point. A command that shells out, scripts another
 * application or writes files would fail for reasons unrelated to dependencies.
 */
export function depsSourceExclusions(sources: Iterable<Source>): string[] {
  const found = new Set<string>();
  const list = [...sources];
  for (const { source } of list) {
    for (const { id, pattern } of EXCLUSIONS) if (pattern.test(source)) found.add(id);
  }
  return [...found].toSorted();
}

/** `package name → extensions importing it`, from `compat/dependencies.json`. */
export type ImportCounts = ReadonlyMap<string, number>;

/**
 * The package an extension is filed under: its most-imported unprovided
 * dependency (ties by name), so the set spreads over the packages that matter
 * most to the corpus rather than over whatever each extension happens to list first.
 */
export function primaryPackage(dependencies: readonly string[], counts: ImportCounts): string {
  return [...dependencies].toSorted(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
  )[0]!;
}

export type DepsManifestCandidate = { name: string; dependencies: string[]; primary: string };

/** Package groups, most-imported first (ties by name). */
export function groupOrder(candidates: readonly DepsManifestCandidate[], counts: ImportCounts) {
  const packages = [...new Set(candidates.map((candidate) => candidate.primary))];
  return packages.toSorted(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
  );
}

/**
 * Which manifest-eligible candidates to read sources for: the first `perGroup`
 * of each of the `groupLimit` most-imported package groups, in rank order, so
 * the scan stays a bounded sparse checkout.
 */
export function scanOrder(
  candidates: readonly DepsManifestCandidate[],
  counts: ImportCounts,
  groupLimit = GROUP_LIMIT,
  perGroup = PER_GROUP,
): string[] {
  const names: string[] = [];
  for (const primary of groupOrder(candidates, counts).slice(0, groupLimit)) {
    names.push(
      ...candidates
        .filter((candidate) => candidate.primary === primary)
        .toSorted((a, b) => rank(a.name).localeCompare(rank(b.name)))
        .slice(0, perGroup)
        .map((candidate) => candidate.name),
    );
  }
  return names;
}

export type DepsCandidate = DepsManifestCandidate & {
  lockBytes: number;
  exclusions: string[];
  network: boolean;
};

export function analyzeDepsSources(
  candidate: DepsManifestCandidate,
  sources: Source[],
  lockBytes: number,
): DepsCandidate {
  return {
    ...candidate,
    lockBytes,
    exclusions: depsSourceExclusions(sources),
    network: usesNetwork(sources),
  };
}

export function depsEligible(candidate: DepsCandidate): boolean {
  return candidate.exclusions.length === 0 && candidate.lockBytes <= MAX_LOCK_BYTES;
}

export type DepsSelection = {
  /** Selected extensions in pick order. */
  extensions: DepsManifestCandidate[];
  /** How many picks were still missing when the eligible candidates ran out. */
  missing: number;
};

/**
 * Round-robin over package groups, most-imported first, so 25 picks cover the
 * 25 most-imported packages that have an eligible extension. Within a group an
 * offline candidate beats a network one, then fewer installs, then the name
 * hash, which keeps the pick a pure function of the corpus pin.
 */
export function selectDeps(
  candidates: readonly DepsCandidate[],
  counts: ImportCounts,
  count = DEPS_COUNT,
): DepsSelection {
  const pool = candidates.filter(depsEligible);
  const groups = new Map<string, DepsCandidate[]>();
  for (const primary of groupOrder(pool, counts)) {
    groups.set(
      primary,
      pool
        .filter((candidate) => candidate.primary === primary)
        .toSorted(
          (a, b) =>
            Number(a.network) - Number(b.network) ||
            a.dependencies.length - b.dependencies.length ||
            rank(a.name).localeCompare(rank(b.name)) ||
            a.name.localeCompare(b.name),
        ),
    );
  }
  const picked: DepsManifestCandidate[] = [];
  for (let round = 0; picked.length < count; round += 1) {
    let any = false;
    for (const group of groups.values()) {
      const candidate = group[round];
      if (candidate === undefined) continue;
      any = true;
      if (picked.length < count) {
        picked.push({
          name: candidate.name,
          dependencies: candidate.dependencies,
          primary: candidate.primary,
        });
      }
    }
    if (!any) break;
  }
  return {
    extensions: picked,
    missing: count - picked.length,
  };
}

export const DEPS_SELECTION_CRITERIA = {
  count: DEPS_COUNT,
  manifest:
    "at least one registry dependency outside the shared allowlist (and at most 6), a package-lock.json, a view command, no native packages",
  sources:
    "no child_process, AppleScript, filesystem writes or Swift modules; lockfile at most 300 KB",
  spread:
    "filed under its most-imported unprovided package; round-robin over the 40 most-imported packages, 6 candidates read per package",
  order: "offline before network, fewer dependencies, then name hash",
};

export type DepsPin = {
  repository: string;
  commit: string;
  extensions: DepsManifestCandidate[];
};

/** The committed `compat/corpus-deps.json`. */
export function renderDepsPin(
  base: { repository: string; commit: string },
  selection: DepsSelection,
  stats: { manifestEligible: number; scanned: number; eligible: number },
): string {
  return `${JSON.stringify(
    {
      repository: base.repository,
      commit: base.commit,
      extensions: selection.extensions,
      selection: { criteria: DEPS_SELECTION_CRITERIA, ...stats },
    },
    null,
    2,
  )}\n`;
}

/** Validate a parsed `compat/corpus-deps.json`; throws with a fixable message. */
export function parseDepsPin(value: unknown): DepsPin {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("deps pin: must be a JSON object");
  const { repository, commit, extensions } = value as Record<string, unknown>;
  if (typeof repository !== "string" || repository === "")
    throw new Error("deps pin: repository must be a non-empty string");
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit))
    throw new Error("deps pin: commit must be 40 lowercase hex characters");
  if (!Array.isArray(extensions) || extensions.length === 0)
    throw new Error("deps pin: extensions must be a non-empty list");
  const parsed = extensions.map((entry, index): DepsManifestCandidate => {
    const item = entry as Partial<DepsManifestCandidate> | null;
    if (
      typeof item?.name !== "string" ||
      !/^[a-z0-9][a-z0-9-]*$/.test(item.name) ||
      typeof item.primary !== "string" ||
      !Array.isArray(item.dependencies) ||
      !item.dependencies.every((dependency) => typeof dependency === "string")
    )
      throw new Error(`deps pin: extensions[${index}] needs name, primary and dependencies`);
    return { name: item.name, primary: item.primary, dependencies: item.dependencies };
  });
  const duplicate = parsed.find(
    (entry, index) => parsed.findIndex((other) => other.name === entry.name) !== index,
  );
  if (duplicate) throw new Error(`deps pin: ${duplicate.name} listed twice`);
  return { repository, commit, extensions: parsed };
}
