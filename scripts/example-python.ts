// Runs the Python embedder tests (`examples/python-embedder`); skips with a
// clear message when `python3` is absent, so the gate works everywhere.
import { spawnSync } from "node:child_process";

const found = spawnSync("python3", ["-I", "-c", "pass"], { stdio: "ignore" });
if (found.error || found.status !== 0) {
  console.log("example:python: python3 not found, skipping");
  process.exit(0);
}
const result = spawnSync("python3", ["-I", "test_embedder.py"], {
  cwd: "examples/python-embedder",
  stdio: "inherit",
});
process.exit(result.status ?? 1);
