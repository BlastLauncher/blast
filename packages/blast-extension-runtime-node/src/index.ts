import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import type { CapabilityResponsePayload } from "@blastlauncher/capability";
import type { ExtensionDescriptor } from "@blastlauncher/extension-contract";
import {
  createExtensionChannel,
  initializeExtensionRuntime,
  type ExtensionChannel,
  type ExtensionChannelRequest,
  type ExtensionRuntimeOptions,
  type InitializedExtensionRuntime,
  type SceneEventHandler,
} from "@blastlauncher/extension-runtime";
import type { PeerImplementation } from "@blastlauncher/protocol";
import type { SceneTransaction, ToastPayload } from "@blastlauncher/scene";
import { ProtocolSessionError } from "@blastlauncher/session";
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
  /** Defaults to the ECMAScript entrypoint loader. */
  readonly loadEntrypoint?: ExtensionEntrypointLoader;
  readonly onLoaded?: (entrypointModule: unknown, descriptor: ExtensionDescriptor) => void | Promise<void>;
  /**
   * Configures command API surfaces (such as the Raycast compatibility
   * adapter) with the command context before the command export runs.
   */
  readonly configureApi?: (context: ExtensionCommandContext) => void | Promise<void>;
  /**
   * Renders a Raycast-style default-exported command component. When the
   * entrypoint has no `command` export but a function default export and this
   * hook is configured, the bootstrap uses it instead.
   */
  readonly renderComponent?: ExtensionComponentRenderer;
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
  /** Manifest preference defaults resolved by the trusted catalog. */
  readonly preferences: Readonly<Record<string, string | number | boolean>>;
  /** The platform the runtime process runs on. */
  readonly platform: string;
  publish(transaction: SceneTransaction): Promise<void>;
  onEvent(handler: SceneEventHandler): void;
  requestCapability(request: ExtensionChannelRequest): Promise<CapabilityResponsePayload>;
  showToast(payload: ToastPayload): Promise<void>;
}

type ExtensionCommand = (context: ExtensionCommandContext) => unknown;

/**
 * Configures the API surface for a Raycast-style command: the launcher's
 * adapter renders the component and binds it to the command context. The
 * component factory is passed through opaquely so the bootstrap does not
 * depend on React.
 */
type ExtensionComponentRenderer = (context: ExtensionCommandContext, component: () => unknown) => void | Promise<void>;

/**
 * Runs the fixed Node extension bootstrap: negotiate a versioned session as
 * `extension-runtime`, load the descriptor's entrypoint once the host sends
 * `extension.initialize`, acknowledge readiness, run the command export with a
 * scene-capable context, and drain application messages until the session
 * closes or the host shuts down. `scene.event` messages are dispatched to the
 * handler registered by the command; handlers run concurrently with the pump
 * so they can perform capability requests without deadlocking it.
 */
export async function runNodeExtensionBootstrap(
  options: NodeExtensionBootstrapOptions,
): Promise<NodeExtensionBootstrapResult> {
  const runtime = await initializeRuntime(resolveTransport(options), options);
  const channel = runtime.channel;
  const command = findCommandExport(runtime.entrypointModule);
  const componentExport = command === undefined ? findComponentExport(runtime.entrypointModule) : undefined;

  let commandFailed = false;
  let commandError: unknown;
  const renderComponent = options.renderComponent;
  const activate =
    command !== undefined
      ? () => invokeCommand(command, runtime.context)
      : componentExport !== undefined && renderComponent !== undefined
        ? () => invokeComponent(renderComponent, runtime.context, componentExport)
        : undefined;
  const commandPromise =
    activate === undefined
      ? undefined
      : activate().catch(async (error) => {
          if (isSessionClosedError(error)) {
            // The session ended while the command awaited traffic; the
            // bootstrap ends normally with the session.
            return;
          }
          commandFailed = true;
          commandError = error;
          await closeSessionBestEffort(runtime.session, "Extension command failed");
        });

  await drain(runtime.session, channel, options.signal);
  channel.close();
  if (commandPromise !== undefined) {
    await commandPromise;
  }
  await channel.completed();
  if (commandFailed) {
    throw commandError;
  }
  return { descriptor: runtime.descriptor, entrypointModule: runtime.entrypointModule };
}

function isSessionClosedError(error: unknown): boolean {
  return error instanceof ProtocolSessionError && error.code === "session_closed";
}

async function invokeCommand(command: ExtensionCommand, context: ExtensionCommandContext): Promise<void> {
  await command(context);
}

async function invokeComponent(
  renderComponent: ExtensionComponentRenderer,
  context: ExtensionCommandContext,
  component: () => unknown,
): Promise<void> {
  await renderComponent(context, component);
}

function findCommandExport(entrypointModule: unknown): ExtensionCommand | undefined {
  if (typeof entrypointModule !== "object" || entrypointModule === null) {
    return undefined;
  }
  const command = (entrypointModule as Record<string, unknown>)["command"];
  return typeof command === "function" ? (command as ExtensionCommand) : undefined;
}

function findComponentExport(entrypointModule: unknown): (() => unknown) | undefined {
  if (typeof entrypointModule !== "object" || entrypointModule === null) {
    return undefined;
  }
  const defaultExport = (entrypointModule as Record<string, unknown>)["default"];
  return typeof defaultExport === "function" ? (defaultExport as () => unknown) : undefined;
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
  readonly channel: ExtensionChannel;
  readonly context: ExtensionCommandContext;
}

async function initializeRuntime(
  transport: ProtocolTransport,
  options: NodeExtensionBootstrapOptions,
): Promise<BootstrapRuntime> {
  let entrypointModule: unknown;
  let channel: ExtensionChannel | undefined;
  let commandContext: ExtensionCommandContext | undefined;

  const runtimeOptions: ExtensionRuntimeOptions = {
    implementation: options.implementation,
    createMessageId: options.createMessageId,
    initialize: async (descriptor, signal, session) => {
      // The context is built and the API surface configured before the
      // entrypoint loads, so module-scope API calls work.
      const bootstrapChannel = createExtensionChannel(session, { descriptor });
      channel = bootstrapChannel;
      commandContext = {
        descriptor,
        preferences: descriptor.preferences ?? {},
        platform: process.platform,
        publish: (transaction: SceneTransaction) => bootstrapChannel.publish(transaction),
        onEvent: (handler: SceneEventHandler) => bootstrapChannel.onEvent(handler),
        requestCapability: (request: ExtensionChannelRequest) => bootstrapChannel.requestCapability(request),
        showToast: (payload: ToastPayload) => bootstrapChannel.showToast(payload),
      };
      await options.configureApi?.(commandContext);
      const load = options.loadEntrypoint ?? loadExtensionEntrypoint;
      entrypointModule = await load(descriptor.entrypoint, signal);
      await options.onLoaded?.(entrypointModule, descriptor);
    },
    ...(options.protocolVersions === undefined ? {} : { protocolVersions: options.protocolVersions }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };

  const runtime = await initializeExtensionRuntime(transport, runtimeOptions);
  return {
    ...runtime,
    entrypointModule,
    channel: channel as ExtensionChannel,
    context: commandContext as ExtensionCommandContext,
  };
}

async function drain(
  session: InitializedExtensionRuntime["session"],
  channel: ExtensionChannel,
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

export { createBundlingEntrypointLoader, type BundlingEntrypointLoaderOptions } from "./bundler.js";
