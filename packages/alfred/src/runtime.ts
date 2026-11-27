// The Alfred workflow runtime child (decision 0021): speaks protocol v1 like
// `@blastlauncher/runtime`, but instead of rendering React it drives a
// workflow's object graph and keeps a stack of Alfred views (Script Filter,
// List Filter, Text, Grid, Large Type, dialogs) that `scene.ts` draws. All I/O
// is injected so tests run it in-process.

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  parseHostMessage,
  PROTOCOL_VERSION,
  type InitMessage,
  type JsonValue,
  type LogLevel,
  type RuntimeMessage,
  type SceneNode,
} from "@blastlauncher/protocol";
import {
  executeWorkflowGraph,
  type GraphArg,
  type GraphDialog,
  type GraphExecutionResult,
  type GraphHost,
  type GraphScriptRequest,
  type GraphScriptResult,
  type GraphViewHandoff,
} from "./graph.ts";
import {
  LIST_FILTER,
  SCRIPT_FILTER,
  resolveWorkflowTemplate,
  workflowToManifest,
} from "./manifest.ts";
import type { PlistValue } from "./plist.ts";
import {
  diffScene,
  itemActions,
  itemIcon,
  itemKeys,
  renderScene,
  type ActionModel,
  type AlertModel,
  type EmptyModel,
  type HandlerRegistry,
  type ItemCallbacks,
  type ItemModel,
  type ToastModel,
  type ViewModel,
} from "./scene.ts";
import {
  parseScriptFilterOutput,
  type ScriptFilterItem,
  type ScriptFilterOutput,
} from "./script-filter.ts";
import {
  buildWorkflowEnv,
  queryText,
  runWorkflowScript,
  workflowVariables,
  type VariableValue,
} from "./scripts.ts";
import {
  loadWorkflow,
  parseListFilterItems,
  plistString,
  type AlfredObject,
  type AlfredWorkflow,
  type PlistDict,
} from "./workflow.ts";

export type AlfredRuntimeOptions = {
  send(message: RuntimeMessage): void;
  onMessage(listener: (value: unknown) => void): () => void;
  exit(code: number): void;
  log?(level: LogLevel, args: unknown[]): void;
  /** Replaces real script processes, e.g. for deterministic tests. */
  runScript?(request: GraphScriptRequest): Promise<GraphScriptResult>;
  /** Clock for Script Filter result caching; defaults to `Date.now`. */
  now?(): number;
};

export type AlfredRuntimeController = (() => void) & {
  fatal(error: unknown, code?: string): void;
};

/** Alfred's "automatic" queue delay between keystrokes and a Script Filter run. */
export const AUTOMATIC_QUEUE_DELAY_MS = 250;

/**
 * The most items one view puts into a scene. Real List Filters carry tens of
 * thousands of items, which serialize past the NDJSON line cap, so longer
 * lists are filtered here and only the best matches are sent.
 */
export const MAX_SCENE_ITEMS = 200;

/**
 * Alfred-style filtering: every word of `query` must appear (case-insensitively)
 * in the title, subtitle or `match` text. Unless `fixedOrder`, titles that
 * start with the query come first, then titles containing it, then the rest;
 * the order within each group is kept.
 */
export function filterItems(
  items: ScriptFilterItem[],
  query: string,
  fixedOrder = false,
): ScriptFilterItem[] {
  const needle = query.trim().toLowerCase();
  const words = needle.split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  const matches = items.filter((item) => {
    const haystack = [item.title, item.subtitle ?? "", item.match ?? ""].join("\n").toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  if (fixedOrder) return matches;
  const rank = (item: ScriptFilterItem): number => {
    const title = item.title.toLowerCase();
    return title.startsWith(needle) ? 0 : title.includes(needle) ? 1 : 2;
  };
  return matches
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * Items for one scene. Up to {@link MAX_SCENE_ITEMS} go out whole and the
 * client filters them (`capped: false`); beyond that the runtime filters by
 * `query` when the view filters at all, sends the first matches, and the
 * client must forward search text instead of filtering (`capped: true`).
 */
export function sceneItems(
  items: ScriptFilterItem[],
  query: string,
  options: { filter: boolean; fixedOrder?: boolean },
): { items: ScriptFilterItem[]; capped: boolean } {
  if (items.length <= MAX_SCENE_ITEMS) return { items, capped: false };
  const matches = options.filter ? filterItems(items, query, options.fixedOrder) : items;
  return { items: matches.slice(0, MAX_SCENE_ITEMS), capped: true };
}

type Entry = {
  key: string;
  view(): ViewModel;
  /** Became the visible entry (pushed, or uncovered by a pop). */
  activate(): void;
  /** Covered by a pushed entry. */
  deactivate(): void;
  /** Popped or shut down; stops its scripts and timers. */
  dispose(): void;
};

function integer(value: PlistValue | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const abortError = (): Error => Object.assign(new Error("aborted"), { name: "AbortError" });

/* oxlint-disable unicorn/consistent-function-scoping */
export function startAlfredRuntime(options: AlfredRuntimeOptions): AlfredRuntimeController {
  const now = options.now ?? Date.now;
  let stopping = false;
  let initialized = false;
  let workflow: AlfredWorkflow | undefined;
  let supportPath = "";
  let theme: "dark" | "light" = "dark";
  let preferences: Record<string, VariableValue> = {};

  const stack: Entry[] = [];
  let toast: ToastModel | undefined;
  let hud: { id: number; title: string } | undefined;
  let alert: AlertModel | undefined;
  let closeMainWindow = false;
  let serial = 0;

  let revision = 0;
  let published: SceneNode | null = null;
  let handlers: HandlerRegistry = new Map();
  let publishQueued = false;

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const aborts = new Set<AbortController>();
  const pending = new Map<
    string,
    { resolve(value: JsonValue): void; reject(error: Error): void }
  >();
  let nextRequest = 1;
  const cache = new Map<string, { output: ScriptFilterOutput; expires: number }>();
  const icons = new Map<string, string | undefined>();

  const send = (message: RuntimeMessage): void => {
    if (!stopping) options.send(message);
  };
  const log = (level: LogLevel, args: unknown[]): void => {
    if (options.log) options.log(level, args);
    else send({ type: "log", level, message: args.map(String).join(" ") });
  };
  const finish = (code: number): void => {
    if (stopping) return;
    stopping = true;
    for (const controller of aborts) controller.abort();
    aborts.clear();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const entry of stack.splice(0)) entry.dispose();
    for (const waiting of pending.values()) waiting.reject(abortError());
    pending.clear();
    options.exit(code);
  };
  const fatal = (error: unknown, code = "RUNTIME_ERROR"): void => {
    send({ type: "error", code, message: errorMessage(error), fatal: true });
    finish(1);
  };
  const eventError = (error: unknown): void => {
    if (stopping || (error as Error)?.name === "AbortError") return;
    send({ type: "error", code: "EVENT_ERROR", message: errorMessage(error), fatal: false });
  };

  // Scenes -----------------------------------------------------------------

  function publish(): void {
    publishQueued = false;
    if (stopping) return;
    const rendered = renderScene({
      entries: stack.map((entry) => ({ key: entry.key, view: entry.view() })),
      ...(stack.length > 1 ? { pop: popEntry } : {}),
      closeMainWindow,
      ...(toast ? { toast } : {}),
      ...(hud ? { hud } : {}),
      ...(alert ? { alert } : {}),
    });
    handlers = rendered.handlers;
    const ops = diffScene(published, rendered.root);
    if (ops === undefined) {
      revision++;
      send({ type: "scene", revision, root: rendered.root });
    } else if (ops.length > 0) {
      const baseRevision = revision++;
      send({ type: "scene.patch", revision, baseRevision, ops });
    }
    published = rendered.root;
  }
  // State changes in one turn coalesce into one scene update.
  const invalidate = (): void => {
    if (publishQueued || stopping) return;
    publishQueued = true;
    queueMicrotask(publish);
  };

  function later(ms: number, run: () => void): () => void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!stopping) run();
    }, ms);
    timers.add(timer);
    return () => {
      clearTimeout(timer);
      timers.delete(timer);
    };
  }

  const showToast = (style: ToastModel["style"], title: string, message?: string): void => {
    toast = { id: ++serial, style, title, ...(message ? { message } : {}) };
    invalidate();
  };
  const showHud = (title: string): void => {
    hud = { id: ++serial, title };
    invalidate();
  };

  // Capabilities -------------------------------------------------------------

  function request(name: string, params: Record<string, unknown>): Promise<JsonValue> {
    if (stopping) return Promise.reject(abortError());
    const id = String(nextRequest++);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ type: "capability.request", id, name, params: params as JsonValue });
    });
  }
  const failed = (title: string) => (error: unknown) => {
    if (stopping) return;
    showToast("failure", title, errorMessage(error));
  };

  // Workflow plumbing --------------------------------------------------------

  const wf = (): AlfredWorkflow => {
    if (!workflow) throw new Error("alfred: workflow is not loaded");
    return workflow;
  };
  const outgoing = (uid: string) =>
    wf().connections.filter((connection) => connection.from === uid && !connection.disabled);
  const defaultIcon = (uid: string): string | undefined => {
    if (icons.has(uid)) return icons.get(uid);
    const dir = wf().dir;
    const found = dir
      ? [`${uid}.png`, "icon.png"].map((name) => join(dir, name)).find((path) => existsSync(path))
      : undefined;
    icons.set(uid, found);
    return found;
  };

  function runScript(scriptRequest: GraphScriptRequest): Promise<GraphScriptResult> {
    if (options.runScript) return options.runScript(scriptRequest);
    const current = wf();
    return runWorkflowScript({
      config: scriptRequest.config,
      workflowDir: current.dir ?? process.cwd(),
      query: scriptRequest.query,
      env: buildWorkflowEnv({
        workflow: current,
        supportPath,
        theme,
        preferences,
        variables: scriptRequest.variables,
      }),
      ...(scriptRequest.signal ? { signal: scriptRequest.signal } : {}),
    });
  }

  const host: GraphHost = {
    request: (capability, params) => request(capability, params),
    runScript,
    openView: (handoff) => openView(handoff),
    showNotification: ({ title, text }) => showHud([title, text].filter(Boolean).join(" — ")),
    showLargeType: (text) => push(largeTypeEntry(text)),
    showDialog: (dialog) => showDialog(dialog),
    hideAlfred: () => {
      closeMainWindow = true;
      invalidate();
    },
    log: (level, message) => log(level, [message]),
  };

  async function runGraph(
    start: string,
    input: GraphArg,
    variables: Record<string, string>,
    modifiers: number,
  ): Promise<GraphExecutionResult> {
    const controller = new AbortController();
    aborts.add(controller);
    try {
      const result = await executeWorkflowGraph({
        workflow: wf(),
        host,
        start,
        input,
        variables,
        preferences,
        modifiers,
        signal: controller.signal,
        ...(supportPath ? { supportPath } : {}),
      });
      if (!stopping && result.warnings.length > 0) {
        showToast("failure", "Workflow problem", result.warnings.join("\n"));
      }
      return result;
    } finally {
      aborts.delete(controller);
    }
  }

  /** An item was actioned: run what follows and close unless something stays up. */
  function act(
    start: string,
    arg: GraphArg,
    variables: Record<string, string>,
    modifiers: number,
  ): void {
    const depth = stack.length;
    void runGraph(start, arg, variables, modifiers)
      .then((result) => {
        if (stopping || result.aborted || result.vitoclose) return;
        if (stack.length <= depth && !alert) {
          closeMainWindow = true;
          invalidate();
        }
      })
      .catch(eventError);
  }

  function callbacks(start: string, setQuery: (text: string) => void): ItemCallbacks {
    return {
      run: (arg, variables, modifiers) => act(start, arg, variables, modifiers),
      autocomplete: setQuery,
      copy: (text) => copy(text),
      largeType: (text) => push(largeTypeEntry(text)),
      quickLook: (target) => {
        const url = /^[a-z][a-z\d+.-]*:/i.test(target);
        void request(
          url ? "open.url" : "open.path",
          url ? { url: target } : { path: target },
        ).catch(failed("Cannot open Quick Look"));
      },
    };
  }

  function copy(text: string): void {
    void request("clipboard.copy", { text })
      .then(() => showHud("Copied to Clipboard"))
      .catch(failed("Cannot copy"));
  }

  // Stack ------------------------------------------------------------------

  function push(entry: Entry): void {
    stack.at(-1)?.deactivate();
    stack.push(entry);
    entry.activate();
    invalidate();
  }
  function popEntry(): void {
    if (stack.length <= 1) return;
    stack.pop()!.dispose();
    stack.at(-1)?.activate();
    invalidate();
  }
  function remove(entry: Entry): void {
    const index = stack.indexOf(entry);
    if (index < 0) return;
    const top = index === stack.length - 1;
    stack.splice(index, 1);
    entry.dispose();
    if (top) stack.at(-1)?.activate();
    invalidate();
  }

  function openView({ object, input, variables, configOverrides }: GraphViewHandoff): void {
    const config: PlistDict = { ...object.config, ...(configOverrides as PlistDict) };
    const query = queryText(input);
    switch (object.type) {
      case SCRIPT_FILTER:
        return push(scriptFilterEntry(object, config, query, variables));
      case LIST_FILTER:
        return push(listFilterEntry(object, config, query, variables));
      case "alfred.workflow.userinterface.text":
        return push(textEntry(object, config, input, variables));
      case "alfred.workflow.userinterface.grid":
        return push(gridEntry(object, config, input, variables));
      default:
        throw new Error(`alfred: ${object.type} has no view`);
    }
  }

  const nextKey = (): string => `e${++serial}`;
  const title = (value: PlistValue | undefined, variables: Record<string, string>): string =>
    resolveWorkflowTemplate(plistString(value), wf(), variables).trim();

  function itemModels(
    items: ScriptFilterItem[],
    object: AlfredObject,
    variables: Record<string, string>,
    setQuery: (text: string) => void,
    grid = false,
  ): ItemModel[] {
    const keys = itemKeys(items);
    const connections = outgoing(object.uid);
    const fallback = defaultIcon(object.uid);
    const itemCallbacks = callbacks(object.uid, setQuery);
    return items.map((item, index) => {
      const icon = itemIcon(item.icon, wf().dir, fallback);
      return {
        key: keys[index]!,
        title: item.title,
        ...(item.subtitle ? { subtitle: item.subtitle } : {}),
        ...(item.match ? { keywords: [item.match] } : {}),
        ...(icon === undefined ? {} : grid ? { content: icon } : { icon }),
        actions: itemActions(item, { connections, variables, callbacks: itemCallbacks }),
      };
    });
  }

  // Script Filter --------------------------------------------------------------

  function scriptFilterEntry(
    object: AlfredObject,
    config: PlistDict,
    initialQuery: string,
    variables: Record<string, string>,
  ): Entry {
    const argumentType = integer(config.argumenttype, 1);
    // Without an argument the script never sees the query, so Blast filters.
    const clientFilter = config.alfredfiltersresults === true || argumentType === 2;
    const fixedOrder = config.fixedorder === true;
    const delayMode = integer(config.queuedelaymode, 0);
    const delay =
      delayMode === 1
        ? 0
        : delayMode === 2
          ? Math.max(0, integer(config.queuedelaycustom, 1)) * 100
          : AUTOMATIC_QUEUE_DELAY_MS;
    let query = initialQuery;
    let output: ScriptFilterOutput = { items: [] };
    let loading = false;
    let error: string | undefined;
    let waiting = false;
    let started = false;
    let active = false;
    let generation = 0;
    let controller: AbortController | undefined;
    let cancelDebounce: (() => void) | undefined;
    let cancelRerun: (() => void) | undefined;

    const stop = (): void => {
      cancelDebounce?.();
      cancelRerun?.();
      cancelDebounce = undefined;
      cancelRerun = undefined;
      controller?.abort();
      controller = undefined;
      generation++;
    };
    const scheduleRerun = (): void => {
      cancelRerun?.();
      cancelRerun =
        active && output.rerun
          ? later(output.rerun * 1000, () => void run(query, false))
          : undefined;
    };
    const show = (next: ScriptFilterOutput): void => {
      output = next;
      error = undefined;
      scheduleRerun();
      invalidate();
    };

    async function run(text: string, useCache: boolean): Promise<void> {
      stop();
      const id = generation;
      const cacheKey = `${object.uid}\0${text}`;
      const cached = useCache ? cache.get(cacheKey) : undefined;
      if (cached) {
        if (cached.expires > now()) return show(cached.output);
        cache.delete(cacheKey);
        // Loose reload: show the stale results while fresh ones load.
        if (cached.output.cache?.loosereload) show(cached.output);
      }
      loading = true;
      invalidate();
      const abort = new AbortController();
      controller = abort;
      aborts.add(abort);
      let next: ScriptFilterOutput | undefined;
      let problem: string | undefined;
      try {
        const result = await runScript({
          object,
          config,
          query: text,
          variables: { ...variables, ...output.variables },
          signal: abort.signal,
        });
        if (id !== generation || stopping) return;
        try {
          next = parseScriptFilterOutput(result.stdout);
          if (result.exitCode !== 0 && next.items.length === 0) {
            const detail = result.stderr?.trim().slice(-500);
            problem = `Script exited with ${result.exitCode ?? "a signal"}${detail ? `: ${detail}` : ""}`;
          }
        } catch (parseError) {
          problem = errorMessage(parseError);
        }
      } catch (runError) {
        problem = errorMessage(runError);
      } finally {
        aborts.delete(abort);
      }
      if (id !== generation || stopping) return;
      controller = undefined;
      loading = false;
      if (problem !== undefined || !next) {
        log("warn", [`alfred: Script Filter ${object.uid}: ${problem}`]);
        output = { items: [] };
        error = problem;
        invalidate();
        return;
      }
      if (next.cache) {
        cache.set(cacheKey, { output: next, expires: now() + next.cache.seconds * 1000 });
      }
      show(next);
    }

    function schedule(text: string, ms: number): void {
      stop();
      if (argumentType === 0 && text === "" && !clientFilter) {
        waiting = true;
        loading = false;
        output = { items: [] };
        error = undefined;
        invalidate();
        return;
      }
      waiting = false;
      if (ms === 0) void run(text, true).catch(eventError);
      else cancelDebounce = later(ms, () => void run(text, true).catch(eventError));
    }

    function setQuery(text: string): void {
      query = text;
      invalidate();
      // Before the first run `activate` schedules; in filter mode one run serves every query.
      if (started && !clientFilter) schedule(text, delay);
    }

    const placeholder = title(config.title, variables);
    const subtext = title(config.subtext, variables);
    return {
      key: nextKey(),
      view() {
        const vars = { ...variables, ...output.variables };
        const empty: EmptyModel = error
          ? { title: "Script Filter failed", description: error }
          : waiting
            ? {
                title: placeholder || "Type to search",
                ...(subtext ? { description: subtext } : {}),
              }
            : { title: "No Results" };
        const shown = sceneItems(output.items, query, { filter: clientFilter, fixedOrder });
        return {
          kind: "list",
          navigationTitle: placeholder || wf().name,
          searchBarPlaceholder: subtext || placeholder || "Search…",
          // A pending debounce is a run about to start, not an empty result.
          isLoading: loading || cancelDebounce !== undefined,
          filtering: clientFilter && !shown.capped,
          searchText: query,
          onSearchTextChange: setQuery,
          items: itemModels(shown.items, object, vars, setQuery),
          empty,
        };
      },
      activate() {
        active = true;
        if (started) return scheduleRerun();
        started = true;
        schedule(query, config.queuedelayimmediatelyinitially === true ? 0 : delay);
      },
      deactivate() {
        active = false;
        cancelRerun?.();
        cancelRerun = undefined;
      },
      dispose() {
        active = false;
        stop();
      },
    };
  }

  // List Filter ----------------------------------------------------------------

  function listFilterEntry(
    object: AlfredObject,
    config: PlistDict,
    initialQuery: string,
    variables: Record<string, string>,
  ): Entry {
    let query = initialQuery;
    const scope = workflowVariables({ workflow: wf(), preferences, variables });
    const expand = (text: string | undefined): string | undefined =>
      text === undefined ? undefined : resolveWorkflowTemplate(text, wf(), scope);
    let items: ScriptFilterItem[] = [];
    let error: string | undefined;
    try {
      items = parseListFilterItems(config.items ?? "").map((item): ScriptFilterItem => ({
        title: expand(item.title)!,
        subtitle: expand(item.subtitle)!,
        arg: expand(item.arg)!,
        valid: true,
        type: "default",
        ...(item.autocomplete ? { autocomplete: expand(item.autocomplete)! } : {}),
        ...(item.match ? { match: expand(item.match)! } : {}),
        ...(item.imagefile ? { icon: { path: item.imagefile } } : {}),
      }));
    } catch (parseError) {
      error = errorMessage(parseError);
    }
    const setQuery = (text: string): void => {
      query = text;
      invalidate();
    };
    const heading = title(config.title, variables);
    const fixedOrder = config.fixedorder === true;
    return {
      key: nextKey(),
      view: () => {
        const shown = sceneItems(items, query, { filter: true, fixedOrder });
        return {
          kind: "list",
          navigationTitle: heading || wf().name,
          searchBarPlaceholder: title(config.subtext, variables) || heading || "Search…",
          isLoading: false,
          filtering: !shown.capped,
          searchText: query,
          onSearchTextChange: setQuery,
          items: itemModels(shown.items, object, variables, setQuery),
          empty: error
            ? { title: "List Filter failed", description: error }
            : { title: "No Results" },
        };
      },
      activate() {},
      deactivate() {},
      dispose() {},
    };
  }

  /**
   * Text and Grid views take their input from the arg (`inputtype` 0) or from
   * a script (`inputtype` 1): `inputfile` names a workflow script, otherwise
   * the object's own `script` / `type` run.
   */
  function viewScript(
    object: AlfredObject,
    config: PlistDict,
    input: GraphArg,
    variables: Record<string, string>,
    signal: AbortSignal,
  ): Promise<GraphScriptResult> {
    const file = plistString(config.inputfile).trim();
    return runScript({
      object,
      config: file ? { ...config, type: 8, scriptfile: file } : config,
      query: input,
      variables,
      signal,
    });
  }

  function loader(task: (signal: AbortSignal) => Promise<void>) {
    let controller: AbortController | undefined;
    return {
      start(): void {
        controller?.abort();
        const abort = new AbortController();
        controller = abort;
        aborts.add(abort);
        void task(abort.signal)
          .catch((loadError) => {
            if (!abort.signal.aborted) eventError(loadError);
          })
          .finally(() => aborts.delete(abort));
      },
      stop(): void {
        controller?.abort();
        controller = undefined;
      },
    };
  }

  // Text View ----------------------------------------------------------------

  function textEntry(
    object: AlfredObject,
    config: PlistDict,
    input: GraphArg,
    variables: Record<string, string>,
  ): Entry {
    const scripted = integer(config.inputtype, 0) === 1;
    let response = scripted ? "" : queryText(input);
    let footer = "";
    let loading = scripted;
    let rerun: number | undefined;
    let extra: Record<string, string> = {};
    let active = false;
    let cancelRerun: (() => void) | undefined;
    const scheduleRerun = (): void => {
      cancelRerun?.();
      cancelRerun = active && rerun ? later(rerun * 1000, () => script.start()) : undefined;
    };
    const script = loader(async (signal) => {
      loading = true;
      invalidate();
      const result = await viewScript(object, config, input, { ...variables, ...extra }, signal);
      if (signal.aborted || stopping) return;
      const parsed = parseTextResponse(result.stdout);
      response = parsed.response;
      footer = parsed.footer;
      rerun = parsed.rerun;
      extra = { ...extra, ...parsed.variables };
      loading = false;
      scheduleRerun();
      invalidate();
    });
    let started = false;
    return {
      key: nextKey(),
      view: () => ({
        kind: "detail",
        navigationTitle: wf().name,
        markdown: footer ? `${response}\n\n---\n\n${footer}` : response,
        isLoading: loading,
        actions: [
          {
            key: "continue",
            title: "Continue",
            run: () => act(object.uid, response, { ...variables, ...extra }, 0),
          },
          {
            key: "copy",
            title: "Copy",
            shortcut: { modifiers: ["cmd"], key: "c" },
            run: () => copy(response),
          },
        ],
      }),
      activate() {
        active = true;
        if (started) return scheduleRerun();
        started = true;
        if (scripted) script.start();
      },
      deactivate() {
        active = false;
        cancelRerun?.();
      },
      dispose() {
        active = false;
        cancelRerun?.();
        script.stop();
      },
    };
  }

  // Grid View ----------------------------------------------------------------

  function gridEntry(
    object: AlfredObject,
    config: PlistDict,
    input: GraphArg,
    variables: Record<string, string>,
  ): Entry {
    const scripted = integer(config.inputtype, 0) === 1;
    let query = "";
    let output: ScriptFilterOutput = { items: [] };
    let loading = scripted;
    let error: string | undefined;
    const setQuery = (text: string): void => {
      query = text;
      invalidate();
    };
    const apply = (text: string): void => {
      try {
        output = parseGridInput(text);
        error = undefined;
      } catch (parseError) {
        error = errorMessage(parseError);
      }
    };
    if (!scripted) apply(queryText(input));
    const script = loader(async (signal) => {
      const result = await viewScript(object, config, input, variables, signal);
      if (signal.aborted || stopping) return;
      apply(result.stdout);
      loading = false;
      invalidate();
    });
    const filterable = config.filterable !== false;
    return {
      key: nextKey(),
      view: () => {
        const shown = sceneItems(output.items, query, {
          filter: filterable,
          fixedOrder: config.fixedorder === true,
        });
        return {
          kind: "grid",
          navigationTitle: wf().name,
          searchBarPlaceholder: "Search…",
          columns: integer(config.columncount, 0) || 3,
          isLoading: loading,
          filtering: filterable && !shown.capped,
          searchText: query,
          onSearchTextChange: setQuery,
          items: itemModels(
            shown.items,
            object,
            { ...variables, ...output.variables },
            setQuery,
            true,
          ),
          empty: error
            ? { title: "Grid View failed", description: error }
            : { title: "No Results" },
        };
      },
      activate() {
        if (scripted && loading) script.start();
      },
      deactivate() {},
      dispose: () => script.stop(),
    };
  }

  // Large Type and dialogs ----------------------------------------------------

  function largeTypeEntry(text: string): Entry {
    const actions: ActionModel[] = [
      { key: "copy", title: "Copy", run: () => copy(text) },
      {
        key: "back",
        title: "Back",
        shortcut: { modifiers: ["cmd"], key: "[" },
        run: () => (stack.length > 1 ? remove(entry) : host.hideAlfred?.()),
      },
    ];
    const entry: Entry = {
      key: nextKey(),
      view: () => ({
        kind: "detail",
        navigationTitle: "Large Type",
        markdown: text,
        isLoading: false,
        actions,
      }),
      activate() {},
      deactivate() {},
      dispose() {},
    };
    return entry;
  }

  function showDialog(dialog: GraphDialog): Promise<number | undefined> {
    const buttons = dialog.buttons.length > 0 ? dialog.buttons : ["OK"];
    return new Promise((resolve) => {
      if (buttons.length >= 3) return push(chooserEntry(dialog, buttons, resolve));
      const id = ++serial;
      const answer = (value: number | undefined) => () => {
        if (alert?.id !== id) return;
        alert = undefined;
        invalidate();
        resolve(value);
      };
      alert?.dismiss.run();
      alert = {
        id,
        title: dialog.title,
        ...(dialog.text ? { message: dialog.text } : {}),
        primary: { title: buttons[0]!, run: answer(0) },
        dismiss:
          buttons[1] === undefined
            ? { title: "Cancel", run: answer(undefined) }
            : { title: buttons[1], run: answer(1) },
      };
      invalidate();
    });
  }

  // Three buttons do not fit an Alert's confirm/dismiss pair.
  function chooserEntry(
    dialog: GraphDialog,
    buttons: string[],
    resolve: (index: number | undefined) => void,
  ): Entry {
    let settled = false;
    const settle = (index: number | undefined): void => {
      if (settled) return;
      settled = true;
      resolve(index);
    };
    const items: ItemModel[] = buttons.map((button, index) => ({
      key: String(index),
      title: button,
      actions: [
        {
          key: "choose",
          title: "Choose",
          run: () => {
            settle(index);
            remove(entry);
          },
        },
      ],
    }));
    const entry: Entry = {
      key: nextKey(),
      view: () => ({
        kind: "list",
        navigationTitle: dialog.title || wf().name,
        searchBarPlaceholder: dialog.text || "Choose…",
        isLoading: false,
        filtering: true,
        items,
      }),
      activate() {},
      deactivate() {},
      dispose: () => settle(undefined),
    };
    return entry;
  }

  // Launch -------------------------------------------------------------------

  async function load(message: InitMessage): Promise<void> {
    const { command } = message;
    const dir = basename(command.entry) === "info.plist" ? dirname(command.entry) : command.entry;
    workflow = await loadWorkflow(dir);
    supportPath = message.environment.supportPath;
    theme = message.environment.appearance === "light" ? "light" : "dark";
    if (supportPath) await mkdir(join(supportPath, "cache"), { recursive: true });
    preferences = {};
    for (const [name, value] of Object.entries(message.preferences)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        preferences[name] = value;
      }
    }
    if (stopping) return;
    const uid =
      workflowToManifest(workflow).entryUids[command.name] ??
      workflow.objects.find((object) => object.uid === command.name)?.uid;
    const object = workflow.objects.find((candidate) => candidate.uid === uid);
    if (!object) throw new Error(`alfred: workflow has no command ${JSON.stringify(command.name)}`);
    const query = command.arguments?.query ?? command.fallbackText ?? "";
    if (object.type === SCRIPT_FILTER || object.type === LIST_FILTER) {
      openView({ object, input: query, variables: {}, configOverrides: {} });
      return;
    }
    // A keyword or External Trigger: run it; stay only if it opened a view.
    await runGraph(object.uid, query, {}, 0);
    if (stopping || stack.length > 0 || alert) return;
    publish();
    finish(0);
  }

  function handle(value: unknown): void {
    if (stopping) return;
    const parsed = parseHostMessage(value);
    if (!parsed.ok) return fatal(parsed.error, "PROTOCOL_ERROR");
    const message = parsed.message;
    if (!initialized) {
      if (message.type !== "init" || message.protocol !== PROTOCOL_VERSION)
        return fatal(`Expected init with protocol ${PROTOCOL_VERSION}`, "PROTOCOL_ERROR");
      initialized = true;
      send({ type: "ready", protocol: PROTOCOL_VERSION });
      void load(message).catch((error) => fatal(error));
      return;
    }
    switch (message.type) {
      case "init":
        return fatal("Duplicate init", "PROTOCOL_ERROR");
      case "shutdown":
        return finish(0);
      case "capability.progress":
        return;
      case "capability.result": {
        const waiting = pending.get(message.id);
        if (!waiting) return fatal(`Unknown capability id: ${message.id}`, "PROTOCOL_ERROR");
        pending.delete(message.id);
        if (message.ok) waiting.resolve(message.value);
        else
          waiting.reject(
            Object.assign(new Error(message.error.message), { code: message.error.code }),
          );
        return;
      }
      case "event": {
        const handler = handlers.get(message.node)?.[message.handler];
        if (!handler) return eventError(`No handler ${message.handler} on ${message.node}`);
        try {
          handler(message.args);
        } catch (error) {
          eventError(error);
        }
        return;
      }
      default:
        return fatal(`Alfred workflows cannot handle ${message.type}`, "PROTOCOL_ERROR");
    }
  }

  const removeListener = options.onMessage(handle);
  const controller = (() => {
    removeListener();
    finish(0);
  }) as AlfredRuntimeController;
  controller.fatal = fatal;
  return controller;
}

/** A Text View script's output: `{response, footer, rerun, variables}` JSON or plain text. */
export function parseTextResponse(stdout: string): {
  response: string;
  footer: string;
  rerun?: number;
  variables: Record<string, string>;
} {
  const trimmed = stdout.trim();
  if (trimmed.startsWith("{")) {
    try {
      const payload: unknown = JSON.parse(trimmed);
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const record = payload as Record<string, unknown>;
        const variables: Record<string, string> = {};
        if (record.variables && typeof record.variables === "object") {
          for (const [name, value] of Object.entries(record.variables)) {
            if (typeof value === "string" || typeof value === "number")
              variables[name] = String(value);
          }
        }
        const rerun =
          typeof record.rerun === "number" && record.rerun > 0
            ? Math.min(5, Math.max(0.1, record.rerun))
            : undefined;
        return {
          response: typeof record.response === "string" ? record.response : "",
          footer: typeof record.footer === "string" ? record.footer : "",
          ...(rerun === undefined ? {} : { rerun }),
          variables,
        };
      }
    } catch {
      // Not JSON after all: show it as text.
    }
  }
  return { response: stdout, footer: "", variables: {} };
}

/**
 * Grid View input: Script Filter JSON (or XML), or one file path per line,
 * each shown as its own file icon.
 */
export function parseGridInput(text: string): ScriptFilterOutput {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("<")) return parseScriptFilterOutput(trimmed);
  return {
    items: trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((path) => ({
        title: basename(path),
        arg: path,
        valid: true,
        type: "file" as const,
        icon: { type: "fileicon", path },
      })),
  };
}
