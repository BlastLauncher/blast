import assert from "node:assert/strict";
import test from "node:test";

const { MANAGED_NODE_VERSION } = await import("../dist/nodeRuntimeVersion.js");

test("uses the repository Node.js baseline for the managed runtime", () => {
  assert.equal(MANAGED_NODE_VERSION, "v24.20.0");
});
