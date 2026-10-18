// Host <-> runtime messages (docs/decisions/0001-process-and-scene-model.md).
// Everything crossing the process boundary is untrusted input, so the parse
// functions are total: they never throw on malformed input and report the first
// failure as `<field path>: <reason>`.
//
// Unknown fields are rejected at every level, nested objects included. Adding
// one is a protocol change, and an ignored typo is worse than an error.

export const PROTOCOL_VERSION = 1;

/** A value that survives `JSON.stringify` -> `JSON.parse` unchanged. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A callback prop on the wire; the host answers with an `event` message. */
export type HandlerRef = { $handler: string };

export type SceneNode = {
  id: string;
  type: string;
  props: Record<string, JsonValue | HandlerRef>;
  children: SceneNode[];
};

/** How the host expects the command to run. */
export type CommandMode = "view" | "no-view" | "menu-bar";

export type InitCommand = {
  extension: string;
  name: string;
  entry: string;
  mode: CommandMode;
  /** Manifest argument values, keyed by argument name (decision 0001). */
  arguments?: Record<string, string>;
  /** The `launchCommand({ context })` payload of this launch, if any. */
  launchContext?: Record<string, JsonValue>;
};

export type InitEnvironment = {
  extensionName: string;
  commandName: string;
  /** The manifest's `owner`, falling back to `author` (Raycast's `ownerOrAuthorName`). */
  ownerOrAuthorName: string;
  assetsPath: string;
  supportPath: string;
  isDevelopment: boolean;
  /** The active theme; a headless host has no UI, so the default is `"dark"`. */
  appearance: "light" | "dark";
  textSize: "medium" | "large";
};

export type InitMessage = {
  type: "init";
  protocol: number;
  command: InitCommand;
  preferences: Record<string, JsonValue>;
  environment: InitEnvironment;
};

export type EventMessage = { type: "event"; node: string; handler: string; args: JsonValue[] };

export type ErrorInfo = { code: string; message: string };

export type CapabilityResultMessage =
  | { type: "capability.result"; id: string; ok: true; value: JsonValue }
  | { type: "capability.result"; id: string; ok: false; error: ErrorInfo };

export type ShutdownMessage = { type: "shutdown" };

/** Messages the host sends to the runtime. */
export type HostMessage = InitMessage | EventMessage | CapabilityResultMessage | ShutdownMessage;

export type ReadyMessage = { type: "ready"; protocol: number };

export type SceneMessage = { type: "scene"; revision: number; root: SceneNode | null };

export type CapabilityRequestMessage = {
  type: "capability.request";
  id: string;
  name: string;
  params: JsonValue;
};

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMessage = { type: "log"; level: LogLevel; message: string };

export type ErrorMessage = { type: "error"; code: string; message: string; fatal: boolean };

/** Messages the runtime sends to the host. */
export type RuntimeMessage =
  | ReadyMessage
  | SceneMessage
  | CapabilityRequestMessage
  | LogMessage
  | ErrorMessage;

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string };

// Validation. Readers return the typed value or throw a ValidationError, which
// the public parse functions turn into a result. Throwing keeps the readers
// free of per-field branching; the error is only ever constructed here.

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, reason: string): never {
  throw new ValidationError(path === "" ? reason : `${path}: ${reason}`);
}

/** Joins a key onto a field path; the root path is the empty string. */
function keyPath(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function readObject(value: unknown, path: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) fail(path, "expected plain object");
  return value as Obj;
}

function checkKeys(object: Obj, path: string, allowed: readonly string[]): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) fail(keyPath(path, key), "unexpected field");
  }
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "expected string");
  return value;
}

function readNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "expected number");
  return value;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "expected boolean");
  return value;
}

function readNonNegativeInteger(value: unknown, path: string): number {
  const number = readNumber(value, path);
  if (!Number.isInteger(number) || number < 0) fail(path, "expected non-negative integer");
  return number;
}

/** `seen` rejects cycles: a recursive structure is not JSON and not a scene. */
function readJsonValue(value: unknown, path: string, seen: WeakSet<object>): JsonValue {
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) fail(path, "expected finite number");
      return value;
    case "object": {
      if (value === null) return null;
      if (seen.has(value)) fail(path, "expected acyclic value");
      seen.add(value);
      try {
        if (Array.isArray(value)) {
          return value.map((item, index) => readJsonValue(item, `${path}[${index}]`, seen));
        }
        const object = readObject(value, path);
        const result: Record<string, JsonValue> = {};
        for (const [key, item] of Object.entries(object)) {
          result[key] = readJsonValue(item, keyPath(path, key), seen);
        }
        return result;
      } finally {
        seen.delete(value);
      }
    }
    default:
      fail(path, "expected JSON value");
  }
}

function readJsonArray(value: unknown, path: string): JsonValue[] {
  if (!Array.isArray(value)) fail(path, "expected array");
  const seen = new WeakSet<object>();
  seen.add(value);
  return value.map((item, index) => readJsonValue(item, `${path}[${index}]`, seen));
}

function readJsonObject(value: unknown, path: string): Record<string, JsonValue> {
  const object = readObject(value, path);
  const seen = new WeakSet<object>();
  seen.add(object);
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(object)) {
    result[key] = readJsonValue(item, keyPath(path, key), seen);
  }
  return result;
}

function readStringRecord(value: unknown, path: string): Record<string, string> {
  const object = readObject(value, path);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(object)) {
    result[key] = readString(item, keyPath(path, key));
  }
  return result;
}

function readErrorInfo(value: unknown, path: string): ErrorInfo {
  const object = readObject(value, path);
  checkKeys(object, path, ["code", "message"]);
  return {
    code: readString(object["code"], keyPath(path, "code")),
    message: readString(object["message"], keyPath(path, "message")),
  };
}

function readCommandMode(value: unknown, path: string): CommandMode {
  const mode = readString(value, path);
  switch (mode) {
    case "view":
    case "no-view":
    case "menu-bar":
      return mode;
    default:
      fail(path, 'expected one of "view" | "no-view" | "menu-bar"');
  }
}

function readAppearance(value: unknown, path: string): "light" | "dark" {
  const appearance = readString(value, path);
  if (appearance === "light" || appearance === "dark") return appearance;
  fail(path, 'expected one of "light" | "dark"');
}

function readTextSize(value: unknown, path: string): "medium" | "large" {
  const textSize = readString(value, path);
  if (textSize === "medium" || textSize === "large") return textSize;
  fail(path, 'expected one of "medium" | "large"');
}

function readCommand(value: unknown, path: string): InitCommand {
  const object = readObject(value, path);
  checkKeys(object, path, ["extension", "name", "entry", "mode", "arguments", "launchContext"]);
  // Optional fields stay absent and never materialize as `undefined`, so a
  // parsed message equals the message that was sent.
  const commandArguments = object["arguments"];
  const launchContext = object["launchContext"];
  return {
    extension: readString(object["extension"], keyPath(path, "extension")),
    name: readString(object["name"], keyPath(path, "name")),
    entry: readString(object["entry"], keyPath(path, "entry")),
    mode: readCommandMode(object["mode"], keyPath(path, "mode")),
    ...(commandArguments === undefined
      ? {}
      : { arguments: readStringRecord(commandArguments, keyPath(path, "arguments")) }),
    ...(launchContext === undefined
      ? {}
      : { launchContext: readJsonObject(launchContext, keyPath(path, "launchContext")) }),
  };
}

function readEnvironment(value: unknown, path: string): InitEnvironment {
  const object = readObject(value, path);
  checkKeys(object, path, [
    "extensionName",
    "commandName",
    "ownerOrAuthorName",
    "assetsPath",
    "supportPath",
    "isDevelopment",
    "appearance",
    "textSize",
  ]);
  return {
    extensionName: readString(object["extensionName"], keyPath(path, "extensionName")),
    commandName: readString(object["commandName"], keyPath(path, "commandName")),
    ownerOrAuthorName: readString(object["ownerOrAuthorName"], keyPath(path, "ownerOrAuthorName")),
    assetsPath: readString(object["assetsPath"], keyPath(path, "assetsPath")),
    supportPath: readString(object["supportPath"], keyPath(path, "supportPath")),
    isDevelopment: readBoolean(object["isDevelopment"], keyPath(path, "isDevelopment")),
    appearance: readAppearance(object["appearance"], keyPath(path, "appearance")),
    textSize: readTextSize(object["textSize"], keyPath(path, "textSize")),
  };
}

/** A handler ref reaches props only as the exact `{ $handler }` shape. */
function isHandlerRefCandidate(value: unknown): boolean {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && "$handler" in value
  );
}

function readHandlerRef(value: unknown, path: string): HandlerRef {
  const object = readObject(value, path);
  checkKeys(object, path, ["$handler"]);
  return { $handler: readString(object["$handler"], keyPath(path, "$handler")) };
}

function readProps(value: unknown, path: string): Record<string, JsonValue | HandlerRef> {
  const object = readObject(value, path);
  const seen = new WeakSet<object>();
  seen.add(object);
  const result: Record<string, JsonValue | HandlerRef> = {};
  for (const [key, item] of Object.entries(object)) {
    const at = keyPath(path, key);
    result[key] = isHandlerRefCandidate(item)
      ? readHandlerRef(item, at)
      : readJsonValue(item, at, seen);
  }
  return result;
}

function readSceneNode(value: unknown, path: string, seen: WeakSet<object>): SceneNode {
  const object = readObject(value, path);
  if (seen.has(object)) fail(path, "expected acyclic scene");
  seen.add(object);
  try {
    checkKeys(object, path, ["id", "type", "props", "children"]);
    const children = object["children"];
    if (!Array.isArray(children)) fail(keyPath(path, "children"), "expected array");
    return {
      id: readString(object["id"], keyPath(path, "id")),
      type: readString(object["type"], keyPath(path, "type")),
      props: readProps(object["props"], keyPath(path, "props")),
      children: children.map((child, index) =>
        readSceneNode(child, `${keyPath(path, "children")}[${index}]`, seen),
      ),
    };
  } finally {
    seen.delete(object);
  }
}

function readLogLevel(value: unknown, path: string): LogLevel {
  const level = readString(value, path);
  switch (level) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return level;
    default:
      fail(path, 'expected one of "debug" | "info" | "warn" | "error"');
  }
}

function buildHostMessage(object: Obj): HostMessage {
  const type = readString(object["type"], "type");
  switch (type) {
    case "init": {
      checkKeys(object, "", ["type", "protocol", "command", "preferences", "environment"]);
      return {
        type: "init",
        protocol: readNumber(object["protocol"], "protocol"),
        command: readCommand(object["command"], "command"),
        preferences: readJsonObject(object["preferences"], "preferences"),
        environment: readEnvironment(object["environment"], "environment"),
      };
    }
    case "event": {
      checkKeys(object, "", ["type", "node", "handler", "args"]);
      return {
        type: "event",
        node: readString(object["node"], "node"),
        handler: readString(object["handler"], "handler"),
        args: readJsonArray(object["args"], "args"),
      };
    }
    case "capability.result": {
      const id = readString(object["id"], "id");
      const ok = readBoolean(object["ok"], "ok");
      if (ok) {
        checkKeys(object, "", ["type", "id", "ok", "value"]);
        return {
          type: "capability.result",
          id,
          ok: true,
          value: readJsonValue(object["value"], "value", new WeakSet<object>()),
        };
      }
      checkKeys(object, "", ["type", "id", "ok", "error"]);
      return {
        type: "capability.result",
        id,
        ok: false,
        error: readErrorInfo(object["error"], "error"),
      };
    }
    case "shutdown": {
      checkKeys(object, "", ["type"]);
      return { type: "shutdown" };
    }
    default:
      fail("type", `unknown message type ${JSON.stringify(type)}`);
  }
}

function buildRuntimeMessage(object: Obj): RuntimeMessage {
  const type = readString(object["type"], "type");
  switch (type) {
    case "ready": {
      checkKeys(object, "", ["type", "protocol"]);
      return { type: "ready", protocol: readNumber(object["protocol"], "protocol") };
    }
    case "scene": {
      checkKeys(object, "", ["type", "revision", "root"]);
      const root = object["root"];
      return {
        type: "scene",
        revision: readNonNegativeInteger(object["revision"], "revision"),
        root: root === null ? null : readSceneNode(root, "root", new WeakSet<object>()),
      };
    }
    case "capability.request": {
      checkKeys(object, "", ["type", "id", "name", "params"]);
      return {
        type: "capability.request",
        id: readString(object["id"], "id"),
        name: readString(object["name"], "name"),
        params: readJsonValue(object["params"], "params", new WeakSet<object>()),
      };
    }
    case "log": {
      checkKeys(object, "", ["type", "level", "message"]);
      return {
        type: "log",
        level: readLogLevel(object["level"], "level"),
        message: readString(object["message"], "message"),
      };
    }
    case "error": {
      checkKeys(object, "", ["type", "code", "message", "fatal"]);
      return {
        type: "error",
        code: readString(object["code"], "code"),
        message: readString(object["message"], "message"),
        fatal: readBoolean(object["fatal"], "fatal"),
      };
    }
    default:
      fail("type", `unknown message type ${JSON.stringify(type)}`);
  }
}

function parse<T>(build: () => T): ParseResult<T> {
  try {
    return { ok: true, message: build() };
  } catch (error) {
    // Anything that is not a validation failure is a bug here, not bad input.
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Validates an untyped value as a host -> runtime message. */
export function parseHostMessage(value: unknown): ParseResult<HostMessage> {
  return parse(() => buildHostMessage(readObject(value, "")));
}

/** Validates an untyped value as a runtime -> host message. */
export function parseRuntimeMessage(value: unknown): ParseResult<RuntimeMessage> {
  return parse(() => buildRuntimeMessage(readObject(value, "")));
}
