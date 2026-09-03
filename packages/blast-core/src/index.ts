import type { ExtensionDescriptor, ExtensionEntryPointMode } from "@blastlauncher/extension-contract";
import type { ExtensionHostEvent, ExtensionProcessExit, ExtensionSession } from "@blastlauncher/extension-host";
import {
  acceptProtocolSession,
  connectProtocolSession,
  type ProtocolSession,
  ProtocolSessionError,
} from "@blastlauncher/session";
import {
  validateProtocolEnvelope,
  type PeerImplementation,
  type ProtocolEnvelope,
  type ValidationIssue,
  type ValidationResult,
} from "@blastlauncher/protocol";
import type { ProtocolTransport } from "@blastlauncher/transport";
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
  UI_TOAST_MESSAGE,
  validateSceneEventMessage,
  validateSceneEventPayload,
  validateSceneTransactionMessage,
  validateToastMessage,
  type SceneEventMessage,
  type SceneFormValues,
  type SceneTransactionMessage,
  type SceneTransactionSink,
  type ToastMessage,
  type ToastPayload,
} from "@blastlauncher/scene";

export interface CommandIdentity {
  readonly extensionId: string;
  readonly commandName: string;
}

/** Host-assigned ecosystem classification for a discovered extension. */
export type ExtensionSourceKind = "local" | "raycast-curated" | "external";

export const EXTENSION_SOURCE_KINDS: readonly ExtensionSourceKind[] = ["local", "raycast-curated", "external"];

/** Public command metadata safe to expose to a client chooser. */
export interface CoreCommandDescriptor extends CommandIdentity {
  readonly title?: string;
  readonly extensionName?: string;
  readonly ownerOrAuthorName?: string;
  readonly entryPointMode?: ExtensionEntryPointMode;
  /** Classification assigned by the host catalog root, never by the manifest. */
  readonly sourceKind?: ExtensionSourceKind;
}

export interface ExtensionCatalog {
  resolve(identity: CommandIdentity, signal?: AbortSignal): Promise<ExtensionDescriptor | undefined>;
  /** Returns path-free command metadata when the catalog supports discovery. */
  readonly listCommands?: (signal?: AbortSignal) => Promise<readonly CoreCommandDescriptor[]>;
  /** Invalidates catalog caches before a caller requests fresh discovery. */
  readonly refresh?: (signal?: AbortSignal) => Promise<void>;
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

  async listCommands(signal?: AbortSignal): Promise<readonly CoreCommandDescriptor[]> {
    this.#assertRunning();
    signal?.throwIfAborted();
    return this.#listCommands(signal);
  }

  async refreshCommands(signal?: AbortSignal): Promise<readonly CoreCommandDescriptor[]> {
    this.#assertRunning();
    signal?.throwIfAborted();
    await this.#catalog.refresh?.(signal);
    return this.#listCommands(signal);
  }

  async #listCommands(signal?: AbortSignal): Promise<readonly CoreCommandDescriptor[]> {
    if (this.#catalog.listCommands === undefined) {
      throw new BlastCoreError("command_discovery_unavailable", "The extension catalog does not support discovery");
    }
    const commands = await this.#catalog.listCommands(signal);
    signal?.throwIfAborted();
    return commands.map(normalizeCommandDescriptor);
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

function normalizeCommandDescriptor(value: unknown): CoreCommandDescriptor {
  if (!isRecord(value)) {
    throw new BlastCoreError("invalid_catalog_command", "The extension catalog returned an invalid command summary");
  }
  if (
    typeof value.extensionId !== "string" ||
    value.extensionId.length === 0 ||
    typeof value.commandName !== "string" ||
    value.commandName.length === 0
  ) {
    throw new BlastCoreError("invalid_catalog_command", "The extension catalog returned an invalid command identity");
  }
  for (const field of ["entrypoint", "rootDirectory", "preferences", "preferenceMetadata"]) {
    if (field in value) {
      throw new BlastCoreError("invalid_catalog_command", "The extension catalog returned host-only command data", {
        field,
      });
    }
  }
  const title = normalizeOptionalCommandString(value.title, "title");
  const extensionName = normalizeOptionalCommandString(value.extensionName, "extensionName");
  const ownerOrAuthorName = normalizeOptionalCommandString(value.ownerOrAuthorName, "ownerOrAuthorName");
  const sourceKind = normalizeOptionalSourceKind(value.sourceKind);
  if (
    value.entryPointMode !== undefined &&
    value.entryPointMode !== "no-view" &&
    value.entryPointMode !== "view" &&
    value.entryPointMode !== "menu-bar"
  ) {
    throw new BlastCoreError("invalid_catalog_command", "The extension catalog returned an invalid entrypoint mode");
  }
  return {
    extensionId: value.extensionId,
    commandName: value.commandName,
    ...(title === undefined ? {} : { title }),
    ...(extensionName === undefined ? {} : { extensionName }),
    ...(ownerOrAuthorName === undefined ? {} : { ownerOrAuthorName }),
    ...(value.entryPointMode === undefined ? {} : { entryPointMode: value.entryPointMode }),
    ...(sourceKind === undefined ? {} : { sourceKind }),
  };
}

function normalizeOptionalCommandString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new BlastCoreError("invalid_catalog_command", `The extension catalog returned an invalid ${field}`);
  }
  return value;
}

function normalizeOptionalSourceKind(value: unknown): ExtensionSourceKind | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!EXTENSION_SOURCE_KINDS.includes(value as ExtensionSourceKind)) {
    throw new BlastCoreError("invalid_catalog_command", "The extension catalog returned an invalid source kind");
  }
  return value as ExtensionSourceKind;
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
  /** Receives every validated `ui.toast` payload from the extension. */
  readonly toastSink?: (toast: ToastPayload) => void | Promise<void>;
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
  sendSceneEvent(eventId: string, values?: SceneFormValues): Promise<void>;
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
    if (envelope.type === UI_TOAST_MESSAGE) {
      const validation = validateToastMessage(message);
      if (!validation.ok) {
        throw new SessionRelayError("invalid_toast", "Extension sent an invalid toast payload", validation.issues);
      }
      await options.toastSink?.(validation.value.payload);
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

  async function sendSceneEvent(eventId: string, values?: SceneFormValues): Promise<void> {
    const payload = values === undefined ? { eventId } : { eventId, values };
    const validation = validateSceneEventPayload(payload);
    if (!validation.ok) {
      throw new SessionRelayError("invalid_scene_event", "Refusing to send an invalid scene event", validation.issues);
    }
    await session.protocol.send(SCENE_EVENT_MESSAGE, validation.value);
  }

  async function closeBestEffort(reason: string): Promise<void> {
    try {
      await session.protocol.close(reason);
    } catch {
      // The pump error remains the primary failure.
    }
  }
}

export const CORE_COMMAND_RUN_MESSAGE = "core.command.run" as const;
export const CORE_COMMAND_STOP_MESSAGE = "core.command.stop" as const;
export const CORE_COMMAND_LIST_MESSAGE = "core.command.list" as const;
export const CORE_COMMAND_STARTED_MESSAGE = "core.command.started" as const;
export const CORE_COMMAND_START_FAILED_MESSAGE = "core.command.start-failed" as const;
export const CORE_COMMAND_STOPPED_MESSAGE = "core.command.stopped" as const;
export const CORE_COMMAND_EXITED_MESSAGE = "core.command.exited" as const;
export const CORE_COMMAND_LISTED_MESSAGE = "core.command.listed" as const;
export const CORE_COMMAND_LIST_FAILED_MESSAGE = "core.command.list-failed" as const;

export type CoreCommandRunPayload = CommandIdentity;

export interface CoreCommandStopPayload extends CommandIdentity {
  readonly reason?: string;
}

export type CoreCommandStartedPayload = CommandIdentity;

export interface CoreCommandStartFailedPayload extends CommandIdentity {
  readonly code: string;
  readonly message: string;
}

export interface CoreCommandStoppedPayload extends CommandIdentity {
  readonly reason?: string;
}

export interface CoreCommandExitedPayload extends CommandIdentity {
  readonly code: number | null;
  readonly signal?: string;
}

export type CoreCommandListPayload = Readonly<Record<string, never>>;

export interface CoreCommandListedPayload {
  readonly commands: readonly CoreCommandDescriptor[];
}

export interface CoreCommandListFailedPayload {
  readonly code: string;
  readonly message: string;
}

export type CoreCommandRunMessage = ProtocolEnvelope<typeof CORE_COMMAND_RUN_MESSAGE, CoreCommandRunPayload>;
export type CoreCommandStopMessage = ProtocolEnvelope<typeof CORE_COMMAND_STOP_MESSAGE, CoreCommandStopPayload>;
export type CoreCommandStartedMessage = ProtocolEnvelope<
  typeof CORE_COMMAND_STARTED_MESSAGE,
  CoreCommandStartedPayload
>;
export type CoreCommandStartFailedMessage = ProtocolEnvelope<
  typeof CORE_COMMAND_START_FAILED_MESSAGE,
  CoreCommandStartFailedPayload
>;
export type CoreCommandStoppedMessage = ProtocolEnvelope<
  typeof CORE_COMMAND_STOPPED_MESSAGE,
  CoreCommandStoppedPayload
>;
export type CoreCommandExitedMessage = ProtocolEnvelope<typeof CORE_COMMAND_EXITED_MESSAGE, CoreCommandExitedPayload>;
export type CoreCommandListMessage = ProtocolEnvelope<typeof CORE_COMMAND_LIST_MESSAGE, CoreCommandListPayload>;
export type CoreCommandListedMessage = ProtocolEnvelope<typeof CORE_COMMAND_LISTED_MESSAGE, CoreCommandListedPayload>;
export type CoreCommandListFailedMessage = ProtocolEnvelope<
  typeof CORE_COMMAND_LIST_FAILED_MESSAGE,
  CoreCommandListFailedPayload
>;

export type CoreClientMessage =
  | CoreCommandStartedMessage
  | CoreCommandStartFailedMessage
  | CoreCommandStoppedMessage
  | CoreCommandExitedMessage
  | CoreCommandListedMessage
  | CoreCommandListFailedMessage
  | SceneTransactionMessage
  | ToastMessage;

export type CoreClientRequest =
  | CoreCommandRunMessage
  | CoreCommandStopMessage
  | CoreCommandListMessage
  | SceneEventMessage;

export class CoreClientError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CoreClientError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export interface CoreClientConnectOptions {
  readonly implementation: PeerImplementation;
  readonly createMessageId: () => string;
  readonly protocolVersions?: readonly number[];
  readonly signal?: AbortSignal;
}

export interface AcceptCoreClientSessionOptions extends CoreClientConnectOptions {
  readonly createSessionId: () => string;
  readonly capabilityBroker?: CapabilityBroker;
}

export type CoreClientCore = Pick<BlastCore, "runCommand" | "stopCommand"> & {
  readonly listCommands?: BlastCore["listCommands"];
  readonly refreshCommands?: BlastCore["refreshCommands"];
};

export interface CoreClientSession {
  readonly protocol: ProtocolSession;
  readonly done: Promise<void>;
}

export interface CoreClient {
  readonly protocol: ProtocolSession;
  runCommand(identity: CommandIdentity): Promise<void>;
  stopCommand(identity: CommandIdentity, reason?: string): Promise<void>;
  requestCommandList(): Promise<void>;
  sendSceneEvent(eventId: string, values?: SceneFormValues): Promise<void>;
  receive(signal?: AbortSignal): Promise<CoreClientMessage | undefined>;
  close(reason?: string): Promise<void>;
}

/**
 * Connects a client to a core over any protocol transport. The returned
 * client exposes semantic command, scene, and event operations; it never
 * exposes extension paths or the internal extension session.
 */
export async function connectCoreClient(
  transport: ProtocolTransport,
  options: CoreClientConnectOptions,
): Promise<CoreClient> {
  const protocol = await connectProtocolSession(transport, {
    role: "client",
    implementation: options.implementation,
    createMessageId: options.createMessageId,
    ...(options.protocolVersions === undefined ? {} : { protocolVersions: options.protocolVersions }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (protocol.remotePeer.role !== "core") {
    await closeProtocolBestEffort(protocol, "Unexpected peer role");
    throw new ProtocolSessionError("unexpected_peer_role", `Expected core, received ${protocol.remotePeer.role}`);
  }
  return new ConnectedCoreClient(protocol);
}

/**
 * Accepts one client connection and starts its command/scene/event pump.
 * Ownership of the returned `done` promise remains with the caller, which
 * can later use it to observe a client disconnect or protocol failure.
 */
export async function acceptCoreClientSession(
  core: CoreClientCore,
  transport: ProtocolTransport,
  options: AcceptCoreClientSessionOptions,
): Promise<CoreClientSession> {
  const protocol = await acceptProtocolSession(transport, {
    role: "core",
    implementation: options.implementation,
    createMessageId: options.createMessageId,
    createSessionId: options.createSessionId,
    ...(options.protocolVersions === undefined ? {} : { protocolVersions: options.protocolVersions }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (protocol.remotePeer.role !== "client") {
    await closeProtocolBestEffort(protocol, "Unexpected peer role");
    throw new ProtocolSessionError("unexpected_peer_role", `Expected client, received ${protocol.remotePeer.role}`);
  }
  return new AcceptedCoreClientSession(core, protocol, options.capabilityBroker);
}

export function validateCoreClientMessage(value: unknown): ValidationResult<CoreClientMessage | undefined> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return { ok: false, issues: envelope.issues };
  }

  switch (envelope.value.type) {
    case CORE_COMMAND_STARTED_MESSAGE:
      return validateCoreCommandStartedMessage(value);
    case CORE_COMMAND_START_FAILED_MESSAGE:
      return validateCoreCommandStartFailedMessage(value);
    case CORE_COMMAND_STOPPED_MESSAGE:
      return validateCoreCommandStoppedMessage(value);
    case CORE_COMMAND_EXITED_MESSAGE:
      return validateCoreCommandExitedMessage(value);
    case CORE_COMMAND_LISTED_MESSAGE:
      return validateCoreCommandListedMessage(value);
    case CORE_COMMAND_LIST_FAILED_MESSAGE:
      return validateCoreCommandListFailedMessage(value);
    case SCENE_TRANSACTION_MESSAGE:
      return validateSceneTransactionMessage(value);
    case UI_TOAST_MESSAGE:
      return validateToastMessage(value);
    default:
      return { ok: true, value: undefined };
  }
}

export function validateCoreClientRequestMessage(value: unknown): ValidationResult<CoreClientRequest | undefined> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return { ok: false, issues: envelope.issues };
  }

  switch (envelope.value.type) {
    case CORE_COMMAND_RUN_MESSAGE:
      return validateCoreCommandRunMessage(value);
    case CORE_COMMAND_STOP_MESSAGE:
      return validateCoreCommandStopMessage(value);
    case CORE_COMMAND_LIST_MESSAGE:
      return validateCoreCommandListMessage(value);
    case SCENE_EVENT_MESSAGE:
      return validateSceneEventMessage(value);
    default:
      return { ok: true, value: undefined };
  }
}

function validateCoreCommandRunMessage(value: unknown): ValidationResult<CoreCommandRunMessage> {
  return validateCorePayloadEnvelope(value, CORE_COMMAND_RUN_MESSAGE, validateCommandIdentityPayload);
}

function validateCoreCommandListMessage(value: unknown): ValidationResult<CoreCommandListMessage> {
  return validateCorePayloadEnvelope(value, CORE_COMMAND_LIST_MESSAGE, validateEmptyPayload);
}

function validateCoreCommandStopMessage(value: unknown): ValidationResult<CoreCommandStopMessage> {
  return validateCorePayloadEnvelope(value, CORE_COMMAND_STOP_MESSAGE, (payload, path, issues) => {
    validateCommandIdentityPayload(payload, path, issues);
    if (isRecord(payload) && payload.reason !== undefined && typeof payload.reason !== "string") {
      issues.push({ path: `${path}.reason`, message: "Expected a string" });
    }
  });
}

function validateCoreCommandStartedMessage(value: unknown): ValidationResult<CoreCommandStartedMessage> {
  return validateCorePayloadEnvelope(value, CORE_COMMAND_STARTED_MESSAGE, validateCommandIdentityPayload);
}

function validateCoreCommandStartFailedMessage(value: unknown): ValidationResult<CoreCommandStartFailedMessage> {
  return validateCorePayloadEnvelope(value, CORE_COMMAND_START_FAILED_MESSAGE, (payload, path, issues) => {
    validateCommandIdentityPayload(payload, path, issues);
    if (!isRecord(payload)) {
      return;
    }
    validateNonEmptyString(payload.code, `${path}.code`, issues);
    validateNonEmptyString(payload.message, `${path}.message`, issues);
  });
}

function validateCoreCommandStoppedMessage(value: unknown): ValidationResult<CoreCommandStoppedMessage> {
  return validateCorePayloadEnvelope(value, CORE_COMMAND_STOPPED_MESSAGE, (payload, path, issues) => {
    validateCommandIdentityPayload(payload, path, issues);
    if (isRecord(payload) && payload.reason !== undefined && typeof payload.reason !== "string") {
      issues.push({ path: `${path}.reason`, message: "Expected a string" });
    }
  });
}

function validateCoreCommandExitedMessage(value: unknown): ValidationResult<CoreCommandExitedMessage> {
  return validateCorePayloadEnvelope(value, CORE_COMMAND_EXITED_MESSAGE, (payload, path, issues) => {
    validateCommandIdentityPayload(payload, path, issues);
    if (!isRecord(payload)) {
      return;
    }
    if (!("code" in payload)) {
      issues.push({ path: `${path}.code`, message: "Missing property" });
    } else if (payload.code !== null && !Number.isSafeInteger(payload.code)) {
      issues.push({ path: `${path}.code`, message: "Expected a safe integer or null" });
    }
    if (payload.signal !== undefined) {
      validateNonEmptyString(payload.signal, `${path}.signal`, issues);
    }
  });
}

function validateCoreCommandListedMessage(value: unknown): ValidationResult<CoreCommandListedMessage> {
  return validateCorePayloadEnvelope(value, CORE_COMMAND_LISTED_MESSAGE, (payload, path, issues) => {
    if (!isRecord(payload)) {
      issues.push({ path, message: "Expected an object" });
      return;
    }
    if (!Array.isArray(payload.commands)) {
      issues.push({ path: `${path}.commands`, message: "Expected an array" });
      return;
    }
    payload.commands.forEach((command, index) => {
      validateCoreCommandDescriptorPayload(command, `${path}.commands[${index}]`, issues);
    });
  });
}

function validateCoreCommandListFailedMessage(value: unknown): ValidationResult<CoreCommandListFailedMessage> {
  return validateCorePayloadEnvelope(value, CORE_COMMAND_LIST_FAILED_MESSAGE, (payload, path, issues) => {
    if (!isRecord(payload)) {
      issues.push({ path, message: "Expected an object" });
      return;
    }
    validateNonEmptyString(payload.code, `${path}.code`, issues);
    validateNonEmptyString(payload.message, `${path}.message`, issues);
  });
}

function validateCoreCommandDescriptorPayload(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected an object" });
    return;
  }
  validateCommandIdentityPayload(value, path, issues);
  for (const field of ["title", "extensionName", "ownerOrAuthorName"] as const) {
    if (value[field] !== undefined) {
      validateNonEmptyString(value[field], `${path}.${field}`, issues);
    }
  }
  if (
    value.entryPointMode !== undefined &&
    value.entryPointMode !== "no-view" &&
    value.entryPointMode !== "view" &&
    value.entryPointMode !== "menu-bar"
  ) {
    issues.push({ path: `${path}.entryPointMode`, message: "Expected a valid entrypoint mode" });
  }
  if (value.sourceKind !== undefined && !EXTENSION_SOURCE_KINDS.includes(value.sourceKind as ExtensionSourceKind)) {
    issues.push({ path: `${path}.sourceKind`, message: "Expected a valid extension source kind" });
  }
  for (const field of ["entrypoint", "rootDirectory", "preferences", "preferenceMetadata"]) {
    if (field in value) {
      issues.push({ path: `${path}.${field}`, message: "Host-only field is not allowed in command discovery" });
    }
  }
}

function validateEmptyPayload(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected an object" });
    return;
  }
  for (const field of Object.keys(value)) {
    issues.push({ path: `${path}.${field}`, message: "Unexpected property" });
  }
}

function validateCorePayloadEnvelope<TType extends string, TPayload>(
  value: unknown,
  expectedType: TType,
  validatePayload: (payload: unknown, path: string, issues: ValidationIssue[]) => void,
): ValidationResult<ProtocolEnvelope<TType, TPayload>> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return { ok: false, issues: envelope.issues };
  }
  if (envelope.value.type !== expectedType) {
    return invalid("$.type", `Expected ${JSON.stringify(expectedType)}`);
  }

  const issues: ValidationIssue[] = [];
  validatePayload(envelope.value.payload, "$.payload", issues);
  return issues.length === 0
    ? { ok: true, value: envelope.value as ProtocolEnvelope<TType, TPayload> }
    : { ok: false, issues };
}

function validateCommandIdentityPayload(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected an object" });
    return;
  }
  validateNonEmptyString(value.extensionId, `${path}.extensionId`, issues);
  validateNonEmptyString(value.commandName, `${path}.commandName`, issues);
}

function validateNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ path, message: "Expected a non-empty string" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid<T>(path: string, message: string): ValidationResult<T> {
  return { ok: false, issues: [{ path, message }] };
}

function normalizeIdentity(identity: CommandIdentity): CommandIdentity {
  validateIdentity(identity);
  return { extensionId: identity.extensionId, commandName: identity.commandName };
}

function normalizeStopPayload(payload: CoreCommandStopPayload): CoreCommandStopPayload {
  const identity = normalizeIdentity(payload);
  return payload.reason === undefined ? identity : { ...identity, reason: payload.reason };
}

function commandStartFailure(error: unknown): Pick<CoreCommandStartFailedPayload, "code" | "message"> {
  if (error instanceof BlastCoreError) {
    return { code: error.code, message: error.message };
  }
  // Host-owned failures (such as dependency provisioning) already carry
  // structured codes; preserve them instead of masking with a generic code.
  if (isRecord(error) && typeof error.code === "string" && error.code.length > 0) {
    return {
      code: error.code,
      message:
        typeof error.message === "string" && error.message.length > 0
          ? error.message
          : "Extension command failed to start",
    };
  }
  return { code: "command_start_failed", message: "Extension command failed to start" };
}

function commandListFailure(error: unknown): CoreCommandListFailedPayload {
  if (error instanceof BlastCoreError) {
    return { code: error.code, message: error.message };
  }
  return { code: "command_discovery_failed", message: "Command discovery failed" };
}

function exitedPayload(identity: CommandIdentity, exit: ExtensionProcessExit): CoreCommandExitedPayload {
  return exit.signal === undefined
    ? { ...identity, code: exit.code }
    : { ...identity, code: exit.code, signal: exit.signal };
}

async function closeProtocolBestEffort(protocol: ProtocolSession, reason: string): Promise<void> {
  try {
    await protocol.close(reason);
  } catch {
    // Preserve the role or client-session failure instead of masking it.
  }
}

class ConnectedCoreClient implements CoreClient {
  readonly protocol: ProtocolSession;
  #sendQueue: Promise<void> = Promise.resolve();

  constructor(protocol: ProtocolSession) {
    this.protocol = protocol;
  }

  async runCommand(identity: CommandIdentity): Promise<void> {
    const payload = normalizeIdentity(identity);
    await this.#send(CORE_COMMAND_RUN_MESSAGE, payload);
  }

  async stopCommand(identity: CommandIdentity, reason?: string): Promise<void> {
    const payload = normalizeStopPayload(reason === undefined ? identity : { ...identity, reason });
    await this.#send(CORE_COMMAND_STOP_MESSAGE, payload);
  }

  async requestCommandList(): Promise<void> {
    await this.#send(CORE_COMMAND_LIST_MESSAGE, {});
  }

  async sendSceneEvent(eventId: string, values?: SceneFormValues): Promise<void> {
    const payload = values === undefined ? { eventId } : { eventId, values };
    const validation = validateSceneEventPayload(payload);
    if (!validation.ok) {
      throw new CoreClientError("invalid_scene_event", "Refusing to send an invalid scene event", validation.issues);
    }
    await this.#send(SCENE_EVENT_MESSAGE, validation.value);
  }

  async receive(signal?: AbortSignal): Promise<CoreClientMessage | undefined> {
    while (true) {
      const message = await this.protocol.receive(signal);
      if (message === undefined || message.type === "shutdown") {
        return undefined;
      }

      const validation = validateCoreClientMessage(message);
      if (!validation.ok) {
        await closeProtocolBestEffort(this.protocol, "Invalid core client message");
        throw new CoreClientError(
          "invalid_core_client_message",
          "Core sent an invalid client message",
          validation.issues,
        );
      }
      if (validation.value !== undefined) {
        return validation.value;
      }
    }
  }

  async close(reason?: string): Promise<void> {
    await this.#sendQueue;
    await this.protocol.close(reason);
  }

  #send(type: string, payload: unknown): Promise<void> {
    const operation = this.#sendQueue.then(() => this.protocol.send(type, payload)).then(() => undefined);
    this.#sendQueue = operation.catch(() => undefined);
    return operation;
  }
}

interface ActiveCoreCommand {
  readonly identity: CommandIdentity;
  readonly relay: SessionRelay;
  readonly releaseScene: () => void;
  stopping: boolean;
}

class AcceptedCoreClientSession implements CoreClientSession {
  readonly protocol: ProtocolSession;
  readonly done: Promise<void>;
  readonly #core: CoreClientCore;
  readonly #capabilityBroker: CapabilityBroker | undefined;
  #active: ActiveCoreCommand | undefined;
  #sendQueue: Promise<void> = Promise.resolve();
  #closed = false;

  constructor(core: CoreClientCore, protocol: ProtocolSession, capabilityBroker: CapabilityBroker | undefined) {
    this.#core = core;
    this.protocol = protocol;
    this.#capabilityBroker = capabilityBroker;
    this.done = this.#pump();
  }

  async #pump(): Promise<void> {
    try {
      while (this.protocol.state === "ready") {
        const message = await this.protocol.receive();
        if (message === undefined || message.type === "shutdown") {
          return;
        }

        const validation = validateCoreClientRequestMessage(message);
        if (!validation.ok) {
          throw new CoreClientError(
            "invalid_core_client_message",
            "Client sent an invalid core message",
            validation.issues,
          );
        }
        if (validation.value === undefined) {
          continue;
        }

        switch (validation.value.type) {
          case CORE_COMMAND_RUN_MESSAGE:
            await this.#run(validation.value.payload);
            break;
          case CORE_COMMAND_STOP_MESSAGE:
            await this.#stop(validation.value.payload);
            break;
          case CORE_COMMAND_LIST_MESSAGE:
            await this.#list();
            break;
          case SCENE_EVENT_MESSAGE:
            await this.#sendSceneEvent(validation.value.payload);
            break;
        }
      }
    } catch (error) {
      await closeProtocolBestEffort(
        this.protocol,
        error instanceof Error ? error.message : "Core client session failed",
      );
      throw error;
    } finally {
      this.#closed = true;
      await this.#stopActive("Client disconnected");
    }
  }

  async #list(): Promise<void> {
    try {
      if (this.#core.refreshCommands !== undefined) {
        await this.#send(CORE_COMMAND_LISTED_MESSAGE, { commands: await this.#core.refreshCommands() });
        return;
      }
      if (this.#core.listCommands === undefined) {
        throw new BlastCoreError("command_discovery_unavailable", "The extension catalog does not support discovery");
      }
      await this.#send(CORE_COMMAND_LISTED_MESSAGE, { commands: await this.#core.listCommands() });
    } catch (error) {
      await this.#send(CORE_COMMAND_LIST_FAILED_MESSAGE, commandListFailure(error));
    }
  }

  async #run(payload: CoreCommandRunPayload): Promise<void> {
    const identity = normalizeIdentity(payload);
    if (this.#active !== undefined) {
      await this.#send(CORE_COMMAND_START_FAILED_MESSAGE, {
        ...identity,
        code: "command_already_running",
        message: "A command is already running on this client session",
      });
      return;
    }

    let session: ExtensionSession;
    try {
      session = await this.#core.runCommand(identity);
    } catch (error) {
      await this.#send(CORE_COMMAND_START_FAILED_MESSAGE, { ...identity, ...commandStartFailure(error) });
      return;
    }

    const sceneGate = createPromiseGate();
    const relay = relaySessionTraffic(session, {
      sceneSink: {
        publish: (transaction) => sceneGate.promise.then(() => this.#send(SCENE_TRANSACTION_MESSAGE, transaction)),
      },
      toastSink: (toast) => sceneGate.promise.then(() => this.#send(UI_TOAST_MESSAGE, toast)),
      ...(this.#capabilityBroker === undefined ? {} : { capabilityBroker: this.#capabilityBroker }),
    });
    const active: ActiveCoreCommand = {
      identity,
      relay,
      releaseScene: sceneGate.resolve,
      stopping: false,
    };
    this.#active = active;
    void this.#watchRelay(active);

    try {
      await this.#send(CORE_COMMAND_STARTED_MESSAGE, identity);
    } finally {
      sceneGate.resolve();
    }

    void this.#watchProcess(active, session.process.completion);
  }

  async #stop(payload: CoreCommandStopPayload): Promise<void> {
    const requested = normalizeStopPayload(payload);
    const active = this.#active;
    if (active === undefined) {
      await this.#send(CORE_COMMAND_STOPPED_MESSAGE, requested);
      return;
    }
    if (!sameIdentity(active.identity, requested)) {
      await this.#send(CORE_COMMAND_START_FAILED_MESSAGE, {
        ...requested,
        code: "command_not_active",
        message: "The requested command is not active on this client session",
      });
      return;
    }

    active.stopping = true;
    try {
      await this.#core.stopCommand(active.identity, requested.reason);
    } finally {
      if (this.#active === active) {
        this.#active = undefined;
      }
      active.releaseScene();
    }
    await this.#send(CORE_COMMAND_STOPPED_MESSAGE, requested);
  }

  async #sendSceneEvent(payload: SceneEventMessage["payload"]): Promise<void> {
    const active = this.#active;
    if (active === undefined) {
      throw new CoreClientError("no_active_command", "No command is active on this client session");
    }
    await active.relay.sendSceneEvent(payload.eventId, payload.values);
  }

  async #watchProcess(active: ActiveCoreCommand, completion: Promise<ExtensionProcessExit>): Promise<void> {
    let exit: ExtensionProcessExit;
    try {
      exit = await completion;
    } catch {
      exit = { code: null };
    }
    if (this.#closed || this.#active !== active || active.stopping) {
      return;
    }

    this.#active = undefined;
    active.releaseScene();
    try {
      await this.#send(CORE_COMMAND_EXITED_MESSAGE, exitedPayload(active.identity, exit));
    } catch {
      // The client may have disconnected while the process was exiting.
    }
  }

  async #watchRelay(active: ActiveCoreCommand): Promise<void> {
    try {
      await active.relay.done;
    } catch {
      if (this.#closed || this.#active !== active || active.stopping) {
        return;
      }
      active.stopping = true;
      this.#active = undefined;
      active.releaseScene();
      try {
        await this.#core.stopCommand(active.identity, "Extension traffic relay failed");
      } catch {
        // The relay failure remains the authoritative client-side lifecycle event.
      }
      try {
        await this.#send(CORE_COMMAND_EXITED_MESSAGE, { ...active.identity, code: null });
      } catch {
        // The client may have disconnected while the relay was closing.
      }
    }
  }

  async #stopActive(reason: string): Promise<void> {
    const active = this.#active;
    if (active === undefined) {
      return;
    }
    active.stopping = true;
    this.#active = undefined;
    active.releaseScene();
    try {
      await this.#core.stopCommand(active.identity, reason);
    } catch {
      // Disconnect cleanup is best effort and must not mask the session result.
    }
  }

  #send(type: string, payload: unknown): Promise<void> {
    const operation = this.#sendQueue.then(() => this.protocol.send(type, payload)).then(() => undefined);
    this.#sendQueue = operation.catch(() => undefined);
    return operation;
  }
}

function sameIdentity(left: CommandIdentity, right: CommandIdentity): boolean {
  return left.extensionId === right.extensionId && left.commandName === right.commandName;
}

function createPromiseGate(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let settled = false;
  let resolvePromise: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
  });
  return { promise, resolve: resolvePromise };
}
