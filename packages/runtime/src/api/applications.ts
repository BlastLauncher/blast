// `getApplications(path?)` from the declarations. Listing what is installed
// needs the OS, so it lives behind the `applications.list` capability: a
// headless client answers with what it was told about the machine.
import type { JsonValue } from "../reconciler/index.ts";
import { requestCapability } from "./capability.ts";
import type { Application } from "./open.ts";

/** `PathLike`, which the declarations take from `node:fs`. */
export type ApplicationPath = string | Buffer | URL;

/** Fields other than the required `name` and `path`. */
const OPTIONAL_FIELDS = ["localizedName", "bundleId", "windowsAppId"] as const;

export function pathParam(path: ApplicationPath, api: string): string {
  if (typeof path !== "string" && !(path instanceof URL) && !Buffer.isBuffer(path)) {
    throw new TypeError(`${api}: path must be a string, Buffer or URL`);
  }
  const value = String(path);
  if (value === "") throw new TypeError(`${api}: path must not be empty`);
  return value;
}

// The host is another process: rebuild each application from the declared
// fields rather than trusting whatever shape arrived on the wire.
export function toApplication(value: JsonValue, api = "getApplications"): Application {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof value.name !== "string" ||
    typeof value.path !== "string"
  ) {
    throw new TypeError(`${api}: the host returned an invalid Application`);
  }
  const application: Application = { name: value.name, path: value.path };
  for (const field of OPTIONAL_FIELDS) {
    const fieldValue = value[field];
    if (typeof fieldValue === "string") application[field] = fieldValue;
  }
  return application;
}

export async function getApplications(path?: ApplicationPath): Promise<Application[]> {
  const params: Record<string, JsonValue> =
    path === undefined ? {} : { path: pathParam(path, "getApplications") };
  const value = await requestCapability("applications.list", params);
  if (!Array.isArray(value)) {
    throw new TypeError("getApplications: the host returned a non-array");
  }
  return value.map((item) => toApplication(item));
}

/**
 * `getDefaultApplication(path)`: the application the machine would open the
 * path with. Rejects when there is none, exactly as the declarations promise
 * and as a headless host without an application database always does.
 */
export async function getDefaultApplication(path: ApplicationPath): Promise<Application> {
  return toApplication(
    await requestCapability("applications.default", {
      path: pathParam(path, "getDefaultApplication"),
    }),
    "getDefaultApplication",
  );
}
