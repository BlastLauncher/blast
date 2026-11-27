// Parses what a Script Filter prints: Alfred's JSON format, or the legacy
// `<items>` XML format older workflows still emit. Output comes from arbitrary
// scripts, so values are coerced to their documented types and malformed
// payloads fail with a named error instead of leaking through.

import { normalizeModifierKey } from "./workflow.ts";

export type ScriptFilterIcon = { type?: string; path: string };

export type ScriptFilterMod = {
  valid?: boolean;
  arg?: string | string[];
  subtitle?: string;
  icon?: ScriptFilterIcon;
  variables?: Record<string, string>;
};

export type ScriptFilterAction = string | string[] | Record<string, string | string[]>;

export type ScriptFilterItem = {
  uid?: string;
  title: string;
  subtitle?: string;
  arg?: string | string[];
  valid: boolean;
  autocomplete?: string;
  match?: string;
  type: "default" | "file" | "file:skipcheck";
  icon?: ScriptFilterIcon;
  /** Keyed by canonical modifier combination, e.g. `cmd+shift`. */
  mods?: Record<string, ScriptFilterMod>;
  text?: { copy?: string; largetext?: string };
  quicklookurl?: string;
  variables?: Record<string, string>;
  action?: ScriptFilterAction;
};

export type ScriptFilterOutput = {
  items: ScriptFilterItem[];
  variables?: Record<string, string>;
  /** Seconds before Alfred re-runs the script, clamped to 0.1–5. */
  rerun?: number;
  cache?: { seconds: number; loosereload?: boolean };
  skipknowledge?: boolean;
};

const MAX_XML_DEPTH = 64;

export function parseScriptFilterOutput(stdout: string): ScriptFilterOutput {
  const text = stdout.startsWith("﻿") ? stdout.slice(1) : stdout;
  const trimmed = text.trim();
  if (trimmed === "") return { items: [] };
  if (trimmed.startsWith("<")) return parseXmlOutput(trimmed);
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`script filter: output is not valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
  return parseJsonOutput(payload);
}

// ---------------------------------------------------------------------------
// JSON

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

function variablesOf(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null || raw === undefined) continue;
    out[key] = scalar(raw) ?? JSON.stringify(raw);
  }
  return out;
}

function argOf(value: unknown): string | string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((entry) => scalar(entry)).filter((entry) => entry !== undefined);
  }
  return scalar(value);
}

function iconOf(value: unknown): ScriptFilterIcon | undefined {
  if (!isObject(value) || typeof value.path !== "string" || value.path === "") return undefined;
  return { ...optional("type", scalar(value.type) || undefined), path: value.path };
}

function modOf(value: unknown): ScriptFilterMod | undefined {
  if (!isObject(value)) return undefined;
  return {
    ...optional("valid", typeof value.valid === "boolean" ? value.valid : undefined),
    ...optional("arg", argOf(value.arg)),
    ...optional("subtitle", scalar(value.subtitle)),
    ...optional("icon", iconOf(value.icon)),
    ...optional("variables", variablesOf(value.variables)),
  };
}

function modsOf(value: unknown): Record<string, ScriptFilterMod> | undefined {
  if (!isObject(value)) return undefined;
  const mods: Record<string, ScriptFilterMod> = {};
  for (const [key, raw] of Object.entries(value)) {
    const name = normalizeModifierKey(key);
    const mod = modOf(raw);
    if (name && mod) mods[name] = mod;
  }
  return mods;
}

function actionOf(value: unknown): ScriptFilterAction | undefined {
  if (typeof value === "string" || Array.isArray(value)) return argOf(value);
  if (!isObject(value)) return undefined;
  const action: Record<string, string | string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    const arg = argOf(raw);
    if (arg !== undefined) action[key] = arg;
  }
  return action;
}

function itemType(value: unknown): ScriptFilterItem["type"] {
  return value === "file" || value === "file:skipcheck" ? value : "default";
}

function parseJsonItem(value: unknown, index: number): ScriptFilterItem {
  if (!isObject(value)) throw new Error(`script filter: item ${index + 1} must be an object`);
  const text = isObject(value.text)
    ? {
        ...optional("copy", scalar(value.text.copy)),
        ...optional("largetext", scalar(value.text.largetext)),
      }
    : undefined;
  return {
    ...optional("uid", scalar(value.uid)),
    title: scalar(value.title) ?? "",
    ...optional("subtitle", scalar(value.subtitle)),
    ...optional("arg", argOf(value.arg)),
    valid: value.valid !== false,
    ...optional("autocomplete", scalar(value.autocomplete)),
    ...optional("match", scalar(value.match)),
    type: itemType(value.type),
    ...optional("icon", iconOf(value.icon)),
    ...optional("mods", modsOf(value.mods)),
    ...optional("text", text),
    ...optional("quicklookurl", scalar(value.quicklookurl)),
    ...optional("variables", variablesOf(value.variables)),
    ...optional("action", actionOf(value.action)),
  };
}

function parseJsonOutput(payload: unknown): ScriptFilterOutput {
  if (!isObject(payload)) throw new Error("script filter: JSON output must be an object");
  const items = payload.items ?? [];
  if (!Array.isArray(items)) throw new Error("script filter: `items` must be an array");
  const rerun =
    typeof payload.rerun === "number" && Number.isFinite(payload.rerun)
      ? clamp(payload.rerun, 0.1, 5)
      : undefined;
  const cache =
    isObject(payload.cache) &&
    typeof payload.cache.seconds === "number" &&
    Number.isFinite(payload.cache.seconds)
      ? {
          seconds: clamp(payload.cache.seconds, 5, 86400),
          ...optional(
            "loosereload",
            typeof payload.cache.loosereload === "boolean" ? payload.cache.loosereload : undefined,
          ),
        }
      : undefined;
  return {
    items: items.map(parseJsonItem),
    ...optional("variables", variablesOf(payload.variables)),
    ...optional("rerun", rerun),
    ...optional("cache", cache),
    ...optional(
      "skipknowledge",
      typeof payload.skipknowledge === "boolean" ? payload.skipknowledge : undefined,
    ),
  };
}

// ---------------------------------------------------------------------------
// Legacy XML

type XmlElement = {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

// Unknown or invalid references are kept verbatim: scripts often print a
// stray `&`, and Alfred shows it rather than failing the whole result list.
function decodeEntities(raw: string): string {
  return raw.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/g, (whole, body: string) => {
    if (!body.startsWith("#")) return ENTITIES[body] ?? whole;
    const code = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
    return valid ? String.fromCodePoint(code) : whole;
  });
}

class XmlReader {
  readonly text: string;
  pos = 0;

  constructor(text: string) {
    this.text = text;
  }

  fail(message: string): never {
    throw new Error(`script filter: invalid XML output: ${message} at offset ${this.pos}`);
  }

  skipPast(token: string, what: string): void {
    const end = this.text.indexOf(token, this.pos);
    if (end < 0) this.fail(`unterminated ${what}`);
    this.pos = end + token.length;
  }

  // Whitespace, comments, processing instructions and DOCTYPE outside elements.
  skipMisc(): void {
    for (;;) {
      while (this.pos < this.text.length && /\s/.test(this.text[this.pos]!)) this.pos++;
      if (this.text.startsWith("<!--", this.pos)) this.skipPast("-->", "comment");
      else if (this.text.startsWith("<?", this.pos)) this.skipPast("?>", "processing instruction");
      else if (this.text.startsWith("<!DOCTYPE", this.pos)) this.skipPast(">", "DOCTYPE");
      else return;
    }
  }

  readElement(depth: number): XmlElement {
    if (depth > MAX_XML_DEPTH) this.fail(`nesting deeper than ${MAX_XML_DEPTH}`);
    const head = /^<([A-Za-z_][\w.:-]*)/.exec(this.text.slice(this.pos, this.pos + 128));
    if (!head) this.fail("expected an element");
    const element: XmlElement = { name: head[1]!, attrs: {}, children: [], text: "" };
    this.pos += head[0].length;
    const attribute = /\s*([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')|\s*(\/?>)/y;
    for (;;) {
      attribute.lastIndex = this.pos;
      const match = attribute.exec(this.text);
      if (!match) this.fail(`malformed <${element.name}> tag`);
      this.pos = attribute.lastIndex;
      if (match[4] === "/>") return element;
      if (match[4] === ">") break;
      element.attrs[match[1]!] = decodeEntities(match[2] ?? match[3] ?? "");
    }
    for (;;) {
      const lt = this.text.indexOf("<", this.pos);
      if (lt < 0) this.fail(`unterminated <${element.name}>`);
      element.text += decodeEntities(this.text.slice(this.pos, lt));
      this.pos = lt;
      if (this.text.startsWith("<![CDATA[", this.pos)) {
        const end = this.text.indexOf("]]>", this.pos + 9);
        if (end < 0) this.fail("unterminated CDATA section");
        element.text += this.text.slice(this.pos + 9, end);
        this.pos = end + 3;
      } else if (this.text.startsWith("<!--", this.pos)) {
        this.skipPast("-->", "comment");
      } else if (this.text.startsWith("<?", this.pos)) {
        this.skipPast("?>", "processing instruction");
      } else if (this.text.startsWith("</", this.pos)) {
        const close = /^<\/([A-Za-z_][\w.:-]*)\s*>/.exec(this.text.slice(this.pos, this.pos + 128));
        if (!close || close[1] !== element.name) this.fail(`expected </${element.name}>`);
        this.pos += close[0].length;
        return element;
      } else {
        element.children.push(this.readElement(depth + 1));
      }
    }
  }
}

function xmlBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return !/^(no|false|0)$/i.test(value.trim());
}

function parseXmlItem(item: XmlElement): ScriptFilterItem {
  const { attrs } = item;
  let title = "";
  let subtitle: string | undefined;
  let arg = attrs.arg;
  let icon: ScriptFilterIcon | undefined;
  let quicklookurl: string | undefined;
  const text: { copy?: string; largetext?: string } = {};
  const mods: Record<string, ScriptFilterMod> = {};
  const modFor = (key: string | undefined): ScriptFilterMod | undefined => {
    const name = key === undefined ? undefined : normalizeModifierKey(key);
    if (!name) return undefined;
    return (mods[name] ??= {});
  };

  for (const child of item.children) {
    switch (child.name) {
      case "title":
        title = child.text;
        break;
      case "subtitle":
        if (child.attrs.mod === undefined) subtitle = child.text;
        else {
          const mod = modFor(child.attrs.mod);
          if (mod) mod.subtitle = child.text;
        }
        break;
      case "arg":
        arg = child.text;
        break;
      case "icon":
        if (child.text !== "")
          icon = { ...optional("type", child.attrs.type || undefined), path: child.text };
        break;
      case "text":
        if (child.attrs.type === "copy") text.copy = child.text;
        // Alfred's documentation spells the legacy type `largetype`.
        else if (child.attrs.type === "largetype" || child.attrs.type === "largetext")
          text.largetext = child.text;
        break;
      case "quicklookurl":
        quicklookurl = child.text;
        break;
      case "mod": {
        const mod = modFor(child.attrs.key);
        if (!mod) break;
        if (child.attrs.subtitle !== undefined) mod.subtitle = child.attrs.subtitle;
        if (child.attrs.arg !== undefined) mod.arg = child.attrs.arg;
        const valid = xmlBoolean(child.attrs.valid);
        if (valid !== undefined) mod.valid = valid;
        break;
      }
    }
  }

  return {
    ...optional("uid", attrs.uid),
    title,
    ...optional("subtitle", subtitle),
    ...optional("arg", arg),
    valid: xmlBoolean(attrs.valid) ?? true,
    ...optional("autocomplete", attrs.autocomplete),
    type: itemType(attrs.type),
    ...optional("icon", icon),
    ...optional("mods", Object.keys(mods).length > 0 ? mods : undefined),
    ...optional("text", Object.keys(text).length > 0 ? text : undefined),
    ...optional("quicklookurl", quicklookurl),
  };
}

function parseXmlOutput(text: string): ScriptFilterOutput {
  const reader = new XmlReader(text);
  reader.skipMisc();
  const root = reader.readElement(0);
  reader.skipMisc();
  if (reader.pos < text.length) reader.fail("unexpected content after </items>");
  if (root.name !== "items")
    throw new Error(`script filter: expected <items> root, found <${root.name}>`);
  return {
    items: root.children.filter((child) => child.name === "item").map(parseXmlItem),
  };
}
