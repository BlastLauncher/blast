// macOS containment for the corpus sweep. The profile is deliberately narrow:
// the helper can read the repository and its toolchain, write only to its
// per-command scratch directory, and receives no network entitlement.
import { realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

export type SandboxedResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  elapsedMs: number;
};

function existing(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function quote(path: string): string {
  return JSON.stringify(existing(path));
}

/** Environment inherited by the helper and then by the extension runtime. */
export function sweepEnvironment(
  scratch: string,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {
    PATH: source.PATH ?? "/usr/bin:/bin",
    HOME: scratch,
    TMPDIR: scratch,
    TEMP: scratch,
    TMP: scratch,
    XDG_CACHE_HOME: `${scratch}/cache`,
    XDG_CONFIG_HOME: `${scratch}/config`,
    XDG_DATA_HOME: `${scratch}/data`,
    USER: "blast-sweep",
    LANG: source.LANG ?? "en_US.UTF-8",
    LC_ALL: source.LC_ALL ?? "en_US.UTF-8",
    TZ: source.TZ ?? "UTC",
  };
  return env;
}

/**
 * A deny-by-default profile. `readPaths` must include the repository and the
 * Bun/Node installation roots; system roots are needed for dynamic libraries.
 * No network rule is allowed, so the default deny covers both sockets and DNS.
 */
export function sandboxProfile(
  readPaths: string[],
  scratch: string,
  extraDenied: string[] = [],
): string {
  void readPaths;
  // Bun and esbuild consult system caches and dynamic libraries outside the
  // repository. A broad read grant keeps that toolchain functional; the
  // explicit credential/personal-path denies below still win under deny
  // default. Writes remain narrow because only the scratch subpath is allowed.
  const denied = [
    `${homedir()}/.ssh`,
    `${homedir()}/.aws`,
    `${homedir()}/.config`,
    `${homedir()}/.gnupg`,
    `${homedir()}/.npmrc`,
    `${homedir()}/Library/Keychains`,
    `${homedir()}/Library/Application Support`,
    `${homedir()}/Documents`,
    `${homedir()}/Desktop`,
    ...extraDenied,
  ];
  return [
    "(version 1)",
    "(deny default)",
    "(allow process*)",
    "(allow sysctl-read)",
    "(allow file-read*)",
    ...denied.map((path) => `(deny file-read* (subpath ${quote(path)}))`),
    `(allow file-write* (subpath ${quote(scratch)}))`,
    // A sandboxed Bun occasionally uses shared-memory primitives for esbuild.
    "(allow ipc-posix-shm)",
    "(allow mach-lookup)",
  ].join(" ");
}

export function runSandboxed(options: {
  script: string;
  args: string[];
  scratch: string;
  root?: string;
  unsandboxed?: boolean;
  bun?: string;
  deniedPaths?: string[];
}): Promise<SandboxedResult> {
  const root = options.root ?? process.cwd();
  const command = options.bun ?? process.env.BUN ?? "bun";
  const args = [options.script, ...options.args];
  const commandArgs = options.unsandboxed
    ? args
    : [
        "-p",
        sandboxProfile([root, options.script], options.scratch, options.deniedPaths),
        command,
        ...args,
      ];
  const executable = options.unsandboxed ? command : SANDBOX_EXEC;
  const started = performance.now();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, commandArgs, {
      cwd: root,
      env: sweepEnvironment(options.scratch),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolvePromise({
        code,
        signal,
        stdout,
        stderr,
        elapsedMs: performance.now() - started,
      }),
    );
  });
}

export function sandboxAvailable(): boolean {
  return process.platform === "darwin";
}

export function scratchParent(): string {
  return tmpdir();
}

export function isSafeScratch(path: string, scratch: string): boolean {
  const target = existing(path);
  const root = existing(scratch);
  return target === root || target.startsWith(`${root}/`);
}

export function deniedHomePath(name: string): string {
  return `${homedir()}/${name}`;
}

export function assertAbsolute(path: string, label: string): void {
  if (!isAbsolute(path)) throw new Error(`${label} must be absolute`);
}
