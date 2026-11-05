import { expect, test } from "bun:test";
import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BrowserMissingDependencyError,
  BrowserNativeModuleError,
  browserBuiltinModules,
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

test("resolves package exports, conditions, main, browser, and subpaths", async () => {
  const result = await bundleForBrowser({
    esbuild: { build },
    files: new Map([
      [
        "/src/index.js",
        'import root from "pkg"; import sub from "pkg/sub"; export default [root, sub];',
      ],
      ["/runtime.js", 'import command from "@blastlauncher/command"; export default command;'],
    ]),
    packages: new Map([
      [
        "/node_modules/pkg/package.json",
        JSON.stringify({
          exports: {
            ".": {
              browser: "./browser.js",
              import: "./module.js",
              require: "./main.js",
              default: "./fallback.js",
            },
            "./sub": { import: "./sub-module.js", default: "./sub-main.js" },
          },
          browser: "./browser.js",
          module: "./module.js",
          main: "./main.js",
        }),
      ],
      ["/node_modules/pkg/browser.js", "export default 'browser';"],
      ["/node_modules/pkg/module.js", "export default 'module';"],
      ["/node_modules/pkg/main.js", "export default 'main';"],
      ["/node_modules/pkg/sub-module.js", "export default 'sub-module';"],
    ]),
    command: "/src/index.js",
    runtimeEntry: "/runtime.js",
  });
  expect(result.code).toContain("browser");
  expect(result.code).toContain("sub-module");
});

test("resolves nested package versions from the importing directory", async () => {
  const result = await bundleForBrowser({
    esbuild: { build },
    files: new Map([
      [
        "/src/index.js",
        'import root from "shared"; import nested from "dep"; export default [root, nested];',
      ],
      ["/node_modules/dep/index.js", "import value from 'shared'; export default value;"],
      ["/node_modules/dep/node_modules/shared/index.js", "export default 'nested';"],
      ["/node_modules/dep/node_modules/shared/package.json", JSON.stringify({ main: "index.js" })],
      ["/node_modules/shared/index.js", "export default 'root';"],
      ["/node_modules/shared/package.json", JSON.stringify({ main: "index.js" })],
      ["/runtime.js", 'import command from "@blastlauncher/command"; export default command;'],
    ]),
    packages: new Map(),
    command: "/src/index.js",
    runtimeEntry: "/runtime.js",
  });
  expect(result.code).toContain("nested");
  expect(result.code).toContain("root");
});

test("uses only explicit aliases for supplied runtime modules", async () => {
  const result = await bundleForBrowser({
    esbuild: { build },
    files: new Map([
      ["/src/index.js", 'import value from "react"; export default value;'],
      ["/runtime.js", "export default null;"],
      ["/vendor/react.js", "export default 'aliased';"],
      ["/node_modules/foo/react/index.js", "export default 'wrong';"],
    ]),
    packages: new Map(),
    aliases: { react: "/vendor/react.js" },
    command: "/src/index.js",
    runtimeEntry: "/runtime.js",
  });
  expect(result.code).toContain("aliased");
  expect(result.code).not.toContain("wrong");
});

test("lists exactly Node's built-in modules", () => {
  // The test may use node:module; browser-bundle.ts must remain browser-safe.
  const nodeModules = JSON.parse(
    execFileSync("node", ["-p", "JSON.stringify(require('node:module').builtinModules)"], {
      encoding: "utf8",
    }),
  ) as string[];
  expect([...(browserBuiltinModules as readonly string[])].toSorted()).toEqual(
    [...nodeModules].toSorted(),
  );
});

async function readTree(
  directory: string,
  prefix: string,
  output: Map<string, string>,
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const diskPath = `${directory}/${entry.name}`;
    const mapPath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await readTree(diskPath, mapPath, output);
    else if (entry.name.endsWith(".ts")) output.set(mapPath, await readFile(diskPath, "utf8"));
  }
}

test("bundles the real Blast API through an explicit Raycast alias", async () => {
  const runtimeRoot = fileURLToPath(new URL("../../runtime/src", import.meta.url));
  const apiFiles = new Map<string, string>();
  await readTree(`${runtimeRoot}/api`, "/runtime/src/api", apiFiles);
  await readTree(`${runtimeRoot}/reconciler`, "/runtime/src/reconciler", apiFiles);
  apiFiles.set("/src/index.ts", 'import { List } from "@raycast/api"; export default List;');
  apiFiles.set("/runtime.js", "export default null;");
  apiFiles.set(
    "/vendor/react.js",
    "export const Fragment = Symbol.for('react.fragment'); export const Children = { map: (v, f) => Array.isArray(v) ? v.map(f) : v }; export const createContext = (value) => ({ Provider: (p) => p.children, Consumer: (p) => p.children(value), _currentValue: value }); export const createElement = (type, props, ...children) => ({ type, props, children }); export const cloneElement = (element, props, ...children) => ({ ...element, props: { ...element.props, ...props }, children }); export const isValidElement = (value) => Boolean(value && value.type); export const useContext = () => null; export const useEffect = () => {}; export const useLayoutEffect = () => {}; export const useMemo = (fn) => fn(); export const useRef = (value) => ({ current: value }); export const useState = (value) => [value, () => {}]; export const useSyncExternalStore = () => undefined; export const forwardRef = (fn) => fn; export const useImperativeHandle = () => {}; export const useReducer = (reducer, initial) => [initial, () => {}]; export const useCallback = (fn) => fn; export const useId = () => 'id';",
  );
  const result = await bundleForBrowser({
    esbuild: { build },
    files: apiFiles,
    packages: new Map(),
    aliases: {
      "@raycast/api": "/runtime/src/api/index.ts",
      react: "/vendor/react.js",
      "react/jsx-runtime": "/vendor/react.js",
    },
    command: "/src/index.ts",
    runtimeEntry: "/runtime.js",
  });
  const module = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", "require", result.code)(module, module.exports, () => ({}));
  const List = module.exports.default as { Item?: unknown; Section?: unknown };
  expect(typeof List).toBe("function");
  expect(typeof List.Item).toBe("function");
  expect(typeof List.Section).toBe("function");
});
