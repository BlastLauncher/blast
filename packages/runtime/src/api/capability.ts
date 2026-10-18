import type { JsonValue } from "../reconciler/index.ts";

/**
 * Bridge used by privileged APIs to ask the host for a capability, e.g.
 * `("clipboard.copy", { text })`. Installed by the runtime entry, never by
 * extension code.
 */
export type CapabilityOptions = { signal?: AbortSignal; onProgress?: (value: JsonValue) => void };

export type CapabilityRequester = (
  name: string,
  params: Record<string, JsonValue>,
  options?: CapabilityOptions,
) => Promise<JsonValue>;

let requester: CapabilityRequester | undefined;

/** Installs (or, with `undefined`, removes) the host bridge for privileged APIs. */
export function setCapabilityRequester(next: CapabilityRequester | undefined): void {
  requester = next;
}

export function requestCapability(
  name: string,
  params: Record<string, JsonValue>,
  options?: CapabilityOptions,
): Promise<JsonValue> {
  if (options?.signal?.aborted)
    return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
  if (!requester) {
    return Promise.reject(
      new Error(
        `Cannot request capability '${name}': no capability requester is installed. ` +
          "Call setCapabilityRequester() before using privileged APIs.",
      ),
    );
  }
  const signal = options?.signal;
  if (!signal) return requester(name, params, options);
  const dispatch = requester;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("The operation was aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    try {
      void dispatch(name, params, options)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    } catch (error) {
      signal.removeEventListener("abort", abort);
      reject(error);
    }
  });
}
