// Runs Alfred script objects (Run Script, Script Filter) the way Alfred does:
// the same interpreters, the same argv / `{query}` conventions and the
// standard `alfred_*` environment. Each script gets its own process group so a
// cancel kills everything it started, not just the interpreter.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { userConfigDefault } from "./manifest.ts";
import type { PlistValue } from "./plist.ts";
import { plistString, type AlfredWorkflow, type PlistDict } from "./workflow.ts";

/** How a `config.type` value runs its script. */
export type ScriptInterpreter = {
  type: number;
  label: string;
  command: string;
  /** Arguments before the script itself, e.g. `["--no-rcs"]`. */
  args: string[];
  /**
   * `shell`: `-c script -- args`; `flag`: `<flag> script [--] args`;
   * `stdin`: script on standard input; `file`: `config.scriptfile`.
   */
  mode: "shell" | "flag" | "stdin" | "file";
  flag?: string;
  /** Whether a `--` must separate the script from its arguments. */
  separator?: boolean;
  macOnly?: boolean;
};

const INTERPRETERS: ScriptInterpreter[] = [
  { type: 0, label: "bash", command: "/bin/bash", args: [], mode: "shell" },
  {
    type: 1,
    label: "php",
    command: "/usr/bin/php",
    args: [],
    mode: "flag",
    flag: "-r",
    separator: true,
  },
  {
    type: 2,
    label: "ruby",
    command: "/usr/bin/ruby",
    args: [],
    mode: "flag",
    flag: "-e",
    separator: true,
  },
  { type: 3, label: "python", command: "/usr/bin/python", args: [], mode: "flag", flag: "-c" },
  {
    type: 4,
    label: "perl",
    command: "/usr/bin/perl",
    args: [],
    mode: "flag",
    flag: "-e",
    separator: true,
  },
  { type: 5, label: "zsh", command: "/bin/zsh", args: [], mode: "shell" },
  {
    type: 6,
    label: "AppleScript",
    command: "/usr/bin/osascript",
    args: [],
    mode: "flag",
    flag: "-e",
    macOnly: true,
  },
  {
    type: 7,
    label: "JavaScript for Automation",
    command: "/usr/bin/osascript",
    args: ["-l", "JavaScript"],
    mode: "flag",
    flag: "-e",
    macOnly: true,
  },
  { type: 8, label: "external script", command: "", args: [], mode: "file" },
  { type: 9, label: "python3", command: "/usr/bin/python3", args: [], mode: "flag", flag: "-c" },
  { type: 10, label: "swift", command: "/usr/bin/swift", args: ["-"], mode: "stdin" },
  { type: 11, label: "zsh (no rcs)", command: "/bin/zsh", args: ["--no-rcs"], mode: "shell" },
];

export function scriptInterpreter(type: number): ScriptInterpreter | undefined {
  return INTERPRETERS.find((entry) => entry.type === type);
}

export type ResolvedScriptCommand = {
  interpreter: ScriptInterpreter;
  command: string;
  args: string[];
  /** Written to the child's standard input, then closed. */
  stdin?: string;
};

function integer(value: PlistValue | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

// Alfred joins multiple arguments with a tab when one string is needed.
export function queryText(query: string | string[]): string {
  return Array.isArray(query) ? query.join("\t") : query;
}

const ESCAPE_BITS: [number, string][] = [
  [1, " "],
  [2, "`"],
  [4, '"'],
  [8, "[](){}"],
  [16, "$"],
  [32, "\\"],
  [64, "'"],
  [128, ";"],
];

/**
 * Backslash-escapes the characters selected by Alfred's `escaping` bitmask.
 * Working character by character escapes each original backslash exactly
 * once, which is what "backslashes first" achieves in a multi-pass escaper.
 */
export function escapeQuery(query: string, mask: number): string {
  const escaped = new Set<string>();
  for (const [bit, chars] of ESCAPE_BITS) {
    if ((mask & bit) !== 0) for (const char of chars) escaped.add(char);
  }
  if (escaped.size === 0) return query;
  let out = "";
  for (const char of query) out += escaped.has(char) ? `\\${char}` : char;
  return out;
}

/** How {@link resolveScriptCommand} finds an interpreter missing from its fixed path. */
export type InterpreterLookup = {
  /** The script's environment; its `PATH` is searched. */
  env: Record<string, string | undefined>;
  exists(path: string): boolean;
};

// Where Homebrew installs interpreters that newer macOS no longer ships.
const DARWIN_EXTRA_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"];

/**
 * Alfred's interpreters live at fixed paths, but macOS dropped `/usr/bin/php`
 * and `/usr/bin/python`; users install them elsewhere. A missing one is looked
 * up by name on `PATH` (plus Homebrew's prefixes on macOS); when nothing is
 * found the original path stays, so the spawn error still names it.
 */
export function resolveInterpreterPath(
  command: string,
  lookup: InterpreterLookup,
  platform: string = process.platform,
): string {
  if (lookup.exists(command)) return command;
  const dirs = (lookup.env.PATH ?? "").split(delimiter);
  if (platform === "darwin") dirs.push(...DARWIN_EXTRA_PATHS);
  const name = basename(command);
  for (const dir of new Set(dirs)) {
    // A relative entry would resolve against the workflow folder.
    if (!isAbsolute(dir)) continue;
    const candidate = join(dir, name);
    if (lookup.exists(candidate)) return candidate;
  }
  return command;
}

// `php -r` rejects the open tag that inline Alfred PHP scripts often carry.
function stripPhpTags(script: string): string {
  return script.replace(/^\s*<\?php\b/, "").replace(/\?>\s*$/, "");
}

/**
 * The command line Alfred would run for a script object. `config.scriptargtype`
 * 1 passes the query as positional arguments; anything else substitutes
 * `{query}` (escaped with `config.escaping`) into the script text. With a
 * `lookup`, a missing interpreter falls back to one found on `PATH`.
 */
export function resolveScriptCommand(
  config: PlistDict,
  workflowDir: string,
  query: string | string[],
  platform: string = process.platform,
  lookup?: InterpreterLookup,
): ResolvedScriptCommand {
  const type = integer(config.type, 0);
  const interpreter = scriptInterpreter(type);
  if (!interpreter) throw new Error(`alfred: unknown script type ${type}`);
  if (interpreter.macOnly && platform !== "darwin") {
    throw new Error(
      `alfred: ${interpreter.label} scripts (type ${type}) need macOS; this host runs ${platform}`,
    );
  }
  const argvMode = config.scriptargtype === 1;
  const argv = argvMode ? (Array.isArray(query) ? query : [query]) : [];

  if (interpreter.mode === "file") {
    const file = plistString(config.scriptfile).trim();
    if (!file) throw new Error("alfred: external script object has no scriptfile");
    const root = resolve(workflowDir);
    const path = resolve(root, file);
    const rel = relative(root, path);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`alfred: scriptfile ${JSON.stringify(file)} is outside the workflow`);
    }
    // External scripts never see `{query}` substitution; they always get argv.
    return { interpreter, command: path, args: argvMode ? argv : [queryText(query)] };
  }

  let script = plistString(config.script);
  if (!argvMode) {
    script = script.replaceAll(
      "{query}",
      escapeQuery(queryText(query), integer(config.escaping, 0)),
    );
  }
  const command = lookup
    ? resolveInterpreterPath(interpreter.command, lookup, platform)
    : interpreter.command;
  switch (interpreter.mode) {
    case "shell":
      // `--` becomes `$0`, so `$1` / `$@` hold the arguments as in Alfred.
      return { interpreter, command, args: [...interpreter.args, "-c", script, "--", ...argv] };
    case "stdin":
      return { interpreter, command, args: [...interpreter.args, ...argv], stdin: script };
    default: {
      const body = type === 1 ? stripPhpTags(script) : script;
      const separator = interpreter.separator && argv.length > 0 ? ["--"] : [];
      return {
        interpreter,
        command,
        args: [...interpreter.args, interpreter.flag ?? "-e", body, ...separator, ...argv],
      };
    }
  }
}

export type VariableValue = string | number | boolean;

function variableText(value: VariableValue): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

/**
 * Workflow variables as scripts and placeholders see them: user configuration
 * defaults, then workflow variables, then stored preferences, then the
 * session variables set while the workflow runs.
 */
export function workflowVariables(options: {
  workflow: AlfredWorkflow;
  preferences?: Record<string, VariableValue | undefined>;
  variables?: Record<string, VariableValue | undefined>;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of options.workflow.userConfig) {
    const value = userConfigDefault(item);
    if (value !== undefined) out[item.variable] = value;
  }
  Object.assign(out, options.workflow.variables);
  for (const layer of [options.preferences, options.variables]) {
    for (const [name, value] of Object.entries(layer ?? {})) {
      if (value !== undefined) out[name] = variableText(value);
    }
  }
  return out;
}

export type WorkflowEnvOptions = {
  workflow: AlfredWorkflow;
  /** The workflow's data folder (`alfred_workflow_data`). */
  supportPath: string;
  /** `alfred_workflow_uid`; defaults to the workflow folder name. */
  uid?: string;
  theme?: "dark" | "light";
  debug?: boolean;
  preferences?: Record<string, VariableValue | undefined>;
  variables?: Record<string, VariableValue | undefined>;
  /** Inherited environment; defaults to `process.env`. */
  baseEnv?: Record<string, string | undefined>;
};

export const ALFRED_VERSION = "5.5";

const THEME_BACKGROUND = {
  dark: "rgba(30,30,30,0.95)",
  light: "rgba(255,255,255,0.98)",
};

/** The environment Alfred gives every script, plus workflow variables. */
export function buildWorkflowEnv(options: WorkflowEnvOptions): Record<string, string> {
  const { workflow } = options;
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.baseEnv ?? process.env)) {
    if (value !== undefined) env[name] = value;
  }
  Object.assign(env, {
    alfred_version: ALFRED_VERSION,
    alfred_workflow_bundleid: workflow.bundleId,
    alfred_workflow_name: workflow.name,
    alfred_workflow_uid: options.uid ?? (workflow.dir ? basename(workflow.dir) : workflow.bundleId),
    alfred_workflow_version: workflow.version,
    alfred_workflow_description: workflow.description,
    alfred_workflow_data: options.supportPath,
    alfred_workflow_cache: join(options.supportPath, "cache"),
    alfred_theme_background: THEME_BACKGROUND[options.theme ?? "dark"],
    alfred_debug: options.debug ? "1" : "0",
  });
  return Object.assign(env, workflowVariables(options));
}

export type ScriptResult = {
  stdout: string;
  stderr: string;
  /** `null` when the process ended by signal. */
  exitCode: number | null;
  signal: string | null;
  aborted: boolean;
  timedOut: boolean;
  /** Output beyond `maxOutputBytes` was dropped and the script was stopped. */
  truncated: boolean;
};

export type RunScriptOptions = {
  config: PlistDict;
  workflowDir: string;
  query: string | string[];
  env: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Per stream; default 16 MiB. */
  maxOutputBytes?: number;
  /** Delay between SIGTERM and SIGKILL when stopping a script; default 1000 ms. */
  killGraceMs?: number;
  platform?: string;
  onStdout?: (chunk: string) => void;
};

export const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** Runs a script object and collects its output. Rejects only when it cannot start. */
export async function runWorkflowScript(options: RunScriptOptions): Promise<ScriptResult> {
  const resolved = resolveScriptCommand(
    options.config,
    options.workflowDir,
    options.query,
    options.platform,
    { env: options.env, exists: existsSync },
  );
  const posix = process.platform !== "win32";
  const limit = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const grace = options.killGraceMs ?? 1000;
  const { signal } = options;
  if (signal?.aborted) {
    return {
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      aborted: true,
      timedOut: false,
      truncated: false,
    };
  }

  return new Promise<ScriptResult>((resolvePromise, reject) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.workflowDir,
      env: options.env,
      // Its own process group, so stopping it reaches every descendant.
      detached: posix,
      // A socket on stdin makes bash think it runs under sshd and source
      // ~/.bashrc, so scripts without input get /dev/null.
      stdio: [resolved.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let aborted = false;
    let timedOut = false;
    let truncated = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const kill = (sig: NodeJS.Signals): void => {
      try {
        if (posix && child.pid !== undefined) process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {
        // The group is already gone.
      }
    };
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), grace);
    };

    const collect = (onText?: (chunk: string) => void) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const decoder = onText ? new StringDecoder("utf8") : undefined;
      return {
        chunks,
        push(chunk: Buffer): void {
          if (size >= limit) return;
          const room = limit - size;
          const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
          chunks.push(kept);
          size += kept.length;
          if (decoder && onText) {
            const text = decoder.write(kept);
            if (text) onText(text);
          }
          if (chunk.length > room) {
            truncated = true;
            stop();
          }
        },
      };
    };
    const out = collect(options.onStdout);
    const err = collect();
    child.stdout!.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr!.on("data", (chunk: Buffer) => err.push(chunk));
    if (child.stdin) {
      // A script that exits without reading its input must not crash the runtime.
      child.stdin.on("error", () => {});
      child.stdin.end(resolved.stdin);
    }

    const onAbort = (): void => {
      aborted = true;
      stop();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            stop();
          }, options.timeoutMs)
        : undefined;
    const cleanup = (): void => {
      signal?.removeEventListener("abort", onAbort);
      if (timeout) clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
    };

    child.on("error", (error) => {
      cleanup();
      reject(
        new Error(`alfred: cannot run ${resolved.command}: ${error.message}`, { cause: error }),
      );
    });
    // `close` waits for every holder of the pipes, so a lingering descendant
    // keeps the result pending until the group is gone.
    child.on("close", (exitCode, exitSignal) => {
      cleanup();
      resolvePromise({
        stdout: Buffer.concat(out.chunks).toString("utf8"),
        stderr: Buffer.concat(err.chunks).toString("utf8"),
        exitCode,
        signal: exitSignal,
        aborted,
        timedOut,
        truncated,
      });
    });
  });
}
