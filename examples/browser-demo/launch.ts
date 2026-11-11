export class BrowserLaunchTimeoutError extends Error {
  readonly code = "BROWSER_LAUNCH_TIMEOUT";

  constructor(timeoutMs: number) {
    super(`Command startup timed out after ${timeoutMs} ms`);
    this.name = "BrowserLaunchTimeoutError";
  }
}

export function withLaunchTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new BrowserLaunchTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
