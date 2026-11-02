// Pure planning and aggregation for the sandboxed corpus sweep. The runner
// owns git, processes and files; keeping these rules here makes selection,
// resume and report-size guarantees deterministic and testable.
import { OUTCOMES, type CommandResult, type Outcome } from "./smoke.ts";

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
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const take = (flag: string): string => {
      const value = arg.startsWith(`${flag}=`) ? arg.slice(flag.length + 1) : argv[++index];
      if (value === undefined || value === "") throw new Error(`${flag} needs a value`);
      return value;
    };
    if (arg === "--resume") resume = true;
    else if (arg === "--unsandboxed") unsandboxed = true;
    else if (arg === "--limit" || arg.startsWith("--limit="))
      limit = positiveInt(take("--limit"), "--limit");
    else if (arg === "--seed" || arg.startsWith("--seed=")) seed = take("--seed");
    else if (arg === "--jobs" || arg.startsWith("--jobs="))
      jobs = positiveInt(take("--jobs"), "--jobs");
    else
      throw new Error(
        `unknown argument ${arg}; usage: corpus:sweep [--limit N] [--seed S] [--jobs N] [--resume] [--unsandboxed]`,
      );
  }
  return { ...(limit === undefined ? {} : { limit }), seed, jobs, resume, unsandboxed };
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
  return normalized(result.error ?? result.reason ?? result.outcome);
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

export function buildSweepReport(input: {
  commit: string;
  seed: string;
  selectedExtensions: number;
  results: readonly CommandResult[];
  peakBytes: number;
  wallMs: number;
  resumed?: number;
  fullPopulation?: number;
}): SweepReport {
  const totals = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<
    Outcome,
    number
  >;
  for (const result of input.results) totals[result.outcome] += 1;
  const renderedMinutes = input.wallMs / 60000;
  const commandsPerMinute = renderedMinutes > 0 ? input.results.length / renderedMinutes : 0;
  const projectedFullRunMinutes =
    input.fullPopulation && input.selectedExtensions > 0
      ? renderedMinutes * (input.fullPopulation / input.selectedExtensions)
      : undefined;
  return {
    commit: input.commit,
    seed: input.seed,
    selectedExtensions: input.selectedExtensions,
    commands: input.results.length,
    totals,
    failures: ranked(
      input.results.flatMap((result) => {
        const signature = failureSignature(result);
        return signature === undefined ? [] : [signature];
      }),
    ),
    capabilities: ranked(
      input.results.flatMap((result) => {
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
  const lines = [
    "# Corpus sweep report",
    "",
    `Corpus commit \`${report.commit}\`; seed \`${report.seed}\`; ${report.selectedExtensions} selected extensions and ${report.commands} commands (${total} command records).`,
    `Peak .cache ${mb(report.peakBytes)}; wall time ${(report.wallMs / 1000).toFixed(0)} s; ${report.commandsPerMinute.toFixed(2)} commands/min; ${report.resumed} resumed command(s).`,
    report.projectedFullRunMinutes === undefined
      ? ""
      : `Projected full population: ${(report.projectedFullRunMinutes / 60).toFixed(1)} h; projected peak ${mb(report.projectedFullRunPeakBytes ?? report.peakBytes)}.`,
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
    "The per-command log remains in `.cache/sweep/results.jsonl` and is intentionally not committed.",
    "",
  ];
  if (lines.length > MAX_SWEEP_MARKDOWN_LINES) throw new Error("compat/SWEEP.md exceeds 300 lines");
  return lines.join("\n");
}
