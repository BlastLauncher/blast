import { createConnection, type Socket } from "node:net";
import { isAbsolute } from "node:path";

import { connectCoreClient, type CoreClient, type CoreClientConnectOptions } from "@blastlauncher/core";
import { DEFAULT_MAX_FRAME_BYTES, createJsonLineTransport } from "@blastlauncher/transport-node";

export const DEFAULT_CORE_CONNECT_TIMEOUT_MILLISECONDS = 5_000;

export interface LocalCoreClientOptions extends CoreClientConnectOptions {
  readonly socketPath: string;
  readonly maxFrameBytes?: number;
  readonly connectTimeoutMilliseconds?: number;
}

export class LocalCoreClientError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "LocalCoreClientError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Connects one Node client to a bounded local core listener.
 *
 * This owns only socket setup and protocol negotiation. The returned client
 * owns normal protocol shutdown; the daemon lifecycle and retry policy remain
 * with the caller.
 */
export async function connectLocalCoreClient(options: LocalCoreClientOptions): Promise<CoreClient> {
  validateOptions(options);
  if (options.signal?.aborted) {
    throw createAbortError(options);
  }

  const attempt = createConnectionAttempt(options);
  let socket: Socket;
  try {
    socket = createConnection({ path: options.socketPath });
  } catch (error) {
    attempt.cleanup();
    throw new LocalCoreClientError("socket_connect_failed", "Failed to create the local core socket", {
      socketPath: options.socketPath,
      cause: error,
    });
  }

  try {
    await waitForSocketConnection(socket, options, attempt);
    const transport = createJsonLineTransport({
      readable: socket,
      writable: socket,
      ...(options.maxFrameBytes === undefined ? {} : { maxFrameBytes: options.maxFrameBytes }),
    });
    return await connectCoreClient(transport, {
      implementation: options.implementation,
      createMessageId: options.createMessageId,
      ...(options.protocolVersions === undefined ? {} : { protocolVersions: options.protocolVersions }),
      signal: attempt.signal,
    });
  } catch (error) {
    destroySocket(socket);
    if (attempt.didTimeout()) {
      if (error instanceof LocalCoreClientError && error.code === "socket_connect_timeout") {
        throw error;
      }
      throw createTimeoutError(options, error);
    }
    if (options.signal?.aborted) {
      if (error instanceof LocalCoreClientError && error.code === "socket_connect_aborted") {
        throw error;
      }
      throw createAbortError(options, error);
    }
    throw error;
  } finally {
    attempt.cleanup();
  }
}

function validateOptions(options: LocalCoreClientOptions): void {
  if (typeof options.socketPath !== "string" || options.socketPath.length === 0) {
    throw new LocalCoreClientError("invalid_client_option", "socketPath must not be empty");
  }
  if (process.platform !== "win32" && !isAbsolute(options.socketPath)) {
    throw new LocalCoreClientError("invalid_client_option", "POSIX socketPath must be absolute");
  }
  if (
    process.platform === "win32" &&
    !isAbsolute(options.socketPath) &&
    !options.socketPath.startsWith("\\\\.\\pipe\\")
  ) {
    throw new LocalCoreClientError("invalid_client_option", "Windows socketPath must be absolute or a named pipe");
  }
  validatePositiveInteger(options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES, "maxFrameBytes");
  validatePositiveInteger(
    options.connectTimeoutMilliseconds ?? DEFAULT_CORE_CONNECT_TIMEOUT_MILLISECONDS,
    "connectTimeoutMilliseconds",
  );
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new LocalCoreClientError("invalid_client_option", `${name} must be a positive safe integer`);
  }
}

interface ConnectionAttempt {
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly cleanup: () => void;
}

function createConnectionAttempt(options: LocalCoreClientOptions): ConnectionAttempt {
  const controller = new AbortController();
  const timeoutMilliseconds = options.connectTimeoutMilliseconds ?? DEFAULT_CORE_CONNECT_TIMEOUT_MILLISECONDS;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMilliseconds);
  timeout.unref();

  const onAbort = (): void => {
    controller.abort(options.signal?.reason);
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) {
    onAbort();
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    },
  };
}

function waitForSocketConnection(
  socket: Socket,
  options: LocalCoreClientOptions,
  attempt: ConnectionAttempt,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      socket.off("connect", onConnect);
      socket.off("error", onError);
      socket.off("close", onClose);
      attempt.signal.removeEventListener("abort", onAbort);
    };

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };

    const onConnect = (): void => finish();
    const onError = (error: Error): void => {
      finish(
        new LocalCoreClientError("socket_connect_failed", "Failed to connect to the local core socket", {
          socketPath: options.socketPath,
          cause: error,
        }),
      );
    };
    const onClose = (): void => {
      finish(
        new LocalCoreClientError("socket_closed_before_connect", "The local core socket closed before connecting", {
          socketPath: options.socketPath,
        }),
      );
    };
    const onAbort = (): void => {
      finish(attempt.didTimeout() ? createTimeoutError(options) : createAbortError(options));
    };

    socket.once("connect", onConnect);
    socket.once("error", onError);
    socket.once("close", onClose);
    attempt.signal.addEventListener("abort", onAbort, { once: true });
    if (attempt.signal.aborted) {
      onAbort();
    }
  });
}

function createAbortError(options: LocalCoreClientOptions, cause?: unknown): LocalCoreClientError {
  return new LocalCoreClientError("socket_connect_aborted", "The local core client connection was aborted", {
    socketPath: options.socketPath,
    reason: options.signal?.reason,
    ...(cause === undefined ? {} : { cause }),
  });
}

function createTimeoutError(options: LocalCoreClientOptions, cause?: unknown): LocalCoreClientError {
  return new LocalCoreClientError("socket_connect_timeout", "Timed out connecting to the local core socket", {
    socketPath: options.socketPath,
    timeoutMilliseconds: options.connectTimeoutMilliseconds ?? DEFAULT_CORE_CONNECT_TIMEOUT_MILLISECONDS,
    ...(cause === undefined ? {} : { cause }),
  });
}

function destroySocket(socket: Socket): void {
  if (socket.destroyed) {
    return;
  }
  // A failed connection can emit a final asynchronous error after the
  // waiter's listeners have been removed. The primary failure is already
  // being returned to the caller, so consume only that cleanup error.
  socket.on("error", () => {});
  socket.destroy();
}
