import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

// sandbox.ts is browser-typed (tsconfig.browser.json); load it without pulling it into the Node typecheck.
const sandboxModule = "./sandbox.ts";
const { assetUrl } = (await import(sandboxModule)) as {
  assetUrl(options: { assetsUrl?: string }, path: string): string;
};

test("assets default to the package's assets/ directory beside dist/", () => {
  expect(fileURLToPath(assetUrl({}, "esbuild.wasm"))).toBe(
    fileURLToPath(new URL("../assets/esbuild.wasm", import.meta.url)),
  );
});

test("an explicit assetsUrl wins over the packaged default", () => {
  expect(assetUrl({ assetsUrl: "https://cdn.example/blast/" }, "almostnode.mjs")).toBe(
    "https://cdn.example/blast/almostnode.mjs",
  );
});
