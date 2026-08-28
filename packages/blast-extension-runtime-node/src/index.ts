import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import type { ExtensionDescriptor } from "@blastlauncher/extension-contract";
import {
  createSceneChannel,
  initializeExtensionRuntime,
  type ExtensionRuntimeOptions,
  type InitializedExtensionRuntime,
  type SceneChannel,
  type SceneEventHandler,
} from "@blastlauncher/extension-runtime";
import type { PeerImplementation } from "@blastlauncher/protocol";
import type { SceneTransaction } from "@blastlauncher/scene";
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
 * The calling contract between the fixed Node bootstrap and an extension
 * command. The bootstrap invokes the entrypoint's `command` (or default)
 * export with this context after `extension.ready`; the context is the
 * seed of the V2-native extension API before the Raycast adapter exists.
 */
export interface ExtensionCommandContext {
  readonly descriptor: ExtensionDescriptor;
  publish(transaction: SceneTransaction): Promise<void>;
  onEvent(handler: SceneEventHandler): void;
}

type ExtensionCommand = (context: ExtensionCommandContext) => unknown;

/**
 * Runs the fixed Node extension bootstrap: negotiate a versioned session as
 * `extension-runtime`, load the descriptor's entrypoint once the host sends
 * `extension.initialize`, acknowledge readiness, run the command export with a
 * scene-capable context, and drain application messages until the session
 * closes or the host shuts down. `scene.event` messages are dispatched to the
 * handler registered by the command.
 */
export async function runNodeExtensionBootstrap(
  options: NodeExtensionBootstrapOptions,
): Promise<NodeExtensionBootstrapResult> {
  const runtime = await initializeRuntime(resolveTransport(options), options);
  const channel = createSceneChannel(runtime.session);
  const command = findCommandExport(runtime.entrypointModule);

  let commandFailed = false;
  let commandError: unknown;
  const commandPromise =
    command === undefined
      ? undefined
      : invokeCommand(command, runtime.descriptor, channel).catch(async (error) => {
          commandFailed = true;
          commandError = error;
          await closeSessionBestEffort(runtime.session, "Extension command failed");
        });

  await drain(runtime.session, channel, options.signal);
  if (commandPromise !== undefined) {
    await commandPromise;
  }
  if (commandFailed) {
    throw commandError;
  }
  return { descriptor: runtime.descriptor, entrypointModule: runtime.entrypointModule };
}

async function invokeCommand(
  command: ExtensionCommand,
  descriptor: ExtensionDescriptor,
  channel: SceneChannel,
): Promise<void> {
  const context: ExtensionCommandContext = {
    descriptor,
    publish: (transaction: SceneTransaction) => channel.publish(transaction),
    onEvent: (handler: SceneEventHandler) => channel.onEvent(handler),
  };
  await command(context);
}

function findCommandExport(entrypointModule: unknown): ExtensionCommand | undefined {
  if (typeof entrypointModule !== "object" || entrypointModule === null) {
    return undefined;
  }
  const moduleRecord = entrypointModule as Record<string, unknown>;
  for (const candidate of [moduleRecord["command"], moduleRecord["default"]]) {
    if (typeof candidate === "function") {
      return candidate as ExtensionCommand;
    }
  }
  return undefined;
}

async function closeSessionBestEffort(session: BootstrapRuntime["session"], reason: string): Promise<void> {
  try {
    await session.close(reason);
  } catch {
    // The command failure remains the primary error.
  }
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

async function drain(
  session: InitializedExtensionRuntime["session"],
  channel: SceneChannel,
  signal?: AbortSignal,
): Promise<void> {
  while (session.state === "ready") {
    const message = await session.receive(signal);
    if (message === undefined || message.type === "shutdown") {
      return;
    }
    await channel.handleMessage(message);
  }
}

function resolveTransport(options: NodeExtensionBootstrapOptions): ProtocolTransport {
  return options.transport ?? createProcessStdioTransport();
}
