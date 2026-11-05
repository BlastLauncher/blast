// Format only files git would track, so global and per-clone excludes apply;
// deleted-but-staged paths are skipped so a refactor in progress still checks.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
});
if (files.status !== 0) process.exit(files.status ?? 1);

const paths = files.stdout.split("\n").filter((path) => path.length > 0 && existsSync(path));
const result = spawnSync(
  "oxfmt",
  [...(process.argv.includes("--check") ? ["--check"] : []), ...paths],
  {
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
