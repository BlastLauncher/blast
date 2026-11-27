// The single gate from AGENTS.md. Runs every check even after a failure so one
// run reports everything, then prints a one-line summary for handoff notes.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  linkSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";

export type VerifyLimits = {
  jobs: number;
  staticConcurrency: number;
  toolThreads: number;
  fixtureConcurrency: number;
  testWorkers: number;
  maxConcurrency: number;
};

type StepOutcome = {
  name: string;
  stdout: string;
  stderr: string;
  ok: boolean;
};

function parsePositiveInt(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return Number(trimmed);
}

/**
 * Derives bounded worker/thread counts from host CPU cores so `verify` leaves
 * headroom for the Node runtimes, standby pool workers, esbuild and git
 * children spawned by tests and contract checks. Set `BLAST_VERIFY_JOBS` to
 * override the worker budget explicitly.
 */
export function resolveVerifyLimits(
  cpus = availableParallelism(),
  env: Record<string, string | undefined> = process.env,
): VerifyLimits {
  const override = parsePositiveInt(env.BLAST_VERIFY_JOBS, "BLAST_VERIFY_JOBS");
  // ~40% of cores (1 on 2c, 2 on 4c, 3 on 8c) leaves headroom for the Node
  // runtimes, standby pool workers, esbuild and git children tests spawn.
  const jobs = override ?? Math.max(1, Math.min(8, Math.round(cpus * 0.4)));
  return {
    jobs,
    staticConcurrency: Math.max(1, Math.min(2, jobs)),
    toolThreads: Math.max(1, Math.min(2, jobs)),
    fixtureConcurrency: Math.max(1, Math.min(2, jobs)),
    testWorkers: jobs,
    maxConcurrency: Math.max(1, Math.min(4, jobs)),
  };
}

const DEFAULT_VERIFY_LOCK_POLL_MS = 250;
const WAIT_LOG_INTERVAL_MS = 30_000;

export type VerifyLockInfo = {
  pid: number;
  startedAt: number;
  cwd: string;
  token: string;
};

export type VerifyLockHandle = {
  path: string;
  info: VerifyLockInfo;
  release: () => void;
};

export type AcquireVerifyLockOptions = {
  lockPath?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  pid?: number;
  pollMs?: number;
  staleMs?: number;
  corruptGraceMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  isAlive?: (pid: number) => boolean;
  log?: (line: string) => void;
  onSignal?: (signal: NodeJS.Signals) => void;
  registerSignals?: boolean;
};

type LockState =
  | { kind: "missing" }
  | { kind: "valid"; info: VerifyLockInfo; mtimeMs: number }
  | { kind: "corrupt"; mtimeMs: number };

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Returns the machine-wide verify lock path under `git rev-parse --git-common-dir`
 * (shared across every worktree of the repository), or `undefined` when
 * `BLAST_VERIFY_LOCK=0` or git common dir is unavailable.
 */
export function resolveVerifyLockPath(cwd = process.cwd()): string | undefined {
  const result = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) return undefined;
  const raw = result.stdout.trim();
  if (!raw) return undefined;
  const resolved = resolve(cwd, raw);
  return join(realpathSync(resolved), "blast-verify.lock");
}

function readLockState(lockPath: string): LockState {
  let text: string;
  let mtimeMs: number;
  try {
    text = readFileSync(lockPath, "utf8");
    mtimeMs = statSync(lockPath).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    return { kind: "corrupt", mtimeMs: 0 };
  }
  try {
    const parsed = JSON.parse(text) as Partial<VerifyLockInfo>;
    if (
      typeof parsed.pid === "number" &&
      Number.isInteger(parsed.pid) &&
      parsed.pid > 0 &&
      typeof parsed.startedAt === "number" &&
      Number.isFinite(parsed.startedAt) &&
      typeof parsed.cwd === "string" &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0
    ) {
      return {
        kind: "valid",
        info: {
          pid: parsed.pid,
          startedAt: parsed.startedAt,
          cwd: parsed.cwd,
          token: parsed.token,
        },
        mtimeMs,
      };
    }
  } catch {
    // Handled as corrupt below: locks are linked into place fully written, so
    // a corrupt file is never a writer mid-write.
  }
  return { kind: "corrupt", mtimeMs };
}

function staleLockReason(state: LockState, isAlive: (pid: number) => boolean): string | undefined {
  if (state.kind === "missing") return undefined;
  if (state.kind === "corrupt") {
    return "corrupt lock file";
  }
  if (!isAlive(state.info.pid)) return "holder process exited";
  return undefined;
}

function tryCreateLock(lockPath: string, info: VerifyLockInfo): boolean {
  const tempPath = `${lockPath}.${info.token}.tmp`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(info)}\n`, { flag: "wx", mode: 0o644 });
    try {
      linkSync(tempPath, lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return false;
    } finally {
      unlinkIfExists(tempPath);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

function unlinkIfExists(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function tryReclaimStaleLock(
  lockPath: string,
  newInfo: VerifyLockInfo,
  nowMs: number,
  isAlive: (pid: number) => boolean,
  expectedToken: string | undefined,
): boolean {
  const reclaimPath = `${lockPath}.${newInfo.token}.stale`;
  try {
    try {
      renameSync(lockPath, reclaimPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    const moved = readLockState(reclaimPath);
    if (
      (moved.kind === "valid" && moved.info.token !== expectedToken) ||
      (moved.kind === "valid" && isAlive(moved.info.pid))
    ) {
      // Known limit: rename overwrites, so a lock another run created in the
      // instant between the two renames is lost and two verifies may overlap.
      try {
        renameSync(reclaimPath, lockPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      return false;
    }
    if (moved.kind === "valid" && !staleLockReason(moved, isAlive)) return false;
    newInfo.startedAt = nowMs;
    return tryCreateLock(lockPath, newInfo);
  } finally {
    unlinkIfExists(reclaimPath);
  }
}

function createLockHandle(
  lockPath: string,
  info: VerifyLockInfo,
  options: Pick<AcquireVerifyLockOptions, "onSignal" | "registerSignals">,
): VerifyLockHandle {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (options.registerSignals !== false) {
      process.off("exit", onExit);
      process.off("SIGINT", onSigInt);
      process.off("SIGTERM", onSigTerm);
    }
    try {
      const current = readLockState(lockPath);
      if (current.kind === "valid" && current.info.token === info.token) {
        unlinkIfExists(lockPath);
      }
    } catch {
      // Lock already removed or inaccessible during shutdown.
    }
  };
  const onExit = () => release();
  const handleSignal = (signal: NodeJS.Signals) => {
    release();
    if (options.onSignal) {
      options.onSignal(signal);
    } else {
      process.exit(signal === "SIGINT" ? 130 : 143);
    }
  };
  const onSigInt = () => handleSignal("SIGINT");
  const onSigTerm = () => handleSignal("SIGTERM");
  if (options.registerSignals !== false) {
    process.on("exit", onExit);
    process.on("SIGINT", onSigInt);
    process.on("SIGTERM", onSigTerm);
  }
  return { path: lockPath, info, release };
}

/**
 * Acquires the repository-wide verify lock, printing who holds it while
 * waiting and reclaiming stale locks (dead holder pid or corrupt file); a live
 * holder is never taken over, however long it holds the lock.
 * Returns `undefined` when `BLAST_VERIFY_LOCK=0` or no git common dir exists.
 */
export async function acquireVerifyLock(
  options: AcquireVerifyLockOptions = {},
): Promise<VerifyLockHandle | undefined> {
  const env = options.env ?? process.env;
  if (env.BLAST_VERIFY_LOCK?.trim() === "0") return undefined;
  const cwd = options.cwd ?? process.cwd();
  const lockPath = options.lockPath ?? resolveVerifyLockPath(cwd);
  if (!lockPath) return undefined;

  const pid = options.pid ?? process.pid;
  const pollMs = options.pollMs ?? DEFAULT_VERIFY_LOCK_POLL_MS;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const isAlive = options.isAlive ?? isProcessAlive;
  const log = options.log ?? ((line: string) => console.log(line));

  const waitStart = now();
  const info: VerifyLockInfo = {
    pid,
    startedAt: waitStart,
    cwd,
    token: `${pid}-${waitStart}-${randomUUID()}`,
  };

  let waited = false;
  let lastHolderKey = "";
  let lastLogAt = 0;

  while (true) {
    const nowMs = now();
    info.startedAt = nowMs;
    if (tryCreateLock(lockPath, info)) {
      if (waited) {
        log(`verify: acquired lock after ${((nowMs - waitStart) / 1000).toFixed(1)}s`);
      }
      return createLockHandle(lockPath, info, options);
    }

    const state = readLockState(lockPath);
    if (state.kind === "missing") continue;

    const reason = staleLockReason(state, isAlive);
    if (reason) {
      if (
        tryReclaimStaleLock(
          lockPath,
          info,
          nowMs,
          isAlive,
          state.kind === "valid" ? state.info.token : undefined,
        )
      ) {
        const holder = state.kind === "valid" ? `pid ${state.info.pid}` : "unknown holder";
        log(`verify: took over stale lock from ${holder} (${reason})`);
        return createLockHandle(lockPath, info, options);
      }
      await sleep(pollMs);
      continue;
    }

    waited = true;
    const holderKey = state.kind === "valid" ? `${state.info.pid}:${state.info.token}` : "corrupt";
    if (holderKey !== lastHolderKey || nowMs - lastLogAt >= WAIT_LOG_INTERVAL_MS) {
      lastHolderKey = holderKey;
      lastLogAt = nowMs;
      if (state.kind === "valid") {
        const ageSec = Math.max(0, Math.round((nowMs - state.info.startedAt) / 1000));
        const where = state.info.cwd ? ` (${state.info.cwd})` : "";
        log(
          `verify: waiting for lock held by pid ${state.info.pid}${where}, started ${ageSec}s ago...`,
        );
      } else {
        log("verify: waiting for lock...");
      }
    }
    await sleep(pollMs);
  }
}

const activeChildren = new Set<{ kill: (signal?: NodeJS.Signals) => void }>();
function terminateChildren(): void {
  for (const child of activeChildren) child.kill("SIGTERM");
}

async function runStep(name: string, command: string[]): Promise<StepOutcome> {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  activeChildren.add(child);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { name, stdout, stderr, ok: code === 0 };
  } finally {
    activeChildren.delete(child);
  }
}

async function runBounded<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const outcomes: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      outcomes[index] = await run(items[index]!);
    }
  };
  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return outcomes;
}

async function main(): Promise<void> {
  const limits = resolveVerifyLimits();
  const lock = await acquireVerifyLock({
    onSignal: (signal) => {
      terminateChildren();
      process.exit(signal === "SIGINT" ? 130 : 143);
    },
  });
  const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  if (files.status !== 0) {
    lock?.release();
    process.exit(files.status ?? 1);
  }
  const testFiles = files.stdout
    .split("\n")
    .filter((path) => /\.test\.(?:ts|tsx|js)$/.test(path) && existsSync(path));

  const seedArgs: string[] = [];
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]!;
    if (arg === "--seed" && process.argv[i + 1] !== undefined) {
      seedArgs.push(arg, process.argv[++i]!);
    } else if (arg.startsWith("--seed=")) {
      seedArgs.push(arg);
    }
  }

  // Run lightweight/static steps in a small bounded pool with capped tool
  // threads, then run `mac-fixtures` on its own so its `blast serve` + runtime
  // children never overlap with oxfmt, oxlint, or tsc.
  const pureStaticSteps: Array<[name: string, command: string[]]> = [
    ["format", ["bun", "run", "--silent", "fmt:check", `--threads=${limits.toolThreads}`]],
    ["lint", ["bun", "run", "--silent", "lint", `--threads=${limits.toolThreads}`]],
    ["typecheck", ["bun", "run", "--silent", "typecheck"]],
    ["compat", ["bun", "run", "--silent", "compat:check"]],
    ["protocol", ["bun", "run", "--silent", "protocol:check"]],
    ["workflow", ["bun", "run", "--silent", "check:workflow"]],
  ];
  const canonicalOrder = [
    "format",
    "lint",
    "typecheck",
    "compat",
    "protocol",
    "mac-fixtures",
    "workflow",
  ];

  const results: string[] = [];
  let failed = false;
  const started = performance.now();

  const pureOutcomes = await runBounded(pureStaticSteps, limits.staticConcurrency, ([name, cmd]) =>
    runStep(name, cmd),
  );
  const macOutcome = await runStep("mac-fixtures", [
    "bun",
    "run",
    "--silent",
    "example:mac:fixtures",
    "--check",
    `--concurrency=${limits.fixtureConcurrency}`,
  ]);

  const outcomeByName = new Map<string, StepOutcome>(
    [...pureOutcomes, macOutcome].map((outcome) => [outcome.name, outcome]),
  );
  for (const name of canonicalOrder) {
    const outcome = outcomeByName.get(name)!;
    console.log(`\n── ${outcome.name} ──`);
    if (outcome.stdout) process.stdout.write(outcome.stdout);
    if (outcome.stderr) process.stdout.write(outcome.stderr);
    failed ||= !outcome.ok;
    results.push(`${outcome.name} ${outcome.ok ? "ok" : "FAIL"}`);
  }

  // Random order catches tests that leak module state into each other; a
  // failure prints `--seed=N` to reproduce with `bun test --randomize --seed=N`.
  // `--parallel=N --no-isolate` distributes files across bounded workers while
  // keeping a shared module registry per worker so cross-file leaks are caught.
  console.log("\n── test ──");
  const testResult = spawnSync(
    "bun",
    [
      "test",
      `--parallel=${limits.testWorkers}`,
      "--no-isolate",
      `--max-concurrency=${limits.maxConcurrency}`,
      "--randomize",
      ...seedArgs,
      ...testFiles,
    ],
    { stdio: "inherit" },
  );
  const testOk = testResult.status === 0;
  failed ||= !testOk;
  results.push(`test ${testOk ? "ok" : "FAIL"}`);

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`\nverify: ${failed ? "FAIL" : "PASS"} (${results.join(", ")}) in ${seconds}s`);
  lock?.release();
  process.exit(failed ? 1 : 0);
}

if (import.meta.main) await main();
