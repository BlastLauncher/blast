import assert from "node:assert/strict";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const distRoot = path.join(packageRoot, "dist");

test("builds standalone V2 bootstrap resources", async () => {
  const bootstrapPath = path.join(distRoot, "v2-bootstrap.cjs");
  const apiPath = path.join(distRoot, "v2-raycast-api.cjs");

  await access(bootstrapPath);
  await access(apiPath);
  assert.ok((await stat(bootstrapPath)).size > 0);
  assert.ok((await stat(apiPath)).size > 0);
});
