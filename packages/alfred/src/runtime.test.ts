import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  createController,
  type ControllerInput,
  type ControllerResult,
  type ControllerView,
} from "@blastlauncher/client-core";
import {
  createScenePatchApplier,
  parseRuntimeMessage,
  PROTOCOL_VERSION,
  type HostMessage,
  type JsonValue,
  type RuntimeMessage,
  type SceneMessage,
  type SceneNode,
} from "@blastlauncher/protocol";
import {
  searchFilesPortable,
  type FileFilterMatch,
  type FileFilterOptions,
} from "./file-filter.ts";
import type {
  GraphHost,
  GraphScriptRequest,
  GraphScriptResult,
  GraphShortcutRequest,
  GraphSound,
} from "./graph.ts";
import { filterItems, imagePaths, MAX_SCENE_ITEMS, startAlfredRuntime } from "./runtime.ts";
import { queryText } from "./scripts.ts";
import { writeWorkflow, type FixtureEdge, type FixtureObject } from "./workflow-test-helper.ts";

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "blast-alfred-runtime-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const noop = () => {};
const CMD = 1 << 20;
const ALT = 1 << 19;

type Script = (request: GraphScriptRequest) => GraphScriptResult | Promise<GraphScriptResult>;
type Capability = (name: string, params: JsonValue) => JsonValue | Error;

const json = (payload: unknown): GraphScriptResult => ({
  stdout: JSON.stringify(payload),
  exitCode: 0,
});
const text = (stdout: string): GraphScriptResult => ({ stdout, exitCode: 0 });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let fixtures = 0;
async function launch(
  objects: FixtureObject[],
  edges: FixtureEdge[],
  options: {
    command: string;
    query?: string;
    scripts?: Record<string, Script>;
    capability?: Capability;
    now?: () => number;
    variables?: Record<string, string>;
    appearance?: "light" | "dark";
    /** Spawn the workflow's real scripts instead of `scripts`. */
    realScripts?: boolean;
    system?: Pick<GraphHost, "playSound" | "speak" | "runShortcut">;
    searchFiles?: (options: FileFilterOptions) => Promise<FileFilterMatch[]>;
  },
) {
  const dir = await writeWorkflow(
    join(root, `wf-${++fixtures}`),
    objects,
    edges,
    options.variables ? { variables: options.variables } : {},
  );
  const messages: RuntimeMessage[] = [];
  const scripts: { uid: string; query: string; request: GraphScriptRequest }[] = [];
  const capabilities: { name: string; params: JsonValue }[] = [];
  const roots: (SceneNode | null)[] = [];
  const applier = createScenePatchApplier();
  const controller = createController({ platform: "macOS" });
  let scene: SceneMessage | undefined;
  let exitCode: number | undefined;
  let quit = false;
  let deliver: (value: unknown) => void = noop;

  const send = (message: HostMessage) => deliver(JSON.parse(JSON.stringify(message)));
  const handle = (result: ControllerResult): void => {
    for (const event of result.events) queueMicrotask(() => send({ type: "event", ...event }));
    for (const effect of result.effects) {
      if (effect.type === "quit") quit = true;
      // Search throttling elapses at once; HUD/toast timers would only hide feedback.
      else if (!/^(hud|toast):/.test(effect.token)) handle(controller.tick(effect.token));
    }
  };

  startAlfredRuntime({
    send(message) {
      // Everything must survive the wire and validate as a runtime message.
      const wire = JSON.parse(JSON.stringify(message)) as unknown;
      const parsed = parseRuntimeMessage(wire);
      if (!parsed.ok) throw new Error(`invalid runtime message: ${parsed.error}`);
      messages.push(parsed.message);
      const value = parsed.message;
      if (value.type === "scene") scene = applier.reset(value);
      else if (value.type === "scene.patch") scene = applier.apply(value);
      if (value.type === "scene" || value.type === "scene.patch") {
        roots.push(scene!.root);
        handle(controller.scene(scene));
      }
      if (value.type === "capability.request") {
        capabilities.push({ name: value.name, params: value.params });
        const answer = options.capability?.(value.name, value.params) ?? null;
        queueMicrotask(() =>
          send(
            answer instanceof Error
              ? {
                  type: "capability.result",
                  id: value.id,
                  ok: false,
                  error: { code: "DENIED", message: answer.message },
                }
              : { type: "capability.result", id: value.id, ok: true, value: answer },
          ),
        );
      }
    },
    onMessage(listener) {
      deliver = listener;
      return () => {};
    },
    exit(code) {
      exitCode = code;
    },
    log() {},
    ...(options.realScripts
      ? {}
      : {
          async runScript(request: GraphScriptRequest) {
            scripts.push({ uid: request.object.uid, query: queryText(request.query), request });
            const script = options.scripts?.[request.object.uid];
            if (!script) return text("");
            return script(request);
          },
        }),
    ...(options.now ? { now: options.now } : {}),
    ...(options.system ? { system: options.system } : {}),
    ...(options.searchFiles ? { searchFiles: options.searchFiles } : {}),
  });
  send({
    type: "init",
    protocol: PROTOCOL_VERSION,
    command: {
      extension: "com.example.fixture",
      name: options.command,
      entry: join(dir, "info.plist"),
      mode: "view",
      ...(options.query === undefined ? {} : { arguments: { query: options.query } }),
    },
    preferences: {},
    environment: {
      extensionName: "com.example.fixture",
      commandName: options.command,
      ownerOrAuthorName: "Blast",
      assetsPath: dir,
      supportPath: join(dir, "support"),
      isDevelopment: true,
      appearance: options.appearance ?? "dark",
      textSize: "medium",
    },
  });

  const session = {
    dir,
    messages,
    roots,
    scripts,
    capabilities,
    get exitCode() {
      return exitCode;
    },
    get quit() {
      return quit || controller.view().requests.quit;
    },
    get root(): SceneNode | null {
      return scene?.root ?? null;
    },
    view: (): ControllerView => controller.view(),
    input(action: ControllerInput): void {
      handle(controller.input(action));
    },
    send,
    async until(predicate: () => boolean, what: string): Promise<void> {
      const deadline = Date.now() + 3000;
      while (!predicate()) {
        if (Date.now() > deadline) {
          throw new Error(
            `timed out waiting for ${what}; view: ${JSON.stringify(controller.view())}`,
          );
        }
        await sleep(2);
      }
    },
    /** Lets queued microtasks and zero-delay timers settle. */
    settle: () => sleep(20),
  };
  return session;
}

const titles = (view: ControllerView): string[] => view.rows.map((row) => row.title);
const actionTitles = (session: Awaited<ReturnType<typeof launch>>): string[] => {
  session.input({ type: "openActions" });
  const rows = session.view().actions.rows.map((row) => row.title);
  session.input({ type: "closeActions" });
  return rows;
};

function find(
  node: SceneNode | null,
  predicate: (node: SceneNode) => boolean,
): SceneNode | undefined {
  if (!node) return undefined;
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
}

const scriptFilter = (config: Record<string, JsonValue> = {}): FixtureObject => [
  "sf",
  "input.scriptfilter",
  { keyword: "sf", title: "Search things", argumenttype: 1, queuedelaymode: 1, ...config } as never,
];

describe("Script Filter", () => {
  test("renders JSON items, re-runs on search and patches the scene", async () => {
    const session = await launch([scriptFilter()], [], {
      command: "sf",
      scripts: {
        sf: ({ query }) =>
          json({
            items: [
              {
                uid: "a",
                title: `A ${queryText(query)}`,
                subtitle: "first",
                arg: "a-arg",
                icon: { type: "fileicon", path: "/Applications" },
              },
              { title: "B", arg: "b", match: "bee" },
            ],
          }),
      },
    });
    await session.until(() => titles(session.view())[0] === "A ", "first results");
    const view = session.view();
    expect(view.kind).toBe("list");
    expect(view.title).toBe("Search things");
    expect(view.rows.map((row) => [row.id, row.subtitle])).toEqual([
      ["a", "first"],
      ["#1", ""],
    ]);
    const list = find(session.root, (node) => node.type === "List")!;
    expect(list.props).toMatchObject({ filtering: false, throttle: true, searchText: "" });
    expect(find(list, (node) => node.props.id === "a")!.props.icon).toEqual({
      fileIcon: "/Applications",
    });
    expect(find(list, (node) => node.props.id === "#1")!.props.keywords).toEqual(["bee"]);

    session.input({ type: "search", text: "xy" });
    await session.until(() => titles(session.view())[0] === "A xy", "re-run results");
    expect(session.scripts.map((run) => run.query)).toEqual(["", "xy"]);
    expect(session.view().search.text).toBe("xy");
    // One full scene, then only patches the applier reconstructs.
    expect(session.messages.filter((m) => m.type === "scene")).toHaveLength(1);
    expect(session.messages.some((m) => m.type === "scene.patch")).toBe(true);
    expect(existsSync(join(session.dir, "support", "cache"))).toBe(true);
  });

  test("renders legacy XML output and reports script failures", async () => {
    let fail = false;
    const session = await launch([scriptFilter()], [], {
      command: "sf",
      scripts: {
        sf: () =>
          fail
            ? { stdout: "", stderr: "boom", exitCode: 2 }
            : text(
                `<?xml version="1.0"?><items><item uid="x" arg="1" valid="yes"><title>XML &amp; co</title><subtitle>legacy</subtitle></item></items>`,
              ),
      },
    });
    await session.until(() => titles(session.view())[0] === "XML & co", "xml results");
    expect(session.view().rows[0]!.subtitle).toBe("legacy");
    fail = true;
    session.input({ type: "search", text: "q" });
    await session.until(() => session.view().empty !== null, "error view");
    expect(session.view().empty).toMatchObject({
      title: "Script Filter failed",
      description: "Script exited with 2: boom",
    });
  });

  test("alfredfiltersresults runs once and filters in the client", async () => {
    const session = await launch([scriptFilter({ alfredfiltersresults: true })], [], {
      command: "sf",
      scripts: { sf: () => json({ items: [{ title: "Apple" }, { title: "Banana" }] }) },
    });
    await session.until(() => titles(session.view()).length === 2, "results");
    session.input({ type: "search", text: "ban" });
    await session.settle();
    expect(titles(session.view())).toEqual(["Banana"]);
    expect(session.scripts).toHaveLength(1);
  });

  test("a required argument waits for a query", async () => {
    const session = await launch([scriptFilter({ argumenttype: 0, subtext: "Type a name" })], [], {
      command: "sf",
      scripts: { sf: ({ query }) => json({ items: [{ title: `got ${queryText(query)}` }] }) },
    });
    await session.until(() => session.view().empty !== null, "waiting view");
    expect(session.view().empty).toMatchObject({
      title: "Search things",
      description: "Type a name",
    });
    expect(session.scripts).toHaveLength(0);
    session.input({ type: "search", text: "bob" });
    await session.until(() => titles(session.view())[0] === "got bob", "results");
  });

  test("valid: false with autocomplete completes the search text", async () => {
    const session = await launch([scriptFilter()], [], {
      command: "sf",
      scripts: {
        sf: ({ query }) =>
          json({
            items: [
              queryText(query) === "folder/"
                ? { title: "inside", arg: "x" }
                : { title: "Folder", valid: false, autocomplete: "folder/" },
            ],
          }),
      },
    });
    await session.until(() => titles(session.view())[0] === "Folder", "results");
    expect(actionTitles(session)[0]).toBe("Autocomplete");
    session.input({ type: "primary" });
    await session.until(() => titles(session.view())[0] === "inside", "autocompleted run");
    expect(session.view().search.text).toBe("folder/");
    expect(session.scripts.map((run) => run.query)).toEqual(["", "folder/"]);
  });

  test("modifier, copy, Large Type and Quick Look actions", async () => {
    const session = await launch(
      [
        scriptFilter(),
        ["plain", "action.script"],
        ["withCmd", "action.script"],
        ["withAlt", "action.script"],
      ],
      [
        ["sf", "plain"],
        ["sf", "withCmd", { modifiers: CMD }],
        ["sf", "withAlt", { modifiers: ALT, modifiersubtext: "Alt thing" }],
      ],
      {
        command: "sf",
        scripts: {
          sf: () =>
            json({
              items: [
                {
                  title: "Item",
                  arg: "item-arg",
                  mods: { cmd: { arg: "cmd-arg", subtitle: "Cmd subtitle" } },
                  text: { largetext: "BIG TEXT" },
                  quicklookurl: "https://example.com/preview",
                  variables: { picked: "yes" },
                },
              ],
            }),
        },
      },
    );
    await session.until(() => titles(session.view())[0] === "Item", "results");
    expect(actionTitles(session)).toEqual([
      "Open",
      "Cmd subtitle",
      "Alt thing",
      "Copy",
      "Show Large Type",
      "Quick Look",
    ]);

    session.input({ type: "key", key: { name: "return", meta: true } });
    await session.until(() => session.scripts.some((run) => run.uid === "withCmd"), "cmd run");
    session.input({ type: "key", key: { name: "return", option: true } });
    await session.until(() => session.scripts.some((run) => run.uid === "withAlt"), "alt run");
    const run = (uid: string) => session.scripts.find((entry) => entry.uid === uid)!;
    expect(run("withCmd").query).toBe("cmd-arg");
    expect(run("withAlt").query).toBe("item-arg");
    expect(run("withAlt").request.variables).toEqual({ picked: "yes" });
    expect(session.scripts.some((entry) => entry.uid === "plain")).toBe(false);

    session.input({ type: "key", key: { name: "c", meta: true } });
    await session.until(() => session.capabilities.length === 1, "copy");
    expect(session.capabilities[0]).toEqual({
      name: "clipboard.copy",
      params: { text: "item-arg" },
    });
    await session.until(() => session.view().feedback.hud !== null, "copied HUD");

    session.input({ type: "key", key: { name: "y", meta: true } });
    await session.until(() => session.capabilities.length === 2, "quick look");
    expect(session.capabilities[1]).toEqual({
      name: "open.url",
      params: { url: "https://example.com/preview" },
    });

    session.input({ type: "key", key: { name: "l", meta: true } });
    await session.until(() => session.view().kind === "detail", "large type");
    expect(session.view().detail).toBe("BIG TEXT");
    expect(session.view().navigation.canGoBack).toBe(true);
    session.input({ type: "back" });
    await session.until(() => session.view().kind === "list", "back to the list");
    expect(titles(session.view())).toEqual(["Item"]);
  });

  test("rerun repeats the script while the view is up", async () => {
    let runs = 0;
    const session = await launch([scriptFilter()], [], {
      command: "sf",
      scripts: { sf: () => json({ rerun: 0.1, items: [{ title: `run ${++runs}` }] }) },
    });
    await session.until(() => titles(session.view())[0] === "run 3", "third run");
    session.send({ type: "shutdown" });
    expect(session.exitCode).toBe(0);
    const after = runs;
    await sleep(250);
    expect(runs).toBe(after);
  });

  test("cache serves results and loosereload refreshes stale ones in the background", async () => {
    let clock = 1_000_000;
    let runs = 0;
    let release: (() => void) | undefined;
    const session = await launch([scriptFilter()], [], {
      command: "sf",
      now: () => clock,
      scripts: {
        sf: async () => {
          const n = ++runs;
          if (n === 3) await new Promise<void>((resolve) => (release = resolve));
          return json({ cache: { seconds: 5, loosereload: true }, items: [{ title: `v${n}` }] });
        },
      },
    });
    await session.until(() => titles(session.view())[0] === "v1", "first run");
    session.input({ type: "search", text: "x" });
    await session.until(() => titles(session.view())[0] === "v2", "second run");
    session.input({ type: "search", text: "" });
    await session.until(() => titles(session.view())[0] === "v1", "cached results");
    expect(runs).toBe(2);

    clock += 10_000;
    session.input({ type: "search", text: "x" });
    await session.until(() => runs === 3, "background refresh");
    expect(titles(session.view())).toEqual(["v2"]);
    expect(session.view().loading).toBe(true);
    release!();
    await session.until(() => titles(session.view())[0] === "v3", "refreshed results");
    expect(session.view().loading).toBe(false);
  });

  test("actioning an item closes the window unless the connection keeps it open", async () => {
    for (const vitoclose of [false, true]) {
      const session = await launch(
        [scriptFilter(), ["clip", "output.clipboard", { clipboardtext: "{query}" }]],
        [["sf", "clip", { vitoclose }]],
        { command: "sf", scripts: { sf: () => json({ items: [{ title: "One", arg: "1" }] }) } },
      );
      await session.until(() => titles(session.view())[0] === "One", "results");
      session.input({ type: "primary" });
      await session.until(() => session.capabilities.length === 1, "clipboard output");
      await session.settle();
      expect(session.capabilities[0]).toEqual({ name: "clipboard.copy", params: { text: "1" } });
      expect(session.quit).toBe(!vitoclose);
      expect(session.root!.props.closeMainWindow).toBe(vitoclose ? undefined : true);
    }
  });

  test("a pending initial debounce shows loading, never an empty No Results", async () => {
    const session = await launch(
      [
        scriptFilter({
          queuedelaymode: 2,
          queuedelaycustom: 1,
          queuedelayimmediatelyinitially: false,
        }),
      ],
      [],
      { command: "sf", scripts: { sf: () => json({ items: [{ title: "Done" }] }) } },
    );
    await session.until(() => session.root !== null, "first scene");
    expect(session.scripts).toHaveLength(0);
    expect(find(session.root, (node) => node.type === "List")!.props.isLoading).toBe(true);
    expect(session.view().loading).toBe(true);
    await session.until(() => titles(session.view())[0] === "Done", "results");
    const lists = session.roots.map((scene) => find(scene, (node) => node.type === "List")!);
    const firstWithItems = lists.findIndex((list) => list.children.length > 0);
    expect(firstWithItems).toBeGreaterThan(0);
    for (const list of lists.slice(0, firstWithItems)) expect(list.props.isLoading).toBe(true);
    expect(session.view().loading).toBe(false);
  });

  test.skipIf(process.platform === "win32")(
    "scripts see the host appearance as alfred_theme_background",
    async () => {
      const script = `printf '{"items":[{"title":"%s"}]}' "$alfred_theme_background"`;
      for (const [appearance, background] of [
        ["light", "rgba(255,255,255,0.98)"],
        ["dark", "rgba(30,30,30,0.95)"],
      ] as const) {
        const session = await launch([scriptFilter({ type: 0, scriptargtype: 1, script })], [], {
          command: "sf",
          appearance,
          realScripts: true,
        });
        await session.until(() => titles(session.view()).length === 1, `${appearance} results`);
        expect(titles(session.view())).toEqual([background]);
        session.send({ type: "shutdown" });
      }
    },
  );

  test("shutdown cancels an in-flight script", async () => {
    let signal: AbortSignal | undefined;
    const session = await launch([scriptFilter()], [], {
      command: "sf",
      scripts: {
        sf: (request) =>
          new Promise((resolve) => {
            signal = request.signal;
            request.signal!.addEventListener("abort", () => resolve(text("")));
          }),
      },
    });
    await session.until(() => signal !== undefined, "script start");
    expect(session.view().loading).toBe(true);
    const sent = session.messages.length;
    session.send({ type: "shutdown" });
    expect(signal!.aborted).toBe(true);
    expect(session.exitCode).toBe(0);
    await session.settle();
    expect(session.messages).toHaveLength(sent);
  });
});

const pad = (n: number) => String(n).padStart(3, "0");
// Letters only, so digit searches match titles alone: 0 → "aa", 7 → "ah".
const code = (n: number) => String.fromCharCode(97 + Math.floor(n / 26), 97 + (n % 26));

describe("List Filter", () => {
  test("renders expanded static items and runs the graph downstream", async () => {
    const items = JSON.stringify([
      { title: "Alpha {var:greeting}", subtitle: "first", arg: "a", imagefile: "alpha.png" },
      { title: "Beta", subtitle: "{const:alfred_workflow_name}", arg: "b" },
    ]);
    const session = await launch(
      [
        ["lf", "input.listfilter", { keyword: "lf", title: "Pick", items }],
        ["run", "action.script"],
      ],
      [["lf", "run"]],
      { command: "lf", variables: { greeting: "Hello" } },
    );
    await session.until(() => titles(session.view()).length === 2, "items");
    expect(titles(session.view())).toEqual(["Alpha Hello", "Beta"]);
    expect(session.view().rows[1]!.subtitle).toBe("Fixture");
    const alpha = find(session.root, (node) => node.props.title === "Alpha Hello")!;
    expect(alpha.props.icon).toBe(join(session.dir, "alpha.png"));
    session.input({ type: "search", text: "bet" });
    expect(titles(session.view())).toEqual(["Beta"]);
    session.input({ type: "primary" });
    await session.until(() => session.scripts.length === 1, "downstream run");
    expect(session.scripts[0]!.query).toBe("b");
  });

  test(`more than MAX_SCENE_ITEMS items are filtered in the runtime and capped`, async () => {
    const items = JSON.stringify(
      Array.from({ length: 500 }, (_, n) => ({
        title: `Item ${pad(n)}`,
        subtitle: `code ${code(n)}`,
        arg: pad(n),
      })),
    );
    const session = await launch(
      [
        ["lf", "input.listfilter", { keyword: "lf", items }],
        ["run", "action.script"],
      ],
      [["lf", "run"]],
      { command: "lf" },
    );
    await session.until(() => titles(session.view()).length > 0, "items");
    const list = () => find(session.root, (node) => node.type === "List")!;
    expect(list().props.filtering).toBe(false);
    expect(list().children).toHaveLength(MAX_SCENE_ITEMS);
    expect(titles(session.view())).toHaveLength(MAX_SCENE_ITEMS);
    expect(titles(session.view())[0]).toBe("Item 000");
    // Every message stays far below the 8 MiB NDJSON line cap.
    const largest = Math.max(...session.messages.map((m) => JSON.stringify(m).length));
    expect(largest).toBeLessThan(256 * 1024);

    // Title prefix matches rank first; the rest keep their order.
    session.input({ type: "search", text: "item 42" });
    await session.until(() => titles(session.view())[0] === "Item 420", "filtered");
    expect(titles(session.view())).toEqual([
      ...Array.from({ length: 10 }, (_, n) => `Item 42${n}`),
      "Item 042",
      "Item 142",
      "Item 242",
      "Item 342",
      "Item 442",
    ]);
    expect(list().props.filtering).toBe(false);

    // Subtitles match too, and every word must appear.
    session.input({ type: "search", text: "CODE AH" });
    await session.until(() => titles(session.view()).length === 1, "subtitle match");
    expect(titles(session.view())).toEqual(["Item 007"]);
    session.input({ type: "search", text: "item zzz" });
    await session.until(() => titles(session.view()).length === 0, "no match");

    session.input({ type: "search", text: "499" });
    await session.until(() => titles(session.view())[0] === "Item 499", "last item");
    session.input({ type: "primary" });
    await session.until(() => session.scripts.length === 1, "downstream run");
    expect(session.scripts[0]!.query).toBe("499");
  });

  test("fixedorder keeps Alfred's order when filtering", () => {
    const items = ["Banana split", "Apple", "Banana"].map((title) => ({
      title,
      valid: true,
      type: "default" as const,
    }));
    expect(filterItems(items, "ban").map((item) => item.title)).toEqual(["Banana split", "Banana"]);
    expect(filterItems(items, "an").map((item) => item.title)).toEqual(["Banana split", "Banana"]);
    expect(filterItems(items, "banana", true).map((item) => item.title)).toEqual([
      "Banana split",
      "Banana",
    ]);
    expect(filterItems(items, "split ban").map((item) => item.title)).toEqual(["Banana split"]);
    expect(filterItems(items, "  ")).toBe(items);
  });
});

/** A folder of files, and a recording File Filter search that never asks Spotlight. */
async function files(name: string, paths: string[]) {
  const dir = join(root, name);
  for (const path of paths) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), path);
  }
  const searches: FileFilterOptions[] = [];
  const searchFiles = (options: FileFilterOptions) => {
    searches.push(options);
    return searchFilesPortable(options);
  };
  return { dir, searches, searchFiles };
}

describe("File Filter", () => {
  test("a top-level File Filter searches, renders file items and routes actions", async () => {
    const found = await files("ff-top", ["a.png", "notes.txt", "sub/c.png"]);
    const session = await launch(
      [
        [
          "ff",
          "input.filefilter",
          {
            keyword: "ff",
            title: "Find {var:kind}",
            subtext: "Images in {var:kind}",
            argumenttype: 1,
            scopes: ["{var:where}"],
            types: ["public.image"],
          },
        ],
        ["next", "action.script"],
        ["alt", "action.script"],
      ],
      [
        ["ff", "next"],
        ["ff", "alt", { modifiers: ALT, modifiersubtext: "Alt thing" }],
      ],
      {
        command: "ff",
        variables: { kind: "pictures", where: found.dir },
        searchFiles: found.searchFiles,
      },
    );
    await session.until(() => titles(session.view()).length === 2, "file items");
    expect(titles(session.view())).toEqual(["a.png", "c.png"]);
    expect(found.searches[0]).toMatchObject({ query: "", scopes: [found.dir] });
    const list = find(session.root, (node) => node.type === "List")!;
    expect(list.props).toMatchObject({
      navigationTitle: "Find pictures",
      searchBarPlaceholder: "Images in pictures",
      filtering: false,
    });
    const c = join(found.dir, "sub", "c.png");
    const subDir = join(found.dir, "sub");
    const home = homedir();
    const expectedSub = subDir.startsWith(`${home}/`) ? `~${subDir.slice(home.length)}` : subDir;
    const item = find(session.root, (node) => node.props.title === "c.png")!;
    expect(item.type).toBe("List.Item");
    expect(item.props.icon).toEqual({ fileIcon: c });
    expect(item.props.subtitle).toBe(expectedSub);
    expect(actionTitles(session)).toEqual([
      "Continue",
      "Alt thing",
      "Copy Path",
      "Reveal in Finder",
      "Open File",
      "Show Large Type",
    ]);

    session.input({ type: "search", text: "c" });
    await session.until(() => titles(session.view()).join() === "c.png", "search update");
    expect(found.searches.at(-1)!.query).toBe("c");

    session.input({ type: "key", key: { name: "f", meta: true, shift: true } });
    await session.until(() => session.capabilities.length === 1, "reveal");
    session.input({ type: "key", key: { name: "o", meta: true } });
    await session.until(() => session.capabilities.length === 2, "open");
    session.input({ type: "key", key: { name: "c", meta: true } });
    await session.until(() => session.capabilities.length === 3, "copy");
    expect(session.capabilities).toEqual([
      { name: "finder.show", params: { path: c } },
      { name: "open.path", params: { path: c } },
      { name: "clipboard.copy", params: { text: c } },
    ]);

    session.input({ type: "primary" });
    await session.until(() => session.scripts.length === 1, "downstream run");
    expect(session.scripts[0]).toMatchObject({ uid: "next", query: c });
  });

  test("a keyword hands off mid-graph with scopes overridden by JSON Config", async () => {
    const configured = await files("ff-configured", ["wrong.txt"]);
    const target = await files("ff-target", ["report.pdf", "deep/report.txt", "other.md"]);
    const config = JSON.stringify({
      alfredworkflow: { arg: "report", config: { scopes: ["{var:dir}"] } },
    });
    const session = await launch(
      [
        ["kw", "input.keyword", { keyword: "kw", argumenttype: 2 }],
        ["cfg", "utility.json", { json: config }],
        ["ff", "input.filefilter", { scopes: [configured.dir], sortmode: 2 }],
        ["next", "action.script"],
      ],
      [
        ["kw", "cfg"],
        ["cfg", "ff"],
        ["ff", "next"],
      ],
      { command: "kw", variables: { dir: target.dir }, searchFiles: target.searchFiles },
    );
    await session.until(() => titles(session.view()).length === 2, "handed-off items");
    // The upstream arg becomes the search text; the override replaces the scopes.
    expect(target.searches[0]).toMatchObject({ query: "report", scopes: [target.dir] });
    expect(session.view().search.text).toBe("report");
    expect(titles(session.view())).toEqual(["report.pdf", "report.txt"]);
    expect(find(session.root, (node) => node.props.title === "report.txt")!.props.icon).toEqual({
      fileIcon: join(target.dir, "deep", "report.txt"),
    });
    expect(session.exitCode).toBeUndefined();

    session.input({ type: "search", text: "other" });
    await session.until(() => titles(session.view()).join() === "other.md", "search update");
    session.input({ type: "primary" });
    await session.until(() => session.scripts.length === 1, "downstream run");
    expect(session.scripts[0]!.query).toBe(join(target.dir, "other.md"));
  });

  test("home paths shorten to ~, a required argument waits, failures show", async () => {
    const searches: string[] = [];
    const session = await launch(
      [["ff", "input.filefilter", { keyword: "ff", title: "Find", argumenttype: 0 }]],
      [],
      {
        command: "ff",
        async searchFiles(options) {
          searches.push(options.query);
          if (options.query === "boom") throw new Error("disk on fire");
          const path = join(homedir(), "Documents", "x.txt");
          return [{ path, name: "x.txt", isDirectory: false, mtimeMs: 0 }];
        },
      },
    );
    await session.until(() => session.view().empty?.title === "Find", "waiting state");
    expect(searches).toEqual([]);
    session.input({ type: "search", text: "x" });
    await session.until(() => titles(session.view()).join() === "x.txt", "results");
    expect(session.view().rows[0]!.subtitle).toBe(join("~", "Documents"));
    session.input({ type: "search", text: "boom" });
    await session.until(
      () => session.view().empty?.title === "File search failed",
      "failure state",
    );
    expect(session.view().empty?.description).toBe("disk on fire");
  });
});

describe("keyword entries", () => {
  const keyword: FixtureObject = ["kw", "input.keyword", { keyword: "kw", argumenttype: 1 }];

  test("a graph without UI publishes its feedback and exits", async () => {
    const session = await launch(
      [
        keyword,
        ["run", "action.script"],
        ["clip", "output.clipboard", { clipboardtext: "{query}!" }],
        ["notify", "output.notification", { title: "Done" }],
        ["hide", "utility.hidealfred"],
      ],
      [
        ["kw", "run"],
        ["run", "clip"],
        ["clip", "notify"],
        ["notify", "hide"],
      ],
      {
        command: "kw",
        query: "hi",
        scripts: { run: ({ query }) => text(queryText(query).toUpperCase()) },
      },
    );
    await session.until(() => session.exitCode !== undefined, "exit");
    expect(session.exitCode).toBe(0);
    expect(session.capabilities).toEqual([{ name: "clipboard.copy", params: { text: "HI!" } }]);
    expect(session.root!.props.closeMainWindow).toBe(true);
    expect(find(session.root, (node) => node.type === "HUD")!.props.title).toBe("Done — HI");
  });

  test("Large Type keeps the runtime up with a Detail", async () => {
    const session = await launch(
      [keyword, ["big", "output.largetype", { largetypetext: "{query}" }]],
      [["kw", "big"]],
      { command: "kw", query: "huge" },
    );
    await session.until(() => session.view().kind === "detail", "large type");
    expect(session.view().detail).toBe("huge");
    expect(session.view().navigation.canGoBack).toBe(false);
    await session.settle();
    expect(session.exitCode).toBeUndefined();
  });

  test("Text View shows input text and continues downstream", async () => {
    const session = await launch(
      [keyword, ["text", "userinterface.text", { inputtype: 0 }], ["next", "action.script"]],
      [
        ["kw", "text"],
        ["text", "next"],
      ],
      { command: "kw", query: "# Title" },
    );
    await session.until(() => session.view().kind === "detail", "text view");
    expect(session.view().detail).toBe("# Title");
    session.input({ type: "primary" });
    await session.until(() => session.scripts.length === 1, "continue");
    expect(session.scripts[0]!.query).toBe("# Title");
  });

  test("Text View runs its input script", async () => {
    const session = await launch(
      [keyword, ["text", "userinterface.text", { inputtype: 1, inputfile: "view.sh" }]],
      [["kw", "text"]],
      {
        command: "kw",
        query: "q",
        scripts: { text: () => json({ response: "**bold**", footer: "foot" }) },
      },
    );
    await session.until(() => session.view().detail.startsWith("**bold**"), "script response");
    expect(session.view().detail).toBe("**bold**\n\n---\n\nfoot");
    expect(session.scripts[0]!.request.config).toMatchObject({ type: 8, scriptfile: "view.sh" });
  });

  test("Grid View renders script items and routes actions", async () => {
    const session = await launch(
      [
        keyword,
        ["grid", "userinterface.grid", { inputtype: 1, columncount: 2, script: "x" }],
        ["next", "action.script"],
      ],
      [
        ["kw", "grid"],
        ["grid", "next"],
      ],
      {
        command: "kw",
        scripts: {
          grid: () =>
            json({
              items: ["one", "two", "three"].map((title) => ({
                title,
                arg: title,
                icon: { path: `${title}.png` },
              })),
            }),
        },
      },
    );
    await session.until(() => session.view().kind === "grid" && !session.view().loading, "grid");
    const grid = session.view().grid!;
    expect(grid.map((row) => row.cells.map((cell) => cell.title))).toEqual([
      ["one", "two"],
      ["three"],
    ]);
    expect(find(session.root, (node) => node.type === "Grid")!.props.columns).toBe(2);
    expect(find(session.root, (node) => node.props.title === "two")!.props.content).toBe(
      join(session.dir, "two.png"),
    );
    session.input({ type: "move", direction: "right" });
    session.input({ type: "primary" });
    await session.until(() => session.scripts.length === 2, "downstream run");
    expect(session.scripts[1]!.query).toBe("two");
  });

  test("Image View renders a Detail with Continue, Open File, Copy Path and Back", async () => {
    const session = await launch(
      [keyword, ["img", "userinterface.image"], ["next", "action.script"]],
      [
        ["kw", "img"],
        ["img", "next"],
      ],
      { command: "kw", query: "pics/a (1).png" },
    );
    await session.until(() => session.view().kind === "detail", "image view");
    const path = join(session.dir, "pics/a (1).png");
    expect(session.view().detail).toBe(`![a (1).png](<${path}>)`);
    expect(actionTitles(session)).toEqual(["Continue", "Open File", "Copy Path", "Back"]);
    await session.settle();
    expect(session.exitCode).toBeUndefined();

    session.input({ type: "key", key: { name: "o", meta: true } });
    await session.until(() => session.capabilities.length === 1, "open file");
    session.input({ type: "key", key: { name: "c", meta: true } });
    await session.until(() => session.capabilities.length === 2, "copy path");
    expect(session.capabilities).toEqual([
      { name: "open.path", params: { path } },
      { name: "clipboard.copy", params: { text: path } },
    ]);

    session.input({ type: "primary" });
    await session.until(() => session.scripts.length === 1, "continue");
    expect(session.scripts[0]!.query).toBe("pics/a (1).png");
  });

  test("Image View Back hides a root view and pops a pushed one", async () => {
    const session = await launch([keyword, ["img", "userinterface.image"]], [["kw", "img"]], {
      command: "kw",
      query: "/a.png\nhttps://example.com/b.png",
    });
    await session.until(() => session.view().kind === "detail", "image view");
    expect(session.view().detail).toBe("![a.png](/a.png)\n\n![b.png](https://example.com/b.png)");
    session.input({ type: "key", key: { name: "[", meta: true } });
    await session.until(() => session.root?.props.closeMainWindow === true, "hide");
  });

  test("Play Sound, Speak and Run Shortcut go to the runtime's system helpers", async () => {
    const sounds: GraphSound[] = [];
    const spoken: string[] = [];
    const shortcuts: GraphShortcutRequest[] = [];
    const session = await launch(
      [
        keyword,
        ["sound", "output.playsound", { sound: "Glass" }],
        ["say", "output.speak"],
        ["short", "automation.runshortcut", { shortcut: "Upper", outputmode: 1 }],
        ["clip", "output.clipboard"],
      ],
      [
        ["kw", "sound"],
        ["sound", "say"],
        ["say", "short"],
        ["short", "clip"],
      ],
      {
        command: "kw",
        query: "hi",
        system: {
          playSound: (sound) => void sounds.push(sound),
          speak: (words) => void spoken.push(words),
          runShortcut: async (request) => {
            shortcuts.push(request);
            return request.input.toUpperCase();
          },
        },
      },
    );
    await session.until(() => session.exitCode !== undefined, "exit");
    expect(sounds).toEqual([{ soundName: "Glass", systemSound: true, workflowDir: session.dir }]);
    expect(spoken).toEqual(["hi"]);
    expect(shortcuts).toMatchObject([{ name: "Upper", input: "hi", outputMode: 1 }]);
    expect(session.capabilities).toEqual([{ name: "clipboard.copy", params: { text: "HI" } }]);
  });

  test("a two-button dialog is an Alert", async () => {
    const session = await launch(
      [
        keyword,
        [
          "ask",
          "utility.dialog",
          { title: "Sure?", text: "Really", button1: "Yes", button2: "No" },
        ],
        ["next", "action.script"],
      ],
      [
        ["kw", "ask"],
        ["ask", "next", { sourceoutputuid: "_button1" }],
      ],
      { command: "kw", query: "go" },
    );
    await session.until(() => session.view().feedback.alert !== null, "alert");
    expect(session.view().feedback.alert).toMatchObject({
      title: "Sure?",
      message: "Really",
      primary: { title: "Yes" },
      dismiss: { title: "No" },
    });
    session.input({ type: "alert", confirm: true });
    await session.until(() => session.exitCode !== undefined, "exit after the answer");
    expect(session.scripts.map((run) => run.uid)).toEqual(["next"]);
  });

  test("a three-button dialog pushes a chooser", async () => {
    const session = await launch(
      [
        keyword,
        ["ask", "utility.dialog", { title: "Which?", button1: "A", button2: "B", button3: "C" }],
        ["one", "action.script"],
        ["two", "action.script"],
      ],
      [
        ["kw", "ask"],
        ["ask", "one", { sourceoutputuid: "_button1" }],
        ["ask", "two", { sourceoutputuid: "_button2" }],
      ],
      { command: "kw" },
    );
    await session.until(() => titles(session.view()).length === 3, "chooser");
    expect(titles(session.view())).toEqual(["A", "B", "C"]);
    session.input({ type: "move", direction: "down" });
    session.input({ type: "primary" });
    await session.until(() => session.exitCode !== undefined, "exit after the choice");
    expect(session.scripts.map((run) => run.uid)).toEqual(["two"]);
  });
});

describe("imagePaths", () => {
  test("splits lines and arguments; resolves ~ and workflow-relative paths; keeps URLs", () => {
    expect(imagePaths("a.png\n\n /abs/b.png \nhttps://x.test/c.png", "/wf")).toEqual([
      "/wf/a.png",
      "/abs/b.png",
      "https://x.test/c.png",
    ]);
    expect(imagePaths(["~/d.png", "e.png"])).toEqual([join(homedir(), "d.png"), "e.png"]);
  });
});
