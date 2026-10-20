import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bundleCommand,
  createBroker,
  type DependencyInstaller,
  checkExtensionDependencies,
  installExtensionDependencies,
  MissingDependencyError,
  startCommand,
} from "./index.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function setup(dependencies: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), "blast-deps-test-"));
  directories.push(root);
  const extensionDir = join(root, "extension");
  const dataDir = join(root, "data");
  await mkdir(join(extensionDir, "src"), { recursive: true });
  const manifest = {
    name: "@scope/extension",
    version: "1.0.0",
    dependencies,
    commands: [{ name: "index", mode: "view" }],
    devDependencies: { "never-install-dev": "1" },
  };
  await writeFile(join(extensionDir, "package.json"), JSON.stringify(manifest));
  return { root, extensionDir, dataDir, manifest };
}

test("install keys are stable, strip runtime packages, honor npm flags and replace on lock changes", async () => {
  const options = await setup({
    "@raycast/api": "1",
    react: "19",
    "react-dom": "19",
    "react/jsx-runtime": "19",
    "@types/node": "24",
    example: "^1",
  });
  const lockPath = join(options.extensionDir, "package-lock.json");
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: options.manifest.dependencies },
      "node_modules/example": { version: "1.2.3" },
    },
  };
  await writeFile(lockPath, JSON.stringify(lock));
  const initial = await checkExtensionDependencies(options);
  expect(initial.needed).toBe(true);
  expect(initial.pinned).toBe(true);
  await writeFile(
    join(options.extensionDir, "package.json"),
    JSON.stringify({
      ...options.manifest,
      dependencies: Object.fromEntries(Object.entries(options.manifest.dependencies).toReversed()),
    }),
  );
  expect((await checkExtensionDependencies(options)).key).toBe(initial.key);
  expect(dirname(initial.directory)).toBe(join(options.dataDir, "deps"));
  let calls = 0;
  const installer: DependencyInstaller = async (request) => {
    calls++;
    expect(request.args).toEqual([
      "install",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ]);
    expect(request.cwd).toBe(initial.directory);
    const manifest = JSON.parse(await readFile(join(request.cwd, "package.json"), "utf8"));
    // react-dom is not supplied by the runtime; it bundles against the runtime's react.
    expect(manifest.dependencies).toEqual({ "react-dom": "19", example: "^1" });
    expect(manifest.devDependencies).toBeUndefined();
    const copied = JSON.parse(await readFile(join(request.cwd, "package-lock.json"), "utf8"));
    expect(copied.packages[""].dependencies).toEqual({ "react-dom": "19", example: "^1" });
    expect(copied.packages["node_modules/example"].version).toBe(
      lock.packages["node_modules/example"].version,
    );
  };
  await installExtensionDependencies({ ...options, installer });
  expect((await checkExtensionDependencies(options)).needed).toBe(false);
  const logs: string[] = [];
  await installExtensionDependencies({
    ...options,
    installer,
    onLog: (message) => logs.push(message),
  });
  expect(calls).toBe(1);
  expect(logs.join("")).toContain("up to date");
  await writeFile(join(initial.directory, "stale"), "old");
  lock.packages["node_modules/example"].version = "1.2.4";
  await writeFile(lockPath, JSON.stringify(lock));
  expect((await checkExtensionDependencies(options)).needed).toBe(true);
  await installExtensionDependencies({ ...options, installer });
  expect(calls).toBe(2);
  expect(await readdir(initial.directory)).not.toContain("stale");
});

test("unpinned installs warn, manifest changes invalidate, failures never publish a key", async () => {
  const options = await setup({ example: "^1" });
  const logs: string[] = [];
  const first = await installExtensionDependencies({
    ...options,
    installer: async () => {},
    onLog: (message) => logs.push(message),
  });
  expect(logs.join("")).toContain("unpinned");
  options.manifest.dependencies.example = "^2";
  await writeFile(join(options.extensionDir, "package.json"), JSON.stringify(options.manifest));
  expect((await checkExtensionDependencies(options)).key).not.toBe(first.key);
  await expect(
    installExtensionDependencies({
      ...options,
      installer: async () => {
        throw new Error("offline failure");
      },
    }),
  ).rejects.toThrow("offline failure");
  expect((await checkExtensionDependencies(options)).needed).toBe(true);
  expect(await readdir(join(options.dataDir, "deps"))).toEqual([]);
});

test("matching installed utils override the shared version; stale installs fall back", async () => {
  const options = await setup({ "@raycast/utils": "1.0.0", "not-installed": "1" });
  await writeFile(
    join(options.extensionDir, "src/index.ts"),
    'import { marker } from "@raycast/utils"; console.log(marker);',
  );
  const installed = await installExtensionDependencies({
    ...options,
    installer: async ({ cwd }) => {
      const pkg = join(cwd, "node_modules/@raycast/utils");
      await mkdir(pkg, { recursive: true });
      await writeFile(
        join(pkg, "package.json"),
        JSON.stringify({ name: "@raycast/utils", main: "index.js" }),
      );
      await writeFile(
        join(pkg, "index.js"),
        'import { value } from "nested-dependency"; export const marker = value;',
      );
      const nested = join(pkg, "node_modules/nested-dependency");
      await mkdir(nested, { recursive: true });
      await writeFile(join(nested, "package.json"), JSON.stringify({ main: "index.js" }));
      await writeFile(join(nested, "index.js"), 'export const value = "installed-utils";');
    },
  });
  const bundle = await bundleCommand({
    ...options,
    command: "index",
    outDir: join(options.root, "build"),
  });
  expect(await readFile(bundle.entry, "utf8")).toContain("installed-utils");
  expect(bundle.dependencyWarnings).toEqual([]);
  // Corpus reports opt out and keep the shared allowlist (decision 0008).
  await writeFile(
    join(options.extensionDir, "src/index.ts"),
    'import { useCachedState } from "@raycast/utils"; console.log(useCachedState);',
  );
  const shared = await bundleCommand({
    ...options,
    command: "index",
    outDir: join(options.root, "shared"),
    installedDependencies: false,
  });
  expect(await readFile(shared.entry, "utf8")).not.toContain("installed-utils");
  await writeFile(join(options.extensionDir, "src/index.ts"), 'import "not-installed";');
  await expect(bundleCommand({ ...options, command: "index" })).rejects.toBeInstanceOf(
    MissingDependencyError,
  );
  await writeFile(join(installed.directory, "key"), "stale");
  await writeFile(
    join(options.extensionDir, "src/index.ts"),
    'import { useCachedState } from "@raycast/utils"; console.log(useCachedState);',
  );
  const fallback = await bundleCommand({
    ...options,
    command: "index",
    outDir: join(options.root, "fallback"),
  });
  expect(fallback.dependencyWarnings?.join("")).toContain("@raycast/utils");
});

async function snapshot(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const [path, content] of Object.entries(await snapshot(join(dir, entry.name))))
        result[`${entry.name}/${path}`] = content;
    } else result[entry.name] = (await readFile(join(dir, entry.name))).toString("base64");
  }
  return result;
}
function cli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number | null; output: string }> {
  return new Promise((done, reject) => {
    const child = spawn(
      "node",
      [fileURLToPath(new URL("../../cli/src/cli.ts", import.meta.url)), ...args],
      {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => done({ code, output }));
  });
}

test("CLI installs a real file package offline, reuses it and runs without touching the extension", async () => {
  const options = await setup();
  const fixtures = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
  const extensionDir = join(options.root, "extensions/installed-deps");
  await cp(join(fixtures, "extensions/installed-deps"), extensionDir, { recursive: true });
  await cp(join(fixtures, "packages"), join(options.root, "packages"), { recursive: true });
  const before = await snapshot(extensionDir);
  const args = ["deps", extensionDir, "--data-dir", options.dataDir];
  const env = {
    ...process.env,
    npm_config_offline: "true",
    npm_config_cache: join(options.root, "npm-cache"),
  };
  const first = await cli(args, env);
  expect(first).toMatchObject({ code: 0 });
  expect(first.output).not.toContain("unpinned");
  const second = await cli(args, env);
  expect(second.code).toBe(0);
  expect(second.output).toContain("up to date");
  const launched = await cli(["run", extensionDir, "index", "--data-dir", options.dataDir]);
  expect(launched.code).toBe(0);
  expect(launched.output).toContain("Installed offline dependency");
  const bundled = await bundleCommand({
    extensionDir,
    dataDir: options.dataDir,
    command: "index",
    outDir: join(options.root, "build"),
  });
  const session = await startCommand({
    ...bundled,
    broker: createBroker(),
    dataDir: options.dataDir,
  });
  try {
    const scene = await new Promise((done, reject) => {
      session.scenes(done);
      void session.exited.then((exit) => reject(exit.error ?? new Error("Exited before scene")));
    });
    expect(JSON.stringify(scene)).toContain("Installed offline dependency");
  } finally {
    await session.shutdown();
  }
  expect(await snapshot(extensionDir)).toEqual(before);
  const without = await cli([
    "run",
    extensionDir,
    "index",
    "--data-dir",
    join(options.root, "empty"),
  ]);
  expect(without.code).toBe(3);
  expect(without.output).toContain("blast deps");
}, 15000);

test("runtime-only dependencies publish a reusable key without invoking npm", async () => {
  const options = await setup({ "@raycast/api": "1", react: "19", "@types/node": "24" });
  await installExtensionDependencies({
    ...options,
    installer: async () => {
      throw new Error("npm must not run");
    },
  });
  expect((await checkExtensionDependencies(options)).needed).toBe(false);
});
