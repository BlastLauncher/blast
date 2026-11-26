import { execFile } from "node:child_process";
import { access, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Toast, closeMainWindow, showHUD, showToast } from "@raycast/api";

const run = promisify(execFile);

export type TpmScript = "install_plugins" | "update_plugins" | "clean_plugins";

export type TpmScriptResult = {
  ok: boolean;
  output: string;
  summary: string;
};

export type InstalledTpmPlugin = {
  name: string;
  directory: string;
  branch?: string;
  commit?: string;
  lockPath?: string;
};

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

// TPM scripts wrap status lines in ANSI color escapes (`\x1b[...m`).
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g");

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

async function hasTpm(pluginsDir: string): Promise<boolean> {
  const tpmDir = join(pluginsDir, "tpm");
  return (await exists(join(tpmDir, "bin", "install_plugins"))) || exists(join(tpmDir, "tpm"));
}

async function tmuxTpmEnv(): Promise<string | undefined> {
  if (!process.env.TMUX) return undefined;
  try {
    const { stdout } = await run("tmux", ["show-environment", "-g", "TMUX_PLUGIN_MANAGER_PATH"]);
    const line = stdout.trim();
    const prefix = "TMUX_PLUGIN_MANAGER_PATH=";
    if (line.startsWith(prefix)) return line.slice(prefix.length);
  } catch {
    // Variable may not be set in the tmux global environment.
  }
  return undefined;
}

export async function resolvePluginsDir(): Promise<string | undefined> {
  const home = process.env.HOME ?? homedir();
  const fromTmux = await tmuxTpmEnv();
  const candidates = [
    process.env.BLAST_TPM_PATH,
    fromTmux,
    process.env.TMUX_PLUGIN_MANAGER_PATH,
    join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "tmux", "plugins"),
    join(home, ".tmux", "plugins"),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const dir = resolve(candidate);
    if (await hasTpm(dir)) return dir;
  }
  return undefined;
}

function summarizeOutput(output: string, fallback: string): string {
  const lines = stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const failure = lines.find((line) => /fail|error:/i.test(line));
  return failure ?? lines.at(-1) ?? fallback;
}

export async function runTpmScript(
  script: TpmScript,
  args: string[] = [],
  pluginsDir?: string,
): Promise<TpmScriptResult> {
  const resolved = pluginsDir ?? (await resolvePluginsDir());
  if (!resolved) {
    return {
      ok: false,
      output: "",
      summary: "TPM is not installed",
    };
  }
  const binary = join(resolved, "tpm", "bin", script);
  if (!(await exists(binary))) {
    return {
      ok: false,
      output: "",
      summary: `Missing TPM script: ${binary}`,
    };
  }
  const env = {
    ...process.env,
    // TPM expects a trailing slash on TMUX_PLUGIN_MANAGER_PATH.
    TMUX_PLUGIN_MANAGER_PATH: resolved.endsWith("/") ? resolved : `${resolved}/`,
  };
  try {
    const { stdout, stderr } = await run(binary, args, { env, timeout: 120_000 });
    const output = stripAnsi(`${stdout}\n${stderr}`).trim();
    const hasFailureLine = /"[^"]+"\s+(?:update|install|clean)\s+fail/i.test(output);
    return {
      ok: !hasFailureLine,
      output,
      summary: summarizeOutput(output, `Completed ${script}`),
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const combined = stripAnsi(`${err.stdout ?? ""}\n${err.stderr ?? ""}`).trim();
    const fallback = err.message?.split("\n", 1)[0] ?? `${script} failed`;
    return {
      ok: false,
      output: combined,
      summary: summarizeOutput(combined, fallback),
    };
  }
}

export async function runTpmNoView(options: {
  script: TpmScript;
  args?: string[];
  loadingTitle: string;
  successTitle: string;
}): Promise<void> {
  const toast = await showToast({ style: Toast.Style.Animated, title: options.loadingTitle });
  const result = await runTpmScript(options.script, options.args);
  if (result.ok) {
    toast.style = Toast.Style.Success;
    toast.title = options.successTitle;
    toast.message = result.summary;
    await showHUD(`${options.successTitle}: ${result.summary}`);
  } else {
    toast.style = Toast.Style.Failure;
    toast.title = "TPM action failed";
    toast.message = result.summary;
  }
  await closeMainWindow();
}

async function gitOutput(dir: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", ["-C", dir, ...args], { timeout: 5_000 });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function inspectPlugin(name: string, directory: string): Promise<InstalledTpmPlugin> {
  const [branch, commit, rawLock] = await Promise.all([
    gitOutput(directory, ["rev-parse", "--abbrev-ref", "HEAD"]),
    gitOutput(directory, ["rev-parse", "--short", "HEAD"]),
    gitOutput(directory, ["rev-parse", "--git-path", "index.lock"]),
  ]);
  let lockPath: string | undefined;
  if (rawLock) {
    const candidate = isAbsolute(rawLock) ? rawLock : resolve(directory, rawLock);
    if (await exists(candidate)) lockPath = candidate;
  }
  return {
    name,
    directory,
    ...(branch ? { branch } : {}),
    ...(commit ? { commit } : {}),
    ...(lockPath ? { lockPath } : {}),
  };
}

export async function listInstalledPlugins(pluginsDir: string): Promise<InstalledTpmPlugin[]> {
  const entries = await readdir(pluginsDir, { withFileTypes: true });
  const directories = entries
    .filter(
      (entry) => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink()),
    )
    .map((entry) => entry.name)
    .toSorted();
  return Promise.all(directories.map((name) => inspectPlugin(name, join(pluginsDir, name))));
}

export async function removeStaleGitLock(lockPath: string): Promise<void> {
  await rm(lockPath, { force: true });
}
