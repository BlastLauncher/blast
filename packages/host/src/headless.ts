// The capabilities a headless Blast run answers without a desktop client. They
// read host state or record UI requests: `getApplications` reports the applications the caller supplied
// (an empty list otherwise), `Clipboard.read` reports the text the caller
// supplied (empty otherwise, with no history behind it), and opening a
// preference window or updating command metadata is only recorded. Selection
// comes from the supplied text and paths; the frontmost app is supplied or neutral.
// Everything that would change the machine
// (`open.*`, `clipboard.paste`, `clipboard.clear`) stays denied unless granted.
import type { JsonValue } from "@blastlauncher/protocol";
import type { CapabilityHandler } from "./broker.ts";

/** `Application` from the `@raycast/api` declarations, as it crosses the wire. */
export type Application = {
  name: string;
  path: string;
  localizedName?: string;
  bundleId?: string;
  windowsAppId?: string;
};

export type HeadlessCapabilities = {
  /** Answers `applications.list`; an empty list when omitted. */
  applications?: Application[] | undefined;
  selectedText?: string | undefined;
  selectedFiles?: string[] | undefined;
  /** Bundle identifier; resolves against applications or a synthetic application. */
  frontmost?: string | undefined;
  /** Answers `clipboard.read` at offset 0; an empty text when omitted. */
  clipboard?: string | undefined;
};

/** Fields other than the required `name` and `path`. */
const OPTIONAL_FIELDS = ["localizedName", "bundleId", "windowsAppId"] as const;
/** The offsets the `Clipboard.read` declarations allow into clipboard history. */
const MAX_OFFSET = 5;

function readParams(params: JsonValue, api: string): Record<string, JsonValue> {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new Error(`${api}: params must be an object`);
  }
  return params;
}

function toApplication(value: JsonValue, at: string): Application {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof value.name !== "string" ||
    typeof value.path !== "string"
  ) {
    throw new Error(`${at} must be an object with string "name" and "path"`);
  }
  const application: Application = { name: value.name, path: value.path };
  for (const field of OPTIONAL_FIELDS) {
    const fieldValue = value[field];
    if (typeof fieldValue === "string") application[field] = fieldValue;
  }
  return application;
}

/** The wire form of one application: absent fields stay absent, never undefined. */
function applicationWire(application: Application): Record<string, JsonValue> {
  const wire: Record<string, JsonValue> = { name: application.name, path: application.path };
  for (const field of OPTIONAL_FIELDS) {
    const value = application[field];
    if (typeof value === "string") wire[field] = value;
  }
  return wire;
}

/** Parse an `--applications` file: a JSON array of `{ name, path, … }`. */
export function parseApplications(text: string): Application[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`not JSON (${error instanceof Error ? error.message : String(error)})`, {
      cause: error,
    });
  }
  if (!Array.isArray(parsed)) throw new Error("must be a JSON array of applications");
  return parsed.map((value, index) =>
    toApplication(value as JsonValue, `application ${index + 1}`),
  );
}

export function createHeadlessHandlers(
  capabilities: HeadlessCapabilities = {},
): Record<string, CapabilityHandler> {
  const applications = capabilities.applications ?? [];
  const clipboard = capabilities.clipboard ?? "";
  const frontmost = capabilities.frontmost;
  return {
    "selection.text": (params) => {
      readParams(params, "selection.text");
      if (!capabilities.selectedText) throw new Error("No text selected");
      return capabilities.selectedText;
    },
    "selection.files": (params) => {
      readParams(params, "selection.files");
      return (capabilities.selectedFiles ?? []).map((path) => ({ path }));
    },
    "applications.frontmost": (params) => {
      readParams(params, "applications.frontmost");
      const application = applications.find(
        (app) => frontmost !== undefined && app.bundleId === frontmost,
      );
      return applicationWire(
        application ?? {
          name: frontmost ?? "Headless",
          path: "",
          ...(frontmost === undefined ? {} : { bundleId: frontmost }),
        },
      );
    },
    "applications.list": (params) => {
      // The supplied list is the whole answer: a headless run cannot narrow it
      // to the applications that can open one path.
      const { path } = readParams(params, "applications.list");
      if (path !== undefined && typeof path !== "string") {
        throw new Error('applications.list: "path" must be a string');
      }
      return applications.map(applicationWire);
    },
    "clipboard.read": (params) => {
      const { offset } = readParams(params, "clipboard.read");
      if (offset !== undefined) {
        if (
          typeof offset !== "number" ||
          !Number.isInteger(offset) ||
          offset < 0 ||
          offset > MAX_OFFSET
        ) {
          throw new Error(
            `clipboard.read: "offset" must be an integer between 0 and ${MAX_OFFSET}`,
          );
        }
        // There is no history to read from, so only the current entry has content.
        return { text: offset === 0 ? clipboard : "" };
      }
      return { text: clipboard };
    },
    "command.metadata": (params) => {
      const { subtitle } = readParams(params, "command.metadata");
      if (subtitle !== undefined && subtitle !== null && typeof subtitle !== "string") {
        throw new Error('command.metadata: "subtitle" must be a string or null');
      }
    },
    "preferences.open": (params) => {
      const { scope } = readParams(params, "preferences.open");
      if (scope !== "extension" && scope !== "command") {
        throw new Error('preferences.open: "scope" must be "extension" or "command"');
      }
    },
  };
}
