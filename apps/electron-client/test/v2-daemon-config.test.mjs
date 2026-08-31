import assert from "node:assert/strict";
import test from "node:test";

import { V2DaemonConfigurationError, readV2DaemonConfiguration } from "../dist/v2DaemonConfig.js";

const complete = {
  BLAST_V2_CATALOG_ROOT: "/tmp/blast-v2/extensions",
  BLAST_V2_BOOTSTRAP_PATH: "/tmp/blast-v2/bootstrap.mjs",
  BLAST_V2_SOCKET_PATH: "/tmp/blast-v2/core.sock",
};

test("returns no app-owned configuration when V2 variables are absent", () => {
  assert.equal(readV2DaemonConfiguration({}), undefined);
});

test("preserves external-daemon mode when only the socket is configured", () => {
  assert.equal(readV2DaemonConfiguration({ BLAST_V2_SOCKET_PATH: complete.BLAST_V2_SOCKET_PATH }), undefined);
});

test("reads complete absolute daemon configuration without rewriting paths", () => {
  assert.deepEqual(readV2DaemonConfiguration(complete), {
    catalogRoot: complete.BLAST_V2_CATALOG_ROOT,
    bootstrapPath: complete.BLAST_V2_BOOTSTRAP_PATH,
    socketPath: complete.BLAST_V2_SOCKET_PATH,
  });
});

test("accepts an optional absolute Node executable", () => {
  assert.equal(
    readV2DaemonConfiguration({ ...complete, BLAST_V2_NODE_EXECUTABLE: "/opt/node/bin/node" }).nodeExecutable,
    "/opt/node/bin/node",
  );
});

test("rejects partial daemon configuration", () => {
  assert.throws(
    () => readV2DaemonConfiguration({ BLAST_V2_CATALOG_ROOT: complete.BLAST_V2_CATALOG_ROOT }),
    (error) => error instanceof V2DaemonConfigurationError && error.code === "configuration_incomplete",
  );
});

test("rejects relative daemon paths", () => {
  assert.throws(
    () => readV2DaemonConfiguration({ ...complete, BLAST_V2_BOOTSTRAP_PATH: "bootstrap.mjs" }),
    (error) => error instanceof V2DaemonConfigurationError && error.code === "path_not_absolute",
  );
});

test("rejects a relative Node executable override", () => {
  assert.throws(
    () => readV2DaemonConfiguration({ ...complete, BLAST_V2_NODE_EXECUTABLE: "node" }),
    (error) => error instanceof V2DaemonConfigurationError && error.code === "path_not_absolute",
  );
});
