import { join } from "node:path";
import {
  createController,
  createRootController,
  iconView,
  type Controller,
  type ControllerInput,
  type ControllerOptions,
  type ControllerResult,
  type ControllerView,
  type RootCommand,
} from "@blastlauncher/client-core";
import type { ExtensionHandle } from "./extension.ts";
import { startLaunchFlow, type LaunchFlow } from "./launch-flow.ts";
import type { ExtensionManifest } from "./extension-manifest.ts";

export type RootOptions = {
  /** Platform and appearance for the root list and every command view. */
  views: Pick<ControllerOptions, "platform" | "appearance">;
  /** Scope shown by the root's Configure Command action. Defaults to command. */
  configureScope?: "extension" | "command";
  /**
   * Take over starting commands (the serve process keys sessions and forwards
   * capabilities itself). Resolve with a promise that settles when that
   * command's session ends; the root then resumes. `configure` asks for the
   * command's preferences form instead of the command. Without it the root
   * runs the flow in-process and shows its views in place of the root.
   */
  launch?: (target: {
    extension: ExtensionHandle;
    command: string;
    configure?: boolean;
    scope?: "extension" | "command";
  }) => Promise<{ exited: Promise<unknown> }>;
};

/** The engine's root search over every opened extension; see `engine.root`. */
export type Root = {
  /** The root list, or the launch prompt's or running command's view in the in-process mode. */
  view(): ControllerView;
  subscribe(listener: (view: ControllerView) => void): () => void;
  input(input: ControllerInput): void;
  /** Settles once the manifests of the extensions opened so far are read. */
  ready(): Promise<void>;
  close(): Promise<void>;
};

/** What the engine tells a root about its extensions. */
export type RootSource = {
  extensions(): ExtensionHandle[];
  onChange(
    listener: (change: { type: "open" | "close"; handle: ExtensionHandle }) => void,
  ): () => void;
  dirOf(handle: ExtensionHandle): string | undefined;
};

type Opened = Awaited<ReturnType<ExtensionHandle["launch"]>>;

/** Feeds a session's scenes to a controller and runs the events and effects it returns. */
function drive(opened: Opened, controller: Controller): { input(input: ControllerInput): void } {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;
  const apply = (result: ControllerResult) => {
    if (stopped) return;
    for (const value of result.events)
      opened.session.sendEvent(value.node, value.handler, value.args);
    for (const effect of result.effects) {
      if (effect.type === "quit") {
        stopped = true;
        for (const timer of timers) clearTimeout(timer);
        void opened.close();
        return;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        apply(controller.tick(effect.token));
      }, effect.ms);
      timers.add(timer);
    }
  };
  const stopScenes = opened.session.scenes((scene) => apply(controller.scene(scene)));
  void opened.session.exited.then(() => {
    stopped = true;
    stopScenes();
    for (const timer of timers) clearTimeout(timer);
  });
  return { input: (input) => apply(controller.input(input)) };
}

export function createRoot(source: RootSource, options: RootOptions): Root {
  const catalog = createRootController([], { platform: options.views.platform });
  const tracked: ExtensionHandle[] = [];
  const manifests = new Map<ExtensionHandle, ExtensionManifest>();
  const watches = new Map<ExtensionHandle, () => void>();
  const loads = new Set<Promise<void>>();
  const listeners = new Set<(view: ControllerView) => void>();
  let active: { view(): ControllerView; input(input: ControllerInput): void } | undefined;
  let busy = false;
  let closed = false;
  let running: Opened | undefined;
  let launching: LaunchFlow | undefined;

  const view = () => (active ? active.view() : catalog.view());
  const emit = (next: ControllerView) => {
    for (const listener of listeners) listener(next);
  };
  catalog.subscribe((next) => {
    if (!active) emit(next);
  });

  const rebuild = () => {
    const commands: RootCommand[] = [];
    for (const handle of tracked) {
      const manifest = manifests.get(handle);
      if (!manifest) continue;
      const assetsDir = join(source.dirOf(handle) ?? "", "assets");
      for (const command of manifest.commands) {
        const icon = command.icon ?? manifest.icon;
        commands.push({
          extension: manifest.name,
          extensionTitle: manifest.title,
          command: command.name,
          title: command.title,
          ...(command.subtitle ? { subtitle: command.subtitle } : {}),
          ...(command.description ? { description: command.description } : {}),
          mode: command.mode,
          ...(icon
            ? {
                icon: iconView(icon, {
                  assetsDir,
                  ...(options.views.appearance ? { appearance: options.views.appearance } : {}),
                }),
              }
            : {}),
        });
      }
    }
    catalog.setCatalog(commands);
  };
  const track = (handle: ExtensionHandle) => {
    if (tracked.includes(handle)) return;
    tracked.push(handle);
    try {
      watches.set(
        handle,
        handle.watch((update) => {
          // A broken manifest keeps the last good commands listed.
          if (update instanceof Error) return;
          manifests.set(handle, update);
          rebuild();
        }),
      );
    } catch {
      // Closed already: the load below fails the same way and is ignored.
    }
    const load = handle.manifest().then(
      (manifest) => {
        if (!tracked.includes(handle)) return;
        manifests.set(handle, manifest);
        rebuild();
      },
      () => {},
    );
    loads.add(load);
    void load.finally(() => loads.delete(load));
  };
  const untrack = (handle: ExtensionHandle) => {
    const at = tracked.indexOf(handle);
    if (at < 0) return;
    tracked.splice(at, 1);
    manifests.delete(handle);
    watches.get(handle)?.();
    watches.delete(handle);
    rebuild();
  };
  for (const handle of source.extensions()) track(handle);
  const stopChanges = source.onChange((change) =>
    change.type === "open" ? track(change.handle) : untrack(change.handle),
  );

  const resume = () => {
    active = undefined;
    running = undefined;
    launching = undefined;
    busy = false;
    if (!closed) catalog.reset();
  };
  const start = async (
    extensionName: string,
    commandName: string,
    configure: boolean,
    scope?: "extension" | "command",
  ) => {
    const handle = tracked.find((h) => manifests.get(h)?.name === extensionName);
    const manifest = handle && manifests.get(handle);
    const command = manifest?.commands.find((c) => c.name === commandName);
    if (!handle || !manifest || !command) return;
    busy = true;
    try {
      if (options.launch) {
        const { exited } = await options.launch({
          extension: handle,
          command: commandName,
          ...(configure ? { configure } : {}),
          ...(scope ? { scope } : {}),
        });
        void exited.then(resume, resume);
        return;
      }
      // Missing values and dependency installs are views of the flow, shown
      // in place of the root until the command (or nothing) takes over.
      const flow = startLaunchFlow(handle, commandName, {
        views: options.views,
        configure,
        ...(scope || options.configureScope
          ? { configureScope: scope ?? options.configureScope }
          : {}),
      });
      launching = flow;
      active = flow;
      const stopFlow = flow.subscribe(emit);
      const opened = await flow.opened;
      stopFlow();
      if (!opened) {
        resume();
        return;
      }
      if (closed) {
        await opened.close();
        return;
      }
      running = opened;
      const controller = createController({
        ...options.views,
        fallbackTitle: command.title,
        assetsDir: join(source.dirOf(handle) ?? "", "assets"),
      });
      active = { view: () => controller.view(), ...drive(opened, controller) };
      controller.subscribe(emit);
      emit(controller.view());
      void opened.session.exited.then(async () => {
        await opened.close();
        resume();
      });
    } catch (error) {
      resume();
      catalog.fail(
        `Could not open ${command.title}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return {
    view,
    subscribe(listener) {
      listeners.add(listener);
      listener(view());
      return () => listeners.delete(listener);
    },
    input(input) {
      if (closed) return;
      if (active) {
        active.input(input);
        return;
      }
      for (const effect of catalog.input(input).effects)
        if (!busy)
          void start(effect.extension, effect.command, effect.type === "configure", effect.scope);
    },
    async ready() {
      while (loads.size) await Promise.all(loads);
    },
    async close() {
      closed = true;
      stopChanges();
      for (const stop of watches.values()) stop();
      watches.clear();
      listeners.clear();
      launching?.cancel();
      await running?.close();
    },
  };
}
