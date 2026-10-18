import { afterEach, expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import {
  Action,
  ActionPanel,
  CopyToClipboardAction,
  PasteAction,
  Detail,
  Icon,
  Keyboard,
} from "./index.ts";
import * as implemented from "./implemented.ts";

function setup() {
  let scene: SceneSnapshot;
  const root = createSceneRoot({
    publish: (next) => {
      scene = next;
    },
  });
  return { root, latest: () => scene.root! };
}

afterEach(() => setCapabilityRequester(undefined));

// @covers Action.OpenInBrowser
// @covers Action.OpenInBrowser.Props.url
// @covers Action.OpenInBrowser.Props.title
// @covers Action.OpenInBrowser.Props.icon
// @covers Action.OpenInBrowser.Props.shortcut
// @covers Action.OpenInBrowser.Props.onOpen
test("OpenInBrowser keeps URL private, requests open.url, and calls onOpen after success", async () => {
  const { root, latest } = setup();
  const events: unknown[] = [];
  setCapabilityRequester(async (name, params) => {
    events.push([name, params]);
    return null;
  });
  const url = "https://example.com/private";
  root.render(h(Action.OpenInBrowser, { url, onOpen: (opened: string) => events.push(opened) }));
  expect(latest().type).toBe("Action.OpenInBrowser");
  expect(latest().props).toEqual({
    title: "Open in Browser",
    icon: Icon.Globe,
    onAction: { $handler: "onAction" },
  });
  expect(events).toEqual([]);
  await root.dispatch(latest().id, "onAction", []);
  expect(events).toEqual([["open.url", { url }], url]);
  root.render(
    h(Action.OpenInBrowser, {
      url,
      title: "Docs",
      icon: Icon.Book,
      shortcut: Keyboard.Shortcut.Common.Open,
    }),
  );
  expect(latest().props).toEqual({
    title: "Docs",
    icon: Icon.Book,
    shortcut: Keyboard.Shortcut.Common.Open,
    onAction: { $handler: "onAction" },
  });
  root.unmount();
});

// @covers Action.Paste partial
// @covers Action.Paste.Props.content partial
// @covers Action.Paste.Props.title
// @covers Action.Paste.Props.icon
// @covers Action.Paste.Props.shortcut
// @covers Action.Paste.Props.onPaste
test("Paste keeps content private and calls onPaste after clipboard.paste succeeds", async () => {
  const { root, latest } = setup();
  const events: unknown[] = [];
  setCapabilityRequester(async (name, params) => {
    events.push([name, params]);
    return null;
  });
  for (const [content, text] of [
    ["text", "text"],
    [42, "42"],
    [{ text: "structured" }, "structured"],
  ] as const) {
    root.render(h(Action.Paste, { content, onPaste: (pasted: unknown) => events.push(pasted) }));
    expect(latest().type).toBe("Action.Paste");
    expect(latest().props).toEqual({
      title: "Paste in Active App",
      icon: Icon.Clipboard,
      onAction: { $handler: "onAction" },
    });
    await root.dispatch(latest().id, "onAction", []);
    expect(events.splice(0)).toEqual([["clipboard.paste", { text }], content]);
  }
  root.render(
    h(Action.Paste, {
      content: "secret",
      title: "Insert",
      icon: Icon.Book,
      shortcut: Keyboard.Shortcut.Common.Copy,
    }),
  );
  expect(latest().props).toEqual({
    title: "Insert",
    icon: Icon.Book,
    shortcut: Keyboard.Shortcut.Common.Copy,
    onAction: { $handler: "onAction" },
  });
  for (const content of [{ file: "/tmp/file" }, { html: "<b>rich</b>" }]) {
    root.render(h(Action.Paste, { content }));
    await expect(root.dispatch(latest().id, "onAction", [])).rejects.toThrow(
      "Action.Paste: unsupported content in Blast",
    );
  }
  expect(events).toEqual([]);
  root.unmount();
});

test("denied or failed capabilities reject without invoking action callbacks", async () => {
  const { root, latest } = setup();
  for (const reason of ["denied", "failed"]) {
    setCapabilityRequester(() => Promise.reject(new Error(reason)));
    let calls = 0;
    for (const action of [
      h(Action.OpenInBrowser, {
        url: "https://example.com",
        onOpen: () => {
          calls++;
        },
      }),
      h(Action.Paste, {
        content: "secret",
        onPaste: () => {
          calls++;
        },
      }),
    ]) {
      root.render(action);
      await expect(root.dispatch(latest().id, "onAction", [])).rejects.toThrow(reason);
    }
    expect(calls).toBe(0);
  }
  root.unmount();
});

// @covers CopyToClipboardAction partial
// @covers PasteAction partial
test("deprecated actions use the same implementations and capability behavior", async () => {
  expect(implemented.CopyToClipboardAction).toBe(implemented.Action.CopyToClipboard);
  expect(implemented.PasteAction).toBe(implemented.Action.Paste);
  const { root, latest } = setup();
  const requests: unknown[] = [];
  setCapabilityRequester(async (name, params) => {
    requests.push([name, params]);
    return null;
  });
  root.render(h(CopyToClipboardAction, { content: "copy" }));
  expect(latest().type).toBe("Action.CopyToClipboard");
  await root.dispatch(latest().id, "onAction", []);
  root.render(h(PasteAction, { content: "paste" }));
  expect(latest().type).toBe("Action.Paste");
  await root.dispatch(latest().id, "onAction", []);
  expect(requests).toEqual([
    ["clipboard.copy", { text: "copy" }],
    ["clipboard.paste", { text: "paste" }],
  ]);
  root.unmount();
});

// @covers Detail partial
// @covers Detail.Props.markdown
// @covers Detail.Props.navigationTitle
// @covers Detail.Props.isLoading
// @covers Detail.Props.actions
// @covers Detail.Props.metadata
test("Detail serializes scalar props and renders element props in Slots", () => {
  const { root, latest } = setup();
  root.render(
    h(Detail, {
      markdown: "**Hello**",
      navigationTitle: "Docs",
      isLoading: true,
      actions: h(ActionPanel),
      metadata: h("metadata-fixture", { title: "Info" }),
    }),
  );
  expect(latest().type).toBe("Detail");
  expect(latest().props).toEqual({
    markdown: "**Hello**",
    navigationTitle: "Docs",
    isLoading: true,
  });
  expect(
    latest().children.map((child) => [child.type, child.props, child.children[0]?.type]),
  ).toEqual([
    ["Slot", { name: "actions" }, "ActionPanel"],
    ["Slot", { name: "metadata" }, "metadata-fixture"],
  ]);
  root.render(h(Detail, { markdown: null }));
  expect(latest().props).toEqual({ markdown: null });
  expect(latest().children).toEqual([]);
  root.unmount();
});
