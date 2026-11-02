import { spawnSync } from "node:child_process";

export const UPGRADE_STEPS = [
  "compat:fetch",
  "compat:inventory",
  "compat:enums",
  "compat:stubs",
  "compat:report",
] as const;

export function runUpgrade(
  version: string,
  run: (command: string, args: string[]) => number = (command, args) =>
    spawnSync(command, args, { stdio: "inherit" }).status ?? 1,
): void {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version))
    throw new Error(`invalid @raycast/api version: ${version}`);
  for (const step of UPGRADE_STEPS) {
    const status = run("bun", ["run", step, version]);
    if (status !== 0) throw new Error(`${step} failed with status ${status}`);
  }
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version) throw new Error("usage: bun run compat:upgrade <version>");
  runUpgrade(version);
}
