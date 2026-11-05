import { expect, test } from "bun:test";
import type { HostMessage, InitEnvironment, RuntimeMessage } from "@blastlauncher/protocol";
import { Action, ActionPanel, List } from "./api/index.ts";
import { startBrowserRuntime } from "./browser.ts";
import { MessageChannel } from "node:worker_threads";
import { createElement, useState } from "react";

const environment: InitEnvironment = {
  extensionName: "hello-list",
  commandName: "index",
  ownerOrAuthorName: "Blast",
  assetsPath: "",
  supportPath: "",
  isDevelopment: true,
  appearance: "dark",
  textSize: "medium",
};
const command = {
  default() {
    const [search, setSearch] = useState("");
    const [copied, setCopied] = useState("");
    const fruits = ["apple", "banana", "cherry"].filter((fruit) => fruit.includes(search));
    return createElement(
      List,
      {
        navigationTitle: copied || "hello-list",
        searchText: search,
        onSearchTextChange: setSearch,
      },
      fruits.map((fruit) =>
        createElement(List.Item, {
          key: fruit,
          title: fruit,
          actions: createElement(
            ActionPanel,
            null,
            createElement(Action.CopyToClipboard, {
              title: `Copy ${fruit}`,
              content: fruit,
              onCopy: () => setCopied(fruit),
            }),
          ),
        }),
      ),
    );
  },
};

function start() {
  const channels = new MessageChannel();
  const messages: RuntimeMessage[] = [];
  channels.port1.start();
  channels.port1.addEventListener("message", (event: any) => messages.push(event.data));
  const stop = startBrowserRuntime({
    port: channels.port2,
    loadCommand: () => command,
  });
  const send = (message: HostMessage) => channels.port1.postMessage(message);
  const next = async (type: string): Promise<any> => {
    for (;;) {
      const found = messages.findIndex((message) => message.type === type);
      if (found >= 0) return messages.splice(found, 1)[0];
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { channels, messages, send, next, stop };
}

function init(): HostMessage {
  return {
    type: "init",
    protocol: 1,
    command: { extension: "hello-list", name: "index", entry: "ignored", mode: "view" },
    preferences: {},
    environment,
  };
}
function find(node: any, predicate: (node: any) => boolean): any {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

test("browser runtime renders, dispatches search and answers clipboard", async () => {
  const runtime = start();
  runtime.send(init());
  expect(await runtime.next("ready")).toEqual({ type: "ready", protocol: 1 });
  const first = await runtime.next("scene");
  const list = find(first.root, (node) => node.type === "List");
  const search = list.props.searchText as string;
  const searchHandler = list.props.onSearchTextChange as { $handler: string };
  runtime.send({ type: "event", node: list.id, handler: searchHandler.$handler, args: ["ban"] });
  const filtered = await runtime.next("scene");
  const filteredItems: any[] = [];
  const collectItems = (node: any) => {
    if (node.type === "List.Item") filteredItems.push(node);
    for (const child of node.children ?? []) collectItems(child);
  };
  collectItems(filtered.root);
  expect(filteredItems.map((child) => child.props.title)).toEqual(["banana"]);
  expect(search).toBe("");

  const item = filteredItems[0]!;
  const copy = find(item, (node) => typeof node.props.onAction === "object");
  const handler = copy.props.onAction as { $handler: string };
  runtime.send({ type: "event", node: copy.id, handler: handler.$handler, args: [] });
  const request = await runtime.next("capability.request");
  expect(request.name).toBe("clipboard.copy");
  expect(request.params).toEqual({ text: "banana" });
  runtime.send({ type: "capability.result", id: request.id, ok: true, value: null });
  const copied = await runtime.next("scene");
  expect(find(copied.root, (node) => node.type === "List").props.navigationTitle).toBe("banana");
  runtime.send({ type: "shutdown" });
  expect(await runtime.next("exit")).toEqual({ type: "exit", code: 0 });
  expect(runtime.messages).toEqual([{ type: "scene", revision: expect.any(Number), root: null }]);
  runtime.stop();
  runtime.channels.port1.close();
});

test("browser runtime reports a thrown render error", async () => {
  const runtime = start();
  const throwing = {
    default: () => {
      throw new Error("render failed");
    },
  };
  runtime.stop();
  runtime.channels.port1.close();
  const channel = new MessageChannel();
  const messages: RuntimeMessage[] = [];
  channel.port1.start();
  channel.port1.addEventListener("message", (event: any) => messages.push(event.data));
  startBrowserRuntime({ port: channel.port2, loadCommand: () => throwing });
  channel.port1.postMessage(init());
  while (!messages.some((message) => message.type === "error"))
    await new Promise((resolve) => setTimeout(resolve, 0));
  expect(messages.find((message) => message.type === "error")).toMatchObject({
    fatal: true,
    message: "render failed",
  });
  channel.port1.close();
});

test("browser entry bundles without Node imports", async () => {
  const result = await Bun.build({
    entrypoints: [new URL("./browser.ts", import.meta.url).pathname],
    target: "browser",
  });
  expect(result.success).toBe(true);
  expect(result.logs.filter((log) => log.level === "error")).toEqual([]);
});
