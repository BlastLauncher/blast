// The one impure step the smoke runners share (`smoke-run.ts`,
// `tui-smoke-run.ts`): narrow the corpus checkout to exactly one batch of
// extensions, through `corpus:fetch` — the only script allowed to run git for
// the corpus. `sparse-checkout set` drops every extension not listed from the
// working tree, so calling this with the next batch is how the previous
// batch's checkout gets dropped before the next one starts, and calling it
// with an empty batch is how a finished run leaves the checkout
// manifest-only.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, sep } from "node:path";
import { CORPUS_DIR, directoryBytes, maxMbFromEnv, shouldReclone } from "./corpus.ts";

/** Lock files a killed git step leaves behind: `index` and `sparse-checkout`. */
const LOCK_FILES = ["index.lock", join("info", "sparse-checkout.lock")] as const;

/** The clone path, refusing an empty root so a deletion can never widen. */
function clonePath(root: string): string {
  if (root.trim() === "")
    throw new Error("corpus root must be non-empty before deleting the clone");
  return join(root, CORPUS_DIR);
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * True when a running `git` process has a working directory inside `repo`,
 * i.e. another run is using this clone. When `lsof` is missing or fails the
 * answer is "no owner": Blast runs one sweep per checkout, so a lock with no
 * visible owner is the interrupted run this recovery exists for.
 */
function gitProcessInClone(repo: string): boolean {
  const result = spawnSync("lsof", ["-a", "-c", "git", "-d", "cwd", "-Fn"], { encoding: "utf8" });
  if (result.error || result.status !== 0) return false;
  const base = canonical(repo);
  return result.stdout.split("\n").some((line) => {
    if (!line.startsWith("n")) return false;
    const cwd = canonical(line.slice(1));
    return cwd === base || cwd.startsWith(`${base}${sep}`);
  });
}

/**
 * Delete a clone left locked by an interrupted git operation. A lock that a
 * live git process owns is kept: that run will clear it itself.
 */
export async function removeStaleClone(
  root: string,
  inUse: (repo: string) => boolean = gitProcessInClone,
): Promise<boolean> {
  const repo = clonePath(root);
  const locked = LOCK_FILES.some((name) => existsSync(join(repo, ".git", name)));
  if (!locked || inUse(repo)) return false;
  await rm(repo, { recursive: true, force: true });
  return true;
}

/**
 * Fetch `extensions` and return the size of `.cache` afterwards, for the
 * caller's peak-disk bookkeeping.
 */
export async function fetchBatch(extensions: string[], root: string): Promise<number> {
  const repo = clonePath(root);
  // Recover from a checkout a killed run left half-done before git refuses to
  // reuse the clone.
  await removeStaleClone(root);
  // A partial clone retains every fetched blob even after sparse-checkout drops
  // its working tree. Reclone only once it reaches half the budget, so a long
  // sweep pays for a clone every few batches instead of before every one.
  if (extensions.length > 0 && shouldReclone(directoryBytes(repo), maxMbFromEnv(process.env)))
    await rm(repo, { recursive: true, force: true });
  const args = ["scripts/corpus/fetch.ts", ...extensions.flatMap((name) => ["--extension", name])];
  const fetch = spawnSync("bun", args, { stdio: "inherit" });
  if (fetch.status !== 0) throw new Error("corpus fetch failed; see output above");
  return directoryBytes(join(root, ".cache"));
}
