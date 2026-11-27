import type { SceneMessage } from "@blastlauncher/protocol";
import type { Session } from "./session.ts";

export type WaitOptions = {
  timeoutMs?: number;
  label?: string;
};

/**
 * Resolves with the first value (synchronous replay or later emission) that
 * satisfies `match`, unsubscribing safely even if the callback fires before
 * `subscribe()` returns.
 */
export function waitForSubscription<T>(
  subscribe: (listener: (value: T) => void) => () => void,
  match: (value: T) => boolean,
  options: WaitOptions = {},
): Promise<T> {
  const { timeoutMs = 10_000, label = "matching value" } = options;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let stop: (() => void) | undefined;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop?.();
      settle();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Timed out waiting for ${label}`)));
    }, timeoutMs);
    try {
      stop = subscribe((value) => {
        if (match(value)) finish(() => resolve(value));
      });
    } catch (error) {
      finish(() => reject(error));
      return;
    }
    if (settled) stop();
  });
}

/**
 * Resolves with the first scene (synchronous replay or later emission) that
 * satisfies `match`, rejecting if the session exits first or the guard expires.
 * Unsubscribes safely even when `session.scenes()` replays synchronously.
 */
export function waitForScene(
  session: Session,
  match: (scene: SceneMessage) => boolean = (scene) => scene.root !== null,
  options: WaitOptions = {},
): Promise<SceneMessage> {
  const { timeoutMs = 15_000, label = "scene" } = options;
  return new Promise<SceneMessage>((resolve, reject) => {
    let settled = false;
    let stop: (() => void) | undefined;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop?.();
      settle();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Timed out waiting for ${label}`)));
    }, timeoutMs);
    try {
      stop = session.scenes((scene) => {
        if (match(scene)) finish(() => resolve(scene));
      });
    } catch (error) {
      finish(() => reject(error));
      return;
    }
    if (settled) stop();
    void session.exited.then((exit) => {
      finish(() => reject(exit.error ?? new Error(`Exited before ${label}`)));
    });
  });
}
