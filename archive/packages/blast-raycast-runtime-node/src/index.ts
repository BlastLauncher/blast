import path from "node:path";

import { createElement, type ComponentType } from "react";

import {
  createBundlingEntrypointLoader,
  runNodeExtensionBootstrap,
  type NodeExtensionBootstrapResult,
} from "@blastlauncher/extension-runtime-node";
import { configureRaycastCompat, runCommand } from "@blastlauncher/raycast-compat";

export interface RaycastExtensionBootstrapOptions {
  readonly implementation?: {
    readonly name: string;
    readonly version: string;
  };
  readonly createMessageId?: () => string;
  readonly raycastApiPath?: string;
  readonly reactModulePath?: string;
  readonly vendorRoots?: readonly string[];
  readonly temporaryDirectoryPrefix?: string;
}

const DEFAULT_IMPLEMENTATION = {
  name: "blast-raycast-runtime-node",
  version: "0.0.0",
} as const;

/**
 * Runs the packaged Raycast-compatible child bootstrap over the process stdio
 * protocol. Resource paths may be supplied by the host; packaged resources
 * otherwise sit beside this bootstrap file.
 */
export function runRaycastExtensionBootstrap(
  options: RaycastExtensionBootstrapOptions = {},
): Promise<NodeExtensionBootstrapResult> {
  let messageSequence = 0;
  const vendorRoots = options.vendorRoots ?? readVendorRoots();
  const implementation = options.implementation ?? DEFAULT_IMPLEMENTATION;
  const raycastApiPath = path.resolve(
    options.raycastApiPath ?? process.env.BLAST_V2_RAYCAST_API_PATH ?? path.join(__dirname, "v2-raycast-api.cjs"),
  );
  const reactModulePath = path.resolve(
    options.reactModulePath ?? process.env.BLAST_V2_REACT_MODULE_PATH ?? path.dirname(require.resolve("react")),
  );
  const temporaryDirectoryPrefix = options.temporaryDirectoryPrefix ?? process.env.BLAST_EXTENSION_BUNDLE_PREFIX;

  return runNodeExtensionBootstrap({
    implementation,
    createMessageId: options.createMessageId ?? (() => `raycast-runtime-${++messageSequence}`),
    loadEntrypoint: createBundlingEntrypointLoader({
      alias: { "@raycast/api": raycastApiPath },
      reactModulePath,
      dependencyPolicy: vendorRoots.length === 0 ? { strategy: "local" } : { strategy: "vendored", vendorRoots },
      ...(temporaryDirectoryPrefix === undefined ? {} : { temporaryDirectoryPrefix }),
    }),
    configureApi: (context) => {
      configureRaycastCompat(context);
    },
    renderComponent: (context, Component) => {
      runCommand(context, (launchProps) =>
        createElement(Component as ComponentType<Record<string, unknown>>, launchProps),
      );
    },
  });
}

function readVendorRoots(): readonly string[] {
  const configured = process.env.BLAST_V2_VENDOR_ROOTS;
  if (configured === undefined || configured.length === 0) {
    return [];
  }
  return configured.split(path.delimiter).filter((root) => root.length > 0);
}
