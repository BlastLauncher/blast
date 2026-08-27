import { SUPPORTED_PROTOCOL_VERSIONS, type PeerRole } from "@blastlauncher/protocol";

import { ProtocolSessionError } from "./errors.js";
import type { ProtocolPeerOptions } from "./types.js";

const PEER_ROLES: readonly PeerRole[] = ["client", "core", "extension-host", "capability-provider"];

export function validateLocalOptions(options: ProtocolPeerOptions): readonly number[] {
  const versions = [...new Set(options.protocolVersions ?? SUPPORTED_PROTOCOL_VERSIONS)].toSorted(
    (left, right) => right - left,
  );
  if (versions.length === 0 || versions.some((version) => !Number.isSafeInteger(version) || version <= 0)) {
    throw new ProtocolSessionError(
      "invalid_local_configuration",
      "Supported protocol versions must be positive integers",
    );
  }
  if (!PEER_ROLES.includes(options.role)) {
    throw new ProtocolSessionError("invalid_local_configuration", "Peer role must be recognized");
  }
  if (
    typeof options.implementation.name !== "string" ||
    options.implementation.name.length === 0 ||
    typeof options.implementation.version !== "string" ||
    options.implementation.version.length === 0
  ) {
    throw new ProtocolSessionError("invalid_local_configuration", "Implementation name and version must not be empty");
  }
  return versions;
}

export function nextLocalId(createMessageId: () => string): string {
  const messageId = createMessageId();
  if (typeof messageId !== "string" || messageId.length === 0) {
    throw new ProtocolSessionError("invalid_local_configuration", "Message IDs must not be empty");
  }
  return messageId;
}

export function nextSessionId(createSessionId: () => string): string {
  const sessionId = createSessionId();
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new ProtocolSessionError("invalid_local_configuration", "Session IDs must not be empty");
  }
  return sessionId;
}
