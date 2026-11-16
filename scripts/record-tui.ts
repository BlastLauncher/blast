// Records `blast-tui` running as the tmux palette for the landing page:
// `bun run site:record-tui` writes examples/browser-demo/recordings/tui.cast.
// The palette runs in an isolated tmux server through the real plugin; a
// client attached from a second server runs inside util-linux `script`, which
// captures exactly what a 100×28 xterm-256color terminal would receive.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scriptToCast } from "../examples/browser-demo/tui-cast.ts";
import { createTheme } from "../packages/tui/src/theme.ts";
import { createHarness, repo, requireTmux, tuiMain, type Server } from "./tmux-harness.ts";

const size = { width: 100, height: 28 };
const output = join(repo, "examples/browser-demo/recordings/tui.cast");
const { colors } = createTheme(false, "dark");

const { bin: tmuxBin, version } = requireTmux("site:record-tui");
if (!Bun.which("script")) {
  console.error("site:record-tui: util-linux `script` is required");
  process.exit(1);
}
const harness = createHarness(tmuxBin, "blast-rec");
const { work, baseEnv, startServer, attachClient, screen, waitFor } = harness;

// A neutral shell: a throwaway HOME and an rc file that runs after the
// system bashrc and sets a prompt naming a pretend project, so the recording
// shows no real path, host or user. Ubuntu's bashrc prints a sudo hint unless
// this marker exists.
const home = join(work, "home");
mkdirSync(home);
writeFileSync(join(home, ".sudo_as_admin_successful"), "");
const rc = join(work, "demo.bashrc");
writeFileSync(
  rc,
  [
    "unset HISTFILE PROMPT_COMMAND",
    String.raw`PS1='\[\e[38;2;137;180;250m\]~/engine\[\e[0m\] \$ '`,
    'cd "$HOME"',
    "",
  ].join("\n"),
);

// Deterministic "human" typing: a fixed rhythm instead of random jitter.
const rhythm = [120, 150, 105, 170, 130, 145, 115, 160];
let beat = 0;
async function type(host: Server, text: string) {
  for (const character of text) {
    host.tmux(["send-keys", "-t", host.session, "-l", character]);
    await Bun.sleep(rhythm[beat++ % rhythm.length]!);
  }
}
async function press(host: Server, key: string, pause = 450) {
  host.tmux(["send-keys", "-t", host.session, key]);
  await Bun.sleep(pause);
}
/** The palette row the pointer marks, from the client's screen. */
function selectedRow(host: Server): string {
  return (
    screen(host)
      .split("\n")
      .find((line) => line.includes("›"))
      ?.trim() ?? ""
  );
}

const timing = join(work, "tui.timing");
const log = join(work, "tui.log");
try {
  console.log(`site:record-tui: ${version}`);
  const server = startServer(
    [
      "set -g default-terminal tmux-256color",
      "set -as terminal-features ',xterm-256color:RGB'",
      "set -g escape-time 0",
      `set -g default-command 'bash --noprofile --rcfile ${rc}'`,
      `set -g status-style 'bg=${colors.panel},fg=${colors.text}'`,
      `set -g status-left '#[fg=${colors.accent},bold] #S #[default]'`,
      `set -g status-right '#[fg=${colors.textMuted}]blast-tui · tmux palette '`,
      "set -g window-status-format ' #I:#W '",
      "set -g window-status-current-format ' #I:#W '",
      `set -g window-status-current-style 'bg=${colors.accent},fg=${colors.background},bold'`,
      `set -g pane-border-style 'fg=${colors.border}'`,
      `set -g pane-active-border-style 'fg=${colors.accent}'`,
      `set -g @blast-command '"${process.execPath}" "${tuiMain}"'`,
      "set -g @blast-theme dark",
      "set -g @blast-popup-width 84",
      "set -g @blast-popup-height 22",
    ],
    {
      env: {
        PATH: baseEnv.PATH ?? "/usr/bin:/bin",
        HOME: home,
        LANG: "C.UTF-8",
        COLORTERM: "truecolor",
        SHELL: "/bin/bash",
        TMUX_TMPDIR: baseEnv.TMUX_TMPDIR ?? "/tmp",
      },
      size,
      session: "demo",
      cwd: home,
    },
  );
  const host = attachClient(server, {
    size,
    options: [
      "set -g status off",
      "set -g default-terminal xterm-256color",
      "set -g escape-time 0",
    ],
    wrap: (attach) => {
      writeFileSync(join(work, "attach.sh"), `exec ${attach}\n`);
      return `script -f -q -T '${timing}' -O '${log}' -c 'sh ${join(work, "attach.sh")}'`;
    },
  });
  // `script` times chunks from its first write; starting the clock there keeps
  // the cut below at or before the matching point of the recording.
  await waitFor("the recorder", () => existsSync(timing) && statSync(timing).size > 0);
  const started = performance.now();
  await waitFor("the client to attach", () => server.tmux(["list-clients"]).length > 0);
  await waitFor("the prompt", () => screen(host).includes("~/engine $"), host);
  await Bun.sleep(1200);

  // Scene 1: the palette splits the pane it was opened from.
  await press(host, "C-Space", 0);
  await waitFor("the palette", () => screen(host).includes("Split Vertical"), host, 90_000);
  await Bun.sleep(700);
  await type(host, "spl");
  await Bun.sleep(500);
  await press(host, "Down", 650);
  if (!selectedRow(host).includes("Split Vertical"))
    throw new Error(`↓ did not select Split Vertical:\n${screen(host)}`);
  await press(host, "Enter", 0);
  const panes = () => server.tmux(["list-panes", "-t", "demo:0"]).split("\n").length;
  await waitFor("the split", () => panes() === 2, host);
  await waitFor("the popup to close", () => !screen(host).includes("Split Vertical"), host);
  await Bun.sleep(1400);

  // Scene 2: a command's actions open its form, which renames the window.
  await press(host, "C-Space", 0);
  await waitFor("the palette", () => screen(host).includes("Split Vertical"), host, 90_000);
  await Bun.sleep(600);
  await type(host, "rename win");
  await waitFor("Rename Window", () => selectedRow(host).includes("Rename Window"), host);
  await Bun.sleep(700);
  await press(host, "C-a", 0);
  await waitFor("the actions", () => screen(host).includes("Open Command"), host);
  await Bun.sleep(900);
  await press(host, "Enter", 0);
  await waitFor("the form", () => screen(host).includes("╭─Rename Window"), host);
  await Bun.sleep(800);
  // The field starts with the current name.
  for (const _ of "bash") await press(host, "BSpace", rhythm[beat++ % rhythm.length]);
  await Bun.sleep(300);
  await type(host, "engine");
  await Bun.sleep(600);
  await press(host, "Enter", 0);
  const windowName = () => server.tmux(["display-message", "-p", "-t", "demo:0", "#W"]);
  await waitFor("the rename", () => windowName() === "engine", host);
  await waitFor("the status line", () => screen(host).includes("0:engine"), host);
  await Bun.sleep(2200);
  // The client prints "[server exited]" when the server goes; the cast ends before it.
  const cut = (performance.now() - started) / 1000;
  server.tmux(["kill-server"]);
  await waitFor(
    "the recorder to finish",
    () =>
      spawnSync(tmuxBin, ["-L", host.name, "has-session"], { stdio: "ignore", env: baseEnv })
        .status !== 0,
  );
  if (!existsSync(timing) || !statSync(log).size) throw new Error("script recorded nothing");
  const cast = scriptToCast(
    readFileSync(timing, "utf8"),
    readFileSync(log),
    { version: 2, width: size.width, height: size.height, env: { TERM: "xterm-256color" } },
    1.5,
    cut,
  );
  mkdirSync(join(output, ".."), { recursive: true });
  writeFileSync(output, cast);
  console.log(
    `site:record-tui: wrote ${output.slice(repo.length + 1)} (${(Buffer.byteLength(cast) / 1024).toFixed(0)} KB)`,
  );
} finally {
  harness.dispose();
}
