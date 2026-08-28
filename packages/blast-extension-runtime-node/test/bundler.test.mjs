import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBundlingEntrypointLoader } from "../dist/index.js";

const bundlesRoot = path.join(fileURLToPath(new URL("./fixtures", import.meta.url)), "bundles");

function createLoader(alias = { "@raycast/api": path.join(bundlesRoot, "raycast-api-stub.mjs") }) {
  return createBundlingEntrypointLoader({ cacheDirectory: os.tmpdir(), alias });
}

test("bundles a TSX entrypoint with alias resolution", async () => {
  const loader = createLoader();
  const entrypointModule = await loader(path.join(bundlesRoot, "tsx-command.tsx"));

  assert.equal(typeof entrypointModule.command, "function");
  assert.equal(typeof entrypointModule.default, "function");
  assert.equal(entrypointModule.command(), "stub-list:stub-circle");
});

test("reports bundling failures as structured entrypoint errors", async () => {
  const loader = createLoader();
  await assert.rejects(
    () => loader(path.join(bundlesRoot, "broken-syntax.tsx")),
    (error) => error.code === "entrypoint_load_failed",
  );
});
