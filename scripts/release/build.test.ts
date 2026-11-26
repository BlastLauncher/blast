import { expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { packages, releaseManifest, root } from "./build.ts";

test("release manifests expose JS with declarations and resolve only release workspace names", async () => {
  for (const pkg of packages) {
    const source = JSON.parse(await readFile(join(root, "packages", pkg, "package.json"), "utf8"));
    const before = JSON.stringify(source);
    const manifest = releaseManifest(source, "1.2.3-rc.1");
    expect(JSON.stringify(source)).toBe(before);
    expect(manifest.private).toBeUndefined();
    expect(manifest.version).toBe("1.2.3-rc.1");
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/BlastLauncher/blast.git",
      directory: `packages/${pkg}`,
    });
    expect(manifest.name).toBe(`@blastlauncher/${pkg === "host" ? "engine" : pkg}`);
    for (const value of Object.values(
      manifest.exports as Record<string, { import: string; types: string }>,
    )) {
      expect(value.import).toMatch(/^\.\/dist\/.+\.js$/);
      expect(value.types).toBe(value.import.replace(/\.js$/, ".d.ts"));
    }
    const deps = manifest.dependencies as Record<string, string> | undefined;
    expect(deps?.["@blastlauncher/host"]).toBeUndefined();
    for (const [name, version] of Object.entries(deps ?? {}))
      if (name.startsWith("@blastlauncher/")) expect(version).toBe("1.2.3-rc.1");
    if (pkg === "serve") expect(manifest.bin).toEqual({ "blast-serve": "./dist/main.js" });
    if (pkg === "cli") expect(manifest.bin).toEqual({ blast: "./dist/cli.js" });
    if (pkg === "tui") expect(manifest.bin).toEqual({ "blast-tui": "./dist/main.js" });
    expect(manifest.files).toEqual(
      pkg === "web"
        ? ["dist", "schema", "LICENSE", "README.md", "assets", "sandbox"]
        : pkg === "tui"
          ? ["dist", "schema", "LICENSE", "README.md", "extensions"]
          : ["dist", "schema", "LICENSE", "README.md"],
    );
  }
});

test("release package sources do not import relative code modules outside their src/ directory", async () => {
  const escapes: string[] = [];
  async function walk(dir: string, srcRoot: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(file, srcRoot);
        continue;
      }
      if (!/\.(?:tsx?|js)$/.test(entry.name) || /\.test\.|test-helper\./.test(entry.name)) continue;
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(
        /(?:from|import)\s*\(?["'](\.\.?\/[^"']+\.(?:tsx?|m?js))["']\)?/g,
      )) {
        const target = resolve(dirname(file), match[1]!);
        if (relative(srcRoot, target).startsWith(".."))
          escapes.push(`${relative(root, file)} -> ${match[1]}`);
      }
    }
  }
  for (const pkg of packages)
    await walk(join(root, "packages", pkg, "src"), join(root, "packages", pkg, "src"));
  expect(escapes).toEqual([]);
});
