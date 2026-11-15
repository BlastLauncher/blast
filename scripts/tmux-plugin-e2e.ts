// End-to-end check of `examples/tmux-plugin` against real, isolated tmux
// servers: the plugin's key opens the palette in a popup, "Split Horizontal"
// splits the pane that opened it, and the popup closes. Key bindings are only
// processed for an attached client, so a pane on a second server (`-L`) runs
// `tmux attach` and every keystroke is sent to that pane.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "..");
const pluginEntry = join(repo, "examples/tmux-plugin/blast.tmux");
const tuiMain = join(repo, "packages/tui/src/main.tsx");
const tmuxBin = Bun.which("tmux");
if (!tmuxBin) {
  console.error("example:tmux:e2e: tmux 3.2+ is required");
  process.exit(1);
}
const version = execFileSync(tmuxBin, ["-V"], { encoding: "utf8" }).trim();
const [major = 0, minor = 0] = (version.match(/(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
if (major < 3 || (major === 3 && minor < 2)) {
  console.error(`example:tmux:e2e: tmux 3.2+ is required, found ${version}`);
  process.exit(1);
}
for (const path of [process.execPath, tuiMain, pluginEntry]) {
  // The paths are written into a tmux config between quotes.
  if (/["'$`\\]/.test(path)) throw new Error(`Unsupported character in path: ${path}`);
}

const work = mkdtempSync(join(tmpdir(), "blast-tmux-e2e-"));
const servers: string[] = [];
// Servers must not inherit the caller's tmux, or nested commands reach it.
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== "TMUX" && name !== "TMUX_PANE"),
) as Record<string, string>;

type Server = { name: string; tmux: (args: string[]) => string };

function startServer(options: string[], env: Record<string, string> = baseEnv): Server {
  const name = `blast-e2e-${process.pid}-${servers.length}`;
  const conf = join(work, `${name}.conf`);
  writeFileSync(
    conf,
    [...options, "set -g display-time 0", `run-shell '${pluginEntry}'`, ""].join("\n"),
  );
  servers.push(name);
  execFileSync(
    tmuxBin!,
    ["-L", name, "-f", conf, "new-session", "-d", "-s", "blast", "-x", "120", "-y", "40"],
    {
      env,
    },
  );
  return {
    name,
    tmux: (args) =>
      execFileSync(tmuxBin!, ["-L", name, ...args], { encoding: "utf8", env: baseEnv }).trim(),
  };
}

/** A second server whose only pane is a client attached to `server`. */
function attachClient(server: Server): Server {
  const name = `blast-e2e-${process.pid}-${servers.length}`;
  servers.push(name);
  const attach = `env -u TMUX '${tmuxBin}' -L '${server.name}' attach -t blast`;
  execFileSync(
    tmuxBin!,
    [
      "-L",
      name,
      "-f",
      "/dev/null",
      "new-session",
      "-d",
      "-s",
      "host",
      "-x",
      "120",
      "-y",
      "40",
      attach,
    ],
    {
      env: baseEnv,
    },
  );
  const host: Server = {
    name,
    tmux: (args) =>
      execFileSync(tmuxBin!, ["-L", name, ...args], { encoding: "utf8", env: baseEnv }).trim(),
  };
  return host;
}

const screen = (host: Server) => host.tmux(["capture-pane", "-p", "-t", "host"]);

async function waitFor(what: string, check: () => boolean, host?: Server, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await Bun.sleep(100);
  }
  const shown = host ? `\n--- client screen ---\n${screen(host)}` : "";
  throw new Error(`Timed out waiting for ${what}${shown}`);
}

const panes = (server: Server) =>
  server.tmux(["list-panes", "-t", "blast:0", "-F", "#{pane_pid}"]).split("\n");

/** Processes the server runs besides its panes: the popup and its job. */
function extraChildren(server: Server): string[] {
  const pid = server.tmux(["display-message", "-p", "#{pid}"]);
  const listed = spawnSync("pgrep", ["-P", pid], { encoding: "utf8" }).stdout.trim();
  const own = new Set(server.tmux(["list-panes", "-a", "-F", "#{pane_pid}"]).split("\n"));
  return listed ? listed.split("\n").filter((child) => !own.has(child)) : [];
}

async function paletteSplitsThePane() {
  const server = startServer([`set -g @blast-command '"${process.execPath}" "${tuiMain}"'`]);
  if (!server.tmux(["list-keys", "-T", "root", "C-Space"]).includes("palette.sh"))
    throw new Error("C-Space is not bound in the root table");
  const host = attachClient(server);
  await waitFor("the client to attach", () => server.tmux(["list-clients"]).length > 0);
  if (panes(server).length !== 1) throw new Error("Expected one pane before the palette");

  host.tmux(["send-keys", "-t", "host", "C-Space"]);
  await waitFor("the palette", () => screen(host).includes("Split Vertical"), host, 90_000);
  host.tmux(["send-keys", "-t", "host", "-l", "split h"]);
  await waitFor("the filtered list", () => !screen(host).includes("Split Vertical"), host);
  host.tmux(["send-keys", "-t", "host", "Enter"]);
  await waitFor("the split", () => panes(server).length === 2, host);
  await waitFor(
    "the popup to close",
    () => extraChildren(server).length === 0 && !screen(host).includes("Split Horizontal"),
    host,
  );
  console.log("ok: the palette split the pane that opened it and closed");
}

function keyOptions() {
  const off = startServer(["set -g @blast-key off"]);
  if (off.tmux(["list-keys"]).includes("palette.sh"))
    throw new Error("@blast-key off still bound a key");
  const prefix = startServer(["set -g @blast-key M-p", "set -g @blast-key-table prefix"]);
  if (!prefix.tmux(["list-keys", "-T", "prefix", "M-p"]).includes("palette.sh"))
    throw new Error("@blast-key-table prefix did not bind M-p in the prefix table");
  if (prefix.tmux(["list-keys", "-T", "root"]).includes("palette.sh"))
    throw new Error("@blast-key-table prefix also bound the root table");
  console.log("ok: @blast-key off binds nothing; @blast-key-table prefix binds there");
}

async function missingBunShowsAMessage() {
  const bunDir = dirname(process.execPath);
  const path = [dirname(tmuxBin!), "/usr/bin", "/bin"].filter(
    (dir, index, all) => all.indexOf(dir) === index,
  );
  if (path.includes(bunDir)) {
    console.log(`skip: Bun is installed next to system tools (${bunDir}), cannot hide it`);
    return;
  }
  const home = join(work, "home");
  const server = startServer([], { ...baseEnv, PATH: path.join(":"), HOME: home });
  const host = attachClient(server);
  await waitFor("the client to attach", () => server.tmux(["list-clients"]).length > 0);
  host.tmux(["send-keys", "-t", "host", "C-Space"]);
  await waitFor("the Bun message", () => screen(host).includes("Bun is required"), host);
  if (extraChildren(server).length) throw new Error("A popup opened without Bun");
  console.log("ok: without Bun the key shows a tmux message instead of a popup");
}

try {
  console.log(`example:tmux:e2e: ${version}`);
  keyOptions();
  await missingBunShowsAMessage();
  await paletteSplitsThePane();
} finally {
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
}
