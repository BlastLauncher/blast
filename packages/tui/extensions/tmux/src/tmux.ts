import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { Alert, Toast, closeMainWindow, confirmAlert, showHUD, showToast } from "@raycast/api";

const run = promisify(execFile);
const target = () => process.env.BLAST_TMUX_TARGET || "{last}";

export async function tmux(args: string[]): Promise<void> {
  if (!process.env.TMUX) {
    await showToast({ style: Toast.Style.Failure, title: "Not inside tmux" });
    await closeMainWindow();
    return;
  }
  try {
    await run("tmux", ["-u", ...args]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.split("\n", 1)[0] : "tmux command failed";
    await showToast({ style: Toast.Style.Failure, title: "Tmux command failed", message });
  } finally {
    await closeMainWindow();
  }
}

export async function targeted(command: string, extra: string[] = []): Promise<void> {
  await tmux([command, "-t", target(), ...extra]);
}

/**
 * Selects the pane `step` positions after the target pane in its window,
 * wrapping around. tmux's own `-t +1` counts from tmux's current pane, which
 * inside the palette popup is not the pane that opened it.
 */
export async function selectRelativePane(step: number): Promise<void> {
  if (!process.env.TMUX) return tmux([]);
  let next: string | undefined;
  try {
    const [current, listed] = await Promise.all([
      run("tmux", ["display-message", "-p", "-t", target(), "#{pane_id}"]),
      run("tmux", ["list-panes", "-t", windowTarget(), "-F", "#{pane_id}"]),
    ]);
    const panes = listed.stdout.trim().split("\n");
    const index = panes.indexOf(current.stdout.trim());
    next = panes[(((index + step) % panes.length) + panes.length) % panes.length];
  } catch {
    next = undefined;
  }
  await tmux(["select-pane", "-t", next ?? target()]);
}

export async function targetedWindow(command: string, extra: string[] = []): Promise<void> {
  await tmux([command, "-t", windowTarget(), ...extra]);
}

export async function targetedSession(command: string, extra: string[] = []): Promise<void> {
  await tmux([command, "-t", sessionTarget(), ...extra]);
}

export async function newWindow(extra: string[] = []): Promise<void> {
  await tmux(["new-window", "-t", sessionTarget(), ...extra]);
}

function windowTarget(): string {
  return target().replace(/\.[^.]+$/, "");
}

function sessionTarget(): string {
  return target().split(":", 1)[0]!;
}

export async function destructive(command: string): Promise<void> {
  const confirmed = await confirmAlert({
    title: `Confirm ${command.replaceAll("-", " ")}`,
    message: "This action cannot be undone.",
    primaryAction: { title: "Confirm", style: Alert.ActionStyle.Destructive },
  });
  if (!confirmed) {
    await closeMainWindow();
    return;
  }
  if (command === "kill-window") await targetedWindow(command);
  else if (command === "kill-session") await targetedSession(command);
  else await targeted(command);
}

export async function reloadConfig(): Promise<void> {
  if (!process.env.TMUX) {
    await showToast({ style: Toast.Style.Failure, title: "Not inside tmux" });
    await closeMainWindow();
    return;
  }
  const config = process.env.XDG_CONFIG_HOME
    ? `${process.env.XDG_CONFIG_HOME}/tmux/tmux.conf`
    : `${process.env.HOME ?? ""}/.tmux.conf`;
  const candidates = process.env.XDG_CONFIG_HOME
    ? [config, `${process.env.HOME ?? ""}/.tmux.conf`]
    : [config];
  let chosen: string | undefined;
  for (const candidate of candidates) {
    if (
      candidate &&
      (await access(candidate).then(
        () => true,
        () => false,
      ))
    ) {
      chosen = candidate;
      break;
    }
  }
  if (!chosen) {
    await showToast({ style: Toast.Style.Failure, title: "tmux config not found" });
    await closeMainWindow();
    return;
  }
  try {
    await run("tmux", ["-u", "source-file", chosen]);
    await showHUD("Reloaded tmux configuration");
  } catch (error) {
    const message =
      error instanceof Error ? error.message.split("\n", 1)[0] : "tmux command failed";
    await showToast({ style: Toast.Style.Failure, title: "Tmux command failed", message });
  } finally {
    await closeMainWindow();
  }
}
