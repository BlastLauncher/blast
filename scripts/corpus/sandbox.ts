// macOS containment for the corpus sweep. The profile is deliberately narrow:
// the helper can read the repository and its toolchain, write only to its
// per-command scratch directory (plus harmless device nodes), and receives no
// network entitlement.
import { realpathSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

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

function executablePath(command: string, path = process.env.PATH): string {
  if (isAbsolute(command)) return existing(command);
  for (const directory of (path ?? "").split(":").filter(Boolean)) {
    const candidate = join(directory, command);
    try {
      return realpathSync(candidate);
    } catch {
      // Keep looking through PATH. The parent is outside the sandbox, so this
      // lookup cannot be influenced by extension code.
    }
  }
  const which = spawnSync("which", [command], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim() !== "") return existing(which.stdout.trim());
  return existing(command);
}

function installationRoot(binary: string): string {
  return dirname(dirname(binary));
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

function homeDeny(home: string, allowed: string[]): string {
  const exceptions = [...new Set(allowed.map(existing))]
    .filter((path) => path === home || path.startsWith(`${home}/`))
    .map((path) => `(require-not (subpath ${quote(path)}))`)
    .join(" ");
  // Seatbelt deny rules have precedence over broad grants. A single
  // require-all predicate makes the home deny the default while allowing only
  // the explicit repository/toolchain/scratch subpaths listed above.
  return `(deny file-read-data (require-all (subpath ${quote(home)})${exceptions ? ` ${exceptions}` : ""}))`;
}

/**
 * A deny-by-default profile. `readPaths` includes the repository and the
 * command script; Bun/Node binaries and their installation roots are added by
 * `runSandboxed`. System locations outside home remain readable, but home is
 * denied except for those exact allowlisted subpaths.
 *
 * The mach service is deliberately explicit. Bun, Node and esbuild use the
 * system logger for runtime diagnostics; pasteboard, LaunchServices and Apple
 * Events are not reachable through this grant.
 */
export function sandboxProfile(
  readPaths: string[],
  scratch: string,
  extraDenied: string[] = [],
  home = homedir(),
  executables: string[] = [],
): string {
  const realHome = existing(home);
  const realScratch = existing(scratch);
  const binaries = executables.map(existing);
  const allowedReads = [
    ...readPaths,
    realScratch,
    ...binaries,
    ...binaries.map(installationRoot),
  ].map(existing);
  const explicitDenied = extraDenied.map(existing);
  return [
    "(version 1)",
    "(deny default)",
    "(allow process-fork)",
    ...binaries.map((binary) => `(allow process-exec (literal ${quote(binary)}))`),
    "(allow sysctl-read)",
    '(allow file-read* (subpath "/"))',
    homeDeny(realHome, allowedReads),
    ...explicitDenied.map((path) => `(deny file-read-data (subpath ${quote(path)}))`),
    `(allow file-read* (subpath ${quote(realScratch)}))`,
    ...allowedReads
      .filter((path) => path !== realScratch)
      .map((path) => `(allow file-read* (subpath ${quote(path)}))`),
    `(allow file-write* (subpath ${quote(realScratch)}))`,
    // Bun and Node use null/zero for ordinary stream and buffer plumbing.
    '(allow file-write* (literal "/dev/null") (literal "/dev/zero"))',
    "(allow ipc-posix-shm)",
    // Bun/Node diagnostics and esbuild's native service use these two lookups;
    // keychain, pasteboard, LaunchServices and Apple Events are intentionally
    // absent because extension code has no host credential or app authority.
    '(allow mach-lookup (global-name "com.apple.system.logger"))',
    '(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo"))',
    "(deny network*)",
  ].join(" ");
}

export function runSandboxed(options: {
  script: string;
  args: string[];
  scratch: string;
  root?: string;
  unsandboxed?: boolean;
  bun?: string;
  node?: string;
  home?: string;
  deniedPaths?: string[];
}): Promise<SandboxedResult> {
  const root = options.root ?? process.cwd();
  const command = options.bun ?? process.env.BUN ?? "bun";
  const node = options.node ?? process.env.NODE ?? "node";
  const resolvedCommand = executablePath(command);
  const resolvedNode = executablePath(node);
  const args = [options.script, ...options.args];
  const commandArgs = options.unsandboxed
    ? args
    : [
        "-p",
        sandboxProfile([root, options.script], options.scratch, options.deniedPaths, options.home, [
          resolvedCommand,
          resolvedNode,
        ]),
        resolvedCommand,
        ...args,
      ];
  const executable = options.unsandboxed ? resolvedCommand : SANDBOX_EXEC;
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

export function deniedHomePath(name: string, home = homedir()): string {
  return `${home}/${name}`;
}

export function assertAbsolute(path: string, label: string): void {
  if (!isAbsolute(path)) throw new Error(`${label} must be absolute`);
}
