// Pure logic for the TUI corpus smoke runner (`tui-smoke-run.ts`): what a
// captured frame says about the command that produced it, the TUI's
// unknown-node placeholders, the frame excerpts kept for triage, what a
// `console.error` call means for the run, and the deterministic JSON/markdown
// reports. Nothing here renders, spawns or reads the corpus, so every rule is
// unit-testable offline; the real run needs network and the corpus checkout.
import {
  OUTCOMES,
  PLACEHOLDER_NOTE,
  placeholderSummary,
  type PlaceholderKind,
  buildResult,
  compactLine,
  type CommandResult,
  type Outcome,
  type ProbeResult,
} from "./smoke.ts";

/**
 * The outcomes only the TUI run can produce: the runtime did publish a scene,
 * so the question is what the terminal then drew. `rendered` is first because
 * it is the one this table exists to count.
 */
export const FRAME_OUTCOMES = ["rendered", "placeholder", "client-error", "empty"] as const;
export type FrameOutcome = (typeof FRAME_OUTCOMES)[number];
export type TuiOutcome = FrameOutcome | Outcome;

/** Every outcome this run reports, frame outcomes first (the headline order). */
export const TUI_OUTCOMES: readonly TuiOutcome[] = [
  ...FRAME_OUTCOMES,
  ...OUTCOMES.filter((outcome) => !(FRAME_OUTCOMES as readonly string[]).includes(outcome)),
];

/** Frame lines kept per non-rendered command. */
export const FRAME_EXCERPT_LINES = 3;

/**
 * The node types the TUI printed its `[Unsupported: Node]` row for, sorted and
 * deduplicated (see `view.ts` and `form.tsx`: a scene node the client has no
 * renderer for, and a Form field type it does not know).
 */
export function placeholderTypes(frame: string): string[] {
  const types = new Set<string>();
  for (const match of frame.matchAll(/\[Unsupported: ([^\]\n]*)\]/g)) {
    const type = (match[1] ?? "").trim();
    if (type !== "") types.add(type);
  }
  return [...types].toSorted();
}

/**
 * A frame's lines, without the right padding every line is rendered with and
 * without blank lines, so two frames can be compared and excerpted regardless
 * of the terminal width they were captured at.
 */
export function frameLines(frame: string): string[] {
  return frame
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
}

/** Whether the frame drew anything at all. */
export function normalizeFrame(frame: string): string {
  return frameLines(frame).join("\n").trim();
}

/** Up to `limit` leading lines of a frame, flattened for a report cell. */
export function frameExcerpt(frame: string, limit = FRAME_EXCERPT_LINES): string[] {
  return frameLines(frame)
    .slice(0, limit)
    .map((line) => compactLine(line));
}

/**
 * The TUI error a `console.error` call reports, if any. React hands an error
 * its boundary caught to the root's `onCaughtError`, which OpenTUI's test
 * renderer wires to `console.error`; its key handler catches a throwing
 * listener and logs it under a `[KeyHandler]` prefix. Everything else the
 * renderer or React logs there (act warnings, stdin-parser flushes) is noise
 * for this report, so only those two shapes count.
 */
export function consoleError(args: unknown[]): string | undefined {
  const error = args.find((arg): arg is Error => arg instanceof Error);
  if (error === undefined) return undefined;
  // React reports as `console.error(error, errorInfo)`.
  if (args[0] === error) return error.message;
  const label = args.find((arg): arg is string => typeof arg === "string");
  return label?.startsWith("[KeyHandler]") ? error.message : undefined;
}

export type FrameProbe = {
  kind: "frame";
  /** The frame the scene produced, the one the outcome is read from. */
  frame: string;
  /** The last frame captured, which a key error is excerpted from. */
  lastFrame?: string | undefined;
  /** Sanitized message of the first exception thrown while rendering or on a key. */
  error?: string | undefined;
  /** Nodes in the scene the frame came from. */
  nodes?: number | undefined;
  rootType?: string | undefined;
};

/** What one command observably did: a frame, or a headless probe result. */
export type TuiProbe = FrameProbe | ProbeResult;

export type TuiResult = {
  extension: string;
  command: string;
  mode: string;
  outcome: TuiOutcome;
  /** Why a command did not render, when the outcome alone is not enough. */
  reason?: string | undefined;
  /** Unsupported-api: the API path. Capability-denied: the capability. */
  path?: string | undefined;
  /** Rendered: nodes in the scene and the root node's type. */
  nodes?: number | undefined;
  rootType?: string | undefined;
  /** Bundle-failed with a MISSING_DEPENDENCY error: the absent packages. */
  missing?: string[] | undefined;
  /** Bundle-failed esbuild message, crash error, or the client error. */
  error?: string | undefined;
  /** Crashed: how the runtime exited, e.g. "code 3" or "signal SIGKILL". */
  exit?: string | undefined;
  /** Crashed: the last error-level log lines. */
  logs?: string[] | undefined;
  /** Runtime warnings such as dropped non-serializable props. */
  warnings?: string[] | undefined;
  /** Placeholder: the node types the TUI could not render. */
  unsupportedNodes?: string[] | undefined;
  /** Required launch inputs supplied by the smoke runner. */
  placeholders?: PlaceholderKind | undefined;
  /** Not rendered: up to three sanitized lines of the frame. */
  frame?: string[] | undefined;
};

export type TuiReport = {
  commit: string;
  width: number;
  height: number;
  totals: Record<TuiOutcome, number>;
  results: TuiResult[];
  extensionFailures: { extension: string; error: string }[];
};

export type BuildTuiInput = {
  extension: string;
  command: string;
  mode: string;
  probe: TuiProbe;
  placeholders?: PlaceholderKind | undefined;
  /** Runtime warnings, already sanitized, deduplicated and capped. */
  warnings?: string[] | undefined;
  /** Error-level log lines, already sanitized and capped to the last ones. */
  errorLogs?: string[] | undefined;
};

/**
 * Label one probe. A frame probe is the TUI's own verdict on what it drew;
 * every other probe is the headless smoke's, so a command that never produced
 * a frame is reported exactly as `compat/SMOKE.md` reports it.
 */
export function buildTuiResult(input: BuildTuiInput): TuiResult {
  const base = {
    extension: input.extension,
    command: input.command,
    mode: input.mode,
    ...(input.placeholders === undefined ? {} : { placeholders: input.placeholders }),
  };
  const probe = input.probe;
  if (probe.kind !== "frame") {
    const headless: CommandResult = buildResult({
      extension: input.extension,
      command: input.command,
      mode: input.mode,
      probe,
      warnings: input.warnings,
      errorLogs: input.errorLogs,
    });
    return {
      ...base,
      outcome: headless.outcome,
      reason: headless.reason,
      path: headless.path,
      nodes: headless.nodes,
      rootType: headless.rootType,
      missing: headless.missing,
      error: headless.error,
      exit: headless.exit,
      logs: headless.logs,
      warnings: headless.warnings,
    };
  }
  const warnings = input.warnings?.length ? input.warnings : undefined;
  // A thrown exception can happen at any point of the key sequence and is the
  // most specific thing the run can report, so it wins over the frame.
  if (probe.error !== undefined)
    return {
      ...base,
      outcome: "client-error",
      error: probe.error,
      frame: frameExcerpt(probe.lastFrame ?? probe.frame),
      warnings,
    };
  const placeholders = placeholderTypes(probe.frame);
  if (placeholders.length > 0)
    return {
      ...base,
      outcome: "placeholder",
      unsupportedNodes: placeholders,
      frame: frameExcerpt(probe.frame),
      warnings,
    };
  if (normalizeFrame(probe.frame) === "")
    return {
      ...base,
      outcome: "empty",
      reason: "the scene arrived but the frame has no text",
      frame: frameExcerpt(probe.frame),
      warnings,
    };
  return {
    ...base,
    outcome: "rendered",
    nodes: probe.nodes,
    rootType: probe.rootType,
    warnings,
  };
}

/** Assemble the committed report: sorted results and per-outcome totals. */
export function buildTuiReport(
  commit: string,
  results: TuiResult[],
  width: number,
  height: number,
  extensionFailures: { extension: string; error: string }[] = [],
): TuiReport {
  const totals = Object.fromEntries(TUI_OUTCOMES.map((outcome) => [outcome, 0])) as Record<
    TuiOutcome,
    number
  >;
  for (const result of results) totals[result.outcome]! += 1;
  return {
    commit,
    width,
    height,
    totals,
    results: [...results].toSorted(
      (a, b) => a.extension.localeCompare(b.extension) || a.command.localeCompare(b.command),
    ),
    extensionFailures: [...extensionFailures].toSorted((a, b) =>
      a.extension.localeCompare(b.extension),
    ),
  };
}

function detail(result: TuiResult): string {
  const warnings = result.warnings === undefined ? "" : `; ${result.warnings.length} warning(s)`;
  switch (result.outcome) {
    case "rendered":
      return `${
        result.nodes === undefined
          ? "frame has text"
          : `${result.nodes} nodes, root ${result.rootType}`
      }${warnings}`;
    case "placeholder":
      return `node types: ${result.unsupportedNodes?.join(", ")}${warnings}`;
    case "client-error":
      return `${result.error}${warnings}`;
    case "empty":
    case "bundle-timeout":
    case "timeout":
    case "unsupported-mode":
    case "missing-arguments":
      return `${result.reason}${warnings}`;
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
    case "completed":
      return `${result.reason ?? "completed without rendering a scene"}${warnings}`;
  }
}

/** The outcomes that are not the command rendering in the TUI. */
export function isFailure(result: TuiResult): boolean {
  return result.outcome !== "rendered";
}

export function renderTuiJson(report: TuiReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderTuiMarkdown(report: TuiReport): string {
  const count = (outcome: TuiOutcome): number => report.totals[outcome] ?? 0;
  const lines: string[] = [
    "# TUI corpus smoke report",
    "",
    `Every command of the curated extensions at corpus commit \`${report.commit}\`, rendered in`,
    `the TUI \`App\` through OpenTUI's test renderer at ${report.width}×${report.height} — the`,
    "same headless broker as `compat/SMOKE.md` (deny-all except `applications.list`,",
    "`clipboard.read`, `preferences.open` and `command.metadata`) and the same manifest",
    "preference defaults.",
    ...PLACEHOLDER_NOTE,
    "",
    "Each command is classified from the first frame its first scene produced, then ↓, Ctrl-K",
    "and Esc are pressed and the frame after each key is captured. `rendered` means the frame",
    "had text and nothing threw; `placeholder` means the frame printed the TUI's",
    "`[Unsupported: Node]` row for a node it cannot render; `client-error` means TUI code threw",
    "while rendering or on a key; `empty` means the scene arrived but the frame had no text.",
    "The other outcomes are the headless smoke's, for a command whose frame never appeared.",
    "The failure list below repeats every command that did not render, with its frame excerpt.",
    "Regenerate with `bun run corpus:tui-smoke` (network required; not part of",
    "`bun run verify`).",
    "",
    `${report.results.length} commands: ${TUI_OUTCOMES.map(
      (outcome) => `${outcome} ${count(outcome)}`,
    ).join(", ")}.`,
    ...[placeholderSummary(report.results)].filter(Boolean),
    "",
    "| Command | Mode | Outcome | Inputs | Detail |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const result of report.results) {
    lines.push(
      `| \`${result.extension}/${result.command}\` | ${result.mode} | ${result.outcome} | ${result.placeholders ?? "—"} | ${compactLine(detail(result))} |`,
    );
  }
  const failures = report.results.filter(isFailure);
  if (failures.length > 0 || report.extensionFailures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of report.extensionFailures) {
      lines.push(`- \`${failure.extension}\`: unreadable manifest — ${compactLine(failure.error)}`);
    }
    for (const result of failures) {
      lines.push(
        `- \`${result.extension}/${result.command}\` (${result.outcome}): ${compactLine(detail(result))}`,
      );
      for (const line of result.frame ?? []) lines.push(`  - frame: ${line}`);
      for (const log of result.logs ?? []) lines.push(`  - log: ${log}`);
      for (const warning of result.warnings ?? []) lines.push(`  - warning: ${warning}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
