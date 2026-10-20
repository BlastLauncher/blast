// Entry point for `bun run corpus:select-deps` (task 0070). Static and
// read-only over the pinned corpus, like `select.ts`: it reads the fetched
// manifests, sparsely checks out the sources and lockfile of a bounded number
// of candidates, applies the rules in `deps-selection.ts`, and rewrites
// `compat/corpus-deps.json`. `corpus:smoke-deps` consumes what it writes. Every
// step is followed by the disk-budget check.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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
import {
  analyzeDepsSources,
  DEPS_PIN_PATH,
  depsManifestRejections,
  depsEligible,
  installedDependencies,
  primaryPackage,
  renderDepsPin,
  scanOrder,
  selectDeps,
  type DepsCandidate,
  type DepsManifestCandidate,
  type ImportCounts,
} from "./deps-selection.ts";
import { DEPENDENCIES_PATH } from "./dependencies.ts";
import { sources, sourcePatterns } from "./scan.ts";
import { SCAN_BATCH, type Manifest } from "./selection.ts";

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed with status ${result.status}`);
  return result.stdout;
}

/** Extensions whose lockfile is in the pinned tree. Trees only: no blob is fetched. */
function lockedExtensions(repo: string): Set<string> {
  const listing = git(repo, ["ls-tree", "-r", "--name-only", "HEAD", "extensions/"]);
  const locked = new Set<string>();
  for (const line of listing.split("\n")) {
    const match = /^extensions\/([^/]+)\/package-lock\.json$/.exec(line);
    if (match) locked.add(match[1]!);
  }
  return locked;
}

function importCounts(root: string): ImportCounts {
  const report = JSON.parse(readFileSync(join(root, DEPENDENCIES_PATH), "utf8")) as {
    packages: { name: string; imported: number }[];
  };
  return new Map(report.packages.map((entry) => [entry.name, entry.imported]));
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
    console.log(`corpus:select-deps: ${step}: ${megabytes(bytes)} MB`);
  };

  const fetched = spawnSync("bun", ["scripts/corpus/fetch.ts"], { stdio: "inherit" });
  if (fetched.status !== 0) throw new Error("manifest fetch failed; see output above");
  guard("manifests");

  const extensionsDir = join(repo, "extensions");
  const locked = lockedExtensions(repo);
  const counts = importCounts(root);
  const manifests: DepsManifestCandidate[] = [];
  for (const entry of readdirSync(extensionsDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .toSorted((a, b) => a.name.localeCompare(b.name))) {
    const manifestPath = join(extensionsDir, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    } catch {
      continue;
    }
    if (depsManifestRejections(manifest, locked.has(entry.name)).length > 0) continue;
    const dependencies = installedDependencies(manifest);
    manifests.push({
      name: entry.name,
      dependencies,
      primary: primaryPackage(dependencies, counts),
    });
  }
  console.log(`corpus:select-deps: ${manifests.length} manifest-eligible candidates`);

  const byName = new Map(manifests.map((candidate) => [candidate.name, candidate]));
  const order = scanOrder(manifests, counts);
  const analyzed: DepsCandidate[] = [];
  try {
    for (let offset = 0; offset < order.length; offset += SCAN_BATCH) {
      const batch = order.slice(offset, offset + SCAN_BATCH);
      git(repo, [
        "sparse-checkout",
        "set",
        "--no-cone",
        ...sourcePatterns(batch),
        ...batch.map((name) => `/extensions/${name}/package-lock.json`),
      ]);
      guard("sources");
      for (const name of batch) {
        const dir = join(extensionsDir, name);
        analyzed.push(
          analyzeDepsSources(
            byName.get(name)!,
            [...sources(join(dir, "src"))],
            statSync(join(dir, "package-lock.json")).size,
          ),
        );
      }
    }
  } finally {
    git(repo, ["sparse-checkout", "set", "--no-cone", ...buildPatterns()]);
  }
  guard("reset");

  const selection = selectDeps(analyzed, counts);
  if (selection.missing > 0)
    throw new Error(
      `scanned ${analyzed.length} candidates and could not fill ${selection.missing} picks; review the criteria`,
    );
  writeFileSync(
    join(root, DEPS_PIN_PATH),
    renderDepsPin(pin, selection, {
      manifestEligible: manifests.length,
      scanned: analyzed.length,
      eligible: analyzed.filter(depsEligible).length,
    }),
  );
  console.log(
    `corpus:select-deps: ${selection.extensions.length} extensions (${analyzed.length} scanned, ${analyzed.filter(depsEligible).length} eligible) -> ${DEPS_PIN_PATH}`,
  );
}

try {
  main();
} catch (error) {
  console.error(`corpus:select-deps: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
