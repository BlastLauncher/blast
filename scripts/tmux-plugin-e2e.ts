// End-to-end check of `examples/tmux-plugin` against real, isolated tmux
// servers: the plugin's key opens the palette in a popup, "Split Horizontal"
// splits the pane that opened it, and the popup closes.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readlinkSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
  // Second open reuses the warm daemon: search is reset, and Esc detaches cleanly.
  const tWarm = performance.now();
  host.tmux(["send-keys", "-t", "host", "C-Space"]);
  await waitFor(
    "the warm palette to reopen cleanly",
    () => screen(host).includes("Split Vertical") && screen(host).includes("Search commands…"),
    host,
  );
  const warmMs = Math.round(performance.now() - tWarm);
  host.tmux(["send-keys", "-t", "host", "Down"]);
  await waitFor(
    "arrow navigation in the warm palette",
    () => screen(host).includes("› ▣ Split Vertical"),
    host,
  );
  const tEsc = performance.now();
  host.tmux(["send-keys", "-t", "host", "Escape"]);
  await waitFor(
    "the warm popup to detach on Esc",
    () => extraChildren(server).length === 0 && !screen(host).includes("Split Vertical"),
    host,
  );
  const escMs = Math.round(performance.now() - tEsc);
  // Daemon socket must not add any phantom session to the user's tmux server.
  if (server.tmux(["list-sessions"]).split("\n").length !== 1)
    throw new Error("Expected only the user's single tmux session");
  console.log(
    `ok: the palette split the pane, reopened warm in ${warmMs} ms, and detached on Esc in ${escMs} ms`,
  );
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

async function backgroundUpdaterSwitchesAtomicRelease() {
  const updater = resolve(import.meta.dirname, "../examples/tmux-plugin/scripts/update-tui.sh");
  const cacheDir = join(work, "tui-cache");
  const v1 = "3.0.0-canary.20261126010000.g1111111";
  const v2 = "3.0.0-canary.20261126020000.g2222222";
  const v3 = "3.0.0-canary.20261126030000.g3333333";
  const seedRelease = (releaseVersion: string) => {
    const pkgDir = join(cacheDir, "releases", releaseVersion, "node_modules/@blastlauncher/tui");
    mkdirSync(join(pkgDir, "dist"), { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "@blastlauncher/tui", version: releaseVersion }),
    );
    writeFileSync(join(pkgDir, "dist/main.js"), `// ${releaseVersion}\n`);
  };
  seedRelease(v2);

  let advertised = v2;
  const registry = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/@blastlauncher/tui/next") {
        return Response.json({ name: "@blastlauncher/tui", version: advertised });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    // Seed a legacy install at v1 and verify update-tui.sh atomically switches `current` to v2.
    const legacyPkgDir = join(cacheDir, "node_modules/@blastlauncher/tui");
    mkdirSync(join(legacyPkgDir, "dist"), { recursive: true });
    writeFileSync(
      join(legacyPkgDir, "package.json"),
      JSON.stringify({ name: "@blastlauncher/tui", version: v1 }),
    );
    writeFileSync(join(legacyPkgDir, "dist/main.js"), `// ${v1}\n`);

    const runUpdate = async () => {
      const child = Bun.spawn([updater, cacheDir, "bunx @blastlauncher/tui@next"], {
        env: { ...baseEnv, BLAST_TUI_REGISTRY: registry.url.origin },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [status, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      return { status, stderr };
    };

    const first = await runUpdate();
    if (first.status !== 0) throw new Error(`update-tui.sh failed: ${first.stderr}`);
    if (readlinkSync(join(cacheDir, "current")) !== `releases/${v2}`)
      throw new Error(
        `Expected current -> releases/${v2}, got ${readlinkSync(join(cacheDir, "current"))}`,
      );
    if (
      readFileSync(join(cacheDir, ".blast-spec"), "utf8").trim() !== "bunx @blastlauncher/tui@next"
    )
      throw new Error("Expected .blast-spec to be recorded");

    // Advance to v3: v2 stays as the immediately preceding release while older v1 is pruned.
    seedRelease(v1);
    seedRelease(v3);
    advertised = v3;
    const second = await runUpdate();
    if (second.status !== 0) throw new Error(`second update-tui.sh failed: ${second.stderr}`);
    if (readlinkSync(join(cacheDir, "current")) !== `releases/${v3}`)
      throw new Error(`Expected current -> releases/${v3}`);
    if (!existsSync(join(cacheDir, "releases", v2)))
      throw new Error("Expected previous release to remain on disk for active popups");
    if (existsSync(join(cacheDir, "releases", v1)))
      throw new Error("Expected older release v1 to be pruned");
    console.log("ok: update-tui.sh atomically switches @next releases and prunes old versions");
  } finally {
    registry.stop(true);
  }
}

try {
  console.log(`example:tmux:e2e: ${version}`);
  keyOptions();
  await missingBunShowsAMessage();
  await backgroundUpdaterSwitchesAtomicRelease();
  await paletteSplitsThePane();
} finally {
  dispose();
}
