import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createNodeCoreDaemon, type NodeCoreDaemon } from "@blastlauncher/core-node";

import { USER_DIR } from "./constants";
import { nrm } from "./nrm";
import {
  createPackagedV2DaemonConfiguration,
  readV2DaemonConfiguration,
  type V2DaemonConfiguration,
} from "./v2DaemonConfig";

let ownedV2Daemon: NodeCoreDaemon | undefined;

/** Starts the app-owned V2 daemon only when all explicit paths are configured. */
export async function startOptInV2Daemon(): Promise<boolean> {
  const packagedConfiguration =
    process.env.BLAST_V2_MODE === "packaged"
      ? createPackagedV2DaemonConfiguration({ userDirectory: USER_DIR, resourcesPath: process.resourcesPath })
      : undefined;
  const configuration = readV2DaemonConfiguration(process.env, packagedConfiguration);
  if (configuration === undefined) {
    return false;
  }
  if (ownedV2Daemon !== undefined) {
    return true;
  }

  await ensureDaemonDirectories(configuration);
  const daemon = createNodeCoreDaemon({
    catalogRoot: configuration.catalogRoot,
    bootstrapPath: configuration.bootstrapPath,
    socketPath: configuration.socketPath,
    nodeExecutable: configuration.nodeExecutable ?? nrm.nodePath,
    ...(configuration.additionalCatalogRoots === undefined
      ? {}
      : { additionalCatalogRoots: configuration.additionalCatalogRoots }),
    environment: createExtensionEnvironment(configuration),
  });
  await daemon.start();
  ownedV2Daemon = daemon;
  return true;
}

/** Closes the app-owned daemon and releases its socket/child-process owner. */
export async function stopOptInV2Daemon(reason = "Application shutdown"): Promise<void> {
  const daemon = ownedV2Daemon;
  ownedV2Daemon = undefined;
  if (daemon !== undefined) {
    await daemon.close(reason);
  }
}

async function ensureDaemonDirectories(configuration: V2DaemonConfiguration): Promise<void> {
  await Promise.all(
    [
      path.dirname(configuration.socketPath),
      configuration.catalogRoot,
      ...(configuration.additionalCatalogRoots ?? []),
    ].map((directory) => mkdir(directory, { recursive: true })),
  );
}

function createExtensionEnvironment(configuration: V2DaemonConfiguration): NodeJS.ProcessEnv {
  const managedPath = nrm.binPath;
  const inheritedPath = process.env.PATH;
  const resourceNodePath =
    configuration.reactModulePath === undefined ? undefined : path.dirname(configuration.reactModulePath);
  const inheritedNodePath = process.env.NODE_PATH;
  return {
    ...process.env,
    PATH: [managedPath, inheritedPath].filter((value): value is string => value !== undefined).join(path.delimiter),
    ...(configuration.raycastApiPath === undefined ? {} : { BLAST_V2_RAYCAST_API_PATH: configuration.raycastApiPath }),
    ...(configuration.reactModulePath === undefined
      ? {}
      : { BLAST_V2_REACT_MODULE_PATH: configuration.reactModulePath }),
    ...(resourceNodePath === undefined && inheritedNodePath === undefined
      ? {}
      : {
          NODE_PATH: [resourceNodePath, inheritedNodePath]
            .filter((value): value is string => value !== undefined)
            .join(path.delimiter),
        }),
  };
}
