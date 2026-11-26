import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ControllerInput, ControllerResult, ControllerView } from "@blastlauncher/client-core";
import { bundleCommand, createBroker, startCommand, type Session } from "../../host/src/index.ts";
import type { RuntimeMessage, SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { Action, ActionPanel, Detail, List, useNavigation } from "../../runtime/src/api/index.ts";
import { NavigationProvider } from "../../runtime/src/api/navigation.ts";
import { startBrowserRuntime, type BrowserMessagePort } from "../../runtime/src/browser.ts";
import { createSceneRoot } from "../../runtime/src/reconciler/index.ts";
import { sha256Hex } from "./bundles.ts";

// Resolve React from packages/runtime so hooks share the exact reconciler instance.
const runtimeRequire = createRequire(new URL("../../runtime/package.json", import.meta.url));
const { createElement: h, useState } = runtimeRequire("react") as {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): never;
  useState<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void];
};

// session.ts is browser-typed (tsconfig.browser.json); load it without pulling it into the Node typecheck.
const sessionModule = "./session.ts";
type WebStatus = { text: string; error?: boolean; progress?: boolean };
type WebView =
  | ControllerView
  | { type: "loading"; extension?: string; command?: string }
  | { type: "error"; message: string };
type WebMount = {
  close(): void;
  input(value: ControllerInput): ControllerResult | undefined;
  view(): ControllerView | undefined;
};
const { startSession } = (await import(sessionModule)) as {
  startSession(
    element: unknown,
    options: {
      extension: string;
      command: string;
      sandboxUrl: string;
      assetsUrl: string;
      bundlesUrl: string;
      render(
        view: WebView,
        input: (value: ControllerInput) => ControllerResult | undefined,
        frame: { scene?: SceneMessage; status: WebStatus },
      ): void;
      onStatus?(status: WebStatus): void;
    },
  ): WebMount;
};

type SandboxHook = {
  onPort(port: BrowserMessagePort): void;
  onTerminate(): void;
};
const HOOKS_KEY = "__blastWebSessionTestHooks";

const directories: string[] = [];
const sessions: Session[] = [];
const mounts: WebMount[] = [];
let restoreEnv: (() => void) | undefined;

afterEach(async () => {
  for (const mount of mounts.splice(0)) mount.close();
  await Promise.all(sessions.splice(0).map((session) => session.shutdown({ timeoutMs: 20 })));
  restoreEnv?.();
  restoreEnv = undefined;
  delete (globalThis as Record<string, unknown>)[HOOKS_KEY];
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function waitFor<T>(check: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Sets up minimal browser globals (`window`, `navigator`, `fetch`) and a fake `almostnode.mjs`. */
async function setupWebHarness(extensionName: string, hook: SandboxHook) {
  const dir = await mkdtemp(join(tmpdir(), "blast-web-session-"));
  directories.push(dir);
  const sandboxUrl = `https://sandbox.test.invalid/${Math.random().toString(36).slice(2)}`;
  const bundlesBase = `https://bundles.test.invalid/${Math.random().toString(36).slice(2)}`;
  const hooks = ((globalThis as Record<string, unknown>)[HOOKS_KEY] ??= new Map<
    string,
    SandboxHook
  >()) as Map<string, SandboxHook>;
  hooks.set(sandboxUrl, hook);

  const bundlePath = `bundles/${extensionName}/index.js`;
  const bundleCode = "// stub bundle executed by test hook\n";
  const bundleBytes = new TextEncoder().encode(bundleCode);
  const bundleHash = await sha256Hex(bundleBytes.buffer);
  const indexJson = JSON.stringify({
    version: 1,
    buildSha: "test-sha",
    bundles: {
      [`${extensionName}/index`]: {
        path: bundlePath,
        bytes: bundleBytes.byteLength,
        sha256: bundleHash,
        manifest: {
          name: extensionName,
          preferences: [],
          commands: { index: [] },
          modes: { index: "view" },
        },
      },
    },
  });

  await writeFile(
    join(dir, "almostnode.mjs"),
    `
    export class VirtualFS {}
    export async function createRuntime(_vfs, options) {
      const hooks = globalThis[${JSON.stringify(HOOKS_KEY)}];
      const hook = hooks.get(options.sandbox);
      const frameWindow = {
        postMessage(data, _origin, transfer) {
          if (data?.type === "blast-port" && transfer?.[0]) {
            hook.onPort(transfer[0]);
          }
        },
      };
      return {
        iframe: {
          contentWindow: frameWindow,
          setAttribute() {},
          remove() {},
        },
        terminate() {
          hook.onTerminate();
        },
        async execute(_code, filename) {
          if (filename?.endsWith("/bundle.cjs")) {
            globalThis.window.dispatchMessage({
              data: { type: "blast-port-request" },
              source: frameWindow,
            });
          }
        },
      };
    }
    `,
  );

  const messageListeners = new Set<(event: unknown) => void>();
  const fakeWindow = {
    addEventListener(type: string, listener: (event: unknown) => void) {
      if (type === "message") messageListeners.add(listener);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      if (type === "message") messageListeners.delete(listener);
    },
    dispatchMessage(event: unknown) {
      for (const listener of messageListeners) listener(event);
    },
  };
  const originalWindow = (globalThis as Record<string, unknown>)["window"];
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalFetch = globalThis.fetch;

  (globalThis as Record<string, unknown>)["window"] = fakeWindow;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { platform: "MacIntel" },
  });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === `${bundlesBase}/bundles.json`) {
      return new Response(indexJson, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === `${bundlesBase}/${bundlePath}`) {
      return new Response(bundleCode, { status: 200 });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof fetch;

  restoreEnv = () => {
    if (originalWindow === undefined) delete (globalThis as Record<string, unknown>)["window"];
    else (globalThis as Record<string, unknown>)["window"] = originalWindow;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    globalThis.fetch = originalFetch;
  };

  return {
    sandboxUrl,
    assetsUrl: pathToFileURL(`${dir}/`).href,
    bundlesUrl: `${bundlesBase}/bundles.json`,
  };
}

/** Multi-commit fixture exercising prop edits, reorders/insert/remove, and navigation push/pop. */
function MultiCommitCommand() {
  const [step, setStep] = useState(0);
  const { push, pop } = useNavigation();
  const advance = () => {
    if (step === 2) {
      push(
        h(Detail, {
          navigationTitle: "Pushed Detail",
          markdown: "# Step 3",
          actions: h(ActionPanel, null, h(Action, { title: "Back", onAction: () => pop() })),
        }),
      );
      return;
    }
    setStep((value) => value + 1);
  };
  const items =
    step === 0
      ? [
          { key: "a", title: "Alpha" },
          { key: "b", title: "Beta" },
          { key: "c", title: "Gamma" },
        ]
      : step === 1
        ? [
            { key: "a", title: "Alpha-2" },
            { key: "b", title: "Beta" },
            { key: "c", title: "Gamma" },
          ]
        : [
            { key: "c", title: "Gamma" },
            { key: "d", title: "Delta" },
            { key: "a", title: "Alpha-2" },
          ];
  return h(
    List,
    { navigationTitle: `step:${step}`, isLoading: step === 0 },
    items.map((item) =>
      h(List.Item, {
        key: item.key,
        title: item.title,
        actions: h(ActionPanel, null, h(Action, { title: "Advance", onAction: advance })),
      }),
    ),
  );
}

const multiCommitSource = `
import { Action, ActionPanel, Detail, List, useNavigation } from "@raycast/api";
import { useState } from "react";

export default function MultiCommitCommand() {
  const [step, setStep] = useState(0);
  const { push, pop } = useNavigation();
  const advance = () => {
    if (step === 2) {
      push(
        <Detail
          navigationTitle="Pushed Detail"
          markdown="# Step 3"
          actions={
            <ActionPanel>
              <Action title="Back" onAction={() => pop()} />
            </ActionPanel>
          }
        />,
      );
      return;
    }
    setStep((value) => value + 1);
  };
  const items =
    step === 0
      ? [
          { key: "a", title: "Alpha" },
          { key: "b", title: "Beta" },
          { key: "c", title: "Gamma" },
        ]
      : step === 1
        ? [
            { key: "a", title: "Alpha-2" },
            { key: "b", title: "Beta" },
            { key: "c", title: "Gamma" },
          ]
        : [
            { key: "c", title: "Gamma" },
            { key: "d", title: "Delta" },
            { key: "a", title: "Alpha-2" },
          ];
  return (
    <List navigationTitle={\`step:\${step}\`} isLoading={step === 0}>
      {items.map((item) => (
        <List.Item
          key={item.key}
          title={item.title}
          actions={
            <ActionPanel>
              <Action title="Advance" onAction={advance} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
`;

function findAction(node: SceneNode, title: string): { id: string; handler: string } | undefined {
  if (
    node.props.title === title &&
    typeof node.props.onAction === "object" &&
    node.props.onAction
  ) {
    const ref = node.props.onAction as { $handler?: unknown };
    if (typeof ref.$handler === "string") return { id: node.id, handler: ref.$handler };
  }
  for (const child of node.children) {
    const found = findAction(child, title);
    if (found) return found;
  }
  return undefined;
}

test("web session applies scene.patch and matches both the Node host and reconciler full scenes", async () => {
  // 1. Reconciler full scenes (no publishPatch).
  const fullScenes: SceneMessage[] = [];
  const fullRoot = createSceneRoot({
    publish: (snapshot) => fullScenes.push({ type: "scene", ...snapshot }),
  });
  fullRoot.render(h(NavigationProvider, { children: h(MultiCommitCommand) }));
  for (const title of ["Advance", "Advance", "Advance", "Back"]) {
    const target = findAction(fullScenes.at(-1)!.root!, title)!;
    fullRoot.dispatch(target.id, target.handler, []);
    fullRoot.flush();
  }
  fullRoot.unmount();
  const expectedScenes = fullScenes.slice(0, 5);
  expect(expectedScenes.map((scene) => scene.revision)).toEqual([1, 2, 3, 4, 5]);

  // 2. Node host scenes (via startCommand).
  const extDir = await mkdtemp(join(tmpdir(), "blast-multi-commit-"));
  directories.push(extDir);
  await mkdir(join(extDir, "src"), { recursive: true });
  await writeFile(
    join(extDir, "package.json"),
    JSON.stringify({
      name: "multi-commit",
      commands: [{ name: "index", title: "Multi Commit", mode: "view" }],
    }),
  );
  await writeFile(join(extDir, "src/index.tsx"), multiCommitSource);
  const bundled = await bundleCommand({
    extensionDir: extDir,
    command: "index",
    outDir: join(extDir, "out"),
  });
  const nodeSession = await startCommand({ ...bundled, broker: createBroker() });
  sessions.push(nodeSession);
  const nodeScenes: SceneMessage[] = [];
  nodeSession.scenes((scene) => nodeScenes.push(scene));
  await waitFor(() => (nodeScenes.length >= 1 ? true : undefined));
  for (let step = 0; step < 4; step++) {
    const title = step < 3 ? "Advance" : "Back";
    const target = findAction(nodeScenes.at(-1)!.root!, title)!;
    nodeSession.sendEvent(target.id, target.handler, []);
    await waitFor(() => (nodeScenes.length >= step + 2 ? true : undefined));
  }
  expect(nodeScenes).toEqual(expectedScenes);

  // 3. Web session (startSession + real startBrowserRuntime over MessageChannel).
  const wireSceneTypes: string[] = [];
  let stopBrowserRuntime: (() => void) | undefined;
  const harness = await setupWebHarness("multi-commit", {
    onPort(port) {
      const wrappedPort: BrowserMessagePort = {
        postMessage(message: unknown) {
          const typed = message as { type?: string };
          if (typed.type === "scene" || typed.type === "scene.patch") {
            wireSceneTypes.push(typed.type);
          }
          port.postMessage(message);
        },
        addEventListener: (type, listener) => port.addEventListener(type, listener),
        removeEventListener: (type, listener) => port.removeEventListener?.(type, listener),
        start: () => port.start?.(),
      };
      stopBrowserRuntime = startBrowserRuntime({
        port: wrappedPort,
        loadCommand: () => ({ default: MultiCommitCommand }),
      });
    },
    onTerminate() {
      stopBrowserRuntime?.();
    },
  });

  const webScenes: SceneMessage[] = [];
  const mount = startSession(
    {},
    {
      extension: "raycast/extensions/multi-commit",
      command: "index",
      ...harness,
      render(_view, _input, frame) {
        if (frame.scene && frame.scene.revision !== webScenes.at(-1)?.revision) {
          webScenes.push(frame.scene);
        }
      },
    },
  );
  mounts.push(mount);

  await waitFor(() => (webScenes.length >= 1 ? true : undefined));
  for (let step = 0; step < 4; step++) {
    mount.input({ type: "primary" });
    await waitFor(() => (webScenes.length >= step + 2 ? true : undefined));
  }

  expect(wireSceneTypes).toEqual([
    "scene",
    "scene.patch",
    "scene.patch",
    "scene.patch",
    "scene.patch",
  ]);
  expect(webScenes).toEqual(nodeScenes);
  expect(webScenes).toEqual(expectedScenes);
});

for (const badRevision of [3, 1]) {
  test(`web session rejects scene.patch with revision ${badRevision} !== baseRevision + 1 with PROTOCOL_ERROR`, async () => {
    let runtimePort: BrowserMessagePort | undefined;
    let terminated = false;
    const harness = await setupWebHarness("bad-patch", {
      onPort(port) {
        runtimePort = port;
        port.start?.();
        port.addEventListener("message", (event: { data: unknown }) => {
          const message = event.data as { type?: string };
          if (message.type === "init") {
            port.postMessage({ type: "ready", protocol: 1 } satisfies RuntimeMessage);
            port.postMessage({
              type: "scene",
              revision: 1,
              root: { id: "1", type: "List", props: { navigationTitle: "ok" }, children: [] },
            } satisfies RuntimeMessage);
          }
        });
      },
      onTerminate() {
        terminated = true;
      },
    });

    const views: WebView[] = [];
    const statuses: WebStatus[] = [];
    const mount = startSession(
      {},
      {
        extension: "raycast/extensions/bad-patch",
        command: "index",
        ...harness,
        render(view) {
          views.push(view);
        },
        onStatus(status) {
          statuses.push(status);
        },
      },
    );
    mounts.push(mount);

    await waitFor(() => (mount.view() ? true : undefined));
    expect(statuses.at(-1)).toEqual({ text: "Ready" });

    const badPatch: RuntimeMessage = {
      type: "scene.patch",
      revision: badRevision,
      baseRevision: 1,
      ops: [],
    };
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    runtimePort!.postMessage(badPatch);

    await waitFor(() => (terminated ? true : undefined));
    expect(mount.view()).toBeUndefined();
    expect(statuses.at(-1)).toEqual({
      text: expect.stringContaining("PROTOCOL_ERROR"),
      error: true,
    });
    expect(views.at(-1)).toEqual({
      type: "error",
      message: expect.stringContaining("PROTOCOL_ERROR"),
    });
  });
}
