// The `environment` object from `@raycast/api`. The runtime populates it from
// `init.environment` before the extension is imported, so top-level reads work.
//
// Raycast's `Environment` has members the host does not send yet (appearance,
// launchType, canAccess, …). They stay absent here, so an extension reads
// `undefined` instead of a fabricated value, and the coverage report keeps them
// missing rather than claiming support we do not have.
import type { InitEnvironment } from "@blastlauncher/protocol";

/** Raycast's `raycastVersion`; Blast is not Raycast, so this is our own value. */
export const RAYCAST_VERSION = "0.0.0-blast";

export type Environment = {
  raycastVersion: string;
  extensionName: string | undefined;
  commandName: string | undefined;
  assetsPath: string | undefined;
  supportPath: string | undefined;
  isDevelopment: boolean | undefined;
};

/** Mutable in place: extension modules bind this object when they import it. */
export const environment: Environment = {
  raycastVersion: RAYCAST_VERSION,
  extensionName: undefined,
  commandName: undefined,
  assetsPath: undefined,
  supportPath: undefined,
  isDevelopment: undefined,
};

/** Installs the values from `init`; the runtime calls it before importing the command. */
export function setEnvironment(values: InitEnvironment): void {
  environment.extensionName = values.extensionName;
  environment.commandName = values.commandName;
  environment.assetsPath = values.assetsPath;
  environment.supportPath = values.supportPath;
  environment.isDevelopment = values.isDevelopment;
}
