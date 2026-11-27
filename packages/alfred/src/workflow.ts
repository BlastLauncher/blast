// Typed model of an Alfred workflow's `info.plist`: the object graph, its
// connections, workflow variables and the user configuration sheet. Parsing is
// tolerant of missing optional sections (older Alfred versions omit them) but
// rejects documents that are not workflows at all.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePlist, type PlistValue } from "./plist.ts";

export type PlistDict = { [key: string]: PlistValue };

export type ModifierName = "cmd" | "alt" | "ctrl" | "shift" | "fn";

export type AlfredObject = {
  uid: string;
  /** Fully qualified type, e.g. `alfred.workflow.input.scriptfilter`. */
  type: string;
  version: number;
  config: PlistDict;
  /** Alfred 5 `inboundconfig`; `externalid` lets External Triggers target the object. */
  inboundConfig?: PlistDict;
};

export type AlfredConnection = {
  from: string;
  to: string;
  /** `NSEventModifierFlags` bitmask; 0 when the connection fires without modifiers. */
  modifiers: number;
  modifierSubtext: string;
  vitoclose: boolean;
  disabled: boolean;
  /** Set when the connection leaves a specific output of a multi-output object. */
  sourceOutputUid?: string;
};

export type AlfredUserConfigItem = {
  type: string;
  variable: string;
  label: string;
  description: string;
  config: PlistDict;
};

export type AlfredListFilterItem = {
  title: string;
  subtitle: string;
  arg: string;
  imagefile?: string;
  match?: string;
  autocomplete?: string;
};

export type AlfredWorkflow = {
  bundleId: string;
  name: string;
  description: string;
  createdBy: string;
  webAddress: string;
  version: string;
  readme: string;
  category: string;
  disabled: boolean;
  objects: AlfredObject[];
  connections: AlfredConnection[];
  variables: Record<string, string>;
  variablesDontExport: string[];
  userConfig: AlfredUserConfigItem[];
  uidata: Record<string, PlistDict>;
  /** The unpacked workflow directory, set by `loadWorkflow`. */
  dir?: string;
};

// Canonical order matches how Alfred and macOS menus spell combinations.
const MODIFIER_BITS: [ModifierName, number][] = [
  ["cmd", 1 << 20],
  ["alt", 1 << 19],
  ["ctrl", 1 << 18],
  ["shift", 1 << 17],
  ["fn", 1 << 23],
];

const MODIFIER_ALIASES: Record<string, ModifierName> = {
  cmd: "cmd",
  command: "cmd",
  alt: "alt",
  option: "alt",
  opt: "alt",
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  fn: "fn",
};

export function isDict(value: unknown): value is PlistDict {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  );
}

export function plistString(value: PlistValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function integer(value: PlistValue | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

/** Modifier names set in an `NSEventModifierFlags` mask, in canonical order. */
export function decodeModifierMask(mask: number): ModifierName[] {
  if (!Number.isSafeInteger(mask) || mask <= 0) return [];
  return MODIFIER_BITS.filter(([, bit]) => Math.floor(mask / bit) % 2 === 1).map(([name]) => name);
}

/**
 * Canonical `cmd+alt+ctrl+shift+fn` spelling of a modifier combination, or
 * `undefined` when the key is empty or names something that is not a modifier.
 */
export function normalizeModifierKey(key: string): string | undefined {
  const names = new Set<ModifierName>();
  for (const token of key.toLowerCase().split("+")) {
    const name = MODIFIER_ALIASES[token.trim()];
    if (!name) return undefined;
    names.add(name);
  }
  return MODIFIER_BITS.map(([name]) => name)
    .filter((name) => names.has(name))
    .join("+");
}

/** Builds the workflow model from a parsed `info.plist`. */
export function parseWorkflow(plist: PlistValue): AlfredWorkflow {
  if (!isDict(plist)) {
    const kind = Array.isArray(plist) ? "an array" : typeof plist;
    throw new Error(`alfred: info.plist root must be a dictionary, found ${kind}`);
  }
  const variables: Record<string, string> = {};
  if (isDict(plist.variables)) {
    for (const [key, value] of Object.entries(plist.variables)) {
      variables[key] = typeof value === "boolean" ? (value ? "1" : "0") : plistString(value);
    }
  }
  const uidata: Record<string, PlistDict> = {};
  if (isDict(plist.uidata)) {
    for (const [uid, value] of Object.entries(plist.uidata)) {
      if (isDict(value)) uidata[uid] = value;
    }
  }
  return {
    bundleId: plistString(plist.bundleid),
    name: plistString(plist.name),
    description: plistString(plist.description),
    createdBy: plistString(plist.createdby),
    webAddress: plistString(plist.webaddress),
    version: plistString(plist.version),
    readme: plistString(plist.readme),
    category: plistString(plist.category),
    disabled: plist.disabled === true,
    objects: parseObjects(plist.objects),
    connections: parseConnections(plist.connections),
    variables,
    variablesDontExport: Array.isArray(plist.variablesdontexport)
      ? plist.variablesdontexport.filter((name): name is string => typeof name === "string")
      : [],
    userConfig: parseUserConfig(plist.userconfigurationconfig),
    uidata,
  };
}

function parseObjects(value: PlistValue | undefined): AlfredObject[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("alfred: info.plist `objects` must be an array");
  return value.map((entry, index) => {
    if (!isDict(entry)) throw new Error(`alfred: object ${index + 1} must be a dictionary`);
    const uid = plistString(entry.uid);
    const type = plistString(entry.type);
    if (!uid) throw new Error(`alfred: object ${index + 1} needs a uid`);
    if (!type) throw new Error(`alfred: object ${uid} needs a type`);
    return {
      uid,
      type,
      version: integer(entry.version, 1),
      config: isDict(entry.config) ? entry.config : {},
      ...(isDict(entry.inboundconfig) ? { inboundConfig: entry.inboundconfig } : {}),
    };
  });
}

function parseConnections(value: PlistValue | undefined): AlfredConnection[] {
  if (value === undefined) return [];
  if (!isDict(value)) throw new Error("alfred: info.plist `connections` must be a dictionary");
  const connections: AlfredConnection[] = [];
  for (const [from, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!isDict(entry)) continue;
      const to = plistString(entry.destinationuid);
      if (!to) continue;
      const sourceOutputUid = plistString(entry.sourceoutputuid);
      connections.push({
        from,
        to,
        modifiers: integer(entry.modifiers),
        modifierSubtext: plistString(entry.modifiersubtext),
        vitoclose: entry.vitoclose === true,
        disabled: entry.disabled === true,
        ...(sourceOutputUid ? { sourceOutputUid } : {}),
      });
    }
  }
  return connections;
}

function parseUserConfig(value: PlistValue | undefined): AlfredUserConfigItem[] {
  if (!Array.isArray(value)) return [];
  const items: AlfredUserConfigItem[] = [];
  for (const entry of value) {
    if (!isDict(entry)) continue;
    const variable = plistString(entry.variable);
    if (!variable) continue;
    items.push({
      type: plistString(entry.type),
      variable,
      label: plistString(entry.label),
      description: plistString(entry.description),
      config: isDict(entry.config) ? entry.config : {},
    });
  }
  return items;
}

/** Reads and parses `<workflowDir>/info.plist` (XML or binary). */
export async function loadWorkflow(workflowDir: string): Promise<AlfredWorkflow> {
  const path = join(workflowDir, "info.plist");
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch (error) {
    throw new Error(`alfred: cannot read ${path}: ${(error as Error).message}`, { cause: error });
  }
  return { ...parseWorkflow(parsePlist(bytes)), dir: workflowDir };
}

/**
 * List Filter items. Alfred stores `config.items` as a JSON-encoded string;
 * already-decoded arrays are accepted too.
 */
export function parseListFilterItems(raw: PlistValue): AlfredListFilterItem[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try {
      list = JSON.parse(raw);
    } catch (error) {
      throw new Error(`alfred: list filter items are not valid JSON: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
  if (!Array.isArray(list)) throw new Error("alfred: list filter items must be an array");
  const items: AlfredListFilterItem[] = [];
  for (const entry of list as unknown[]) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const text = (key: string): string => {
      const value = record[key];
      return typeof value === "string" || typeof value === "number" ? String(value) : "";
    };
    items.push({
      title: text("title"),
      subtitle: text("subtitle"),
      arg: text("arg"),
      ...(text("imagefile") ? { imagefile: text("imagefile") } : {}),
      ...(text("match") ? { match: text("match") } : {}),
      ...(text("autocomplete") ? { autocomplete: text("autocomplete") } : {}),
    });
  }
  return items;
}
