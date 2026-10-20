// The JSON Schema description of the embedder protocol (decision 0009, point 5).
// It is one exported structure that `scripts/protocol/generate-schema.ts`
// serializes verbatim into `packages/protocol/schema/`; the checked-in file
// must regenerate byte-identical (`bun run protocol:check`). Draft 2020-12
// with a deliberately small keyword set: `type`, `properties`, `required`,
// `additionalProperties`, `items`, `enum`, `const`, `oneOf`, `anyOf` and
// `$ref` — the schema test ships its own validator for exactly those.

import { CAPABILITIES } from "./capabilities.ts";
import { EMBEDDER_METHODS, EMBEDDER_PROTOCOL_VERSION } from "./embedder.ts";
import type { EmbedderParams } from "./embedder.ts";

type Schema = { [key: string]: unknown };

const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const json = ref("jsonValue");
const string: Schema = { type: "string" };
const integer: Schema = { type: "integer" };
const embedderError = ref("embedderError");
const nullResult: Schema = { type: "null" };

const envelope = (required: string[], properties: Schema): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const stringRecord = (item: Schema): Schema => ({
  type: "object",
  additionalProperties: item,
});

/**
 * The result each request method answers. Loose shapes stay JSON values: the
 * engine forwards manifests, dependency reports and preference data without
 * narrowing them here.
 */
const RESULTS: Record<keyof EmbedderParams, Schema> = {
  "extension.open": envelope(["extension"], { extension: string }),
  "extension.launch": envelope(["session"], { session: string }),
  "extension.manifest": json,
  "extension.dependencies.check": json,
  "extension.dependencies.install": json,
  "extension.preferences": json,
  "extension.savePreferences": nullResult,
  "extension.watch": nullResult,
  "extension.unwatch": nullResult,
  "extension.close": nullResult,
  "session.event": nullResult,
  "session.input": nullResult,
  "session.close": nullResult,
  "engine.shutdown": nullResult,
};

/** Optional params per method, mirroring the `?` markers of the wire shapes. */
const OPTIONAL_KEYS: Partial<Record<keyof EmbedderParams, readonly string[]>> = {
  "extension.launch": ["argumentValues", "launchContext", "views"],
};

const PARAMS: Record<keyof EmbedderParams, Schema> = {
  "extension.open": { dir: string },
  "extension.manifest": { extension: string },
  "extension.watch": { extension: string },
  "extension.unwatch": { extension: string },
  "extension.close": { extension: string },
  "extension.dependencies.check": { extension: string },
  "extension.dependencies.install": { extension: string },
  "extension.preferences": { extension: string, command: string },
  "extension.savePreferences": {
    extension: string,
    command: string,
    values: stringRecord({ type: ["string", "number", "boolean"] }),
  },
  "extension.launch": {
    extension: string,
    command: string,
    argumentValues: stringRecord(string),
    launchContext: stringRecord(json),
    views: envelope(["platform"], { platform: { enum: ["macOS", "Windows", "Linux"] } }),
  },
  "session.input": { session: string, input: ref("controllerInput") },
  "session.event": {
    session: string,
    node: string,
    handler: string,
    args: { type: "array", items: json },
  },
  "session.close": { session: string },
  "engine.shutdown": {},
};

// One `request/<method>` envelope def and one `result/<method>` def per
// method, so an embedder can validate both halves of the exchange.
const requestAndResultEntries: Array<[string, Schema]> = EMBEDDER_METHODS.flatMap((name) => {
  const optional = OPTIONAL_KEYS[name] ?? [];
  return [
    [
      `request.${name}`,
      envelope(["type", "id", "method"], {
        type: { const: "request" },
        id: string,
        method: { const: name },
        params: {
          type: "object",
          properties: PARAMS[name],
          required: Object.keys(PARAMS[name]).filter((key) => !optional.includes(key)),
          additionalProperties: false,
        },
      }),
    ],
    [`result.${name}`, RESULTS[name]],
  ];
});

const EVENT_PROPERTIES: Record<string, Schema> = {
  "manifest.changed": { extension: string, manifest: json },
  "manifest.error": { extension: string, error: embedderError },
  "dependencies.log": { extension: string, message: string },
  "session.scene": { session: string, scene: ref("sceneMessage") },
  "session.view": { session: string, view: ref("controllerView") },
  "session.log": { session: string, log: ref("logMessage") },
  "session.exited": { session: string, code: integer, error: embedderError },
};

const eventVariants: Schema[] = Object.entries(EVENT_PROPERTIES).map(([name, props]) =>
  envelope(["type", "event", ...(name === "session.view" ? ["session", "view"] : [])], {
    type: { const: "event" },
    event: { const: name },
    ...props,
  }),
);

// A capability-request variant per catalog entry: the `name` const pins the
// received params to that capability's declared shape.
const capabilityEntries: Array<[string, Schema]> = Object.entries(CAPABILITIES).map(
  ([name, spec]) => [
    `capabilities.${name}`,
    {
      scope: spec.scope,
      summary: spec.summary,
      params: spec.params,
      result: spec.result,
      api: [...spec.api],
    },
  ],
);
const capabilityRequestVariants: Schema[] = Object.keys(CAPABILITIES).map((name) =>
  envelope(["type", "id", "session", "name"], {
    type: { const: "capability.request" },
    id: string,
    session: string,
    name: { const: name },
    params: { $ref: `#/$defs/capabilities.${name}/params` },
  }),
);

const sceneNode: Schema = {
  type: "object",
  properties: {
    id: string,
    type: string,
    props: {
      type: "object",
      additionalProperties: { anyOf: [ref("handlerRef"), json] },
    },
    children: { type: "array", items: ref("sceneNode") },
  },
  required: ["id", "type", "props", "children"],
  additionalProperties: false,
};

/** The whole embedder protocol schema, serialized verbatim by the generator. */
export const EMBEDDER_PROTOCOL_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://blastlauncher.dev/schema/embedder-v1.schema.json",
  title: `Blast embedder protocol v${EMBEDDER_PROTOCOL_VERSION}`,
  description:
    "NDJSON messages of `blast serve` (decision 0011). Each validated instance " +
    "is one line: an embedder -> server or a server -> embedder message.",
  oneOf: [ref("embedderMessages"), ref("serverMessages")],
  $defs: {
    controllerInput: {
      oneOf: [
        ...["search", "actionsQuery", "dropdownQuery"].map((type) =>
          envelope(["type", "text"], { type: { const: type }, text: string }),
        ),
        envelope(["type", "direction"], {
          type: { const: "move" },
          direction: { enum: ["up", "down", "left", "right"] },
        }),
        envelope(["type", "id"], { type: { const: "select" }, id: string }),
        ...["primary", "openActions", "closeActions", "back", "openDropdown", "chooseDropdown"].map(
          (type) => envelope(["type"], { type: { const: type } }),
        ),
        envelope(["type", "key"], {
          type: { const: "key" },
          key: envelope(["name"], {
            name: string,
            ...Object.fromEntries(
              ["ctrl", "meta", "shift", "option", "super"].map((key) => [key, { type: "boolean" }]),
            ),
          }),
        }),
        envelope(["type", "index"], { type: { const: "toastAction" }, index: { type: "number" } }),
        envelope(["type", "confirm"], {
          type: { const: "alert" },
          confirm: { type: "boolean" },
          remember: { type: "boolean" },
        }),
      ],
    },
    controllerView: {
      $comment: "Opaque JSON view model: packages/client-core/src/controller.ts ControllerView.",
      type: "object",
      additionalProperties: json,
    },
    jsonValue: {
      type: ["string", "number", "boolean", "null", "array", "object"],
      items: json,
      additionalProperties: json,
    },
    handlerRef: envelope(["$handler"], { $handler: string }),
    embedderError: envelope(["code", "message"], { code: string, message: string, data: json }),
    sceneNode,
    sceneMessage: envelope(["type", "revision", "root"], {
      type: { const: "scene" },
      revision: integer,
      root: { anyOf: [ref("sceneNode"), { type: "null" }] },
    }),
    logMessage: envelope(["type", "level", "message"], {
      type: { const: "log" },
      level: { type: "string", enum: ["debug", "info", "warn", "error"] },
      message: string,
    }),
    ...Object.fromEntries(requestAndResultEntries),
    request: {
      oneOf: EMBEDDER_METHODS.map((name) => ref(`request.${name}`)),
    },
    "embedder.capability.result": {
      oneOf: [
        envelope(["type", "id", "ok", "value"], {
          type: { const: "capability.result" },
          id: string,
          ok: { const: true },
          value: json,
        }),
        envelope(["type", "id", "ok", "error"], {
          type: { const: "capability.result" },
          id: string,
          ok: { const: false },
          error: embedderError,
        }),
      ],
    },
    "embedder.capability.progress": envelope(["type", "id", "value"], {
      type: { const: "capability.progress" },
      id: string,
      value: json,
    }),
    "embedder.hello": envelope(["type", "protocol", "capabilities"], {
      type: { const: "hello" },
      protocol: integer,
      capabilities: { type: "array", items: string },
    }),
    embedderMessages: {
      oneOf: [
        ref("embedder.hello"),
        ref("request"),
        ref("embedder.capability.result"),
        ref("embedder.capability.progress"),
      ],
    },
    "server.welcome": envelope(["type", "protocol", "engine", "catalog"], {
      type: { const: "welcome" },
      protocol: integer,
      engine: envelope(["version"], { version: string }),
      catalog: { type: "object", additionalProperties: json },
    }),
    "server.error": envelope(["type", "error"], {
      type: { const: "error" },
      error: embedderError,
    }),
    response: {
      oneOf: [
        envelope(["type", "id", "ok", "result"], {
          type: { const: "response" },
          id: string,
          ok: { const: true },
          result: json,
        }),
        envelope(["type", "id", "ok", "error"], {
          type: { const: "response" },
          id: string,
          ok: { const: false },
          error: embedderError,
        }),
      ],
    },
    "server.event": { oneOf: eventVariants },
    "server.capability.request": { oneOf: capabilityRequestVariants },
    "server.capability.cancel": envelope(["type", "id"], {
      type: { const: "capability.cancel" },
      id: string,
    }),
    serverMessages: {
      oneOf: [
        ref("server.welcome"),
        ref("server.error"),
        ref("response"),
        ref("server.event"),
        ref("server.capability.request"),
        ref("server.capability.cancel"),
      ],
    },
    ...Object.fromEntries(capabilityEntries),
  },
} as Schema;

export type EmbedderSchema = Schema;
