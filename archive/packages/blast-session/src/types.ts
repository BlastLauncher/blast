import type { PeerImplementation, PeerRole } from "@blastlauncher/protocol";

export type ProtocolSessionState = "negotiating" | "ready" | "closing" | "closed" | "failed";

export interface ProtocolPeerOptions {
  readonly role: PeerRole;
  readonly implementation: PeerImplementation;
  readonly protocolVersions?: readonly number[];
  readonly createMessageId: () => string;
  readonly signal?: AbortSignal;
}

export interface AcceptProtocolSessionOptions extends ProtocolPeerOptions {
  readonly createSessionId: () => string;
}

export interface RemotePeer {
  readonly role: PeerRole;
  readonly implementation: PeerImplementation;
}
