import type { JsonValue } from "../reconciler/index.ts";

/**
 * Bridge used by privileged APIs to ask the host for a capability, e.g.
 * `("clipboard.copy", { text })`. Installed by the runtime entry, never by
 * extension code.
 */
export type CapabilityRequester = (
  name: string,
  params: Record<string, JsonValue>,
) => Promise<JsonValue>;

let requester: CapabilityRequester | undefined;

/** Installs (or, with `undefined`, removes) the host bridge for privileged APIs. */
export function setCapabilityRequester(next: CapabilityRequester | undefined): void {
  requester = next;
}

export function requestCapability(
  name: string,
  params: Record<string, JsonValue>,
): Promise<JsonValue> {
  if (!requester) {
    return Promise.reject(
      new Error(
        `Cannot request capability '${name}': no capability requester is installed. ` +
          "Call setCapabilityRequester() before using privileged APIs.",
      ),
    );
  }
  return requester(name, params);
}
