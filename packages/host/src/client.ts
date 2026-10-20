import { createBroker, type CapabilityHandler } from "./broker.ts";
import { createStorageHandlers, type StorageOptions } from "./storage.ts";
import { createOAuthHandlers } from "./oauth.ts";

/** Session-owned handlers always win over client grants and defaults. */
export function createSessionBroker(
  storage: StorageOptions,
  options: {
    handlers?: Record<string, CapabilityHandler>;
  } = {},
) {
  return createBroker({
    ...options.handlers,
    ...createStorageHandlers(storage),
    ...createOAuthHandlers(storage),
  });
}
