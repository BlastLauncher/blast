// The `environment` object from `@raycast/api`. The runtime populates it from
// `init.environment` and the `init.command` it was launched with before the
// extension is imported, so top-level reads work.
import type { CommandMode, InitEnvironment } from "@blastlauncher/protocol";
import { LaunchType, type LaunchTypeValue } from "./launch.ts";
import { unsupportedPath } from "./unsupported.ts";

/** Raycast's `raycastVersion`; Blast is not Raycast, so this is our own value. */
export const RAYCAST_VERSION = "0.0.0-blast";

/** The theme the host reports; a headless host has no UI and defaults to `"dark"`. */
export type Appearance = "light" | "dark";
export type TextSize = "medium" | "large";
/** Raycast's `EntryPointTypes`: Blast launches commands only. */
export type EntryPointType = "command" | "tool";
export type EntryPointMode = CommandMode;

export type Environment = {
  raycastVersion: string;
  ownerOrAuthorName: string;
  extensionName: string;
  entryPointType: EntryPointType;
  entryPointName: string;
  entryPointMode: EntryPointMode;
  assetsPath: string;
  supportPath: string;
  isDevelopment: boolean;
  appearance: Appearance;
  textSize: TextSize;
  launchType: LaunchTypeValue;
  /** Deprecated alias of {@link Environment.entryPointName}; extensions still read it. */
  commandName: string;
  canAccess(api: unknown): boolean;
};

/**
 * Raycast hides APIs a user is not entitled to behind `canAccess`. Blast ships
 * a stub for every API it does not implement (the generated list derives from
 * `implemented.ts`), and a stub carries its own path. That marker is exactly
 * "an API Blast does not provide" — `AI` and `BrowserExtension` today — so
 * `canAccess` denies stub values and allows everything real.
 */
function canAccess(api: unknown): boolean {
  return unsupportedPath(api) === undefined;
}

/** Mutable in place: extension modules bind this object when they import it. */
export const environment: Environment = {
  raycastVersion: RAYCAST_VERSION,
  ownerOrAuthorName: "",
  extensionName: "",
  // Blast launches commands, never tools.
  entryPointType: "command",
  entryPointName: "",
  entryPointMode: "view",
  assetsPath: "",
  supportPath: "",
  isDevelopment: false,
  appearance: "dark",
  textSize: "medium",
  // Blast only launches commands the user initiated; a background launch is
  // out of scope (task 0028).
  launchType: LaunchType.UserInitiated,
  commandName: "",
  canAccess,
};

/**
 * Installs the values from `init`; the runtime calls it before importing the
 * command. The entry point mirrors the launched command, as Raycast defines it.
 */
export function setEnvironment(
  values: InitEnvironment,
  command: { name: string; mode: CommandMode },
): void {
  environment.extensionName = values.extensionName;
  environment.ownerOrAuthorName = values.ownerOrAuthorName;
  environment.entryPointType = "command";
  environment.entryPointName = command.name;
  environment.entryPointMode = command.mode;
  environment.assetsPath = values.assetsPath;
  environment.supportPath = values.supportPath;
  environment.isDevelopment = values.isDevelopment;
  environment.appearance = values.appearance;
  environment.textSize = values.textSize;
  environment.commandName = values.commandName;
}
