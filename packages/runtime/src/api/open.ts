// `open(target, application?)` from the declarations. Opening a link and opening
// a file are separate privileges, so each is its own capability: `open.url` for
// URLs (a `file:` URL counts as a file) and `open.path` otherwise. Both are
// denied unless granted.
import type { JsonValue } from "../reconciler/index.ts";
import { requestCapability } from "./capability.ts";

/** `Application` from the declarations. */
export interface Application {
  /** The display name of the application. */
  name: string;
  /** The localized name of the application. */
  localizedName?: string;
  /** The absolute path to the application bundle. */
  path: string;
  /** The bundle identifier of the application. */
  bundleId?: string;
  /** The Windows App ID of the application. */
  windowsAppId?: string;
}

/** Whether the target is a link rather than a file; a `file:` URL is a file. */
export function isUrl(target: string): boolean {
  // `URL.canParse` rejects plain file paths.
  if (!URL.canParse(target)) return false;
  // A `file:` URL names a file, so granting `open.url` must not open it.
  return new URL(target).protocol !== "file:";
}

// The host records the application as an identifier: a JSON-safe subset of the
// object, so nothing unserializable can reach the wire.
function applicationParam(application: Application | string | undefined): JsonValue | undefined {
  if (application === undefined) return undefined;
  if (typeof application === "string") return application;
  const param: Record<string, JsonValue> = {};
  for (const field of ["name", "path", "bundleId", "windowsAppId"] as const) {
    const value = application[field];
    if (typeof value === "string") param[field] = value;
  }
  return param;
}

export async function open(target: string, application?: Application | string): Promise<void> {
  if (typeof target !== "string" || target === "")
    throw new TypeError("open: target must be a non-empty string");
  const url = isUrl(target);
  const params: Record<string, JsonValue> = url ? { url: target } : { path: target };
  const requested = applicationParam(application);
  if (requested !== undefined) params.application = requested;
  await requestCapability(url ? "open.url" : "open.path", params);
}
