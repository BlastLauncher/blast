import { spawnSync } from "node:child_process";

const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
});
if (files.status !== 0) process.exit(files.status ?? 1);

const paths = files.stdout
  .split("\n")
  .filter((path) => path.length > 0 && !path.startsWith("archive/"));
const result = spawnSync(
  "oxfmt",
  [...(process.argv.includes("--check") ? ["--check"] : []), ...paths],
  {
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
