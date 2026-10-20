// Real protocol messages, plus a scene captured from the hello-list fixture
// (`fixtures/scenes/hello-list.json`, recorded with
// `bun run blast run --json`), validate against the generated schema. The
// in-test validator implements exactly the keywords `embedder-schema.ts`
// uses; a keyword it misses is a bug, so the schema must not grow silently.
import { readFileSync } from "node:fs";
import { test, expect } from "bun:test";
import { CAPABILITIES } from "./capabilities.ts";
import { EMBEDDER_METHODS, EMBEDDER_PROTOCOL_VERSION, parseEmbedderMessage } from "./embedder.ts";
import { EMBEDDER_PROTOCOL_SCHEMA } from "./embedder-schema.ts";
import type { JsonValue } from "./messages.ts";

type Schema = Record<string, unknown>;

// --- in-test validator, exactly the keywords the schema uses ---

function resolve(root: Schema, ref: string): Schema {
  if (!ref.startsWith("#/$defs/")) throw new Error(`unsupported $ref ${ref}`);
  let node: unknown = root;
  for (const raw of ref.slice("#/".length).split("/")) {
    const key = decodeURIComponent(raw);
    if (typeof node !== "object" || node === null) throw new Error(`unresolvable $ref ${ref}`);
    node = (node as Schema)[key];
  }
  if (typeof node !== "object" || node === null) throw new Error(`unresolvable $ref ${ref}`);
  return node as Schema;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    default:
      return typeof value === type;
  }
}

function validate(root: Schema, schema: Schema, value: unknown, at: string): string | null {
  const fail = (reason: string): string => `${at}: ${reason}`;
  if (typeof schema !== "object" || schema === null) return null;
  if ("$ref" in schema) return validate(root, resolve(root, schema.$ref as string), value, at);
  if ("oneOf" in schema) {
    const passes = (schema.oneOf as Schema[]).map((branch, arm) => ({
      arm,
      failure: validate(root, branch, value, `${at}/${arm}`),
    }));
    const good = passes.filter(({ failure }) => failure === null);
    if (good.length === 0)
      return fail(
        `did not match any of ${passes.length} oneOf arms (${passes
          .map(({ failure }) => failure)
          .join(" | ")})`,
      );
    if (good.length > 1) return fail("matched several oneOf arms");
    return null;
  }
  if ("anyOf" in schema) {
    const passes = (schema.anyOf as Schema[]).map((branch, arm) => ({
      arm,
      failure: validate(root, branch, value, `${at}/${arm}`),
    }));
    if (passes.every(({ failure }) => failure !== null))
      return fail(`did not match any of ${passes.length} anyOf arms`);
    return null;
  }
  if ("const" in schema && JSON.stringify(value) !== JSON.stringify(schema.const))
    return fail(`expected constant ${JSON.stringify(schema.const)}`);
  if ("enum" in schema) {
    const members = (schema.enum as unknown[]).map((member) => JSON.stringify(member));
    if (!members.includes(JSON.stringify(value)))
      return fail(`expected one of ${members.join(", ")}`);
  }
  const types = typeof schema.type === "string" ? [schema.type] : (schema.type as string[]);
  if (types !== undefined && !types.some((type) => matchesType(value, type)))
    return fail(`expected type ${types.join(" | ")}`);
  if (Array.isArray(value)) {
    if ("items" in schema) {
      for (const [index, item] of value.entries()) {
        const failure = validate(root, schema.items as Schema, item, `${at}[${index}]`);
        if (failure !== null) return failure;
      }
    }
    return null;
  }
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Schema;
    if (schema.additionalProperties === false)
      for (const key of Object.keys(object))
        if (!(key in properties)) return fail(`unexpected field ${key}`);
    for (const key of (schema.required ?? []) as string[])
      if (!(key in object)) return fail(`missing field ${key}`);
    for (const [key, item] of Object.entries(object)) {
      const itemSchema =
        key in properties ? (properties[key] as Schema) : (schema.additionalProperties as Schema);
      if (itemSchema !== undefined && typeof itemSchema !== "boolean") {
        const failure = validate(root, itemSchema, item, at === "" ? key : `${at}.${key}`);
        if (failure !== null) return failure;
      }
    }
  }
  return null;
}

function schemaOf(value: unknown): string | null {
  return validate(EMBEDDER_PROTOCOL_SCHEMA, EMBEDDER_PROTOCOL_SCHEMA, value, "");
}

const ROOT = EMBEDDER_PROTOCOL_SCHEMA as Schema;

function def(name: string): Schema {
  expect(Object.hasOwn(EMBEDDER_PROTOCOL_SCHEMA.$defs as Schema, name)).toBe(true);
  const definition = (EMBEDDER_PROTOCOL_SCHEMA.$defs as Record<string, Schema>)[name];
  if (!definition) throw new Error(`missing def ${name}`);
  return definition;
}

// --- samples the protocol serves today ---

const SAMPLE_PARAMS: Record<string, JsonValue> = {
  "extension.open": { dir: "fixtures/extensions/hello-list" },
  "extension.manifest": { extension: "1" },
  "extension.watch": { extension: "1" },
  "extension.unwatch": { extension: "1" },
  "extension.close": { extension: "1" },
  "extension.dependencies.check": { extension: "1" },
  "extension.dependencies.install": { extension: "1" },
  "extension.preferences": { extension: "1", command: "index" },
  "extension.savePreferences": { extension: "1", command: "index", values: { name: "x" } },
  "extension.launch": { extension: "1", command: "index", argumentValues: { query: "a" } },
  "session.event": { session: "2", node: "n1", handler: "onAction", args: [["a", 1, null]] },
  "session.input": { session: "2", input: { type: "primary" } },
  "session.close": { session: "2" },
  "engine.shutdown": {},
};

const SAMPLE_RESULTS: Record<string, JsonValue> = {
  "extension.open": { extension: "1" },
  "extension.manifest": { commands: [] },
  "extension.dependencies.check": { "@raycast/api": "installed" },
  "extension.dependencies.install": { installed: [] },
  "extension.preferences": { schemas: [] },
  "extension.launch": { session: "2" },
};

const SERVED = {
  type: "welcome" as const,
  protocol: EMBEDDER_PROTOCOL_VERSION,
  engine: { version: "0.0.0" },
  catalog: CAPABILITIES as unknown as JsonValue,
};

const SCENE_EVENT = (): JsonValue => ({
  type: "event",
  event: "session.scene",
  session: "2",
  scene: JSON.parse(
    readFileSync(new URL("../../../fixtures/scenes/hello-list.json", import.meta.url), "utf8"),
  ) as JsonValue,
});

const EVENTS: JsonValue[] = [
  {
    type: "event",
    event: "manifest.changed",
    extension: "1",
    manifest: { name: "hello-list", commands: [{ name: "index", mode: "view" }] },
  },
  {
    type: "event",
    event: "manifest.error",
    extension: "1",
    error: { code: "invalid_manifest", message: "boom" },
  },
  { type: "event", event: "dependencies.log", extension: "1", message: "npm ci" },
  {
    type: "event",
    event: "session.log",
    session: "2",
    log: { type: "log", level: "warn", message: "slow" },
  },
  {
    type: "event",
    event: "session.exited",
    session: "2",
    code: 1,
    error: { code: "crash", message: "boom", data: [1] },
  },
];

test("handshake messages validate", () => {
  expect(schemaOf({ type: "hello", protocol: 1, capabilities: [] })).toBeNull();
  expect(schemaOf(SERVED)).toBeNull();
  expect(
    schemaOf({
      type: "error",
      error: { code: "version_mismatch", message: "unsupported", data: 2 },
    }),
  ).toBeNull();
  expect(
    schemaOf({ type: "error", error: { code: "version_mismatch", message: "unsupported", x: 2 } }),
  ).toEqual(expect.stringContaining("unexpected field x"));
  expect(schemaOf({ type: "response" })).toEqual(expect.stringContaining("did not match any"));
});

test("request envelopes validate every method and reject unknown ones", () => {
  for (const method of EMBEDDER_METHODS)
    expect(
      schemaOf({ type: "request", id: "1", method, params: SAMPLE_PARAMS[method as string]! }),
    ).toBeNull();
  // A method without a schema entry makes the schema fail it here before
  // release tooling does:
  expect(schemaOf({ type: "request", id: "1", method: "extension.typo", params: {} })).toEqual(
    expect.stringContaining("did not match any"),
  );
  expect(
    schemaOf({
      type: "request",
      id: "1",
      method: "extension.open",
      params: { dir: "a", extra: true },
    }),
  ).toEqual(expect.stringContaining("unexpected field extra"));
});

test("responses validate per method result", () => {
  for (const method of EMBEDDER_METHODS)
    expect(
      schemaOf({
        type: "response",
        id: "1",
        ok: true,
        result: SAMPLE_RESULTS[method as string] ?? null,
      }),
    ).toBeNull();
  expect(
    schemaOf({ type: "response", id: "1", ok: false, error: { code: "failed", message: "x" } }),
  ).toBeNull();
  // Loose result shapes accept JSON values; typed result defs reject a value
  // of the wrong kind. The root oneOf cannot tie a response to its method, so
  // per-method results validate against `result/<method>` directly:
  expect(validate(ROOT, def("result.extension.launch"), { session: "1" }, "")).toBeNull();
  expect(validate(ROOT, def("result.extension.launch"), { extension: "1" }, "")).toEqual(
    expect.stringContaining("unexpected field extension"),
  );
  expect(validate(ROOT, def("result.extension.open"), { extension: "1" }, "")).toBeNull();
  expect(schemaOf({ type: "response", id: "1", ok: true, result: "still json" })).toBeNull();
  expect(schemaOf({ type: "response", id: "1", ok: true, result: { session: "1" } })).toBeNull();
  // The ok and error arms each pin `ok`, so a mixed envelope matches neither:
  expect(
    schemaOf({ type: "response", id: "1", ok: true, error: { code: "x", message: "y" } }),
  ).toEqual(expect.stringContaining("did not match any"));
});

test("events validate, including the real fixture scene", () => {
  expect(schemaOf(SCENE_EVENT())).toBeNull();
  for (const event of EVENTS) expect(schemaOf(event)).toBeNull();
  // A fractional exit code is not an integer:
  expect(
    schemaOf({
      type: "event",
      event: "session.exited",
      session: "2",
      code: 0.5,
      error: { code: "x", message: "boom" },
    }),
  ).toEqual(expect.stringContaining("expected type"));
});

test("capability request, result, progress and cancel validate", () => {
  expect(
    schemaOf({
      type: "capability.request",
      id: "9",
      session: "2",
      name: "clipboard.copy",
      params: { html: "<p>a</p>", concealed: false },
    }),
  ).toBeNull();
  expect(
    schemaOf({
      type: "capability.progress",
      id: "9",
      value: { id: "model", streaming: true },
    }),
  ).toBeNull();
  expect(
    schemaOf({
      type: "capability.result",
      id: "9",
      ok: false,
      error: { code: "denied", message: "no", data: { retry: true } },
    }),
  ).toBeNull();
  expect(
    schemaOf({
      type: "capability.result",
      id: "9",
      ok: true,
      value: [1, "two", null, { three: false }],
    }),
  ).toBeNull();
  expect(schemaOf({ type: "capability.cancel", id: "9" })).toBeNull();
  // Wrong shape for a capability's params:
  expect(
    schemaOf({
      type: "capability.request",
      id: "9",
      session: "2",
      name: "clipboard.copy",
      params: { text: true },
    }),
  ).toEqual(expect.stringContaining(`text: expected type string`));
});

test("the catalog is embedded with its declared shapes", () => {
  const catalog = CAPABILITIES as unknown as Record<
    string,
    { scope: string; summary: string; params: Schema; result: Schema; api: readonly string[] }
  >;
  const names = Object.keys(catalog);
  for (const name of names) {
    const spec = catalog[name];
    if (!spec) throw new Error(`missing catalog entry ${name}`);
    const entry = def(`capabilities.${name}`);
    expect(entry.scope).toBe(spec.scope);
    expect(entry.summary).toBe(spec.summary);
    expect(entry.params).toEqual(spec.params);
    expect(entry.result).toEqual(spec.result);
    expect(entry.api).toEqual([...spec.api]);
  }
  expect((def("server.capability.request").oneOf as Schema[]).length).toBe(names.length);
});

test("every method has a request and a result schema entry", () => {
  const requestUnion = def("request").oneOf as string[];
  expect(requestUnion).toHaveLength(EMBEDDER_METHODS.length);
  for (const method of EMBEDDER_METHODS) {
    expect((def(`request.${method}`).properties as Schema).method).toEqual({ const: method });
    // Loose results accept any JSON value; the rest are exact envelopes.
    const result = def(`result.${method}`);
    if (
      [
        "extension.manifest",
        "extension.dependencies.check",
        "extension.dependencies.install",
        "extension.preferences",
      ].includes(method)
    ) {
      expect(result).toEqual({ $ref: "#/$defs/jsonValue" });
    } else if (
      [
        "extension.watch",
        "extension.unwatch",
        "extension.close",
        "extension.savePreferences",
        "session.event",
        "session.input",
        "session.close",
        "engine.shutdown",
      ].includes(method)
    ) {
      expect(result).toEqual({ type: "null" });
    } else if (method === "extension.open") {
      expect(result).toEqual({
        type: "object",
        properties: { extension: { type: "string" } },
        required: ["extension"],
        additionalProperties: false,
      });
    } else {
      expect(result).toEqual({
        type: "object",
        properties: { session: { type: "string" } },
        required: ["session"],
        additionalProperties: false,
      });
    }
  }
});

test("views launch options and every semantic input agree with boundary validation", () => {
  const request = (input: unknown) => ({
    type: "request",
    id: "1",
    method: "session.input",
    params: { session: "2", input },
  });
  const good = [
    ...["search", "actionsQuery", "dropdownQuery"].map((type) => ({ type, text: "a" })),
    ...["up", "down", "left", "right"].map((direction) => ({ type: "move", direction })),
    { type: "select", id: "item" },
    ...["primary", "openActions", "closeActions", "back", "openDropdown", "chooseDropdown"].map(
      (type) => ({ type }),
    ),
    {
      type: "key",
      key: { name: "k", ctrl: true, meta: false, shift: true, option: false, super: false },
    },
    { type: "toastAction", index: 0 },
    { type: "alert", confirm: true },
    { type: "alert", confirm: false, remember: true },
  ];
  for (const input of good) {
    expect(parseEmbedderMessage(request(input)).ok).toBe(true);
    expect(schemaOf(request(input))).toBeNull();
  }
  for (const input of [
    null,
    [],
    { type: "quit" },
    { type: "search" },
    { type: "search", text: 1 },
    { type: "primary", extra: true },
    { type: "move", direction: "diagonal" },
    { type: "key", key: { name: "k", ctrl: "yes" } },
    { type: "key", key: {} },
    { type: "toastAction", index: "0" },
    { type: "alert", confirm: true, remember: 1 },
  ]) {
    expect(parseEmbedderMessage(request(input)).ok).toBe(false);
    expect(schemaOf(request(input))).not.toBeNull();
  }
  for (const views of [
    { platform: "macOS" },
    { platform: "Windows" },
    { platform: "Linux" },
    { platform: "other" },
    { platform: "Linux", extra: true },
    {},
    null,
  ]) {
    const message = {
      type: "request",
      id: "1",
      method: "extension.launch",
      params: { extension: "1", command: "index", views },
    };
    const valid =
      views !== null &&
      Object.keys(views).length === 1 &&
      ["macOS", "Windows", "Linux"].includes(views.platform!);
    expect(parseEmbedderMessage(message).ok).toBe(valid);
    expect(schemaOf(message) === null).toBe(valid);
  }
});

test("session.view requires a session and opaque JSON object view", () => {
  const message = {
    type: "event",
    event: "session.view",
    session: "2",
    view: { kind: "list", rows: [{ title: "apple", selected: true }] },
  };
  expect(schemaOf(message)).toBeNull();
  for (const view of [null, [], "list"]) expect(schemaOf({ ...message, view })).not.toBeNull();
  expect(schemaOf({ type: "event", event: "session.view", session: "2" })).not.toBeNull();
  expect(schemaOf({ type: "event", event: "session.view", view: {} })).not.toBeNull();
});
