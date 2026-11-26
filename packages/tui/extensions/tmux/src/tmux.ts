import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { useEffect, useState } from "react";
import { Alert, Toast, closeMainWindow, confirmAlert, showHUD, showToast } from "@raycast/api";

const run = promisify(execFile);
export const target = () => {
  const file = process.env.BLAST_TMUX_TARGET_FILE;
  if (file) {
    try {
      const value = readFileSync(file, "utf8").trim();
      if (value) return value;
    } catch {
      // Fall back to BLAST_TMUX_TARGET or {last}.
    }
  }
  return process.env.BLAST_TMUX_TARGET || "{last}";
};

/** Shows why tmux could not run and closes the palette. */
export async function fail(error: unknown): Promise<void> {
  if (!process.env.TMUX) {
    await showToast({ style: Toast.Style.Failure, title: "Not inside tmux" });
  } else {
    const message =
      error instanceof Error ? error.message.split("\n", 1)[0] : "tmux command failed";
    await showToast({ style: Toast.Style.Failure, title: "Tmux command failed", message });
  }
  await closeMainWindow();
}

/** Runs tmux (`;` separates several commands) and closes the palette. */
export async function tmux(args: string[]): Promise<void> {
  if (!process.env.TMUX) return fail(undefined);
  try {
    await run("tmux", ["-u", ...args]);
  } catch (error) {
    return fail(error);
  }
  await closeMainWindow();
}

/** tmux output for a view to render; rejects outside tmux or on failure. */
export async function query(args: string[]): Promise<string> {
  if (!process.env.TMUX) throw new Error("Not inside tmux");
  const { stdout } = await run("tmux", ["-u", ...args]);
  return stdout.replace(/\n$/, "");
}

/** `list-*` rows for `fields` formats, which must not contain tabs. */
export async function rows<Field extends string>(
  args: string[],
  fields: Record<Field, string>,
): Promise<Record<Field, string>[]> {
  const names = Object.keys(fields) as Field[];
  const output = await query([...args, "-F", names.map((name) => fields[name]).join("\t")]);
  if (!output) return [];
  return output.split("\n").map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(names.map((name, index) => [name, values[index] ?? ""])) as Record<
      Field,
      string
    >;
  });
}

/** Loads view data once; a failure shows a toast and closes the palette. */
export function useLoad<T>(load: () => Promise<T>): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    load().then(setValue, (error: unknown) => void fail(error));
    // Loaded once per mount: `load` is a fresh closure every render.
  }, []);
  return value;
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

export function windowTarget(): string {
  return target().replace(/\.[^.]+$/, "");
}

export function sessionTarget(): string {
  return target().split(":", 1)[0]!;
}

export async function confirmDestructive(command: string): Promise<boolean> {
  return confirmAlert({
    title: `Confirm ${command.replaceAll("-", " ")}`,
    message: "This action cannot be undone.",
    primaryAction: { title: "Confirm", style: Alert.ActionStyle.Destructive },
  });
}

export async function destructive(command: string): Promise<void> {
  if (!(await confirmDestructive(command))) {
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
