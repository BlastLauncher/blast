import {
  EXTENSION_READY_MESSAGE,
  validateExtensionInitializeMessage,
  type ExtensionDescriptor,
} from "@blastlauncher/extension-contract";
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

export interface SceneChannel {
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
   * Routes one received protocol message. Non-scene messages are ignored;
   * a `scene.event` with an invalid payload fails the session because
   * application messages are untrusted until validated.
   */
  handleMessage(message: unknown): Promise<void>;
}

export function createSceneChannel(session: ProtocolSession): SceneChannel {
  let eventHandler: SceneEventHandler | undefined;

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
    async handleMessage(message: unknown): Promise<void> {
      if (!isRecord(message) || message.type !== SCENE_EVENT_MESSAGE) {
        return;
      }
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
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
