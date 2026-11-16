// End-to-end check of `examples/tmux-plugin` against real, isolated tmux
// servers: the plugin's key opens the palette in a popup, "Split Horizontal"
// splits the pane that opened it, and the popup closes.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { createHarness, requireTmux, tuiMain, type Server } from "./tmux-harness.ts";

const { bin: tmuxBin, version } = requireTmux("example:tmux:e2e");
const { work, baseEnv, startServer, attachClient, screen, waitFor, dispose } = createHarness(
  tmuxBin,
  "blast-e2e",
);

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
  const path = [dirname(tmuxBin), "/usr/bin", "/bin"].filter(
    (dir, index, all) => all.indexOf(dir) === index,
  );
  if (path.includes(bunDir)) {
    console.log(`skip: Bun is installed next to system tools (${bunDir}), cannot hide it`);
    return;
  }
  const home = join(work, "home");
  const server = startServer([], { env: { ...baseEnv, PATH: path.join(":"), HOME: home } });
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
  dispose();
}
