import { chmod, lstat, unlink } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createConnection, createServer, type Server, type Socket } from "node:net";

import {
  acceptCoreClientSession,
  type AcceptCoreClientSessionOptions,
  type BlastCore,
  type CoreClientSession,
} from "@blastlauncher/core";
import { DEFAULT_MAX_FRAME_BYTES, createJsonLineTransport } from "@blastlauncher/transport-node";

export const DEFAULT_CORE_MAX_CONNECTIONS = 8;
export const DEFAULT_CORE_HANDSHAKE_TIMEOUT_MILLISECONDS = 5_000;

export type LocalCoreServerState = "created" | "starting" | "listening" | "closing" | "closed";

export interface LocalCoreServerOptions {
  readonly core: Pick<BlastCore, "runCommand" | "stopCommand">;
  readonly socketPath: string;
  readonly implementation: AcceptCoreClientSessionOptions["implementation"];
  readonly createMessageId: () => string;
  readonly createSessionId: () => string;
  readonly capabilityBroker?: AcceptCoreClientSessionOptions["capabilityBroker"];
  readonly maxFrameBytes?: number;
  readonly maxConnections?: number;
  readonly handshakeTimeoutMilliseconds?: number;
  readonly backlog?: number;
  readonly onError?: (error: Error) => void;
}

export class LocalCoreServerError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "LocalCoreServerError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

interface ManagedConnection {
  readonly socket: Socket;
  readonly handshakeController: AbortController;
  task: Promise<void>;
  session?: CoreClientSession;
}

export function createLocalCoreServer(options: LocalCoreServerOptions): LocalCoreServer {
  return new LocalCoreServer(options);
}

/**
 * Owns one explicitly named local IPC endpoint and adapts each connection to
 * the transport-neutral core/client session. This class is intentionally
 * Node-specific; callers that need another transport should reuse
 * `acceptCoreClientSession` directly.
 */
export class LocalCoreServer {
  readonly #options: LocalCoreServerOptions;
  readonly #server: Server;
  readonly #connections = new Set<ManagedConnection>();
  #state: LocalCoreServerState = "created";
  #ownsSocket = false;
  #listenPromise: Promise<void> | undefined;
  #closePromise: Promise<void> | undefined;

  constructor(options: LocalCoreServerOptions) {
    validateOptions(options);
    this.#options = options;
    this.#server = createServer((socket) => this.#accept(socket));
    this.#server.on("error", (error) => this.#reportError(error));
  }

  get state(): LocalCoreServerState {
    return this.#state;
  }

  get socketPath(): string {
    return this.#options.socketPath;
  }

  get connectionCount(): number {
    return this.#connections.size;
  }

  listen(): Promise<void> {
    if (this.#state === "listening") {
      return Promise.resolve();
    }
    if (this.#state === "starting" && this.#listenPromise !== undefined) {
      return this.#listenPromise;
    }
    if (this.#state !== "created") {
      return Promise.reject(
        new LocalCoreServerError("invalid_listener_state", `Cannot listen while listener is ${this.#state}`),
      );
    }

    this.#listenPromise = this.#listen();
    return this.#listenPromise;
  }

  close(reason?: string): Promise<void> {
    if (this.#state === "closed") {
      return Promise.resolve();
    }
    if (this.#state === "closing" && this.#closePromise !== undefined) {
      return this.#closePromise;
    }
    if (this.#state === "starting") {
      return Promise.reject(new LocalCoreServerError("listener_starting", "Cannot close while listener is starting"));
    }

    this.#state = "closing";
    this.#closePromise = this.#close(reason);
    return this.#closePromise;
  }

  async #listen(): Promise<void> {
    this.#state = "starting";
    try {
      await prepareSocketPath(this.#options.socketPath);
      await this.#bind();
      this.#ownsSocket = true;
      if (process.platform !== "win32") {
        await chmod(this.#options.socketPath, 0o600);
      }
      this.#state = "listening";
    } catch (error) {
      await this.#closeServerBestEffort();
      await this.#removeSocketBestEffort();
      this.#state = "created";
      if (error instanceof LocalCoreServerError) {
        throw error;
      }
      throw new LocalCoreServerError("listener_bind_failed", "Failed to bind the local core listener", {
        socketPath: this.#options.socketPath,
        cause: error,
      });
    } finally {
      this.#listenPromise = undefined;
    }
  }

  async #bind(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const cleanup = (): void => {
        this.#server.off("error", onError);
      };

      this.#server.once("error", onError);
      this.#server.listen(
        this.#options.backlog === undefined
          ? { path: this.#options.socketPath }
          : { path: this.#options.socketPath, backlog: this.#options.backlog },
        () => {
          cleanup();
          resolve();
        },
      );
    });
  }

  #accept(socket: Socket): void {
    if (
      this.#state !== "listening" ||
      this.#connections.size >= (this.#options.maxConnections ?? DEFAULT_CORE_MAX_CONNECTIONS)
    ) {
      socket.destroy();
      return;
    }

    const handshakeController = new AbortController();
    const connection: ManagedConnection = {
      socket,
      handshakeController,
      task: Promise.resolve(),
    };
    socket.once("close", () => handshakeController.abort("Socket closed"));
    connection.task = this.#serve(connection);
    this.#connections.add(connection);
    void connection.task.then(
      () => this.#connections.delete(connection),
      () => this.#connections.delete(connection),
    );
  }

  async #serve(connection: ManagedConnection): Promise<void> {
    let handshakeTimer: NodeJS.Timeout | undefined;
    let sessionCompleted = false;
    try {
      const transport = createJsonLineTransport({
        readable: connection.socket,
        writable: connection.socket,
        ...(this.#options.maxFrameBytes === undefined ? {} : { maxFrameBytes: this.#options.maxFrameBytes }),
      });
      handshakeTimer = setTimeout(() => {
        connection.handshakeController.abort(
          new LocalCoreServerError("handshake_timeout", "Core client handshake timed out"),
        );
        connection.socket.destroy();
      }, this.#options.handshakeTimeoutMilliseconds ?? DEFAULT_CORE_HANDSHAKE_TIMEOUT_MILLISECONDS);
      handshakeTimer.unref();

      const session = await acceptCoreClientSession(this.#options.core, transport, {
        implementation: this.#options.implementation,
        createMessageId: this.#options.createMessageId,
        createSessionId: this.#options.createSessionId,
        ...(this.#options.capabilityBroker === undefined ? {} : { capabilityBroker: this.#options.capabilityBroker }),
        signal: connection.handshakeController.signal,
      });
      connection.session = session;
      await session.done;
      sessionCompleted = true;
    } catch (error) {
      this.#reportError(asError(error));
    } finally {
      if (handshakeTimer !== undefined) {
        clearTimeout(handshakeTimer);
      }
      if (!connection.socket.destroyed) {
        if (sessionCompleted) {
          connection.socket.end();
        } else {
          connection.socket.destroy();
        }
      }
    }
  }

  async #close(reason?: string): Promise<void> {
    const failures: unknown[] = [];
    const closingServer = this.#closeServerPromise();
    const connections = [...this.#connections];
    const connectionResults = await Promise.allSettled(
      connections.map(async (connection) => {
        connection.handshakeController.abort(reason ?? "Core listener closed");
        if (connection.session === undefined) {
          if (!connection.socket.destroyed) {
            connection.socket.destroy();
          }
          return;
        }
        try {
          await connection.session.protocol.close(reason);
        } catch (error) {
          if (!connection.socket.destroyed) {
            connection.socket.destroy();
          }
          throw error;
        }
        if (!connection.socket.destroyed && !connection.socket.writableEnded) {
          connection.socket.end();
        }
      }),
    );
    for (const result of connectionResults) {
      if (result.status === "rejected") {
        failures.push(result.reason);
      }
    }
    try {
      await closingServer;
    } catch (error) {
      failures.push(error);
    }
    const tasks = await Promise.allSettled(connections.map((connection) => connection.task));
    for (const result of tasks) {
      if (result.status === "rejected") {
        failures.push(result.reason);
      }
    }
    try {
      await this.#removeSocket();
    } catch (error) {
      failures.push(error);
    } finally {
      this.#state = "closed";
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Failed to close the local core listener");
    }
  }

  async #closeServerPromise(): Promise<void> {
    if (!this.#server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      try {
        this.#server.close((error) => {
          if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
            reject(error);
            return;
          }
          resolve();
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") {
          resolve();
        } else {
          reject(error);
        }
      }
    });
  }

  async #closeServerBestEffort(): Promise<void> {
    if (!this.#server.listening) {
      return;
    }
    try {
      await this.#closeServerPromise();
    } catch {
      // The bind failure remains authoritative.
    }
  }

  async #removeSocketBestEffort(): Promise<void> {
    try {
      await this.#removeSocket();
    } catch {
      // The bind failure remains authoritative.
    }
  }

  async #removeSocket(): Promise<void> {
    if (!this.#ownsSocket || process.platform === "win32") {
      return;
    }
    this.#ownsSocket = false;
    let stats;
    try {
      stats = await lstat(this.#options.socketPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (!stats.isSocket()) {
      throw new LocalCoreServerError("socket_path_replaced", "The local core socket path was replaced before cleanup", {
        socketPath: this.#options.socketPath,
      });
    }
    await unlink(this.#options.socketPath);
  }

  #reportError(error: Error): void {
    this.#options.onError?.(error);
  }
}

function validateOptions(options: LocalCoreServerOptions): void {
  if (typeof options.socketPath !== "string" || options.socketPath.length === 0) {
    throw new LocalCoreServerError("invalid_socket_path", "socketPath must not be empty");
  }
  if (process.platform !== "win32" && !isAbsolute(options.socketPath)) {
    throw new LocalCoreServerError("invalid_socket_path", "POSIX socketPath must be absolute");
  }
  if (
    process.platform === "win32" &&
    !isAbsolute(options.socketPath) &&
    !options.socketPath.startsWith("\\\\.\\pipe\\")
  ) {
    throw new LocalCoreServerError("invalid_socket_path", "Windows socketPath must be absolute or a named pipe");
  }
  validatePositiveInteger(options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES, "maxFrameBytes");
  validatePositiveInteger(options.maxConnections ?? DEFAULT_CORE_MAX_CONNECTIONS, "maxConnections");
  validatePositiveInteger(
    options.handshakeTimeoutMilliseconds ?? DEFAULT_CORE_HANDSHAKE_TIMEOUT_MILLISECONDS,
    "handshakeTimeoutMilliseconds",
  );
  if (options.backlog !== undefined) {
    validatePositiveInteger(options.backlog, "backlog");
  }
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new LocalCoreServerError("invalid_listener_option", `${name} must be a positive safe integer`);
  }
}

async function prepareSocketPath(socketPath: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  let stats;
  try {
    stats = await lstat(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw new LocalCoreServerError("socket_path_unreadable", "Cannot inspect the local core socket path", {
      socketPath,
      cause: error,
    });
  }
  if (!stats.isSocket()) {
    throw new LocalCoreServerError(
      "socket_path_occupied",
      "Refusing to replace a non-socket at the local core socket path",
      { socketPath },
    );
  }

  await assertSocketIsStale(socketPath);
  try {
    await unlink(socketPath);
  } catch (error) {
    throw new LocalCoreServerError("socket_path_unreadable", "Cannot remove the stale local core socket", {
      socketPath,
      cause: error,
    });
  }
}

async function assertSocketIsStale(socketPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ path: socketPath });
    let settled = false;
    const timeout = setTimeout(() => {
      finish(
        new LocalCoreServerError("socket_probe_timeout", "Could not determine whether the local socket is active"),
      );
    }, 250);
    timeout.unref();

    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      socket.off("error", onError);
    };
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      socket.destroy();
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };
    const onConnect = (): void => {
      finish(
        new LocalCoreServerError("socket_path_occupied", "A local core listener is already using the socket path"),
      );
    };
    const onError = (error: NodeJS.ErrnoException): void => {
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
        finish();
        return;
      }
      finish(
        new LocalCoreServerError("socket_probe_failed", "Could not probe the local core socket", { cause: error }),
      );
    };
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
