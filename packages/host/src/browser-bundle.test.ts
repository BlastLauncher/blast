import { expect, test } from "bun:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  BrowserMissingDependencyError,
  BrowserNativeModuleError,
  bundleForBrowser,
} from "./browser-bundle.ts";

const source = fileURLToPath(new URL("./browser-bundle.ts", import.meta.url));
const helloList = fileURLToPath(
  new URL("../../../fixtures/extensions/hello-list/src/index.tsx", import.meta.url),
);

function maps(command: string, extra: Map<string, string> = new Map()) {
  return {
    files: new Map<string, string>([
      ["/src/index.tsx", command],
      ["/runtime.js", 'import command from "@blastlauncher/command"; export default command;'],
    ]),
    packages: new Map<string, string>([
      [
        "/node_modules/@raycast/api/index.js",
        "export const List = Symbol.for('Blast.List'); export const Action = {}; export const ActionPanel = {};",
      ],
      ["/node_modules/react/index.js", "export const useState = (value) => [value, () => {}];"],
      [
        "/node_modules/react/jsx-runtime.js",
        "export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx;",
      ],
      ["/node_modules/example/index.js", "export const value = 'dependency';"],
      ...extra,
    ]),
  };
}

test("bundles memory files, includes Blast API and leaves node built-ins external", async () => {
  const fixture = await readFile(helloList, "utf8");
  const result = await bundleForBrowser({
    esbuild: { build },
    ...maps(
      `${fixture}\nimport { value } from "example"; export const probe = { value, path: require("node:path") };`,
    ),
    command: "/src/index.tsx",
    runtimeEntry: "/runtime.js",
  });
  const exports: { default?: unknown } = {};
  const module = { exports };
  new Function("exports", "module", "require", result.code)(
    exports,
    module,
    (specifier: string) => {
      if (specifier === "node:path") return { join: () => "joined" };
      throw new Error(`unexpected require ${specifier}`);
    },
  );
  expect(result.bytes).toBeGreaterThan(0);
  expect(result.code).toContain("node:path");
  expect(module.exports).toHaveProperty("default");
  expect(result.code).toContain("dependency");
});

test("reports an unresolved package by its package name", async () => {
  const error = await bundleForBrowser({
    esbuild: { build },
    ...maps('import value from "missing-package/subpath"; export default value;'),
    command: "/src/index.tsx",
    runtimeEntry: "/runtime.js",
  }).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(BrowserMissingDependencyError);
  expect(error).toMatchObject({
    code: "BROWSER_MISSING_DEPENDENCY",
    packages: ["missing-package"],
  });
});

test("rejects native .node imports with a typed error", async () => {
  const error = await bundleForBrowser({
    esbuild: { build },
    ...maps('import native from "./binding.node"; export default native;'),
    command: "/src/index.tsx",
    runtimeEntry: "/runtime.js",
  }).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(BrowserNativeModuleError);
  expect(error).toMatchObject({ code: "BROWSER_NATIVE_MODULE", modules: ["./binding.node"] });
});

test("browser bundle source has no Node filesystem imports", async () => {
  const text = await readFile(source, "utf8");
  expect(text).not.toMatch(/from\s+["']node:(?:fs|path)["']/);
  expect(text).not.toMatch(/import\s*\(\s*["']node:(?:fs|path)["']\s*\)/);
});
