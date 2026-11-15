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
  await targeted(command);
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
