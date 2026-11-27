import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { presetRect, windowRect } from "./automation-tasks.ts";
import { executeWorkflowGraph, type GraphArg, type GraphHost } from "./graph.ts";
import { KEYWORD } from "./manifest.ts";
import type { PlistValue } from "./plist.ts";
import { parseWorkflow } from "./workflow.ts";

const CORE = "com.alfredapp.automation.core/";
const FILES = `${CORE}files-and-folders/`;
const TEXT = `${CORE}text-processing/`;
const ARGS = `${CORE}argument-processing/`;
const WINDOWS = `${CORE}window-management/`;
const TABS =
  "com.alfredapp.automation.extras/web-browsers/frontmost-browser/frontmost.tabs.current";

type Reply = (capability: string, params: Record<string, unknown>) => unknown;

let scratch = "";
let home = "";

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "blast-alfred-tasks-"));
  home = join(scratch, "home");
  await mkdir(home);
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

/** A fresh folder under the fake home, so tests never share files. */
let serial = 0;
async function folder(files: Record<string, string> = {}): Promise<string> {
  const dir = join(home, `case-${++serial}`);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith("/")) await mkdir(join(dir, name), { recursive: true });
    else await writeFile(join(dir, name), content);
  }
  return dir;
}

/** Runs Keyword → task → Run Script and returns what reached the script. */
async function runTask(
  taskuid: string,
  tasksettings: Record<string, PlistValue> = {},
  input: GraphArg = "",
  options: {
    reply?: Reply;
    variables?: Record<string, string>;
    now?: () => Date;
    random?: () => number;
  } = {},
): Promise<{ output: GraphArg | undefined; calls: [string, unknown][]; warnings: string[] }> {
  const calls: [string, unknown][] = [];
  const outputs: GraphArg[] = [];
  const workflow = parseWorkflow({
    bundleid: "com.example.tasks",
    name: "Tasks",
    objects: [
      { uid: "kw", type: KEYWORD, config: { keyword: "k" } },
      { uid: "task", type: "alfred.workflow.automation.task", config: { taskuid, tasksettings } },
      { uid: "out", type: "alfred.workflow.action.script", config: {} },
    ],
    connections: {
      kw: [{ destinationuid: "task", modifiers: 0 }],
      task: [{ destinationuid: "out", modifiers: 0 }],
    },
  });
  const host: GraphHost = {
    request: async (capability, params) => {
      calls.push([capability, params]);
      return options.reply ? options.reply(capability, params) : null;
    },
    runScript: async (request) => {
      outputs.push(request.query);
      return { stdout: "", exitCode: 0 };
    },
    openView: () => {},
  };
  const result = await executeWorkflowGraph({
    workflow,
    host,
    start: "kw",
    input,
    homeDir: home,
    ...(options.variables ? { variables: options.variables } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.random ? { random: options.random } : {}),
  });
  return { output: outputs[0], calls, warnings: result.warnings };
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

const DAY = 86_400_000;
const T = new Date("2026-06-01T12:00:00Z");

describe("files and folders", () => {
  test("path.exists checks target_path (with ~ and placeholders) or every input", async () => {
    const dir = await folder({ "a.txt": "a" });
    const name = dir.slice(home.length + 1);
    expect((await runTask(`${FILES}path.exists`, { target_path: `~/${name}/a.txt` })).output).toBe(
      "true",
    );
    const placeholder = await runTask(
      `${FILES}path.exists`,
      { target_path: "{var:dir}/{var:file}" },
      "",
      { variables: { dir, file: "a.txt" } },
    );
    expect(placeholder.output).toBe("true");
    const all = [join(dir, "a.txt"), dir];
    expect((await runTask(`${FILES}path.exists`, {}, all)).output).toBe("true");
    expect((await runTask(`${FILES}path.exists`, {}, [...all, join(dir, "no")])).output).toBe(
      "false",
    );
    // `{query}` means the input, list included.
    expect((await runTask(`${FILES}path.exists`, { target_path: "{query}" }, all)).output).toBe(
      "true",
    );
    expect((await runTask(`${FILES}path.exists`, {}, "")).output).toBe("false");
  });

  test("path.trash asks the broker and passes the input on; a denial stops the branch", async () => {
    const paths = ["/tmp/x", "~/y"];
    const run = await runTask(`${FILES}path.trash`, {}, paths);
    expect(run.calls).toEqual([["trash", { paths: ["/tmp/x", join(home, "y")] }]]);
    expect(run.output).toEqual(paths);
    expect((await runTask(`${FILES}path.trash`, {}, "")).calls).toEqual([]);
    const denied = await runTask(`${FILES}path.trash`, { target_path: "/tmp/x" }, "", {
      reply: () => {
        throw new Error("capability trash denied");
      },
    });
    expect(denied.output).toBeUndefined();
    expect(denied.warnings).toEqual([
      "alfred: alfred.workflow.automation.task (task) failed: capability trash denied",
    ]);
  });

  test("file.read emits the file's text", async () => {
    const dir = await folder({ "note.md": "# hi\n" });
    expect((await runTask(`${FILES}file.read`, {}, join(dir, "note.md"))).output).toBe("# hi\n");
    expect(
      (await runTask(`${FILES}file.read`, { target_path: join(dir, "note.md") }, "ignored")).output,
    ).toBe("# hi\n");
    const missing = await runTask(`${FILES}file.read`, {}, join(dir, "none"));
    expect(missing.warnings[0]).toContain("failed: ENOENT");
  });

  test("directory.new creates folders and keeps the input's shape", async () => {
    const dir = await folder();
    const name = dir.slice(home.length + 1);
    const one = await runTask(`${FILES}directory.new`, {}, `~/${name}/a/b`);
    expect(one.output).toBe(join(dir, "a", "b"));
    expect(await exists(join(dir, "a", "b"))).toBe(true);
    const many = await runTask(`${FILES}directory.new`, {}, [join(dir, "c"), join(dir, "d")]);
    expect(many.output).toEqual([join(dir, "c"), join(dir, "d")]);
    expect(await exists(join(dir, "d"))).toBe(true);
  });

  test("directory.children.sort orders by name, date and hidden files", async () => {
    const dir = await folder({ "b.txt": "", "A.txt": "", "c.txt": "", ".hidden": "" });
    const sort = async (settings: Record<string, PlistValue>) =>
      (await runTask(`${FILES}directory.children.sort`, settings, dir)).output;
    const at = (...names: string[]) => names.map((name) => join(dir, name));
    expect(await sort({})).toEqual(at("A.txt", "b.txt", "c.txt"));
    expect(await sort({ sort_order: "by_name_descending" })).toEqual(at("c.txt", "b.txt", "A.txt"));
    expect(await sort({ include_hidden: true })).toEqual(at(".hidden", "A.txt", "b.txt", "c.txt"));
    await utimes(join(dir, "A.txt"), T, new Date(T.getTime() - DAY));
    await utimes(join(dir, "b.txt"), T, new Date(T.getTime() - 3 * DAY));
    await utimes(join(dir, "c.txt"), T, new Date(T.getTime() - 2 * DAY));
    expect(await sort({ sort_order: "by_modified" })).toEqual(at("A.txt", "c.txt", "b.txt"));
    expect(await sort({ sort_order: "by_modified_ascending" })).toEqual(
      at("b.txt", "c.txt", "A.txt"),
    );
    const bad = await runTask(`${FILES}directory.children.sort`, { sort_order: "by_size" }, dir);
    expect(bad.warnings[0]).toContain('unknown sort_order "by_size"');
  });

  test("by_added puts the newest first; .leading.1 returns only that one", async () => {
    const dir = await folder();
    // Created a→z, so date order and name order disagree.
    await writeFile(join(dir, "a.txt"), "");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(join(dir, "z.txt"), "");
    const sorted = await runTask(
      `${FILES}directory.children.sort`,
      { target_path: dir, sort_order: "by_added" },
      "",
    );
    expect(sorted.output).toEqual([join(dir, "z.txt"), join(dir, "a.txt")]);
    const oldest = await runTask(
      `${FILES}directory.children.sort`,
      { target_path: dir, sort_order: "by_added_ascending" },
      "",
    );
    expect(oldest.output).toEqual([join(dir, "a.txt"), join(dir, "z.txt")]);
    const leading = `${FILES}directory.children.sort.added.leading.1`;
    expect((await runTask(leading, {}, dir)).output).toBe(join(dir, "z.txt"));
    expect((await runTask(leading, {}, await folder())).output).toBe("");
  });

  test("finder.copy honours overwrite", async () => {
    const dir = await folder({ "a.txt": "new", "dest/": "", "dest/a.txt": "old" });
    const name = dir.slice(home.length + 1);
    const source = join(dir, "a.txt");
    const settings = { save_in: `~/${name}/dest` };
    const refused = await runTask(`${FILES}finder.copy`, settings, source);
    expect(refused.warnings[0]).toContain(`${join(dir, "dest", "a.txt")} already exists`);
    expect(await readFile(join(dir, "dest", "a.txt"), "utf8")).toBe("old");
    const copied = await runTask(`${FILES}finder.copy`, { ...settings, overwrite: true }, source);
    expect(copied.output).toBe(join(dir, "dest", "a.txt"));
    expect(await readFile(join(dir, "dest", "a.txt"), "utf8")).toBe("new");
    expect(await exists(source)).toBe(true);
  });

  test("finder.move moves the input, or target_path when there is none", async () => {
    const dir = await folder({
      "a.txt": "a",
      "b/": "",
      "b/inner.txt": "i",
      "c.txt": "c",
      "to/": "",
    });
    const to = join(dir, "to");
    const moved = await runTask(`${FILES}finder.move`, { save_in: to }, [
      join(dir, "a.txt"),
      join(dir, "b"),
    ]);
    expect(moved.output).toEqual([join(to, "a.txt"), join(to, "b")]);
    expect(await exists(join(dir, "a.txt"))).toBe(false);
    expect(await readFile(join(to, "b", "inner.txt"), "utf8")).toBe("i");
    const fallback = await runTask(
      `${FILES}finder.move`,
      { save_in: to, target_path: join(dir, "c.txt") },
      "",
    );
    expect(fallback.output).toBe(join(to, "c.txt"));
    const nowhere = await runTask(`${FILES}finder.move`, { save_in: join(dir, "none") }, to);
    expect(nowhere.warnings[0]).toContain("is not a folder");
    // A missing source never costs the existing destination.
    const lost = await runTask(
      `${FILES}finder.move`,
      { save_in: to, overwrite: true },
      join(dir, "c.txt"),
    );
    expect(lost.warnings[0]).toContain("no file at");
    expect(await readFile(join(to, "c.txt"), "utf8")).toBe("c");
  });

  test("file.quicklook opens each path and passes the input on", async () => {
    const run = await runTask(`${FILES}file.quicklook`, {}, ["/a.png", "/b.png"]);
    expect(run.calls).toEqual([
      ["open.path", { path: "/a.png" }],
      ["open.path", { path: "/b.png" }],
    ]);
    expect(run.output).toEqual(["/a.png", "/b.png"]);
  });

  test("file.uti.matching filters paths by UTI, supertypes included", async () => {
    const dir = await folder({ "a.png": "", "b.JPG": "", "c.txt": "", "d/": "" });
    const [png, jpg, txt, sub] = ["a.png", "b.JPG", "c.txt", "d"].map((name) => join(dir, name));
    const input = [png!, jpg!, txt!, sub!, join(dir, "missing.png")];
    const match = (settings: Record<string, PlistValue>) =>
      runTask(`${FILES}file.uti.matching`, settings, input).then((run) => run.output);
    expect(await match({ match_string: "public.image" })).toEqual([png!, jpg!]);
    expect(await match({ match_string: "public.png" })).toEqual([png!]);
    expect(await match({ match_string: "public.folder" })).toEqual([sub!]);
    // A missing file matches neither way.
    expect(await match({ match_string: "public.image", invert: true })).toEqual([txt!, sub!]);
  });

  test("path.basename, dirname, extension and expand-tilde keep the input's shape", async () => {
    const path = "/x/y/file.tar.gz";
    expect((await runTask(`${FILES}path.basename`, {}, path)).output).toBe("file.tar.gz");
    expect((await runTask(`${FILES}path.basename`, { no_extension: true }, [path])).output).toEqual(
      ["file.tar"],
    );
    expect((await runTask(`${FILES}path.dirname`, {}, [path, "~/a"])).output).toEqual([
      "/x/y",
      home,
    ]);
    expect((await runTask(`${FILES}path.extension`, {}, [path, "/x/README"])).output).toEqual([
      "gz",
      "",
    ]);
    expect((await runTask(`${FILES}path.expand-tilde`, {}, "~/docs")).output).toBe(
      join(home, "docs"),
    );
    expect((await runTask(`${FILES}path.expand-tilde`, {}, "~")).output).toBe(home);
    // A configured target_path wins over the input and is a single string.
    expect(
      (await runTask(`${FILES}path.dirname`, { target_path: "~/a/b" }, ["/q", "/r"])).output,
    ).toBe(join(home, "a"));
  });

  test("path.older-than compares mtime with now() in the chosen period", async () => {
    const dir = await folder({ "f.txt": "" });
    const file = join(dir, "f.txt");
    await utimes(file, T, T);
    const now = () => new Date(T.getTime() + 2 * DAY);
    const older = (settings: Record<string, PlistValue>) =>
      runTask(`${FILES}path.older-than`, settings, file, { now }).then((run) => run.output);
    expect(await older({ unit: 1 })).toBe("true");
    expect(await older({ unit: "3", period: "D" })).toBe("false");
    expect(await older({ unit: 47, period: "H" })).toBe("true");
    expect(await older({ unit: 1, period: "W" })).toBe("false");
    expect(await older({ unit: 2879, period: "M" })).toBe("true");
    expect(await older({ unit: 172_801, period: "S" })).toBe("false");
    const bad = await runTask(`${FILES}path.older-than`, { unit: 1, period: "Y" }, file, { now });
    expect(bad.warnings[0]).toContain('unknown period "Y"');
    const missing = await runTask(`${FILES}path.older-than`, { unit: 1 }, join(dir, "no"), { now });
    expect(missing.warnings[0]).toContain("no file at");
  });

  test("path.filter.older-than and newer-than split paths by age", async () => {
    const dir = await folder({ "old.txt": "", "new.txt": "" });
    await utimes(join(dir, "old.txt"), T, new Date(T.getTime() - 10 * DAY));
    await utimes(join(dir, "new.txt"), T, new Date(T.getTime() - DAY));
    const old = join(dir, "old.txt");
    const recent = join(dir, "new.txt");
    const input = [old, recent, join(dir, "gone.txt")];
    const settings = { unit: 5, period: "D" };
    const now = () => T;
    expect(
      (await runTask(`${FILES}path.filter.older-than`, settings, input, { now })).output,
    ).toEqual([old]);
    expect(
      (await runTask(`${FILES}path.filter.newer-than`, settings, input, { now })).output,
    ).toEqual([recent]);
  });
});

describe("text processing", () => {
  test("text.lines.trim trims leading and trailing space per line", async () => {
    const input = "  a  \n\t b \r\nc";
    expect((await runTask(`${TEXT}text.lines.trim`, {}, input)).output).toBe("a\nb\nc");
    expect((await runTask(`${TEXT}text.lines.trim`, { leading: false }, input)).output).toBe(
      "  a\n\t b\nc",
    );
    expect((await runTask(`${TEXT}text.lines.trim`, { trailing: false }, input)).output).toBe(
      "a  \nb \nc",
    );
  });

  test("text.metrics counts words, characters, lines and paragraphs", async () => {
    const input = "one two\nthree 👍\n\n  \nfour\n";
    const metric = (value?: string) =>
      runTask(`${TEXT}text.metrics`, value ? { metric: value } : {}, input).then((r) => r.output);
    expect(await metric()).toBe("5");
    expect(await metric("characters")).toBe(String([...input].length));
    expect(await metric("lines")).toBe("5");
    expect(await metric("paragraphs")).toBe("2");
    expect((await runTask(`${TEXT}text.metrics`, { metric: "lines" }, "")).output).toBe("0");
    const bad = await runTask(`${TEXT}text.metrics`, { metric: "bytes" }, input);
    expect(bad.warnings[0]).toContain('unknown metric "bytes"');
  });

  test("text.lines.empty.remove drops blank lines", async () => {
    expect((await runTask(`${TEXT}text.lines.empty.remove`, {}, "a\n\n  \nb\r\n")).output).toBe(
      "a\nb",
    );
  });

  test("percent encoding and decoding, with a clear error for bad input", async () => {
    expect((await runTask(`${TEXT}text.encode.percent`, {}, "a b&c/ü")).output).toBe(
      "a%20b%26c%2F%C3%BC",
    );
    expect((await runTask(`${TEXT}text.decode.percent`, {}, ["a%20b", "%C3%BC"])).output).toEqual([
      "a b",
      "ü",
    ]);
    const bad = await runTask(`${TEXT}text.decode.percent`, {}, "100%");
    expect(bad.warnings[0]).toContain('"100%" is not valid percent-encoding');
  });
});

const fruit = ["Apple", "banana", "avocado", "cherry"];
const match = (settings: Record<string, PlistValue>) =>
  runTask(`${ARGS}argument.matching`, settings, fruit).then((run) => run.output);
const counted = (input: GraphArg) =>
  runTask(`${ARGS}argument.count`, {}, input).then((run) => run.output);

describe("argument processing", () => {
  test("argument.matching filters by substring or regex, case and inversion", async () => {
    expect(await match({ match_string: "a" })).toEqual(["Apple", "banana", "avocado"]);
    expect(await match({ match_string: "A", case_sensitive: true })).toEqual(["Apple"]);
    expect(await match({ match_string: "^a", regex: true })).toEqual(["Apple", "avocado"]);
    expect(await match({ match_string: "^a", regex: true, case_sensitive: true })).toEqual([
      "avocado",
    ]);
    expect(await match({ match_string: "an", invert: true })).toEqual([
      "Apple",
      "avocado",
      "cherry",
    ]);
  });

  test("argument.count counts items; an empty string is none", async () => {
    expect(await counted("")).toBe("0");
    expect(await counted("x")).toBe("1");
    expect(await counted([])).toBe("0");
    expect(await counted(fruit)).toBe("4");
  });

  test("argument.randomise shuffles with the injected random source", async () => {
    const zero = await runTask(`${ARGS}argument.randomise`, {}, ["a", "b", "c", "d"], {
      random: () => 0,
    });
    expect(zero.output).toEqual(["b", "c", "d", "a"]);
    const high = await runTask(`${ARGS}argument.randomise`, {}, ["a", "b", "c", "d"], {
      random: () => 0.999,
    });
    expect(high.output).toEqual(["a", "b", "c", "d"]);
    const pick = await runTask(`${ARGS}argument.randomise.leading.1`, {}, fruit, {
      random: () => 0.5,
    });
    expect(pick.output).toBe("avocado");
    expect((await runTask(`${ARGS}argument.randomise.leading.1`, {}, [])).output).toBe("");
  });

  test("argument.leading.x and strip.trailing.x slice the list", async () => {
    expect(
      (await runTask(`${ARGS}argument.leading.x`, { arguments_number: 2 }, fruit)).output,
    ).toEqual(["Apple", "banana"]);
    expect(
      (await runTask(`${ARGS}argument.strip.trailing.x`, { arguments_number: "1" }, fruit)).output,
    ).toEqual(["Apple", "banana", "avocado"]);
    expect(
      (await runTask(`${ARGS}argument.strip.trailing.x`, { arguments_number: 9 }, fruit)).output,
    ).toEqual([]);
    const bad = await runTask(`${ARGS}argument.leading.x`, { arguments_number: "-1" }, fruit);
    expect(bad.warnings[0]).toContain('arguments_number must be a whole number, got "-1"');
  });
});

// Two screens; s2 has two Spaces, d3 the active one.
const desktops = [
  { id: "d1", screenId: "s1", active: true, type: "User", size: { width: 1000, height: 800 } },
  { id: "d2", screenId: "s2", active: false, type: "User", size: { width: 1920, height: 1080 } },
  { id: "d3", screenId: "s2", active: true, type: "User", size: { width: 1920, height: 1080 } },
];
const nestedWindow = {
  id: "w1",
  desktopId: "d3",
  bounds: { position: { x: 10, y: 20 }, size: { width: 300, height: 200 } },
};
const reply =
  (win: unknown = nestedWindow, all: unknown = desktops): Reply =>
  (capability) =>
    capability === "window.active" ? win : capability === "window.desktops" ? all : null;
const setBounds = (calls: [string, unknown][]) =>
  calls.filter(([capability]) => capability === "window.setBounds").map(([, params]) => params);
const preset = (value: string | undefined, win?: unknown) =>
  runTask(
    `${WINDOWS}windows.current.bounds.set.preset`,
    value === undefined ? {} : { preset: value },
    "in",
    { reply: reply(win) },
  );
const bounds = (win: unknown) =>
  runTask(`${WINDOWS}windows.current.bounds`, {}, "", { reply: reply(win) });

describe("windows, apps and browser tabs", () => {
  test("windowRect reads nested and flat bounds", () => {
    expect(windowRect(nestedWindow.bounds)).toEqual({ x: 10, y: 20, width: 300, height: 200 });
    expect(windowRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    expect(windowRect("fullscreen")).toBeUndefined();
    expect(windowRect({ position: { x: 1 }, size: { width: 3, height: 4 } })).toBeUndefined();
  });

  test("presetRect tiles a desktop without gaps", () => {
    const size = { width: 1000, height: 800 };
    const thirds = ["third-left", "third-centrewidth", "third-right"].map((p) =>
      presetRect(p, size),
    );
    expect(thirds.map((rect) => [rect.x, rect.width])).toEqual([
      [0, 333],
      [333, 334],
      [667, 333],
    ]);
    expect(presetRect("twothirds-centrewidth", size)).toEqual({
      x: 167,
      y: 0,
      width: 666,
      height: 800,
    });
    expect(presetRect("half-bottom", size)).toEqual({ x: 0, y: 400, width: 1000, height: 400 });
    expect(presetRect("quarter-topright", size)).toEqual({ x: 500, y: 0, width: 500, height: 400 });
    expect(presetRect("maximize", size)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    expect(presetRect("center", size, { x: 0, y: 0, width: 2000, height: 100 })).toEqual({
      x: 0,
      y: 350,
      width: 1000,
      height: 100,
    });
    expect(() => presetRect("centre", size)).toThrow("no size to centre");
  });

  test("bounds.set.preset places the window on its own desktop", async () => {
    const half = await preset(undefined);
    expect(half.calls.map(([capability]) => capability)).toEqual([
      "window.active",
      "window.desktops",
      "window.setBounds",
    ]);
    expect(setBounds(half.calls)).toEqual([
      { id: "w1", bounds: { position: { x: 0, y: 0 }, size: { width: 960, height: 1080 } } },
    ]);
    expect(half.output).toBe("in");
    expect(setBounds((await preset("quarter-bottomright")).calls)).toEqual([
      { id: "w1", bounds: { position: { x: 960, y: 540 }, size: { width: 960, height: 540 } } },
    ]);
    expect(setBounds((await preset("centre")).calls)).toEqual([
      { id: "w1", bounds: { position: { x: 810, y: 440 }, size: { width: 300, height: 200 } } },
    ]);
    // An unknown desktop falls back to the active one (d1 comes first).
    const elsewhere = await preset("maximise", { ...nestedWindow, desktopId: "gone" });
    expect(setBounds(elsewhere.calls)).toEqual([
      { id: "w1", bounds: { position: { x: 0, y: 0 }, size: { width: 1000, height: 800 } } },
    ]);
    const bad = await preset("diagonal");
    expect(bad.warnings[0]).toContain('unknown window preset "diagonal"');
    expect(setBounds(bad.calls)).toEqual([]);
  });

  test("windows.current.bounds emits flat JSON from either bounds shape", async () => {
    expect((await bounds(nestedWindow)).output).toBe('{"x":10,"y":20,"width":300,"height":200}');
    const flat = { id: "w2", bounds: { x: 5, y: 6, width: 7, height: 8, extra: 1 } };
    expect((await bounds(flat)).output).toBe('{"x":5,"y":6,"width":7,"height":8}');
    const full = await bounds({ id: "w3", bounds: "fullscreen" });
    expect(full.warnings[0]).toContain("no numeric bounds");
    const none = await bounds(null);
    expect(none.warnings[0]).toContain("there is no active window");
  });

  test("bounds.set.custom expands its fields; a blank one keeps the current value", async () => {
    const run = await runTask(
      `${WINDOWS}windows.current.bounds.set.custom`,
      { x: "{var:x}", y: 0, width: "640", height: "" },
      "",
      { reply: reply(), variables: { x: "100" } },
    );
    expect(setBounds(run.calls)).toEqual([
      { id: "w1", bounds: { position: { x: 100, y: 0 }, size: { width: 640, height: 200 } } },
    ]);
    const bad = await runTask(`${WINDOWS}windows.current.bounds.set.custom`, { x: "left" }, "", {
      reply: reply(),
    });
    expect(bad.warnings[0]).toContain('x must be a number, got "left"');
  });

  test("windows.current.screen.change cycles screens, not Spaces", async () => {
    const task = `${WINDOWS}windows.current.screen.change`;
    const { bounds: current } = nestedWindow;
    const next = await runTask(task, {}, "", { reply: reply() });
    expect(setBounds(next.calls)).toEqual([{ id: "w1", bounds: current, desktopId: "d1" }]);
    const previous = await runTask(task, { target_screen: "previous" }, "", { reply: reply() });
    expect(setBounds(previous.calls)).toEqual([{ id: "w1", bounds: current, desktopId: "d1" }]);
    const onS1 = { ...nestedWindow, desktopId: "d1" };
    const fromS1 = await runTask(task, {}, "", { reply: reply(onS1) });
    // The other screen's active Space receives the window.
    expect(setBounds(fromS1.calls)).toEqual([{ id: "w1", bounds: current, desktopId: "d3" }]);
    const alone = await runTask(task, {}, "", { reply: reply(nestedWindow, [desktops[0]]) });
    expect(setBounds(alone.calls)).toEqual([]);
    const bad = await runTask(task, { target_screen: "up" }, "", { reply: reply() });
    expect(bad.warnings[0]).toContain('unknown target_screen "up"');
  });

  test("a denied window capability stops the branch with the reason", async () => {
    const run = await runTask(`${WINDOWS}windows.current.bounds`, {}, "", {
      reply: () => {
        throw new Error("capability window.active denied");
      },
    });
    expect(run.output).toBeUndefined();
    expect(run.warnings).toEqual([
      "alfred: alfred.workflow.automation.task (task) failed: capability window.active denied",
    ]);
  });

  test("app.current emits the frontmost app's name, bundle id or path", async () => {
    const app = { name: "Safari", path: "/Applications/Safari.app", bundleId: "com.apple.Safari" };
    const current = (format?: string) =>
      runTask(`${CORE}macOS/app.current`, format ? { out_format: format } : {}, "", {
        reply: () => app,
      }).then((run) => run.output);
    expect(await current()).toBe("Safari");
    expect(await current("bundle_id")).toBe("com.apple.Safari");
    expect(await current("path")).toBe("/Applications/Safari.app");
  });

  test("app.open opens each listed app, else the input", async () => {
    const listed = await runTask(
      `${CORE}macOS/app.open`,
      { app_list: "Safari\n\n com.apple.Notes \n~/Apps/X.app" },
      "ignored",
    );
    expect(listed.calls).toEqual([
      ["open.path", { path: "Safari" }],
      ["open.path", { path: "com.apple.Notes" }],
      ["open.path", { path: join(home, "Apps", "X.app") }],
    ]);
    expect(listed.output).toBe("ignored");
    const fromInput = await runTask(`${CORE}macOS/app.open`, {}, ["Mail", ""]);
    expect(fromInput.calls).toEqual([["open.path", { path: "Mail" }]]);
  });

  test("frontmost.tabs.current formats the active tab", async () => {
    const tabs = [
      { id: 1, url: "https://a.example", title: "A", active: false },
      { id: 2, url: "https://b.example", title: "B", active: true },
    ];
    const current = (settings: Record<string, PlistValue>, open: unknown = tabs) =>
      runTask(TABS, settings, "", { reply: () => open });
    expect((await current({})).output).toBe("https://b.example");
    expect((await current({ out_format: "title" })).output).toBe("B");
    expect((await current({ out_format: "url_tab_title" })).output).toBe("https://b.example\tB");
    expect((await current({ out_format: "title_tab_url" })).output).toBe("B\thttps://b.example");
    expect((await current({ out_format: "markdown" })).output).toBe("[B](https://b.example)");
    // No active tab: the first one.
    expect((await current({}, [tabs[0]])).output).toBe("https://a.example");
    const empty = await current({}, []);
    expect(empty.warnings[0]).toContain("the frontmost browser has no tabs");
    expect((await current({ allow_empty: true }, [])).output).toBe("");
  });
});
