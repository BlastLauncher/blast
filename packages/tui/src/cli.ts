import { statSync } from "node:fs";

export const USAGE =
  "Usage: blast-tui [--popup | --popup-daemon] [--native] [--no-builtin] <extensionDir>...\n" +
  "       blast-tui [--native] <extensionDir> <command>\n" +
  "       blast-tui --version";

export type CliArgs =
  | { kind: "root"; extensionDirs: string[]; popup: boolean; daemon: boolean; native: boolean }
  | { kind: "command"; extensionDir: string; command: string; native: boolean }
  | { kind: "version" }
  | { kind: "usage"; error?: string };

const isDirectory = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** An extension source besides a directory: an Alfred workflow archive. */
const isWorkflowArchive = (path: string) => path.toLowerCase().endsWith(".alfredworkflow");

/**
 * `<dir> <command>` keeps opening one command directly; a second argument
 * that is an existing directory or an `.alfredworkflow` file makes it a root
 * over both extensions. A source is a Raycast extension directory, an Alfred
 * workflow directory or an `.alfredworkflow` file.
 */
export function parseCliArgs(
  argv: readonly string[],
  directory: (path: string) => boolean = isDirectory,
): CliArgs {
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const arg of argv) {
    if (
      arg === "--popup" ||
      arg === "--popup-daemon" ||
      arg === "--native" ||
      arg === "--no-builtin"
    )
      flags.add(arg);
    else if (arg === "--version") return { kind: "version" };
    else if (arg === "--help" || arg === "-h") return { kind: "usage" };
    else if (arg.startsWith("--")) return { kind: "usage", error: `Unknown option: ${arg}` };
    else positional.push(arg);
  }
  const daemon = flags.has("--popup-daemon");
  const popup = daemon || flags.has("--popup");
  const native = flags.has("--native");
  if (!positional.length && flags.has("--no-builtin"))
    return { kind: "usage", error: "Missing <extensionDir>" };
  const [extensionDir, command] = positional;
  if (positional.length === 2 && !directory(command!) && !isWorkflowArchive(command!)) {
    if (popup) return { kind: "usage", error: "--popup opens the root, not one command" };
    return { kind: "command", extensionDir: extensionDir!, command: command!, native };
  }
  return { kind: "root", extensionDirs: positional, popup, daemon, native };
}
