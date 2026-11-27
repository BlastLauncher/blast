// Executes an Alfred workflow's object graph from the object that produced the
// first argument (a keyword, a selected Script Filter item, an External
// Trigger). Everything privileged or visual goes through `GraphHost`, so the
// runtime can broker it; the engine itself only moves arguments and variables.

import { randomUUID } from "node:crypto";
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import {
  expandPlaceholders,
  parseAlfredWorkflowEnvelope,
  urlPlaceholderEncoders,
  type PlaceholderEncoders,
} from "./placeholders.ts";
import type { PlistValue } from "./plist.ts";
import { queryText, workflowVariables, type VariableValue } from "./scripts.ts";
import {
  isDict,
  plistString,
  type AlfredConnection,
  type AlfredObject,
  type AlfredWorkflow,
  type PlistDict,
} from "./workflow.ts";

export type GraphArg = string | string[];

export type GraphCapability =
  | "clipboard.copy"
  | "clipboard.paste"
  | "clipboard.read"
  | "open.url"
  | "open.path"
  | "finder.show";

export type GraphScriptRequest = {
  object: AlfredObject;
  /** The object's config with any upstream `config` overrides applied. */
  config: PlistDict;
  query: GraphArg;
  /** Session variables; the host layers them onto the workflow environment. */
  variables: Record<string, string>;
  signal?: AbortSignal;
};

export type GraphScriptResult = { stdout: string; stderr?: string; exitCode: number | null };

export type GraphViewHandoff = {
  object: AlfredObject;
  input: GraphArg;
  variables: Record<string, string>;
  configOverrides: Record<string, unknown>;
};

export type GraphDialog = { title: string; text: string; buttons: string[] };

export type GraphHost = {
  /** Brokered capability request (decision 0021); rejects when denied. */
  request(capability: GraphCapability, params: Record<string, unknown>): Promise<unknown>;
  runScript(request: GraphScriptRequest): Promise<GraphScriptResult>;
  /** An interactive object takes over; the branch ends here. */
  openView(handoff: GraphViewHandoff): void | Promise<void>;
  showNotification?(notification: { title: string; text: string }): void | Promise<void>;
  showLargeType?(text: string): void | Promise<void>;
  /** Index of the chosen button, or `undefined` when dismissed. */
  showDialog?(dialog: GraphDialog): Promise<number | undefined>;
  hideAlfred?(): void | Promise<void>;
  log?(level: "debug" | "warn", message: string): void;
};

export type GraphExecutionOptions = {
  workflow: AlfredWorkflow;
  host: GraphHost;
  /** The object that produced `input`; execution follows its connections. */
  start: string;
  input?: GraphArg;
  /** Session variables set before the graph runs (e.g. by a Script Filter item). */
  variables?: Record<string, string>;
  preferences?: Record<string, VariableValue | undefined>;
  /** Modifier mask held when the entry object fired; selects its connections. */
  modifiers?: number;
  /** Object visits allowed before execution stops; guards trigger loops. */
  maxSteps?: number;
  signal?: AbortSignal;
  supportPath?: string;
  uid?: string;
  /** Base for `~` and relative Write File paths; defaults to `os.homedir()`. */
  homeDir?: string;
  now?: () => Date;
  random?: () => number;
  uuid?: () => string;
};

export type GraphExecutionResult = {
  steps: number;
  /** Some traversed connection asked Alfred to stay open. */
  vitoclose: boolean;
  views: GraphViewHandoff[];
  warnings: string[];
  aborted: boolean;
  stepLimitReached: boolean;
};

export const DEFAULT_MAX_STEPS = 200;

type Flow = {
  arg: GraphArg;
  variables: Record<string, string>;
  /** Overrides for the next object's config (`alfredworkflow.config`). */
  config?: Record<string, unknown>;
};

/**
 * `output` selects connections: `undefined` follows all of them, `null` only
 * those without a `sourceOutputUid` (a conditional's else), a string only
 * those leaving that output.
 */
type Emission = Flow & { output?: string | null };

type Outcome = Emission[] | { jump: string; flow: Flow };

type NodeContext = {
  object: AlfredObject;
  config: PlistDict;
  flow: Flow;
  expand(
    template: string,
    options?: { query?: GraphArg; encode?: PlaceholderEncoders },
  ): Promise<string>;
};

const PREFIX = "alfred.workflow.";
const VIEW_TYPES = new Set([
  "input.scriptfilter",
  "input.listfilter",
  "userinterface.text",
  "userinterface.grid",
]);

function integer(value: PlistValue | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

const items = (arg: GraphArg): string[] => (Array.isArray(arg) ? arg : [arg]);
const mapArg = (arg: GraphArg, fn: (text: string) => string): GraphArg =>
  Array.isArray(arg) ? arg.map(fn) : fn(arg);
const pass = (flow: Flow): Emission[] => [{ arg: flow.arg, variables: flow.variables }];

function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Alfred's comparison modes 0–6: ==, !=, <, >, regex, <=, >=. */
export function compareCondition(
  input: string,
  mode: number,
  match: string,
  caseSensitive: boolean,
): boolean {
  if (mode === 4) return new RegExp(match, caseSensitive ? "" : "i").test(input);
  const a = caseSensitive ? input : input.toLowerCase();
  const b = caseSensitive ? match : match.toLowerCase();
  if (mode === 0) return a === b;
  if (mode === 1) return a !== b;
  const numeric = a.trim() !== "" && b.trim() !== "" && Number.isFinite(+a) && Number.isFinite(+b);
  const order = numeric ? Math.sign(+a - +b) : a < b ? -1 : a > b ? 1 : 0;
  switch (mode) {
    case 2:
      return order < 0;
    case 3:
      return order > 0;
    case 5:
      return order <= 0;
    case 6:
      return order >= 0;
    default:
      throw new Error(`unknown match mode ${mode}`);
  }
}

function unescapeDelimiter(text: string): string {
  return text.replace(/\\([nrt\\])/g, (_, char: string) =>
    char === "n" ? "\n" : char === "r" ? "\r" : char === "t" ? "\t" : "\\",
  );
}

function transform(text: string, type: number): string {
  switch (type) {
    case 0:
      return text.trim();
    case 1:
      return [...text].toReversed().join("");
    case 2:
      return text.toLowerCase();
    case 3:
      return text.toUpperCase();
    case 4:
      return text
        .toLowerCase()
        .replace(/(^|\s)(\S)/gu, (_, space: string, char: string) => space + char.toUpperCase());
    case 5:
      // Whitespace survives so word boundaries stay readable.
      return text.replace(/[^\p{L}\p{N}\s]/gu, "");
    default:
      throw new Error(`unknown transform type ${type}`);
  }
}

const jsonEscape = (value: string): string => JSON.stringify(value).slice(1, -1);

/** Runs the graph; never throws for workflow faults, which become `warnings`. */
export async function executeWorkflowGraph(
  options: GraphExecutionOptions,
): Promise<GraphExecutionResult> {
  const { workflow, host, signal } = options;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const home = options.homeDir ?? homedir();
  const byUid = new Map(workflow.objects.map((object) => [object.uid, object]));
  const outgoing = new Map<string, AlfredConnection[]>();
  for (const connection of workflow.connections) {
    if (connection.disabled) continue;
    const list = outgoing.get(connection.from) ?? [];
    list.push(connection);
    outgoing.set(connection.from, list);
  }
  const result: GraphExecutionResult = {
    steps: 0,
    vitoclose: false,
    views: [],
    warnings: [],
    aborted: false,
    stepLimitReached: false,
  };
  const warn = (message: string): void => {
    result.warnings.push(message);
    host.log?.("warn", message);
  };
  const halted = (): boolean => result.aborted || result.stepLimitReached;
  const expandPath = (path: string): string =>
    path === "~" ? home : path.startsWith("~/") ? join(home, path.slice(2)) : path;

  const contextFor = (object: AlfredObject, config: PlistDict, flow: Flow): NodeContext => ({
    object,
    config,
    flow,
    expand: (template, extra = {}) =>
      expandPlaceholders(template, {
        query: extra.query ?? flow.arg,
        variables: workflowVariables({
          workflow,
          ...(options.preferences ? { preferences: options.preferences } : {}),
          variables: flow.variables,
        }),
        workflow,
        ...(options.supportPath !== undefined ? { supportPath: options.supportPath } : {}),
        ...(options.uid !== undefined ? { uid: options.uid } : {}),
        readClipboard: async (offset) => {
          const read = await host.request("clipboard.read", { offset });
          return isDict(read as PlistValue) ? plistString((read as PlistDict).text) : undefined;
        },
        ...(options.now ? { now: options.now } : {}),
        ...(options.random ? { random: options.random } : {}),
        ...(options.uuid ? { uuid: options.uuid } : {}),
        ignoreDynamic: config.ignoredynamicplaceholders === true,
        ...(extra.encode ? { encode: extra.encode } : {}),
      }),
  });

  const handlers: Record<string, (node: NodeContext) => Promise<Outcome | undefined>> = {
    "trigger.external": async ({ flow }) => pass(flow),
    "utility.junction": async ({ flow }) => pass(flow),

    "utility.argument": async ({ config, flow, expand }) => {
      const variables = { ...flow.variables };
      if (isDict(config.variables)) {
        for (const [name, value] of Object.entries(config.variables)) {
          variables[name] = await expand(plistString(value));
        }
      }
      const keep = config.passthroughargument === true || config.argument === undefined;
      return [{ arg: keep ? flow.arg : await expand(plistString(config.argument)), variables }];
    },

    "utility.conditional": async ({ config, flow, expand }) => {
      const conditions = Array.isArray(config.conditions) ? config.conditions : [];
      for (const [index, condition] of conditions.entries()) {
        if (!isDict(condition)) continue;
        const input = await expand(plistString(condition.inputstring) || "{query}");
        const match = await expand(plistString(condition.matchstring));
        const caseSensitive = condition.matchcasesensitive === true;
        if (compareCondition(input, integer(condition.matchmode), match, caseSensitive)) {
          return [{ ...pass(flow)[0]!, output: plistString(condition.uid) || String(index) }];
        }
      }
      return [{ ...pass(flow)[0]!, output: null }];
    },

    "utility.filter": async ({ config, flow, expand }) => {
      const input = await expand(plistString(config.inputstring) || "{query}");
      const match = await expand(plistString(config.matchstring));
      const ok = compareCondition(
        input,
        integer(config.matchmode),
        match,
        config.matchcasesensitive === true,
      );
      return ok ? pass(flow) : [];
    },

    "utility.replace": async ({ config, flow, expand }) => {
      const match = await expand(plistString(config.matchstring));
      if (match === "") return pass(flow);
      const replacement = await expand(plistString(config.replacestring));
      const regex = integer(config.matchmode) === 1;
      // Real Alfred plists store `regexcaseinsensitive` and `regexmultiline`
      // (both default to false, i.e. case-sensitive).
      const insensitive =
        config.regexcaseinsensitive === true || config.matchcasesensitive === false;
      const multiline = config.regexmultiline === true || config.multiline === true;
      const flags = `g${insensitive ? "i" : ""}${multiline ? "m" : ""}`;
      const pattern = new RegExp(
        regex ? match : match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        flags,
      );
      const replace = (text: string): string =>
        regex ? text.replace(pattern, replacement) : text.replace(pattern, () => replacement);
      return [{ arg: mapArg(flow.arg, replace), variables: flow.variables }];
    },

    "utility.split": async ({ config, flow }) => {
      const delimiter = unescapeDelimiter(plistString(config.delimiter));
      let parts = delimiter === "" ? [queryText(flow.arg)] : queryText(flow.arg).split(delimiter);
      if (config.trimarguments === true || config.trimwhitespace === true) {
        parts = parts.map((part) => part.trim());
      }
      if (config.discardemptyarguments === true || config.discardemptyvalues === true) {
        parts = parts.filter((part) => part !== "");
      }
      if (integer(config.outputas) !== 1) return [{ arg: parts, variables: flow.variables }];
      const prefix = plistString(config.variableprefix) || "split";
      const variables = { ...flow.variables };
      parts.forEach((part, index) => {
        variables[`${prefix}${index + 1}`] = part;
      });
      return [{ arg: flow.arg, variables }];
    },

    "utility.transform": async ({ config, flow }) => {
      const type = integer(config.type);
      return [
        { arg: mapArg(flow.arg, (text) => transform(text, type)), variables: flow.variables },
      ];
    },

    "utility.json": async ({ config, flow, expand }) => {
      const text = await expand(plistString(config.json), {
        encode: { query: jsonEscape, variable: jsonEscape },
      });
      const envelope = parseAlfredWorkflowEnvelope(text);
      if (!envelope) throw new Error("JSON is not an alfredworkflow object");
      return [
        {
          arg: envelope.arg ?? flow.arg,
          variables: { ...flow.variables, ...envelope.variables },
          ...(envelope.config ? { config: envelope.config } : {}),
        },
      ];
    },

    "utility.delay": async ({ config, flow, expand }) => {
      const raw = await expand(plistString(config.seconds));
      const seconds = Number(raw.trim() || "0");
      if (Number.isFinite(seconds) && seconds > 0) await sleep(seconds * 1000, signal);
      return pass(flow);
    },

    "utility.debug": async ({ object, config, flow, expand }) => {
      const text = plistString(config.text);
      const message = text ? await expand(text) : queryText(flow.arg);
      host.log?.("debug", `${object.uid}: ${message} ${JSON.stringify(flow.variables)}`);
      return pass(flow);
    },

    "utility.hidealfred": async ({ flow }) => {
      await host.hideAlfred?.();
      return pass(flow);
    },

    "utility.dialog": async ({ object, config, flow, expand }) => {
      if (!host.showDialog) throw new Error("this host cannot show dialogs");
      const buttons = [config.button1, config.button2, config.button3]
        .map((button) => plistString(button))
        .filter((button) => button !== "");
      const body = plistString(config.description) || plistString(config.text);
      const index = await host.showDialog({
        title: await expand(plistString(config.title)),
        text: await expand(body),
        buttons,
      });
      if (index === undefined) return [];
      const conns = outgoing.get(object.uid) ?? [];
      const perButton = conns.some((c) => c.sourceOutputUid);
      const n = index + 1;
      const candidates = [`_button${n}`, plistString(config[`button${n}uid`]), `button${n}`].filter(
        Boolean,
      );
      const output =
        candidates.find((id) => conns.some((c) => c.sourceOutputUid === id)) ?? `_button${n}`;
      return [{ ...pass(flow)[0]!, ...(perButton ? { output } : {}) }];
    },

    "action.script": async ({ object, config, flow }) => {
      const run = await host.runScript({
        object,
        config,
        query: flow.arg,
        variables: flow.variables,
        ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) throw abortError();
      if (run.exitCode !== 0) {
        const detail = run.stderr?.trim() ? `: ${run.stderr.trim().slice(-500)}` : "";
        warn(`alfred: script ${object.uid} exited with ${run.exitCode ?? "a signal"}${detail}`);
      }
      const envelope = parseAlfredWorkflowEnvelope(run.stdout);
      if (!envelope) return [{ arg: run.stdout, variables: flow.variables }];
      return [
        {
          arg: envelope.arg ?? "",
          variables: { ...flow.variables, ...envelope.variables },
          ...(envelope.config ? { config: envelope.config } : {}),
        },
      ];
    },

    "action.openurl": async ({ config, flow, expand }) => {
      const template = plistString(config.url) || "{query}";
      const encoders = urlPlaceholderEncoders(config);
      // A bare `{query}` already is the URL; encoding it would break it.
      const encode = template.trim() === "{query}" ? { variable: encoders.variable } : encoders;
      const browser = plistString(config.browser);
      for (const item of items(flow.arg)) {
        const url = await expand(template, { query: item, encode });
        await host.request("open.url", { url, ...(browser ? { application: browser } : {}) });
      }
      return pass(flow);
    },

    "action.openfile": async ({ config, flow, expand }) => {
      const source = plistString(config.sourcefile);
      const paths = source ? [await expand(source)] : items(flow.arg);
      const app = plistString(config.openwith);
      for (const path of paths) {
        if (path.trim() === "") continue;
        await host.request("open.path", {
          path: expandPath(path.trim()),
          ...(app ? { application: app } : {}),
        });
      }
      return pass(flow);
    },

    "action.revealfile": async ({ config, flow, expand }) => {
      const configured = plistString(config.path);
      const paths = configured ? [await expand(configured)] : items(flow.arg);
      for (const path of paths) {
        if (path.trim() !== "")
          await host.request("finder.show", { path: expandPath(path.trim()) });
      }
      return pass(flow);
    },

    "output.clipboard": async ({ config, flow, expand }) => {
      const text = await expand(plistString(config.clipboardtext) || "{query}");
      const capability = config.autopaste === true ? "clipboard.paste" : "clipboard.copy";
      await host.request(capability, {
        text,
        ...(config.transient === true ? { concealed: true } : {}),
      });
      return pass(flow);
    },

    "output.notification": async ({ config, flow, expand }) => {
      if (!host.showNotification) throw new Error("this host cannot show notifications");
      const text = typeof config.text === "string" ? config.text : "{query}";
      await host.showNotification({
        title: await expand(plistString(config.title)),
        text: await expand(text),
      });
      return pass(flow);
    },

    "output.largetype": async ({ config, flow, expand }) => {
      if (!host.showLargeType) throw new Error("this host cannot show Large Type");
      const raw = plistString(config.largetypetext) || plistString(config.text) || "{query}";
      await host.showLargeType(await expand(raw));
      return pass(flow);
    },

    "output.writefile": async ({ config, flow, expand }) => {
      const name = expandPath((await expand(plistString(config.filename))).trim());
      if (name === "") throw new Error("Write Text File has no filename");
      const text = await expand(typeof config.filetext === "string" ? config.filetext : "{query}");
      const relMode = integer(config.relativepathmode, 0);
      const base =
        relMode === -1
          ? (workflow.dir ?? options.supportPath ?? home)
          : relMode === 1
            ? (options.supportPath ?? home)
            : relMode === 2
              ? (workflow.dir ?? home)
              : home;
      let path = isAbsolute(name) ? name : join(base, name);
      if (config.adduuid === true) {
        const ext = extname(path);
        const id = (options.uuid ?? (() => randomUUID().toUpperCase()))();
        path = join(dirname(path), `${basename(path, ext)} ${id}${ext}`);
      }
      if (text === "" && config.allowemptyfiles !== true) return [{ ...pass(flow)[0]!, arg: path }];
      if (config.createintermediatefolders === true) {
        await mkdir(dirname(path), { recursive: true });
      }
      // Alfred Write Text File `type`: 0 = skip if exists, 1 = overwrite, 2 = append.
      const mode = integer(config.type, 1);
      if (mode === 2) {
        await appendFile(path, text);
      } else if (mode === 0) {
        const exists = await stat(path).then(
          () => true,
          () => false,
        );
        if (!exists) await writeFile(path, text, { flag: "wx" });
      } else {
        await writeFile(path, text);
      }
      return [{ arg: path, variables: flow.variables }];
    },

    "output.callexternaltrigger": async ({ config, flow, expand }) => {
      const id = (await expand(plistString(config.externaltriggerid))).trim();
      if (!id) throw new Error("Call External Trigger has no trigger id");
      const bundle = plistString(config.workflowbundleid).trim();
      if (bundle && bundle !== "self" && bundle !== workflow.bundleId) {
        throw new Error(`triggers in other workflows (${bundle}) are not supported`);
      }
      const target =
        workflow.objects.find(
          (object) =>
            object.type === `${PREFIX}trigger.external` &&
            plistString(object.config.triggerid).trim() === id,
        ) ??
        workflow.objects.find((object) => plistString(object.inboundConfig?.externalid) === id);
      if (!target) throw new Error(`no External Trigger named ${JSON.stringify(id)}`);
      const arg =
        config.passinputasargument === false
          ? await expand(plistString(config.argument))
          : flow.arg;
      return {
        jump: target.uid,
        flow: { arg, variables: config.passvariables === true ? flow.variables : {} },
      };
    },
  };

  const follow = async (from: string, emission: Emission, entry: boolean): Promise<void> => {
    const modifiers = entry ? (options.modifiers ?? 0) : 0;
    for (const connection of outgoing.get(from) ?? []) {
      if (halted()) return;
      if (connection.modifiers !== modifiers) continue;
      if (emission.output === null && connection.sourceOutputUid !== undefined) continue;
      if (typeof emission.output === "string" && connection.sourceOutputUid !== emission.output) {
        continue;
      }
      if (connection.vitoclose) result.vitoclose = true;
      await visit(connection.to, {
        arg: emission.arg,
        variables: { ...emission.variables },
        ...(emission.config ? { config: emission.config } : {}),
      });
    }
  };

  const visit = async (uid: string, flow: Flow): Promise<void> => {
    if (halted()) return;
    if (signal?.aborted) {
      result.aborted = true;
      return;
    }
    if (result.steps >= maxSteps) {
      result.stepLimitReached = true;
      warn(`alfred: stopped after ${maxSteps} steps; the workflow may loop`);
      return;
    }
    result.steps++;
    const object = byUid.get(uid);
    if (!object) {
      warn(`alfred: connection points at missing object ${uid}`);
      return;
    }
    const type = object.type.startsWith(PREFIX) ? object.type.slice(PREFIX.length) : object.type;
    const config: PlistDict = { ...object.config, ...(flow.config as PlistDict | undefined) };
    if (VIEW_TYPES.has(type)) {
      const handoff: GraphViewHandoff = {
        object,
        input: flow.arg,
        variables: flow.variables,
        configOverrides: flow.config ?? {},
      };
      result.views.push(handoff);
      await host.openView(handoff);
      return;
    }
    const handler = handlers[type];
    if (!handler) {
      warn(`alfred: ${object.type} (${uid}) is not supported; that branch stops here`);
      return;
    }
    let outcome: Outcome | undefined;
    try {
      outcome = await handler(contextFor(object, config, flow));
    } catch (error) {
      if (signal?.aborted || (error as Error).name === "AbortError") {
        result.aborted = true;
        return;
      }
      warn(`alfred: ${object.type} (${uid}) failed: ${(error as Error).message}`);
      return;
    }
    if (!outcome) return;
    if (!Array.isArray(outcome)) return visit(outcome.jump, outcome.flow);
    for (const emission of outcome) await follow(uid, emission, false);
  };

  if (!byUid.has(options.start)) {
    warn(`alfred: start object ${options.start} does not exist`);
    return result;
  }
  await follow(
    options.start,
    { arg: options.input ?? "", variables: { ...options.variables } },
    true,
  );
  if (signal?.aborted) result.aborted = true;
  return result;
}
