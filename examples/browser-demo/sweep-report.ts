// The browser sweep report (`compat/browser-sweep.json` and `BROWSER-SWEEP.md`),
// shared by the sweep that writes it and the catalog script that records the
// commands it drops. Pure: no browser, file system or network.

export type SweepResult = {
  extension: string;
  command: string;
  title: string;
  outcome: string;
  /** The capability the browser host could not provide (`browser-limit`). */
  limit?: string;
  /** The HTTP status or auth error a placeholder credential got (`needs-credentials`). */
  credentials?: string;
  status?: string;
  pageErrors: string[];
  consoleErrors: string[];
  elapsedMs: number;
  missingArguments?: string[];
};
/** A command left out of the demo catalog because no browser tab can run it. */
export type Exclusion = { extension: string; command: string; limit: string };
export type Report = {
  schema: 2;
  commit: string;
  date: string;
  commands: number;
  wallTimeMs: number;
  totals: Record<string, number>;
  /** Commands per denied capability, for `browser-limit` results. */
  limits: Record<string, number>;
  excluded: Exclusion[];
  results: SweepResult[];
};

const succeeded = new Set(["rendered", "rendered-with-placeholders", "completed", "empty"]);
/** Outcomes that are neither a success nor a Blast failure. */
const apart = new Set(["browser-limit", "needs-credentials"]);

const key = (item: { extension: string; command: string }) => `${item.extension}/${item.command}`;
const cell = (value: string) => value.replaceAll("|", "\\|");
const examples = (results: readonly { extension: string; command: string }[]) =>
  results
    .slice(0, 5)
    .map((result) => `\`${key(result)}\``)
    .join(", ");

function grouped(
  results: readonly SweepResult[],
  by: (result: SweepResult) => string,
): [string, SweepResult[]][] {
  const groups = new Map<string, SweepResult[]>();
  for (const result of results) {
    const name = by(result);
    groups.set(name, [...(groups.get(name) ?? []), result]);
  }
  return [...groups.entries()].toSorted(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
}

/** `rendered + with placeholders / (commands − browser-limit)`, the report headline. */
export function headline(report: Pick<Report, "commands" | "totals">): string {
  const rendered = report.totals.rendered ?? 0;
  const placeholders = report.totals["rendered-with-placeholders"] ?? 0;
  const limited = report.totals["browser-limit"] ?? 0;
  return `Rendered: **${rendered + placeholders} / ${report.commands - limited}** (${rendered} rendered + ${placeholders} rendered with placeholder preferences) of ${report.commands} commands − ${limited} browser-limit.`;
}

/**
 * Commands to leave out of the demo catalog: every `browser-limit` result of
 * the last sweep, plus earlier exclusions the sweep no longer sees because the
 * catalog already dropped them.
 */
export function exclusions(report: Pick<Report, "results" | "excluded">): Exclusion[] {
  const found = new Map<string, Exclusion>();
  for (const item of report.excluded ?? []) found.set(key(item), item);
  for (const result of report.results)
    if (result.outcome === "browser-limit")
      found.set(key(result), {
        extension: result.extension,
        command: result.command,
        limit: result.limit ?? "unknown",
      });
  return [...found.values()].toSorted((a, b) => key(a).localeCompare(key(b)));
}

export function markdown(report: Report): string {
  const failures = report.results.filter(
    (result) => !succeeded.has(result.outcome) && !apart.has(result.outcome),
  );
  const credentials = report.results.filter((result) => result.outcome === "needs-credentials");
  const limited = report.results.filter((result) => result.outcome === "browser-limit");
  const lines = [
    "# Browser catalog sweep",
    "",
    `Catalog commit \`${report.commit}\`; date ${report.date}; ${report.commands} command records; wall time ${(report.wallTimeMs / 1000).toFixed(1)} s.`,
    "",
    headline(report),
    `Not rendered: ${failures.length} Blast failure(s), ${credentials.length} needing real credentials.`,
    "",
    "## Totals",
    "",
    ...Object.entries(report.totals).map(([outcome, count]) => `- ${outcome}: ${count} command(s)`),
    "",
    "## Blast failures",
    "",
    "| Signature | Commands | Examples |",
    "| --- | ---: | --- |",
    ...grouped(failures, (result) => result.outcome).map(
      ([signature, results]) => `| ${cell(signature)} | ${results.length} | ${examples(results)} |`,
    ),
    "",
    "## Needs credentials",
    "",
    "Ran with placeholder preferences, then the service refused them.",
    "",
    "| Response | Commands | Examples |",
    "| --- | ---: | --- |",
    ...grouped(credentials, (result) => result.credentials ?? "unknown").map(
      ([response, results]) => `| ${cell(response)} | ${results.length} | ${examples(results)} |`,
    ),
    "",
    "## Browser limits",
    "",
    "Denied by the browser host (capability log), not by Blast's runtime.",
    "",
    "| Capability | Commands | Examples |",
    "| --- | ---: | --- |",
    ...grouped(limited, (result) => result.limit ?? "unknown").map(
      ([limit, results]) => `| ${cell(limit)} | ${results.length} | ${examples(results)} |`,
    ),
    "",
    "## Excluded from the demo",
    "",
    "Dropped from `examples/browser-demo/catalog.json` by `scripts/browser-catalog.ts`",
    "because a sweep found them `browser-limit`.",
    "",
    "| Command | Denied capability |",
    "| --- | --- |",
    ...report.excluded.map((item) => `| \`${key(item)}\` | ${cell(item.limit)} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
