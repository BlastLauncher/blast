// The `blast` debug CLI: bundles and runs one extension command headlessly and
// prints every published scene — as a readable text tree, or as protocol-shaped
// NDJSON with `--json`. A `--script` drives the command (action / search /
// dropdown / back / confirm / dismiss / wait / expect / quit), which is how e2e tests interact
// with extensions. See "Debugging extensions" in docs/architecture.md.

import { parseBrowserTabs, type BrowserTab } from "./browser.ts";
import type {
  CapabilityRequestMessage,
  CapabilityResultMessage,
  JsonValue,
  SceneMessage,
  SceneNode,
} from "@blastlauncher/protocol";
import { rmSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  bundleCommand,
  installExtensionDependencies,
  createSessionBroker,
  defaultDataDir,
  bundleModelProvider,
  startModelProvider,
  startCommand,
  type Broker,
  type CapabilityHandler,
  type BundledCommand,
  type CommandArgument,
  type Session,
} from "@blastlauncher/host";
import { createHeadlessHandlers, parseApplications, type Application } from "./headless.ts";

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_CRASH = 3;

const USAGE = `Run a Raycast extension command headlessly.

Usage: blast run <extensionDir> <command> [options]
       blast deps <extensionDir> [--data-dir <dir>]
       blast models <extensionDir>
       blast complete <extensionDir> <modelId> <prompt>

Options:
  --argument <name=value>
                        Set a manifest argument for this run (repeatable). An
                        argument the manifest marks "required" must be given,
                        and an unknown name is a usage error.
  --fallback-text <text> Search text for a fallback command.
  --grant <capability>  Grant a capability to the command (repeatable). A
                        granted "clipboard.copy" records and prints the copied
                        text instead of touching an OS clipboard. LocalStorage
                        is always granted to the command's own extension; use
                        --data-dir to place its data.
  --applications <file.json>
                        Answer getApplications with the JSON array of
                        applications in <file>; the file must hold objects with
                        "name" and "path". Defaults to an empty list.
  --ai-decide <file.json> Supply AI.experimental_decide answers; denied otherwise.
  --ai-answer <text>   Answer AI.ask with this text; denied otherwise.
  --browser-tabs <file.json>
                        Supply tabs (id, url, active; optional title, favicon, content).
  --oauth-code <code>   Answer OAuth authorization with this code; denied otherwise.
  --clipboard <text>    Answer Clipboard.read/readText with <text> at offset 0
                        and an empty text at older offsets. Defaults to an
                        empty text. No real clipboard is touched.
  --selected-text <text> Answer getSelectedText; rejects when omitted or empty.
  --selected-files <path> Answer getSelectedFinderItems (repeatable; default: []).
  --frontmost <bundleId> Answer getFrontmostApplication from --applications,
                        or with that identifier and an empty path (default: Headless).
  --data-dir <dir>      Root directory for storage and dependencies (default:
                        "$XDG_DATA_HOME/blast"); the command's values are kept
                        in <dir>/storage/<extension>.json.
  --script <file|->     Drive the command with a script of the commands below;
                        "-" reads the script from stdin. Without a script, the
                        first scene is printed and the run ends.
  --json                Emit protocol-shaped NDJSON instead of text trees.
  --timeout <ms>        Abort the run after <ms> milliseconds (exit code 3).
  --help                Show this help.

Capabilities a headless run always answers: applications.list
(--applications), clipboard.read (--clipboard), preferences.open and
selection.text, selection.files, applications.frontmost and command.metadata
(printed like any other capability). clipboard.paste and clipboard.clear still need
--grant; finder.show and trash also require --grant.

Script commands (one per line, "#" starts a comment):
  action <title>  Dispatch an Action or menu item with that title.
  submenu <title>
                  Dispatch the onOpen handler of the ActionPanel.Submenu with
                  that title.
  back            Pop the current navigation view.
  confirm         Confirm the current alert.
  dismiss         Dismiss the current alert.
  search <text>   Dispatch the List or Grid onSearchTextChange handler.
  more            Load the next List/Grid page when hasMore is true.
  dropdown <value>
                  Dispatch the List.Dropdown or Grid.Dropdown onChange handler
                  with the value.
  wait            Wait until the next scene is published.
  expect <text>   Fail (exit 1) unless the latest scene tree contains the text.
  field <id> <value>  Edit a Form field (checkbox values: true/false; dates: ISO;
                     file pickers and tag pickers: comma-separated values; omit
                     value to clear).
  submit          Run the first Action.SubmitForm.
  quit            Shut down and finish with exit code 0.

Exit codes: 0 success, 1 script or expectation failure, 2 usage error,
3 extension crash or protocol error.`;

// Error kinds mapped to exit codes at the top level: usage errors print the
// usage text, script failures and crashes print an `# error` line on stderr.
class UsageError extends Error {}
class ScriptError extends Error {}
class RunError extends Error {}
/** The runtime exited cleanly without producing the scene a step waited for. */
class CleanExit extends Error {}

type HandlerRef = { $handler: string };

function handlerRef(value: JsonValue | HandlerRef | undefined): HandlerRef | undefined {
  return typeof value === "object" && value !== null && "$handler" in value
    ? (value as HandlerRef)
    : undefined;
}

// One line per node, two-space indented: `Type "title" key=value… [onAction]`.
// Values are JSON-encoded and props keep their insertion order, so the text is
// stable enough to snapshot.
function renderTree(root: SceneNode): string[] {
  const lines: string[] = [];
  const walk = (node: SceneNode, depth: number): void => {
    lines.push(`${"  ".repeat(depth)}${describe(node)}`);
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
  return lines;
}

function describe(node: SceneNode): string {
  const entries = Object.entries(node.props);
  const title = entries.find(([key, value]) => key === "title" && typeof value === "string");
  const parts = [node.type];
  if (title) parts.push(JSON.stringify(title[1]));
  for (const [key, value] of entries) {
    if (title && key === "title") continue;
    parts.push(handlerRef(value) ? `[${key}]` : `${key}=${JSON.stringify(value)}`);
  }
  return parts.join(" ");
}

// Scenes print as they are published, with the logs that arrived since the
// previous scene flushed first; in --json mode the same messages are emitted in
// their protocol shape instead.
const write = (line: string): void => {
  console.log(line);
};

function createOutput(json: boolean) {
  let logCursor = 0;
  return {
    flushLogs(session: Session): void {
      for (; logCursor < session.logs.length; logCursor++) {
        const log = session.logs[logCursor];
        if (log === undefined) break;
        write(json ? JSON.stringify(log) : `# log ${log.message}`);
      }
    },
    scene(scene: SceneMessage): void {
      if (json) return write(JSON.stringify(scene));
      if (scene.root) for (const line of renderTree(scene.root)) write(line);
    },
    capability(request: CapabilityRequestMessage, result: CapabilityResultMessage): void {
      if (request.name.startsWith("oauth.tokens.")) {
        const redacted = { ...request, params: {} };
        return write(json ? JSON.stringify(redacted) : `# capability ${request.name} [redacted]`);
      }
      if (json) return write(JSON.stringify(request));
      if (result.ok) {
        return write(`# capability ${request.name} ${JSON.stringify(request.params)}`);
      }
      return write(`# capability ${request.name} ${result.error.code}`);
    },
  };
}

type Output = ReturnType<typeof createOutput>;

function reportingBroker(inner: Broker, output: Output): Broker {
  return async (request, context) => {
    const result = await inner(request, context);
    output.capability(request, result);
    return result;
  };
}

// Every granted capability records its request (printed by the broker) and
// succeeds without touching privileged host state.
function grantHandlers(grants: string[]): Record<string, CapabilityHandler> {
  const handlers: Record<string, CapabilityHandler> = {};
  for (const name of grants) {
    if (
      !["oauth.authorize", "ai.ask", "ai.decide", "browser.tabs", "browser.content"].includes(name)
    )
      handlers[name] = () => null;
  }
  return handlers;
}

type Step =
  | { op: "action"; title: string }
  | { op: "submenu"; title: string }
  | { op: "search"; text: string }
  | { op: "confirm" | "dismiss" }
  | { op: "dropdown"; value: string }
  | { op: "field"; id: string; value: string }
  | { op: "submit" }
  | { op: "more" }
  | { op: "back" }
  | { op: "wait" }
  | { op: "expect"; text: string }
  | { op: "quit" };

function parseScript(source: string): Step[] {
  const steps: Step[] = [];
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf(" ");
    const word = (separator === -1 ? line : line.slice(0, separator)).toLowerCase();
    const rest = separator === -1 ? "" : line.slice(separator + 1).trim();
    switch (word) {
      case "action":
        if (rest === "") throw new ScriptError(`script line ${index + 1}: action needs a title`);
        steps.push({ op: "action", title: rest });
        break;
      case "submenu":
        if (rest === "") throw new ScriptError(`script line ${index + 1}: submenu needs a title`);
        steps.push({ op: "submenu", title: rest });
        break;
      case "search":
        if (rest === "") throw new ScriptError(`script line ${index + 1}: search needs text`);
        steps.push({ op: "search", text: rest });
        break;
      case "confirm":
      case "dismiss":
        steps.push({ op: word });
        break;
      case "dropdown":
        if (rest === "") throw new ScriptError(`script line ${index + 1}: dropdown needs a value`);
        steps.push({ op: "dropdown", value: rest });
        break;
      case "field": {
        const split = rest.indexOf(" ");
        if (rest === "")
          throw new ScriptError(`script line ${index + 1}: field needs an id and value`);
        steps.push({
          op: "field",
          id: split === -1 ? rest : rest.slice(0, split),
          value: split === -1 ? "" : rest.slice(split + 1),
        });
        break;
      }
      case "more":
      case "submit":
        steps.push({ op: word });
        break;
      case "back":
        steps.push({ op: "back" });
        break;
      case "wait":
        steps.push({ op: "wait" });
        break;
      case "expect":
        if (rest === "") throw new ScriptError(`script line ${index + 1}: expect needs text`);
        steps.push({ op: "expect", text: rest });
        break;
      case "quit":
        steps.push({ op: "quit" });
        break;
      default:
        throw new ScriptError(`script line ${index + 1}: unknown command ${JSON.stringify(word)}`);
    }
  }
  return steps;
}

function findNode(root: SceneNode, match: (node: SceneNode) => boolean): SceneNode | undefined {
  if (match(root)) return root;
  for (const child of root.children) {
    const found = findNode(child, match);
    if (found) return found;
  }
  return undefined;
}

function waitForScene(session: Session, after: number): Promise<SceneMessage> {
  const latest = session.latestScene;
  if (latest && latest.revision > after) return Promise.resolve(latest);
  return new Promise((resolve, reject) => {
    const unsubscribe = session.scenes((scene) => {
      if (scene.revision > after) {
        unsubscribe();
        resolve(scene);
      }
    });
    void session.exited.then((exit) => {
      unsubscribe();
      if (exit.error) reject(new RunError(exit.error.message));
      else if (exit.code === 0 && exit.signal === null) {
        reject(new CleanExit("runtime exited without publishing the awaited scene"));
      } else reject(new RunError(`runtime exited with code ${exit.code ?? exit.signal}`));
    });
  });
}

function currentScene(session: Session): Promise<SceneMessage> {
  return session.latestScene ? Promise.resolve(session.latestScene) : waitForScene(session, -1);
}

async function runScript(session: Session, steps: Step[]): Promise<void> {
  // Highest scene revision this script has synchronized with; `wait` resolves
  // only for scenes newer than the one the previous step acted on.
  let observed = session.latestScene?.revision ?? -1;
  for (const step of steps) {
    if (step.op === "quit") return;
    switch (step.op) {
      case "confirm":
      case "dismiss": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const alert = scene.root
          ? findNode(scene.root, (node) => node.type === "Alert")
          : undefined;
        const name = step.op === "confirm" ? "primaryAction" : "dismissAction";
        const node = alert?.children.find((child) => child.props.name === name);
        const handler = node ? handlerRef(node.props.onAction) : undefined;
        if (!node || !handler) throw new ScriptError("no alert to answer");
        session.sendEvent(node.id, handler.$handler, []);
        break;
      }
      case "back": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const node = scene.root?.type === "Navigation" ? scene.root : undefined;
        const handler = node ? handlerRef(node.props.pop) : undefined;
        if (!node || !handler) throw new ScriptError("no navigation view to pop");
        session.sendEvent(node.id, handler.$handler, []);
        break;
      }
      case "action": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const node = scene.root
          ? findNode(
              scene.root,
              (item) =>
                (item.type.startsWith("Action") || item.type === "MenuBarExtra.Item") &&
                item.props.title === step.title,
            )
          : undefined;
        const handler = node ? handlerRef(node.props.onAction) : undefined;
        if (!node || !handler) {
          throw new ScriptError(`no Action with onAction titled ${JSON.stringify(step.title)}`);
        }
        session.sendEvent(
          node.id,
          handler.$handler,
          node.type === "MenuBarExtra.Item" ? [{ type: "left-click" }] : [],
        );
        break;
      }
      case "submenu": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const node = scene.root
          ? findNode(
              scene.root,
              (item) => item.type === "ActionPanel.Submenu" && item.props.title === step.title,
            )
          : undefined;
        const handler = node ? handlerRef(node.props.onOpen) : undefined;
        if (!node || !handler) {
          throw new ScriptError(
            `no ActionPanel.Submenu with onOpen titled ${JSON.stringify(step.title)}`,
          );
        }
        session.sendEvent(node.id, handler.$handler, []);
        break;
      }
      case "field":
      case "submit": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const node = scene.root
          ? findNode(scene.root, (item) =>
              step.op === "submit"
                ? item.type === "Action.SubmitForm"
                : item.type.startsWith("Form.") && item.props.id === step.id,
            )
          : undefined;
        const handler = node
          ? handlerRef(node.props[step.op === "submit" ? "onAction" : "onChange"])
          : undefined;
        if (!node || !handler)
          throw new ScriptError(
            step.op === "submit"
              ? "no Action.SubmitForm to submit"
              : `no editable Form field ${JSON.stringify(step.id)}`,
          );
        let args: JsonValue[] = [];
        if (step.op === "field") {
          if (node.type === "Form.Checkbox" && !["true", "false"].includes(step.value))
            throw new ScriptError("checkbox field value must be true or false");
          const value =
            node.type === "Form.FilePicker" || node.type === "Form.TagPicker"
              ? step.value === ""
                ? []
                : step.value.split(",")
              : node.type === "Form.Checkbox"
                ? step.value === "true"
                : step.value;
          args = [value];
        }
        session.sendEvent(node.id, handler.$handler, args);
        break;
      }
      case "more": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const view = scene.root
          ? findNode(scene.root, (item) => item.type === "List" || item.type === "Grid")
          : undefined;
        const pagination = view?.props.pagination;
        const config =
          pagination && typeof pagination === "object" && !Array.isArray(pagination)
            ? pagination
            : undefined;
        const handler = handlerRef(
          config && "onLoadMore" in config ? config.onLoadMore : undefined,
        );
        if (!view || !handler || !config || !("hasMore" in config) || config.hasMore !== true)
          throw new ScriptError("no List or Grid with more pages to load");
        session.sendEvent(view.id, handler.$handler, []);
        break;
      }
      case "search": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const view = scene.root
          ? findNode(scene.root, (item) => item.type === "List" || item.type === "Grid")
          : undefined;
        const handler = view ? handlerRef(view.props.onSearchTextChange) : undefined;
        if (!view || !handler)
          throw new ScriptError("no List or Grid with onSearchTextChange to search");
        session.sendEvent(view.id, handler.$handler, [step.text]);
        break;
      }
      case "dropdown": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const dropdown = scene.root
          ? findNode(
              scene.root,
              (item) => item.type === "List.Dropdown" || item.type === "Grid.Dropdown",
            )
          : undefined;
        const handler = dropdown ? handlerRef(dropdown.props.onChange) : undefined;
        if (!dropdown || !handler)
          throw new ScriptError("no List.Dropdown or Grid.Dropdown with onChange to select");
        session.sendEvent(dropdown.id, handler.$handler, [step.value]);
        break;
      }
      case "wait": {
        observed = (await waitForScene(session, observed)).revision;
        break;
      }
      case "expect": {
        const scene = await currentScene(session);
        const lines = scene.root ? renderTree(scene.root) : [];
        if (!lines.some((line) => line.includes(step.text))) {
          throw new ScriptError(`expected the scene to contain ${JSON.stringify(step.text)}`);
        }
        break;
      }
    }
  }
}

type RunOptions = {
  extensionDir: string;
  command: string;
  argumentSpecs: string[];
  fallbackText: string | undefined;
  grants: string[];
  applications: Application[] | undefined;
  clipboard: string | undefined;
  selectedText: string | undefined;
  aiAnswer: string | undefined;
  aiDecide: JsonValue | undefined;
  browserTabs: BrowserTab[] | undefined;
  oauthCode: string | undefined;
  selectedFiles: string[];
  frontmost: string | undefined;
  dataDir: string;
  scriptSource: string | undefined;
  json: boolean;
  timeoutMs: number | undefined;
};

/** `--argument name=value` values, checked against the manifest's arguments. */
function parseArgumentValues(
  specs: readonly string[],
  declared: readonly CommandArgument[],
  command: string,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const spec of specs) {
    const separator = spec.indexOf("=");
    if (separator < 1) {
      throw new UsageError(`--argument must be name=value, got ${JSON.stringify(spec)}`);
    }
    const name = spec.slice(0, separator);
    if (!declared.some((argument) => argument.name === name)) {
      throw new UsageError(
        `command ${JSON.stringify(command)} has no argument ${JSON.stringify(name)}`,
      );
    }
    values[name] = spec.slice(separator + 1);
  }
  const missing = declared.filter(
    (argument) => argument.required === true && values[argument.name] === undefined,
  );
  if (missing.length) {
    const names = missing.map((argument) => argument.name).join(", ");
    throw new UsageError(
      `missing required ${missing.length === 1 ? "argument" : "arguments"} ${names} for ` +
        `${JSON.stringify(command)}: pass --argument <name=value>`,
    );
  }
  return values;
}

// Best-effort temp cleanup when the CLI itself is interrupted; the runtime
// child exits on its own once the parent's stdin pipe closes.
const SIGNAL_NUMBERS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;
let cleanupDirectory: string | undefined;
for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (cleanupDirectory !== undefined) {
      rmSync(cleanupDirectory, { force: true, recursive: true });
    }
    process.exit(128 + SIGNAL_NUMBERS[signal]);
  });
}
// A reader that stops early (`blast run … | head`) closes stdout: finish
// quietly instead of crashing on EPIPE.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EPIPE") throw error;
  if (cleanupDirectory !== undefined) rmSync(cleanupDirectory, { force: true, recursive: true });
  process.exit(EXIT_OK);
});

async function run(options: RunOptions): Promise<number> {
  const output = createOutput(options.json);
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    if (options.timeoutMs !== undefined) {
      deadlineTimer = setTimeout(() => {
        reject(new RunError(`timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
    }
  });
  // A rejection landing between two races must not surface as unhandled.
  deadline.catch(() => undefined);
  let outDir: string | undefined;
  let session: Session | undefined;
  let stopScenes: (() => void) | undefined;
  try {
    const steps =
      options.scriptSource === undefined ? undefined : parseScript(options.scriptSource);
    let bundled: BundledCommand;
    try {
      bundled = await Promise.race([
        bundleCommand({
          extensionDir: options.extensionDir,
          command: options.command,
          dataDir: options.dataDir,
        }),
        deadline,
      ]);
    } catch (error) {
      if (error instanceof RunError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      // A bad extension or command name is the caller's usage error; any other
      // bundling failure is reported like a crash.
      if (/^(Unknown extension command|Invalid command name|Missing source for )/.test(message)) {
        throw new UsageError(message);
      }
      throw new RunError(message);
    }
    for (const message of bundled.dependencyWarnings ?? []) {
      write(
        options.json ? JSON.stringify({ type: "log", level: "warn", message }) : `# log ${message}`,
      );
    }
    outDir = dirname(bundled.entry);
    cleanupDirectory = outDir;
    const argumentValues = parseArgumentValues(
      options.argumentSpecs,
      bundled.arguments,
      options.command,
    );
    // Local storage is granted to the session's own extension by default and
    // overrides `--grant storage.*`, so a stale grant cannot disable it. The
    // read-only headless defaults override a bare `--grant` the same way:
    // answering them with null would break the extension.
    const broker = createSessionBroker(
      { extensionName: bundled.extensionName, dataDir: options.dataDir },
      {
        handlers: {
          ...grantHandlers(options.grants),
          ...createHeadlessHandlers({
            aiAnswer: options.aiAnswer,
            browserTabs: options.browserTabs,
            oauthCode: options.oauthCode,
            applications: options.applications,
            clipboard: options.clipboard,
            selectedText: options.selectedText,
            selectedFiles: options.selectedFiles,
            frontmost: options.frontmost,
          }),
          ...(options.aiDecide === undefined ? {} : { "ai.decide": () => options.aiDecide! }),
        },
      },
    );
    session = await Promise.race([
      startCommand({
        ...bundled,
        argumentValues,
        ...(options.fallbackText === undefined ? {} : { fallbackText: options.fallbackText }),
        dataDir: options.dataDir,
        availableAPIs: [
          ...(options.aiAnswer === undefined ? [] : ["AI" as const]),
          ...(options.browserTabs === undefined ? [] : ["BrowserExtension" as const]),
        ],
        broker: reportingBroker(broker, output),
      }),
      deadline,
    ]).catch((error: unknown) => {
      throw new RunError(error instanceof Error ? error.message : String(error));
    });
    const active = session;
    stopScenes = active.scenes((scene) => {
      output.flushLogs(active);
      output.scene(scene);
    });
    await Promise.race([
      steps === undefined ? waitForScene(active, -1) : runScript(active, steps),
      deadline,
    ]);
    output.flushLogs(active);
    // A graceful exit waits for host acknowledgements of pending writes (form
    // drafts, storeValue). On a loaded machine that can exceed a few hundred ms,
    // and SIGTERM then loses the data; a hung child is still bounded by
    // `--timeout` through `deadline`.
    const exit = await Promise.race([
      active.shutdown({ timeoutMs: GRACEFUL_SHUTDOWN_MS }),
      deadline,
    ]);
    if (exit.error) throw new RunError(exit.error.message);
    if (exit.code !== 0 || exit.signal !== null) {
      throw new RunError(`runtime exited with code ${exit.code ?? exit.signal}`);
    }
    return EXIT_OK;
  } catch (error) {
    if (error instanceof UsageError) throw error;
    if (error instanceof CleanExit) return EXIT_OK;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`# error ${message}`);
    return error instanceof ScriptError ? EXIT_FAILURE : EXIT_CRASH;
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    stopScenes?.();
    await session?.shutdown({ timeoutMs: 250 });
    if (session) output.flushLogs(session);
    if (outDir !== undefined) await rm(outDir, { recursive: true, force: true });
  }
}

const GRACEFUL_SHUTDOWN_MS = 5000;

function parseArguments(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        argument: { type: "string", multiple: true },
        grant: { type: "string", multiple: true },
        applications: { type: "string" },
        clipboard: { type: "string" },
        "oauth-code": { type: "string" },
        "ai-answer": { type: "string" },
        "ai-decide": { type: "string" },
        "browser-tabs": { type: "string" },
        "selected-text": { type: "string" },
        "selected-files": { type: "string", multiple: true },
        frontmost: { type: "string" },
        "data-dir": { type: "string" },
        "fallback-text": { type: "string" },
        script: { type: "string" },
        json: { type: "boolean" },
        timeout: { type: "string" },
        help: { type: "boolean" },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

async function readScript(specifier: string): Promise<string> {
  try {
    return specifier === "-" ? await readStdin() : await readFile(specifier, "utf8");
  } catch {
    throw new UsageError(`cannot read script ${JSON.stringify(specifier)}`);
  }
}

async function readDecisions(path: string): Promise<JsonValue> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new UsageError(`cannot read --ai-decide JSON file ${JSON.stringify(path)}`);
  }
}

async function readBrowserTabs(specifier: string): Promise<BrowserTab[]> {
  try {
    return parseBrowserTabs(await readFile(specifier, "utf8"));
  } catch (error) {
    throw new UsageError(
      `--browser-tabs ${JSON.stringify(specifier)}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function readApplications(specifier: string): Promise<Application[]> {
  let text: string;
  try {
    text = await readFile(specifier, "utf8");
  } catch (error) {
    throw new UsageError(`cannot read --applications file ${JSON.stringify(specifier)}`, {
      cause: error,
    });
  }
  try {
    return parseApplications(text);
  } catch (error) {
    throw new UsageError(
      `--applications ${JSON.stringify(specifier)}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseArguments(argv);
  if (parsed.values.help) {
    console.log(USAGE);
    return EXIT_OK;
  }
  const [subcommand, extensionDir, command, prompt] = parsed.positionals;
  if (subcommand === "deps") {
    if (!extensionDir || parsed.positionals.length !== 2)
      throw new UsageError("expected deps <extensionDir>");
    if (parsed.values["data-dir"] === "") throw new UsageError("--data-dir must not be empty");
    await installExtensionDependencies({
      extensionDir,
      dataDir: parsed.values["data-dir"] ?? defaultDataDir(),
      onLog: (message) => console.log(message.trimEnd()),
    });
    return EXIT_OK;
  }
  if (subcommand === "models" || subcommand === "complete") {
    if (!extensionDir || parsed.positionals.length !== (subcommand === "models" ? 2 : 4))
      throw new UsageError(
        "expected models <extensionDir> or complete <extensionDir> <modelId> <prompt>",
      );
    const bundled = await bundleModelProvider({
      extensionDir,
      dataDir: parsed.values["data-dir"] ?? defaultDataDir(),
    });
    cleanupDirectory = dirname(bundled.entry);
    let provider: Awaited<ReturnType<typeof startModelProvider>> | undefined;
    try {
      provider = await startModelProvider({
        ...bundled,
        ...(parsed.values["data-dir"] === undefined ? {} : { dataDir: parsed.values["data-dir"] }),
      });
      const models = await provider.getModels();
      if (subcommand === "models") console.log(JSON.stringify(models));
      else {
        const model = models.find((item) => item.id === command);
        if (!model) throw new UsageError(`Unknown model ${command}`);
        for await (const part of provider.stream(model, {
          messages: [{ role: "user", content: [{ type: "text", text: prompt! }] }],
          providerOptions: {
            raycast: {
              locale: "en",
              currentDate: new Date().toISOString(),
              sessionId: "blast-cli",
            },
          },
        })) {
          if (part.type === "text-delta") process.stdout.write(part.textDelta ?? part.text ?? "");
          else if (part.type === "text") process.stdout.write(part.text);
          else if (part.type === "finish") console.log(`\n${JSON.stringify(part)}`);
        }
      }
      return EXIT_OK;
    } finally {
      await provider?.shutdown({ timeoutMs: 250 });
      await rm(dirname(bundled.entry), { recursive: true, force: true });
    }
  }
  if (
    subcommand !== "run" ||
    extensionDir === undefined ||
    command === undefined ||
    parsed.positionals.length !== 3
  ) {
    throw new UsageError('expected "run <extensionDir> <command>"');
  }
  let timeoutMs: number | undefined;
  if (parsed.values.timeout !== undefined) {
    const value = Number(parsed.values.timeout);
    if (!Number.isInteger(value) || value < 1) {
      throw new UsageError("--timeout must be a positive number of milliseconds");
    }
    timeoutMs = value;
  }
  const script = parsed.values.script;
  const dataDir = parsed.values["data-dir"];
  if (dataDir === "") throw new UsageError("--data-dir must not be empty");
  const applicationsPath = parsed.values.applications;
  return run({
    extensionDir,
    command,
    argumentSpecs: parsed.values.argument ?? [],
    fallbackText: parsed.values["fallback-text"],
    grants: parsed.values.grant ?? [],
    applications:
      applicationsPath === undefined ? undefined : await readApplications(applicationsPath),
    clipboard: parsed.values.clipboard,
    aiAnswer: parsed.values["ai-answer"],
    aiDecide:
      parsed.values["ai-decide"] === undefined
        ? undefined
        : await readDecisions(parsed.values["ai-decide"]),
    browserTabs:
      parsed.values["browser-tabs"] === undefined
        ? undefined
        : await readBrowserTabs(parsed.values["browser-tabs"]),
    oauthCode: parsed.values["oauth-code"],
    selectedText: parsed.values["selected-text"],
    selectedFiles: parsed.values["selected-files"] ?? [],
    frontmost: parsed.values.frontmost,
    dataDir: dataDir ?? defaultDataDir(),
    scriptSource: script === undefined ? undefined : await readScript(script),
    json: parsed.values.json === true,
    timeoutMs,
  });
}

let code: number;
try {
  code = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`blast: ${error.message}`);
    console.error(USAGE);
    code = EXIT_USAGE;
  } else {
    console.error(`# error ${error instanceof Error ? error.message : String(error)}`);
    code = EXIT_CRASH;
  }
}
// Let piped stdout and stderr drain before exiting so tests capture everything.
await Promise.all([
  new Promise<void>((done) => process.stdout.write("", () => done())),
  new Promise<void>((done) => process.stderr.write("", () => done())),
]);
process.exit(code);
