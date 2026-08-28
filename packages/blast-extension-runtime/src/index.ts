import {
  EXTENSION_READY_MESSAGE,
  validateExtensionInitializeMessage,
  type ExtensionDescriptor,
} from "@blastlauncher/extension-contract";
import type { PeerImplementation } from "@blastlauncher/protocol";
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
