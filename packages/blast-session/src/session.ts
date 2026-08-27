import {
  createMessage,
  validateHandshakeMessage,
  validateProtocolEnvelope,
  validateShutdownMessage,
  type ProtocolEnvelope,
  type ProtocolErrorMessage,
} from "@blastlauncher/protocol";
import type { ProtocolTransport } from "@blastlauncher/transport";

import { nextWithSignal } from "./async.js";
import { ProtocolSessionError } from "./errors.js";
import { nextLocalId } from "./local-options.js";
import type { ProtocolSessionState, RemotePeer } from "./types.js";

export class ProtocolSession {
  readonly sessionId: string;
  readonly protocolVersion: number;
  readonly remotePeer: RemotePeer;

  readonly #transport: ProtocolTransport;
  readonly #messages: AsyncIterator<unknown>;
  readonly #createMessageId: () => string;
  #state: ProtocolSessionState = "ready";

  constructor(options: {
    readonly sessionId: string;
    readonly protocolVersion: number;
    readonly remotePeer: RemotePeer;
    readonly transport: ProtocolTransport;
    readonly messages: AsyncIterator<unknown>;
    readonly createMessageId: () => string;
  }) {
    this.sessionId = options.sessionId;
    this.protocolVersion = options.protocolVersion;
    this.remotePeer = options.remotePeer;
    this.#transport = options.transport;
    this.#messages = options.messages;
    this.#createMessageId = options.createMessageId;
  }

  get state(): ProtocolSessionState {
    return this.#state;
  }

  async send<TPayload>(type: string, payload: TPayload): Promise<ProtocolEnvelope<string, TPayload>> {
    this.#assertReady();
    if (typeof type !== "string" || type.length === 0) {
      throw new ProtocolSessionError("invalid_local_configuration", "Message types must not be empty");
    }
    if (CONTROL_MESSAGE_TYPES.has(type)) {
      throw new ProtocolSessionError("reserved_message_type", `Message type is reserved by the session: ${type}`);
    }

    const message = createMessage(nextLocalId(this.#createMessageId), type, payload, this.protocolVersion);
    try {
      await this.#transport.send(message);
    } catch (error) {
      this.#state = "failed";
      await closeBestEffort(this.#transport, "Application message send failed");
      throw new ProtocolSessionError("transport_send_failed", "Failed to send an application message", error);
    }
    return message;
  }

  async receive(signal?: AbortSignal): Promise<ProtocolEnvelope | undefined> {
    this.#assertReady();

    const result = await nextWithSignal(this.#messages, signal);
    if (result.done) {
      this.#state = "closed";
      return undefined;
    }

    const validation = validateProtocolEnvelope(result.value);
    if (!validation.ok) {
      return this.#fail("invalid_message", "Received an invalid protocol message", validation.issues);
    }

    const message = validation.value;
    if (message.protocolVersion !== this.protocolVersion) {
      return this.#fail("protocol_version_mismatch", "Received a message for another protocol version", {
        expected: this.protocolVersion,
        received: message.protocolVersion,
      });
    }

    if (message.type === "shutdown") {
      const shutdown = validateShutdownMessage(message);
      if (!shutdown.ok) {
        return this.#fail("invalid_shutdown", "Received an invalid shutdown message", shutdown.issues);
      }

      this.#state = "closed";
      await this.#transport.close(shutdown.value.payload.reason);
      return shutdown.value;
    }

    if (message.type === "error") {
      const error = validateHandshakeMessage(message);
      if (!error.ok || error.value.type !== "error") {
        return this.#fail("invalid_error", "Received an invalid protocol error", error.ok ? undefined : error.issues);
      }

      this.#state = "failed";
      await closeBestEffort(this.#transport, error.value.payload.message);
      throw remoteError(error.value);
    }

    if (message.type === "hello" || message.type === "ready") {
      return this.#fail("unexpected_handshake_message", `Received ${message.type} after negotiation`);
    }

    return message;
  }

  async close(reason?: string): Promise<void> {
    if (this.#state === "closed" || this.#state === "failed") {
      return;
    }

    this.#assertReady();
    this.#state = "closing";
    try {
      const shutdown = createMessage(
        nextLocalId(this.#createMessageId),
        "shutdown",
        reason === undefined ? {} : { reason },
        this.protocolVersion,
      );
      await this.#transport.send(shutdown);
    } finally {
      try {
        await this.#transport.close(reason);
      } finally {
        this.#state = "closed";
      }
    }
  }

  #assertReady(): void {
    if (this.#state !== "ready") {
      throw new ProtocolSessionError("invalid_session_state", `Session is ${this.#state}, expected ready`);
    }
  }

  async #fail(code: string, message: string, details?: unknown): Promise<never> {
    this.#state = "failed";
    try {
      const error = createMessage(
        nextLocalId(this.#createMessageId),
        "error",
        details === undefined ? { code, message } : { code, message, details },
        this.protocolVersion,
      );
      await this.#transport.send(error);
    } catch {
      // Failure reporting is best effort, including when local ID creation fails.
    } finally {
      await closeBestEffort(this.#transport, message);
    }

    throw new ProtocolSessionError(code, message, details);
  }
}

function remoteError(message: ProtocolErrorMessage): ProtocolSessionError {
  return new ProtocolSessionError(message.payload.code, message.payload.message, message.payload.details);
}

const CONTROL_MESSAGE_TYPES = new Set(["hello", "ready", "error", "shutdown"]);

async function closeBestEffort(transport: ProtocolTransport, reason: string): Promise<void> {
  try {
    await transport.close(reason);
  } catch {
    // Preserve the protocol failure that made the session unusable.
  }
}
