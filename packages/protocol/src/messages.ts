// Host <-> runtime messages (docs/decisions/0001-process-and-scene-model.md).
// Everything crossing the process boundary is untrusted input, so the parse
// functions are total: they never throw on malformed input and report the first
// failure as `<field path>: <reason>`.
//
// Unknown fields are rejected at every level, nested objects included. Adding
// one is a protocol change, and an ignored typo is worse than an error.

import { decodeModelRequest } from "./provider-codec.ts";
import type { ModelStreamPart, RegisteredModel } from "./provider.ts";

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
export type CommandMode = "view" | "no-view" | "menu-bar" | "model-provider";

export type InitCommand = {
  extension: string;
  name: string;
  entry: string;
  mode: CommandMode;
  /** Manifest argument values, keyed by argument name (decision 0001). */
  arguments?: Record<string, string>;
  /** The `launchCommand({ context })` payload of this launch, if any. */
  launchContext?: Record<string, JsonValue>;
  /** Search text supplied when invoking a fallback command. */
  fallbackText?: string;
  /** A stored `Form` draft for this command, read by the host before launch. */
  draftValues?: Record<string, JsonValue>;
};

export type InitEnvironment = {
  availableAPIs?: ("AI" | "BrowserExtension")[];
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
  /** Host accepts incremental `scene.patch` updates after the initial scene. */
  scenePatches?: boolean;
};

export type EventMessage = { type: "event"; node: string; handler: string; args: JsonValue[] };

export type ErrorInfo = { code: string; message: string };

export type CapabilityResultMessage =
  | { type: "capability.result"; id: string; ok: true; value: JsonValue }
  | { type: "capability.result"; id: string; ok: false; error: ErrorInfo };

export type ShutdownMessage = { type: "shutdown" };

/** Messages the host sends to the runtime. */
export type ProviderRequest =
  | { type: "provider.getModels"; id: string }
  | {
      type: "provider.stream";
      id: string;
      model: RegisteredModel;
      request: Record<string, JsonValue>;
    }
  | { type: "provider.abort"; id: string };
export type ProviderResponse =
  | { type: "provider.models"; id: string; models: RegisteredModel[] }
  | { type: "provider.part"; id: string; part: ModelStreamPart }
  | { type: "provider.end"; id: string }
  | { type: "provider.error"; id: string; error: ErrorInfo };
export type HostMessage =
  | InitMessage
  | EventMessage
  | CapabilityResultMessage
  | { type: "capability.progress"; id: string; value: JsonValue }
  | ShutdownMessage
  | ProviderRequest;

export type ReadyMessage = { type: "ready"; protocol: number };

export type SceneMessage = { type: "scene"; revision: number; root: SceneNode | null };

/** One incremental mutation against the previous scene's node tree. */
export type ScenePatchOp =
  | { op: "props"; id: string; props: Record<string, JsonValue | HandlerRef> }
  | { op: "children"; id: string; children: (string | SceneNode)[] }
  | { op: "replace"; id: string; node: SceneNode }
  | { op: "root"; root: SceneNode | null };

/** Incremental scene update against `baseRevision`, preserving untouched subtrees. */
export type ScenePatchMessage = {
  type: "scene.patch";
  revision: number;
  baseRevision: number;
  ops: ScenePatchOp[];
};

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
  | ProviderResponse
  | ReadyMessage
  | SceneMessage
  | ScenePatchMessage
  | CapabilityRequestMessage
  | { type: "capability.cancel"; id: string }
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
    case "model-provider":
      return mode;
    default:
      fail(path, 'expected one of "view" | "no-view" | "menu-bar" | "model-provider"');
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
  checkKeys(object, path, [
    "extension",
    "name",
    "entry",
    "mode",
    "arguments",
    "launchContext",
    "fallbackText",
    "draftValues",
  ]);
  // Optional fields stay absent and never materialize as `undefined`, so a
  // parsed message equals the message that was sent.
  const commandArguments = object["arguments"];
  const launchContext = object["launchContext"];
  const draftValues = object["draftValues"];
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
    ...(object["fallbackText"] === undefined
      ? {}
      : { fallbackText: readString(object["fallbackText"], keyPath(path, "fallbackText")) }),
    ...(draftValues === undefined
      ? {}
      : { draftValues: readJsonObject(draftValues, keyPath(path, "draftValues")) }),
  };
}

function readAvailableAPIs(value: unknown, path: string): ("AI" | "BrowserExtension")[] {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value.map((api, index) => {
    if (api !== "AI" && api !== "BrowserExtension")
      fail(`${path}[${index}]`, "expected AI or BrowserExtension");
    return api;
  });
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
    "availableAPIs",
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
    ...(object["availableAPIs"] === undefined
      ? {}
      : {
          availableAPIs: readAvailableAPIs(object["availableAPIs"], keyPath(path, "availableAPIs")),
        }),
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

function readProps(
  value: unknown,
  path: string,
  seen: WeakSet<object> = new WeakSet<object>(),
): Record<string, JsonValue | HandlerRef> {
  const object = readObject(value, path);
  if (seen.has(object)) fail(path, "expected acyclic value");
  seen.add(object);
  try {
    const result: Record<string, JsonValue | HandlerRef> = {};
    for (const key in object) {
      if (!Object.hasOwn(object, key)) continue;
      const item = object[key];
      const at = keyPath(path, key);
      result[key] = isHandlerRefCandidate(item)
        ? readHandlerRef(item, at)
        : readJsonValue(item, at, seen);
    }
    return result;
  } finally {
    seen.delete(object);
  }
}

function readSceneNode(value: unknown, path: string, seen: WeakSet<object>): SceneNode {
  const object = readObject(value, path);
  if (seen.has(object)) fail(path, "expected acyclic scene");
  seen.add(object);
  try {
    checkKeys(object, path, ["id", "type", "props", "children"]);
    const children = object["children"];
    if (!Array.isArray(children)) fail(keyPath(path, "children"), "expected array");
    const childrenPath = keyPath(path, "children");
    const nextChildren: SceneNode[] = [];
    for (let index = 0; index < children.length; index++) {
      nextChildren.push(readSceneNode(children[index], `${childrenPath}[${index}]`, seen));
    }
    return {
      id: readString(object["id"], keyPath(path, "id")),
      type: readString(object["type"], keyPath(path, "type")),
      props: readProps(object["props"], keyPath(path, "props"), seen),
      children: nextChildren,
    };
  } finally {
    seen.delete(object);
  }
}

// Fast-path structural validator for valid scenes. Skips path-string building
// and object cloning on the happy path; any rejection falls back to
// `readSceneNode` so error messages keep the exact `<field path>: <reason>`.
function isPlainObject(value: unknown): value is Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isValidJsonFast(value: unknown, seen: WeakSet<object>): boolean {
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (value === null) return true;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!isValidJsonFast(value[i], seen)) {
        seen.delete(value);
        return false;
      }
    }
    seen.delete(value);
    return true;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    seen.delete(value);
    return false;
  }
  const obj = value as Obj;
  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) continue;
    if (!isValidJsonFast(obj[key], seen)) {
      seen.delete(value);
      return false;
    }
  }
  seen.delete(value);
  return true;
}

function isValidPropsFast(value: unknown, seen: WeakSet<object>): boolean {
  if (!isPlainObject(value) || seen.has(value)) return false;
  seen.add(value);
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    const item = value[key];
    if (isHandlerRefCandidate(item)) {
      if (!isPlainObject(item)) {
        seen.delete(value);
        return false;
      }
      let count = 0;
      for (const k in item) {
        if (!Object.hasOwn(item, k)) continue;
        if (k !== "$handler" || typeof item[k] !== "string") {
          seen.delete(value);
          return false;
        }
        count++;
      }
      if (count !== 1) {
        seen.delete(value);
        return false;
      }
    } else if (!isValidJsonFast(item, seen)) {
      seen.delete(value);
      return false;
    }
  }
  seen.delete(value);
  return true;
}

function isValidSceneNodeFast(value: unknown, seen: WeakSet<object>): value is SceneNode {
  if (!isPlainObject(value) || seen.has(value)) return false;
  let keyCount = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (key !== "id" && key !== "type" && key !== "props" && key !== "children") return false;
    keyCount++;
  }
  if (keyCount !== 4) return false;
  if (typeof value["id"] !== "string" || typeof value["type"] !== "string") return false;
  const children = value["children"];
  if (!Array.isArray(children)) return false;
  seen.add(value);
  if (!isValidPropsFast(value["props"], seen)) {
    seen.delete(value);
    return false;
  }
  for (let i = 0; i < children.length; i++) {
    if (!isValidSceneNodeFast(children[i], seen)) {
      seen.delete(value);
      return false;
    }
  }
  seen.delete(value);
  return true;
}

function readSceneNodeChecked(value: unknown, path: string, seen: WeakSet<object>): SceneNode {
  if (isValidSceneNodeFast(value, seen)) return value;
  return readSceneNode(value, path, new WeakSet<object>());
}

function readScenePatchOp(value: unknown, path: string, seen: WeakSet<object>): ScenePatchOp {
  const object = readObject(value, path);
  const op = readString(object["op"], keyPath(path, "op"));
  switch (op) {
    case "props": {
      checkKeys(object, path, ["op", "id", "props"]);
      const props = object["props"];
      return {
        op: "props",
        id: readString(object["id"], keyPath(path, "id")),
        props: isValidPropsFast(props, seen)
          ? (props as Record<string, JsonValue | HandlerRef>)
          : readProps(props, keyPath(path, "props")),
      };
    }
    case "children": {
      checkKeys(object, path, ["op", "id", "children"]);
      const children = object["children"];
      if (!Array.isArray(children)) fail(keyPath(path, "children"), "expected array");
      const childrenPath = keyPath(path, "children");
      const next: (string | SceneNode)[] = [];
      for (let i = 0; i < children.length; i++) {
        const entry = children[i];
        next.push(
          typeof entry === "string"
            ? entry
            : readSceneNodeChecked(entry, `${childrenPath}[${i}]`, seen),
        );
      }
      return {
        op: "children",
        id: readString(object["id"], keyPath(path, "id")),
        children: next,
      };
    }
    case "replace": {
      checkKeys(object, path, ["op", "id", "node"]);
      return {
        op: "replace",
        id: readString(object["id"], keyPath(path, "id")),
        node: readSceneNodeChecked(object["node"], keyPath(path, "node"), seen),
      };
    }
    case "root": {
      checkKeys(object, path, ["op", "root"]);
      const root = object["root"];
      return {
        op: "root",
        root: root === null ? null : readSceneNodeChecked(root, keyPath(path, "root"), seen),
      };
    }
    default:
      fail(keyPath(path, "op"), `unknown patch op ${JSON.stringify(op)}`);
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

function readModel(value: unknown, path: string): RegisteredModel {
  const model = readJsonObject(value, path);
  checkKeys(model, path, [
    "id",
    "title",
    "isLocal",
    "icon",
    "description",
    "capabilities",
    "contextWindow",
    "sizeInBytes",
  ]);
  readString(model["id"], `${path}.id`);
  readString(model["title"], `${path}.title`);
  for (const key of ["isLocal"])
    if (model[key] !== undefined) readBoolean(model[key], `${path}.${key}`);
  for (const key of ["description"])
    if (model[key] !== undefined) readString(model[key], `${path}.${key}`);
  for (const key of ["contextWindow", "sizeInBytes"])
    if (model[key] !== undefined) readNumber(model[key], `${path}.${key}`);
  if (model["capabilities"] !== undefined) {
    const caps = readJsonObject(model["capabilities"], `${path}.capabilities`);
    checkKeys(caps, `${path}.capabilities`, [
      "systemMessage",
      "temperature",
      "vision",
      "tools",
      "streaming",
      "reasoningEffort",
    ]);
    for (const [key, capability] of Object.entries(caps)) {
      const config = readJsonObject(capability, `${path}.capabilities.${key}`);
      if (key !== "vision")
        readBoolean(config["supported"], `${path}.capabilities.${key}.supported`);
      if (key === "vision" || key === "reasoningEffort") {
        const list = config[key === "vision" ? "mediaTypes" : "options"];
        if (!Array.isArray(list) || !list.every((item) => typeof item === "string"))
          fail(`${path}.capabilities.${key}`, "expected string array");
        if (key === "reasoningEffort")
          readString(config["default"], `${path}.capabilities.${key}.default`);
        else if (
          !list.every((item) =>
            ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(String(item)),
          )
        )
          fail(`${path}.capabilities.vision.mediaTypes`, "unknown media type");
      }
    }
  }
  return model as RegisteredModel;
}

function readPart(value: unknown): ModelStreamPart {
  const part = readJsonObject(value, "part");
  const type = readString(part["type"], "part.type");
  const required: Record<string, string[]> = {
    "text-start": ["id"],
    "text-end": ["id"],
    text: ["text"],
    "text-delta": [],
    "reasoning-start": ["id"],
    "reasoning-end": ["id"],
    reasoning: ["text"],
    "reasoning-delta": [],
    source: ["id", "sourceType"],
    file: [],
    "tool-call-streaming-start": ["toolCallId", "toolName"],
    "tool-call-delta": ["toolCallId", "toolName", "argsTextDelta"],
    "tool-input-start": ["id", "toolName"],
    "tool-input-end": ["id"],
    "tool-input-delta": ["id", "delta"],
    "tool-input-error": [],
    "tool-call": ["toolCallId", "toolName"],
    "tool-result": ["toolCallId", "toolName"],
    "tool-error": ["toolCallId", "toolName"],
    "tool-output-denied": ["toolCallId", "toolName"],
    "tool-approval-request": ["approvalId"],
    finish: ["finishReason"],
    error: [],
    abort: [],
    start: [],
    "stream-start": [],
    "response-metadata": [],
    "start-step": [],
    "finish-step": [],
    "reasoning-part-finish": [],
    "step-start": [],
    raw: [],
  };
  if (!Object.hasOwn(required, type)) fail("part.type", "unknown stream part");
  for (const key of required[type]!) readString(part[key], `part.${key}`);
  for (const key of ["id", "text", "textDelta", "title", "filename"])
    if (part[key] !== undefined) readString(part[key], `part.${key}`);
  const requiredValues: Record<string, string[]> = {
    file: ["file"],
    "tool-call": ["input"],
    "tool-error": ["error"],
    "tool-approval-request": ["toolCall"],
    error: ["error"],
  };
  for (const key of requiredValues[type] ?? [])
    if (!(key in part)) fail(`part.${key}`, "required field");
  if (part["totalUsage"] !== undefined) {
    const usage = readJsonObject(part["totalUsage"], "part.totalUsage");
    for (const key of ["inputTokens", "outputTokens", "totalTokens"])
      if (usage[key] !== undefined) readNumber(usage[key], `part.totalUsage.${key}`);
  }
  if (type === "source") {
    if (part["sourceType"] === "url") readString(part["url"], "part.url");
    else if (part["sourceType"] === "document") readString(part["mediaType"], "part.mediaType");
    else fail("part.sourceType", "expected url or document");
  }
  if (
    type === "finish" &&
    !["stop", "length", "content-filter", "tool-calls", "error", "other", "unknown"].includes(
      String(part["finishReason"]),
    )
  )
    fail("part.finishReason", "unknown reason");
  return part as ModelStreamPart;
}

function buildHostMessage(object: Obj): HostMessage {
  const type = readString(object["type"], "type");
  switch (type) {
    case "provider.getModels":
    case "provider.abort":
      checkKeys(object, "", ["type", "id"]);
      return { type, id: readString(object["id"], "id") };
    case "provider.stream": {
      checkKeys(object, "", ["type", "id", "model", "request"]);
      const request = readJsonObject(object["request"], "request");
      checkKeys(request, "request", [
        "system",
        "messages",
        "temperature",
        "tools",
        "toolChoice",
        "providerOptions",
      ]);
      if (request["system"] !== undefined) readString(request["system"], "request.system");
      if (request["temperature"] !== undefined)
        readNumber(request["temperature"], "request.temperature");
      if (
        request["toolChoice"] !== undefined &&
        request["toolChoice"] !== "auto" &&
        request["toolChoice"] !== "required"
      )
        fail("request.toolChoice", "expected auto or required");
      if (request["tools"] !== undefined) {
        const tools = readJsonObject(request["tools"], "request.tools");
        for (const [name, toolValue] of Object.entries(tools)) {
          const tool = readJsonObject(toolValue, `request.tools.${name}`);
          checkKeys(tool, `request.tools.${name}`, ["type", "description", "inputSchema"]);
          if (tool["type"] !== undefined && tool["type"] !== "function")
            fail(`request.tools.${name}.type`, "expected function");
          if (tool["description"] !== undefined)
            readString(tool["description"], `request.tools.${name}.description`);
        }
      }
      const options = readJsonObject(request["providerOptions"], "request.providerOptions");
      for (const [name, settings] of Object.entries(options))
        readJsonObject(settings, `request.providerOptions.${name}`);
      const raycast = readJsonObject(options["raycast"], "request.providerOptions.raycast");
      for (const key of ["locale", "currentDate", "sessionId"])
        readString(raycast[key], `request.providerOptions.raycast.${key}`);
      if (raycast["reasoningEffort"] !== undefined)
        readString(raycast["reasoningEffort"], "request.providerOptions.raycast.reasoningEffort");
      if (request["messages"] !== undefined) {
        if (!Array.isArray(request["messages"])) fail("request.messages", "expected array");
        for (const item of request["messages"]) {
          const message = readJsonObject(item, "request.messages[]");
          checkKeys(message, "request.messages[]", ["role", "content"]);
          if (!["system", "user", "assistant", "tool"].includes(String(message["role"])))
            fail("request.messages[].role", "unknown role");
          if (message["role"] === "system")
            readString(message["content"], "request.messages[].content");
          else if (!Array.isArray(message["content"]))
            fail("request.messages[].content", "expected array");
          else
            for (const content of message["content"]) {
              const part = readJsonObject(content, "request.messages[].content[]");
              const kind = readString(part["type"], "request.messages[].content[].type");
              const allowed =
                message["role"] === "user"
                  ? ["text", "file"]
                  : message["role"] === "assistant"
                    ? ["text", "file", "reasoning", "tool-call"]
                    : ["tool-result"];
              if (!allowed.includes(kind))
                fail("request.messages[].content[].type", "invalid content for role");
              if (kind === "text" || kind === "reasoning")
                readString(part["text"], "request.messages[].content[].text");
              if (kind === "file")
                readString(part["mediaType"], "request.messages[].content[].mediaType");
              if (kind === "tool-call" || kind === "tool-result") {
                for (const key of ["toolCallId", "toolName"])
                  readString(part[key], `request.messages[].content[].${key}`);
                if (kind === "tool-call" && !("input" in part))
                  fail("request.messages[].content[].input", "required field");
                if (kind === "tool-result") {
                  const output = readJsonObject(
                    part["output"],
                    "request.messages[].content[].output",
                  );
                  if (output["type"] !== "json" || !("value" in output))
                    fail("request.messages[].content[].output", "expected JSON output");
                }
              }
            }
        }
      }
      try {
        decodeModelRequest(request);
      } catch {
        fail("request", "invalid attachment encoding");
      }
      return {
        type,
        id: readString(object["id"], "id"),
        model: readModel(object["model"], "model"),
        request,
      };
    }
    case "init": {
      checkKeys(object, "", [
        "type",
        "protocol",
        "command",
        "preferences",
        "environment",
        "scenePatches",
      ]);
      const scenePatches = object["scenePatches"];
      return {
        type: "init",
        protocol: readNumber(object["protocol"], "protocol"),
        command: readCommand(object["command"], "command"),
        preferences: readJsonObject(object["preferences"], "preferences"),
        environment: readEnvironment(object["environment"], "environment"),
        ...(scenePatches === undefined
          ? {}
          : { scenePatches: readBoolean(scenePatches, "scenePatches") }),
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
    case "capability.progress": {
      checkKeys(object, "", ["type", "id", "value"]);
      return {
        type: "capability.progress",
        id: readString(object["id"], "id"),
        value: readJsonValue(object["value"], "value", new WeakSet<object>()),
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
    case "provider.models": {
      checkKeys(object, "", ["type", "id", "models"]);
      if (!Array.isArray(object["models"])) fail("models", "expected array");
      return {
        type,
        id: readString(object["id"], "id"),
        models: object["models"].map((model, i) => readModel(model, `models[${i}]`)),
      };
    }
    case "provider.part": {
      checkKeys(object, "", ["type", "id", "part"]);
      return { type, id: readString(object["id"], "id"), part: readPart(object["part"]) };
    }
    case "provider.end":
      checkKeys(object, "", ["type", "id"]);
      return { type, id: readString(object["id"], "id") };
    case "provider.error":
      checkKeys(object, "", ["type", "id", "error"]);
      return {
        type,
        id: readString(object["id"], "id"),
        error: readErrorInfo(object["error"], "error"),
      };
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
        root: root === null ? null : readSceneNodeChecked(root, "root", new WeakSet<object>()),
      };
    }
    case "scene.patch": {
      checkKeys(object, "", ["type", "revision", "baseRevision", "ops"]);
      const ops = object["ops"];
      if (!Array.isArray(ops)) fail("ops", "expected array");
      const seen = new WeakSet<object>();
      const parsedOps: ScenePatchOp[] = [];
      for (let i = 0; i < ops.length; i++) {
        parsedOps.push(readScenePatchOp(ops[i], `ops[${i}]`, seen));
      }
      return {
        type: "scene.patch",
        revision: readNonNegativeInteger(object["revision"], "revision"),
        baseRevision: readNonNegativeInteger(object["baseRevision"], "baseRevision"),
        ops: parsedOps,
      };
    }
    case "capability.cancel": {
      checkKeys(object, "", ["type", "id"]);
      return { type: "capability.cancel", id: readString(object["id"], "id") };
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

export type ScenePatchApplier = {
  reset(scene: SceneMessage): SceneMessage;
  apply(patch: ScenePatchMessage): SceneMessage;
};

/**
 * Stateful incremental scene reconstructor. Untouched subtrees keep exact
 * `SceneNode` object identity across revisions while modified spines are
 * replaced immutably in O(dirty * depth).
 */
export function createScenePatchApplier(): ScenePatchApplier {
  let current: SceneMessage | undefined;
  let indexed = false;
  const nodes = new Map<string, SceneNode>();
  const parents = new Map<string, string | null>();

  function indexSubtree(node: SceneNode, parentId: string | null): void {
    nodes.set(node.id, node);
    parents.set(node.id, parentId);
    for (let i = 0; i < node.children.length; i++) {
      indexSubtree(node.children[i]!, node.id);
    }
  }

  function unindexSubtree(node: SceneNode, keep: Set<string>): void {
    if (keep.has(node.id)) return;
    nodes.delete(node.id);
    parents.delete(node.id);
    for (let i = 0; i < node.children.length; i++) {
      unindexSubtree(node.children[i]!, keep);
    }
  }

  function ensureIndexed(): void {
    if (indexed) return;
    indexed = true;
    nodes.clear();
    parents.clear();
    if (current?.root) indexSubtree(current.root, null);
  }

  return {
    reset(scene: SceneMessage): SceneMessage {
      current = scene;
      indexed = false;
      nodes.clear();
      parents.clear();
      return scene;
    },
    apply(patch: ScenePatchMessage): SceneMessage {
      if (!current || current.revision !== patch.baseRevision) {
        throw new Error(
          `Scene patch baseRevision ${patch.baseRevision} does not match current revision ${current?.revision ?? "none"}`,
        );
      }
      if (patch.ops.length === 0) {
        current = { type: "scene", revision: patch.revision, root: current.root };
        return current;
      }
      const first = patch.ops[0];
      if (patch.ops.length === 1 && first?.op === "root") {
        const next: SceneMessage = { type: "scene", revision: patch.revision, root: first.root };
        return this.reset(next);
      }
      ensureIndexed();
      if (!current.root) {
        throw new Error("Cannot apply non-root scene patch to null root");
      }

      const propsOps = new Map<string, Record<string, JsonValue | HandlerRef>>();
      const childrenOps = new Map<string, (string | SceneNode)[]>();
      const replaceOps = new Map<string, SceneNode>();
      let rootOverride: { set: boolean; value: SceneNode | null } = { set: false, value: null };

      for (let i = 0; i < patch.ops.length; i++) {
        const op = patch.ops[i]!;
        switch (op.op) {
          case "root":
            rootOverride = { set: true, value: op.root };
            break;
          case "props":
            propsOps.set(op.id, op.props);
            break;
          case "children":
            childrenOps.set(op.id, op.children);
            break;
          case "replace":
            replaceOps.set(op.id, op.node);
            break;
        }
      }

      if (rootOverride.set) {
        const next: SceneMessage = {
          type: "scene",
          revision: patch.revision,
          root: rootOverride.value,
        };
        return this.reset(next);
      }

      // Collect all directly touched node ids and every ancestor up to root.
      const dirty = new Set<string>();
      const markAncestors = (id: string) => {
        let cur: string | null | undefined = id;
        while (cur !== null && cur !== undefined && !dirty.has(cur)) {
          dirty.add(cur);
          cur = parents.get(cur);
        }
      };
      for (const id of propsOps.keys()) {
        if (!nodes.has(id)) throw new Error(`Unknown scene node in patch: ${id}`);
        markAncestors(id);
      }
      for (const id of childrenOps.keys()) {
        if (!nodes.has(id)) throw new Error(`Unknown scene node in patch: ${id}`);
        markAncestors(id);
      }
      for (const id of replaceOps.keys()) {
        if (!nodes.has(id)) throw new Error(`Unknown scene node in patch: ${id}`);
        markAncestors(id);
      }

      // Track reused existing node IDs across moves/reorders so we don't unindex them.
      const keptExisting = new Set<string>();
      const removedCandidates: SceneNode[] = [];

      // Rebuild only dirty nodes bottom-up via recursion over the dirty spine.
      const built = new Map<string, SceneNode>();

      function rebuild(id: string): SceneNode {
        const cached = built.get(id);
        if (cached) return cached;
        const replacement = replaceOps.get(id);
        if (replacement) {
          const old = nodes.get(id);
          if (old) removedCandidates.push(old);
          built.set(id, replacement);
          return replacement;
        }
        const existing = nodes.get(id);
        if (!existing) throw new Error(`Unknown scene node in patch: ${id}`);
        if (!dirty.has(id)) return existing;

        const nextProps = propsOps.get(id) ?? existing.props;
        const rawChildren = childrenOps.get(id);
        let nextChildren: SceneNode[];
        if (rawChildren !== undefined) {
          nextChildren = [];
          const nextIds = new Set<string>();
          for (let i = 0; i < rawChildren.length; i++) {
            const entry = rawChildren[i]!;
            if (typeof entry === "string") {
              if (!nodes.has(entry)) throw new Error(`Unknown child node in patch: ${entry}`);
              keptExisting.add(entry);
              nextIds.add(entry);
              nextChildren.push(dirty.has(entry) ? rebuild(entry) : nodes.get(entry)!);
            } else {
              nextIds.add(entry.id);
              nextChildren.push(entry);
            }
          }
          for (let i = 0; i < existing.children.length; i++) {
            const prevChild = existing.children[i]!;
            if (!nextIds.has(prevChild.id)) removedCandidates.push(prevChild);
          }
        } else {
          nextChildren = [];
          for (let i = 0; i < existing.children.length; i++) {
            const child = existing.children[i]!;
            nextChildren.push(dirty.has(child.id) ? rebuild(child.id) : child);
          }
        }
        const updated: SceneNode = {
          id: existing.id,
          type: existing.type,
          props: nextProps,
          children: nextChildren,
        };
        built.set(id, updated);
        return updated;
      }

      const nextRoot = rebuild(current.root.id);

      // Clean removed subtrees that weren't moved elsewhere, then update index for
      // rebuilt nodes and newly inserted subtrees.
      for (let i = 0; i < removedCandidates.length; i++) {
        unindexSubtree(removedCandidates[i]!, keptExisting);
      }
      for (const [id, node] of built) {
        const parentId = id === nextRoot.id ? null : (parents.get(id) ?? null);
        if (replaceOps.has(id)) {
          indexSubtree(node, parentId);
        } else {
          nodes.set(id, node);
          for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i]!;
            if (
              !nodes.has(child.id) ||
              (childrenOps.has(id) && typeof childrenOps.get(id)![i] !== "string")
            ) {
              indexSubtree(child, id);
            } else {
              parents.set(child.id, id);
            }
          }
        }
      }
      parents.set(nextRoot.id, null);

      current = { type: "scene", revision: patch.revision, root: nextRoot };
      return current;
    },
  };
}
