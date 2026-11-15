/** @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createNativeHandlers } from "@blastlauncher/native";
import { App } from "./app.tsx";
import { parseCliArgs, USAGE } from "./cli.ts";
import { CommandSession } from "./launcher.tsx";
import { openCommand } from "./session.ts";

const args = parseCliArgs(process.argv.slice(2));
if (args.kind === "version") {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: string };
  console.log(packageJson.version ?? "0.0.0-dev");
  process.exit(0);
}
if (args.kind === "root" && !process.argv.includes("--no-builtin")) {
  const bundled = [
    new URL("../../extensions/tmux", import.meta.url),
    new URL("../extensions/tmux", import.meta.url),
  ]
    .map((url) => fileURLToPath(url))
    .find((path) => existsSync(path));
  if (!bundled) throw new Error("Bundled tmux extension is missing");
  args.extensionDirs.unshift(bundled);
}
const handlers = args.kind !== "usage" && args.native ? createNativeHandlers() : {};
if (args.kind === "usage") {
  if (args.error) console.error(args.error);
  console.error(USAGE);
  process.exitCode = args.error ? 2 : 0;
} else if (args.kind === "command") {
  const opened = await openCommand(args.extensionDir, args.command, { handlers });
  // Recorded before the user quits, so our own shutdown does not count as a
  // failure; a runtime crash still exits non-zero after the error is shown.
  let crashed = false;
  void opened.session.exited.then((exit) => {
    crashed = !!exit.error || exit.code !== 0;
  });
  let quit!: () => void;
  const finished = new Promise<void>((resolve) => {
    quit = resolve;
  });
  try {
    const renderer = await createCliRenderer({ exitOnCtrlC: false, onDestroy: quit });
    const root = createRoot(renderer);
    const stop = () => quit();
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    try {
      // The App reacts to the runtime exiting: no-view commands quit after
      // their HUD, failures show the error and wait for Esc (docs/tui.md).
      root.render(<App session={opened.session} onQuit={quit} />);
      await finished;
      if (crashed) process.exitCode = 1;
    } finally {
      process.off("SIGTERM", stop);
      process.off("SIGINT", stop);
      root.unmount();
      renderer.destroy();
    }
  } finally {
    await opened.close();
  }
} else {
  // Launcher mode: the engine root lists every extension's commands; launch
  // one and return, or quit once it closes the window in popup mode.
  let quit!: () => void;
  const finished = new Promise<void>((resolve) => {
    quit = resolve;
  });
  const renderer = await createCliRenderer({ exitOnCtrlC: false, onDestroy: quit });
  const root = createRoot(renderer);
  const stop = () => quit();
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  try {
    root.render(
      <CommandSession
        extensionDir={args.extensionDirs}
        popup={args.popup}
        handlers={handlers}
        onExit={(crashed) => {
          // Only a crashed last launch makes the whole TUI exit non-zero.
          if (crashed) process.exitCode = 1;
          quit();
        }}
      />,
    );
    await finished;
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    root.unmount();
    renderer.destroy();
  }
}
