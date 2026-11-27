// Test support: writes small Alfred workflows to disk as XML `info.plist`.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlistValue } from "./plist.ts";

export type FixtureObject = [uid: string, type: string, config?: Record<string, PlistValue>];
export type FixtureEdge = [from: string, to: string, extra?: Record<string, PlistValue>];

const escape = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function plistXml(value: PlistValue): string {
  if (typeof value === "string") return `<string>${escape(value)}</string>`;
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>";
  if (typeof value === "number") {
    return Number.isInteger(value) ? `<integer>${value}</integer>` : `<real>${value}</real>`;
  }
  if (Array.isArray(value)) return `<array>${value.map(plistXml).join("")}</array>`;
  if (value instanceof Date || value instanceof Uint8Array) {
    throw new Error("plistXml: dates and data are not needed by these fixtures");
  }
  const entries = Object.entries(value).map(
    ([key, entry]) => `<key>${escape(key)}</key>${plistXml(entry)}`,
  );
  return `<dict>${entries.join("")}</dict>`;
}

/** Writes `<dir>/info.plist`; object types may omit the `alfred.workflow.` prefix. */
export async function writeWorkflow(
  dir: string,
  objects: FixtureObject[],
  edges: FixtureEdge[] = [],
  extra: Record<string, PlistValue> = {},
): Promise<string> {
  const connections: Record<string, PlistValue[]> = {};
  for (const [from, to, more] of edges) {
    (connections[from] ??= []).push({ destinationuid: to, modifiers: 0, ...more });
  }
  const plist: Record<string, PlistValue> = {
    bundleid: "com.example.fixture",
    name: "Fixture",
    objects: objects.map(([uid, type, config = {}]) => ({
      uid,
      type: type.startsWith("alfred.") ? type : `alfred.workflow.${type}`,
      version: 1,
      config,
    })),
    connections,
    ...extra,
  };
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">${plistXml(plist)}</plist>\n`,
  );
  return dir;
}
