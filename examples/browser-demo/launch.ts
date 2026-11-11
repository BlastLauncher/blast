export class BrowserLaunchTimeoutError extends Error {
  readonly code = "BROWSER_LAUNCH_TIMEOUT";

  readonly stage: string;

  constructor(timeoutMs: number, stage: string) {
    super(`Command did not start (${stage}) after ${timeoutMs} ms`);
    this.name = "BrowserLaunchTimeoutError";
    this.stage = stage;
  }
}

export function withLaunchTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage = "waiting for runtime port",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new BrowserLaunchTimeoutError(timeoutMs, stage)),
      timeoutMs,
    );
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

export function createLaunchGeneration() {
  let generation = 0;
  return {
    next: () => ++generation,
    current: () => generation,
    isCurrent: (token: number) => token === generation,
  };
}
