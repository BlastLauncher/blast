import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "../package.json" with { type: "json" };
import { bundleCommand, MissingDependencyError } from "./bundle.ts";
import { dependencyWarnings, PROVIDED_PACKAGES } from "./dependencies.ts";

const fixture = fileURLToPath(
  new URL("../../../fixtures/extensions/shared-dependencies", import.meta.url),
);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function bundle(command: string, extensionDir = fixture) {
  const outDir = await mkdtemp(join(tmpdir(), "blast-provided-"));
  directories.push(outDir);
  return bundleCommand({ extensionDir, command, outDir });
}
async function execute(entry: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [
      "--input-type=module",
      "-e",
      "(await import(process.argv[1])).default()",
      entry,
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr))));
  });
}

test("provided default and subpath imports execute under Node without extension installs", async () => {
  expect(await execute((await bundle("default")).entry)).toBe("sharedDependency\n");
  expect(await execute((await bundle("subpath")).entry)).toBe("2026-01-02\nsubpath works\n");
  expect((await bundle("default")).dependencyWarnings).toEqual([
    "Shared dependency lodash: declared ^3.0.0, provided 4.18.1 (major mismatch)",
  ]);
});

test("unprovided packages still fail with MISSING_DEPENDENCY", async () => {
  try {
    await bundle("unprovided");
    throw new Error("Unexpected success");
  } catch (error) {
    expect(error).toBeInstanceOf(MissingDependencyError);
    expect(error).toMatchObject({
      code: "MISSING_DEPENDENCY",
      packages: ["blast-unprovided-package"],
    });
  }
});

test("warnings respect unions, wildcard and comparison ranges rather than their first number", () => {
  for (const range of ["^4", "^3 || ^4", "*", ">=3", "latest", "workspace:*", ">=4.99 <5"]) {
    expect(dependencyWarnings({ lodash: range })).toEqual([]);
  }
  for (const range of ["^3", "<4", ">=5"]) {
    expect(dependencyWarnings({ lodash: range })).toEqual([
      `Shared dependency lodash: declared ${range}, provided 4.18.1 (major mismatch)`,
    ]);
  }
});

test("every pinned provided package bundles its graph without extension-local dependencies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blast-provided-graphs-"));
  directories.push(dir);
  await mkdir(join(dir, "src"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "graphs", commands: [{ name: "index", mode: "no-view" }] }),
  );
  const dependencies: Record<string, string> = manifest.dependencies;
  for (const name of PROVIDED_PACKAGES.filter((packageName) => dependencies[packageName])) {
    await writeFile(
      join(dir, "src/index.ts"),
      `import * as provided from ${JSON.stringify(name)}; console.log(Object.keys(provided));`,
    );
    await bundle("index", dir);
  }
}, 30_000);

test("provided graphs keep their own transitive versions without exposing them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blast-provided-private-"));
  directories.push(dir);
  await mkdir(join(dir, "src"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "private-graph",
      commands: [{ name: "index", mode: "no-view" }],
    }),
  );
  await writeFile(
    join(dir, "src/index.ts"),
    `
    import { Response as cross } from "cross-fetch";
    import { Response as direct } from "node-fetch";
    export default function () { console.log(cross === direct); }
  `,
  );
  expect(await execute((await bundle("index", dir)).entry)).toBe("false\n");
  await writeFile(
    join(dir, "src/index.ts"),
    'import FormData from "form-data"; console.log(FormData);',
  );
  await expect(bundle("index", dir)).rejects.toMatchObject({
    code: "MISSING_DEPENDENCY",
    packages: ["form-data"],
  });
});
