import type { InitCommand, RuntimeMessage } from "@blastlauncher/protocol";
import { startRuntime, type CommandModule } from "./core.ts";

export type BrowserMessagePort = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: any) => void): void;
  removeEventListener?(type: "message", listener: (event: any) => void): void;
  start?(): void;
};
export type BrowserRuntimeOptions = {
  port: BrowserMessagePort;
  /** A pre-evaluated command module, or a loader for the init command. */
  command?: CommandModule;
  loadCommand?: (command: InitCommand) => Promise<CommandModule> | CommandModule;
};
export type BrowserExitMessage = { type: "exit"; code: number };

/* oxlint-disable unicorn/consistent-function-scoping */
export function startBrowserRuntime(options: BrowserRuntimeOptions): () => void {
  if (!options.command && !options.loadCommand)
    throw new Error("Browser runtime requires command or loadCommand");
  const loadCommand = options.loadCommand ?? (() => options.command!);
  let removeListener: (() => void) | undefined;
  let receive: (value: unknown) => void = () => {};
  const listener = (event: { data: unknown }) => receive(event.data);
  const runtime = startRuntime({
    send(message: RuntimeMessage) {
      // MessagePort has no target-origin argument; this is already scoped to the port.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      options.port.postMessage(message);
    },
    onMessage(onMessage) {
      receive = onMessage;
      options.port.addEventListener("message", listener);
      removeListener = () => options.port.removeEventListener?.("message", listener);
      options.port.start?.();
      return () => removeListener?.();
    },
    exit(code) {
      // MessagePort has no target-origin argument; this is already scoped to the port.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      options.port.postMessage({ type: "exit", code } satisfies BrowserExitMessage);
      removeListener?.();
    },
    loadCommand,
  });
  return () => runtime();
}
