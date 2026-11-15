import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { openExtension } from "@blastlauncher/host";

const extensionDir = resolve(import.meta.dir, "../extensions/tmux");
const server = `blast-test-${process.pid}-${Date.now()}`;
const tmux = (args: string[]) =>
  execFileSync("tmux", ["-L", server, "-f", "/dev/null", ...args], { encoding: "utf8" });
const available = spawnSync("tmux", ["-V"]).status === 0;

afterEach(() => {
  if (available)
    spawnSync("tmux", ["-L", server, "-f", "/dev/null", "kill-server"], { stdio: "ignore" });
});

describe("tmux extension", () => {
  test.skipIf(!available)(
    "runs split, zoom and new window against an isolated server",
    async () => {
      tmux(["new-session", "-d", "-s", "blast", "-x", "80", "-y", "24"]);
      const previous = { TMUX: process.env.TMUX, BLAST_TMUX_TARGET: process.env.BLAST_TMUX_TARGET };
      process.env.TMUX = `/tmp/tmux-${process.getuid?.() ?? 0}/${server},0,0`;
      process.env.BLAST_TMUX_TARGET = "blast:0.0";
      const extension = openExtension({ extensionDir });
      try {
        for (const command of ["split-horizontal", "zoom-pane", "new-window"]) {
          const launched = await extension.launch(command, { installDependencies: false });
          await launched.session.exited;
        }
        expect(
          Number(
            tmux(["list-panes", "-t", "blast:0", "-F", "#{pane_id}"]).trim().split("\n").length,
          ),
        ).toBe(2);
        expect(
          tmux(["list-windows", "-t", "blast", "-F", "#{window_index}"]).trim().split("\n").length,
        ).toBe(2);
      } finally {
        await extension.close();
        if (previous.TMUX === undefined) delete process.env.TMUX;
        else process.env.TMUX = previous.TMUX;
        if (previous.BLAST_TMUX_TARGET === undefined) delete process.env.BLAST_TMUX_TARGET;
        else process.env.BLAST_TMUX_TARGET = previous.BLAST_TMUX_TARGET;
      }
    },
  );

  test.skipIf(!available)("shows Not inside tmux outside a tmux environment", async () => {
    const previous = process.env.TMUX;
    delete process.env.TMUX;
    const extension = openExtension({ extensionDir });
    try {
      const launched = await extension.launch("next-pane", { installDependencies: false });
      const exit = await launched.session.exited;
      expect(exit.code).toBe(0);
      expect(tmux(["list-windows", "-t", "blast", "-F", "#{window_index}"]).trim()).toBe("");
    } finally {
      await extension.close();
      if (previous === undefined) delete process.env.TMUX;
      else process.env.TMUX = previous;
    }
  });
});
