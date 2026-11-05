import {
  parseHostMessage,
  PROTOCOL_VERSION,
  type HostMessage,
  type InitCommand,
  type JsonValue,
  type LogLevel,
  type RuntimeMessage,
} from "@blastlauncher/protocol";
import { createElement, Suspense, type ComponentType, type ReactNode } from "react";
import { createModelProvider } from "./provider.ts";
import { setCapabilityRequester } from "./api/capability.ts";
import { setRuntimeLogSink } from "./api/diagnostics.ts";
import { setEnvironment } from "./api/environment.ts";
import { setFeedbackMount } from "./api/feedback.ts";
import { decodeFormValues, flushFormPersistence, setFormDraftValues } from "./api/form.ts";
import { LaunchType, type LaunchProps } from "./api/launch.ts";
import { NavigationProvider } from "./api/navigation.ts";
import { setPreferenceValues } from "./api/preferences.ts";
import { setRenderMount } from "./api/legacy.ts";
import { UnsupportedApiError } from "./api/unsupported.ts";
import { createSceneRoot } from "./reconciler/index.ts";

export type CommandModule = {
  default?: (props: LaunchProps) => unknown;
  getModels?: unknown;
  streamCompletion?: unknown;
};

export type RuntimeOptions = {
  send(message: RuntimeMessage): void;
  onMessage(listener: (value: unknown) => void): () => void;
  exit(code: number): void;
  loadCommand(command: InitCommand): Promise<CommandModule> | CommandModule;
  log?(level: LogLevel, args: unknown[]): void;
};

export type RuntimeController = (() => void) & { fatal(error: unknown, code?: string): void };

/* oxlint-disable unicorn/consistent-function-scoping */
export function startRuntime(options: RuntimeOptions): RuntimeController {
  let provider: ReturnType<typeof createModelProvider> | undefined;
  let providerLoad: Promise<void> | undefined;
  let stopping = false;
  let initialized = false;
  let loaded = false;
  let nextRequest = 1;
  const pending = new Map<
    string,
    {
      resolve(value: JsonValue): void;
      reject(error: Error): void;
      progress?(value: JsonValue): void;
      cleanup(): void;
    }
  >();

  const send = (message: RuntimeMessage) => {
    if (!stopping) options.send(message);
  };
  const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);
  const log = (level: LogLevel, args: unknown[]) => {
    if (options.log) options.log(level, args);
    else send({ type: "log", level, message: args.map(String).join(" ") });
  };
  const finish = (code: number) => {
    if (stopping) return;
    stopping = true;
    setCapabilityRequester(undefined);
    pending.clear();
    options.exit(code);
  };
  const fatal = (error: unknown, code = "RUNTIME_ERROR") => {
    send({
      type: "error",
      code: error instanceof UnsupportedApiError ? error.code : code,
      message: errorMessage(error),
      fatal: true,
    });
    finish(1);
  };
  const root = createSceneRoot({
    publish: (scene) => send({ type: "scene", ...scene }),
    onWarning: (message) => log("warn", [message]),
    onError: fatal,
  });
  setCapabilityRequester((name, params, requestOptions = {}) => {
    if (requestOptions.signal?.aborted)
      return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
    const id = String(nextRequest++);
    return new Promise((resolve, reject) => {
      const abort = () => {
        reject(new DOMException("The operation was aborted", "AbortError"));
        send({ type: "capability.cancel", id });
      };
      pending.set(id, {
        resolve,
        reject,
        progress: (value) => {
          if (!requestOptions.signal?.aborted) requestOptions.onProgress?.(value);
        },
        cleanup: () => requestOptions.signal?.removeEventListener("abort", abort),
      });
      requestOptions.signal?.addEventListener("abort", abort, { once: true });
      send({ type: "capability.request", id, name, params });
    });
  });
  setRuntimeLogSink((level, message) => log(level, [message]));

  function loadingFallback(mode: Extract<HostMessage, { type: "init" }>["command"]["mode"]) {
    return mode === "menu-bar"
      ? createElement("MenuBarExtra", { isLoading: true })
      : createElement("List", { isLoading: true });
  }
  function withSuspense(
    element: ReactNode,
    mode: Extract<HostMessage, { type: "init" }>["command"]["mode"],
  ) {
    return createElement(Suspense, { fallback: loadingFallback(mode) }, element);
  }
  function launchProps(command: InitCommand): LaunchProps {
    return {
      arguments: command.arguments ?? {},
      launchType: LaunchType.UserInitiated,
      ...(command.draftValues === undefined
        ? {}
        : { draftValues: decodeFormValues(command.draftValues) }),
      ...(command.fallbackText === undefined ? {} : { fallbackText: command.fallbackText }),
      ...(command.launchContext === undefined ? {} : { launchContext: command.launchContext }),
    };
  }
  async function load(message: Extract<HostMessage, { type: "init" }>) {
    setEnvironment(message.environment, message.command);
    setPreferenceValues(message.preferences);
    const props = launchProps(message.command);
    setFormDraftValues(props.draftValues);
    let rendered = false;
    setRenderMount((element) => {
      if (rendered) return;
      rendered = true;
      root.render(
        message.command.mode === "menu-bar"
          ? withSuspense(element, message.command.mode)
          : createElement(NavigationProvider, {
              children: withSuspense(element, message.command.mode),
            }),
      );
      loaded = true;
    });
    const command = await options.loadCommand(message.command);
    setRenderMount(undefined);
    if (stopping) return;
    if (rendered) return;
    if (message.command.mode === "model-provider") {
      provider = createModelProvider(command as Parameters<typeof createModelProvider>[0], send);
      return;
    }
    if (message.command.mode === "no-view") {
      setFeedbackMount(() => {
        if (!loaded) {
          loaded = true;
          root.render(createElement(NavigationProvider, { children: null }));
        }
      });
      await (command.default as (props: LaunchProps) => unknown)(props);
      if (stopping) return;
      finish(0);
      return;
    }
    let running = false;
    function Command() {
      if (running) return null;
      const result: unknown = command.default?.(props);
      if (
        result !== null &&
        (typeof result === "object" || typeof result === "function") &&
        "then" in result &&
        typeof result.then === "function"
      ) {
        running = true;
        void Promise.resolve(result).then(() => finish(0), fatal);
        return null;
      }
      return result as ReactNode;
    }
    const wrap =
      message.command.mode === "view" &&
      typeof command.default === "function" &&
      !command.default.prototype?.isReactComponent;
    const element = createElement(
      wrap ? Command : (command.default as ComponentType<LaunchProps>),
      props,
    );
    const suspended = withSuspense(element, message.command.mode);
    root.render(
      message.command.mode === "menu-bar"
        ? suspended
        : createElement(NavigationProvider, { children: suspended }),
    );
    loaded = true;
  }
  function shutdown() {
    if (stopping) return;
    try {
      root.unmount();
      void flushFormPersistence().then(() => finish(0), fatal);
    } catch (error) {
      fatal(error);
    }
  }
  function handle(value: unknown) {
    if (stopping) return;
    const parsed = parseHostMessage(value);
    if (!parsed.ok) return fatal(parsed.error, "PROTOCOL_ERROR");
    const message = parsed.message;
    if (!initialized) {
      if (message.type !== "init" || message.protocol !== PROTOCOL_VERSION)
        return fatal(`Expected init with protocol ${PROTOCOL_VERSION}`, "PROTOCOL_ERROR");
      initialized = true;
      send({ type: "ready", protocol: PROTOCOL_VERSION });
      providerLoad = load(message);
      void providerLoad.catch(fatal);
      return;
    }
    switch (message.type) {
      case "provider.getModels":
      case "provider.stream":
      case "provider.abort":
        void providerLoad
          ?.then(() => {
            if (!provider) return fatal("Provider request in command session", "PROTOCOL_ERROR");
            provider.handle(message);
          })
          .catch(fatal);
        return;
      case "init":
        return fatal("Duplicate init", "PROTOCOL_ERROR");
      case "shutdown":
        return shutdown();
      case "capability.progress": {
        const request = pending.get(message.id);
        if (!request) return fatal(`Unknown capability id: ${message.id}`, "PROTOCOL_ERROR");
        request.progress?.(message.value);
        return;
      }
      case "capability.result": {
        const request = pending.get(message.id);
        if (!request) return fatal(`Unknown capability id: ${message.id}`, "PROTOCOL_ERROR");
        pending.delete(message.id);
        request.cleanup();
        if (message.ok) request.resolve(message.value);
        else
          request.reject(
            Object.assign(new Error(message.error.message), { code: message.error.code }),
          );
        return;
      }
      case "event": {
        if (!loaded) return fatal("Event before command loaded", "PROTOCOL_ERROR");
        const failed = (error: unknown) => {
          if (error instanceof UnsupportedApiError) fatal(error);
          else
            send({
              type: "error",
              code: "EVENT_ERROR",
              message: errorMessage(error),
              fatal: false,
            });
        };
        try {
          void Promise.resolve(root.dispatch(message.node, message.handler, message.args)).catch(
            failed,
          );
        } catch (error) {
          failed(error);
        }
        try {
          root.flush();
        } catch (error) {
          fatal(error);
        }
      }
    }
  }
  const remove = options.onMessage(handle);
  const controller = (() => {
    remove();
    shutdown();
  }) as RuntimeController;
  controller.fatal = fatal;
  return controller;
}
