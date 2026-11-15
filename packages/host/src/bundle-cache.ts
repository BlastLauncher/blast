// A persistent cache of command bundles under `<dataDir>/bundles/`, so a new
// process (a tmux popup, a CLI run) reuses the last build instead of running
// esbuild again. One slot per extension directory and command; a slot is
// reused only when its key (manifest, aliases, dependency install, bundler)
// matches and every file esbuild read still has the same size and mtime.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Bump when the stored layout or the bundle output changes shape. */
const FORMAT = 1;

type Fingerprint = [path: string, size: string, mtimeNs: string];

export type BundleCache<Result> = {
  /** The stored result when the slot is current, else `undefined`. */
  read(): Promise<Result | undefined>;
  /** A fresh build directory inside the cache, published by `publish`. */
  stage(): Promise<string>;
  /** Moves a staged build into the slot; returns `result` with paths rebased. */
  publish(staged: string, inputs: readonly string[], result: Result): Promise<Result>;
};

async function fingerprint(path: string): Promise<Fingerprint | undefined> {
  const info = await stat(path, { bigint: true }).catch(() => undefined);
  return info?.isFile() ? [path, String(info.size), String(info.mtimeNs)] : undefined;
}

const escaped = (path: string) => JSON.stringify(path).slice(1, -1);
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

/** Paths in `result` that point into the build directory, rebased on publish. */
function rebase<Result>(result: Result, from: string, to: string): Result {
  return JSON.parse(JSON.stringify(result).replaceAll(escaped(from), escaped(to)));
}

export function openBundleCache<Result>(
  cacheDir: string,
  slotName: string,
  key: unknown,
): BundleCache<Result> {
  const slot = join(cacheDir, hash(slotName));
  const keyText = JSON.stringify({ format: FORMAT, key });
  return {
    async read() {
      let stored: { key: string; inputs: Fingerprint[]; result: Result };
      try {
        stored = JSON.parse(await readFile(join(slot, "bundle.json"), "utf8"));
      } catch {
        return undefined;
      }
      if (stored.key !== keyText || !Array.isArray(stored.inputs)) return undefined;
      const current = await Promise.all(stored.inputs.map(([path]) => fingerprint(path)));
      const fresh = current.every(
        (now, index) => JSON.stringify(now) === JSON.stringify(stored.inputs[index]),
      );
      return fresh ? stored.result : undefined;
    },
    async stage() {
      await mkdir(cacheDir, { recursive: true });
      return mkdtemp(join(cacheDir, ".stage-"));
    },
    async publish(staged, inputs, result) {
      // Virtual modules (plugin namespaces) are covered by the key, not files.
      const prints = (await Promise.all([...new Set(inputs)].map(fingerprint))).filter(
        (print) => print !== undefined,
      );
      const published = rebase(result, staged, slot);
      await writeFile(
        join(staged, "bundle.json"),
        JSON.stringify({ key: keyText, inputs: prints, result: published }),
      );
      // A stale slot is replaced whole. A concurrent publish of the same slot
      // can win the rename; the retry replaces it with this build.
      for (let attempt = 0; ; attempt++) {
        await rm(slot, { recursive: true, force: true });
        try {
          await rename(staged, slot);
          return published;
        } catch (error) {
          if (attempt) {
            await rm(staged, { recursive: true, force: true });
            throw error;
          }
        }
      }
    },
  };
}
