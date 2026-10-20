// Pure logic for the dependency-heavy smoke runner (`smoke-deps-run.ts`, task
// 0070): install-failure classification, the extra outcomes an installed run
// can produce, the "top failures" grouping and the deterministic JSON/markdown
// reports. The per-command classification is `smoke.ts`'s; nothing here spawns
// processes, touches the network or reads the corpus checkout, so every rule is
// unit-testable offline.
import {
  compactLine,
  extractPreferenceDefaults,
  type CommandResult,
  type Manifest,
  type ManifestPreference,
} from "./smoke.ts";

export const DEPS_OUTCOMES = [
  "rendered",
  "completed",
  "install-failed",
  "bundle-failed",
  "crashed",
  "needs-arguments",
  "needs-preferences",
  "capability-denied",
  "network",
  "timeout",
  "unsupported-api",
  "unsupported-mode",
] as const;
export type DepsOutcome = (typeof DEPS_OUTCOMES)[number];

export const INSTALL_REASONS = [
  "lockfile",
  "engine",
  "peer",
  "network",
  "registry",
  "timeout",
  "disk-budget",
  "other",
] as const;
export type InstallReason = (typeof INSTALL_REASONS)[number];

export type DepsResult = Omit<CommandResult, "outcome"> & {
  outcome: DepsOutcome;
  /** Install-failed: why the install failed. */
  installReason?: InstallReason | undefined;
};

export type InstallRecord = {
  extension: string;
  /** The unprovided dependencies the selection filed the extension under. */
  packages: string[];
  status: "installed" | "failed";
  ms: number;
  /** Apparent size of the install directory, even for a failed or aborted install. */
  bytes: number;
  reason?: InstallReason | undefined;
  /** Last error lines of the install, sanitized. */
  error?: string | undefined;
  /** Declared packages still unresolved after a successful install. */
  unresolved?: string[] | undefined;
};

export type DepsReport = {
  commit: string;
  totals: Record<DepsOutcome, number>;
  installs: InstallRecord[];
  results: DepsResult[];
  extensionFailures: { extension: string; error: string }[];
  /** Largest apparent size of `.cache` seen during the run. */
  peakBytes: number;
  wallMs: number;
};

/**
 * Why an npm install failed, from what it printed. Lines are checked in a fixed
 * order because one failure can carry several signatures (an `ERESOLVE` message
 * mentions the lockfile). A timeout or the disk guard is decided by the runner,
 * not by the text.
 */
export function classifyInstallFailure(
  output: string,
  flags: { timedOut?: boolean; overBudget?: boolean } = {},
): InstallReason {
  if (flags.overBudget) return "disk-budget";
  if (flags.timedOut) return "timeout";
  if (/EBADENGINE|Unsupported engine/i.test(output)) return "engine";
  if (/ERESOLVE|peer dep|Could not resolve dependency/i.test(output)) return "peer";
  if (
    /ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|fetch failed/i.test(output)
  )
    return "network";
  if (/EUSAGE|ELOCKVERIFY|lock ?file|package-lock|npm ci/i.test(output)) return "lockfile";
  if (/E404|ETARGET|EINTEGRITY|E401|E403|notarget/i.test(output)) return "registry";
  return "other";
}

/** The last `npm error` lines of an install log, compacted for a report cell. */
export function installErrorExcerpt(output: string, limit = 3): string {
  const errors = output
    .split("\n")
    .filter((line) => /^npm (?:error|ERR!)/.test(line))
    .map((line) => line.replace(/^npm (?:error|ERR!)\s*/, "").trim())
    .filter((line) => line !== "");
  const lines =
    errors.length > 0 ? errors : output.split("\n").filter((line) => line.trim() !== "");
  return compactLine(lines.slice(-limit).join(" | "));
}

/** Required preferences with no manifest default: nothing unattended can supply them. */
export function requiredPreferences(manifest: Manifest, commandName: string): string[] {
  const command = manifest.commands?.find((item) => item?.name === commandName);
  const declared = new Map<string, ManifestPreference>();
  for (const preference of [...(manifest.preferences ?? []), ...(command?.preferences ?? [])]) {
    if (typeof preference?.name === "string") declared.set(preference.name, preference);
  }
  const defaults = extractPreferenceDefaults(manifest, commandName);
  return [...declared.values()]
    .filter(
      (preference) => preference.required === true && !((preference.name as string) in defaults),
    )
    .map((preference) => preference.name!)
    .toSorted();
}

/** Re-label a plain smoke result with the deps report's outcome names. */
export function toDepsResult(result: CommandResult): DepsResult {
  const { outcome, ...rest } = result;
  return { ...rest, outcome: outcome === "missing-arguments" ? "needs-arguments" : outcome };
}

export function needsPreferencesResult(base: {
  extension: string;
  command: string;
  mode: string;
  names: string[];
}): DepsResult {
  return {
    extension: base.extension,
    command: base.command,
    mode: base.mode,
    outcome: "needs-preferences",
    reason: `requires preferences without a default: ${base.names.join(", ")}; bundled, not run`,
  };
}

export function installFailedResult(
  base: { extension: string; command: string; mode: string },
  install: Pick<InstallRecord, "reason" | "error">,
): DepsResult {
  return {
    ...base,
    outcome: "install-failed",
    installReason: install.reason ?? "other",
    reason: `dependency install failed (${install.reason ?? "other"})`,
    ...(install.error === undefined ? {} : { error: install.error }),
  };
}

export function buildDepsReport(input: {
  commit: string;
  installs: InstallRecord[];
  results: DepsResult[];
  extensionFailures?: { extension: string; error: string }[];
  peakBytes: number;
  wallMs: number;
}): DepsReport {
  const totals = Object.fromEntries(DEPS_OUTCOMES.map((outcome) => [outcome, 0])) as Record<
    DepsOutcome,
    number
  >;
  for (const result of input.results) totals[result.outcome] += 1;
  return {
    commit: input.commit,
    totals,
    installs: [...input.installs].toSorted((a, b) => a.extension.localeCompare(b.extension)),
    results: [...input.results].toSorted(
      (a, b) => a.extension.localeCompare(b.extension) || a.command.localeCompare(b.command),
    ),
    extensionFailures: [...(input.extensionFailures ?? [])].toSorted((a, b) =>
      a.extension.localeCompare(b.extension),
    ),
    peakBytes: input.peakBytes,
    wallMs: input.wallMs,
  };
}

function detail(result: DepsResult): string {
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
    case "install-failed":
      return [result.reason, result.error].filter(Boolean).join("; ");
    case "unsupported-api":
      return `${result.path}${warnings}`;
    case "capability-denied":
      return `denied capability ${result.path}${warnings}`;
    case "completed":
      return `${result.reason ?? "completed without rendering a scene"}${warnings}`;
    case "timeout":
    case "unsupported-mode":
    case "needs-arguments":
    case "needs-preferences":
      return `${result.reason}${warnings}`;
  }
}

/** The signature a failure is grouped under: stable across extensions. */
export function failureSignature(result: DepsResult): string {
  switch (result.outcome) {
    case "install-failed":
      return `install failed: ${result.installReason ?? "other"}`;
    case "bundle-failed":
      return result.missing
        ? `missing ${result.missing.toSorted().join(", ")}`
        : compactLine(result.error ?? "bundle failed", 100);
    case "unsupported-api":
      return `unsupported API ${result.path}`;
    case "capability-denied":
      return `capability denied ${result.path}`;
    case "timeout":
      return "no scene before the timeout";
    case "crashed":
      return compactLine(result.error ?? result.reason ?? "crashed", 100);
    default:
      return compactLine(result.error ?? result.reason ?? result.outcome, 100);
  }
}

const HINTS: Partial<Record<DepsOutcome, string>> = {
  "bundle-failed":
    "bundler: an installed package the bundle policy cannot resolve or an esbuild option the package needs",
  crashed: "runtime: a Node or Raycast API behaviour the extension relies on that Blast lacks",
  timeout: "runtime: the command never published a scene; check for a pending broker call",
  "unsupported-api": "API surface: implement the named Raycast API",
  "capability-denied": "headless broker: add a default handler or classify it as needing a host",
  network: "none: the run is offline; the command needs a network to render",
};
const INSTALL_HINTS: Record<InstallReason, string> = {
  lockfile: "installer: the copied lockfile (decision 0008) is rejected by npm",
  engine: "installer: pass or relax engines for a pinned dependency",
  peer: "installer: peer-dependency resolution after supplied packages are stripped",
  network: "none: the registry was unreachable",
  registry: "installer: a pinned version or private package the registry does not serve",
  timeout: "installer: the install exceeded its time limit",
  "disk-budget": "tooling: the install exceeded the .cache budget",
  other: "installer: see the error excerpt",
};

export type FailureGroup = {
  outcome: DepsOutcome;
  signature: string;
  commands: number;
  extensions: string[];
  hint: string;
};

const NOT_FAILURES: readonly DepsOutcome[] = [
  "rendered",
  "completed",
  "needs-arguments",
  "needs-preferences",
];

/** Failures grouped by outcome and signature, most commands first. */
export function topFailures(results: readonly DepsResult[], limit = 10): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const result of results) {
    if (NOT_FAILURES.includes(result.outcome)) continue;
    const signature = failureSignature(result);
    const key = `${result.outcome}\u0000${signature}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        outcome: result.outcome,
        signature,
        commands: 0,
        extensions: [],
        hint:
          result.outcome === "install-failed"
            ? INSTALL_HINTS[result.installReason ?? "other"]
            : (HINTS[result.outcome] ?? ""),
      };
      groups.set(key, group);
    }
    group.commands += 1;
    if (!group.extensions.includes(result.extension)) group.extensions.push(result.extension);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, extensions: group.extensions.toSorted() }))
    .toSorted(
      (a, b) =>
        b.commands - a.commands ||
        a.outcome.localeCompare(b.outcome) ||
        a.signature.localeCompare(b.signature),
    )
    .slice(0, limit);
}

export function renderDepsJsonReport(report: DepsReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function renderDepsMarkdownReport(report: DepsReport): string {
  const count = (outcome: DepsOutcome): number => report.totals[outcome] ?? 0;
  const installed = report.installs.filter((install) => install.status === "installed").length;
  const lines: string[] = [
    "# Corpus smoke report (installed dependencies)",
    "",
    "Headless run of every command of the dependency-heavy set",
    "([corpus-deps.json](corpus-deps.json)) at corpus commit",
    `\`${report.commit}\`. Each extension's own dependencies are installed with the`,
    "engine's dependency install (decision 0008: `npm install --omit=dev --ignore-scripts`",
    "from the extension's lockfile) before its commands are bundled, with the shared",
    "dependency fallback present; the install is deleted afterwards. Broker, preference",
    "defaults and probe are the same as [SMOKE.md](SMOKE.md). Commands requiring launch",
    "arguments or preferences without a default are bundled but not run.",
    "Regenerate with `bun run corpus:smoke-deps` (network required; not part of",
    "`bun run verify`).",
    "",
    `${installed}/${report.installs.length} installs succeeded. ${report.results.length} commands: ${DEPS_OUTCOMES.map((outcome) => `${outcome} ${count(outcome)}`).join(", ")}.`,
    `Peak .cache ${megabytes(report.peakBytes)} MB, wall time ${(report.wallMs / 1000).toFixed(0)} s.`,
    "",
    "## Installs",
    "",
    "| Extension | Packages | Install | Time | Size | Detail |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const install of report.installs) {
    lines.push(
      `| \`${install.extension}\` | ${install.packages.map((name) => `\`${name}\``).join(", ")} | ${
        install.status === "installed" ? "installed" : `failed (${install.reason})`
      } | ${(install.ms / 1000).toFixed(1)} s | ${megabytes(install.bytes)} MB | ${compactLine(
        install.status === "installed"
          ? install.unresolved?.length
            ? `unresolved ${install.unresolved.join(", ")}`
            : ""
          : (install.error ?? ""),
      ).replaceAll("|", "\\|")} |`,
    );
  }
  const top = topFailures(report.results);
  if (top.length > 0) {
    lines.push("", "## Top failures", "");
    lines.push(
      "| Commands | Outcome | Cause | Extensions | Likely fix |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const group of top) {
      lines.push(
        `| ${group.commands} | ${group.outcome} | ${group.signature.replaceAll("|", "\\|")} | ${group.extensions.map((name) => `\`${name}\``).join(", ")} | ${group.hint} |`,
      );
    }
  }
  lines.push(
    "",
    "## Commands",
    "",
    "| Command | Mode | Outcome | Detail |",
    "| --- | --- | --- | --- |",
  );
  for (const result of report.results) {
    lines.push(
      `| \`${result.extension}/${result.command}\` | ${result.mode} | ${result.outcome} | ${compactLine(detail(result)).replaceAll("|", "\\|")} |`,
    );
  }
  const failures = report.results.filter((result) => !NOT_FAILURES.includes(result.outcome));
  if (failures.length > 0 || report.extensionFailures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of report.extensionFailures) {
      lines.push(`- \`${failure.extension}\`: ${compactLine(failure.error)}`);
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
