import assert from "node:assert/strict";
import test from "node:test";

import {
  V2DaemonConfigurationError,
  createPackagedV2DaemonConfiguration,
  readV2DaemonConfiguration,
} from "../dist/v2DaemonConfig.js";

const complete = {
  BLAST_V2_CATALOG_ROOT: "/tmp/blast-v2/extensions",
  BLAST_V2_BOOTSTRAP_PATH: "/tmp/blast-v2/bootstrap.mjs",
  BLAST_V2_SOCKET_PATH: "/tmp/blast-v2/core.sock",
};

test("returns no configuration when no packaged roots are supplied", () => {
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

test("accepts optional absolute packaged adapter paths", () => {
  assert.deepEqual(
    readV2DaemonConfiguration({
      ...complete,
      BLAST_V2_RAYCAST_API_PATH: "/opt/blast/v2-raycast-api.cjs",
      BLAST_V2_REACT_MODULE_PATH: "/opt/blast/react",
    }),
    {
      catalogRoot: complete.BLAST_V2_CATALOG_ROOT,
      bootstrapPath: complete.BLAST_V2_BOOTSTRAP_PATH,
      socketPath: complete.BLAST_V2_SOCKET_PATH,
      raycastApiPath: "/opt/blast/v2-raycast-api.cjs",
      reactModulePath: "/opt/blast/react",
    },
  );
});

test("derives packaged paths from the stable user and resource roots", () => {
  const packaged = createPackagedV2DaemonConfiguration({
    userDirectory: "/home/example/.blast",
    resourcesPath: "/opt/blast/resources",
  });
  assert.deepEqual(packaged, {
    catalogRoot: "/home/example/.blast/dev-extensions/node_modules",
    additionalCatalogRoots: ["/home/example/.blast/extensions/node_modules/@blast-extensions"],
    bootstrapPath: "/opt/blast/resources/v2-bootstrap.cjs",
    socketPath: "/home/example/.blast/v2/core.sock",
    raycastApiPath: "/opt/blast/resources/v2-raycast-api.cjs",
    reactModulePath: "/opt/blast/resources/react",
  });
  assert.deepEqual(readV2DaemonConfiguration({ BLAST_V2_MODE: "packaged" }, packaged), packaged);
});

test("uses packaged paths by default when the app supplies its roots", () => {
  const packaged = createPackagedV2DaemonConfiguration({
    userDirectory: "/home/example/.blast",
    resourcesPath: "/opt/blast/resources",
  });
  assert.deepEqual(readV2DaemonConfiguration({}, packaged), packaged);
});

test("selects the explicit legacy mode without V2 configuration", () => {
  assert.equal(readV2DaemonConfiguration({ BLAST_V2_MODE: "legacy" }), undefined);
});

test("rejects V2 variables combined with the legacy mode", () => {
  assert.throws(
    () => readV2DaemonConfiguration({ BLAST_V2_MODE: "legacy", BLAST_V2_SOCKET_PATH: complete.BLAST_V2_SOCKET_PATH }),
    (error) => error instanceof V2DaemonConfigurationError && error.code === "configuration_conflict",
  );
});

test("rejects unknown V2 modes", () => {
  assert.throws(
    () => readV2DaemonConfiguration({ BLAST_V2_MODE: "experimental" }),
    (error) => error instanceof V2DaemonConfigurationError && error.code === "configuration_invalid",
  );
});

test("rejects packaged mode without app-provided resource paths", () => {
  assert.throws(
    () => readV2DaemonConfiguration({ BLAST_V2_MODE: "packaged" }),
    (error) => error instanceof V2DaemonConfigurationError && error.code === "configuration_incomplete",
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
