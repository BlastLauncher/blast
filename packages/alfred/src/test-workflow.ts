// Test support: writes small Alfred workflows to disk as XML `info.plist`,
// and packs them as `.alfredworkflow` ZIP archives.

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";
import { crc32 } from "./archive.ts";
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

export interface ZipSpec {
  name: string;
  data?: string | Uint8Array;
  method?: number;
  mode?: number;
  madeBy?: number;
  flags?: number;
  crc?: number;
  size?: number;
}

const u16 = (out: number[], v: number) => out.push(v & 0xff, (v >>> 8) & 0xff);
const u32 = (out: number[], v: number) =>
  out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);

// Minimal ZIP writer for fixtures; fields can be overridden to forge
// malformed or hostile archives.
export function zip(specs: ZipSpec[], comment = ""): Uint8Array {
  const local: number[] = [];
  const central: number[] = [];
  for (const spec of specs) {
    const name = new TextEncoder().encode(spec.name);
    const data =
      typeof spec.data === "string"
        ? new TextEncoder().encode(spec.data)
        : (spec.data ?? new Uint8Array());
    const method = spec.method ?? 0;
    const body = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
    const crc = spec.crc ?? crc32(data);
    const size = spec.size ?? data.length;
    const offset = local.length;
    const header = (out: number[], isCentral: boolean) => {
      u32(out, isCentral ? 0x02014b50 : 0x04034b50);
      if (isCentral) u16(out, ((spec.madeBy ?? 3) << 8) | 20);
      u16(out, 20);
      u16(out, spec.flags ?? 0);
      u16(out, method);
      u32(out, 0); // DOS time and date
      u32(out, crc);
      u32(out, body.length);
      u32(out, size);
      u16(out, name.length);
      u16(out, 0); // extra
      if (isCentral) {
        u16(out, 0); // comment
        u16(out, 0); // disk
        u16(out, 0); // internal attributes
        u32(out, ((spec.mode ?? 0o100644) << 16) >>> 0);
        u32(out, offset);
      }
      out.push(...name);
    };
    header(local, false);
    local.push(...body);
    header(central, true);
  }
  const end: number[] = [];
  u32(end, 0x06054b50);
  u16(end, 0);
  u16(end, 0);
  u16(end, specs.length);
  u16(end, specs.length);
  u32(end, central.length);
  u32(end, local.length);
  u16(end, comment.length);
  end.push(...new TextEncoder().encode(comment));
  return new Uint8Array([...local, ...central, ...end]);
}

/** Packs every file under `dir` into an `.alfredworkflow` archive at `archivePath`. */
export async function writeWorkflowArchive(dir: string, archivePath: string): Promise<string> {
  const specs: ZipSpec[] = [];
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    specs.push({
      name: relative(dir, path).split(/[\\/]/).join("/"),
      data: new Uint8Array(await readFile(path)),
      mode: 0o100000 | ((await stat(path)).mode & 0o777),
      method: 8,
    });
  }
  specs.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(archivePath, zip(specs));
  return archivePath;
}
