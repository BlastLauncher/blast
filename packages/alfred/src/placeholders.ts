// Alfred's text placeholders: `{query}`, `{var:…}`, `{const:…}` and the
// dynamic ones (`{clipboard}`, dates, `{uuid}`, `{random:…}`). Clock,
// randomness and clipboard come from the context so callers can broker them
// and tests stay deterministic.

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { PlistDict } from "./workflow.ts";
import { queryText } from "./scripts.ts";

export type PlaceholderEncoders = {
  /** Applied to `{query}`. */
  query?: (value: string) => string;
  /** Applied to every other placeholder. */
  variable?: (value: string) => string;
};

export type PlaceholderContext = {
  query?: string | string[];
  variables?: Record<string, string>;
  workflow?: { name: string; bundleId: string; description: string; version: string };
  /** `alfred_workflow_data`; `alfred_workflow_cache` is its `cache` folder. */
  supportPath?: string;
  uid?: string;
  /** Text at a clipboard history offset (0 = current); usually a brokered request. */
  readClipboard?: (offset: number) => Promise<string | undefined> | string | undefined;
  now?: () => Date;
  /** Uniform in [0, 1), like `Math.random`. */
  random?: () => number;
  uuid?: () => string;
  /** Object option `ignoredynamicplaceholders`: only `{query}`, `{var:}` and `{const:}` expand. */
  ignoreDynamic?: boolean;
  encode?: PlaceholderEncoders;
};

const PLACEHOLDER =
  /\{(query|clipboard(?::(\d+))?|date|time|datetime|isodate|isotime|uuid|random:([^{}]*)|var:([^{}]+)|const:([^{}]+))\}/g;

const pad = (value: number): string => String(value).padStart(2, "0");

function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function offset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function constant(name: string, context: PlaceholderContext): string | undefined {
  const { workflow, supportPath } = context;
  switch (name) {
    case "alfred_workflow_name":
      return workflow?.name;
    case "alfred_workflow_bundleid":
      return workflow?.bundleId;
    case "alfred_workflow_description":
      return workflow?.description;
    case "alfred_workflow_version":
      return workflow?.version;
    case "alfred_workflow_data":
      return supportPath;
    case "alfred_workflow_cache":
      return supportPath === undefined ? undefined : join(supportPath, "cache");
    case "alfred_workflow_uid":
      return context.uid;
    default:
      return undefined;
  }
}

/**
 * Expands placeholders in one pass; expanded text is never re-scanned. Unknown
 * variables expand to "" as in Alfred; unknown constants stay as written.
 */
export async function expandPlaceholders(
  template: string,
  context: PlaceholderContext,
): Promise<string> {
  const encodeQuery = context.encode?.query ?? ((value: string) => value);
  const encodeOther = context.encode?.variable ?? ((value: string) => value);
  const now = () => (context.now ?? (() => new Date()))();
  let out = "";
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const [whole, body = "", clipboardOffset, randomList, variable, constName] = match;
    out += template.slice(last, match.index);
    last = match.index + whole.length;
    if (body === "query") {
      out += encodeQuery(queryText(context.query ?? ""));
      continue;
    }
    if (variable !== undefined) {
      out += encodeOther(context.variables?.[variable] ?? "");
      continue;
    }
    if (constName !== undefined) {
      const value = constant(constName, context);
      out += value === undefined ? whole : encodeOther(value);
      continue;
    }
    if (context.ignoreDynamic) {
      out += whole;
      continue;
    }
    let value: string;
    if (body.startsWith("clipboard")) {
      const read = await context.readClipboard?.(Number(clipboardOffset ?? 0));
      value = read ?? "";
    } else if (randomList !== undefined) {
      const choices = randomList.split(",").map((choice) => choice.trim());
      const random = (context.random ?? Math.random)();
      value = choices[Math.min(choices.length - 1, Math.floor(random * choices.length))] ?? "";
    } else if (body === "uuid") {
      value = (context.uuid ?? (() => randomUUID().toUpperCase()))();
    } else {
      const date = now();
      value = {
        date: localDate(date),
        time: localTime(date),
        datetime: `${localDate(date)} ${localTime(date)}`,
        isodate: `${localDate(date)}T${localTime(date)}${offset(date)}`,
        isotime: `${localTime(date)}${offset(date)}`,
      }[body as "date"];
    }
    out += encodeOther(value);
  }
  return out + template.slice(last);
}

/**
 * Encoders for an Open URL object: values are percent-encoded unless
 * `skipqueryencode` / `skipvarencode` is set, and encoded spaces become
 * `config.spaces` when it names a replacement such as `+`.
 */
export function urlPlaceholderEncoders(config: PlistDict): Required<PlaceholderEncoders> {
  const spaces = typeof config.spaces === "string" ? config.spaces : "";
  const encode = (value: string): string => {
    const encoded = encodeURIComponent(value);
    return spaces ? encoded.replaceAll("%20", spaces) : encoded;
  };
  const identity = (value: string): string => value;
  return {
    query: config.skipqueryencode === true ? identity : encode,
    variable: config.skipvarencode === true ? identity : encode,
  };
}

export type AlfredWorkflowEnvelope = {
  arg?: string | string[];
  variables?: Record<string, string>;
  config?: Record<string, unknown>;
};

function scalar(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The `{"alfredworkflow": {arg, variables, config}}` payload scripts and the
 * JSON utility print to pass data on. `undefined` when the text is not one.
 */
export function parseAlfredWorkflowEnvelope(text: string): AlfredWorkflowEnvelope | undefined {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed.startsWith("{")) return undefined;
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!isObject(payload) || !isObject(payload.alfredworkflow)) return undefined;
  const { arg, variables, config } = payload.alfredworkflow;
  const envelope: AlfredWorkflowEnvelope = {};
  if (Array.isArray(arg)) {
    envelope.arg = arg.map(scalar).filter((entry) => entry !== undefined);
  } else if (scalar(arg) !== undefined) {
    envelope.arg = scalar(arg)!;
  }
  if (isObject(variables)) {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(variables)) {
      if (value === null || value === undefined) continue;
      out[name] = scalar(value) ?? JSON.stringify(value);
    }
    envelope.variables = out;
  }
  if (isObject(config)) envelope.config = config;
  return envelope;
}
