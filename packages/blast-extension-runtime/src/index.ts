import {
  EXTENSION_READY_MESSAGE,
  validateExtensionInitializeMessage,
  type ExtensionDescriptor,
} from "@blastlauncher/extension-contract";
import {
  CAPABILITY_REQUEST_MESSAGE,
  CAPABILITY_RESPONSE_MESSAGE,
  validateCapabilityRequestPayload,
  validateCapabilityResponseMessage,
  type CapabilityArgumentValue,
  type CapabilityRequestPayload,
  type CapabilityResponsePayload,
} from "@blastlauncher/capability";
import type { PeerImplementation } from "@blastlauncher/protocol";
import {
  SCENE_EVENT_MESSAGE,
  SCENE_TRANSACTION_MESSAGE,
  SceneError,
  validateSceneEventMessage,
  validateSceneTransactionPayload,
  type SceneEventPayload,
  type SceneTransaction,
} from "@blastlauncher/scene";
import { connectProtocolSession, ProtocolSession, ProtocolSessionError } from "@blastlauncher/session";
import type { ProtocolTransport } from "@blastlauncher/transport";

export interface ExtensionRuntimeOptions {
  readonly implementation: PeerImplementation;
  readonly createMessageId: () => string;
  readonly protocolVersions?: readonly number[];
  readonly signal?: AbortSignal;
  readonly initialize?: (descriptor: ExtensionDescriptor, signal?: AbortSignal) => void | Promise<void>;
}

export interface InitializedExtensionRuntime {
  readonly descriptor: ExtensionDescriptor;
  readonly session: ProtocolSession;
}

export async function initializeExtensionRuntime(
  transport: ProtocolTransport,
  options: ExtensionRuntimeOptions,
): Promise<InitializedExtensionRuntime> {
  const session = await connectProtocolSession(transport, {
    role: "extension-runtime",
    implementation: options.implementation,
    createMessageId: options.createMessageId,
    ...(options.protocolVersions === undefined ? {} : { protocolVersions: options.protocolVersions }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  try {
    if (session.remotePeer.role !== "extension-host") {
      throw new ProtocolSessionError(
        "unexpected_peer_role",
        `Expected extension-host, received ${session.remotePeer.role}`,
      );
    }

    const message = await session.receive(options.signal);
    if (message === undefined) {
      throw new ProtocolSessionError(
        "host_closed_during_initialization",
        "Host closed before extension initialization",
      );
    }

    const initialization = validateExtensionInitializeMessage(message);
    if (!initialization.ok) {
      throw new ProtocolSessionError(
        "invalid_extension_initialization",
        "Host sent an invalid extension initialization message",
        initialization.issues,
      );
    }

    const descriptor = initialization.value.payload.descriptor;
    await options.initialize?.(descriptor, options.signal);
    await session.send(EXTENSION_READY_MESSAGE, {
      extensionId: descriptor.extensionId,
      commandName: descriptor.commandName,
    });

    return { descriptor, session };
  } catch (error) {
    await closeBestEffort(session, error);
    throw error;
  }
}

async function closeBestEffort(session: ProtocolSession, error: unknown): Promise<void> {
  try {
    await session.close(error instanceof Error ? error.message : "Extension initialization failed");
  } catch {
    // Preserve the initialization failure.
  }
}

export type SceneEventHandler = (payload: SceneEventPayload) => void | Promise<void>;

export interface ExtensionChannelRequest {
  readonly capability: string;
  readonly operation: string;
  readonly arguments?: Readonly<Record<string, CapabilityArgumentValue>>;
}

export interface ExtensionChannelOptions {
  readonly descriptor: ExtensionDescriptor;
  readonly createRequestId?: () => string;
}

export interface ExtensionChannel {
  /**
   * Sends one validated scene transaction to the host over the runtime
   * session. The transaction is validated before it leaves the runtime.
   */
  publish(transaction: SceneTransaction): Promise<void>;
  /**
   * Registers the handler invoked for valid `scene.event` messages. The last
   * registration wins.
   */
  onEvent(handler: SceneEventHandler): void;
  /**
   * Sends one capability request and resolves with the response payload. The
   * channel stamps the descriptor identity and a fresh request identifier;
   * the host verifies the identity against the session descriptor.
   */
  requestCapability(request: ExtensionChannelRequest): Promise<CapabilityResponsePayload>;
  /**
   * Routes one received protocol message. Unrelated message types are
   * ignored; a `scene.event` with an invalid payload fails the session
   * because application messages are untrusted until validated.
   */
  handleMessage(message: unknown): Promise<void>;
  /**
   * Rejects capability requests that are still pending after the session
   * ended, so awaiting commands do not hang.
   */
  close(): void;
}

export function createExtensionChannel(session: ProtocolSession, options: ExtensionChannelOptions): ExtensionChannel {
  let eventHandler: SceneEventHandler | undefined;
  const pendingRequests = new Map<string, Deferred<CapabilityResponsePayload>>();
  let requestIdCounter = 0;
  const nextRequestId = options.createRequestId ?? (() => `capability-${++requestIdCounter}`);

  return {
    async publish(transaction: SceneTransaction): Promise<void> {
      const validation = validateSceneTransactionPayload(transaction);
      if (!validation.ok) {
        throw new SceneError("invalid_transaction", "Refusing to send an invalid scene transaction", validation.issues);
      }
      await session.send(SCENE_TRANSACTION_MESSAGE, transaction);
    },
    onEvent(handler: SceneEventHandler): void {
      eventHandler = handler;
    },
    async requestCapability(request: ExtensionChannelRequest): Promise<CapabilityResponsePayload> {
      const requestId = nextRequestId();
      const payload: CapabilityRequestPayload = {
        requestId,
        extensionId: options.descriptor.extensionId,
        commandName: options.descriptor.commandName,
        capability: request.capability,
        operation: request.operation,
        ...(request.arguments === undefined ? {} : { arguments: request.arguments }),
      };
      const validation = validateCapabilityRequestPayload(payload);
      if (!validation.ok) {
        throw new ProtocolSessionError(
          "invalid_capability_request",
          "Refusing to send an invalid capability request",
          validation.issues,
        );
      }

      const deferred = createDeferred<CapabilityResponsePayload>();
      pendingRequests.set(requestId, deferred);
      try {
        await session.send(CAPABILITY_REQUEST_MESSAGE, payload);
      } catch (error) {
        pendingRequests.delete(requestId);
        deferred.reject(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
      return deferred.promise;
    },
    async handleMessage(message: unknown): Promise<void> {
      if (!isRecord(message)) {
        return;
      }
      if (message.type === SCENE_EVENT_MESSAGE) {
        await handleSceneEvent(message);
        return;
      }
      if (message.type === CAPABILITY_RESPONSE_MESSAGE) {
        handleCapabilityResponse(message);
      }
    },
    close(): void {
      for (const deferred of pendingRequests.values()) {
        deferred.reject(
          new ProtocolSessionError("session_closed", "Session closed before the capability request completed"),
        );
      }
      pendingRequests.clear();
    },
  };

  async function handleSceneEvent(message: Record<string, unknown>): Promise<void> {
    const validation = validateSceneEventMessage(message);
    if (!validation.ok) {
      await closeBestEffort(session, "Invalid scene event received");
      throw new SceneError(
        "invalid_scene_event",
        "Received an invalid scene event and closed the session",
        validation.issues,
      );
    }
    await eventHandler?.(validation.value.payload);
  }

  function handleCapabilityResponse(message: Record<string, unknown>): void {
    const validation = validateCapabilityResponseMessage(message);
    if (!validation.ok) {
      throw new ProtocolSessionError(
        "invalid_capability_response",
        "Received an invalid capability response",
        validation.issues,
      );
    }
    const deferred = pendingRequests.get(validation.value.payload.requestId);
    if (deferred === undefined) {
      return;
    }
    pendingRequests.delete(validation.value.payload.requestId);
    deferred.resolve(validation.value.payload);
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
