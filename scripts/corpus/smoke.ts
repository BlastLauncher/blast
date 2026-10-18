// Pure logic for the corpus smoke runner (`smoke-run.ts`): probe-result
// classification, preference defaults from a manifest, message sanitation and
// the deterministic JSON/markdown reports. Nothing here spawns processes,
// touches the network or reads the corpus checkout, so every rule is
// unit-testable offline; the real run needs network and is not part of verify.

export const OUTCOMES = [
  "rendered",
  "bundle-failed",
  "crashed",
  "timeout",
  "unsupported-mode",
  "unsupported-api",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** What one command run observably did, before it is labelled for the report. */
export type ProbeResult =
  | { kind: "bundle-failed"; error?: string; missing?: string[] }
  | { kind: "scene"; nodeCount: number; rootType: string }
  | {
      kind: "exit";
      code: number | null;
      signal: string | null;
      error?: { message: string; code?: string };
    }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "unsupported-mode"; reason: string };

export type CommandResult = {
  extension: string;
  command: string;
  mode: string;
  outcome: Outcome;
  /** Why a command did not render, when the outcome alone is not enough. */
  reason?: string | undefined;
  path?: string | undefined;
  /** Rendered: nodes in the first scene and the root node's type. */
  nodes?: number | undefined;
  rootType?: string | undefined;
  /** Bundle-failed with a MISSING_DEPENDENCY error: the absent package names. */
  missing?: string[] | undefined;
  /** Bundle-failed esbuild message, or the crash error. */
  error?: string | undefined;
  /** Crashed: how the runtime exited, e.g. "code 3" or "signal SIGKILL". */
  exit?: string | undefined;
  /** Crashed: the last error-level log lines. */
  logs?: string[] | undefined;
  /** Runtime warnings such as dropped non-serializable props. */
  warnings?: string[] | undefined;
};

export type SmokeReport = {
  commit: string;
  totals: Record<Outcome, number>;
  results: CommandResult[];
  extensionFailures: { extension: string; error: string }[];
};

/** A scene node narrowed to what counting needs; protocol scenes satisfy it. */
export type SceneLike = { children: SceneLike[] };

export function countNodes(root: SceneLike): number {
  return 1 + root.children.reduce((total, child) => total + countNodes(child), 0);
}

/** Minimal manifest shapes; anything else the manifest carries is ignored. */
export type ManifestPreference = { name?: string; type?: string; default?: Json };
export type ManifestCommand = { name?: string; mode?: string; preferences?: ManifestPreference[] };
export type Manifest = {
  commands?: ManifestCommand[];
  preferences?: ManifestPreference[];
};

function withDefaults(
  preferences: ManifestPreference[] | undefined,
  into: Record<string, Json>,
): void {
  for (const preference of preferences ?? []) {
    if (typeof preference?.name === "string" && "default" in preference) {
      into[preference.name] = preference.default as Json;
    }
  }
}

function sortedKeys(record: Record<string, Json>): Record<string, Json> {
  return Object.fromEntries(
    Object.keys(record)
      .toSorted()
      .map((name) => [name, record[name]!]),
  );
}

export function commandMode(manifest: Manifest, commandName: string): string | undefined {
  const command = manifest.commands?.find((item) => item?.name === commandName);
  return command?.mode;
}

/**
 * Preference values to launch a command with: the manifest's declared defaults
 * only, extension-level first, command-level overriding. Preferences without a
 * declared default stay unset (the broker denies everything else anyway).
 */
export function extractPreferenceDefaults(
  manifest: Manifest,
  commandName: string,
): Record<string, Json> {
  const defaults: Record<string, Json> = {};
  withDefaults(manifest.preferences, defaults);
  const command = manifest.commands?.find((item) => item?.name === commandName);
  withDefaults(command?.preferences, defaults);
  return sortedKeys(defaults);
}

/** Every command name the manifest declares, sorted for a stable run order. */
export function manifestCommands(manifest: Manifest): string[] {
  return (manifest.commands ?? [])
    .filter((command) => typeof command?.name === "string")
    .map((command) => command.name as string)
    .toSorted();
}

/**
 * Replace machine-specific absolute path prefixes so committed reports diff
 * cleanly across checkouts. Longer prefixes win so `<repo>/x` beats `<repo>`.
 */
export function sanitizePath(text: string, replacements: Array<[string, string]>): string {
  let result = text;
  for (const [from, to] of [...replacements].toSorted((a, b) => b[0].length - a[0].length)) {
    if (from !== "") result = result.split(from).join(to);
  }
  return result;
}

/** One line of at most `width` characters, for embedding in table cells. */
export function compactLine(text: string, width = 160): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > width ? `${line.slice(0, width - 1)}…` : line;
}

/** The last `limit` lines, compacted; empty input collapses to undefined. */
export function compactLines(lines: string[], limit = 3): string[] | undefined {
  const kept = lines.slice(-limit).map((line) => compactLine(line));
  return kept.length > 0 ? kept : undefined;
}

export type BuildInput = {
  extension: string;
  command: string;
  mode: string;
  probe: ProbeResult;
  /** Runtime warnings, already sanitized, deduplicated and capped. */
  warnings?: string[] | undefined;
  /** Error-level log lines, already sanitized and capped to the last ones. */
  errorLogs?: string[] | undefined;
};

function formatExit(probe: Extract<ProbeResult, { kind: "exit" }>): string {
  return probe.signal !== null ? `signal ${probe.signal}` : `code ${probe.code}`;
}

/** Label one probe for the report; the runner gathers, this classifies. */
export function buildResult(input: BuildInput): CommandResult {
  const base: CommandResult = {
    extension: input.extension,
    command: input.command,
    mode: input.mode,
    outcome: "crashed",
  };
  const set = (fields: Partial<CommandResult>): CommandResult => {
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) (base as Record<string, unknown>)[key] = value;
    }
    return base;
  };
  if (input.warnings?.length) set({ warnings: input.warnings });
  const probe = input.probe;
  switch (probe.kind) {
    case "scene":
      return set({ outcome: "rendered", nodes: probe.nodeCount, rootType: probe.rootType });
    case "bundle-failed":
      return set({
        outcome: "bundle-failed",
        missing: probe.missing,
        error: probe.error,
      });
    case "timeout":
      return set({ outcome: "timeout", reason: `no scene or exit within ${probe.timeoutMs} ms` });
    case "unsupported-mode":
      return set({ outcome: "unsupported-mode", reason: probe.reason });
    case "exit": {
      if (probe.error?.code === "UNSUPPORTED_API") {
        return set({
          outcome: "unsupported-api",
          path: probe.error.message.replace(/^Unsupported API in Blast: /, ""),
          error: probe.error.message,
        });
      }
      if (probe.error?.code === "UNSUPPORTED") {
        return set({ outcome: "unsupported-mode", reason: probe.error.message });
      }
      if (probe.code === 0 && probe.signal === null && probe.error === undefined) {
        // A clean exit without a scene is normal for modes that never render
        // (no-view); for a view command it means the scene never arrived.
        return input.mode === "view"
          ? set({ outcome: "crashed", reason: "exited without publishing a scene" })
          : set({
              outcome: "unsupported-mode",
              reason: `command mode "${input.mode}" completed without rendering a scene`,
            });
      }
      return set({
        outcome: "crashed",
        exit: formatExit(probe),
        error: probe.error?.message,
        logs: compactLines(input.errorLogs ?? []),
      });
    }
  }
}

/** Assemble the committed report: sorted results and per-outcome totals. */
export function buildReport(
  commit: string,
  results: CommandResult[],
  extensionFailures: { extension: string; error: string }[] = [],
): SmokeReport {
  const totals = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<
    Outcome,
    number
  >;
  for (const result of results) totals[result.outcome]! += 1;
  return {
    commit,
    totals,
    results: [...results].toSorted(
      (a, b) => a.extension.localeCompare(b.extension) || a.command.localeCompare(b.command),
    ),
    extensionFailures: [...extensionFailures].toSorted((a, b) =>
      a.extension.localeCompare(b.extension),
    ),
  };
}

function detail(result: CommandResult): string {
  const warnings = result.warnings === undefined ? "" : `; ${result.warnings.length} warning(s)`;
  switch (result.outcome) {
    case "rendered":
      return `${result.nodes} nodes, root ${result.rootType}${warnings}`;
    case "bundle-failed":
      return `${result.missing ? `missing ${result.missing.join(", ")}` : result.error}${warnings}`;
    case "crashed":
      return `${[result.reason, result.exit, result.error].filter(Boolean).join("; ") || "crashed"}${warnings}`;
    case "unsupported-api":
      return `${result.path}${warnings}`;
    case "timeout":
    case "unsupported-mode":
      return `${result.reason}${warnings}`;
  }
}

export function renderJsonReport(report: SmokeReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderMarkdownReport(report: SmokeReport): string {
  const count = (outcome: Outcome): number => report.totals[outcome] ?? 0;
  const lines: string[] = [
    "# Corpus smoke report",
    "",
    `Headless run of every command of the curated extensions at corpus commit`,
    `\`${report.commit}\`, with a deny-all broker and manifest preference`,
    "defaults. Regenerate with `bun run corpus:smoke` (network required; not",
    "part of `bun run verify`).",
    "",
    `${report.results.length} commands: ${OUTCOMES.map((outcome) => `${outcome} ${count(outcome)}`).join(", ")}.`,
    "",
    "| Command | Mode | Outcome | Detail |",
    "| --- | --- | --- | --- |",
  ];
  for (const result of report.results) {
    lines.push(
      `| \`${result.extension}/${result.command}\` | ${result.mode} | ${result.outcome} | ${compactLine(detail(result))} |`,
    );
  }
  const failures = report.results.filter((result) => result.outcome !== "rendered");
  if (failures.length > 0 || report.extensionFailures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of report.extensionFailures) {
      lines.push(`- \`${failure.extension}\`: unreadable manifest — ${compactLine(failure.error)}`);
    }
    for (const result of failures) {
      lines.push(
        `- \`${result.extension}/${result.command}\` (${result.outcome}): ${compactLine(detail(result))}`,
      );
      for (const log of result.logs ?? []) lines.push(`  - log: ${log}`);
      for (const warning of result.warnings ?? []) lines.push(`  - warning: ${warning}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
