import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bundleCommand } from "./bundle.ts";

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "blast-bundle-cache-"));
  const extensionDir = join(root, "hello-list");
  await cp(new URL("../../../fixtures/extensions/hello-list", import.meta.url), extensionDir, {
    recursive: true,
  });
  const cacheDir = join(root, "data", "bundles");
  return {
    extensionDir,
    cacheDir,
    source: join(extensionDir, "src", "index.tsx"),
    bundle: () =>
      bundleCommand({ extensionDir, command: "index", dataDir: join(root, "data"), cacheDir }),
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

test("a cached bundle is reused across calls until a source file changes", async () => {
  const w = await workspace();
  try {
    const first = await w.bundle();
    expect(dirname(dirname(first.entry))).toBe(w.cacheDir);
    const built = (await stat(first.entry, { bigint: true })).mtimeNs;
    const second = await w.bundle();
    expect(second.entry).toBe(first.entry);
    expect(second.assetsPath).toBe(first.assetsPath);
    expect((await stat(second.entry, { bigint: true })).mtimeNs).toBe(built);
    // An edit to an input esbuild read rebuilds into the same slot.
    const text = await readFile(w.source, "utf8");
    await writeFile(w.source, text.replace('"apple"', '"apricot"'));
    const third = await w.bundle();
    expect(third.entry).toBe(first.entry);
    expect(await readFile(third.entry, "utf8")).toContain("apricot");
    // One slot, no staging leftovers.
    expect(await readdir(w.cacheDir)).toEqual([dirname(first.entry).slice(w.cacheDir.length + 1)]);
  } finally {
    await w.remove();
  }
}, 30_000);

test("a manifest change rebuilds; a failed build leaves no staging directory", async () => {
  const w = await workspace();
  try {
    const first = await w.bundle();
    const file = join(w.extensionDir, "package.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...manifest, title: "Renamed" }));
    const built = (await stat(first.entry, { bigint: true })).mtimeNs;
    const second = await w.bundle();
    expect(second.entry).toBe(first.entry);
    expect((await stat(second.entry, { bigint: true })).mtimeNs).not.toBe(built);
    await writeFile(w.source, "export default function Command( {");
    await expect(w.bundle()).rejects.toThrow();
    // The stale slot stays until a build succeeds; no staging directory is left.
    expect((await readdir(w.cacheDir)).filter((name) => name.startsWith(".stage-"))).toEqual([]);
  } finally {
    await w.remove();
  }
}, 30_000);
