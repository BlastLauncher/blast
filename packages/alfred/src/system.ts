// The macOS helpers behind Play Sound, Speak and Run Shortcut. Sound and
// speech are best-effort: a missing sound or another platform logs a warning
// and the workflow goes on, as a muted Mac would. Shortcuts fail with a named
// reason because their output may feed the next object.

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { GraphShortcutRequest, GraphSound } from "./graph.ts";

export type SystemDeps = {
  platform?: string;
  spawn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  exists?: (path: string) => boolean;
  warn?: (message: string) => void;
};

export const SYSTEM_SOUNDS_DIR = "/System/Library/Sounds";

/** Where a sound lives; throws for names that would escape their folder. */
export function resolveSoundPath(sound: GraphSound): string {
  const name = sound.soundName.trim();
  if (sound.systemSound) {
    if (!/^[\w ()-]+(\.aiff)?$/i.test(name)) {
      throw new Error(`invalid system sound ${JSON.stringify(name)}`);
    }
    return join(SYSTEM_SOUNDS_DIR, /\.aiff$/i.test(name) ? name : `${name}.aiff`);
  }
  if (!sound.workflowDir) throw new Error(`sound ${JSON.stringify(name)} needs a workflow folder`);
  const root = resolve(sound.workflowDir);
  const path = resolve(root, name);
  const rel = relative(root, path);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`sound ${JSON.stringify(name)} is outside the workflow`);
  }
  return path;
}

const macOnly = (what: string, platform: string): string =>
  `alfred: ${what} needs macOS; this host runs ${platform}`;

/** Starts a fire-and-forget process that must not keep the runtime alive. */
function detach(deps: SystemDeps, command: string, args: string[], stdin?: string): void {
  const warn = deps.warn ?? (() => {});
  const child = (deps.spawn ?? spawn)(command, args, {
    stdio: [stdin === undefined ? "ignore" : "pipe", "ignore", "ignore"],
  });
  child.on("error", (error) => warn(`alfred: cannot run ${command}: ${error.message}`));
  if (stdin !== undefined && child.stdin) {
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  }
  child.unref();
}

export function playSound(sound: GraphSound, deps: SystemDeps = {}): void {
  const platform = deps.platform ?? process.platform;
  const warn = deps.warn ?? (() => {});
  if (platform !== "darwin") return warn(macOnly("Play Sound", platform));
  let path: string;
  try {
    path = resolveSoundPath(sound);
  } catch (error) {
    return warn(`alfred: ${(error as Error).message}`);
  }
  if (!(deps.exists ?? existsSync)(path)) return warn(`alfred: no sound at ${path}`);
  detach(deps, "/usr/bin/afplay", [path]);
}

/** Speaks `text` with `say`, which reads standard input, so text never parses as flags. */
export function speak(text: string, deps: SystemDeps = {}): void {
  const platform = deps.platform ?? process.platform;
  if (platform !== "darwin") return (deps.warn ?? (() => {}))(macOnly("Speak", platform));
  detach(deps, "/usr/bin/say", [], text);
}

/**
 * Runs a Shortcut with `shortcuts run`, which only takes input and gives
 * output through files, so both go through a private temporary folder.
 */
export async function runShortcut(
  request: GraphShortcutRequest,
  deps: SystemDeps = {},
): Promise<string> {
  const platform = deps.platform ?? process.platform;
  if (platform !== "darwin") throw new Error(macOnly("Run Shortcut", platform));
  // `shortcuts` would read a leading dash as one of its own options.
  if (request.name.startsWith("-")) {
    throw new Error(`invalid shortcut name ${JSON.stringify(request.name)}`);
  }
  const dir = await mkdtemp(join(tmpdir(), "blast-shortcut-"));
  try {
    const args = ["run", request.name];
    if (request.input !== "") {
      const input = join(dir, "input.txt");
      await writeFile(input, request.input);
      args.push("--input-path", input);
    }
    const output = join(dir, "output.txt");
    if (request.outputMode !== 0) {
      args.push("--output-path", output, "--output-type", "public.plain-text");
    }
    const { code, stderr } = await new Promise<{ code: number | null; stderr: string }>(
      (resolvePromise, reject) => {
        const child = (deps.spawn ?? spawn)("/usr/bin/shortcuts", args, {
          stdio: ["ignore", "ignore", "pipe"],
        });
        let err = "";
        child.stderr?.on("data", (chunk: Buffer) => {
          err = (err + chunk.toString("utf8")).slice(-2000);
        });
        const onAbort = (): void => void child.kill("SIGTERM");
        request.signal?.addEventListener("abort", onAbort, { once: true });
        child.on("error", (error) => {
          request.signal?.removeEventListener("abort", onAbort);
          reject(new Error(`alfred: cannot run /usr/bin/shortcuts: ${error.message}`));
        });
        child.on("close", (exitCode) => {
          request.signal?.removeEventListener("abort", onAbort);
          resolvePromise({ code: exitCode, stderr: err });
        });
      },
    );
    if (request.signal?.aborted) {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }
    if (code !== 0) {
      const detail = stderr.trim() ? `: ${stderr.trim().slice(-500)}` : "";
      throw new Error(
        `shortcut ${JSON.stringify(request.name)} exited with ${code ?? "a signal"}${detail}`,
      );
    }
    if (request.outputMode === 0) return "";
    return await readFile(output, "utf8").catch(() => "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
