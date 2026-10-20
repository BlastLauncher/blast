import { readFile, writeFile } from "node:fs/promises";

await writeFile(
  "fake-npm.json",
  JSON.stringify({
    args: process.argv.slice(2),
    lock: JSON.parse(await readFile("package-lock.json", "utf8")),
  }),
);
