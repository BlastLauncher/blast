// Scans `packages/**/*.test.ts(x)` for `// @covers` tags and joins them with
// the inventory into the committed coverage report and its markdown summary.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  buildReport,
  parseCovers,
  renderCoverageMd,
  type CoverTag,
  type Inventory,
} from "./coverage.ts";
import { INVENTORY_PATH } from "./generate-inventory.ts";
import { isRecord } from "./raycast-api.ts";
import { USAGE_PATH } from "../corpus/usage.ts";

export const REPORT_PATH = "compat/raycast-api.json";
export const COVERAGE_PATH = "compat/COVERAGE.md";
// Evidence lives in test files only, per the task definition.
const TEST_FILE = /\.test\.tsx?$/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir).toSorted()) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

export function collectTags(root: string): CoverTag[] {
  const base = join(root, "packages");
  if (!existsSync(base)) return [];
  const tags: CoverTag[] = [];
  for (const path of walk(base)) {
    if (!TEST_FILE.test(path)) continue;
    const file = relative(root, path).split(sep).join("/");
    tags.push(...parseCovers(readFileSync(path, "utf8"), file));
  }
  return tags;
}

export function readInventory(root: string): Inventory {
  const path = join(root, INVENTORY_PATH);
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    !isRecord(parsed) ||
    typeof parsed.version !== "string" ||
    !Array.isArray(parsed.entries) ||
    parsed.entries.some(
      (entry) =>
        !isRecord(entry) ||
        typeof entry.path !== "string" ||
        typeof entry.kind !== "string" ||
        typeof entry.deprecated !== "boolean",
    )
  )
    throw new Error(`${INVENTORY_PATH}: not an inventory file`);
  return {
    version: parsed.version,
    entries: parsed.entries as Inventory["entries"],
  };
}

/** Builds both artefacts; tag errors are returned, not thrown. */
export function buildCoverage(root: string): {
  json: string;
  markdown: string;
  errors: string[];
} {
  const inventory = readInventory(root);
  const usageFile = join(root, USAGE_PATH);
  let weights: Record<string, number> | undefined;
  if (existsSync(usageFile)) {
    const usage: unknown = JSON.parse(readFileSync(usageFile, "utf8"));
    if (
      !isRecord(usage) ||
      typeof usage.corpusCommit !== "string" ||
      !Number.isInteger(usage.extensions) ||
      (usage.extensions as number) < 0 ||
      !isRecord(usage.paths) ||
      Object.values(usage.paths).some(
        (count) =>
          !Number.isInteger(count) ||
          (count as number) < 0 ||
          (count as number) > (usage.extensions as number),
      )
    )
      throw new Error(`${USAGE_PATH}: invalid usage file`);
    weights = usage.paths as Record<string, number>;
  }
  const { report, errors } = buildReport(inventory, collectTags(root), weights);
  return {
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: renderCoverageMd(report, inventory),
    errors,
  };
}

export function generateCoverage(root: string): { json: string; markdown: string } {
  const built = buildCoverage(root);
  if (built.errors.length) throw new Error(built.errors.join("\n"));
  return built;
}

export function checkCoverage(root: string): string[] {
  let built: ReturnType<typeof buildCoverage>;
  try {
    built = buildCoverage(root);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  if (built.errors.length) return built.errors;
  const expected = { [REPORT_PATH]: built.json, [COVERAGE_PATH]: built.markdown };
  const errors: string[] = [];
  for (const [file, content] of Object.entries(expected)) {
    const path = join(root, file);
    if (!existsSync(path) || readFileSync(path, "utf8") !== content)
      errors.push(`${file}: missing or stale; run \`bun run compat:report\``);
  }
  return errors;
}

if (import.meta.main) {
  const root = process.cwd();
  const { json, markdown } = generateCoverage(root);
  writeFileSync(join(root, REPORT_PATH), json);
  writeFileSync(join(root, COVERAGE_PATH), markdown);
  const report = JSON.parse(json) as { totals: { all: { covered: number; total: number } } };
  console.log(`report: covered=${report.totals.all.covered} of ${report.totals.all.total}`);
}
