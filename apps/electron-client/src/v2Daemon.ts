import path from "node:path";

import { createNodeCoreDaemon, type NodeCoreDaemon } from "@blastlauncher/core-node";

import { nrm } from "./nrm";
import { readV2DaemonConfiguration } from "./v2DaemonConfig";

let ownedV2Daemon: NodeCoreDaemon | undefined;

/** Starts the app-owned V2 daemon only when all explicit paths are configured. */
export async function startOptInV2Daemon(): Promise<boolean> {
  const configuration = readV2DaemonConfiguration(process.env);
  if (configuration === undefined) {
    return false;
  }
  if (ownedV2Daemon !== undefined) {
    return true;
  }

  const daemon = createNodeCoreDaemon({
    catalogRoot: configuration.catalogRoot,
    bootstrapPath: configuration.bootstrapPath,
    socketPath: configuration.socketPath,
    nodeExecutable: configuration.nodeExecutable ?? nrm.nodePath,
    environment: createExtensionEnvironment(),
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

function createExtensionEnvironment(): NodeJS.ProcessEnv {
  const managedPath = nrm.binPath;
  const inheritedPath = process.env.PATH;
  return {
    ...process.env,
    PATH: [managedPath, inheritedPath].filter((value): value is string => value !== undefined).join(path.delimiter),
  };
}
