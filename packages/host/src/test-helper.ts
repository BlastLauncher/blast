import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SceneMessage } from "@blastlauncher/protocol";
import { writeWorkflow, writeWorkflowArchive } from "../../alfred/src/test-workflow.ts";
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
  const { timeoutMs = 5_000, label = "scene" } = options;
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

/**
 * A two-command Alfred workflow under `<root>/workflow`, also packed as
 * `<root>/Greeter.alfredworkflow`: the `greet` Script Filter echoes its search
 * and the required `token` preference and copies the search on Enter; the
 * `site` Keyword (required query) opens `https://example.com/<query>`.
 */
export async function writeAlfredFixture(root: string): Promise<{ dir: string; archive: string }> {
  const dir = await writeWorkflow(
    join(root, "workflow"),
    [
      [
        "sf",
        "input.scriptfilter",
        {
          keyword: "greet",
          title: "Greet",
          subtext: "Say hello",
          // Required: no run until a search, so every client sees one scene
          // first and then exactly a loading and a result scene per search.
          argumenttype: 0,
          queuedelaymode: 1,
          type: 0,
          scriptargtype: 1,
          script: `printf '{"items":[{"title":"Hello %s","subtitle":"token %s","arg":"%s"}]}' "$1" "$token" "$1"`,
        },
      ],
      ["clip", "output.clipboard", { clipboardtext: "{query}" }],
      ["kw", "input.keyword", { keyword: "site", title: "Open Site", argumenttype: 0 }],
      ["url", "action.openurl", { url: "https://example.com/{query}" }],
    ],
    [
      ["sf", "clip"],
      ["kw", "url"],
    ],
    {
      bundleid: "com.example.greeter",
      name: "Greeter",
      userconfigurationconfig: [
        {
          type: "textfield",
          variable: "token",
          label: "Token",
          config: { default: "", required: true },
        },
      ],
    },
  );
  // Only their paths matter: icons resolve against the workflow directory.
  await writeFile(join(dir, "icon.png"), "png");
  await writeFile(join(dir, "sf.png"), "png");
  return { dir, archive: await writeWorkflowArchive(dir, join(root, "Greeter.alfredworkflow")) };
}
