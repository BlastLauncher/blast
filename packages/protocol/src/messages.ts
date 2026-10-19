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
        root: root === null ? null : readSceneNode(root, "root", new WeakSet<object>()),
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
