// Alfred Automation Tasks (`alfred.workflow.automation.task`), keyed by their
// `taskuid`. Each task reads its `tasksettings`, works on the incoming
// argument and returns the argument it passes on. Filesystem work happens
// here; anything privileged (Trash, windows, apps, browser tabs) goes through
// the brokered `request`, so the host decides what a workflow may do.

import { cp, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { matchesUti } from "./catalogs.ts";
import type { GraphArg, GraphCapability } from "./graph.ts";
import type { PlistValue } from "./plist.ts";
import { queryText } from "./scripts.ts";
import { isDict, type PlistDict } from "./workflow.ts";

export type AutomationTaskContext = {
  /** The task's `tasksettings`, unexpanded. */
  settings: PlistDict;
  arg: GraphArg;
  /** Expands Alfred placeholders against the incoming argument and variables. */
  expand(template: string): Promise<string>;
  request(capability: GraphCapability, params: Record<string, unknown>): Promise<unknown>;
  homeDir: string;
  now: () => Date;
  random: () => number;
};

type Task = (context: AutomationTaskContext) => Promise<GraphArg>;

const CORE = "com.alfredapp.automation.core/";
const FILES = `${CORE}files-and-folders/`;
const TEXT = `${CORE}text-processing/`;
const ARGS = `${CORE}argument-processing/`;
const WINDOWS = `${CORE}window-management/`;

const items = (arg: GraphArg): string[] => (Array.isArray(arg) ? arg : [arg]);
const mapArg = (arg: GraphArg, fn: (text: string) => string): GraphArg =>
  Array.isArray(arg) ? arg.map(fn) : fn(arg);
const shaped = (list: string[], single: boolean): GraphArg => (single ? (list[0] ?? "") : list);

function expandTilde(path: string, home: string): string {
  return path === "~" ? home : path.startsWith("~/") ? join(home, path.slice(2)) : path;
}

/** A setting as text, placeholders expanded; numbers and booleans as Alfred prints them. */
async function text(context: AutomationTaskContext, name: string, fallback = ""): Promise<string> {
  const value = context.settings[name];
  if (typeof value === "string") return context.expand(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return fallback;
}

async function flag(context: AutomationTaskContext, name: string, fallback: boolean) {
  const value = context.settings[name];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return fallback;
  const expanded = (await context.expand(value)).trim().toLowerCase();
  if (expanded === "") return fallback;
  return ["true", "yes", "1"].includes(expanded);
}

async function count(context: AutomationTaskContext, name: string): Promise<number> {
  const raw = (await text(context, name)).trim();
  const value = Number(raw);
  if (raw === "" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a whole number, got ${JSON.stringify(raw)}`);
  }
  return value;
}

/** The `target_path` setting, expanded, when it names a path rather than the input. */
async function targetPath(context: AutomationTaskContext): Promise<string | undefined> {
  const raw = context.settings.target_path;
  // A bare `{query}` means "the input", which may be a list.
  if (typeof raw !== "string" || raw.trim() === "" || raw.trim() === "{query}") return undefined;
  return expandTilde((await context.expand(raw)).trim(), context.homeDir);
}

type Targets = { paths: string[]; single: boolean };

function incoming(context: AutomationTaskContext): Targets {
  return {
    paths: items(context.arg)
      .map((path) => expandTilde(path.trim(), context.homeDir))
      .filter((path) => path !== ""),
    single: !Array.isArray(context.arg),
  };
}

/**
 * The paths a task works on: `target_path` when set, else the incoming
 * argument(s). `single` keeps a lone string a string.
 */
async function targets(context: AutomationTaskContext): Promise<Targets> {
  const path = await targetPath(context);
  return path === undefined ? incoming(context) : { paths: [path], single: true };
}

/** Path transforms keep the input's shape, empty entries included. */
async function mapPaths(
  context: AutomationTaskContext,
  fn: (path: string) => string,
): Promise<GraphArg> {
  const path = await targetPath(context);
  if (path !== undefined) return fn(path);
  return mapArg(context.arg, (item) => fn(expandTilde(item.trim(), context.homeDir)));
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const PERIODS: Readonly<Record<string, number>> = {
  S: 1000,
  M: 60_000,
  H: 3_600_000,
  D: 86_400_000,
  W: 604_800_000,
};

async function ageLimit(context: AutomationTaskContext): Promise<number> {
  const raw = (await text(context, "unit")).trim();
  const unit = Number(raw);
  if (raw === "" || !Number.isFinite(unit) || unit < 0) {
    throw new Error(`unit must be a number, got ${JSON.stringify(raw)}`);
  }
  const period = (await text(context, "period", "D")).trim().toUpperCase() || "D";
  const ms = PERIODS[period];
  if (ms === undefined) throw new Error(`unknown period ${JSON.stringify(period)}`);
  return unit * ms;
}

/** Milliseconds since `path` was modified, or `undefined` when it is missing. */
async function age(context: AutomationTaskContext, path: string): Promise<number | undefined> {
  const info = await stat(path).catch(() => undefined);
  return info ? context.now().getTime() - info.mtimeMs : undefined;
}

const byName = (a: string, b: string): number => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
};

async function sortedChildren(context: AutomationTaskContext, order: string): Promise<string[]> {
  const { paths } = await targets(context);
  const dir = paths[0];
  if (dir === undefined) throw new Error("no folder to list");
  const match = /^by_(name|added|created|modified)(?:_(ascending|descending))?$/.exec(order);
  if (!match) throw new Error(`unknown sort_order ${JSON.stringify(order)}`);
  const key = match[1]!;
  // Names read A→Z by default; dates newest first, as Alfred's "by added" lists.
  const descending = match[2] ? match[2] === "descending" : key !== "name";
  const hidden = await flag(context, "include_hidden", false);
  const names = (await readdir(dir)).filter((name) => hidden || !name.startsWith("."));
  const entries = await Promise.all(
    names.map(async (name) => {
      const info = await stat(join(dir, name));
      const time =
        key === "modified" ? info.mtimeMs : info.birthtimeMs || info.ctimeMs || info.mtimeMs;
      return { name, time };
    }),
  );
  const sign = descending ? -1 : 1;
  entries.sort((a, b) =>
    key === "name"
      ? sign * byName(a.name, b.name)
      : sign * (a.time - b.time) || byName(a.name, b.name),
  );
  return entries.map((entry) => join(dir, entry.name));
}

async function transfer(context: AutomationTaskContext, move: boolean): Promise<GraphArg> {
  const saveIn = expandTilde((await text(context, "save_in")).trim(), context.homeDir);
  if (saveIn === "") throw new Error("save_in names no folder");
  const folder = await stat(saveIn).catch(() => undefined);
  if (!folder?.isDirectory()) throw new Error(`${saveIn} is not a folder`);
  const overwrite = await flag(context, "overwrite", false);
  // The incoming files come first here; `target_path` only fills in for none.
  const input = incoming(context);
  const { paths, single } = input.paths.length > 0 ? input : await targets(context);
  const done: string[] = [];
  for (const source of paths) {
    const destination = join(saveIn, basename(source));
    // Checked first, so an overwrite never removes a file for a missing source.
    if (!(await exists(source))) throw new Error(`no file at ${JSON.stringify(source)}`);
    if (resolve(source) !== resolve(destination)) {
      if (await exists(destination)) {
        if (!overwrite) throw new Error(`${destination} already exists`);
        await rm(destination, { recursive: true, force: true });
      }
      if (!move) {
        await cp(source, destination, { recursive: true });
      } else {
        await rename(source, destination).catch(async (error: NodeJS.ErrnoException) => {
          // Another volume: copy, then remove the original.
          if (error.code !== "EXDEV") throw error;
          await cp(source, destination, { recursive: true });
          await rm(source, { recursive: true, force: true });
        });
      }
    }
    done.push(destination);
  }
  return shaped(done, single);
}

async function filterByAge(context: AutomationTaskContext, older: boolean): Promise<GraphArg> {
  const limit = await ageLimit(context);
  const { paths } = await targets(context);
  const kept: string[] = [];
  for (const path of paths) {
    const ms = await age(context, path);
    if (ms !== undefined && (older ? ms > limit : ms < limit)) kept.push(path);
  }
  return kept;
}

function shuffle(list: string[], random: () => number): string[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// Windows ---------------------------------------------------------------------

type Rect = { x: number; y: number; width: number; height: number };
type Desktop = {
  id: string;
  screenId?: string;
  active?: boolean;
  size: { width: number; height: number };
};
type ActiveWindow = { id: string; desktopId?: string; bounds: unknown };

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Raycast-style `{ position, size }` or a flat `{ x, y, width, height }`. */
export function windowRect(bounds: unknown): Rect | undefined {
  if (typeof bounds !== "object" || bounds === null) return undefined;
  const b = bounds as Record<string, unknown>;
  const position = (b.position ?? b) as Record<string, unknown>;
  const size = (b.size ?? b) as Record<string, unknown>;
  const rect = { x: position.x, y: position.y, width: size.width, height: size.height };
  return finite(rect.x) && finite(rect.y) && finite(rect.width) && finite(rect.height)
    ? (rect as Rect)
    : undefined;
}

const nested = (rect: Rect) => ({
  position: { x: rect.x, y: rect.y },
  size: { width: rect.width, height: rect.height },
});

async function activeWindow(context: AutomationTaskContext): Promise<ActiveWindow> {
  const win = (await context.request("window.active", {})) as Partial<ActiveWindow> | null;
  if (!win || typeof win.id !== "string") throw new Error("there is no active window");
  return win as ActiveWindow;
}

async function desktops(context: AutomationTaskContext): Promise<Desktop[]> {
  const list = await context.request("window.desktops", {});
  if (!Array.isArray(list)) return [];
  return (list as Desktop[]).filter(
    (desktop) =>
      typeof desktop?.id === "string" &&
      finite(desktop.size?.width) &&
      finite(desktop.size?.height),
  );
}

const screenOf = (desktop: Desktop): string => desktop.screenId ?? desktop.id;

function desktopIndex(list: Desktop[], win: ActiveWindow): number {
  const own = list.findIndex((desktop) => desktop.id === win.desktopId);
  if (own >= 0) return own;
  return Math.max(
    0,
    list.findIndex((desktop) => desktop.active === true),
  );
}

// Fractions of the desktop: [x, y, width, height].
const PRESETS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  maximise: [0, 0, 1, 1],
  "half-left": [0, 0, 1 / 2, 1],
  "half-right": [1 / 2, 0, 1 / 2, 1],
  "half-top": [0, 0, 1, 1 / 2],
  "half-bottom": [0, 1 / 2, 1, 1 / 2],
  "third-left": [0, 0, 1 / 3, 1],
  "third-centrewidth": [1 / 3, 0, 1 / 3, 1],
  "third-right": [2 / 3, 0, 1 / 3, 1],
  "twothirds-left": [0, 0, 2 / 3, 1],
  "twothirds-centrewidth": [1 / 6, 0, 2 / 3, 1],
  "twothirds-right": [1 / 3, 0, 2 / 3, 1],
  "quarter-topleft": [0, 0, 1 / 2, 1 / 2],
  "quarter-topright": [1 / 2, 0, 1 / 2, 1 / 2],
  "quarter-bottomleft": [0, 1 / 2, 1 / 2, 1 / 2],
  "quarter-bottomright": [1 / 2, 1 / 2, 1 / 2, 1 / 2],
};

/** Where `preset` puts a window on a desktop of `size` (desktop-relative, whole pixels). */
export function presetRect(
  preset: string,
  size: { width: number; height: number },
  current?: Rect,
): Rect {
  const name = preset === "maximize" ? "maximise" : preset === "center" ? "centre" : preset;
  if (name === "centre") {
    if (!current) throw new Error("the active window has no size to centre");
    const width = Math.min(current.width, size.width);
    const height = Math.min(current.height, size.height);
    return {
      x: Math.round((size.width - width) / 2),
      y: Math.round((size.height - height) / 2),
      width,
      height,
    };
  }
  const fractions = PRESETS[name];
  if (!fractions) throw new Error(`unknown window preset ${JSON.stringify(preset)}`);
  const [fx, fy, fw, fh] = fractions;
  // Edges rounded independently, so neighbouring presets tile without gaps.
  const x = Math.round(fx * size.width);
  const y = Math.round(fy * size.height);
  return {
    x,
    y,
    width: Math.round((fx + fw) * size.width) - x,
    height: Math.round((fy + fh) * size.height) - y,
  };
}

async function numberSetting(
  context: AutomationTaskContext,
  name: string,
  fallback: number | undefined,
): Promise<number> {
  const raw = (await text(context, name)).trim();
  if (raw === "" && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number, got ${JSON.stringify(raw)}`);
  }
  return value;
}

// Browser ---------------------------------------------------------------------

type Tab = { url?: string; title?: string; active?: boolean };

function formatTab(tab: Tab, format: string): string {
  const url = tab.url ?? "";
  const title = tab.title ?? "";
  switch (format) {
    case "url":
      return url;
    case "title":
      return title;
    case "url_tab_title":
      return `${url}\t${title}`;
    case "title_tab_url":
      return `${title}\t${url}`;
    case "markdown":
      return `[${title}](${url})`;
    default:
      throw new Error(`unknown out_format ${JSON.stringify(format)}`);
  }
}

// Tasks -----------------------------------------------------------------------

export const AUTOMATION_TASKS: Readonly<Record<string, Task>> = {
  [`${FILES}path.exists`]: async (context) => {
    const { paths } = await targets(context);
    if (paths.length === 0) return "false";
    const found = await Promise.all(paths.map(exists));
    return found.every(Boolean) ? "true" : "false";
  },

  [`${FILES}path.trash`]: async (context) => {
    const { paths } = await targets(context);
    if (paths.length > 0) await context.request("trash", { paths });
    return context.arg;
  },

  [`${FILES}file.read`]: async (context) => {
    const { paths } = await targets(context);
    if (paths[0] === undefined) throw new Error("no file to read");
    return readFile(paths[0], "utf8");
  },

  [`${FILES}directory.new`]: async (context) => {
    const { paths, single } = await targets(context);
    for (const path of paths) await mkdir(path, { recursive: true });
    return shaped(paths, single);
  },

  [`${FILES}directory.children.sort`]: async (context) =>
    sortedChildren(context, (await text(context, "sort_order")).trim() || "by_name"),

  [`${FILES}directory.children.sort.added.leading.1`]: async (context) =>
    (await sortedChildren(context, "by_added"))[0] ?? "",

  [`${FILES}finder.move`]: (context) => transfer(context, true),
  [`${FILES}finder.copy`]: (context) => transfer(context, false),

  [`${FILES}file.quicklook`]: async (context) => {
    const { paths } = await targets(context);
    for (const path of paths) await context.request("open.path", { path });
    return context.arg;
  },

  [`${FILES}file.uti.matching`]: async (context) => {
    const types = (await text(context, "match_string")).split(/[\s,]+/).filter(Boolean);
    const invert = await flag(context, "invert", false);
    const { paths } = await targets(context);
    const kept: string[] = [];
    for (const path of paths) {
      const info = await stat(path).catch(() => undefined);
      if (info && matchesUti(path, info.isDirectory(), types) !== invert) kept.push(path);
    }
    return kept;
  },

  [`${FILES}path.basename`]: async (context) => {
    const bare = await flag(context, "no_extension", false);
    return mapPaths(context, (path) => basename(path, bare ? extname(path) : undefined));
  },
  [`${FILES}path.dirname`]: (context) => mapPaths(context, (path) => (path ? dirname(path) : "")),
  [`${FILES}path.extension`]: (context) => mapPaths(context, (path) => extname(path).slice(1)),
  [`${FILES}path.expand-tilde`]: (context) => mapPaths(context, (path) => path),

  [`${FILES}path.older-than`]: async (context) => {
    const limit = await ageLimit(context);
    const { paths } = await targets(context);
    const path = paths[0];
    const ms = path === undefined ? undefined : await age(context, path);
    if (ms === undefined) throw new Error(`no file at ${JSON.stringify(path ?? "")}`);
    return ms > limit ? "true" : "false";
  },
  [`${FILES}path.filter.older-than`]: (context) => filterByAge(context, true),
  [`${FILES}path.filter.newer-than`]: (context) => filterByAge(context, false),

  [`${TEXT}text.lines.trim`]: async (context) => {
    const leading = await flag(context, "leading", true);
    const trailing = await flag(context, "trailing", true);
    const trim = (line: string): string =>
      leading && trailing
        ? line.trim()
        : leading
          ? line.trimStart()
          : trailing
            ? line.trimEnd()
            : line;
    return mapArg(context.arg, (input) => input.split(/\r?\n/).map(trim).join("\n"));
  },

  [`${TEXT}text.metrics`]: async (context) => {
    const input = queryText(context.arg);
    const metric = (await text(context, "metric")).trim() || "words";
    switch (metric) {
      case "words":
        return String(input.split(/\s+/).filter(Boolean).length);
      case "characters":
        return String([...input].length);
      case "lines":
        return String(input === "" ? 0 : input.replace(/\r?\n$/, "").split(/\r?\n/).length);
      case "paragraphs":
        return String(input.split(/\r?\n\s*\r?\n/).filter((part) => part.trim() !== "").length);
      default:
        throw new Error(`unknown metric ${JSON.stringify(metric)}`);
    }
  },

  [`${TEXT}text.lines.empty.remove`]: async (context) =>
    mapArg(context.arg, (input) =>
      input
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .join("\n"),
    ),

  [`${TEXT}text.encode.percent`]: async (context) => mapArg(context.arg, encodeURIComponent),
  [`${TEXT}text.decode.percent`]: async (context) =>
    mapArg(context.arg, (input) => {
      try {
        return decodeURIComponent(input);
      } catch {
        throw new Error(`${JSON.stringify(input)} is not valid percent-encoding`);
      }
    }),

  [`${ARGS}argument.matching`]: async (context) => {
    const pattern = await text(context, "match_string");
    const regex = await flag(context, "regex", false);
    const caseSensitive = await flag(context, "case_sensitive", false);
    const invert = await flag(context, "invert", false);
    const re = regex ? new RegExp(pattern, caseSensitive ? "" : "i") : undefined;
    const needle = caseSensitive ? pattern : pattern.toLowerCase();
    const matches = (item: string): boolean =>
      re ? re.test(item) : (caseSensitive ? item : item.toLowerCase()).includes(needle);
    return items(context.arg).filter((item) => matches(item) !== invert);
  },

  [`${ARGS}argument.count`]: async ({ arg }) =>
    Array.isArray(arg) ? String(arg.length) : arg === "" ? "0" : "1",

  [`${ARGS}argument.randomise`]: async ({ arg, random }) => shuffle(items(arg), random),
  [`${ARGS}argument.randomise.leading.1`]: async ({ arg, random }) => {
    const list = items(arg);
    if (list.length === 0) return "";
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
  },

  [`${ARGS}argument.leading.x`]: async (context) =>
    items(context.arg).slice(0, await count(context, "arguments_number")),
  [`${ARGS}argument.strip.trailing.x`]: async (context) => {
    const list = items(context.arg);
    const n = await count(context, "arguments_number");
    return list.slice(0, Math.max(0, list.length - n));
  },

  [`${WINDOWS}windows.current.bounds.set.preset`]: async (context) => {
    const preset = (await text(context, "preset")).trim() || "half-left";
    const win = await activeWindow(context);
    const list = await desktops(context);
    const desktop = list[desktopIndex(list, win)];
    if (!desktop) throw new Error("there is no desktop to place the window on");
    const rect = presetRect(preset, desktop.size, windowRect(win.bounds));
    await context.request("window.setBounds", { id: win.id, bounds: nested(rect) });
    return context.arg;
  },

  [`${WINDOWS}windows.current.bounds`]: async (context) => {
    const win = await activeWindow(context);
    const rect = windowRect(win.bounds);
    if (!rect) throw new Error("the active window has no numeric bounds");
    return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  },

  [`${WINDOWS}windows.current.bounds.set.custom`]: async (context) => {
    const win = await activeWindow(context);
    // A blank field keeps the window's current value.
    const current = windowRect(win.bounds);
    const rect = {
      x: await numberSetting(context, "x", current?.x),
      y: await numberSetting(context, "y", current?.y),
      width: await numberSetting(context, "width", current?.width),
      height: await numberSetting(context, "height", current?.height),
    };
    await context.request("window.setBounds", { id: win.id, bounds: nested(rect) });
    return context.arg;
  },

  [`${WINDOWS}windows.current.screen.change`]: async (context) => {
    const direction = (await text(context, "target_screen")).trim() || "next";
    if (direction !== "next" && direction !== "previous") {
      throw new Error(`unknown target_screen ${JSON.stringify(direction)}`);
    }
    const win = await activeWindow(context);
    const list = await desktops(context);
    // A screen holds several desktops (Spaces); this moves between screens.
    const screens = [...new Set(list.map(screenOf))];
    if (screens.length < 2) return context.arg;
    const current = list[desktopIndex(list, win)]!;
    const step = direction === "next" ? 1 : screens.length - 1;
    const screen = screens[(screens.indexOf(screenOf(current)) + step) % screens.length]!;
    const onScreen = list.filter((desktop) => screenOf(desktop) === screen);
    const target = onScreen.find((desktop) => desktop.active === true) ?? onScreen[0]!;
    const rect = windowRect(win.bounds);
    await context.request("window.setBounds", {
      id: win.id,
      bounds: rect ? nested(rect) : win.bounds,
      desktopId: target.id,
    });
    return context.arg;
  },

  [`${CORE}macOS/app.current`]: async (context) => {
    const format = (await text(context, "out_format")).trim() || "name";
    const app = (await context.request("applications.frontmost", {})) as Record<
      string,
      unknown
    > | null;
    if (!app) throw new Error("there is no frontmost application");
    const field = { name: "name", bundle_id: "bundleId", path: "path" }[format];
    if (!field) throw new Error(`unknown out_format ${JSON.stringify(format)}`);
    const value = app[field];
    return typeof value === "string" ? value : "";
  },

  [`${CORE}macOS/app.open`]: async (context) => {
    const list = (await text(context, "app_list")).split(/\r?\n/);
    const entries = (list.some((entry) => entry.trim() !== "") ? list : items(context.arg))
      .map((entry) => expandTilde(entry.trim(), context.homeDir))
      .filter((entry) => entry !== "");
    for (const entry of entries) await context.request("open.path", { path: entry });
    return context.arg;
  },

  ["com.alfredapp.automation.extras/web-browsers/frontmost-browser/frontmost.tabs.current"]: async (
    context,
  ) => {
    const format = (await text(context, "out_format")).trim() || "url";
    const allowEmpty = await flag(context, "allow_empty", false);
    const tabs = await context.request("browser.tabs", {});
    const list = Array.isArray(tabs) ? (tabs as Tab[]) : [];
    const tab = list.find((candidate) => candidate?.active === true) ?? list[0];
    if (!tab) {
      if (allowEmpty) return "";
      throw new Error("the frontmost browser has no tabs");
    }
    return formatTab(tab, format);
  },
};

/** The implementation of `taskuid`, or `undefined` when Blast has none. */
export function automationTask(taskuid: string): Task | undefined {
  return Object.hasOwn(AUTOMATION_TASKS, taskuid) ? AUTOMATION_TASKS[taskuid] : undefined;
}

/** A node's `tasksettings`, or an empty dict. */
export function taskSettings(config: PlistDict): PlistDict {
  const settings: PlistValue | undefined = config.tasksettings;
  return isDict(settings) ? settings : {};
}
