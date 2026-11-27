// Alfred File Filter search: Spotlight (`mdfind`) on macOS, and a bounded
// directory walk everywhere else or when Spotlight has nothing (an unindexed
// folder, `mdfind` missing). Both apply the same config — scopes, UTIs, field
// filters, date range, sort mode and limit — so results agree in shape.

import { spawn } from "node:child_process";
import { existsSync, type Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { matchesUti, fileUti, utiTree } from "./catalogs.ts";
import type { PlistValue } from "./plist.ts";
import { plistString, type PlistDict } from "./workflow.ts";

export type FileFilterField = {
  /** A Spotlight attribute such as `kMDItemDisplayName`. */
  field: string;
  value: string;
  /** Excludes matches instead of requiring them. */
  not?: boolean;
  /** `value` holds several space-separated alternatives. */
  split?: boolean;
  /** Match at word starts rather than anywhere. */
  words?: boolean;
};

/** The parts of a File Filter's `config` that decide what it finds. */
export type FileFilterConfig = {
  /** Folders to search; empty means the home folder. `~` is expanded. */
  scopes?: readonly string[];
  /** UTIs, matched exactly or through a supertype (`public.image`). */
  types?: readonly string[];
  fields?: readonly FileFilterField[];
  /** `0` any time, then 1, 3, 7, 30 and 90 days since the last change. */
  daterange?: number;
  /** `0` relevance, `1` most recently modified first, `2` by name. */
  sortmode?: number;
  /** `0` is {@link DEFAULT_FILE_LIMIT}; never more than {@link MAX_FILE_RESULTS}. */
  limit?: number;
};

export type FileFilterOptions = FileFilterConfig & {
  query: string;
  signal?: AbortSignal;
  /** Base for `~` and empty scopes; defaults to `os.homedir()`. */
  homeDir?: string;
  now?: () => number;
  /** Directory levels below a scope the portable walk descends. */
  maxDepth?: number;
  /** Directory entries the portable walk looks at before it stops. */
  maxEntries?: number;
  /** Defaults to `process.platform`; only `darwin` asks Spotlight. */
  platform?: string;
  /** Runs `mdfind` with `args` and returns the paths it printed. */
  runMdfind?: (args: string[], signal?: AbortSignal) => Promise<string[]>;
};

export type FileFilterMatch = {
  path: string;
  name: string;
  isDirectory: boolean;
  mtimeMs: number;
};

export const DEFAULT_FILE_LIMIT = 50;
/** Matches `MAX_SCENE_ITEMS`: one view never sends more items. */
export const MAX_FILE_RESULTS = 200;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_ENTRIES = 20_000;
const MDFIND_MAX_RESULTS = 2000;
const DATE_RANGE_DAYS = [0, 1, 3, 7, 30, 90];
const DAY_MS = 24 * 60 * 60 * 1000;
// Bundles Spotlight treats as single files; walking into them only adds noise.
const PACKAGE_EXTENSIONS = new Set([".app", ".bundle", ".framework", ".photoslibrary"]);
const NAME_FIELDS = new Set(["kMDItemDisplayName", "kMDItemFSName"]);
const TYPE_FIELDS = new Set(["kMDItemContentType", "kMDItemContentTypeTree"]);

// A fixed locale keeps name order the same on every machine; numeric order
// puts `file2` before `file10` as Finder does.
const NAME_ORDER = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const abortError = (): Error => Object.assign(new Error("aborted"), { name: "AbortError" });

function integer(value: PlistValue | undefined): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return 0;
}

const strings = (value: PlistValue | undefined): string[] =>
  Array.isArray(value)
    ? value.map((entry) => plistString(entry))
    : typeof value === "string"
      ? [value]
      : [];

/**
 * Reads a File Filter `config` (with upstream overrides applied). `expand`
 * resolves `{var:…}` placeholders in scopes and field values.
 */
export function fileFilterConfig(
  config: PlistDict,
  expand: (text: string) => string = (text) => text,
): FileFilterConfig {
  const fields: FileFilterField[] = [];
  for (const entry of Array.isArray(config.fields) ? config.fields : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const dict = entry as PlistDict;
    const field = plistString(dict.field).trim();
    const value = expand(plistString(dict.value));
    if (field === "" || value === "") continue;
    fields.push({
      field,
      value,
      ...(dict.not === true ? { not: true } : {}),
      ...(dict.split === true ? { split: true } : {}),
      ...(dict.words === true ? { words: true } : {}),
    });
  }
  return {
    scopes: strings(config.scopes)
      .map((scope) => expand(scope).trim())
      .filter(Boolean),
    types: strings(config.types)
      .map((type) => type.trim())
      .filter(Boolean),
    fields,
    daterange: integer(config.daterange),
    sortmode: integer(config.sortmode),
    limit: integer(config.limit),
  };
}

/** Absolute, de-duplicated search roots; `~` is `homeDir`, as is an empty list. */
export function resolveScopes(scopes: readonly string[] | undefined, homeDir: string): string[] {
  const roots = (scopes ?? []).map((scope) => {
    if (scope === "~" || scope.startsWith("~/")) return join(homeDir, scope.slice(1));
    return isAbsolute(scope) ? resolve(scope) : resolve(homeDir, scope);
  });
  return [...new Set(roots.length > 0 ? roots : [homeDir])];
}

/** The result cap for a configured `limit`. */
export function fileFilterLimit(limit: number | undefined): number {
  return limit !== undefined && limit > 0 ? Math.min(limit, MAX_FILE_RESULTS) : DEFAULT_FILE_LIMIT;
}

// Spotlight's `cd` modifiers ignore case and diacritics; the walk does the same.
const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const queryWords = (query: string): string[] => fold(query).split(/\s+/).filter(Boolean);

const fieldValues = (field: FileFilterField): string[] =>
  field.split ? field.value.split(/\s+/).filter(Boolean) : [field.value];

// Inside a quoted Spotlight value `\` escapes, `*` is a wildcard and quotes end it.
const escapeValue = (text: string): string => text.replace(/[\\'"*]/g, "\\$&");
const quote = (text: string): string => `'${escapeValue(text)}'`;
const ATTRIBUTE = /^[A-Za-z_]\w*$/;

/**
 * The Spotlight query for a File Filter: every query word in the file name,
 * any of `types` in the content type tree, the field filters (`not` ones
 * excluding) and the date range. Values are quoted and escaped; malformed
 * attribute names are dropped rather than spliced into the query.
 */
export function buildMdfindQuery(query: string, config: FileFilterConfig): string {
  // `escapeValue` keeps the user's text literal; the surrounding `*` are wildcards.
  const clauses = query
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `kMDItemFSName == '*${escapeValue(word)}*'cd`);
  const types = config.types ?? [];
  if (types.length > 0) {
    clauses.push(
      `(${types.map((type) => `kMDItemContentTypeTree == ${quote(type)}`).join(" || ")})`,
    );
  }
  for (const field of config.fields ?? []) {
    if (!ATTRIBUTE.test(field.field)) continue;
    const op = field.not ? "!=" : "==";
    const tests = fieldValues(field).map((value) => {
      const inner = escapeValue(value);
      if (TYPE_FIELDS.has(field.field)) return `${field.field} ${op} '${inner}'`;
      return field.words
        ? `${field.field} ${op} '${inner}*'cdw`
        : `${field.field} ${op} '*${inner}*'cd`;
    });
    // Any alternative may match; a negated filter must avoid them all.
    clauses.push(`(${tests.join(field.not ? " && " : " || ")})`);
  }
  const days = DATE_RANGE_DAYS[config.daterange ?? 0] ?? 0;
  if (days > 0) clauses.push(`kMDItemFSContentChangeDate >= $time.today(-${days})`);
  return clauses.length > 0 ? clauses.join(" && ") : "kMDItemFSName == '*'";
}

function fieldMatches(field: FileFilterField, path: string, isDirectory: boolean): boolean {
  const values = fieldValues(field);
  let hit: boolean;
  if (TYPE_FIELDS.has(field.field)) {
    const tree =
      field.field === "kMDItemContentType"
        ? [fileUti(path, isDirectory)]
        : utiTree(fileUti(path, isDirectory));
    hit = values.some((value) => tree.includes(value));
  } else {
    const text = fold(field.field === "kMDItemPath" ? path : basename(path));
    hit = values.some((value) => text.includes(fold(value)));
  }
  return field.not ? !hit : hit;
}

/** Fields the walk can judge from a path alone; anything else Spotlight-only is skipped. */
const walkable = (field: FileFilterField): boolean =>
  NAME_FIELDS.has(field.field) || TYPE_FIELDS.has(field.field) || field.field === "kMDItemPath";

function sortMatches(
  matches: FileFilterMatch[],
  query: string,
  sortmode: number | undefined,
): FileFilterMatch[] {
  if (sortmode === 1) {
    return matches.toSorted((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  }
  if (sortmode === 2) {
    return matches.toSorted(
      (a, b) => NAME_ORDER.compare(a.name, b.name) || a.path.localeCompare(b.path),
    );
  }
  // Relevance, as Alfred ranks titles: names starting with the query, then
  // containing it, then the rest; walk (shallowest-first) order within each.
  const needle = fold(query.trim());
  if (needle === "") return matches;
  const rank = (match: FileFilterMatch): number => {
    const name = fold(match.name);
    return name.startsWith(needle) ? 0 : name.includes(needle) ? 1 : 2;
  };
  return matches
    .map((match, index) => ({ match, index, rank: rank(match) }))
    .toSorted((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.match);
}

/**
 * Searches `scopes` breadth-first with `readdir`, without Spotlight. Hidden
 * entries are skipped unless the query starts with `.`; symlinks and bundles
 * are not entered; unreadable folders are passed over. Depth and the number
 * of entries looked at are capped so a scope of `/` stays bounded.
 */
export async function searchFilesPortable(options: FileFilterOptions): Promise<FileFilterMatch[]> {
  const { signal } = options;
  const now = options.now ?? Date.now;
  const words = queryWords(options.query);
  const showHidden = options.query.trimStart().startsWith(".");
  const types = options.types ?? [];
  const fields = (options.fields ?? []).filter(walkable);
  const days = DATE_RANGE_DAYS[options.daterange ?? 0] ?? 0;
  const since = days > 0 ? now() - days * DAY_MS : undefined;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const queue = resolveScopes(options.scopes, options.homeDir ?? homedir()).map((dir) => ({
    dir,
    depth: 0,
  }));
  const seen = new Set<string>();
  const found: FileFilterMatch[] = [];
  let visited = 0;
  while (queue.length > 0 && visited < maxEntries) {
    if (signal?.aborted) throw abortError();
    const { dir, depth } = queue.shift()!;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    // Sorted so results never depend on the file system's listing order.
    for (const entry of entries.toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
      if (visited++ >= maxEntries) break;
      const { name } = entry;
      if (!showHidden && name.startsWith(".")) continue;
      const path = join(dir, name);
      const isDirectory = entry.isDirectory();
      if (isDirectory && depth < maxDepth && !PACKAGE_EXTENSIONS.has(extname(name).toLowerCase())) {
        queue.push({ dir: path, depth: depth + 1 });
      }
      if (seen.has(path)) continue;
      const folded = fold(name);
      if (!words.every((word) => folded.includes(word))) continue;
      if (!matchesUti(path, isDirectory, types)) continue;
      if (!fields.every((field) => fieldMatches(field, path, isDirectory))) continue;
      seen.add(path);
      let mtimeMs: number;
      try {
        mtimeMs = (await lstat(path)).mtimeMs;
      } catch {
        continue;
      }
      if (since !== undefined && mtimeMs < since) continue;
      found.push({ path, name, isDirectory, mtimeMs });
    }
  }
  if (signal?.aborted) throw abortError();
  return sortMatches(found, options.query, options.sortmode).slice(
    0,
    fileFilterLimit(options.limit),
  );
}

/** `/usr/bin/mdfind -0 …`, stopping after {@link MDFIND_MAX_RESULTS} paths. */
function runMdfind(args: string[], signal?: AbortSignal): Promise<string[]> {
  return new Promise((resolvePaths, reject) => {
    const child = spawn("/usr/bin/mdfind", args, {
      stdio: ["ignore", "pipe", "ignore"],
      ...(signal ? { signal } : {}),
    });
    const paths: string[] = [];
    let rest = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      const parts = (rest + chunk).split("\0");
      rest = parts.pop()!;
      for (const part of parts) if (part && paths.length < MDFIND_MAX_RESULTS) paths.push(part);
      if (paths.length >= MDFIND_MAX_RESULTS) child.kill();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (signal?.aborted) return reject(abortError());
      if (paths.length >= MDFIND_MAX_RESULTS) return resolvePaths(paths);
      if (rest) paths.push(rest);
      if (code !== 0) return reject(new Error(`mdfind exited with ${code ?? "a signal"}`));
      resolvePaths(paths);
    });
  });
}

/**
 * File Filter search. On macOS Spotlight answers, once per scope; when
 * `mdfind` fails, or finds nothing although a scope exists (Spotlight skips
 * temporary and excluded folders), the portable walk answers instead.
 */
export async function searchFiles(options: FileFilterOptions): Promise<FileFilterMatch[]> {
  if ((options.platform ?? process.platform) !== "darwin") return searchFilesPortable(options);
  const { signal } = options;
  const run = options.runMdfind ?? runMdfind;
  const scopes = resolveScopes(options.scopes, options.homeDir ?? homedir());
  const query = buildMdfindQuery(options.query, options);
  const paths: string[] = [];
  try {
    for (const scope of scopes) paths.push(...(await run(["-0", "-onlyin", scope, query], signal)));
  } catch (error) {
    if (signal?.aborted || (error as Error)?.name === "AbortError") throw abortError();
    return searchFilesPortable(options);
  }
  if (signal?.aborted) throw abortError();
  if (paths.length === 0) {
    return scopes.some((scope) => existsSync(scope)) ? searchFilesPortable(options) : [];
  }
  const found: FileFilterMatch[] = [];
  for (const path of new Set(paths)) {
    try {
      const info = await lstat(path);
      found.push({
        path,
        name: basename(path),
        isDirectory: info.isDirectory(),
        mtimeMs: info.mtimeMs,
      });
    } catch {
      // Gone since Spotlight indexed it.
    }
  }
  return sortMatches(found, options.query, options.sortmode).slice(
    0,
    fileFilterLimit(options.limit),
  );
}
