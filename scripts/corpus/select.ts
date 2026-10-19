// Entry point for `bun run corpus:select`. Static and read-only over the
// pinned corpus: it fetches the manifests, sparsely checks out candidate
// sources in hash order, applies the rules in `selection.ts`, and rewrites
// `compat/corpus.json`. Running it again on the same pin reproduces the same
// curated set; `corpus:smoke` consumes what it writes. Sources are checked out
// in batches and every step is followed by the disk-budget check, so a bad
// selection aborts instead of filling the disk.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPatterns,
  checkDiskBudget,
  CORPUS_DIR,
  directoryBytes,
  maxMbFromEnv,
  megabytes,
  readPin,
} from "./corpus.ts";
import { sources, sourcePatterns } from "./scan.ts";
import {
  analyzeSources,
  eligible,
  manifestRejections,
  KEPT_CURATED,
  offlineQuotasMet,
  PICK_STRATA,
  rank,
  renderPin,
  SCAN_BATCH,
  SCAN_CAP,
  selectCurated,
  viewCommands,
  type Candidate,
  type Manifest,
} from "./selection.ts";

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed with status ${result.status}`);
}

function main(): void {
  const root = process.cwd();
  const pin = readPin(root);
  const repo = join(root, CORPUS_DIR);
  const maxMb = maxMbFromEnv(process.env);
  const guard = (step: string): void => {
    const bytes = directoryBytes(repo);
    const over = checkDiskBudget(bytes, maxMb);
    if (over !== undefined) throw new Error(`${step}: ${over}`);
    console.log(`corpus:select: ${step}: ${megabytes(bytes)} MB`);
  };

  const fetched = spawnSync("bun", ["scripts/corpus/fetch.ts"], { stdio: "inherit" });
  if (fetched.status !== 0) throw new Error("manifest fetch failed; see output above");
  guard("manifests");

  const extensionsDir = join(repo, "extensions");
  const present = new Set(
    readdirSync(extensionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
  const absent = KEPT_CURATED.filter((name) => !present.has(name));
  if (absent.length > 0)
    throw new Error(`curated extensions missing from the pin: ${absent.join(", ")}`);
  const head = pin.curated.slice(0, KEPT_CURATED.length);
  if (head.some((name, index) => name !== KEPT_CURATED[index]))
    throw new Error(
      `compat/corpus.json must start with the first curated set, got ${head.join(", ")}`,
    );

  const manifests: Array<{
    name: string;
    viewCommands: string[];
    dependencies: Record<string, unknown>;
  }> = [];
  for (const name of [...present].toSorted()) {
    const manifestPath = join(extensionsDir, name, "package.json");
    if (!existsSync(manifestPath)) continue;
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    } catch {
      // An unreadable manifest cannot be statically approved; the smoke report
      // reports those extensions separately.
      continue;
    }
    if (manifestRejections(manifest).length > 0) continue;
    manifests.push({
      name,
      viewCommands: viewCommands(manifest),
      dependencies: manifest.dependencies ?? {},
    });
  }
  const ordered = manifests.toSorted(
    (a, b) => rank(a.name).localeCompare(rank(b.name)) || a.name.localeCompare(b.name),
  );
  console.log(`corpus:select: ${ordered.length}/${present.size} manifest-eligible candidates`);

  const analyzed: Candidate[] = [];
  const cap = Math.min(SCAN_CAP, ordered.length);
  for (let offset = 0; offset < cap; offset += SCAN_BATCH) {
    const batch = ordered.slice(offset, offset + SCAN_BATCH);
    git(repo, ["sparse-checkout", "set", "--no-cone", ...sourcePatterns(batch.map((c) => c.name))]);
    guard("sources");
    for (const { name, viewCommands: views, dependencies } of batch) {
      analyzed.push(
        analyzeSources(name, views, [...sources(join(extensionsDir, name, "src"))], dependencies),
      );
    }
    // Keep reading while any quota would have to fall back on a network user:
    // the fingerprints of the extensions that need one are the report's data.
    if (offlineQuotasMet(KEPT_CURATED, analyzed)) break;
  }

  git(repo, ["sparse-checkout", "set", "--no-cone", ...buildPatterns()]);
  guard("reset");

  const selection = selectCurated(KEPT_CURATED, analyzed);
  const short = Object.entries(selection.missing).filter(([, count]) => count > 0);
  if (short.length > 0) {
    throw new Error(
      `scanned ${analyzed.length} candidates and could not fill ${short
        .map(([stratum, count]) => `${stratum} (${count} short)`)
        .join(", ")}; review the criteria or the pin`,
    );
  }

  const stats = { scanned: analyzed.length, eligible: analyzed.filter(eligible).length };
  writeFileSync(join(root, "compat/corpus.json"), renderPin(pin, selection, stats));
  const counts = PICK_STRATA.map((stratum) => `${stratum} ${selection.picks[stratum].length}`).join(
    ", ",
  );
  console.log(
    `corpus:select: ${selection.curated.length} curated extensions (${stats.scanned} scanned, ${stats.eligible} eligible); ${counts}`,
  );

  // The kept set is fixed and never re-selected; this only records how the
  // same static rules would have classified it.
  const notes = analyzed
    .filter(
      (candidate) =>
        KEPT_CURATED.includes(candidate.name) &&
        (candidate.stratum !== "list-only" || candidate.exclusions.length > 0),
    )
    .map(({ name, exclusions, stratum }) => `${name} (${exclusions.join(", ") || stratum})`);
  if (notes.length > 0) console.log(`corpus:select: kept set, classified as: ${notes.join(", ")}`);
}

try {
  main();
} catch (error) {
  console.error(`corpus:select: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
