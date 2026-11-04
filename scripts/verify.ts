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

const steps: Array<[name: string, command: string[]]> = [
  ["format", ["bun", "run", "--silent", "fmt:check"]],
  ["lint", ["bun", "run", "--silent", "lint"]],
  ["typecheck", ["bun", "run", "--silent", "typecheck"]],
  ["compat", ["bun", "run", "--silent", "compat:check"]],
  ["protocol", ["bun", "run", "--silent", "protocol:check"]],
  ["mac-fixtures", ["bun", "run", "--silent", "example:mac:fixtures", "--check"]],
  ["workflow", ["bun", "run", "--silent", "check:workflow"]],
  // Random order catches tests that leak module state into each other; a
  // failure prints `--seed=N` to reproduce with `bun test --randomize --seed=N`.
  ["test", ["bun", "test", "--randomize", ...testFiles]],
];

const results: string[] = [];
let failed = false;
const started = performance.now();

for (const [name, [command, ...args]] of steps) {
  console.log(`\n── ${name} ──`);
  const result = spawnSync(command!, args, { stdio: "inherit" });
  const ok = result.status === 0;
  failed ||= !ok;
  results.push(`${name} ${ok ? "ok" : "FAIL"}`);
}

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`\nverify: ${failed ? "FAIL" : "PASS"} (${results.join(", ")}) in ${seconds}s`);
process.exit(failed ? 1 : 0);
