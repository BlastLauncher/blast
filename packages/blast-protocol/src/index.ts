export const BLAST_PROTOCOL_VERSION = 1 as const;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [BLAST_PROTOCOL_VERSION];

export type ProtocolVersion = typeof BLAST_PROTOCOL_VERSION;

export type PeerRole = "client" | "core" | "extension-host" | "capability-provider";

export interface PeerImplementation {
  readonly name: string;
  readonly version: string;
}

export interface HelloPayload {
  readonly role: PeerRole;
  readonly protocolVersions: readonly number[];
  readonly implementation: PeerImplementation;
}

export interface ReadyPayload {
  readonly protocolVersion: number;
  readonly sessionId: string;
  readonly role: PeerRole;
  readonly implementation: PeerImplementation;
}

export interface ProtocolErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface ShutdownPayload {
  readonly reason?: string;
}

export interface ProtocolEnvelope<TType extends string = string, TPayload = unknown> {
  readonly protocolVersion: number;
  readonly id: string;
  readonly type: TType;
  readonly payload: TPayload;
}

export type HelloMessage = ProtocolEnvelope<"hello", HelloPayload>;
export type ReadyMessage = ProtocolEnvelope<"ready", ReadyPayload>;
export type ProtocolErrorMessage = ProtocolEnvelope<"error", ProtocolErrorPayload>;
export type ShutdownMessage = ProtocolEnvelope<"shutdown", ShutdownPayload>;

export type HandshakeMessage = HelloMessage | ReadyMessage | ProtocolErrorMessage;
export type ProtocolControlMessage = HandshakeMessage | ShutdownMessage;

export function createMessage<TType extends string, TPayload>(
  id: string,
  type: TType,
  payload: TPayload,
  protocolVersion: number = BLAST_PROTOCOL_VERSION,
): ProtocolEnvelope<TType, TPayload> {
  return {
    protocolVersion,
    id,
    type,
    payload,
  };
}

export function negotiateProtocolVersion(
  localVersions: readonly number[],
  remoteVersions: readonly number[],
): number | undefined {
  const remoteVersionSet = new Set(remoteVersions);

  return [...new Set(localVersions)]
    .filter((version) => Number.isSafeInteger(version) && version > 0 && remoteVersionSet.has(version))
    .toSorted((left, right) => right - left)[0];
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function validateProtocolEnvelope(value: unknown): ValidationResult<ProtocolEnvelope> {
  if (!isRecord(value)) {
    return invalid("$", "Expected an object");
  }

  const issues: ValidationIssue[] = [];
  validatePositiveInteger(value.protocolVersion, "$.protocolVersion", issues);
  validateNonEmptyString(value.id, "$.id", issues);
  validateNonEmptyString(value.type, "$.type", issues);

  if (!("payload" in value)) {
    issues.push({ path: "$.payload", message: "Missing property" });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: value as unknown as ProtocolEnvelope };
}

export function validateHandshakeMessage(value: unknown): ValidationResult<HandshakeMessage> {
  const envelopeResult = validateProtocolEnvelope(value);
  if (!envelopeResult.ok) {
    return envelopeResult;
  }

  const envelope = envelopeResult.value;
  switch (envelope.type) {
    case "hello":
      return validateHelloMessage(envelope);
    case "ready":
      return validateReadyMessage(envelope);
    case "error":
      return validateErrorMessage(envelope);
    default:
      return invalid("$.type", `Expected a handshake message, received ${JSON.stringify(envelope.type)}`);
  }
}

export function validateShutdownMessage(value: unknown): ValidationResult<ShutdownMessage> {
  const envelopeResult = validateProtocolEnvelope(value);
  if (!envelopeResult.ok) {
    return envelopeResult;
  }

  const envelope = envelopeResult.value;
  if (envelope.type !== "shutdown") {
    return invalid("$.type", `Expected "shutdown", received ${JSON.stringify(envelope.type)}`);
  }

  if (!isRecord(envelope.payload)) {
    return invalid("$.payload", "Expected an object");
  }

  if (envelope.payload.reason !== undefined && typeof envelope.payload.reason !== "string") {
    return invalid("$.payload.reason", "Expected a string");
  }

  return { ok: true, value: envelope as ShutdownMessage };
}

function validateHelloMessage(envelope: ProtocolEnvelope): ValidationResult<HelloMessage> {
  if (!isRecord(envelope.payload)) {
    return invalid("$.payload", "Expected an object");
  }

  const issues: ValidationIssue[] = [];
  validatePeerIdentity(envelope.payload, "$.payload", issues);

  if (!Array.isArray(envelope.payload.protocolVersions) || envelope.payload.protocolVersions.length === 0) {
    issues.push({ path: "$.payload.protocolVersions", message: "Expected a non-empty array" });
  } else {
    for (const [index, version] of envelope.payload.protocolVersions.entries()) {
      validatePositiveInteger(version, `$.payload.protocolVersions[${index}]`, issues);
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: envelope as unknown as HelloMessage };
}

function validateReadyMessage(envelope: ProtocolEnvelope): ValidationResult<ReadyMessage> {
  if (!isRecord(envelope.payload)) {
    return invalid("$.payload", "Expected an object");
  }

  const issues: ValidationIssue[] = [];
  validatePositiveInteger(envelope.payload.protocolVersion, "$.payload.protocolVersion", issues);
  validateNonEmptyString(envelope.payload.sessionId, "$.payload.sessionId", issues);
  validatePeerIdentity(envelope.payload, "$.payload", issues);

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: envelope as unknown as ReadyMessage };
}

function validatePeerIdentity(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  const roles: readonly PeerRole[] = ["client", "core", "extension-host", "capability-provider"];
  if (!roles.includes(value.role as PeerRole)) {
    issues.push({ path: `${path}.role`, message: "Expected a known peer role" });
  }

  if (!isRecord(value.implementation)) {
    issues.push({ path: `${path}.implementation`, message: "Expected an object" });
    return;
  }

  validateNonEmptyString(value.implementation.name, `${path}.implementation.name`, issues);
  validateNonEmptyString(value.implementation.version, `${path}.implementation.version`, issues);
}

function validateErrorMessage(envelope: ProtocolEnvelope): ValidationResult<ProtocolErrorMessage> {
  if (!isRecord(envelope.payload)) {
    return invalid("$.payload", "Expected an object");
  }

  const issues: ValidationIssue[] = [];
  validateNonEmptyString(envelope.payload.code, "$.payload.code", issues);
  validateNonEmptyString(envelope.payload.message, "$.payload.message", issues);

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: envelope as unknown as ProtocolErrorMessage };
}

function validatePositiveInteger(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    issues.push({ path, message: "Expected a positive safe integer" });
  }
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
