/** @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
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
// In --popup-daemon mode the process runs inside a dedicated inner tmux server,
// so restore the caller's outer TMUX before extensions and engine prewarm read it.
if (args.kind === "root" && args.daemon && process.env.BLAST_OUTER_TMUX) {
  process.env.TMUX = process.env.BLAST_OUTER_TMUX;
}
if (args.kind === "root" && !process.argv.includes("--no-builtin")) {
  const bundled = [
    new URL("../../extensions/tmux", import.meta.url),
    new URL("../extensions/tmux", import.meta.url),
  ]
    .map((url) => fileURLToPath(url))
    .find((path) => existsSync(path));
  if (!bundled) throw new Error("Bundled tmux extension is missing");
  const tmuxMode =
    process.env.BLAST_TMUX_TARGET !== undefined || process.env.BLAST_TMUX_TARGET_FILE !== undefined;
  if (tmuxMode) {
    const configPath =
      process.env.BLAST_TMUX_CONFIG ??
      join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "blast", "tmux.json");
    let builtinTmux = process.env.BLAST_TMUX_BUILTIN !== "0";
    let installed: string[] = [];
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8")) as {
        builtinTmux?: boolean;
        extensions?: { directory?: string; enabled?: boolean }[];
      };
      builtinTmux = builtinTmux && config.builtinTmux !== false;
      installed = (config.extensions ?? [])
        .filter((extension) => extension.enabled && typeof extension.directory === "string")
        .map((extension) => extension.directory!);
    } catch {
      // A missing or malformed config falls back to builtin tmux only.
    }
    const manager = [
      new URL("../../extensions/blast", import.meta.url),
      new URL("../extensions/blast", import.meta.url),
    ]
      .map((url) => fileURLToPath(url))
      .find((path) => existsSync(path));
    if (manager) args.extensionDirs.unshift(manager);
    args.extensionDirs.unshift(...installed);
    if (builtinTmux) args.extensionDirs.unshift(bundled);
  } else {
    args.extensionDirs.unshift(bundled);
  }
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
  const popupSocket = args.daemon ? process.env.BLAST_POPUP_SOCKET : undefined;
  const pidFile = args.daemon ? process.env.BLAST_POPUP_PID_FILE : undefined;
  const outerPid = args.daemon ? Number(process.env.BLAST_OUTER_PID ?? "") : Number.NaN;
  const outerAlive = () => {
    if (!Number.isInteger(outerPid) || outerPid <= 1) return true;
    try {
      process.kill(outerPid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  };
  let resetDaemon: (() => void) | undefined;
  const onSigUsr1 = () => {
    if (!outerAlive()) {
      quit();
      return;
    }
    resetDaemon?.();
  };
  const detach = () => {
    if (popupSocket) {
      const child = spawn("tmux", ["-S", popupSocket, "detach-client", "-s", "blast"], {
        stdio: "ignore",
      });
      child.unref();
    } else {
      quit();
    }
    if (!outerAlive()) quit();
  };
  const renderer = await createCliRenderer({ exitOnCtrlC: false, onDestroy: quit });
  const root = createRoot(renderer);
  const stop = () => quit();
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  if (args.daemon) process.on("SIGUSR1", onSigUsr1);
  const watchdog =
    args.daemon && Number.isInteger(outerPid) && outerPid > 1
      ? setInterval(() => {
          if (!outerAlive()) quit();
        }, 5_000)
      : undefined;
  watchdog?.unref();
  try {
    root.render(
      <CommandSession
        extensionDir={args.extensionDirs}
        popup={args.popup}
        handlers={handlers}
        {...(args.daemon
          ? {
              onDetach: detach,
              onRegisterReset: (fn: () => void) => {
                resetDaemon = fn;
              },
            }
          : {})}
        onExit={(crashed) => {
          // Only a crashed last launch makes the whole TUI exit non-zero.
          if (crashed) process.exitCode = 1;
          quit();
        }}
      />,
    );
    if (pidFile) {
      const tmp = `${pidFile}.${process.pid}`;
      writeFileSync(tmp, `${process.pid}\n`);
      renameSync(tmp, pidFile);
    }
    await finished;
  } finally {
    if (watchdog) clearInterval(watchdog);
    if (args.daemon) process.off("SIGUSR1", onSigUsr1);
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    if (pidFile) {
      try {
        if (!outerAlive()) {
          rmSync(dirname(pidFile), { recursive: true, force: true });
        } else if (readFileSync(pidFile, "utf8").trim() === String(process.pid)) {
          rmSync(pidFile, { force: true });
        }
      } catch {
        // Best-effort cleanup on shutdown.
      }
    }
    root.unmount();
    renderer.destroy();
  }
}
