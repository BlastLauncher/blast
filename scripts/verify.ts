// The single gate from AGENTS.md. Runs every check even after a failure so one
// run reports everything, then prints a one-line summary for handoff notes.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";

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

async function runStep(name: string, command: string[]): Promise<StepOutcome> {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { name, stdout, stderr, ok: code === 0 };
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
  const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  if (files.status !== 0) process.exit(files.status ?? 1);
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
  process.exit(failed ? 1 : 0);
}

if (import.meta.main) await main();
