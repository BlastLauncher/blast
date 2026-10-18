// `closeMainWindow` from the declarations. Closing the window is a client
// action, so the runtime records the request on the root `Navigation` scene
// node (decision 0001, like HUD in decision 0004) and resolves. A no-view
// command mounts its scene on the first request, exactly like feedback.
import { PopToRootType } from "./enums.generated.ts";
import { mountScene } from "./feedback.ts";

export { PopToRootType };

/** `PopToRootType`'s value union: the enum type from the declarations. */
export type PopToRootTypeValue = (typeof PopToRootType)[keyof typeof PopToRootType];

/** The `closeMainWindow` options from the declarations. */
export interface CloseMainWindowOptions {
  /** Asks the client to clear the root search bar and scroll to the top. */
  clearRootSearch?: boolean;
  popToRootType?: PopToRootTypeValue;
}

// Module state, not provider state: a no-view command has no mounted scene yet
// when it closes the window, and its scene reads the request as it mounts.
let request: CloseMainWindowOptions | undefined;
const listeners = new Set<() => void>();

/** Scene subscription; `Navigation` renders `closeMainWindow` from the request. */
export function subscribeCloseRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // The scene is gone with its last subscriber, so a later command is clean.
    if (listeners.size === 0) request = undefined;
  };
}

/** The recorded request, or `undefined` while the window stays open. */
export function closeRequest(): CloseMainWindowOptions | undefined {
  return request;
}

/** Records the request on the scene and resolves once it is published. */
export async function closeMainWindow(options: CloseMainWindowOptions = {}): Promise<void> {
  request = { ...options };
  for (const listener of listeners) listener();
  mountScene();
}
