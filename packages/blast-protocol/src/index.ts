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
}

export interface ProtocolErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
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

export type HandshakeMessage = HelloMessage | ReadyMessage | ProtocolErrorMessage;

export function createMessage<TType extends string, TPayload>(
  id: string,
  type: TType,
  payload: TPayload,
): ProtocolEnvelope<TType, TPayload> {
  return {
    protocolVersion: BLAST_PROTOCOL_VERSION,
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
