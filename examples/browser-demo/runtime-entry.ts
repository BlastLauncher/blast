import {
  startBrowserRuntime,
  type BrowserMessagePort,
} from "../../packages/runtime/src/browser.ts";
import type { CommandModule } from "../../packages/runtime/src/core.ts";
import type { InitCommand } from "../../packages/protocol/src/index.ts";

let started = false;

/** Starts the real Blast runtime after the trusted host transfers a port. */
export type BrowserCommandLoader = (command: InitCommand) => Promise<CommandModule> | CommandModule;

export function start(loadCommand: BrowserCommandLoader): void {
  if (started) return;
  const begin = (port: BrowserMessagePort) => {
    if (started) return;
    started = true;
    startBrowserRuntime({ port, loadCommand });
  };
  const existing = (globalThis as Record<string, unknown>)["__blastPort"] as
    | BrowserMessagePort
    | undefined;
  if (existing) {
    begin(existing);
    return;
  }
  globalThis.addEventListener("message", (event: MessageEvent) => {
    if (event.data?.type !== "blast-port" || !event.ports?.[0]) return;
    begin(event.ports[0]);
  });
  const host = globalThis as typeof globalThis & {
    parent?: { postMessage(message: unknown, targetOrigin: string): void };
  };
  host.parent?.postMessage({ type: "blast-port-request" }, "*");
}
