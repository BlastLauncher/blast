// The one impure step the smoke runners share (`smoke-run.ts`,
// `tui-smoke-run.ts`): narrow the corpus checkout to exactly one batch of
// extensions, through `corpus:fetch` — the only script allowed to run git for
// the corpus. `sparse-checkout set` drops every extension not listed from the
// working tree, so calling this with the next batch is how the previous
// batch's checkout gets dropped before the next one starts, and calling it
// with an empty batch is how a finished run leaves the checkout
// manifest-only.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { checkDiskBudget, CORPUS_DIR, directoryBytes, maxMbFromEnv, shouldReclone } from "./corpus.ts";

const LOCK_NAMES = ["index.lock", "sparse-checkout.lock"] as const;

function clonePath(root: string): string {
  if (root.trim() === "") throw new Error("corpus root must be non-empty before deleting the clone");
  return join(root, CORPUS_DIR);
}

function lockOwned(lockPath: string): boolean {
  const result = spawnSync("lsof", ["-t", "--", lockPath], { encoding: "utf8" });
  if (result.error || result.status === null) return true;
  return result.status === 0 && result.stdout.trim() !== "";
}

/** Remove a clone left locked by an interrupted git operation. */
export async function removeStaleClone(root: string): Promise<boolean> {
  const repo = clonePath(root);
  const stale = LOCK_NAMES.some((name) => {
    const lock = join(repo, ".git", name);
    return existsSync(lock) && !lockOwned(lock);
  });
  if (!stale) return false;
  await rm(join(root, CORPUS_DIR), { recursive: true, force: true });
  return true;
}

/**
 * Fetch `extensions` and return the size of `.cache` afterwards, for the
 * caller's peak-disk bookkeeping.
 */
export async function fetchBatch(extensions: string[], root: string): Promise<number> {
  const repo = clonePath(root);
  await removeStaleClone(root);
  // A partial clone retains every fetched blob after sparse-checkout drops its
  // working tree. Reclone only when it nears half the configured budget.
  if (extensions.length > 0 && shouldReclone(directoryBytes(repo), maxMbFromEnv(process.env)))
    await rm(join(root, CORPUS_DIR), { recursive: true, force: true });
  const args = ["scripts/corpus/fetch.ts", ...extensions.flatMap((name) => ["--extension", name])];
  const fetch = spawnSync("bun", args, { stdio: "inherit" });
  if (fetch.status !== 0) throw new Error("corpus fetch failed; see output above");
  return directoryBytes(join(root, ".cache"));
}
