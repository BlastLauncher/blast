import type { JsonValue } from "./messages.ts";

export const EMBEDDER_PROTOCOL_VERSION = 1;
export type EmbedderError = { code: string; message: string; data?: JsonValue };
export type EmbedderParams = {
  "extension.open": { dir: string };
  "extension.manifest": { extension: string };
  "extension.watch": { extension: string };
  "extension.unwatch": { extension: string };
  "extension.close": { extension: string };
  "extension.dependencies.check": { extension: string };
  "extension.dependencies.install": { extension: string };
  "extension.preferences": { extension: string; command: string };
  "extension.savePreferences": {
    extension: string;
    command: string;
    values: Record<string, string | number | boolean>;
  };
  "extension.launch": {
    extension: string;
    command: string;
    argumentValues?: Record<string, string>;
    launchContext?: Record<string, JsonValue>;
  };
  "session.event": { session: string; node: string; handler: string; args: JsonValue[] };
  "session.close": { session: string };
  "engine.shutdown": Record<string, never>;
};
export type EmbedderRequest = {
  [M in keyof EmbedderParams]: {
    type: "request";
    id: string;
    method: M;
    params: EmbedderParams[M];
  };
}[keyof EmbedderParams];
export type EmbedderMessage =
  | { type: "hello"; protocol: number; capabilities: string[] }
  | EmbedderRequest
  | { type: "capability.result"; id: string; ok: true; value: JsonValue }
  | { type: "capability.result"; id: string; ok: false; error: EmbedderError }
  | { type: "capability.progress"; id: string; value: JsonValue };
export type EmbedderServerMessage =
  | { type: "welcome"; protocol: number; engine: { version: string }; catalog: JsonValue }
  | { type: "error"; error: EmbedderError }
  | { type: "response"; id: string; ok: true; result: JsonValue }
  | { type: "response"; id: string; ok: false; error: EmbedderError }
  | { type: "event"; event: string; [key: string]: JsonValue }
  | { type: "capability.request"; id: string; session: string; name: string; params: JsonValue }
  | { type: "capability.cancel"; id: string };

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const json = (v: unknown): boolean =>
  v === null ||
  typeof v === "string" ||
  typeof v === "boolean" ||
  (typeof v === "number" && Number.isFinite(v)) ||
  (Array.isArray(v) ? v.every(json) : object(v) && Object.values(v).every(json));
const string = (v: unknown) => typeof v === "string";
const record = (v: unknown, check: (v: unknown) => boolean) =>
  object(v) && Object.values(v).every(check);
const shapes: Record<keyof EmbedderParams, string[]> = {
  "extension.open": ["dir"],
  "extension.manifest": ["extension"],
  "extension.watch": ["extension"],
  "extension.unwatch": ["extension"],
  "extension.close": ["extension"],
  "extension.dependencies.check": ["extension"],
  "extension.dependencies.install": ["extension"],
  "extension.preferences": ["extension", "command"],
  "extension.savePreferences": ["extension", "command", "values"],
  "extension.launch": ["extension", "command", "argumentValues?", "launchContext?"],
  "session.event": ["session", "node", "handler", "args"],
  "session.close": ["session"],
  "engine.shutdown": [],
};
/** Every request method name, in wire-table order; the schema generator and
 * its test enumerate this instead of re-listing the methods. */
export const EMBEDDER_METHODS = Object.keys(shapes) as (keyof EmbedderParams & string)[];
function fields(
  v: Record<string, unknown>,
  names: string[],
  check: (key: string, v: unknown) => boolean,
) {
  return (
    Object.keys(v).every((k) => names.includes(k) || names.includes(`${k}?`)) &&
    names.every((name) => {
      const key = name.replace(/\?$/, "");
      return (name.endsWith("?") && !(key in v)) || (key in v && check(key, v[key]));
    })
  );
}
function valid(v: unknown): boolean {
  if (!object(v)) return false;
  if (v.type === "hello")
    return fields(v, ["type", "protocol", "capabilities"], (k, x) =>
      k === "protocol"
        ? Number.isSafeInteger(x)
        : k === "capabilities"
          ? Array.isArray(x) && x.every(string)
          : string(x),
    );
  if (v.type === "capability.progress")
    return fields(v, ["type", "id", "value"], (k, x) => (k === "value" ? json(x) : string(x)));
  if (v.type === "capability.result")
    return fields(v, ["type", "id", "ok", v.ok === true ? "value" : "error"], (k, x) =>
      k === "ok"
        ? typeof x === "boolean"
        : k === "value"
          ? json(x)
          : k === "error"
            ? object(x) &&
              fields(x, ["code", "message", "data?"], (key, y) =>
                key === "data" ? json(y) : string(y),
              )
            : string(x),
    );
  if (v.type !== "request" || !string(v.method) || !Object.hasOwn(shapes, v.method)) return false;
  return fields(v, ["type", "id", "method", "params"], (k, x) =>
    k !== "params"
      ? string(x)
      : object(x) &&
        fields(x, shapes[v.method as keyof EmbedderParams], (key, y) => {
          if (key === "args") return Array.isArray(y) && y.every(json);
          if (key === "argumentValues") return record(y, string);
          if (key === "launchContext") return record(y, json);
          if (key === "values")
            return record(
              y,
              (z) =>
                typeof z === "string" ||
                typeof z === "boolean" ||
                (typeof z === "number" && Number.isFinite(z)),
            );
          return string(y);
        }),
  );
}
/** Total boundary validator; unknown fields and methods are rejected. */
export function parseEmbedderMessage(
  value: unknown,
): { ok: true; message: EmbedderMessage } | { ok: false; error: string } {
  try {
    if (valid(value)) return { ok: true, message: value as EmbedderMessage };
  } catch {
    /* Cyclic/non-JSON input is invalid too. */
  }
  return { ok: false, error: "Invalid embedder message or request params" };
}
