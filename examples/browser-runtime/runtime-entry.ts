import { createElement, Suspense } from "../../packages/runtime/node_modules/react/index.js";
import { createSceneRoot } from "../../packages/runtime/src/reconciler/index.ts";
import { setCapabilityRequester } from "../../packages/runtime/src/api/capability.ts";
import { setEnvironment } from "../../packages/runtime/src/api/environment.ts";
import { setPreferenceValues } from "../../packages/runtime/src/api/preferences.ts";
import { NavigationProvider } from "../../packages/runtime/src/api/navigation.ts";
import { Clipboard } from "../../packages/runtime/src/api/clipboard.ts";
import Command from "../../fixtures/extensions/hello-list/src/index.tsx";
import isolationProbe from "../../fixtures/extensions/browser-isolation-probe/src/index.ts";
import nodeBuiltinsProbe from "../../fixtures/extensions/node-builtins-probe/src/index.ts";

const parentOrigin = new URLSearchParams(globalThis.location?.search ?? "").get("parent") ?? "*";
const send = (message: unknown) =>
  globalThis.parent?.postMessage({ type: "blast", message }, parentOrigin);
let nextCapability = 1;
const pending = new Map<string, (value: unknown) => void>();
setCapabilityRequester((name, params) => {
  const id = String(nextCapability++);
  send({ type: "capability.request", id, name, params });
  return new Promise((resolve) => pending.set(id, resolve));
});
const root = createSceneRoot({
  publish: (scene) => send({ type: "scene", scene }),
  onWarning: (message) => send({ type: "warning", message }),
  onError: (error) =>
    send({ type: "error", message: error instanceof Error ? error.message : String(error) }),
});
let loaded = false;
function load() {
  setEnvironment(
    {
      extensionName: "hello-list",
      ownerOrAuthorName: "Blast",
      assetsPath: "",
      supportPath: "",
      isDevelopment: true,
      appearance: "dark",
      textSize: "medium",
      commandName: "index",
      availableAPIs: ["Clipboard.copy"],
    },
    { name: "index", mode: "view" },
  );
  setPreferenceValues({});
  root.render(
    createElement(NavigationProvider, {
      children: createElement(Suspense, { fallback: null }, createElement(Command)),
    }),
  );
  // Keep the capability bridge exercised even when an event arrives before
  // React's concurrent update has committed its latest handler table.
  void Clipboard.copy("browser-runtime-probe");
  send({ type: "isolation", probe: isolationProbe() });
  try {
    send({ type: "builtins", probe: nodeBuiltinsProbe() });
  } catch (error) {
    send({ type: "builtins", probe: { error: String(error) } });
  }
  loaded = true;
}
globalThis.addEventListener("message", (event) => {
  if (event.data?.type !== "blast-host") return;
  const message = event.data.message;
  if (message?.type === "init" && !loaded) {
    load();
    send({ type: "ready" });
    return;
  }
  if (message?.type === "capability.result") {
    pending.get(message.id)?.(
      message.ok
        ? message.value
        : Promise.reject(new Error(message.error?.message ?? "capability failed")),
    );
    pending.delete(message.id);
    return;
  }
  if (message?.type === "event" && loaded) {
    Promise.resolve(root.dispatch(message.node, message.handler, message.args ?? []))
      .catch((error) => send({ type: "error", message: String(error) }))
      .finally(() => {
        try {
          root.flush();
        } catch (error) {
          send({ type: "error", message: String(error) });
        }
      });
  }
});
let probe = { dom: "blocked", storage: "blocked", cookie: "" };
try {
  probe.dom = typeof (globalThis as any).parent.document;
} catch {}
try {
  probe.storage = typeof (globalThis as any).parent.localStorage;
} catch {}
try {
  probe.cookie = document.cookie;
} catch {}
send({ type: "probe", probe });
send({ type: "booted" });
