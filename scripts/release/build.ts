import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const output = join(root, ".cache/release");
export const packages = ["protocol", "runtime", "host", "client-core", "native", "serve", "cli"];

export function run(command: string, args: string[], cwd = root): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 180_000 });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")}: ${result.error ?? result.stderr + result.stdout}`,
    );
  return result.stdout.trim();
}

function entry(path: string) {
  const js = path.replace(/^\.\/src\//, "./dist/").replace(/\.tsx?$/, ".js");
  return { types: js.replace(/\.js$/, ".d.ts"), import: js, default: js };
}

export function releaseManifest(source: Record<string, unknown>, version: string) {
  const manifest = { ...source };
  delete manifest.private;
  delete manifest.devDependencies;
  manifest.name = String(source.name).replace("@blastlauncher/host", "@blastlauncher/engine");
  manifest.version = version;
  manifest.license = "MIT";
  manifest.engines = { node: ">=24.20.0" };
  manifest.files = ["dist", "schema", "LICENSE", "README.md"];
  manifest.exports =
    typeof source.exports === "string"
      ? { ".": entry(source.exports) }
      : Object.fromEntries(
          Object.entries(source.exports as Record<string, string>).map(([key, path]) => [
            key,
            entry(path),
          ]),
        );
  if (source.dependencies)
    manifest.dependencies = Object.fromEntries(
      Object.entries(source.dependencies as Record<string, string>).map(([name, pin]) => [
        name.replace("@blastlauncher/host", "@blastlauncher/engine"),
        pin === "workspace:*" ? version : pin,
      ]),
    );
  if (source.name === "@blastlauncher/serve") manifest.bin = { "blast-serve": "./dist/main.js" };
  if (source.name === "@blastlauncher/cli") manifest.bin = { blast: "./dist/cli.js" };
  return manifest;
}

async function rewriteImports(dir: string) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, file.name);
    if (file.isDirectory()) await rewriteImports(path);
    else if (file.name.endsWith(".js") || file.name.endsWith(".d.ts")) {
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source
          .replaceAll("@blastlauncher/host", "@blastlauncher/engine")
          .replace(/(["']\.\.?\/[^"']+)\.tsx?(["'])/g, "$1.js$2"),
      );
    }
  }
}

export async function build(version: string) {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.test(
      version,
    )
  )
    throw new Error(`Invalid release version: ${version}`);
  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, "tarballs"), { recursive: true });
  const config = join(output, "tsconfig.json");
  await writeFile(
    config,
    JSON.stringify({
      extends: join(root, "tsconfig.json"),
      compilerOptions: {
        noEmit: false,
        noEmitOnError: true,
        declaration: true,
        target: "es2024",
        rootDir: join(root, "packages"),
        outDir: join(output, "emit"),
      },
      include: packages.map((pkg) => join(root, "packages", pkg, "src/**/*")),
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*test-helper.ts"].map((pattern) =>
        join(root, "packages", pattern),
      ),
    }),
  );
  run(resolve(root, "node_modules/.bin/tsc"), ["-p", config]);
  for (const pkg of packages) {
    const dir = join(output, pkg);
    const source = JSON.parse(await readFile(join(root, "packages", pkg, "package.json"), "utf8"));
    const manifest = releaseManifest(source, version);
    await mkdir(dir, { recursive: true });
    await cp(join(output, "emit", pkg, "src"), join(dir, "dist"), { recursive: true });
    await rewriteImports(join(dir, "dist"));
    if (pkg === "protocol")
      await cp(join(root, "packages/protocol/schema"), join(dir, "schema"), { recursive: true });
    await writeFile(join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await cp(join(root, "LICENSE"), join(dir, "LICENSE"));
    await writeFile(
      join(dir, "README.md"),
      `# ${manifest.name}\n\nBlast's ${pkg === "host" ? "engine" : pkg} package.\nEmitted ESM and TypeScript declarations for Node.js 24.20+.\nSee https://github.com/BlastLauncher/blast for documentation.\n`,
    );
    if (manifest.bin)
      for (const path of Object.values(manifest.bin as Record<string, string>)) {
        const file = join(dir, path);
        await writeFile(file, `#!/usr/bin/env node\n${await readFile(file, "utf8")}`);
      }
    console.log(run("npm", ["pack", "--pack-destination", join(output, "tarballs")], dir));
  }
  await rm(join(output, "emit"), { recursive: true, force: true });
  await rm(config);
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { version: { type: "string", default: "0.0.0-dev" } } });
  await build(values.version!);
}
