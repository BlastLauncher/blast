import { createBroker, type CapabilityHandler } from "./broker.ts";
import { createHeadlessHandlers, type HeadlessCapabilities } from "./headless.ts";
import { createStorageHandlers, type StorageOptions } from "./storage.ts";
import { createOAuthHandlers } from "./oauth.ts";

/** Session-owned handlers always win over client grants and defaults. */
export function createSessionBroker(
  storage: StorageOptions,
  options: {
    defaults?: HeadlessCapabilities;
    grants?: Record<string, CapabilityHandler>;
    handlers?: Record<string, CapabilityHandler>;
  } = {},
) {
  return createBroker({
    ...options.grants,
    ...createHeadlessHandlers(options.defaults),
    ...options.handlers,
    ...createStorageHandlers(storage),
    ...createOAuthHandlers(storage),
  });
}
