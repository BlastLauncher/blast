// Pure logic for the corpus smoke runner (`smoke-run.ts`): probe-result
// classification, preference defaults from a manifest, message sanitation and
// the deterministic JSON/markdown reports. Nothing here spawns processes,
// touches the network or reads the corpus checkout, so every rule is
// unit-testable offline; the real run needs network and is not part of verify.
import { join } from "node:path";

export const OUTCOMES = [
  "rendered",
  "completed",
  "capability-denied",
  "bundle-failed",
  "crashed",
  "network",
  "timeout",
  "unsupported-mode",
  "unsupported-api",
  "missing-arguments",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * Smoke runs offline against a deny-all broker, so a command whose first
 * render depends on the network fails for a reason that says nothing about
 * Blast's API coverage. These signatures (Node's `fetch`/`node-fetch`, and
 * the DNS/connect errors they and `axios` surface) get their own outcome
 * instead of being counted as a crash (task 0048).
 */
const NETWORK_ERROR_PATTERN =
  /\bENOTFOUND\b|\bECONNREFUSED\b|\bECONNRESET\b|\bEAI_AGAIN\b|\bETIMEDOUT\b|\bgetaddrinfo\b|fetch failed|NetworkError/i;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** What one command run observably did, before it is labelled for the report. */
export type ProbeResult =
  | { kind: "bundle-failed"; error?: string; missing?: string[] }
  | { kind: "scene"; nodeCount: number; rootType: string }
  | { kind: "empty-menu-bar" }
  | {
      kind: "exit";
      code: number | null;
      signal: string | null;
      error?: { message: string; code?: string };
    }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "unsupported-mode"; reason: string }
  | { kind: "missing-arguments"; names: string[] };

export type CommandResult = {
  extension: string;
  command: string;
  mode: string;
  outcome: Outcome;
  /** Why a command did not render, when the outcome alone is not enough. */
  reason?: string | undefined;
  /** Unsupported-api: the API path. Capability-denied: the capability name. */
  path?: string | undefined;
  /** Rendered: nodes in the first scene and the root node's type. */
  nodes?: number | undefined;
  rootType?: string | undefined;
  /** Rendered with no root node: a menu-bar command that shows nothing. */
  empty?: true | undefined;
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
  /** The launch used placeholder values for required arguments and/or preferences. */
  placeholders?: PlaceholderKind | undefined;
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

/**
 * The probe for a runtime that exited on its own: how it exited and, when it
 * failed, the error it reported — including the structured `code` a
 * `UNSUPPORTED`/`UNSUPPORTED_API` failure carries, which is what the runtime
 * writes when it exits before its first scene.
 */
export function exitProbe(exit: {
  code: number | null;
  signal: string | null;
  error?: Error | undefined;
}): ProbeResult {
  const code = (exit.error as { code?: unknown } | undefined)?.code;
  return {
    kind: "exit",
    code: exit.code,
    signal: exit.signal,
    ...(exit.error
      ? {
          error: {
            message: exit.error.message,
            ...(typeof code === "string" ? { code } : {}),
          },
        }
      : {}),
  };
}

/** Minimal manifest shapes; anything else the manifest carries is ignored. */
export type ManifestOption = { title?: string; value?: string };
export type ManifestPreference = {
  name?: string;
  type?: string;
  required?: boolean;
  default?: Json;
  data?: ManifestOption[];
};
export type ManifestCommand = {
  name?: string;
  mode?: string;
  preferences?: ManifestPreference[];
  arguments?: { name: string; type?: string; required?: boolean; data?: ManifestOption[] }[];
};
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

/** Required launch arguments, sorted; the TUI smoke still reports these as not run. */
export function requiredArguments(manifest: Manifest, commandName: string): string[] {
  return (
    manifest.commands
      ?.find((command) => command.name === commandName)
      ?.arguments?.filter((argument) => argument.required)
      .map((argument) => argument.name)
      .toSorted() ?? []
  );
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

/** Required preferences with no manifest default: only a placeholder can supply them. */
export function requiredPreferences(manifest: Manifest, commandName: string): ManifestPreference[] {
  const command = manifest.commands?.find((item) => item?.name === commandName);
  // A command preference shadows the extension one of the same name.
  const declared = new Map<string, ManifestPreference>();
  for (const preference of [...(manifest.preferences ?? []), ...(command?.preferences ?? [])]) {
    if (typeof preference?.name === "string") declared.set(preference.name, preference);
  }
  const defaults = extractPreferenceDefaults(manifest, commandName);
  return [...declared.values()]
    .filter(
      (preference) => preference.required === true && !((preference.name as string) in defaults),
    )
    .toSorted((a, b) => (a.name as string).localeCompare(b.name as string));
}

export type PlaceholderKind = "arguments" | "preferences" | "both";

/** What a command is launched with, and which part of it is invented. */
export type LaunchInputs = {
  argumentValues: Record<string, string>;
  /** Manifest defaults plus placeholders for required preferences without one. */
  preferences: Record<string, Json>;
  placeholders?: PlaceholderKind;
  /** Directories the placeholder `file`/`directory` preferences point at; create before launch. */
  directories: string[];
  /** Required arguments no placeholder can stand in for (a dropdown with no options). */
  unsupplied: string[];
};

/**
 * Deterministic, offline stand-ins so a command that needs input still runs
 * and reports what it does (task 0086): text and password arguments are
 * `"blast"`, dropdowns take their first option; preferences are `"blast-smoke"`
 * for textfield/password, `false` for checkbox, the first option for dropdown,
 * `""` for appPicker, and a directory under `scratchDir` for file/directory.
 * Only required values without a manifest default are invented.
 */
export function launchInputs(
  manifest: Manifest,
  commandName: string,
  scratchDir: string,
): LaunchInputs {
  const command = manifest.commands?.find((item) => item?.name === commandName);
  const argumentValues: Record<string, string> = {};
  const unsupplied: string[] = [];
  for (const argument of (command?.arguments ?? [])
    .filter((item) => item.required)
    .toSorted((a, b) => a.name.localeCompare(b.name))) {
    if (argument.type === "dropdown") {
      const first = argument.data?.find((option) => typeof option?.value === "string")?.value;
      if (first === undefined) unsupplied.push(argument.name);
      else argumentValues[argument.name] = first;
    } else {
      argumentValues[argument.name] = "blast";
    }
  }
  const preferences: Record<string, Json> = extractPreferenceDefaults(manifest, commandName);
  const directories: string[] = [];
  const invented = requiredPreferences(manifest, commandName);
  for (const preference of invented) {
    const name = preference.name as string;
    switch (preference.type) {
      case "checkbox":
        preferences[name] = false;
        break;
      case "dropdown":
        preferences[name] =
          preference.data?.find((option) => typeof option?.value === "string")?.value ?? "";
        break;
      case "appPicker":
        preferences[name] = "";
        break;
      case "file":
      case "directory": {
        const directory = join(scratchDir, name);
        directories.push(directory);
        preferences[name] = directory;
        break;
      }
      default:
        preferences[name] = "blast-smoke";
    }
  }
  const usedArguments = Object.keys(argumentValues).length > 0;
  const usedPreferences = invented.length > 0;
  return {
    argumentValues,
    preferences: sortedKeys(preferences),
    ...(usedArguments || usedPreferences
      ? {
          placeholders:
            usedArguments && usedPreferences
              ? ("both" as const)
              : usedArguments
                ? ("arguments" as const)
                : ("preferences" as const),
        }
      : {}),
    directories,
    unsupplied,
  };
}

/** Report header lines shared by the smoke reports: the placeholder rules. */
export const PLACEHOLDER_NOTE = [
  "Required launch arguments and preferences without a default get deterministic",
  "placeholders, so the outcome is what the command really does with them (the `Inputs`",
  "column): text/password arguments `blast`, dropdown arguments their first option;",
  "textfield/password preferences `blast-smoke`, checkbox `false`, dropdown the first",
  "option, appPicker empty, file/directory a scratch directory.",
];

/** `N commands ran with placeholder inputs (...)`, or an empty string when none did. */
export function placeholderSummary(results: readonly { placeholders?: PlaceholderKind | undefined }[]): string {
  const count = (kind: PlaceholderKind): number =>
    results.filter((result) => result.placeholders === kind).length;
  const total = results.filter((result) => result.placeholders !== undefined).length;
  return total === 0
    ? ""
    : `${total} ran with placeholder inputs (arguments ${count("arguments")}, preferences ${count("preferences")}, both ${count("both")}).`;
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
  placeholders?: PlaceholderKind | undefined;
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
  set({ placeholders: input.placeholders });
  const probe = input.probe;
  switch (probe.kind) {
    case "scene":
      return set({ outcome: "rendered", nodes: probe.nodeCount, rootType: probe.rootType });
    case "empty-menu-bar":
      // Raycast shows an empty menu bar when the command renders null, so this
      // is a rendered command, not a timeout.
      return set({ outcome: "rendered", empty: true });
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
    case "missing-arguments":
      return set({
        outcome: "missing-arguments",
        reason: `requires launch arguments: ${probe.names.join(", ")}; not run`,
      });
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
      // The runtime reports a broker denial as a plain crash whose message
      // names the capability (see createBroker); surface it as its own outcome.
      const denied = /^Capability denied: (.+)$/.exec(probe.error?.message ?? "");
      if (denied) {
        return set({
          outcome: "capability-denied",
          path: denied[1]!,
          error: probe.error?.message,
        });
      }
      if (probe.code === 0 && probe.signal === null && probe.error === undefined) {
        // A clean exit without a scene is normal for modes that never render
        // (no-view); for a view command it means the scene never arrived.
        return input.mode === "view"
          ? set({ outcome: "crashed", reason: "exited without publishing a scene" })
          : set({
              outcome: "completed",
              reason: `command mode "${input.mode}" completed without rendering a scene`,
            });
      }
      if (NETWORK_ERROR_PATTERN.test(probe.error?.message ?? "")) {
        return set({
          outcome: "network",
          exit: formatExit(probe),
          error: probe.error?.message,
          logs: compactLines(input.errorLogs ?? []),
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
      return `${
        result.empty === true ? "empty menu bar" : `${result.nodes} nodes, root ${result.rootType}`
      }${warnings}`;
    case "bundle-failed":
      return `${result.missing ? `missing ${result.missing.join(", ")}` : result.error}${warnings}`;
    case "crashed":
      return `${[result.reason, result.exit, result.error].filter(Boolean).join("; ") || "crashed"}${warnings}`;
    case "network":
      return `${[result.exit, result.error].filter(Boolean).join("; ") || "network error"}${warnings}`;
    case "unsupported-api":
      return `${result.path}${warnings}`;
    case "capability-denied":
      return `denied capability ${result.path}${warnings}`;
    case "timeout":
    case "unsupported-mode":
    case "missing-arguments":
      return `${result.reason}${warnings}`;
    case "completed":
      return `${result.reason ?? "completed without rendering a scene"}${warnings}`;
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
    `\`${report.commit}\`, with Blast's headless broker — deny-all except the`,
    "headless defaults `applications.list` (empty), `clipboard.read` (empty),",
    "`preferences.open` and `command.metadata` (recorded) — and manifest preference defaults.",
    ...PLACEHOLDER_NOTE,
    "Regenerate with `bun run corpus:smoke` (network required; not part of",
    "`bun run verify`).",
    "",
    `${report.results.length} commands: ${OUTCOMES.map((outcome) => `${outcome} ${count(outcome)}`).join(", ")}.`,
    ...(placeholderSummary(report.results) === "" ? [] : [placeholderSummary(report.results)]),
    "",
    "| Command | Mode | Outcome | Inputs | Detail |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const result of report.results) {
    lines.push(
      `| \`${result.extension}/${result.command}\` | ${result.mode} | ${result.outcome} | ${result.placeholders ?? ""} | ${compactLine(detail(result))} |`,
    );
  }
  const failures = report.results.filter(
    (result) => result.outcome !== "rendered" && result.outcome !== "completed",
  );
  if (failures.length > 0 || report.extensionFailures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of report.extensionFailures) {
      lines.push(`- \`${failure.extension}\`: unreadable manifest — ${compactLine(failure.error)}`);
    }
    for (const result of failures) {
      lines.push(
        `- \`${result.extension}/${result.command}\` (${result.outcome}${
          result.placeholders === undefined ? "" : `, placeholder ${result.placeholders}`
        }): ${compactLine(detail(result))}`,
      );
      for (const log of result.logs ?? []) lines.push(`  - log: ${log}`);
      for (const warning of result.warnings ?? []) lines.push(`  - warning: ${warning}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
