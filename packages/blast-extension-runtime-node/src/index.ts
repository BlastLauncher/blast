import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import type { ExtensionDescriptor } from "@blastlauncher/extension-contract";
import {
  initializeExtensionRuntime,
  type ExtensionRuntimeOptions,
  type InitializedExtensionRuntime,
} from "@blastlauncher/extension-runtime";
import type { PeerImplementation } from "@blastlauncher/protocol";
import type { ProtocolTransport } from "@blastlauncher/transport";
import { createProcessStdioTransport } from "@blastlauncher/transport-node";

export class ExtensionEntrypointError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ExtensionEntrypointError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export type ExtensionEntrypointLoader = (entrypoint: string, signal?: AbortSignal) => Promise<unknown>;

/**
 * Loads an absolute extension entrypoint through the ECMAScript module loader.
 * CommonJS entrypoints appear as the `default` export of the returned
 * namespace. Existence is the catalog's responsibility; load failures are
 * reported here with structured error codes.
 */
export async function loadExtensionEntrypoint(
  entrypoint: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (typeof entrypoint !== "string" || entrypoint.length === 0) {
    throw new ExtensionEntrypointError("entrypoint_invalid", "Extension entrypoint must be a non-empty string", {
      entrypoint,
    });
  }
  if (!isAbsolute(entrypoint)) {
    throw new ExtensionEntrypointError("entrypoint_not_absolute", "Extension entrypoint must be an absolute path", {
      entrypoint,
    });
  }
  signal?.throwIfAborted();

  try {
    return (await import(pathToFileURL(entrypoint).href)) as Record<string, unknown>;
  } catch (error) {
    throw new ExtensionEntrypointError(
      "entrypoint_load_failed",
      `Extension entrypoint could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
      { entrypoint, reason: error instanceof Error ? error.message : String(error) },
    );
  }
}

export interface NodeExtensionBootstrapOptions {
  readonly implementation: PeerImplementation;
  readonly createMessageId: () => string;
  readonly protocolVersions?: readonly number[];
  readonly signal?: AbortSignal;
  /** Defaults to the process stdio transport used by spawned runtimes. */
  readonly transport?: ProtocolTransport;
  /** Defaults to {@link loadExtensionEntrypoint}. */
  readonly loadEntrypoint?: ExtensionEntrypointLoader;
  readonly onLoaded?: (entrypointModule: unknown, descriptor: ExtensionDescriptor) => void | Promise<void>;
}

export interface NodeExtensionBootstrapResult {
  readonly descriptor: ExtensionDescriptor;
  readonly entrypointModule: unknown;
}

/**
 * Runs the fixed Node extension bootstrap: negotiate a versioned session as
 * `extension-runtime`, load the descriptor's entrypoint once the host sends
 * `extension.initialize`, acknowledge readiness, and drain application
 * messages until the session closes or the host shuts down.
 */
export async function runNodeExtensionBootstrap(
  options: NodeExtensionBootstrapOptions,
): Promise<NodeExtensionBootstrapResult> {
  const runtime = await initializeRuntime(resolveTransport(options), options);
  await drain(runtime.session, options.signal);
  return { descriptor: runtime.descriptor, entrypointModule: runtime.entrypointModule };
}

interface BootstrapRuntime extends InitializedExtensionRuntime {
  readonly entrypointModule: unknown;
}

async function initializeRuntime(
  transport: ProtocolTransport,
  options: NodeExtensionBootstrapOptions,
): Promise<BootstrapRuntime> {
  let entrypointModule: unknown;
  const runtimeOptions: ExtensionRuntimeOptions = {
    implementation: options.implementation,
    createMessageId: options.createMessageId,
    initialize: async (descriptor, signal) => {
      const load = options.loadEntrypoint ?? loadExtensionEntrypoint;
      entrypointModule = await load(descriptor.entrypoint, signal);
      await options.onLoaded?.(entrypointModule, descriptor);
    },
    ...(options.protocolVersions === undefined ? {} : { protocolVersions: options.protocolVersions }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };

  const runtime = await initializeExtensionRuntime(transport, runtimeOptions);
  return { ...runtime, entrypointModule };
}

async function drain(session: InitializedExtensionRuntime["session"], signal?: AbortSignal): Promise<void> {
  while (session.state === "ready") {
    const message = await session.receive(signal);
    if (message === undefined || message.type === "shutdown") {
      return;
    }
  }
}

function resolveTransport(options: NodeExtensionBootstrapOptions): ProtocolTransport {
  return options.transport ?? createProcessStdioTransport();
}
