import { expect, test } from "bun:test";
import { createLineDecoder, encodeMessage } from "./framing.ts";
import {
  PROTOCOL_VERSION,
  parseHostMessage,
  parseRuntimeMessage,
  type CommandMode,
  type HostMessage,
  type InitCommand,
  type RuntimeMessage,
} from "./messages.ts";

const command: InitCommand = {
  extension: "clipboard-history",
  name: "history",
  entry: "src/index.tsx",
  mode: "view",
};

const environment = {
  extensionName: "Clipboard History",
  commandName: "history",
  assetsPath: "/ext/assets",
  supportPath: "/ext/support",
  isDevelopment: false,
};

const init: HostMessage = {
  type: "init",
  protocol: PROTOCOL_VERSION,
  command,
  preferences: {
    maxItems: 20,
    showIcons: true,
    pinned: null,
    tags: ["work", "personal"],
    nested: { deep: { deeper: 1 } },
  },
  environment,
};

const event: HostMessage = {
  type: "event",
  node: "list.item.0",
  handler: "onAction",
  args: ["text", 7, null, true, { a: [1, 2] }, []],
};

const resultOk: HostMessage = {
  type: "capability.result",
  id: "c1",
  ok: true,
  value: { copied: "hello \n world" },
};

const resultNull: HostMessage = { type: "capability.result", id: "c2", ok: true, value: null };

const resultFailed: HostMessage = {
  type: "capability.result",
  id: "c3",
  ok: false,
  error: { code: "denied", message: "clipboard.write is not brokered" },
};

const shutdown: HostMessage = { type: "shutdown" };

const scene: RuntimeMessage = {
  type: "scene",
  revision: 3,
  root: {
    id: "root",
    type: "List",
    props: {
      title: "Clipboard",
      isLoading: false,
      items: [{ id: "a", title: "one" }],
      onSelect: { $handler: "handler:0" },
    },
    children: [
      {
        id: "child",
        type: "List.Item",
        props: { subtitle: null, onAction: { $handler: "handler:1" } },
        children: [],
      },
    ],
  },
};

const HOST_EXAMPLES: HostMessage[] = [init, event, resultOk, resultNull, resultFailed, shutdown];
const RUNTIME_EXAMPLES: RuntimeMessage[] = [
  { type: "ready", protocol: PROTOCOL_VERSION },
  scene,
  { type: "scene", revision: 0, root: null },
  { type: "capability.request", id: "c4", name: "clipboard.write", params: { text: "copied" } },
  { type: "capability.request", id: "c5", name: "clipboard.read", params: null },
  { type: "log", level: "warn", message: "list is large\nconsider paging" },
  { type: "error", code: "render.failed", message: "boom", fatal: true },
];

test("parses every host message example", () => {
  for (const example of HOST_EXAMPLES) {
    expect(parseHostMessage(example)).toEqual({ ok: true, message: example });
  }
});

test("parses every runtime message example", () => {
  for (const example of RUNTIME_EXAMPLES) {
    expect(parseRuntimeMessage(example)).toEqual({ ok: true, message: example });
  }
});

test("each direction rejects the other direction's messages", () => {
  for (const example of RUNTIME_EXAMPLES) {
    const parsed = parseHostMessage(example);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error).toBe(
      `type: unknown message type ${JSON.stringify(example.type)}`,
    );
  }
  for (const example of HOST_EXAMPLES) {
    const parsed = parseRuntimeMessage(example);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error).toBe(
      `type: unknown message type ${JSON.stringify(example.type)}`,
    );
  }
});

test("protocol version is a single number shared by both directions", () => {
  expect(PROTOCOL_VERSION).toBe(1);
  expect(parseHostMessage(init)).toEqual({ ok: true, message: { ...init, protocol: 1 } });
});

test("a scene parses without the optional-in-practice parts of a message", () => {
  expect(parseRuntimeMessage({ type: "scene", revision: 0, root: null })).toEqual({
    ok: true,
    message: { type: "scene", revision: 0, root: null },
  });
});

test("command.mode accepts exactly the three command modes", () => {
  const modes: CommandMode[] = ["view", "no-view", "menu-bar"];
  for (const mode of modes) {
    const parsed = parseHostMessage({ ...init, command: { ...command, mode } });
    const parsedMode =
      parsed.ok && parsed.message.type === "init" ? parsed.message.command.mode : undefined;
    expect(parsedMode, mode).toBe(mode);
  }
});

test("rejections name the failing field path", () => {
  const cases: Array<[string, unknown, string]> = [
    ["undefined", undefined, "expected object"],
    ["null", null, "expected object"],
    ["array", [], "expected object"],
    ["class instance", new Map(), "expected plain object"],
    ["missing type", {}, "type: expected string"],
    ["non-string type", { type: 1 }, "type: expected string"],

    ["init without protocol", { ...init, protocol: undefined }, "protocol: expected number"],
    [
      "init with a bad command.entry",
      { ...init, command: { ...command, entry: 7 } },
      "command.entry: expected string",
    ],
    ["init with an unknown top-level field", { ...init, debug: true }, "debug: unexpected field"],
    [
      "init with a bad preference",
      { ...init, preferences: { bad: undefined } },
      "preferences.bad: expected JSON value",
    ],
    [
      "init with a cyclic preference",
      { ...init, preferences: cyclic() },
      "preferences.self: expected acyclic value",
    ],
    [
      "init with a bad environment field",
      { ...init, environment: { ...environment, isDevelopment: "yes" } },
      "environment.isDevelopment: expected boolean",
    ],
    [
      "init with an unknown command field",
      { ...init, command: { ...command, path: "x" } },
      "command.path: unexpected field",
    ],
    [
      "init without a command mode",
      { ...init, command: { extension: "ext", name: "cmd", entry: "src/index.tsx" } },
      "command.mode: expected string",
    ],
    [
      "init with an unknown command mode",
      { ...init, command: { ...command, mode: "widget" } },
      'command.mode: expected one of "view" | "no-view" | "menu-bar"',
    ],

    ["event without args", { type: "event", node: "n", handler: "h" }, "args: expected array"],
    [
      "event with a non-JSON argument",
      { ...event, args: [undefined] },
      "args[0]: expected JSON value",
    ],
    [
      "event with a non-JSON nested argument",
      { ...event, args: [{ ok: Number.NaN }] },
      "args[0].ok: expected finite number",
    ],

    ["capability.result with a non-boolean ok", { ...resultOk, ok: "yes" }, "ok: expected boolean"],
    [
      "capability.result ok without a value",
      { type: "capability.result", id: "c", ok: true },
      "value: expected JSON value",
    ],
    [
      "capability.result ok carrying an error",
      { ...resultOk, error: { code: "x", message: "y" } },
      "error: unexpected field",
    ],
    [
      "capability.result failed without a code",
      { type: "capability.result", id: "c", ok: false, error: { message: "y" } },
      "error.code: expected string",
    ],

    [
      "shutdown with an extra field",
      { type: "shutdown", reason: "user" },
      "reason: unexpected field",
    ],
  ];
  for (const [name, value, error] of cases) {
    const parsed = parseHostMessage(value);
    expect(parsed.ok === false && parsed.error, name).toBe(error);
  }
});

test("runtime rejections name the failing field path", () => {
  const cyclicScene: Record<string, unknown> = {
    id: "root",
    type: "List",
    props: {},
    children: [],
  };
  (cyclicScene["children"] as unknown[]).push(cyclicScene);
  const cases: Array<[string, unknown, string]> = [
    ["ready without protocol", { type: "ready" }, "protocol: expected number"],
    ["scene without a root", { type: "scene", revision: 0 }, "root: expected object"],
    [
      "scene with a negative revision",
      { type: "scene", revision: -1, root: null },
      "revision: expected non-negative integer",
    ],
    [
      "scene with a fractional revision",
      { type: "scene", revision: 1.5, root: null },
      "revision: expected non-negative integer",
    ],
    [
      "scene node without an id",
      { type: "scene", revision: 0, root: { type: "List", props: {}, children: [] } },
      "root.id: expected string",
    ],
    [
      "scene node with an unknown field",
      {
        type: "scene",
        revision: 0,
        root: { id: "r", type: "List", props: {}, children: [], key: "x" },
      },
      "root.key: unexpected field",
    ],
    [
      "scene child without a type",
      {
        type: "scene",
        revision: 0,
        root: {
          id: "r",
          type: "List",
          props: {},
          children: [{ id: "c", props: {}, children: [] }],
        },
      },
      "root.children[0].type: expected string",
    ],
    [
      "scene node with a bad handler ref",
      {
        type: "scene",
        revision: 0,
        root: { id: "r", type: "List", props: { onSelect: { $handler: 7 } }, children: [] },
      },
      "root.props.onSelect.$handler: expected string",
    ],
    [
      "scene node with a handler ref plus data",
      {
        type: "scene",
        revision: 0,
        root: {
          id: "r",
          type: "List",
          props: { onSelect: { $handler: "h", args: [] } },
          children: [],
        },
      },
      "root.props.onSelect.args: unexpected field",
    ],
    [
      "scene node with props of the wrong type",
      { type: "scene", revision: 0, root: { id: "r", type: "List", props: [], children: [] } },
      "root.props: expected object",
    ],
    [
      "scene node with children of the wrong type",
      { type: "scene", revision: 0, root: { id: "r", type: "List", props: {}, children: {} } },
      "root.children: expected array",
    ],
    [
      "scene with a cycle",
      { type: "scene", revision: 0, root: cyclicScene },
      "root.children[0]: expected acyclic scene",
    ],

    [
      "capability.request without a name",
      { type: "capability.request", id: "c", params: null },
      "name: expected string",
    ],
    [
      "capability.request without params",
      { type: "capability.request", id: "c", name: "n" },
      "params: expected JSON value",
    ],

    [
      "log with an unknown level",
      { type: "log", level: "trace", message: "m" },
      'level: expected one of "debug" | "info" | "warn" | "error"',
    ],
    ["log without a message", { type: "log", level: "info" }, "message: expected string"],

    ["error without fatal", { type: "error", code: "c", message: "m" }, "fatal: expected boolean"],
    [
      "error with an unknown field",
      { type: "error", code: "c", message: "m", fatal: true, detail: {} },
      "detail: unexpected field",
    ],
  ];
  for (const [name, value, error] of cases) {
    const parsed = parseRuntimeMessage(value);
    expect(parsed.ok === false && parsed.error, name).toBe(error);
  }
});

test("unknown message types are named in the error", () => {
  const host = parseHostMessage({ type: "bogus" });
  expect(host.ok === false && host.error).toBe('type: unknown message type "bogus"');
  const runtime = parseRuntimeMessage({ type: "bogus", nonsense: true });
  expect(runtime.ok === false && runtime.error).toBe('type: unknown message type "bogus"');
});

test("parsing never throws, whatever it is handed", () => {
  const values: unknown[] = [
    undefined,
    null,
    0,
    "",
    Symbol("s"),
    () => {},
    new Date(),
    Object.create(null),
  ];
  for (const value of values) {
    expect(() => parseHostMessage(value)).not.toThrow();
    expect(() => parseRuntimeMessage(value)).not.toThrow();
  }
});

/** Frames one message byte by byte, exactly as a quiet pipe would. */
function wireRoundTrip(message: HostMessage | RuntimeMessage): unknown {
  const lines: unknown[] = [];
  const errors: string[] = [];
  const decoder = createLineDecoder({
    onLine: (value) => lines.push(value),
    onError: (error) => errors.push(error),
  });
  for (const byte of new TextEncoder().encode(encodeMessage(message))) {
    decoder.push(new Uint8Array([byte]));
  }
  decoder.end();
  expect(errors).toEqual([]);
  expect(lines).toHaveLength(1);
  return lines[0];
}

test("every example survives encode -> decoder -> parse", () => {
  for (const message of HOST_EXAMPLES) {
    expect(parseHostMessage(wireRoundTrip(message))).toEqual({ ok: true, message });
  }
  for (const message of RUNTIME_EXAMPLES) {
    expect(parseRuntimeMessage(wireRoundTrip(message))).toEqual({ ok: true, message });
  }
});

/** An object that contains itself, which JSON can never carry. */
function cyclic(): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  value["self"] = value;
  return value;
}
