// Entry point for `bun run corpus:smoke`. Fetches the curated extensions in
// budget-sized batches with the task-0011 fetch script (task 0051), then
// bundles and runs every manifest command of each curated extension through
// the task-0013 host — deny-all broker plus the headless read-only defaults
// (task 0026), manifest-declared preference defaults — waiting for the first
// scene, the exit, or a timeout. Writes `compat/smoke.json` and
// `compat/SMOKE.md`. Failures are the report's data, not errors: nothing
// here fixes Blast, and extension files are never modified.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchBatch } from "./batch.ts";
import { batchSize, CORPUS_DIR, maxMbFromEnv, megabytes, readPin } from "./corpus.ts";
import { runOne } from "./smoke-command.ts";
import {
  buildReport,
  compactLine,
  manifestCommands,
  renderJsonReport,
  renderMarkdownReport,
  sanitizePath,
  type CommandResult,
  type Manifest,
} from "./smoke.ts";

/**
 * Run the curated set: fetch one batch of extensions at a time (the empty
 * final batch leaves the checkout manifest-only), then every command of every
 * extension in it.
 */
async function main(): Promise<void> {
  const root = process.cwd();
  const pin = readPin(root);
  const maxMb = maxMbFromEnv(process.env);
  const size = batchSize(maxMb);
  const curated = [...pin.curated].toSorted();
  console.log(`corpus:smoke: ${curated.length} curated extensions in batches of ${size}`);

  // Path prefixes that must never appear in a committed report.
  const clean = (text: string): string =>
    compactLine(
      sanitizePath(text, [
        [root, "<repo>"],
        [tmpdir(), "<tmp>"],
      ]),
    );
  const results: CommandResult[] = [];
  const extensionFailures: { extension: string; error: string }[] = [];
  let peakBytes = 0;
  try {
    for (let offset = 0; offset < curated.length; offset += size) {
      const batch = curated.slice(offset, offset + size);
      peakBytes = Math.max(peakBytes, fetchBatch(batch, root));
      console.log(`corpus:smoke: batch .cache is ${megabytes(peakBytes)} MB (peak so far)`);
      for (const extension of batch) {
        const extensionDir = join(root, CORPUS_DIR, "extensions", extension);
        const manifestPath = join(extensionDir, "package.json");
        if (!existsSync(manifestPath)) {
          extensionFailures.push({ extension, error: "manifest missing from the checkout" });
          continue;
        }
        let manifest: Manifest;
        try {
          manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
        } catch (error) {
          extensionFailures.push({
            extension,
            error: clean(error instanceof Error ? error.message : String(error)),
          });
          continue;
        }
        const commands = manifestCommands(manifest);
        if (commands.length === 0) {
          extensionFailures.push({ extension, error: "manifest declares no commands" });
          continue;
        }
        for (const commandName of commands) {
          process.stdout.write(`corpus:smoke: ${extension}/${commandName}: `);
          const result = await runOne(extension, extensionDir, manifest, commandName, clean);
          console.log(result.outcome);
          results.push(result);
        }
      }
    }
  } finally {
    // Leave the checkout minimal: every extension dropped from the sparse
    // set once its batch is done.
    fetchBatch([], root);
  }

  const report = buildReport(pin.commit, results, extensionFailures);
  await writeFile(join(root, "compat/smoke.json"), renderJsonReport(report));
  await writeFile(join(root, "compat/SMOKE.md"), renderMarkdownReport(report));
  const totals = Object.entries(report.totals)
    .map(([outcome, count]) => `${outcome} ${count}`)
    .join(", ");
  console.log(
    `corpus:smoke: wrote compat/smoke.json and compat/SMOKE.md (${totals}), peak .cache ${megabytes(peakBytes)} MB`,
  );
}

try {
  await main();
} catch (error) {
  console.error(`corpus:smoke: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
