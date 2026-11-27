// Reuses CI's `verify` check run for the exact same commit SHA instead of
// running `bun run verify` a second time inside `prerelease.yml`. Fails closed:
// if CI's `verify` already failed on this commit it throws immediately; on any
// other non-success path (no CI run, cancelled/skipped, timeout, or API error)
// it returns `run_local=true` so the `verify-ci` job runs `bun run verify`
// locally as the fallback gate before `publish` can run.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";

export type CheckRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
};

export type VerifyDecision = "reused" | "wait" | "run-local" | "failed";

const FAILURE_CONCLUSIONS = new Set(["failure", "timed_out", "action_required"]);

export function decideVerifyAction(runs: readonly CheckRun[]): VerifyDecision {
  const verifyRuns = runs.filter((run) => run.name === "verify");
  if (verifyRuns.length === 0) return "wait";
  const latest = verifyRuns.toSorted((left, right) => right.id - left.id)[0]!;
  if (latest.status !== "completed") return "wait";
  if (latest.conclusion === "success") return "reused";
  if (latest.conclusion && FAILURE_CONCLUSIONS.has(latest.conclusion)) return "failed";
  // Cancelled, skipped, neutral or stale CI runs must not block a release:
  // fall back to running verify inside this job.
  return "run-local";
}

export interface WaitOptions {
  fetchRuns: () => CheckRun[] | null;
  waitForAppear: boolean;
  sleep?: (ms: number) => void;
  now?: () => number;
  log?: (line: string) => void;
  pollMs?: number;
  appearMs?: number;
  maxWaitMs?: number;
}

export function waitForCiVerify(options: WaitOptions): "reused" | "run-local" {
  const sleep = options.sleep ?? ((ms: number) => Bun.sleepSync(ms));
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? ((line: string) => console.log(line));
  const pollMs = options.pollMs ?? 5_000;
  const appearMs = options.appearMs ?? 15_000;
  const maxWaitMs = options.maxWaitMs ?? 600_000;

  const started = now();
  const maxPolls = Math.max(1, Math.ceil(maxWaitMs / pollMs) + 2);
  let sawAny = false;

  for (let poll = 0; poll < maxPolls; poll++) {
    const runs = options.fetchRuns();
    if (runs === null) {
      log("CI verify lookup unavailable; falling back to local verify.");
      return "run-local";
    }
    const matching = runs.filter((run) => run.name === "verify");
    if (matching.length > 0) sawAny = true;
    const decision = decideVerifyAction(runs);
    if (decision === "reused") {
      log("CI verify already succeeded for this commit; skipping duplicate verify.");
      return "reused";
    }
    if (decision === "failed") {
      throw new Error("CI verify failed for this commit; aborting prerelease.");
    }
    if (decision === "run-local") {
      log("CI verify did not produce a passing result (e.g. cancelled); running verify locally.");
      return "run-local";
    }
    const elapsed = now() - started;
    if (!sawAny && (!options.waitForAppear || elapsed >= appearMs)) {
      log("No CI verify check run found for this commit; running verify locally.");
      return "run-local";
    }
    if (elapsed >= maxWaitMs) {
      log("Timed out waiting for CI verify; running verify locally.");
      return "run-local";
    }
    log(
      `Waiting for CI verify (${matching.length ? matching[0]!.status : "pending registration"})…`,
    );
    sleep(pollMs);
  }
  return "run-local";
}

function fetchCheckRuns(repo: string, sha: string): CheckRun[] | null {
  const result = spawnSync(
    "gh",
    ["api", `repos/${repo}/commits/${sha}/check-runs?check_name=verify&per_page=100`],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout) as { check_runs?: CheckRun[] };
    return Array.isArray(parsed.check_runs) ? parsed.check_runs : null;
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { output: { type: "string" } } });
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const sha = process.env.GITHUB_SHA ?? "";
  const event = process.env.GITHUB_EVENT_NAME ?? "";
  const outcome =
    repo && sha
      ? waitForCiVerify({
          fetchRuns: () => fetchCheckRuns(repo, sha),
          waitForAppear: event === "push",
        })
      : "run-local";
  const line = `run_local=${outcome === "run-local"}`;
  if (values.output) appendFileSync(values.output, `${line}\n`);
  console.log(line);
}
