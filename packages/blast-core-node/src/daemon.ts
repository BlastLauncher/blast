import { BlastCore } from "@blastlauncher/core";
import { ExtensionHost, type ExtensionHostOptions } from "@blastlauncher/extension-host";
import {
  NodeExtensionProcessLauncher,
  type NodeExtensionProcessLauncherOptions,
} from "@blastlauncher/extension-host-node";

import {
  createLocalCoreServer,
  LocalCoreServer,
  LocalCoreServerError,
  type LocalCoreServerOptions,
} from "./local-server.js";
import { FilesystemExtensionCatalog, type FilesystemExtensionCatalogOptions } from "./index.js";

export type NodeCoreDaemonState = "created" | "starting" | "running" | "closing" | "closed";

export interface NodeCoreDaemonOptions {
  readonly catalogRoot: string;
  /** Optional lower-priority catalog roots, in discovery order. */
  readonly additionalCatalogRoots?: readonly string[];
  readonly manifestFileName?: FilesystemExtensionCatalogOptions["manifestFileName"];
  readonly bootstrapPath: string;
  /** An explicit environment object or descriptor-based factory for children. */
  readonly environment: NodeExtensionProcessLauncherOptions["environment"];
  readonly socketPath: string;
  readonly nodeExecutable?: NodeExtensionProcessLauncherOptions["nodeExecutable"];
  readonly execArguments?: NodeExtensionProcessLauncherOptions["execArguments"];
  readonly gracefulShutdownMilliseconds?: NodeExtensionProcessLauncherOptions["gracefulShutdownMilliseconds"];
  readonly maxFrameBytes?: LocalCoreServerOptions["maxFrameBytes"];
  readonly maxConnections?: LocalCoreServerOptions["maxConnections"];
  readonly handshakeTimeoutMilliseconds?: LocalCoreServerOptions["handshakeTimeoutMilliseconds"];
  readonly backlog?: LocalCoreServerOptions["backlog"];
  readonly protocolVersions?: LocalCoreServerOptions["protocolVersions"];
  readonly capabilityBroker?: LocalCoreServerOptions["capabilityBroker"];
  readonly coreImplementation?: LocalCoreServerOptions["implementation"];
  readonly hostImplementation?: ExtensionHostOptions["implementation"];
  readonly onStderr?: NodeExtensionProcessLauncherOptions["onStderr"];
  readonly onError?: LocalCoreServerOptions["onError"];
}

export class NodeCoreDaemonError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "NodeCoreDaemonError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

const DEFAULT_CORE_IMPLEMENTATION: LocalCoreServerOptions["implementation"] = {
  name: "blast-core-node",
  version: "0.0.0",
};
const DEFAULT_HOST_IMPLEMENTATION: ExtensionHostOptions["implementation"] = {
  name: "blast-extension-host-node",
  version: "0.0.0",
};

export function createNodeCoreDaemon(options: NodeCoreDaemonOptions): NodeCoreDaemon {
  return new NodeCoreDaemon(options);
}

/**
 * Composes the trusted Node catalog, isolated extension host, transport-neutral
 * core, and bounded local client listener. The listener is the daemon's
 * externally visible readiness point.
 */
export class NodeCoreDaemon {
  readonly catalog: FilesystemExtensionCatalog;
  readonly launcher: NodeExtensionProcessLauncher;
  readonly host: ExtensionHost;
  readonly core: BlastCore;
  readonly listener: LocalCoreServer;

  #state: NodeCoreDaemonState = "created";
  #startPromise: Promise<void> | undefined;
  #closePromise: Promise<void> | undefined;

  constructor(options: NodeCoreDaemonOptions) {
    validateOptions(options);

    const catalog = new FilesystemExtensionCatalog({
      root: options.catalogRoot,
      ...(options.additionalCatalogRoots === undefined ? {} : { additionalRoots: options.additionalCatalogRoots }),
      ...(options.manifestFileName === undefined ? {} : { manifestFileName: options.manifestFileName }),
    });
    const launcher = new NodeExtensionProcessLauncher({
      bootstrapPath: options.bootstrapPath,
      environment: options.environment,
      ...(options.nodeExecutable === undefined ? {} : { nodeExecutable: options.nodeExecutable }),
      ...(options.execArguments === undefined ? {} : { execArguments: options.execArguments }),
      ...(options.gracefulShutdownMilliseconds === undefined
        ? {}
        : { gracefulShutdownMilliseconds: options.gracefulShutdownMilliseconds }),
      ...(options.maxFrameBytes === undefined ? {} : { maxFrameBytes: options.maxFrameBytes }),
      ...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
    });
    const host = new ExtensionHost({
      launcher,
      implementation: options.hostImplementation ?? DEFAULT_HOST_IMPLEMENTATION,
      createMessageId: createIdFactory("host"),
      createSessionId: createIdFactory("host-session"),
      ...(options.protocolVersions === undefined ? {} : { protocolVersions: options.protocolVersions }),
    });
    const core = new BlastCore({ catalog, extensionHost: host });
    const listener = createLocalCoreServer({
      core,
      socketPath: options.socketPath,
      implementation: options.coreImplementation ?? DEFAULT_CORE_IMPLEMENTATION,
      createMessageId: createIdFactory("core"),
      createSessionId: createIdFactory("core-session"),
      ...(options.capabilityBroker === undefined ? {} : { capabilityBroker: options.capabilityBroker }),
      ...(options.maxFrameBytes === undefined ? {} : { maxFrameBytes: options.maxFrameBytes }),
      ...(options.maxConnections === undefined ? {} : { maxConnections: options.maxConnections }),
      ...(options.handshakeTimeoutMilliseconds === undefined
        ? {}
        : { handshakeTimeoutMilliseconds: options.handshakeTimeoutMilliseconds }),
      ...(options.backlog === undefined ? {} : { backlog: options.backlog }),
      ...(options.protocolVersions === undefined ? {} : { protocolVersions: options.protocolVersions }),
      ...(options.onError === undefined ? {} : { onError: options.onError }),
    });

    this.catalog = catalog;
    this.launcher = launcher;
    this.host = host;
    this.core = core;
    this.listener = listener;
  }

  get state(): NodeCoreDaemonState {
    return this.#state;
  }

  start(): Promise<void> {
    if (this.#state === "running") {
      return Promise.resolve();
    }
    if (this.#state === "starting" && this.#startPromise !== undefined) {
      return this.#startPromise;
    }
    if (this.#state !== "created") {
      return Promise.reject(
        new NodeCoreDaemonError("invalid_daemon_state", `Cannot start while daemon is ${this.#state}`),
      );
    }

    this.#state = "starting";
    this.#startPromise = this.#start();
    return this.#startPromise;
  }

  close(reason?: string): Promise<void> {
    if (this.#state === "closed") {
      return Promise.resolve();
    }
    if (this.#state === "closing" && this.#closePromise !== undefined) {
      return this.#closePromise;
    }
    if (this.#state === "starting") {
      return Promise.reject(new NodeCoreDaemonError("daemon_starting", "Cannot close while daemon is starting"));
    }

    this.#state = "closing";
    this.#closePromise = this.#close(reason);
    return this.#closePromise;
  }

  async #start(): Promise<void> {
    try {
      await this.listener.listen();
      this.#state = "running";
    } catch (error) {
      this.#state = "created";
      if (error instanceof LocalCoreServerError) {
        throw new NodeCoreDaemonError("daemon_listener_failed", "Failed to start the Node core daemon listener", {
          cause: error,
        });
      }
      throw new NodeCoreDaemonError("daemon_start_failed", "Failed to start the Node core daemon", { cause: error });
    } finally {
      this.#startPromise = undefined;
    }
  }

  async #close(reason?: string): Promise<void> {
    const failures: unknown[] = [];
    try {
      await this.listener.close(reason);
    } catch (error) {
      failures.push(error);
    }
    try {
      await this.core.close(reason);
    } catch (error) {
      failures.push(error);
    } finally {
      this.#state = "closed";
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Failed to close the Node core daemon");
    }
  }
}

function validateOptions(options: NodeCoreDaemonOptions): void {
  if (typeof options.catalogRoot !== "string" || options.catalogRoot.length === 0) {
    throw new NodeCoreDaemonError("invalid_daemon_options", "catalogRoot must not be empty");
  }
  if (
    options.environment === null ||
    (typeof options.environment !== "object" && typeof options.environment !== "function")
  ) {
    throw new NodeCoreDaemonError("invalid_daemon_options", "environment must be an object or factory");
  }
}

function createIdFactory(prefix: string): () => string {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
}
