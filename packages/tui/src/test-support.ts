// Deadlines shared by tests that bundle extensions, spawn real Node processes
// and render frames. They only guard against hangs: a busy machine can need
// seconds to launch a process and paint, so these are never behaviour asserts.
import { act } from "react";
import type { Session } from "@blastlauncher/host";
import type { SceneMessage } from "@blastlauncher/protocol";

const WAIT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 50;

function timedOut(what: string, session?: Session): Error {
  const latest = session?.latestScene;
  return new Error(`${what}\n${latest ? JSON.stringify(latest) : ""}`);
}

/** The native buffer lease can still be held by a render tick under load. */
function readFrame(terminal: { captureCharFrame(): string }): string {
  try {
    return terminal.captureCharFrame();
  } catch (error) {
    if (error instanceof Error && error.message.includes("OutputBusy")) return "";
    throw error;
  }
}

/**
 * OpenTUI's default 20 passes expire before a busy machine paints the next
 * frame. Passes stop early once the renderer is idle, so a higher limit only
 * changes how long a genuine hang waits.
 */
export function waitForFrame(
  terminal: {
    waitForFrame(
      predicate: (frame: string) => boolean,
      options?: { maxPasses?: number },
    ): Promise<string>;
  },
  predicate: (frame: string) => boolean,
): Promise<string> {
  return terminal.waitForFrame(predicate, { maxPasses: 500 });
}

/** Resolve when a session scene matches; rejects only when the guard expires. */
export function waitScene(
  session: Session,
  predicate: (scene: SceneMessage) => boolean,
): Promise<void> {
  return waitSceneMatch(session, (scene) => (predicate(scene) ? true : undefined), "scene").then(
    () => undefined,
  );
}

/**
 * Resolves with `pick`'s first defined result for the latest or a later scene,
 * unsubscribing synchronously even when `session.scenes()` replays immediately.
 */
export function waitSceneMatch<T>(
  session: Session,
  pick: (scene: SceneMessage) => T | undefined,
  what: string,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stop: (() => void) | undefined;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop?.();
      complete();
    };
    const timer = setTimeout(() => {
      finish(() => reject(timedOut(`Timed out waiting for ${what}`, session)));
    }, timeoutMs);
    try {
      stop = session.scenes((scene) => {
        const match = pick(scene);
        if (match !== undefined) finish(() => resolve(match));
      });
    } catch (error) {
      finish(() => reject(error));
      return;
    }
    if (settled) stop();
  });
}

// waitForFrame only sees frames rendered after the call; a state change inside
// the preceding act() may already have painted. Poll the current frame instead.
export async function frameEventually(
  terminal: { captureCharFrame(): string },
  predicate: (frame: string) => boolean,
): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const frame = readFrame(terminal);
    if (predicate(frame)) return;
    if (Date.now() > deadline) throw new Error(`frame timeout:\n${frame}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * Manifest reads, fs.watch and bundling run on real timers the test
 * renderer's scheduler does not know about, so polling happens in real time
 * inside act and asserts on captured frames.
 */
export async function settle(
  terminal: { captureCharFrame(): string },
  predicate: (frame: string) => boolean,
): Promise<string> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    let frame = "";
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      frame = readFrame(terminal);
    });
    if (predicate(frame)) return frame;
    if (Date.now() > deadline) throw new Error(`settle timeout\n${frame}`);
  }
}
