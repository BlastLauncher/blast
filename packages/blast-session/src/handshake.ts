import {
  BLAST_PROTOCOL_VERSION,
  createMessage,
  negotiateProtocolVersion,
  validateHandshakeMessage,
  type HelloMessage,
  type ProtocolErrorMessage,
  type ReadyMessage,
} from "@blastlauncher/protocol";
import type { ProtocolTransport } from "@blastlauncher/transport";

import { nextWithSignal } from "./async.js";
import { errorMessage, ProtocolSessionError } from "./errors.js";
import { nextLocalId, nextSessionId, validateLocalOptions } from "./local-options.js";
import { ProtocolSession } from "./session.js";
import type { AcceptProtocolSessionOptions, ProtocolPeerOptions, RemotePeer } from "./types.js";

export async function connectProtocolSession(
  transport: ProtocolTransport,
  options: ProtocolPeerOptions,
): Promise<ProtocolSession> {
  const messages = transport.messages[Symbol.asyncIterator]();

  try {
    const versions = validateLocalOptions(options);
    const hello = createMessage<"hello", HelloMessage["payload"]>(
      nextLocalId(options.createMessageId),
      "hello",
      {
        role: options.role,
        implementation: options.implementation,
        protocolVersions: versions,
      },
      Math.max(...versions),
    );
    await transport.send(hello);
    const response = await readReportedHandshakeMessage(transport, messages, options, options.signal);

    if (response.type === "error") {
      throw remoteError(response);
    }
    if (response.type !== "ready") {
      throw new ProtocolSessionError("unexpected_handshake_message", `Expected ready, received ${response.type}`);
    }

    assertAcceptedVersion(response, versions);
    return createSession(transport, messages, options.createMessageId, response, {
      role: response.payload.role,
      implementation: response.payload.implementation,
    });
  } catch (error) {
    await closeBestEffort(transport, errorMessage(error));
    throw error;
  }
}

export async function acceptProtocolSession(
  transport: ProtocolTransport,
  options: AcceptProtocolSessionOptions,
): Promise<ProtocolSession> {
  const messages = transport.messages[Symbol.asyncIterator]();

  try {
    const versions = validateLocalOptions(options);
    const request = await readReportedHandshakeMessage(transport, messages, options, options.signal);
    if (request.type === "error") {
      throw remoteError(request);
    }
    if (request.type !== "hello") {
      return rejectHandshake(
        transport,
        options,
        "unexpected_handshake_message",
        `Expected hello, received ${request.type}`,
      );
    }

    const protocolVersion = negotiateProtocolVersion(versions, request.payload.protocolVersions);
    if (protocolVersion === undefined) {
      return rejectHandshake(
        transport,
        options,
        "unsupported_protocol_version",
        "No supported protocol version overlaps",
        {
          local: versions,
          remote: request.payload.protocolVersions,
        },
      );
    }

    const sessionId = nextSessionId(options.createSessionId);
    const ready = createMessage<"ready", ReadyMessage["payload"]>(
      nextLocalId(options.createMessageId),
      "ready",
      {
        protocolVersion,
        sessionId,
        role: options.role,
        implementation: options.implementation,
      },
      protocolVersion,
    );
    await transport.send(ready);

    return createSession(transport, messages, options.createMessageId, ready, {
      role: request.payload.role,
      implementation: request.payload.implementation,
    });
  } catch (error) {
    await closeBestEffort(transport, errorMessage(error));
    throw error;
  }
}

function createSession(
  transport: ProtocolTransport,
  messages: AsyncIterator<unknown>,
  createMessageId: () => string,
  ready: ReadyMessage,
  remotePeer: RemotePeer,
): ProtocolSession {
  return new ProtocolSession({
    sessionId: ready.payload.sessionId,
    protocolVersion: ready.payload.protocolVersion,
    remotePeer,
    transport,
    messages,
    createMessageId,
  });
}

function assertAcceptedVersion(response: ReadyMessage, offeredVersions: readonly number[]): void {
  if (
    response.protocolVersion !== response.payload.protocolVersion ||
    !offeredVersions.includes(response.payload.protocolVersion)
  ) {
    throw new ProtocolSessionError("invalid_protocol_selection", "Peer selected an invalid protocol version", {
      offered: offeredVersions,
      envelope: response.protocolVersion,
      selected: response.payload.protocolVersion,
    });
  }
}

async function rejectHandshake(
  transport: ProtocolTransport,
  options: ProtocolPeerOptions,
  code: string,
  message: string,
  details?: unknown,
): Promise<never> {
  try {
    const error = createMessage(
      nextLocalId(options.createMessageId),
      "error",
      details === undefined ? { code, message } : { code, message, details },
      BLAST_PROTOCOL_VERSION,
    );
    await transport.send(error);
  } catch {
    // The negotiated error remains authoritative even when reporting fails.
  }
  throw new ProtocolSessionError(code, message, details);
}

async function readHandshakeMessage(
  messages: AsyncIterator<unknown>,
  signal?: AbortSignal,
): Promise<HelloMessage | ReadyMessage | ProtocolErrorMessage> {
  const result = await nextWithSignal(messages, signal);
  if (result.done) {
    throw new ProtocolSessionError("transport_closed", "Transport closed during protocol negotiation");
  }

  const validation = validateHandshakeMessage(result.value);
  if (!validation.ok) {
    throw new ProtocolSessionError("invalid_handshake", "Received an invalid handshake message", validation.issues);
  }
  return validation.value;
}

async function readReportedHandshakeMessage(
  transport: ProtocolTransport,
  messages: AsyncIterator<unknown>,
  options: ProtocolPeerOptions,
  signal?: AbortSignal,
): Promise<HelloMessage | ReadyMessage | ProtocolErrorMessage> {
  try {
    return await readHandshakeMessage(messages, signal);
  } catch (error) {
    if (error instanceof ProtocolSessionError && error.code === "invalid_handshake") {
      try {
        const protocolError = createMessage(
          nextLocalId(options.createMessageId),
          "error",
          {
            code: error.code,
            message: error.message,
            details: error.details,
          },
          BLAST_PROTOCOL_VERSION,
        );
        await transport.send(protocolError);
      } catch {
        // Reporting is best effort because malformed input may accompany a closed transport.
      }
    }
    throw error;
  }
}

function remoteError(message: ProtocolErrorMessage): ProtocolSessionError {
  return new ProtocolSessionError(message.payload.code, message.payload.message, message.payload.details);
}

async function closeBestEffort(transport: ProtocolTransport, reason: string): Promise<void> {
  try {
    await transport.close(reason);
  } catch {
    // Preserve the negotiation error instead of masking it with cleanup failure.
  }
}
