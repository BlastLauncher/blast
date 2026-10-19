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
      root.render(<App session={opened.session} onQuit={quit} />);
      await Promise.race([
        finished,
        opened.session.exited.then((exit) => {
          if (exit.error || exit.code !== 0)
            throw exit.error ?? new Error(`Runtime exited: ${exit.code ?? exit.signal}`);
        }),
      ]);
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
