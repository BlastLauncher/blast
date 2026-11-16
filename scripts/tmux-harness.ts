// Isolated tmux servers for scripts that drive the tmux plugin for real
// (`example:tmux:e2e`, `site:record-tui`). Every server gets its own `-L`
// socket, so the caller's tmux is never touched. Key bindings are only
// processed for an attached client, so a pane on a second server runs
// `tmux attach` and keystrokes are sent to that pane.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const repo = resolve(import.meta.dir, "..");
export const pluginEntry = join(repo, "examples/tmux-plugin/blast.tmux");
export const tuiMain = join(repo, "packages/tui/src/main.tsx");

/** The tmux binary and its version; exits when tmux 3.2+ is missing. */
export function requireTmux(label: string): { bin: string; version: string } {
  const bin = Bun.which("tmux");
  if (!bin) {
    console.error(`${label}: tmux 3.2+ is required`);
    process.exit(1);
  }
  const version = execFileSync(bin, ["-V"], { encoding: "utf8" }).trim();
  const [major = 0, minor = 0] = (version.match(/(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
  if (major < 3 || (major === 3 && minor < 2)) {
    console.error(`${label}: tmux 3.2+ is required, found ${version}`);
    process.exit(1);
  }
  for (const path of [process.execPath, tuiMain, pluginEntry]) {
    // The paths are written into a tmux config between quotes.
    if (/["'$`\\]/.test(path)) throw new Error(`Unsupported character in path: ${path}`);
  }
  return { bin, version };
}

export type Server = { name: string; session: string; tmux: (args: string[]) => string };
export type Size = { width: number; height: number };

export type Harness = {
  work: string;
  /** The caller's environment without its tmux, or nested commands reach it. */
  baseEnv: Record<string, string>;
  /** A server whose config loads the plugin after `options`. */
  startServer(
    options: string[],
    settings?: {
      env?: Record<string, string>;
      size?: Size;
      session?: string;
      command?: string;
      cwd?: string;
    },
  ): Server;
  /**
   * A second server whose only pane is a client attached to `server`;
   * `wrap` may wrap the attach command (a pty recorder, for example).
   */
  attachClient(
    server: Server,
    settings?: { size?: Size; options?: string[]; wrap?: (attach: string) => string },
  ): Server;
  screen(host: Server): string;
  waitFor(what: string, check: () => boolean, host?: Server, timeout?: number): Promise<void>;
  /** Kills every server and removes the work directory. */
  dispose(): void;
};

export function createHarness(tmuxBin: string, prefix: string): Harness {
  const work = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const servers: string[] = [];
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== "TMUX" && name !== "TMUX_PANE"),
  ) as Record<string, string>;
  const nextName = () => `${prefix}-${process.pid}-${servers.length}`;
  const client = (name: string, session: string): Server => ({
    name,
    session,
    tmux: (args) =>
      execFileSync(tmuxBin, ["-L", name, ...args], { encoding: "utf8", env: baseEnv }).trim(),
  });

  const harness: Harness = {
    work,
    baseEnv,
    startServer(options, settings = {}) {
      const { env = baseEnv, size = { width: 120, height: 40 }, session = "blast" } = settings;
      const name = nextName();
      const conf = join(work, `${name}.conf`);
      writeFileSync(
        conf,
        [...options, "set -g display-time 0", `run-shell '${pluginEntry}'`, ""].join("\n"),
      );
      servers.push(name);
      execFileSync(
        tmuxBin,
        [
          "-L",
          name,
          "-f",
          conf,
          "new-session",
          "-d",
          "-s",
          session,
          "-x",
          String(size.width),
          "-y",
          String(size.height),
          ...(settings.command ? [settings.command] : []),
        ],
        { env, cwd: settings.cwd },
      );
      return client(name, session);
    },
    attachClient(server, settings = {}) {
      const {
        size = { width: 120, height: 40 },
        options = [],
        wrap = (attach) => attach,
      } = settings;
      const name = nextName();
      servers.push(name);
      const conf = join(work, `${name}.conf`);
      writeFileSync(conf, [...options, ""].join("\n"));
      const attach = `env -u TMUX '${tmuxBin}' -L '${server.name}' attach -t '${server.session}'`;
      execFileSync(
        tmuxBin,
        [
          "-L",
          name,
          "-f",
          conf,
          "new-session",
          "-d",
          "-s",
          "host",
          "-x",
          String(size.width),
          "-y",
          String(size.height),
          wrap(attach),
        ],
        { env: baseEnv },
      );
      return client(name, "host");
    },
    screen: (host) => host.tmux(["capture-pane", "-p", "-t", host.session]),
    async waitFor(what, check, host, timeout = 30_000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (check()) return;
        await Bun.sleep(100);
      }
      const shown = host ? `\n--- client screen ---\n${harness.screen(host)}` : "";
      throw new Error(`Timed out waiting for ${what}${shown}`);
    },
    dispose() {
      for (const name of servers.toReversed()) {
        const socket = spawnSync(tmuxBin, ["-L", name, "display-message", "-p", "#{socket_path}"], {
          encoding: "utf8",
          env: baseEnv,
        }).stdout.trim();
        spawnSync(tmuxBin, ["-L", name, "kill-server"], { stdio: "ignore", env: baseEnv });
        // Some tmux versions leave the socket file behind after kill-server.
        if (socket) rmSync(socket, { force: true });
      }
      rmSync(work, { recursive: true, force: true });
    },
  };
  return harness;
}
