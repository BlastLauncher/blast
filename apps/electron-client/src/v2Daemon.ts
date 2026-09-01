import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createNodeCoreDaemon, ExternalExtensionStore, type NodeCoreDaemon } from "@blastlauncher/core-node";

import { USER_DIR } from "./constants";
import { nrm } from "./nrm";
import {
  createPackagedV2DaemonConfiguration,
  readV2DaemonConfiguration,
  type V2DaemonConfiguration,
} from "./v2DaemonConfig";

let ownedV2Daemon: NodeCoreDaemon | undefined;
let ownedV2DaemonSocketPath: string | undefined;
let ownedV2ExternalExtensionStore: ExternalExtensionStore | undefined;

export interface V2DaemonStartOptions {
  readonly onCatalogChanged?: () => void | Promise<void>;
}

/** Starts the app-owned V2 daemon for packaged default or explicit V2 modes. */
export async function startV2Daemon(options: V2DaemonStartOptions = {}): Promise<boolean> {
  const packagedConfiguration = createDefaultPackagedV2DaemonConfiguration();
  const configuration = readV2DaemonConfiguration(process.env, packagedConfiguration);
  if (configuration === undefined) {
    return false;
  }
  if (ownedV2Daemon !== undefined) {
    return true;
  }

  await ensureDaemonDirectories(configuration);
  const externalExtensionRoot = findExternalExtensionRoot(configuration);
  const externalExtensionStore =
    externalExtensionRoot === undefined
      ? undefined
      : new ExternalExtensionStore({
          root: externalExtensionRoot,
          ...(options.onCatalogChanged === undefined ? {} : { refreshCatalog: options.onCatalogChanged }),
        });
  const daemon = createNodeCoreDaemon({
    catalogRoot: configuration.catalogRoot,
    bootstrapPath: configuration.bootstrapPath,
    socketPath: configuration.socketPath,
    nodeExecutable: configuration.nodeExecutable ?? nrm.nodePath,
    ...(configuration.additionalCatalogRoots === undefined
      ? {}
      : { additionalCatalogRoots: configuration.additionalCatalogRoots }),
    ...(configuration.catalogRootSourceKind === undefined
      ? {}
      : { catalogRootSourceKind: configuration.catalogRootSourceKind }),
    ...(configuration.additionalCatalogRootSourceKinds === undefined
      ? {}
      : { additionalCatalogRootSourceKinds: configuration.additionalCatalogRootSourceKinds }),
    environment: createExtensionEnvironment(configuration),
    ...(options.onCatalogChanged === undefined ? {} : { onCatalogChanged: options.onCatalogChanged }),
  });
  await daemon.start();
  ownedV2Daemon = daemon;
  ownedV2DaemonSocketPath = configuration.socketPath;
  ownedV2ExternalExtensionStore = externalExtensionStore;
  return true;
}

/** Returns the socket owned by the current app process, when V2 is running. */
export function getOwnedV2DaemonSocketPath(): string | undefined {
  return ownedV2DaemonSocketPath;
}

/** Returns the packaged external package store owned by the current app process. */
export function getV2ExternalExtensionStore(): ExternalExtensionStore | undefined {
  return ownedV2ExternalExtensionStore;
}

/** Closes the app-owned daemon and releases its socket/child-process owner. */
export async function stopV2Daemon(reason = "Application shutdown"): Promise<void> {
  const daemon = ownedV2Daemon;
  ownedV2Daemon = undefined;
  ownedV2DaemonSocketPath = undefined;
  ownedV2ExternalExtensionStore = undefined;
  if (daemon !== undefined) {
    await daemon.close(reason);
  }
}

function findExternalExtensionRoot(configuration: V2DaemonConfiguration): string | undefined {
  const roots = configuration.additionalCatalogRoots ?? [];
  const sourceKinds = configuration.additionalCatalogRootSourceKinds ?? [];
  for (const [index, sourceKind] of sourceKinds.entries()) {
    if (sourceKind === "external") {
      return roots[index];
    }
  }
  return undefined;
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

function createDefaultPackagedV2DaemonConfiguration(): V2DaemonConfiguration {
  if (process.env.NODE_ENV !== "development") {
    return createPackagedV2DaemonConfiguration({ userDirectory: USER_DIR, resourcesPath: process.resourcesPath });
  }

  // Forge's development main bundle runs from .webpack/main. Resolve the
  // standalone resources and React package from the workspace there; the
  // packaged app receives the same files under process.resourcesPath.
  const developmentResourcePath = path.resolve(
    __dirname,
    "../../node_modules/@blastlauncher/raycast-runtime-node/dist",
  );
  return {
    ...createPackagedV2DaemonConfiguration({ userDirectory: USER_DIR, resourcesPath: developmentResourcePath }),
    reactModulePath: path.resolve(__dirname, "../../node_modules/react"),
  };
}
