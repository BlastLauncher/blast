// The single gate from AGENTS.md. Runs every check even after a failure so one
// run reports everything, then prints a one-line summary for handoff notes.
import { spawnSync } from "node:child_process";

const steps: Array<[name: string, command: string[]]> = [
  ["format", ["bun", "run", "--silent", "fmt:check"]],
  ["lint", ["bun", "run", "--silent", "lint"]],
  ["typecheck", ["bun", "run", "--silent", "typecheck"]],
  ["workflow", ["bun", "run", "--silent", "check:workflow"]],
  ["test", ["bun", "test"]],
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
