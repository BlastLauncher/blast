// Pure aggregation behind `compat/dependencies.json` and `DEPENDENCIES.md`:
// which npm packages the pinned corpus declares in `dependencies` and imports
// from its sources, and how many extensions would be satisfied by providing
// the most-imported packages. `scan.ts` feeds it the same pass that writes
// `raycast-usage.json`; nothing here reads files or touches the network.
import { isBuiltin } from "node:module";
import { BASE_PACKAGES, importedPackages, PROVIDED_PACKAGES, type Source } from "./imports.ts";
import type { Manifest } from "./selection.ts";

export const DEPENDENCIES_PATH = "compat/dependencies.json";
export const DEPENDENCIES_MD_PATH = "compat/DEPENDENCIES.md";
/** The N values of the cumulative curve. */
export const CURVE_STEPS = [10, 20, 30, 50] as const;
/** Rows in the generated table. */
export const TOP_PACKAGES = 60;

/** Type packages are erased at build time, so they are never bundled. */
const TYPES_PACKAGE = /^@types\//;

/**
 * Whether providing this package could matter to a bundled command. The
 * provided packages are excluded because Blast already ships them, Node
 * built-ins because they are not installed at all.
 */
export function trackedPackage(name: string): boolean {
  return (
    !TYPES_PACKAGE.test(name) &&
    !isBuiltin(name) &&
    !(BASE_PACKAGES as readonly string[]).includes(name)
  );
}

const LEADING_MAJOR = /^\D*(\d+)/;

/**
 * The major a dependency range pins, e.g. `^2.6.1` → `2`. A range that does
 * not start with a version (`latest`, `*`, a git URL, a non-string) is
 * `other`: it says nothing about which major the extension expects.
 */
export function majorOf(range: unknown): string {
  if (typeof range !== "string") return "other";
  return LEADING_MAJOR.exec(range)?.[1] ?? "other";
}

/** What one extension declares in `dependencies` and imports from its sources. */
export type ExtensionDependencies = {
  /** Declared runtime dependency name → its major bucket. */
  declared: Record<string, string>;
  /** npm packages imported by the extension's non-test sources, sorted. */
  imported: string[];
};

export function extensionDependencies(
  manifest: Manifest | undefined,
  sources: Iterable<Source>,
): ExtensionDependencies {
  const dependencies = manifest?.dependencies ?? {};
  const declared: Record<string, string> = {};
  for (const name of Object.keys(dependencies).toSorted()) {
    if (trackedPackage(name)) declared[name] = majorOf(dependencies[name]);
  }
  return { declared, imported: importedPackages(sources).filter(trackedPackage) };
}

export type DependencyEntry = {
  name: string;
  /** Extensions declaring the package in `dependencies`. */
  declared: number;
  /** Extensions whose non-test sources import the package. */
  imported: number;
  /** Declared major bucket → extensions declaring it (rank with `rankedMajors`). */
  majors: Record<string, number>;
};

export type Dependencies = {
  corpusCommit: string;
  extensions: number;
  /** Extensions that need no package beyond the provided set. */
  providedOnly: number;
  /** Exact satisfaction for the host allowlist, including baseline packages. */
  shared: { provided: string[]; satisfied: number };
  /** Providing the top `provided` importers satisfies `satisfied` extensions. */
  curve: Array<{ provided: number; satisfied: number }>;
  /** Ordering: `imported` desc, then name asc. */
  packages: DependencyEntry[];
};

/** Major buckets are numbers or `other`; most common first, ties by bucket. */
const majorRank = (bucket: string) =>
  bucket === "other" ? Number.POSITIVE_INFINITY : Number(bucket);

// Integer-like keys always enumerate in ascending numeric order, so an object
// cannot hold this ordering; callers rank the entries instead.
function rankedMajors(majors: Record<string, number>): Array<[string, number]> {
  return Object.entries(majors).toSorted(
    ([aBucket, aCount], [bBucket, bCount]) =>
      bCount - aCount || majorRank(aBucket) - majorRank(bBucket),
  );
}

/**
 * Sums per-extension data into the committed report. Every count is "number of
 * extensions": an extension importing a package twice counts once. The curve
 * is cumulative, so `satisfied` includes the extensions that need nothing.
 */
export function aggregateDependencies(
  commit: string,
  extensions: ExtensionDependencies[],
  steps: readonly number[] = CURVE_STEPS,
  provided: readonly string[] = PROVIDED_PACKAGES,
): Dependencies {
  const entries = new Map<string, DependencyEntry>();
  const entry = (name: string): DependencyEntry => {
    const existing = entries.get(name);
    if (existing) return existing;
    const created: DependencyEntry = { name, declared: 0, imported: 0, majors: {} };
    entries.set(name, created);
    return created;
  };
  const needs: Array<Set<string>> = [];
  for (const extension of extensions) {
    const need = new Set<string>();
    for (const [name, major] of Object.entries(extension.declared)) {
      if (!trackedPackage(name)) continue;
      need.add(name);
      const declared = entry(name);
      declared.declared += 1;
      declared.majors[major] = (declared.majors[major] ?? 0) + 1;
    }
    for (const name of new Set(extension.imported)) {
      if (!trackedPackage(name)) continue;
      need.add(name);
      entry(name).imported += 1;
    }
    needs.push(need);
  }
  const packages = [...entries.values()]
    .map((item) => ({ ...item, majors: Object.fromEntries(rankedMajors(item.majors)) }))
    .toSorted(
      (a, b) => b.imported - a.imported || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
  const byImports = packages.map(({ name }) => name);
  return {
    corpusCommit: commit,
    extensions: extensions.length,
    providedOnly: needs.filter((need) => need.size === 0).length,
    shared: {
      provided: [...new Set(provided)].toSorted(),
      satisfied: needs.filter((need) => [...need].every((name) => provided.includes(name))).length,
    },
    curve: steps.map((provided) => {
      const available = new Set(byImports.slice(0, provided));
      return {
        provided,
        satisfied: needs.filter((need) => [...need].every((name) => available.has(name))).length,
      };
    }),
    packages,
  };
}

/** The most common declared major and its share of the declaring extensions. */
function topMajor({ declared, majors }: DependencyEntry): string {
  const [bucket, count] = rankedMajors(majors)[0] ?? [];
  if (bucket === undefined || count === undefined || declared === 0) return "—";
  return `${bucket} (${Math.round((count / declared) * 100)}%)`;
}

/** Human summary; generated, so it must stay readable rather than exhaustive. */
export function renderDependenciesMd(dependencies: Dependencies): string {
  const { corpusCommit, extensions, providedOnly, shared, curve, packages } = dependencies;
  const shown = packages.slice(0, TOP_PACKAGES);
  return `${[
    "# Corpus dependencies",
    "",
    "What the pinned corpus needs beyond the packages Blast already provides",
    `(\`${BASE_PACKAGES.join("`, `")}\`) and Node built-ins. An extension is`,
    "*satisfied* when every package it declares in `dependencies` and every",
    "package its non-test sources import is provided. `devDependencies`, test",
    "files and `@types/*` never count because they are not bundled, and a",
    "specifier npm could not name (`#imports`, a native module) is not a",
    "package; a scope-shaped tsconfig alias (`@lib/utils`) is, because the",
    "bundler cannot resolve it either.",
    "",
    "Source: [dependencies.json](dependencies.json), from the same scan as",
    `[raycast-usage.json](raycast-usage.json) at commit \`${corpusCommit}\``,
    `(${extensions} extensions).`,
    "",
    "## Summary",
    "",
    `- ${providedOnly} of ${extensions} extensions need nothing beyond the provided set.`,
    `- ${shared.satisfied} of ${extensions} extensions are satisfied by the current shared allowlist`,
    `  (\`${shared.provided.join("\`, \`")}\`).`,
    `- ${packages.length} packages are declared or imported by at least one extension.`,
    "",
    "## Cumulative curve",
    "",
    "How many extensions are satisfied once the top N packages by imports are provided.",
    "",
    "| Packages provided | Extensions satisfied |",
    "| --- | --- |",
    `| 0 | ${providedOnly} |`,
    ...curve.map(({ provided, satisfied }) => `| ${provided} | ${satisfied} |`),
    "",
    `## Top ${shown.length} packages`,
    "",
    "Ordered by imported extensions (desc), then name. Declared counts",
    "`dependencies` entries only; the share is of the declaring extensions.",
    "",
    "| Package | Imported | Declared | Top major |",
    "| --- | --- | --- | --- |",
    ...shown.map(
      (item) => `| \`${item.name}\` | ${item.imported} | ${item.declared} | ${topMajor(item)} |`,
    ),
    "",
  ].join("\n")}\n`;
}
