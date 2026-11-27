// The single gate from AGENTS.md. Runs every check even after a failure so one
// run reports everything, then prints a one-line summary for handoff notes.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

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

const staticSteps: Array<[name: string, command: string[]]> = [
  ["format", ["bun", "run", "--silent", "fmt:check"]],
  ["lint", ["bun", "run", "--silent", "lint"]],
  ["typecheck", ["bun", "run", "--silent", "typecheck"]],
  ["compat", ["bun", "run", "--silent", "compat:check"]],
  ["protocol", ["bun", "run", "--silent", "protocol:check"]],
  ["mac-fixtures", ["bun", "run", "--silent", "example:mac:fixtures", "--check"]],
  ["workflow", ["bun", "run", "--silent", "check:workflow"]],
];

const results: string[] = [];
let failed = false;
const started = performance.now();

// Independent static and contract checks run in parallel; output is buffered
// per step and printed in canonical order so logs stay readable.
const staticOutcomes = await Promise.all(
  staticSteps.map(async ([name, command]) => {
    const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { name, stdout, stderr, ok: code === 0 };
  }),
);

for (const outcome of staticOutcomes) {
  console.log(`\n── ${outcome.name} ──`);
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  failed ||= !outcome.ok;
  results.push(`${outcome.name} ${outcome.ok ? "ok" : "FAIL"}`);
}

// Random order catches tests that leak module state into each other; a
// failure prints `--seed=N` to reproduce with `bun test --randomize --seed=N`.
// `--parallel --no-isolate` distributes files across cores while keeping a
// shared module registry per worker so cross-file leaks are still caught.
console.log("\n── test ──");
const testResult = spawnSync(
  "bun",
  [
    "test",
    "--parallel",
    "--no-isolate",
    "--randomize",
    "--timeout=15000",
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
