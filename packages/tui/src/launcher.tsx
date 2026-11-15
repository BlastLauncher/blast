/** @jsxImportSource @opentui/react */
import { createHeadlessHandlers } from "@blastlauncher/cli";
import { useEffect, useRef, useState } from "react";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import type { KeyEvent } from "@opentui/core";
import type { ControllerView, KeyInput } from "@blastlauncher/client-core";
import {
  createEngine,
  startLaunchFlow,
  type CapabilityHandler,
  type DependencyInstaller,
  type ExtensionManifest,
  type LaunchFlow,
  type RootOptions,
  type Session,
} from "@blastlauncher/host";
import { App, ViewFrame, platform } from "./app.tsx";
import { createClientHandlers, inheritEnv } from "./session.ts";
import { theme } from "./theme.ts";

type Engine = ReturnType<typeof createEngine>;
type Target = Parameters<NonNullable<RootOptions["launch"]>>[0];
type Screen =
  | { kind: "root" }
  | { kind: "flow"; flow: LaunchFlow; title: string }
  | { kind: "command"; id: number; session: Session; leave(): void; relaunch(): void };

const views = { platform, appearance: "dark" } as const;
// The root's Configure Command shortcut (⌘⇧, / Ctrl+Shift+,), which few
// terminals can deliver; Ctrl-E sends it.
const CONFIGURE: KeyInput =
  platform === "macOS"
    ? { name: ",", meta: true, shift: true }
    : { name: ",", ctrl: true, shift: true };
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The launcher session over the engine: `engine.root` lists, ranks and
 * configures commands, `startLaunchFlow` asks for missing values and installs
 * dependencies, and a launched command renders in `App` with its session.
 * Esc at a command's root, a no-view command finishing and the crash screen
 * return to the root (selection kept); Ctrl-C quits from anywhere. The process
 * exits 1 only when the last launched command crashed and the user then quits.
 * In `popup` mode (decision 0016) a command closing the window
 * (`closeMainWindow()`, or a no-view command done after its HUD) quits too.
 */
export function CommandSession({
  extensionDir,
  popup = false,
  dataDir,
  engine: suppliedEngine,
  hudDurationMs,
  installer,
  handlers,
  onExit,
}: {
  /** One extension or several; the root lists every command of each. */
  extensionDir: string | readonly string[];
  /** Quit once a command closes the window, for `tmux display-popup -E`. */
  popup?: boolean;
  dataDir?: string;
  /** Opens the extension on this engine instead of a new one (left open on unmount). */
  engine?: Engine;
  hudDurationMs?: number;
  installer?: DependencyInstaller;
  handlers?: Record<string, CapabilityHandler>;
  onExit?: (crashed: boolean) => void;
}) {
  const launchRef = useRef<NonNullable<RootOptions["launch"]>>(null!);
  const [setup] = useState(() => {
    const engine =
      suppliedEngine ??
      createEngine({
        inheritEnv,
        ...(dataDir === undefined ? {} : { dataDir }),
        ...(installer ? { installer } : {}),
      });
    const dirs = typeof extensionDir === "string" ? [extensionDir] : [...extensionDir];
    const extensions = dirs.map((dir) => engine.openExtension({ extensionDir: dir }));
    const root = engine.root({
      views,
      configureScope: "extension",
      launch: (target) => launchRef.current(target),
    });
    return { engine, dirs, extensions, root };
  });
  const [screen, setScreen] = useState<Screen>({ kind: "root" });
  const [rootView, setRootView] = useState(() => setup.root.view());
  // Tagged with its flow, so a new flow never shows the previous one's view.
  const [flowView, setFlowView] = useState<{ flow: LaunchFlow; view: ControllerView }>();
  // Per extension, in argument order; the first broken manifest is shown.
  const [manifestErrors, setManifestErrors] = useState<(string | undefined)[]>([]);
  const [launchError, setLaunchError] = useState<string>();
  const crashed = useRef(false);
  const exiting = useRef(false);
  // The scope a command's `preferences.open` asked for, until the root opens it.
  const configureNext = useRef<"extension" | "command">(undefined);
  const commands = useRef(0);
  // What is running now, for quitting and unmounting.
  const live = useRef<{ flow?: LaunchFlow; stop?: () => Promise<void>; leave?: () => void }>({});

  useEffect(() => setup.root.subscribe(setRootView), []);
  // The Blast manager writes the tmux config after installing an extension.
  // Open newly enabled directories on the live engine so the root catalog
  // updates without closing the popup or restarting tmux.
  useEffect(() => {
    const configPath = process.env.BLAST_TMUX_CONFIG;
    if (!configPath) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      try {
        const config = JSON.parse(await readFile(configPath, "utf8")) as {
          extensions?: { directory?: string; enabled?: boolean }[];
        };
        for (const extension of config.extensions ?? []) {
          const directory = extension.directory;
          if (!extension.enabled || !directory || setup.dirs.includes(directory)) continue;
          setup.dirs.push(directory);
          setup.extensions.push(setup.engine.openExtension({ extensionDir: directory }));
        }
      } catch {
        // The config may be mid-atomic-write; the next event retries it.
      }
    };
    const listener = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void sync(), 75);
    };
    const watcher = watch(configPath, { persistent: false }, listener);
    return () => {
      watcher.close();
      if (timer) clearTimeout(timer);
    };
  }, [setup]);
  useEffect(() => {
    if (screen.kind !== "flow") return;
    const flow = screen.flow;
    return flow.subscribe((view) => setFlowView({ flow, view }));
  }, [screen]);
  // The root keeps the last good commands; the broken manifest's reason shows here.
  useEffect(() => {
    const stops = setup.extensions.map((extension, index) => {
      const update = (value: ExtensionManifest | Error) =>
        setManifestErrors((errors) => {
          const next = [...errors];
          // Several extensions: say which directory the broken manifest is in.
          next[index] =
            value instanceof Error
              ? setup.dirs.length > 1
                ? `${setup.dirs[index]}: ${value.message}`
                : value.message
              : undefined;
          return next;
        });
      void extension.manifest().then(update, (error: unknown) => update(new Error(message(error))));
      try {
        return extension.watch(update);
      } catch {
        return undefined;
      }
    });
    return () => {
      for (const stop of stops) stop?.();
    };
  }, []);
  useEffect(
    () => () => {
      live.current.flow?.cancel();
      void live.current.stop?.();
      void setup.root.close();
      for (const extension of setup.extensions) void extension.close();
      if (!suppliedEngine) void setup.engine.close();
    },
    [],
  );
  const manifestError = manifestErrors.find((error) => error !== undefined);

  /** Prompts as needed, then starts the command; `undefined` when the user cancelled. */
  async function run(target: Target, argumentValues?: Record<string, string>) {
    const effects = createClientHandlers();
    const flow = startLaunchFlow(target.extension, target.command, {
      views,
      ...(target.configure ? { configure: true } : {}),
      ...(target.scope ? { configureScope: target.scope } : {}),
      launch: {
        ...(argumentValues ? { argumentValues } : {}),
        handlers: {
          ...createHeadlessHandlers(),
          ...effects.handlers,
          ...handlers,
          "preferences.open": (params) => {
            if (
              !params ||
              typeof params !== "object" ||
              Array.isArray(params) ||
              (params.scope !== "extension" && params.scope !== "command")
            )
              throw new Error("Invalid preferences scope");
            const scope = params.scope;
            setTimeout(() => {
              configureNext.current = scope;
              live.current.leave?.();
            }, 0);
          },
        },
      },
    });
    live.current.flow = flow;
    const title = setup.root.view().rows.find((row) => row.selected)?.title ?? target.command;
    setScreen({ kind: "flow", flow, title });
    try {
      const opened = await flow.opened;
      return opened && { opened, argumentValues: await flow.argumentValues };
    } finally {
      delete live.current.flow;
    }
  }

  launchRef.current = async (target) => {
    // The root's Configure uses its own scope; a command may have asked for another.
    if (target.configure && configureNext.current)
      target = { ...target, scope: configureNext.current };
    setLaunchError(undefined);
    const selected = setup.root.view().selectedId;
    let finish!: () => void;
    const exited = new Promise<void>((resolve) => {
      finish = resolve;
    });
    // The root resets its search and selection once `exited` settles; restore
    // the selection after that, and open the form a command asked for.
    void exited.then(() =>
      setTimeout(() => {
        if (exiting.current) return;
        setScreen({ kind: "root" });
        if (selected) setup.root.input({ type: "select", id: selected });
        if (configureNext.current) {
          // The root calls the launch hook synchronously, which reads the scope.
          setup.root.input({ type: "key", key: CONFIGURE });
          configureNext.current = undefined;
        }
      }, 0),
    );
    const attempt = async (argumentValues?: Record<string, string>): Promise<void> => {
      const started = await run(target, argumentValues);
      if (!started) return finish();
      const { opened } = started;
      if (exiting.current) {
        await opened.close();
        return finish();
      }
      crashed.current = false;
      // Set before we close the session, so our own shutdown is not a crash.
      let closing = false;
      void opened.session.exited.then((exit) => {
        if (!closing && (exit.error || exit.code !== 0)) crashed.current = true;
      });
      const stop = async () => {
        closing = true;
        if (live.current.stop === stop) live.current = {};
        await opened.close();
      };
      const leave = () => {
        if (live.current.stop !== stop) return;
        void stop();
        finish();
      };
      const relaunch = () => {
        if (live.current.stop !== stop || exiting.current) return;
        void stop()
          .then(() => attempt(started.argumentValues))
          .catch((error: unknown) => {
            setLaunchError(message(error));
            finish();
          });
      };
      live.current = { stop, leave };
      setScreen({
        kind: "command",
        id: ++commands.current,
        session: opened.session,
        leave,
        relaunch,
      });
    };
    try {
      await attempt();
    } catch (error) {
      // The root shows the failure as a toast.
      setScreen({ kind: "root" });
      throw error;
    }
    return { exited };
  };

  function quit() {
    if (exiting.current) return;
    exiting.current = true;
    void (async () => {
      live.current.flow?.cancel();
      // A crash was recorded when the child exited; a runtime that ignores
      // our shutdown and gets killed is not reported as a crash.
      await live.current.stop?.();
      onExit?.(crashed.current);
    })();
  }

  if (screen.kind === "command")
    return (
      <App
        key={screen.id}
        session={screen.session}
        onQuit={screen.leave}
        {...(popup ? { onClose: quit } : {})}
        onExit={quit}
        onRelaunch={screen.relaunch}
        {...(hudDurationMs === undefined ? {} : { hudDurationMs })}
      />
    );
  const ctrlC = (key: KeyEvent) => {
    if (!(key.ctrl && key.name === "c")) return false;
    key.preventDefault();
    quit();
    return true;
  };
  if (screen.kind === "flow" && flowView?.flow === screen.flow && flowView.view.kind !== "empty") {
    const flow = screen.flow;
    return (
      <ViewFrame
        view={flowView.view}
        now={() => flow.view()}
        input={(action) => {
          flow.input(action);
          return false;
        }}
        onKey={ctrlC}
      />
    );
  }
  // The root stays on screen while a launch prepares (nothing to ask yet).
  const status = manifestError
    ? { text: `Manifest: ${manifestError}`, color: theme.colors.danger }
    : launchError
      ? { text: `Launch failed: ${launchError}`, color: theme.colors.danger }
      : screen.kind === "flow"
        ? { text: `Launching ${screen.title}…`, color: theme.colors.textMuted }
        : undefined;
  return (
    <ViewFrame
      view={rootView}
      now={() => setup.root.view()}
      input={(action) => {
        setup.root.input(action);
        return false;
      }}
      onKey={(key) => {
        if (ctrlC(key)) return true;
        if (screen.kind === "flow") {
          if (key.name === "escape") screen.flow.cancel();
          return true;
        }
        if (key.name === "escape" && !setup.root.view().actions.open) {
          key.preventDefault();
          quit();
          return true;
        }
        if (key.ctrl && key.name === "e") {
          key.preventDefault();
          setup.root.input({ type: "key", key: CONFIGURE });
          return true;
        }
        return false;
      }}
      status={status}
      hints={
        <>
          <span fg={theme.colors.text}>Configure</span>
          <span fg={theme.colors.textMuted}>{" ^E  "}</span>
          <span fg={theme.colors.text}>Actions</span>
          <span fg={theme.colors.textMuted}>{` ${theme.glyphs.actionMod}  `}</span>
          <span fg={theme.colors.text}>Quit</span>
          <span fg={theme.colors.textMuted}>{" esc"}</span>
        </>
      }
    />
  );
}
