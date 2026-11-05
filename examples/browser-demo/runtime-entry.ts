import {
  startBrowserRuntime,
  type BrowserMessagePort,
} from "../../packages/runtime/src/browser.ts";
import type { CommandModule } from "../../packages/runtime/src/core.ts";

let started = false;

/** Starts the real Blast runtime after the trusted host transfers a port. */
export function start(command: CommandModule): void {
  if (started) return;
  const begin = (port: BrowserMessagePort) => {
    if (started) return;
    started = true;
    startBrowserRuntime({ port, command });
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
  globalThis.parent?.postMessage({ type: "blast-port-request" }, "*");
}
