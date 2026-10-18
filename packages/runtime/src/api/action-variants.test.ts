import { beforeEach, expect, test } from "bun:test";
import { createElement as h } from "react";
import {
  createSceneRoot,
  type JsonValue,
  type SceneNode,
  type SceneSnapshot,
} from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import {
  Action,
  CreateQuicklink,
  CreateSnippet,
  Open,
  OpenAction,
  OpenWith,
  OpenWithAction,
  PickDate,
  ShowInFinder,
  ShowInFinderAction,
  ToggleQuickLook,
  Trash,
  TrashAction,
  type SSEMCPServer,
} from "./action.ts";
import { ActionPanel, ActionPanelSubmenu } from "./action-panel.ts";

// @covers Action.Open
// @covers Action.OpenWith
// @covers Action.ShowInFinder
// @covers Action.Trash
// @covers Action.CreateSnippet
// @covers Action.CreateQuicklink
// @covers Action.ToggleQuickLook
// @covers Action.PickDate
// @covers ActionPanel.Submenu
// @covers ActionPanel.Submenu.Props
// @covers ActionPanel.Submenu.Children

function setup() {
  const scenes: SceneSnapshot[] = [];
  const root = createSceneRoot({ publish: (scene) => scenes.push(scene) });
  return { root, latest: () => scenes.at(-1)!.root! };
}

let requests: Array<{ name: string; params: Record<string, JsonValue> }>;

beforeEach(() => {
  requests = [];
  setCapabilityRequester(async (name, params) => {
    requests.push({ name, params });
    return null;
  });
});

const failingRequester = () => Promise.reject(new Error("host refused"));

function byTitle(node: SceneNode, type: string): SceneNode {
  const found = node.children.find((child) => child.type === type && "title" in child.props);
  expect(found).toBeDefined();
  return found!;
}

// @covers Action.Open.Props
// @covers Action.Open.Props.title
// @covers Action.Open.Props.icon
// @covers Action.Open.Props.shortcut
test("Action.Open renders the public props and keeps the target out of the scene", () => {
  const { root, latest } = setup();
  root.render(
    h(Open, {
      target: "/tmp/private/report.pdf",
      application: { name: "TextEdit", path: "/Applications/TextEdit.app" },
      title: "Open Report",
      shortcut: { modifiers: ["cmd"], key: "o" },
    }),
  );
  const node = latest();
  expect(node.type).toBe("Action.Open");
  expect(node.props).toEqual({
    title: "Open Report",
    icon: "finder-16",
    shortcut: { modifiers: ["cmd"], key: "o" },
    onAction: { $handler: "onAction" },
  });
  expect(JSON.stringify(node.props)).not.toContain("report.pdf");
  root.unmount();
});

// @covers Action.Open.Props.target
// @covers Action.Open.Props.application
// @covers Action.Open.Props.onOpen
test("dispatching Action.Open requests open.url or open.path, then calls onOpen", async () => {
  const events: string[] = [];
  const { root, latest } = setup();
  root.render(
    h(Open, { target: "/tmp/report.pdf", title: "Open", onOpen: (t) => events.push(`file ${t}`) }),
  );
  await root.dispatch(latest().id, "onAction", []);
  expect(requests).toEqual([{ name: "open.path", params: { path: "/tmp/report.pdf" } }]);
  expect(events).toEqual(["file /tmp/report.pdf"]);
  root.render(
    h(Open, {
      target: "https://example.com",
      application: "Safari",
      title: "Open",
      onOpen: (t) => events.push(`url ${t}`),
    }),
  );
  await root.dispatch(latest().id, "onAction", []);
  expect(requests[1]).toEqual({
    name: "open.url",
    params: { url: "https://example.com", application: "Safari" },
  });
  expect(events).toEqual(["file /tmp/report.pdf", "url https://example.com"]);
  root.unmount();
});

// @covers Action.OpenWith.Props
// @covers Action.OpenWith.Props.title
// @covers Action.OpenWith.Props.icon
// @covers Action.OpenWith.Props.shortcut
// @covers Action.OpenWith.Props.path
// @covers Action.OpenWith.Props.onOpen
test("Action.OpenWith defaults title and icon, keeps path private, opens via open.path", async () => {
  const events: string[] = [];
  const { root, latest } = setup();
  root.render(
    h(OpenWith, {
      path: "/tmp/report.pdf",
      shortcut: { modifiers: ["cmd", "shift"], key: "o" },
      onOpen: (p) => events.push(p),
    }),
  );
  expect(latest().type).toBe("Action.OpenWith");
  expect(latest().props).toEqual({
    title: "Open With",
    icon: "upload-16",
    shortcut: { modifiers: ["cmd", "shift"], key: "o" },
    onAction: { $handler: "onAction" },
  });
  await root.dispatch(latest().id, "onAction", []);
  expect(requests).toEqual([{ name: "open.path", params: { path: "/tmp/report.pdf" } }]);
  expect(events).toEqual(["/tmp/report.pdf"]);
  root.unmount();
});

// @covers Action.ShowInFinder.Props
// @covers Action.ShowInFinder.Props.path
// @covers Action.ShowInFinder.Props.title
// @covers Action.ShowInFinder.Props.icon
// @covers Action.ShowInFinder.Props.shortcut
// @covers Action.ShowInFinder.Props.onShow
test("Action.ShowInFinder reveals through finder.show and passes the PathLike back", async () => {
  const events: unknown[] = [];
  const { root, latest } = setup();
  const path = new URL("file:///tmp/downloads");
  root.render(
    h(ShowInFinder, {
      path,
      icon: "folder.png",
      shortcut: { modifiers: ["cmd", "shift"], key: "f" },
      onShow: (p) => events.push(p),
    }),
  );
  expect(latest().type).toBe("Action.ShowInFinder");
  expect(latest().props).toEqual({
    title: "Show in Finder",
    icon: "folder.png",
    shortcut: { modifiers: ["cmd", "shift"], key: "f" },
    onAction: { $handler: "onAction" },
  });
  expect(JSON.stringify(latest().props)).not.toContain("downloads");
  await root.dispatch(latest().id, "onAction", []);
  expect(requests).toEqual([{ name: "finder.show", params: { path: "file:///tmp/downloads" } }]);
  expect(events).toEqual([path]);
  root.unmount();
});

// @covers Action.Trash.Props
// @covers Action.Trash.Props.paths
// @covers Action.Trash.Props.title
// @covers Action.Trash.Props.icon
// @covers Action.Trash.Props.shortcut
// @covers Action.Trash.Props.onTrash
test("Action.Trash normalizes single and multiple paths for the trash capability", async () => {
  const events: unknown[] = [];
  const { root, latest } = setup();
  root.render(
    h(Trash, {
      paths: "/tmp/a.txt",
      icon: "delete.png",
      shortcut: { modifiers: ["cmd"], key: "backspace" },
      onTrash: (p) => events.push(p),
    }),
  );
  expect(latest().type).toBe("Action.Trash");
  expect(latest().props).toEqual({
    title: "Move to Trash",
    icon: "delete.png",
    shortcut: { modifiers: ["cmd"], key: "backspace" },
    onAction: { $handler: "onAction" },
  });
  await root.dispatch(latest().id, "onAction", []);
  expect(requests).toEqual([{ name: "trash", params: { paths: ["/tmp/a.txt"] } }]);
  expect(events).toEqual(["/tmp/a.txt"]);
  root.render(
    h(Trash, {
      paths: ["/tmp/a.txt", new URL("file:///tmp/b.txt")],
      title: "Clean up",
      onTrash: (p) => events.push(p),
    }),
  );
  await root.dispatch(latest().id, "onAction", []);
  expect(requests[1]).toEqual({
    name: "trash",
    params: { paths: ["/tmp/a.txt", "file:///tmp/b.txt"] },
  });
  expect(events).toEqual(["/tmp/a.txt", ["/tmp/a.txt", new URL("file:///tmp/b.txt")]]);
  root.unmount();
});

// @covers Action.CreateSnippet.Props
// @covers Action.CreateSnippet.Props.snippet
// @covers Action.CreateSnippet.Props.title
// @covers Action.CreateSnippet.Props.icon
// @covers Action.CreateSnippet.Props.shortcut
test("Action.CreateSnippet keeps the snippet contents out of the scene", async () => {
  const { root, latest } = setup();
  root.render(
    h(CreateSnippet, {
      snippet: { text: "DE75512108001245126199", name: "IBAN" },
      icon: "bank.png",
      shortcut: { modifiers: ["cmd"], key: "s" },
    }),
  );
  expect(latest().type).toBe("Action.CreateSnippet");
  expect(latest().props).toEqual({
    title: "Create Snippet",
    icon: "bank.png",
    shortcut: { modifiers: ["cmd"], key: "s" },
    onAction: { $handler: "onAction" },
  });
  await root.dispatch(latest().id, "onAction", []);
  expect(requests).toEqual([
    { name: "snippet.create", params: { text: "DE75512108001245126199", name: "IBAN" } },
  ]);
  root.unmount();
});

// @covers Action.CreateQuicklink.Props
// @covers Action.CreateQuicklink.Props.quicklink
// @covers Action.CreateQuicklink.Props.title
// @covers Action.CreateQuicklink.Props.icon
// @covers Action.CreateQuicklink.Props.shortcut
test("Action.CreateQuicklink keeps the quicklink out of the scene and serializes the application", async () => {
  const { root, latest } = setup();
  root.render(
    h(CreateQuicklink, {
      quicklink: {
        link: "https://duckduckgo.com/?q={Query}",
        name: "Duck",
        application: { name: "Firefox", path: "/Applications/Firefox.app" },
      },
      icon: "duck.png",
      shortcut: { modifiers: ["cmd"], key: "q" },
    }),
  );
  expect(latest().type).toBe("Action.CreateQuicklink");
  expect(latest().props).toEqual({
    title: "Create Quicklink",
    icon: "duck.png",
    shortcut: { modifiers: ["cmd"], key: "q" },
    onAction: { $handler: "onAction" },
  });
  await root.dispatch(latest().id, "onAction", []);
  expect(requests).toEqual([
    {
      name: "quicklink.create",
      params: {
        link: "https://duckduckgo.com/?q={Query}",
        name: "Duck",
        application: { name: "Firefox", path: "/Applications/Firefox.app" },
      },
    },
  ]);
  root.unmount();
});

// @covers Action.ToggleQuickLook.Props
// @covers Action.ToggleQuickLook.Props.title
// @covers Action.ToggleQuickLook.Props.icon
// @covers Action.ToggleQuickLook.Props.shortcut
test("Action.ToggleQuickLook defaults its title and requests quicklook.toggle", async () => {
  const { root, latest } = setup();
  root.render(h(ToggleQuickLook, { shortcut: { modifiers: ["cmd"], key: "y" } }));
  expect(latest().type).toBe("Action.ToggleQuickLook");
  expect(latest().props).toEqual({
    title: "Quick Look",
    icon: "eye-16",
    shortcut: { modifiers: ["cmd"], key: "y" },
    onAction: { $handler: "onAction" },
  });
  await root.dispatch(latest().id, "onAction", []);
  expect(requests).toEqual([{ name: "quicklook.toggle", params: {} }]);
  root.unmount();
});

// @covers Action.PickDate.Props
// @covers Action.PickDate.Props.title
// @covers Action.PickDate.Props.icon
// @covers Action.PickDate.Props.shortcut
// @covers Action.PickDate.Props.type
// @covers Action.PickDate.Props.min
// @covers Action.PickDate.Props.max
// @covers Action.PickDate.Type
test("Action.PickDate renders bounds as ISO strings and exposes Type", () => {
  const { root, latest } = setup();
  root.render(
    h(PickDate, {
      title: "Set Due Date",
      type: "date",
      min: new Date("2026-01-01T00:00:00.000Z"),
      max: new Date("2026-12-31T23:59:59.999Z"),
      shortcut: { modifiers: ["cmd"], key: "d" },
      onChange: () => {},
    }),
  );
  expect(latest().type).toBe("Action.PickDate");
  expect(latest().props).toEqual({
    title: "Set Due Date",
    icon: "calendar-16",
    type: "date",
    min: "2026-01-01T00:00:00.000Z",
    max: "2026-12-31T23:59:59.999Z",
    shortcut: { modifiers: ["cmd"], key: "d" },
    onChange: { $handler: "onChange" },
  });
  expect(PickDate.Type).toEqual({ Date: "date", DateTime: "date_time" });
  root.unmount();
});

// @covers Action.PickDate.Props.onChange
test("PickDate onChange dispatches ISO strings on the wire and Dates in the callback", async () => {
  const events: Array<Date | null> = [];
  const { root, latest } = setup();
  root.render(h(PickDate, { title: "Pick", onChange: (date) => events.push(date) }));
  await root.dispatch(latest().id, "onChange", ["2026-10-18T12:34:56.000Z"]);
  await root.dispatch(latest().id, "onChange", [null]);
  expect(events).toEqual([new Date("2026-10-18T12:34:56.000Z"), null]);
  root.unmount();
});

// @covers Action.PickDate.isFullDay
test("PickDate.isFullDay is true only for midnight dates", () => {
  expect(PickDate.isFullDay(new Date(2026, 9, 18))).toBe(true);
  expect(PickDate.isFullDay(new Date(2026, 9, 18, 0, 30))).toBe(false);
  expect(PickDate.isFullDay(new Date("not a date"))).toBe(false);
  expect(PickDate.isFullDay(null)).toBe(false);
  expect(PickDate.isFullDay()).toBe(false);
});

// @covers ActionPanel.Submenu.Props.title
// @covers ActionPanel.Submenu.Props.icon
// @covers ActionPanel.Submenu.Props.shortcut
// @covers ActionPanel.Submenu.Props.autoFocus
// @covers ActionPanel.Submenu.Props.filtering
// @covers ActionPanel.Submenu.Props.isLoading
// @covers ActionPanel.Submenu.Props.throttle
// @covers ActionPanel.Submenu.Props.children
test("ActionPanel.Submenu renders its search-bar props, handlers and children", () => {
  const { root, latest } = setup();
  root.render(
    h(
      ActionPanel,
      null,
      h(
        ActionPanel.Submenu,
        {
          title: "Add Label",
          icon: "label.png",
          shortcut: { modifiers: ["cmd"], key: "l" },
          autoFocus: true,
          filtering: { keepSectionOrder: true },
          isLoading: true,
          throttle: true,
          onOpen: () => "opened",
          onSearchTextChange: (text: string) => text,
        },
        h(Action, { title: "Bug", onAction: () => "bug" }),
      ),
    ),
  );
  const submenu = byTitle(latest(), "ActionPanel.Submenu");
  expect(submenu.props).toEqual({
    title: "Add Label",
    icon: "label.png",
    shortcut: { modifiers: ["cmd"], key: "l" },
    autoFocus: true,
    filtering: { keepSectionOrder: true },
    isLoading: true,
    throttle: true,
    onOpen: { $handler: "onOpen" },
    onSearchTextChange: { $handler: "onSearchTextChange" },
  });
  expect(submenu.children.map((child) => child.type)).toEqual(["Action"]);
  root.unmount();
});

// @covers ActionPanel.Submenu.Props.onOpen
// @covers ActionPanel.Submenu.Props.onSearchTextChange
test("clients dispatch a submenu opening and its search text", () => {
  const events: string[] = [];
  const { root, latest } = setup();
  root.render(
    h(
      ActionPanel,
      null,
      h(
        ActionPanel.Submenu,
        {
          title: "Add Label",
          onOpen: () => events.push("opened"),
          onSearchTextChange: (text) => events.push(`search ${text}`),
        },
        h(Action, { title: "Bug" }),
      ),
    ),
  );
  const submenu = byTitle(latest(), "ActionPanel.Submenu");
  root.dispatch(submenu.id, "onOpen", []);
  root.dispatch(submenu.id, "onSearchTextChange", ["bu"]);
  expect(events).toEqual(["opened", "search bu"]);
  root.unmount();
});

// @covers OpenAction
// @covers OpenWithAction
// @covers ShowInFinderAction
// @covers TrashAction
// @covers ActionPanelSubmenu
test("deprecated top-level aliases are the implemented components", () => {
  expect(OpenAction).toBe(Action.Open);
  expect(OpenWithAction).toBe(Action.OpenWith);
  expect(ShowInFinderAction).toBe(Action.ShowInFinder);
  expect(TrashAction).toBe(Action.Trash);
  expect(ActionPanelSubmenu).toBe(ActionPanel.Submenu);
});

// @covers Action.InstallMCPServer
// @covers Action.InstallMCPServer.Props
// @covers Action.InstallMCPServer.Props.server
// @covers Action.InstallMCPServer.Props.title
// @covers Action.InstallMCPServer.Props.icon
// @covers Action.InstallMCPServer.Props.shortcut
test("Action.InstallMCPServer keeps the server out of the scene and requests mcp.install", async () => {
  const { root, latest } = setup();
  const stdio = {
    transport: "stdio" as const,
    name: "Sequential Thinking",
    description: "Think step by step",
    icon: "plug-16" as const,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    env: { LOG_LEVEL: "debug" },
  };
  root.render(
    h(Action.InstallMCPServer, {
      server: stdio,
      icon: "download.png",
      shortcut: { modifiers: ["cmd"], key: "m" },
    }),
  );
  expect(latest().type).toBe("Action.InstallMCPServer");
  expect(latest().props).toEqual({
    title: "Install MCP Server",
    icon: "download.png",
    shortcut: { modifiers: ["cmd"], key: "m" },
    onAction: { $handler: "onAction" },
  });
  await root.dispatch(latest().id, "onAction", []);
  root.render(
    h(Action.InstallMCPServer, {
      title: "Add server",
      server: { transport: "sse", name: "Remote", url: "https://mcp.example/sse" },
    }),
  );
  await root.dispatch(latest().id, "onAction", []);
  expect(requests).toEqual([
    {
      name: "mcp.install",
      params: {
        server: {
          name: "Sequential Thinking",
          transport: "stdio",
          icon: "plug-16",
          description: "Think step by step",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
          env: { LOG_LEVEL: "debug" },
        },
      },
    },
    {
      name: "mcp.install",
      params: { server: { name: "Remote", transport: "sse", url: "https://mcp.example/sse" } },
    },
  ]);
  root.unmount();
});

// @covers Action.InstallMCPServer
test("Action.InstallMCPServer rejects a malformed server and propagates denial", async () => {
  const { root, latest } = setup();
  root.render(
    h(Action.InstallMCPServer, {
      server: { transport: "http", name: "Broken" } as unknown as SSEMCPServer,
    }),
  );
  await expect(root.dispatch(latest().id, "onAction", [])).rejects.toThrow(
    'server.transport must be "stdio" or "sse"',
  );
  expect(requests).toEqual([]);
  setCapabilityRequester(failingRequester);
  root.render(
    h(Action.InstallMCPServer, {
      server: { transport: "sse", name: "Remote", url: "https://mcp.example/sse" },
    }),
  );
  await expect(root.dispatch(latest().id, "onAction", [])).rejects.toThrow("host refused");
  root.unmount();
});

// @covers Action.Open.Props.onOpen
// @covers Action.ShowInFinder.Props.onShow
// @covers Action.Trash.Props.onTrash
test("callbacks do not run when the capability is denied", async () => {
  setCapabilityRequester(failingRequester);
  let called = false;
  const { root, latest } = setup();
  root.render(
    h(
      ActionPanel,
      null,
      h(Open, { target: "/tmp/a", title: "Open", onOpen: () => (called = true) }),
      h(ShowInFinder, { path: "/tmp/a", onShow: () => (called = true) }),
      h(Trash, { paths: "/tmp/a", onTrash: () => (called = true) }),
    ),
  );
  for (const node of latest().children) {
    await expect(root.dispatch(node.id, "onAction", [])).rejects.toThrow("host refused");
  }
  expect(called).toBe(false);
  root.unmount();
});
