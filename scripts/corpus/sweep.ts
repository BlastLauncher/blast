// Pure planning and aggregation for the sandboxed corpus sweep. The runner
// owns git, processes and files; keeping these rules here makes selection,
// resume and report-size guarantees deterministic and testable.
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import {
  ACTION_OUTCOMES,
  OUTCOMES,
  sanitizeReportText,
  type ActionOutcome,
  type CommandResult,
  type Outcome,
} from "./smoke.ts";

export const SWEEP_JSON = "compat/sweep.json";
export const SWEEP_MD = "compat/SWEEP.md";
export const SWEEP_LOG = ".cache/sweep/results.jsonl";
export const DEFAULT_SWEEP_LIMIT = 100;
export const DEFAULT_SWEEP_JOBS = 2;
export const MAX_SWEEP_JSON_BYTES = 200 * 1024;
export const MAX_SWEEP_MARKDOWN_LINES = 300;

export type SweepOptions = {
  limit?: number;
  seed: string;
  jobs: number;
  resume: boolean;
  unsandboxed: boolean;
  probeActions: boolean;
};

export type SweepLogEntry = {
  extension: string;
  command: string;
  result: CommandResult;
};

export type RankedCause = { signature: string; commands: number };

export type SweepReport = {
  commit: string;
  seed: string;
  selectedExtensions: number;
  commands: number;
  totals: Record<Outcome, number>;
  failures: RankedCause[];
  capabilities: RankedCause[];
  peakBytes: number;
  wallMs: number;
  commandsPerMinute: number;
  resumed: number;
  projectedFullRunMinutes?: number;
  projectedFullRunPeakBytes?: number;
  primaryActionProbe?: PrimaryActionReport;
};

export type PrimaryActionCause = { signature: string; commands: number };
export type PrimaryActionReport = {
  commands: number;
  totals: Record<ActionOutcome, number>;
  crashCauses: PrimaryActionCause[];
  renderOnlyCrashRate: number;
  renderOnlyCrashNumerator: number;
  renderOnlyCrashDenominator: number;
  actionCrashRate: number;
  actionCrashNumerator: number;
  actionCrashDenominator: number;
  probeRuntimeMsPerDispatchedCommand: number;
};

function positiveInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} must be a positive integer`);
  return value;
}

export function parseSweepArgs(argv: string[]): SweepOptions {
  let limit: number | undefined;
  let seed = "0";
  let jobs = DEFAULT_SWEEP_JOBS;
  let resume = false;
  let unsandboxed = false;
  let probeActions = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const take = (flag: string): string => {
      const value = arg.startsWith(`${flag}=`) ? arg.slice(flag.length + 1) : argv[++index];
      if (value === undefined || value === "") throw new Error(`${flag} needs a value`);
      return value;
    };
    if (arg === "--resume") resume = true;
    else if (arg === "--unsandboxed") unsandboxed = true;
    else if (arg === "--probe-actions") probeActions = true;
    else if (arg === "--limit" || arg.startsWith("--limit="))
      limit = positiveInt(take("--limit"), "--limit");
    else if (arg === "--seed" || arg.startsWith("--seed=")) seed = take("--seed");
    else if (arg === "--jobs" || arg.startsWith("--jobs="))
      jobs = positiveInt(take("--jobs"), "--jobs");
    else
      throw new Error(
        `unknown argument ${arg}; usage: corpus:sweep [--limit N] [--seed S] [--jobs N] [--resume] [--unsandboxed] [--probe-actions]`,
      );
  }
  return {
    ...(limit === undefined ? {} : { limit }),
    seed,
    jobs,
    resume,
    unsandboxed,
    probeActions,
  };
}

/** FNV-1a gives a portable deterministic ranking without depending on RNG state. */
export function rankExtensions(names: readonly string[], seed: string): string[] {
  const hash = (name: string): number => {
    let value = 2166136261;
    for (const char of `${seed}\0${name}`) {
      value ^= char.codePointAt(0)!;
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  };
  return [...new Set(names)].toSorted((a, b) => hash(a) - hash(b) || a.localeCompare(b));
}

export function selectExtensions(
  names: readonly string[],
  limit: number | undefined,
  seed: string,
): string[] {
  const ordered = rankExtensions(names, seed);
  return limit === undefined ? ordered : ordered.slice(0, limit);
}

/** Select only the extensions whose 0093 scan verdict is satisfied. */
export function selectSatisfiedExtensions(
  names: readonly string[],
  satisfied: readonly string[],
  limit: number | undefined,
  seed: string,
): string[] {
  const allowed = new Set(satisfied);
  return selectExtensions(
    names.filter((name) => allowed.has(name)),
    limit,
    seed,
  );
}

export function resultKey(extension: string, command: string): string {
  return `${extension}\0${command}`;
}

export function parseSweepLog(text: string): Map<string, SweepLogEntry> {
  const entries = new Map<string, SweepLogEntry>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
      const source = value as Record<string, unknown>;
      if (typeof source.extension !== "string" || typeof source.command !== "string") continue;
      if (typeof source.result !== "object" || source.result === null) continue;
      entries.set(resultKey(source.extension, source.command), {
        extension: source.extension,
        command: source.command,
        result: source.result as CommandResult,
      });
    } catch {
      // An interrupted final write is ignored; completed lines remain resumable.
    }
  }
  return entries;
}

function normalized(value: string): string {
  return value
    .replace(/(?:\/Users\/[^/]+|\/private\/tmp|\/tmp)\/[^\s;,)]+/g, "<path>")
    .replace(/\b\d+(?:\.\d+)?\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function failureSignature(result: CommandResult): string | undefined {
  if (result.outcome === "rendered" || result.outcome === "completed") return undefined;
  const detail =
    result.error ??
    result.reason ??
    (result.missing === undefined
      ? undefined
      : `missing dependencies: ${result.missing.join(", ")}`);
  return normalized(detail ?? result.outcome);
}

export function capabilitySignature(result: CommandResult): string | undefined {
  return result.outcome === "capability-denied" || result.outcome === "unsupported-api"
    ? result.path
    : undefined;
}

function ranked(values: Iterable<string>): RankedCause[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([signature, commands]) => ({ signature, commands }))
    .toSorted((a, b) => b.commands - a.commands || a.signature.localeCompare(b.signature));
}

// The repository root (often a worktree under home) and per-command scratch
// names must not reach committed reports; only the home prefix was redacted.
const repoRoots: Array<[string, string]> = [
  ...new Set([process.cwd(), realpathSync(process.cwd())]),
].map((root) => [root, "<repo>"]);

function sanitizeText(value: string): string {
  return sanitizeReportText(value, repoRoots, homedir())
    .replace(/\/Users\/[^/\s]+/g, "<home>")
    .replace(/<repo>\/\.cache\/sweep\/scratch\/[^/\s]+/g, "<scratch>");
}

function sanitizeResult(result: CommandResult): CommandResult {
  const clean = sanitizeText;
  const action = result.action;
  return {
    ...result,
    ...(result.reason === undefined ? {} : { reason: clean(result.reason) }),
    ...(result.path === undefined ? {} : { path: clean(result.path) }),
    ...(result.error === undefined ? {} : { error: clean(result.error) }),
    ...(result.exit === undefined ? {} : { exit: clean(result.exit) }),
    ...(result.logs === undefined ? {} : { logs: result.logs.map(clean) }),
    ...(result.warnings === undefined ? {} : { warnings: result.warnings.map(clean) }),
    ...(result.missing === undefined ? {} : { missing: result.missing.map(clean) }),
    ...(action === undefined
      ? {}
      : {
          action: {
            ...action,
            ...(action.capability === undefined ? {} : { capability: clean(action.capability) }),
            ...(action.reason === undefined ? {} : { reason: clean(action.reason) }),
            ...(action.error === undefined ? {} : { error: clean(action.error) }),
          },
        }),
  };
}

function actionCrashSignature(result: CommandResult): string | undefined {
  if (result.action?.outcome !== "crashed") return undefined;
  return normalized(result.action.error ?? result.action.reason ?? "crashed");
}

export function buildSweepReport(input: {
  commit: string;
  seed: string;
  selectedExtensions: number;
  results: readonly CommandResult[];
  peakBytes: number;
  wallMs: number;
  resumed?: number;
  fullPopulation?: number;
  probeActions?: boolean;
}): SweepReport {
  const totals = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<
    Outcome,
    number
  >;
  const results = input.results.map(sanitizeResult);
  for (const result of results) totals[result.outcome] += 1;
  const renderedMinutes = input.wallMs / 60000;
  const commandsPerMinute = renderedMinutes > 0 ? results.length / renderedMinutes : 0;
  const projectedFullRunMinutes =
    input.fullPopulation && input.selectedExtensions > 0
      ? renderedMinutes * (input.fullPopulation / input.selectedExtensions)
      : undefined;
  const actionResults = results.flatMap((result) => (result.action ? [result.action] : []));
  const actionTotals = Object.fromEntries(ACTION_OUTCOMES.map((outcome) => [outcome, 0])) as Record<
    ActionOutcome,
    number
  >;
  for (const action of actionResults) actionTotals[action.outcome] += 1;
  const renderOnlyCrashNumerator = results.filter((result) => result.outcome === "crashed").length;
  const dispatchedActions = actionResults.filter((action) => action.dispatched === true);
  const actionRuntime = dispatchedActions.reduce((sum, action) => sum + (action.elapsedMs ?? 0), 0);
  const actionCrashNumerator = dispatchedActions.filter(
    (action) => action.outcome === "crashed",
  ).length;
  const primaryActionProbe =
    input.probeActions === true
      ? {
          commands: actionResults.length,
          totals: actionTotals,
          crashCauses: ranked(
            results.flatMap((result) => {
              const signature = actionCrashSignature(result);
              return signature === undefined ? [] : [signature];
            }),
          ),
          renderOnlyCrashRate: results.length === 0 ? 0 : renderOnlyCrashNumerator / results.length,
          renderOnlyCrashNumerator,
          renderOnlyCrashDenominator: results.length,
          actionCrashRate:
            dispatchedActions.length === 0 ? 0 : actionCrashNumerator / dispatchedActions.length,
          actionCrashNumerator,
          actionCrashDenominator: dispatchedActions.length,
          probeRuntimeMsPerDispatchedCommand:
            dispatchedActions.length === 0 ? 0 : actionRuntime / dispatchedActions.length,
        }
      : undefined;
  return {
    commit: input.commit,
    seed: input.seed,
    selectedExtensions: input.selectedExtensions,
    commands: results.length,
    totals,
    failures: ranked(
      results.flatMap((result) => {
        const signature = failureSignature(result);
        return signature === undefined ? [] : [signature];
      }),
    ),
    capabilities: ranked(
      results.flatMap((result) => {
        const signature = capabilitySignature(result);
        return signature === undefined ? [] : [signature];
      }),
    ),
    peakBytes: input.peakBytes,
    wallMs: input.wallMs,
    commandsPerMinute,
    resumed: input.resumed ?? 0,
    ...(projectedFullRunMinutes === undefined ? {} : { projectedFullRunMinutes }),
    ...(input.fullPopulation === undefined ? {} : { projectedFullRunPeakBytes: input.peakBytes }),
    ...(primaryActionProbe === undefined ? {} : { primaryActionProbe }),
  };
}

export function renderSweepJson(report: SweepReport): string {
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_SWEEP_JSON_BYTES)
    throw new Error("compat/sweep.json exceeds 200 KB");
  return text;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function renderSweepMarkdown(report: SweepReport): string {
  const total = Object.values(report.totals).reduce((sum, value) => sum + value, 0);
  const resumed = report.resumed > 0;
  const lines = [
    "# Corpus sweep report",
    "",
    `Corpus commit \`${report.commit}\`; seed \`${report.seed}\`; ${report.selectedExtensions} selected extensions and ${report.commands} commands (${total} command records).`,
    resumed
      ? `${report.resumed} resumed command(s).`
      : `Peak .cache ${mb(report.peakBytes)}; wall time ${(report.wallMs / 1000).toFixed(0)} s; ${report.commandsPerMinute.toFixed(2)} commands/min; 0 resumed command(s).`,
    ...(resumed
      ? [
          "This is a resumed run: wall time, throughput, peak and projected-full-population values are partial-run artifacts; use a clean run (or per-batch timing) for those metrics.",
        ]
      : []),
    "Rendered means a first scene was published; it does not assert that the command works with live data or actions.",
    // Omitted entirely, not left as "", so the markdown has no double blank line.
    ...(resumed || report.projectedFullRunMinutes === undefined
      ? []
      : [
          `Projected full population: ${(report.projectedFullRunMinutes / 60).toFixed(1)} h; projected peak ${mb(report.projectedFullRunPeakBytes ?? report.peakBytes)}.`,
        ]),
    "",
    "## Outcomes",
    "",
    ...OUTCOMES.map((outcome) => `- ${outcome}: ${report.totals[outcome]} command(s)`),
    "",
    "## Failure causes",
    "",
    ...(report.failures.length
      ? report.failures.map((row) => `- ${row.commands} command(s): ${row.signature}`)
      : ["- none"]),
    "",
    "## Unsupported and denied capabilities",
    "",
    ...(report.capabilities.length
      ? report.capabilities.map((row) => `- ${row.commands} command(s): ${row.signature}`)
      : ["- none"]),
    "",
    ...(report.primaryActionProbe === undefined
      ? []
      : [
          "## Primary action probe",
          "",
          `${report.primaryActionProbe.commands} rendered command(s) were probed through client-core; a denied capability counts as working as far as a headless run can show.`,
          `Render-only crash rate ${report.primaryActionProbe.renderOnlyCrashNumerator}/${report.primaryActionProbe.renderOnlyCrashDenominator} (${(report.primaryActionProbe.renderOnlyCrashRate * 100).toFixed(1)}%); after the primary action ${report.primaryActionProbe.actionCrashNumerator}/${report.primaryActionProbe.actionCrashDenominator} dispatched (${(report.primaryActionProbe.actionCrashRate * 100).toFixed(1)}%); probe time ${report.primaryActionProbe.probeRuntimeMsPerDispatchedCommand.toFixed(1)} ms/dispatched command.`,
          "",
          ...ACTION_OUTCOMES.map(
            (outcome) => `- ${outcome}: ${report.primaryActionProbe!.totals[outcome]} command(s)`,
          ),
          "",
          "### Primary action crash causes",
          "",
          ...(report.primaryActionProbe.crashCauses.length
            ? report.primaryActionProbe.crashCauses.map(
                (row) => `- ${row.commands} command(s): ${row.signature}`,
              )
            : ["- none"]),
          "",
        ]),
    "The per-command log remains in `.cache/sweep/results.jsonl` and is intentionally not committed.",
    "",
  ];
  if (lines.length > MAX_SWEEP_MARKDOWN_LINES) throw new Error("compat/SWEEP.md exceeds 300 lines");
  return lines.join("\n");
}
