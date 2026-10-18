// The `blast` debug CLI: bundles and runs one extension command headlessly and
// prints every published scene — as a readable text tree, or as protocol-shaped
// NDJSON with `--json`. A `--script` drives the command (action / search /
// dropdown / back / confirm / dismiss / wait / expect / quit), which is how e2e tests interact
// with extensions. See "Debugging extensions" in docs/architecture.md.

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
  createBroker,
  startCommand,
  type Broker,
  type CapabilityHandler,
  type BundledCommand,
  type Session,
} from "./index.ts";

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_CRASH = 3;

const USAGE = `Run a Raycast extension command headlessly.

Usage: blast run <extensionDir> <command> [options]

Options:
  --grant <capability>  Grant a capability to the command (repeatable). A
                        granted "clipboard.copy" records and prints the copied
                        text instead of touching an OS clipboard.
  --script <file|->     Drive the command with a script of the commands below;
                        "-" reads the script from stdin. Without a script, the
                        first scene is printed and the run ends.
  --json                Emit protocol-shaped NDJSON instead of text trees.
  --timeout <ms>        Abort the run after <ms> milliseconds (exit code 3).
  --help                Show this help.

Script commands (one per line, "#" starts a comment):
  action <title>  Dispatch onAction on the Action node with that title.
  back            Pop the current navigation view.
  confirm         Confirm the current alert.
  dismiss         Dismiss the current alert.
  search <text>   Dispatch the List onSearchTextChange handler.
  dropdown <value>
                  Dispatch the List.Dropdown onChange handler with the value.
  wait            Wait until the next scene is published.
  expect <text>   Fail (exit 1) unless the latest scene tree contains the text.
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
  return async (request) => {
    const result = await inner(request);
    output.capability(request, result);
    return result;
  };
}

// Every granted capability records its request (printed by the broker) and
// succeeds without touching privileged host state.
function grantHandlers(grants: string[]): Record<string, CapabilityHandler> {
  const handlers: Record<string, CapabilityHandler> = {};
  for (const name of grants) handlers[name] = () => null;
  return handlers;
}

type Step =
  | { op: "action"; title: string }
  | { op: "search"; text: string }
  | { op: "confirm" | "dismiss" }
  | { op: "dropdown"; value: string }
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
              (item) => item.type.startsWith("Action") && item.props.title === step.title,
            )
          : undefined;
        const handler = node ? handlerRef(node.props.onAction) : undefined;
        if (!node || !handler) {
          throw new ScriptError(`no Action with onAction titled ${JSON.stringify(step.title)}`);
        }
        session.sendEvent(node.id, handler.$handler, []);
        break;
      }
      case "search": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const list = scene.root ? findNode(scene.root, (item) => item.type === "List") : undefined;
        const handler = list ? handlerRef(list.props.onSearchTextChange) : undefined;
        if (!list || !handler) throw new ScriptError("no List with onSearchTextChange to search");
        session.sendEvent(list.id, handler.$handler, [step.text]);
        break;
      }
      case "dropdown": {
        const scene = await currentScene(session);
        observed = Math.max(observed, scene.revision);
        const dropdown = scene.root
          ? findNode(scene.root, (item) => item.type === "List.Dropdown")
          : undefined;
        const handler = dropdown ? handlerRef(dropdown.props.onChange) : undefined;
        if (!dropdown || !handler)
          throw new ScriptError("no List.Dropdown with onChange to select");
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
  grants: string[];
  scriptSource: string | undefined;
  json: boolean;
  timeoutMs: number | undefined;
};

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
        bundleCommand({ extensionDir: options.extensionDir, command: options.command }),
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
    outDir = dirname(bundled.entry);
    cleanupDirectory = outDir;
    session = await Promise.race([
      startCommand({
        ...bundled,
        broker: reportingBroker(createBroker(grantHandlers(options.grants)), output),
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
    const exit = await Promise.race([active.shutdown({ timeoutMs: 250 }), deadline]);
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

function parseArguments(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        grant: { type: "string", multiple: true },
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
  const [subcommand, extensionDir, command] = parsed.positionals;
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
  return run({
    extensionDir,
    command,
    grants: parsed.values.grant ?? [],
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
