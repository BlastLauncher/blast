// Entry point for `bun run corpus:fetch [--extension <name>]... [--curated]`.
// It maintains a pinned, shallow, blobless, sparse checkout of the Raycast
// extension corpus in `.cache/raycast-extensions/`. This is the only corpus
// file that runs git, and it never asks git for blob sizes: on a partial clone
// that request downloads the whole repository. Every step is followed by the
// disk-budget check, so a mistake aborts instead of filling the disk.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildPatterns,
  checkDiskBudget,
  CORPUS_DIR,
  directoryBytes,
  maxMbFromEnv,
  megabytes,
  parseArgs,
  readPin,
} from "./corpus.ts";

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed with status ${result.status}`);
}

/** Local-only resolution: `HEAD` is always present, so this cannot fetch. */
function head(cwd: string): string | undefined {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function main(): void {
  const root = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const pin = readPin(root);
  const maxMb = maxMbFromEnv(process.env);
  const repoDir = join(root, CORPUS_DIR);
  const requested = options.curated ? [...pin.curated, ...options.extensions] : options.extensions;
  const patterns = buildPatterns(requested);

  const guard = (step: string): void => {
    const bytes = directoryBytes(repoDir);
    const over = checkDiskBudget(bytes, maxMb);
    if (over !== undefined) {
      console.error(`corpus: ${step}: ${over}`);
      process.exit(1);
    }
    console.log(`corpus: ${step}: ${megabytes(bytes)} MB`);
  };

  if (!existsSync(join(repoDir, ".git"))) {
    if (existsSync(repoDir)) {
      throw new Error(`${CORPUS_DIR}: exists but is not a git checkout; delete it and re-run`);
    }
    mkdirSync(join(root, ".cache"), { recursive: true });
    git(root, [
      "clone",
      "--depth=1",
      "--filter=blob:none",
      "--no-checkout",
      "--sparse",
      pin.repository,
      CORPUS_DIR,
    ]);
    guard("clone");
  }

  // The clone carries the default branch tip, not necessarily the pin, and the
  // probe that would answer "is the pin here?" resolves objects, which on a
  // partial clone silently fetches them. Fetch the pin every run instead: it
  // is idempotent and keeps the step observable.
  git(repoDir, ["fetch", "--depth=1", "origin", pin.commit]);
  guard("fetch");

  git(repoDir, ["sparse-checkout", "set", "--no-cone", ...patterns]);
  guard("sparse-checkout");
  git(repoDir, ["-c", "advice.detachedHead=false", "checkout", pin.commit]);
  guard("checkout");

  const resolved = head(repoDir);
  if (resolved !== pin.commit) {
    throw new Error(`HEAD is ${resolved}, expected the pin ${pin.commit}`);
  }
  console.log(`corpus: ${CORPUS_DIR} is at ${pin.commit}`);
  for (const pattern of patterns) console.log(`corpus:   ${pattern}`);
}

try {
  main();
} catch (error) {
  console.error(`corpus: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
