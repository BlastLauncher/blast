/** @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app.tsx";
import { openCommand } from "./session.ts";

const [extensionDir, command, ...rest] = process.argv.slice(2);
if (!extensionDir || !command || rest.length) {
  console.error("Usage: bun run tui <extensionDir> <command>");
  process.exitCode = 2;
} else {
  const opened = await openCommand(extensionDir, command);
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
    } finally {
      process.off("SIGTERM", stop);
      process.off("SIGINT", stop);
      root.unmount();
      renderer.destroy();
    }
  } finally {
    await opened.close();
  }
}
