import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { openExtension, type ExtensionHandle } from "@blastlauncher/host";
import type { JsonValue, SceneMessage, SceneNode } from "@blastlauncher/protocol";

const extensionDir = resolve(import.meta.dir, "../extensions/tmux");
const available = spawnSync("tmux", ["-V"]).status === 0;
if (!available) console.warn("tmux extension tests skipped: tmux is not installed");

type Opened = Awaited<ReturnType<ExtensionHandle["launch"]>>;

const serverName = () => `blast-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
const tmuxOn = (server: string) => (args: string[]) =>
  execFileSync("tmux", ["-L", server, "-f", "/dev/null", ...args], { encoding: "utf8" }).trim();

/**
 * Runs `body` against a fresh tmux server on its own socket (`-L`), with the
 * extension's `TMUX` pointing at it through the engine's `inheritEnv`, so the
 * user's tmux and `process.env` are never touched. With `client`, a second
 * isolated server's pane attaches a client to session `blast`, which commands
 * such as `switch-client` need.
 */
async function withServer(
  body: (context: {
    tmux: (args: string[]) => string;
    extension: ExtensionHandle;
  }) => Promise<void>,
  options: { client?: boolean } = {},
) {
  const server = serverName();
  const outer = serverName();
  const tmux = tmuxOn(server);
  let extension: ExtensionHandle | undefined;
  const sockets: string[] = [];
  try {
    tmux(["new-session", "-d", "-s", "blast", "-x", "80", "-y", "24"]);
    // A login shell's prompt may set the pane title and race the rename tests.
    tmux(["set-option", "-g", "allow-set-title", "off"]);
    // Ask tmux rather than assume /tmp/tmux-<uid>: TMUX_TMPDIR moves it.
    const socket = tmux(["display-message", "-p", "#{socket_path}"]);
    sockets.push(socket);
    if (options.client) {
      const host = tmuxOn(outer);
      const attach = ["env", "-u", "TMUX", "tmux", "-L", server, "attach", "-t", "blast"];
      host(["new-session", "-d", "-x", "80", "-y", "24", ...attach]);
      sockets.push(host(["display-message", "-p", "#{socket_path}"]));
      const deadline = Date.now() + 10_000;
      while (!tmux(["list-clients", "-F", "#{client_name}"])) {
        if (Date.now() > deadline) throw new Error("No tmux client attached");
        await Bun.sleep(20);
      }
    }
    extension = openExtension({
      extensionDir,
      inheritEnv: { TMUX: `${socket},0,0`, BLAST_TMUX_TARGET: "blast:0.0" },
    });
    await body({ tmux, extension });
  } finally {
    await extension?.close();
    for (const name of [outer, server]) {
      spawnSync("tmux", ["-L", name, "kill-server"], { stdio: "ignore" });
    }
    // Some tmux versions leave the socket file behind after kill-server.
    for (const socket of sockets) rmSync(socket, { force: true });
  }
}

function nodes(node: SceneNode | null | undefined): SceneNode[] {
  return node ? [node, ...node.children.flatMap((child) => nodes(child))] : [];
}

function find(node: SceneNode | null | undefined, type: string): SceneNode | undefined {
  return nodes(node).find((candidate) => candidate.type === type);
}

/** Resolves with `pick`'s first result for the latest or a later scene root. */
function sceneMatching<T>(
  opened: Opened,
  pick: (root: SceneNode | null | undefined) => T | undefined,
  what: string,
): Promise<T> {
  return new Promise((done, fail) => {
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => {
      stop?.();
      fail(new Error(`Timed out waiting for ${what}`));
    }, 10_000);
    stop = opened.session.scenes((scene: SceneMessage) => {
      const found = pick(scene.root);
      if (found === undefined) return;
      clearTimeout(timer);
      queueMicrotask(() => stop?.());
      done(found);
    });
  });
}

/** Resolves with the first scene (latest or later) that contains a `type` node. */
function sceneWith(opened: Opened, type: string): Promise<SceneNode> {
  return sceneMatching(opened, (root) => find(root, type), `a ${type} scene`);
}

function fire(opened: Opened, node: SceneNode, prop: string, args: JsonValue[] = []) {
  const handler = node.props[prop] as { $handler: string } | undefined;
  if (!handler) throw new Error(`${node.type} has no ${prop}`);
  opened.session.sendEvent(node.id, handler.$handler, args);
}

/** The loaded list's item titles, once its items are rendered. */
async function listItems(opened: Opened): Promise<SceneNode[]> {
  return sceneMatching(
    opened,
    (root) => {
      const items = nodes(root).filter((node) => node.type === "List.Item");
      return items.length ? items : undefined;
    },
    "list items",
  );
}

/** Runs `row`'s action titled `title`. */
function act(opened: Opened, row: SceneNode, title: string) {
  const action = nodes(row).find((node) => node.props.title === title && node.props.onAction);
  if (!action) throw new Error(`${String(row.props.title)} has no ${title} action`);
  fire(opened, action, "onAction");
}

/** Resolves once the command asked to close the window: its action is done. */
function closed(opened: Opened): Promise<true> {
  return sceneMatching(
    opened,
    (root) => (root?.type === "Navigation" && root.props.closeMainWindow ? true : undefined),
    "closeMainWindow",
  );
}

/** Answers the latest `confirmAlert` through its scene, as a client would. */
async function answer(opened: Opened, confirm: boolean) {
  const alert = await sceneWith(opened, "Alert");
  const name = confirm ? "primaryAction" : "dismissAction";
  const action = alert.children.find((child) => child.props.name === name);
  if (!action) throw new Error(`Alert has no ${name}`);
  fire(opened, action, "onAction");
}

/** Waits for the form's `field` to hold `value` (loaded or typed). */
function field(opened: Opened, id: string, value: string): Promise<SceneNode> {
  return sceneMatching(
    opened,
    (root) =>
      nodes(root).find(
        (node) =>
          node.type === "Form.TextField" && node.props.id === id && node.props.value === value,
      ),
    `field ${id} = ${JSON.stringify(value)}`,
  );
}

/** Waits for the form's `field` to show `error`. */
function fieldError(opened: Opened, id: string, error: string): Promise<SceneNode> {
  return sceneMatching(
    opened,
    (root) =>
      nodes(root).find(
        (node) =>
          node.type === "Form.TextField" && node.props.id === id && node.props.error === error,
      ),
    `field ${id} error ${JSON.stringify(error)}`,
  );
}

/** Types `values` into the form's fields, then submits it. */
async function submit(opened: Opened, values: Record<string, string>) {
  for (const [id, value] of Object.entries(values)) {
    const node = await sceneMatching(
      opened,
      (root) => nodes(root).find((text) => text.type === "Form.TextField" && text.props.id === id),
      `field ${id}`,
    );
    fire(opened, node, "onChange", [value]);
    await field(opened, id, value);
  }
  fire(opened, await sceneWith(opened, "Action.SubmitForm"), "onAction");
}

function item(items: SceneNode[], title: string): SceneNode {
  const found = items.find((candidate) => candidate.props.title === title);
  if (!found) throw new Error(`No list item ${title}`);
  return found;
}

async function launch(extension: ExtensionHandle, command: string) {
  return extension.launch(command, { installDependencies: false });
}

/** Runs a list command and hands `body` its loaded items. */
async function inList(
  extension: ExtensionHandle,
  command: string,
  body: (opened: Opened, items: SceneNode[]) => Promise<void>,
) {
  const opened = await launch(extension, command);
  try {
    await body(opened, await listItems(opened));
  } finally {
    await opened.close();
  }
}

/** Runs a command and hands `body` its session. */
async function inView(
  extension: ExtensionHandle,
  command: string,
  body: (opened: Opened) => Promise<void>,
) {
  const opened = await launch(extension, command);
  try {
    await body(opened);
  } finally {
    await opened.close();
  }
}

async function run(extension: ExtensionHandle, command: string) {
  const opened = await extension.launch(command, { installDependencies: false });
  try {
    expect(await opened.session.exited).toMatchObject({ code: 0 });
  } finally {
    await opened.close();
  }
}

/** Answers the command's `confirmAlert` through its scene, as a client would. */
async function runAnswering(extension: ExtensionHandle, command: string, confirm: boolean) {
  const opened = await launch(extension, command);
  try {
    await answer(opened, confirm);
    expect(await opened.session.exited).toMatchObject({ code: 0 });
  } finally {
    await opened.close();
  }
}

const lines = (output: string) => output.split("\n").length;

describe("tmux extension", () => {
  test.skipIf(!available)(
    "splits, zooms and moves between windows of the target session",
    async () => {
      await withServer(async ({ tmux, extension }) => {
        await run(extension, "split-horizontal");
        await run(extension, "split-vertical");
        expect(lines(tmux(["list-panes", "-t", "blast:0", "-F", "#{pane_id}"]))).toBe(3);
        await run(extension, "zoom-pane");
        expect(tmux(["display-message", "-p", "-t", "blast:0", "#{window_zoomed_flag}"])).toBe("1");
        await run(extension, "new-window");
        expect(lines(tmux(["list-windows", "-t", "blast", "-F", "#{window_index}"]))).toBe(2);
        expect(tmux(["display-message", "-p", "-t", "blast", "#{window_index}"])).toBe("1");
        await run(extension, "next-window");
        expect(tmux(["display-message", "-p", "-t", "blast", "#{window_index}"])).toBe("0");
      });
    },
    30_000,
  );

  test.skipIf(!available)(
    "next and previous pane count from the target pane, not tmux's active one",
    async () => {
      await withServer(async ({ tmux, extension }) => {
        tmux(["split-window", "-t", "blast:0"]);
        tmux(["split-window", "-t", "blast:0"]);
        tmux(["select-pane", "-t", "blast:0.2"]);
        const active = () => tmux(["display-message", "-p", "-t", "blast:0", "#{pane_index}"]);
        await run(extension, "next-pane");
        expect(active()).toBe("1");
        tmux(["select-pane", "-t", "blast:0.1"]);
        await run(extension, "previous-pane");
        expect(active()).toBe("2");
      });
    },
    30_000,
  );

  test.skipIf(!available)(
    "a destructive command runs only after its alert is confirmed",
    async () => {
      await withServer(async ({ tmux, extension }) => {
        tmux(["new-window", "-d", "-t", "blast:1"]);
        const windows = () => tmux(["list-windows", "-t", "blast", "-F", "#{window_index}"]);
        await runAnswering(extension, "close-window", false);
        expect(windows()).toBe("0\n1");
        await runAnswering(extension, "close-window", true);
        expect(windows()).toBe("1");
      });
    },
    30_000,
  );

  test.skipIf(!available)(
    "find pane lists every pane, switches to one, zooms it and kills it after confirmation",
    async () => {
      await withServer(
        async ({ tmux, extension }) => {
          tmux(["split-window", "-t", "blast:0"]);
          tmux(["new-session", "-d", "-s", "other", "-x", "80", "-y", "24"]);
          tmux(["new-window", "-t", "other:"]);
          tmux(["split-window", "-t", "other:1"]);
          tmux(["select-pane", "-t", "other:1.1"]);
          const listed = tmux([
            "list-panes",
            "-a",
            "-F",
            "#{session_name}:#{window_index}.#{pane_index}",
          ]).split("\n");
          const client = (format: string) => tmux(["list-clients", "-F", format]);

          await inList(extension, "find-pane", async (opened, items) => {
            expect(items.map((row) => row.props.title)).toEqual(listed);
            act(opened, item(items, "other:1.0"), "Switch to Pane");
            await closed(opened);
          });
          expect(client("#{session_name}:#{window_index}.#{pane_index}")).toBe("other:1.0");

          await inList(extension, "find-pane", async (opened, items) => {
            act(opened, item(items, "other:1.1"), "Zoom / Unzoom Pane");
            await closed(opened);
          });
          expect(tmux(["display-message", "-p", "-t", "other:1", "#{window_zoomed_flag}"])).toBe(
            "1",
          );

          await inList(extension, "find-pane", async (opened, items) => {
            act(opened, item(items, "blast:0.1"), "Kill Pane");
            await answer(opened, false);
            await sceneMatching(
              opened,
              (root) => (find(root, "Alert") ? undefined : true),
              "no alert",
            );
            act(opened, item(items, "blast:0.1"), "Kill Pane");
            await answer(opened, true);
            await closed(opened);
          });
          expect(tmux(["list-panes", "-t", "blast:0", "-F", "#{pane_index}"])).toBe("0");
        },
        { client: true },
      );
    },
    30_000,
  );

  test.skipIf(!available)(
    "move pane lists the other windows and joins or breaks the target pane",
    async () => {
      await withServer(async ({ tmux, extension }) => {
        tmux(["split-window", "-t", "blast:0"]);
        tmux(["new-window", "-d", "-t", "blast:1"]);
        tmux(["new-session", "-d", "-s", "other", "-x", "80", "-y", "24"]);
        const panes = (window: string) =>
          lines(tmux(["list-panes", "-t", window, "-F", "#{pane_id}"]));
        const origin = tmux(["display-message", "-p", "-t", "blast:0.0", "#{pane_id}"]);
        const others = tmux(["list-windows", "-a", "-F", "#{session_name}:#{window_index}"])
          .split("\n")
          .filter((window) => window !== "blast:0");

        await inList(extension, "move-pane", async (opened, items) => {
          expect(items.map((row) => row.props.title)).toEqual(["New Window", ...others]);
          act(opened, item(items, "other:0"), "Move to Window");
          await closed(opened);
        });
        expect(panes("blast:0")).toBe(1);
        expect(tmux(["list-panes", "-t", "other:0", "-F", "#{pane_id}"])).toContain(origin);

        tmux(["split-window", "-t", "blast:0"]);
        await inList(extension, "move-pane", async (opened, items) => {
          act(opened, item(items, "New Window"), "Move to New Window");
          await closed(opened);
        });
        expect(panes("blast:0")).toBe(1);
        expect(lines(tmux(["list-windows", "-t", "blast", "-F", "#{window_id}"]))).toBe(3);
      });
    },
    30_000,
  );

  test.skipIf(!available)(
    "rename pane prefills the target pane's title and sets it",
    async () => {
      await withServer(async ({ tmux, extension }) => {
        tmux(["select-pane", "-t", "blast:0.0", "-T", "before"]);
        await inView(extension, "rename-pane", async (opened) => {
          await field(opened, "name", "before");
          await submit(opened, { name: "after" });
          await closed(opened);
        });
        expect(tmux(["display-message", "-p", "-t", "blast:0.0", "#{pane_title}"])).toBe("after");
      });
    },
    30_000,
  );

  test.skipIf(!available)(
    "rename window prefills the window name, rejects an empty one and renames",
    async () => {
      await withServer(async ({ tmux, extension }) => {
        tmux(["rename-window", "-t", "blast:0", "before"]);
        await inView(extension, "rename-window", async (opened) => {
          await field(opened, "name", "before");
          await submit(opened, { name: " " });
          await fieldError(opened, "name", "Enter a name");
          await submit(opened, { name: "after" });
          await closed(opened);
        });
        expect(tmux(["display-message", "-p", "-t", "blast:0", "#{window_name}"])).toBe("after");
      });
    },
    30_000,
  );

  test.skipIf(!available)(
    "rename session prefills the session name, rejects an existing one and renames",
    async () => {
      await withServer(async ({ tmux, extension }) => {
        tmux(["new-session", "-d", "-s", "other", "-x", "80", "-y", "24"]);
        await inView(extension, "rename-session", async (opened) => {
          await field(opened, "name", "blast");
          await submit(opened, { name: "other" });
          await fieldError(opened, "name", "Session other already exists");
          await submit(opened, { name: "renamed" });
          await closed(opened);
        });
        expect(tmux(["list-sessions", "-F", "#{session_name}"]).split("\n").toSorted()).toEqual([
          "other",
          "renamed",
        ]);
      });
    },
    30_000,
  );

  test.skipIf(!available)(
    "new session rejects an existing name, creates one in a directory and switches to it",
    async () => {
      await withServer(
        async ({ tmux, extension }) => {
          await inView(extension, "new-session", async (opened) => {
            await submit(opened, { name: "blast" });
            await fieldError(opened, "name", "Session blast already exists");
            await submit(opened, { name: "fresh", directory: extensionDir });
            await closed(opened);
          });
          expect(tmux(["display-message", "-p", "-t", "fresh:", "#{session_path}"])).toBe(
            extensionDir,
          );
          expect(tmux(["list-clients", "-F", "#{client_session}"])).toBe("fresh");
        },
        { client: true },
      );
    },
    30_000,
  );

  test.skipIf(!available)(
    "choose session lists sessions, switches, renames, kills after confirmation and creates",
    async () => {
      await withServer(
        async ({ tmux, extension }) => {
          tmux(["new-session", "-d", "-s", "other", "-x", "80", "-y", "24"]);
          tmux(["new-window", "-t", "other:"]);
          const sessions = () => tmux(["list-sessions", "-F", "#{session_name}"]).split("\n");
          const client = () => tmux(["list-clients", "-F", "#{client_session}"]);

          await inList(extension, "choose-session", async (opened, items) => {
            expect(items.map((row) => row.props.title)).toEqual(sessions());
            expect(item(items, "blast").props.accessories).toEqual([
              { text: "1 window" },
              { tag: "attached" },
            ]);
            expect(item(items, "other").props.accessories).toEqual([{ text: "2 windows" }]);
            act(opened, item(items, "other"), "Switch to Session");
            await closed(opened);
          });
          expect(client()).toBe("other");

          await inList(extension, "choose-session", async (opened, items) => {
            act(opened, item(items, "blast"), "Rename Session");
            await field(opened, "name", "blast");
            await submit(opened, { name: "renamed" });
            await closed(opened);
          });
          expect(sessions().toSorted()).toEqual(["other", "renamed"]);

          await inList(extension, "choose-session", async (opened, items) => {
            act(opened, item(items, "renamed"), "Kill Session");
            await answer(opened, true);
            await closed(opened);
          });
          expect(sessions()).toEqual(["other"]);

          await inList(extension, "choose-session", async (opened, items) => {
            act(opened, item(items, "other"), "New Session");
            await submit(opened, { name: "made" });
            await closed(opened);
          });
          expect(sessions().toSorted()).toEqual(["made", "other"]);
          expect(client()).toBe("made");
        },
        { client: true },
      );
    },
    30_000,
  );

  test.skipIf(!available)(
    "break to new window moves the target pane into a new window",
    async () => {
      await withServer(async ({ tmux, extension }) => {
        tmux(["split-window", "-t", "blast:0"]);
        await run(extension, "break-pane");
        expect(lines(tmux(["list-panes", "-t", "blast:0", "-F", "#{pane_id}"]))).toBe(1);
        expect(lines(tmux(["list-windows", "-t", "blast", "-F", "#{window_index}"]))).toBe(2);
      });
    },
    30_000,
  );

  test.skipIf(!available)("shows a Not inside tmux failure toast without TMUX", async () => {
    // No inheritEnv: TMUX stays withheld even when the tests run inside tmux.
    const extension = openExtension({ extensionDir });
    try {
      const opened = await extension.launch("next-pane", { installDependencies: false });
      try {
        const toast = await sceneWith(opened, "Toast");
        expect(toast.props).toMatchObject({ style: "FAILURE", title: "Not inside tmux" });
        expect(await opened.session.exited).toMatchObject({ code: 0 });
      } finally {
        await opened.close();
      }
    } finally {
      await extension.close();
    }
  });
});
