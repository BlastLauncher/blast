// The one impure step the smoke runners share (`smoke-run.ts`,
// `tui-smoke-run.ts`): narrow the corpus checkout to exactly one batch of
// extensions, through `corpus:fetch` — the only script allowed to run git for
// the corpus. `sparse-checkout set` drops every extension not listed from the
// working tree, so calling this with the next batch is how the previous
// batch's checkout gets dropped before the next one starts, and calling it
// with an empty batch is how a finished run leaves the checkout
// manifest-only.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { directoryBytes } from "./corpus.ts";

/**
 * Fetch `extensions` and return the size of `.cache` afterwards, for the
 * caller's peak-disk bookkeeping.
 */
export function fetchBatch(extensions: string[], root: string): number {
  // A partial clone retains every fetched blob even after sparse-checkout drops
  // its working tree. Reclone between source batches so the next batch does
  // not inherit the previous batch's blobs and grow past the disk budget.
  if (extensions.length > 0)
    rmSync(join(root, ".cache/raycast-extensions"), { recursive: true, force: true });
  const args = ["scripts/corpus/fetch.ts", ...extensions.flatMap((name) => ["--extension", name])];
  const fetch = spawnSync("bun", args, { stdio: "inherit" });
  if (fetch.status !== 0) throw new Error("corpus fetch failed; see output above");
  return directoryBytes(join(root, ".cache"));
}
