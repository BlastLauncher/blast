import type { ExtensionDescriptor } from "@blastlauncher/extension-contract";
import type { ExtensionHostEvent, ExtensionSession } from "@blastlauncher/extension-host";
import {
  CAPABILITY_REQUEST_MESSAGE,
  CAPABILITY_RESPONSE_MESSAGE,
  validateCapabilityRequestMessage,
  validateCapabilityResponsePayload,
  type CapabilityBroker,
  type CapabilityRequest,
  type CapabilityRequestPayload,
  type CapabilityResponsePayload,
} from "@blastlauncher/capability";
import {
  SCENE_EVENT_MESSAGE,
  SCENE_TRANSACTION_MESSAGE,
  validateSceneEventPayload,
  validateSceneTransactionMessage,
  type SceneTransactionSink,
} from "@blastlauncher/scene";

export interface CommandIdentity {
  readonly extensionId: string;
  readonly commandName: string;
}

export interface ExtensionCatalog {
  resolve(identity: CommandIdentity, signal?: AbortSignal): Promise<ExtensionDescriptor | undefined>;
}

export interface ExtensionSupervisor {
  readonly events: AsyncIterable<ExtensionHostEvent>;
  readonly activeSessions: readonly ExtensionSession[];
  start(descriptor: ExtensionDescriptor, signal?: AbortSignal): Promise<ExtensionSession>;
  stop(extensionId: string, commandName: string, reason?: string): Promise<void>;
  close(reason?: string): Promise<void>;
}

export interface BlastCoreOptions {
  readonly catalog: ExtensionCatalog;
  readonly extensionHost: ExtensionSupervisor;
}

export type BlastCoreState = "running" | "closing" | "closed";

export class BlastCoreError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "BlastCoreError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class BlastCore {
  readonly extensionEvents: AsyncIterable<ExtensionHostEvent>;
  readonly #catalog: ExtensionCatalog;
  readonly #extensionHost: ExtensionSupervisor;
  readonly #inFlightStarts = new Set<Promise<ExtensionSession>>();
  #state: BlastCoreState = "running";
  #closePromise?: Promise<void>;

  constructor(options: BlastCoreOptions) {
    this.#catalog = options.catalog;
    this.#extensionHost = options.extensionHost;
    this.extensionEvents = options.extensionHost.events;
  }

  get state(): BlastCoreState {
    return this.#state;
  }

  get activeExtensions(): readonly ExtensionSession[] {
    return this.#extensionHost.activeSessions;
  }

  runCommand(identity: CommandIdentity, signal?: AbortSignal): Promise<ExtensionSession> {
    this.#assertRunning();
    validateIdentity(identity);
    const operation = this.#runCommand(identity, signal);
    this.#inFlightStarts.add(operation);
    void operation.then(
      () => this.#inFlightStarts.delete(operation),
      () => this.#inFlightStarts.delete(operation),
    );
    return operation;
  }

  async stopCommand(identity: CommandIdentity, reason?: string): Promise<void> {
    this.#assertRunning();
    validateIdentity(identity);
    await this.#extensionHost.stop(identity.extensionId, identity.commandName, reason);
  }

  close(reason?: string): Promise<void> {
    this.#closePromise ??= this.#close(reason);
    return this.#closePromise;
  }

  async #runCommand(identity: CommandIdentity, signal?: AbortSignal): Promise<ExtensionSession> {
    const descriptor = await this.#catalog.resolve(identity, signal);
    if (descriptor === undefined) {
      throw new BlastCoreError("command_not_found", "Extension command was not found", identity);
    }
    if (descriptor.extensionId !== identity.extensionId || descriptor.commandName !== identity.commandName) {
      throw new BlastCoreError("catalog_identity_mismatch", "Catalog resolved a different extension command", {
        requested: identity,
        resolved: descriptor,
      });
    }

    this.#assertRunning();
    return this.#extensionHost.start(descriptor, signal);
  }

  async #close(reason?: string): Promise<void> {
    if (this.#state === "closed") {
      return;
    }
    this.#state = "closing";
    try {
      await Promise.allSettled([...this.#inFlightStarts]);
      await this.#extensionHost.close(reason);
    } finally {
      this.#state = "closed";
    }
  }

  #assertRunning(): void {
    if (this.#state !== "running") {
      throw new BlastCoreError("core_not_running", `Blast core is ${this.#state}`);
    }
  }
}

function validateIdentity(identity: CommandIdentity): void {
  if (
    typeof identity.extensionId !== "string" ||
    identity.extensionId.length === 0 ||
    typeof identity.commandName !== "string" ||
    identity.commandName.length === 0
  ) {
    throw new BlastCoreError("invalid_command_identity", "Extension and command identifiers must not be empty");
  }
}

export class SessionRelayError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SessionRelayError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export interface SessionRelayOptions {
  /** Receives every validated `scene.transaction` payload from the extension. */
  readonly sceneSink?: SceneTransactionSink;
  /** Executes brokered capability requests; without a broker, requests are denied. */
  readonly capabilityBroker?: CapabilityBroker;
}

export interface SessionRelay {
  /**
   * Resolves when the relayed session ends cleanly. Rejects and closes the
   * session when the extension sends invalid traffic or the sink fails.
   */
  readonly done: Promise<void>;
  /** Sends one validated `scene.event` payload toward the extension. */
  sendSceneEvent(eventId: string): Promise<void>;
}

/**
 * Relays application traffic between one extension session and the client
 * side (ADR 0010): `scene.transaction` payloads reach the scene sink,
 * `capability.request` payloads are verified against the session descriptor,
 * executed by the capability broker, and answered with `capability.response`.
 * Unknown message types are ignored for forward compatibility. The relay owns
 * the single receive pump of the session.
 */
export function relaySessionTraffic(session: ExtensionSession, options: SessionRelayOptions = {}): SessionRelay {
  const done = pump();
  return { done, sendSceneEvent };

  async function pump(): Promise<void> {
    try {
      while (session.protocol.state === "ready") {
        const message = await session.protocol.receive();
        if (message === undefined || message.type === "shutdown") {
          return;
        }
        await dispatch(message);
      }
    } catch (error) {
      await closeBestEffort("Extension traffic relay failed");
      throw error;
    }
  }

  async function dispatch(message: unknown): Promise<void> {
    if (typeof message !== "object" || message === null) {
      return;
    }
    const envelope = message as Record<string, unknown>;
    if (envelope.type === SCENE_TRANSACTION_MESSAGE) {
      const validation = validateSceneTransactionMessage(message);
      if (!validation.ok) {
        throw new SessionRelayError(
          "invalid_scene_transaction",
          "Extension sent an invalid scene transaction",
          validation.issues,
        );
      }
      await options.sceneSink?.publish(validation.value.payload);
      return;
    }
    if (envelope.type === CAPABILITY_REQUEST_MESSAGE) {
      const validation = validateCapabilityRequestMessage(message);
      if (!validation.ok) {
        throw new SessionRelayError(
          "invalid_capability_request",
          "Extension sent an invalid capability request",
          validation.issues,
        );
      }
      await handleCapabilityRequest(validation.value.payload);
    }
  }

  async function handleCapabilityRequest(payload: CapabilityRequestPayload): Promise<void> {
    if (
      payload.extensionId !== session.descriptor.extensionId ||
      payload.commandName !== session.descriptor.commandName
    ) {
      await respond({
        requestId: payload.requestId,
        outcome: "denied",
        code: "identity_mismatch",
        message: "Capability request identity does not match the extension session",
      });
      return;
    }

    const request: CapabilityRequest = {
      requestId: payload.requestId,
      extensionId: payload.extensionId,
      commandName: payload.commandName,
      capability: payload.capability,
      operation: payload.operation,
      arguments: payload.arguments ?? {},
    };
    const response =
      options.capabilityBroker === undefined
        ? {
            requestId: payload.requestId,
            outcome: "denied" as const,
            code: "capability_denied",
            message: "No capability broker is configured",
          }
        : await options.capabilityBroker.execute(request);
    await respond(response);
  }

  async function respond(response: CapabilityResponsePayload): Promise<void> {
    const validation = validateCapabilityResponsePayload(response);
    if (!validation.ok) {
      throw new SessionRelayError(
        "invalid_capability_response",
        "Refusing to send an invalid capability response",
        validation.issues,
      );
    }
    await session.protocol.send(CAPABILITY_RESPONSE_MESSAGE, response);
  }

  async function sendSceneEvent(eventId: string): Promise<void> {
    const validation = validateSceneEventPayload({ eventId });
    if (!validation.ok) {
      throw new SessionRelayError("invalid_scene_event", "Refusing to send an invalid scene event", validation.issues);
    }
    await session.protocol.send(SCENE_EVENT_MESSAGE, { eventId });
  }

  async function closeBestEffort(reason: string): Promise<void> {
    try {
      await session.protocol.close(reason);
    } catch {
      // The pump error remains the primary failure.
    }
  }
}
