import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { openExtension, type ExtensionHandle } from "@blastlauncher/host";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";

const extensionDir = resolve(import.meta.dir, "../extensions/tmux");
const available = spawnSync("tmux", ["-V"]).status === 0;
if (!available) console.warn("tmux extension tests skipped: tmux is not installed");

type Opened = Awaited<ReturnType<ExtensionHandle["launch"]>>;

/**
 * Runs `body` against a fresh tmux server on its own socket (`-L`), with the
 * extension's `TMUX` pointing at it through the engine's `inheritEnv`, so the
 * user's tmux and `process.env` are never touched.
 */
async function withServer(
  body: (context: {
    tmux: (args: string[]) => string;
    extension: ExtensionHandle;
  }) => Promise<void>,
) {
  const server = `blast-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const tmux = (args: string[]) =>
    execFileSync("tmux", ["-L", server, "-f", "/dev/null", ...args], { encoding: "utf8" }).trim();
  let extension: ExtensionHandle | undefined;
  let socket: string | undefined;
  try {
    tmux(["new-session", "-d", "-s", "blast", "-x", "80", "-y", "24"]);
    // Ask tmux rather than assume /tmp/tmux-<uid>: TMUX_TMPDIR moves it.
    socket = tmux(["display-message", "-p", "#{socket_path}"]);
    extension = openExtension({
      extensionDir,
      inheritEnv: { TMUX: `${socket},0,0`, BLAST_TMUX_TARGET: "blast:0.0" },
    });
    await body({ tmux, extension });
  } finally {
    await extension?.close();
    spawnSync("tmux", ["-L", server, "kill-server"], { stdio: "ignore" });
    // Some tmux versions leave the socket file behind after kill-server.
    if (socket) rmSync(socket, { force: true });
  }
}

function find(node: SceneNode | null | undefined, type: string): SceneNode | undefined {
  if (!node) return undefined;
  if (node.type === type) return node;
  for (const child of node.children) {
    const found = find(child, type);
    if (found) return found;
  }
  return undefined;
}

/** Resolves with the first scene (latest or later) that contains a `type` node. */
function sceneWith(opened: Opened, type: string): Promise<SceneNode> {
  return new Promise((done, fail) => {
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => {
      stop?.();
      fail(new Error(`Timed out waiting for a ${type} scene`));
    }, 10_000);
    stop = opened.session.scenes((scene: SceneMessage) => {
      const node = find(scene.root, type);
      if (!node) return;
      clearTimeout(timer);
      queueMicrotask(() => stop?.());
      done(node);
    });
  });
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
  const opened = await extension.launch(command, { installDependencies: false });
  try {
    const alert = await sceneWith(opened, "Alert");
    const name = confirm ? "primaryAction" : "dismissAction";
    const action = alert.children.find((child) => child.props.name === name);
    const handler = action?.props.onAction as { $handler: string } | undefined;
    if (!action || !handler) throw new Error(`Alert has no ${name}`);
    opened.session.sendEvent(action.id, handler.$handler, []);
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
