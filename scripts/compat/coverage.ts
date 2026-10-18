// Joins `// @covers` evidence from test files with the inventory into a
// coverage report. Pure logic: no filesystem access here, so fixtures in tests
// can drive every rule.
import { KINDS, type Kind } from "./inventory.ts";

export const STATUS = ["covered", "partial", "missing"] as const;
export type Status = (typeof STATUS)[number];

export type InventoryEntry = { path: string; kind: Kind; deprecated: boolean };
export type Inventory = { version: string; entries: InventoryEntry[] };

/** One `// @covers` tag, with the location needed to report unknown paths. */
export type CoverTag = { path: string; partial: boolean; file: string; line: number };

export type ReportEntry = { path: string; status: Status; tests: string[] };
export type Totals = { covered: number; partial: number; missing: number; total: number };
export type CoverageReport = {
  version: string;
  totals: {
    all: Totals;
    // The headline number is non-deprecated coverage; deprecated entries are
    // tracked separately so dead API cannot inflate it.
    nonDeprecated: Totals;
    deprecated: Totals;
    kinds: Record<Kind, Totals>;
  };
  entries: ReportEntry[];
};

const TAG = /^\s*\/\/\s*@covers\s+(\S.*?)\s*$/;

export function parseCovers(source: string, file: string): CoverTag[] {
  const tags: CoverTag[] = [];
  for (const [index, line] of source.split("\n").entries()) {
    const match = TAG.exec(line);
    if (!match) continue;
    const text = match[1]!;
    // A trailing ` partial` marks partial support; anything else is the path.
    const partial = text.endsWith(" partial");
    tags.push({
      path: partial ? text.slice(0, -" partial".length).trimEnd() : text,
      partial,
      file,
      line: index + 1,
    });
  }
  return tags;
}

function emptyTotals(): Totals {
  return { covered: 0, partial: 0, missing: 0, total: 0 };
}

export function buildReport(
  inventory: Inventory,
  tags: CoverTag[],
): { report: CoverageReport; errors: string[] } {
  const known = new Set(inventory.entries.map((entry) => entry.path));
  const errors: string[] = [];
  const evidence = new Map<string, { partial: boolean; files: Set<string> }>();
  for (const tag of tags) {
    if (!known.has(tag.path)) {
      errors.push(`${tag.file}:${tag.line}: unknown @covers path '${tag.path}'`);
      continue;
    }
    // `partial` wins over a plain covered tag for the same path: the weakest
    // claim in the evidence decides.
    const hit = evidence.get(tag.path) ?? { partial: false, files: new Set<string>() };
    hit.partial ||= tag.partial;
    hit.files.add(tag.file);
    evidence.set(tag.path, hit);
  }

  const entries: ReportEntry[] = inventory.entries.map((entry) => {
    const hit = evidence.get(entry.path);
    return {
      path: entry.path,
      status: hit ? (hit.partial ? "partial" : "covered") : "missing",
      tests: hit ? [...hit.files].toSorted() : [],
    };
  });

  const totals = {
    all: emptyTotals(),
    nonDeprecated: emptyTotals(),
    deprecated: emptyTotals(),
    kinds: Object.fromEntries(KINDS.map((kind) => [kind, emptyTotals()])) as Record<Kind, Totals>,
  };
  const bump = (bucket: Totals, status: Status) => {
    bucket[status] += 1;
    bucket.total += 1;
  };
  for (const [index, entry] of entries.entries()) {
    const deprecated = inventory.entries[index]!.deprecated;
    bump(totals.all, entry.status);
    bump(deprecated ? totals.deprecated : totals.nonDeprecated, entry.status);
    bump(totals.kinds[inventory.entries[index]!.kind], entry.status);
  }
  return { report: { version: inventory.version, totals, entries }, errors };
}

function percent(bucket: Totals): string {
  return bucket.total === 0 ? "0.0%" : `${((bucket.covered / bucket.total) * 100).toFixed(1)}%`;
}

/** Human summary; generated, so it must stay readable rather than exhaustive. */
export function renderCoverageMd(report: CoverageReport, inventory: Inventory): string {
  const { totals } = report;
  const lines: string[] = [
    "# Raycast API coverage",
    "",
    `Denominator: the \`@raycast/api@${report.version}\` declarations. Evidence:`,
    "`// @covers` tags in `packages/**/*.test.ts(x)`. A parent is not implied covered",
    "by its children. Partial support is reported separately from covered.",
    "",
    `**Non-deprecated coverage: ${totals.nonDeprecated.covered}/${totals.nonDeprecated.total} covered (${percent(totals.nonDeprecated)}), ${totals.nonDeprecated.partial} partial, ${totals.nonDeprecated.missing} missing.**`,
    `Deprecated: ${totals.deprecated.covered}/${totals.deprecated.total} covered (${percent(totals.deprecated)}), ${totals.deprecated.partial} partial, ${totals.deprecated.missing} missing.`,
    "",
    "## Totals",
    "",
    "| Status | Non-deprecated | Deprecated | All |",
    "| --- | --- | --- | --- |",
    `| covered | ${totals.nonDeprecated.covered} | ${totals.deprecated.covered} | ${totals.all.covered} |`,
    `| partial | ${totals.nonDeprecated.partial} | ${totals.deprecated.partial} | ${totals.all.partial} |`,
    `| missing | ${totals.nonDeprecated.missing} | ${totals.deprecated.missing} | ${totals.all.missing} |`,
    "",
    "## Totals by kind",
    "",
    "| Kind | Covered | Partial | Missing | Total |",
    "| --- | --- | --- | --- | --- |",
    ...KINDS.map(
      (kind) =>
        `| ${kind} | ${totals.kinds[kind]!.covered} | ${totals.kinds[kind]!.partial} | ${totals.kinds[kind]!.missing} | ${totals.kinds[kind]!.total} |`,
    ),
    "",
    "## Top-level symbols",
    "",
    "Children counts include all descendants, as covered/partial/total.",
    "",
    "| Symbol | Kind | Status | Children |",
    "| --- | --- | --- | --- |",
  ];
  // One pass over descendants: every entry bumps each of its ancestors.
  const children = new Map<string, { covered: number; partial: number; total: number }>();
  for (const entry of report.entries) {
    for (
      let parent = entry.path.includes(".") ? entry.path.slice(0, entry.path.lastIndexOf(".")) : "";
      parent !== "";
      parent = parent.includes(".") ? parent.slice(0, parent.lastIndexOf(".")) : ""
    ) {
      const bucket = children.get(parent) ?? { covered: 0, partial: 0, total: 0 };
      if (entry.status !== "missing") bucket[entry.status] += 1;
      bucket.total += 1;
      children.set(parent, bucket);
    }
  }
  for (const [index, entry] of report.entries.entries()) {
    if (entry.path.includes(".")) continue;
    const bucket = children.get(entry.path);
    lines.push(
      `| \`${entry.path}\` | ${inventory.entries[index]!.kind} | ${entry.status} | ${bucket ? `${bucket.covered}/${bucket.partial}/${bucket.total}` : "0/0/0"} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
