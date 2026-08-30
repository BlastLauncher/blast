import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const fixture = resolve(packageRoot, "test/fixtures/declaration-namespaces.ts");

test("publishes declaration-shaped utility and Form namespaces", () => {
  const result = spawnSync(
    resolve(workspaceRoot, "node_modules/.bin/tsc"),
    [
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--types",
      "node",
      fixture,
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
