import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bundleCommand,
  createBroker,
  installExtensionDependencies,
  startCommand,
  type Session,
} from "./index.ts";
import { loadTsconfigAliases } from "./tsconfig-paths.ts";

const fixture = fileURLToPath(
  new URL("../../../fixtures/extensions/tsconfig-paths", import.meta.url),
);

const sessions: Session[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.shutdown({ timeoutMs: 20 })));
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Waits for the rendered scene to contain `title`, resolving with its JSON. */
async function renderedJson(session: Session, title: string): Promise<string> {
  if (session.latestScene?.root && JSON.stringify(session.latestScene.root).includes(title))
    return JSON.stringify(session.latestScene.root);
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void;
    const accept = (snapshot: { root?: unknown }) => {
      const json = JSON.stringify(snapshot.root);
      if (json.includes(title)) {
        resolve(json);
        unsubscribe?.();
      }
    };
    unsubscribe = session.scenes(accept);
    void session.exited.then((exit) => {
      unsubscribe();
      reject(exit.error ?? new Error("Exited before scene"));
    });
  });
}

test("tsconfig baseUrl and paths aliases bundle and render unmodified", async () => {
  const bundled = await bundleCommand({ extensionDir: fixture, command: "index" });
  directories.push(join(bundled.entry, ".."));
  const session = await startCommand({ ...bundled, broker: createBroker() });
  sessions.push(session);
  const json = await renderedJson(session, "from baseUrl from paths");
  // Both alias styles reach the scene: a bare baseUrl import and a paths alias.
  expect(json).toContain('"title":"from baseUrl"');
  expect(json).toContain('"title":"from paths"');
}, 20_000);

test("a baseUrl directory wins over an installed package with the same name", async () => {
  const root = await mkdtemp(join(tmpdir(), "blast-tsconfig-precedence-"));
  directories.push(root);
  const extensionDir = join(root, "extension");
  await cp(fixture, extensionDir, { recursive: true });
  const manifest = JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8"));
  await writeFile(
    join(extensionDir, "package.json"),
    JSON.stringify({ ...manifest, dependencies: { common: "1.0.0" } }),
  );
  await installExtensionDependencies({
    extensionDir,
    dataDir: join(root, "data"),
    installer: async ({ cwd }) => {
      const pkg = join(cwd, "node_modules/common");
      await mkdir(pkg, { recursive: true });
      await writeFile(
        join(pkg, "package.json"),
        JSON.stringify({ name: "common", main: "index.js" }),
      );
      await writeFile(join(pkg, "index.js"), 'export const marker = "installed package";');
    },
  });
  await writeFile(
    join(extensionDir, "src/common/title.ts"),
    'export const marker = "extension-local";',
  );
  await writeFile(
    join(extensionDir, "src/index.tsx"),
    'import { marker } from "common/title";\nexport default () => marker;',
  );
  const bundled = await bundleCommand({
    extensionDir,
    command: "index",
    outDir: join(root, "out"),
  });
  const source = await readFile(bundled.entry, "utf8");
  expect(source).toContain("extension-local");
  expect(source).not.toContain("installed package");
});

test("a bare import that resolves neither way still fails with the install hint", async () => {
  const root = await mkdtemp(join(tmpdir(), "blast-tsconfig-missing-"));
  directories.push(root);
  const extensionDir = join(root, "extension");
  await cp(fixture, extensionDir, { recursive: true });
  await writeFile(
    join(extensionDir, "src/index.tsx"),
    'import { nope } from "blast-unaliased";\nexport default () => nope;',
  );
  await expect(bundleCommand({ extensionDir, command: "index" })).rejects.toMatchObject({
    code: "MISSING_DEPENDENCY",
    packages: ["blast-unaliased"],
    message: expect.stringMatching(/blast deps/),
  });
});

test("an extends target outside the extension is skipped with a warning, aliases still apply", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blast-tsconfig-extends-"));
  directories.push(dir);
  await mkdir(join(dir, "src/common"), { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "extends-preset", commands: [{ name: "index", mode: "no-view" }] }),
  );
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: "@tsconfig/not-installed/tsconfig.json",
      compilerOptions: { baseUrl: "src" },
    }),
  );
  await writeFile(join(dir, "src/common/title.ts"), 'export const marker = "aliased";');
  await writeFile(
    join(dir, "src/index.tsx"),
    'import { marker } from "common/title";\nexport default () => marker;',
  );
  const aliases = await loadTsconfigAliases(dir);
  expect(aliases?.warnings).toEqual([
    'Blast ignored the tsconfig extends target "@tsconfig/not-installed/tsconfig.json": ' +
      "outside the extension, so its path aliases are off",
  ]);
  const bundled = await bundleCommand({
    extensionDir: dir,
    command: "index",
    outDir: join(dir, "out"),
  });
  expect(await readFile(bundled.entry, "utf8")).toContain("aliased");
});

test("paths without baseUrl resolve targets against the tsconfig directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blast-tsconfig-unit-"));
  directories.push(dir);
  await mkdir(join(dir, "lib"), { recursive: true });
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        paths: { "@lib/*": ["./lib/*"], exact: ["./lib/exact-file"], "@dir": ["./lib"] },
      },
    }),
  );
  await writeFile(join(dir, "lib/exact-file.ts"), "export const exact = true;");
  await writeFile(join(dir, "lib/alias-file.ts"), "export const alias = true;");
  await writeFile(join(dir, "lib/index.ts"), "export const index = true;");
  const aliases = (await loadTsconfigAliases(dir))!;
  expect(await aliases.resolve("@lib/alias-file")).toBe(join(dir, "lib/alias-file.ts"));
  expect(await aliases.resolve("exact")).toBe(join(dir, "lib/exact-file.ts"));
  // A directory target resolves through its index file.
  expect(await aliases.resolve("@dir")).toBe(join(dir, "lib/index.ts"));
  // An unresolved alias stays a package for the dependency policy.
  expect(await aliases.resolve("@lib/missing")).toBeUndefined();
  expect(await aliases.resolve("./relative")).toBeUndefined();
});

test("alias targets outside the extension are never probed and self-extends cannot loop", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blast-tsconfig-outside-"));
  directories.push(dir);
  // Self-extends must not loop, and a paths target escaping the extension
  // directory must not even be probed (the outside file exists).
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: "./tsconfig.json",
      compilerOptions: { paths: { "@out/*": ["../outside/*"] } },
    }),
  );
  const outside = join(dir, "../outside");
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "marker.ts"), "export const outside = true;");
  const aliases = (await loadTsconfigAliases(dir))!;
  expect(await aliases.resolve("@out/marker")).toBeUndefined();
});

test("an unreadable tsconfig degrades to no aliasing with a warning", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blast-tsconfig-broken-"));
  directories.push(dir);
  await writeFile(join(dir, "tsconfig.json"), "{ not json");
  const aliases = await loadTsconfigAliases(dir);
  expect(aliases?.warnings).toEqual([
    `Blast skipped tsconfig tsconfig.json: not valid JSON, so path aliases are off`,
  ]);
  expect(await aliases!.resolve("anything")).toBeUndefined();
});
