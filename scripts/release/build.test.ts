import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { packages, releaseManifest, root } from "./build.ts";

test("release manifests expose JS with declarations and resolve only release workspace names", async () => {
  for (const pkg of packages) {
    const source = JSON.parse(await readFile(join(root, "packages", pkg, "package.json"), "utf8"));
    const before = JSON.stringify(source);
    const manifest = releaseManifest(source, "1.2.3-rc.1");
    expect(JSON.stringify(source)).toBe(before);
    expect(manifest.private).toBeUndefined();
    expect(manifest.version).toBe("1.2.3-rc.1");
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
  }
});
