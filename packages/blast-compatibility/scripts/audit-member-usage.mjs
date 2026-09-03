import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { buildMemberUsageReport, scanExtensionMembers } from "../dist/index.js";

const [corpusDirectory, ...rest] = process.argv.slice(2);
if (corpusDirectory === undefined) {
  console.error("usage: audit-member-usage.mjs <corpus-directory> [--limit <n>] [--min-extensions <n>]");
  process.exit(1);
}

const options = { limit: 50, minExtensions: 1 };
for (let index = 0; index < rest.length; index += 1) {
  const arg = rest[index];
  if (arg === "--limit") {
    options.limit = Number(rest[++index]);
  } else if (arg === "--min-extensions") {
    options.minExtensions = Number(rest[++index]);
  } else {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
}

const entries = await readdir(corpusDirectory, { withFileTypes: true });
const directories = [];
for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
  if (!entry.isDirectory()) {
    continue;
  }
  try {
    await stat(path.join(corpusDirectory, entry.name, "package.json"));
  } catch {
    continue;
  }
  directories.push(path.join(corpusDirectory, entry.name));
}

const scans = [];
for (const [index, directory] of directories.entries()) {
  scans.push(await scanExtensionMembers(directory));
  if ((index + 1) % 100 === 0) {
    process.stdout.write(`Scanned ${index + 1}/${directories.length} extensions\n`);
  }
}
process.stdout.write(`Scanned ${scans.length} extensions\n`);

const { memberUsage } = buildMemberUsageReport(scans);
const rows = memberUsage.filter((entry) => entry.extensionCount >= options.minExtensions).slice(0, options.limit);
const memberWidth = Math.max(...rows.map((row) => row.member.length), "member".length);
console.log(`\n${"member".padEnd(memberWidth)}  extensions  usages`);
for (const row of rows) {
  console.log(
    `${row.member.padEnd(memberWidth)}  ${String(row.extensionCount).padStart(10)}  ${String(row.usageCount).padStart(6)}`,
  );
}
