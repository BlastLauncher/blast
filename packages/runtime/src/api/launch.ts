// `launchCommand` and the props a command receives on launch. The declarations
// are `LaunchProps`, `LaunchOptions` and `LaunchType`; Blast always launches
// user initiated (background scheduling is out of scope, task 0028).
import type { JsonValue } from "../reconciler/index.ts";
import { requestCapability } from "./capability.ts";
import { LaunchType } from "./enums.generated.ts";

export { LaunchType };

/** `LaunchType`'s value union: the enum type from the declarations. */
export type LaunchTypeValue = (typeof LaunchType)[keyof typeof LaunchType];

/** `LaunchContext`: arbitrary JSON passed through `launchCommand({ context })`. */
export type LaunchContext = Record<string, JsonValue>;

/** `LaunchProps`: the top-level props a command receives on launch. */
export type LaunchProps = {
  /** Manifest argument values, keyed by the arguments' names. */
  arguments: Record<string, string>;
  launchType: LaunchTypeValue;
  /** Only present when the command was started by `launchCommand`. */
  launchContext?: LaunchContext;
};

/**
 * `LaunchOptions`: command name and launch type, plus the fields the
 * inter-extension form requires (`extensionName` and `ownerOrAuthorName`).
 */
export interface LaunchCommandOptions {
  name: string;
  type: LaunchTypeValue;
  extensionName?: string;
  ownerOrAuthorName?: string;
  arguments?: Record<string, string> | null;
  context?: LaunchContext | null;
  fallbackText?: string | null;
}

/**
 * Launches another command. Blast records the request and the host decides: a
 * granted `command.launch` accepts it, a denial rejects it, and nothing starts
 * a second session yet.
 */
export async function launchCommand(options: LaunchCommandOptions): Promise<void> {
  const params: Record<string, JsonValue> = { name: options.name, type: options.type };
  if (options.extensionName !== undefined) params["extensionName"] = options.extensionName;
  if (options.ownerOrAuthorName !== undefined) {
    params["ownerOrAuthorName"] = options.ownerOrAuthorName;
  }
  if (options.arguments != null) params["arguments"] = options.arguments;
  if (options.context != null) params["context"] = options.context;
  if (options.fallbackText != null) params["fallbackText"] = options.fallbackText;
  await requestCapability("command.launch", params);
}

/** Updates the current command's metadata in the host's own UI. */
export async function updateCommandMetadata(metadata: { subtitle?: string | null }): Promise<void> {
  await requestCapability(
    "command.metadata",
    metadata.subtitle === undefined ? {} : { subtitle: metadata.subtitle },
  );
}
