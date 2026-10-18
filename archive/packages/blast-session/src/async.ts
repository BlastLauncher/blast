import { ProtocolSessionError } from "./errors.js";

export function nextWithSignal<T>(iterator: AsyncIterator<T>, signal?: AbortSignal): Promise<IteratorResult<T>> {
  if (!signal) {
    return iterator.next();
  }
  if (signal.aborted) {
    return Promise.reject(new ProtocolSessionError("cancelled", "Protocol operation was cancelled", signal.reason));
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(new ProtocolSessionError("cancelled", "Protocol operation was cancelled", signal.reason));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    iterator.next().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
