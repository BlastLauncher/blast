// Maps an Alfred workflow onto Blast's extension manifest: entry objects
// become commands, `userconfigurationconfig` becomes preferences. The types
// mirror `ExtensionManifest` in `@blastlauncher/host` structurally so this
// package does not depend on the host.

import type { Preference, PreferenceValue } from "@blastlauncher/protocol/preference-fields";
import type { PlistValue } from "./plist.ts";
import {
  plistString,
  type AlfredObject,
  type AlfredUserConfigItem,
  type AlfredWorkflow,
} from "./workflow.ts";

export type AlfredArgument = {
  name: string;
  type: "text";
  required: boolean;
  placeholder: string;
  data: { title: string; value: string }[];
};

export type AlfredCommand = {
  name: string;
  title: string;
  subtitle: string;
  description: string;
  mode: "view" | "no-view";
  arguments: AlfredArgument[];
  preferences: Preference[];
  icon?: string;
};

export type AlfredManifest = {
  name: string;
  title: string;
  preferences: Preference[];
  commands: AlfredCommand[];
  icon?: string;
};

export const SCRIPT_FILTER = "alfred.workflow.input.scriptfilter";
export const KEYWORD = "alfred.workflow.input.keyword";
export const LIST_FILTER = "alfred.workflow.input.listfilter";
export const EXTERNAL_TRIGGER = "alfred.workflow.trigger.external";

const ENTRY_TYPES = new Set([SCRIPT_FILTER, KEYWORD, LIST_FILTER]);
const VIEW_ENTRY_TYPES = new Set([SCRIPT_FILTER, LIST_FILTER]);
// Objects that draw something, so a command that reaches one needs a view.
const UI_TYPES = new Set([
  SCRIPT_FILTER,
  LIST_FILTER,
  "alfred.workflow.userinterface.text",
  "alfred.workflow.userinterface.grid",
  "alfred.workflow.output.largetype",
  "alfred.workflow.utility.dialog",
]);

const CONSTANTS: Record<string, (workflow: AlfredWorkflow) => string> = {
  alfred_workflow_name: (workflow) => workflow.name,
  alfred_workflow_bundleid: (workflow) => workflow.bundleId,
  alfred_workflow_description: (workflow) => workflow.description,
  alfred_workflow_version: (workflow) => workflow.version,
};

/** The string a user configuration default puts into its workflow variable. */
function configDefault(item: AlfredUserConfigItem): string | undefined {
  const value = item.type === "slider" ? item.config.defaultvalue : item.config.default;
  // Alfred exports checkbox variables as "1" / "0".
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Expands `{var:name}` and `{const:alfred_workflow_*}` placeholders. Variables
 * resolve from `overrides`, then workflow variables, then user configuration
 * defaults; an unknown variable expands to "" as in Alfred. Unknown constants
 * are left as written.
 */
export function resolveWorkflowTemplate(
  text: string,
  workflow: AlfredWorkflow,
  overrides: Record<string, string> = {},
): string {
  return text.replace(/\{(var|const):([^{}]+)\}/g, (whole, kind: string, name: string) => {
    if (kind === "const") return CONSTANTS[name]?.(workflow) ?? whole;
    if (Object.hasOwn(overrides, name)) return overrides[name]!;
    if (Object.hasOwn(workflow.variables, name)) return workflow.variables[name]!;
    const item = workflow.userConfig.find((entry) => entry.variable === name);
    return (item && configDefault(item)) ?? "";
  });
}

/** Alfred 5 user configuration sheet → Blast preferences. */
export function mapUserConfigToPreferences(items: AlfredUserConfigItem[]): Preference[] {
  return items.map((item) => {
    const { config } = item;
    const required = config.required === true;
    const base = {
      name: item.variable,
      title: item.label || item.variable,
      required,
      data: [] as { title: string; value: string }[],
      ...(item.description ? { description: item.description } : {}),
    };
    // A required field with an empty default must stay unset so that
    // `missingPreferences` prompts for it.
    const withDefault = (value: PreferenceValue | undefined): { default?: PreferenceValue } =>
      value === undefined || (required && value === "") ? {} : { default: value };
    const placeholder = plistString(config.placeholder);
    const withPlaceholder = placeholder ? { placeholder } : {};
    const stringDefault = typeof config.default === "string" ? config.default : undefined;

    switch (item.type) {
      case "checkbox":
        return {
          ...base,
          type: "checkbox",
          label: plistString(config.text) || item.label || item.variable,
          ...withDefault(config.default === true),
        };
      case "popupbutton":
        return {
          ...base,
          type: "dropdown",
          data: popupPairs(config.pairs),
          ...withDefault(stringDefault),
        };
      case "filepicker":
        return {
          ...base,
          type: config.filtermode === 1 ? "directory" : "file",
          ...withPlaceholder,
          ...withDefault(stringDefault),
        };
      case "slider": {
        const value = config.defaultvalue;
        return {
          ...base,
          type: "textfield",
          ...withDefault(
            typeof value === "number" || typeof value === "string" ? String(value) : undefined,
          ),
        };
      }
      default:
        // textfield, textarea and anything newer than Alfred 5 we do not know.
        return { ...base, type: "textfield", ...withPlaceholder, ...withDefault(stringDefault) };
    }
  });
}

function popupPairs(value: PlistValue | undefined): { title: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  const data: { title: string; value: string }[] = [];
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const title = plistString(pair[0]);
    const option = plistString(pair[1]);
    data.push({ title: title || option, value: option });
  }
  return data;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Entry = { object: AlfredObject; keyword: string; triggerId: string };

function selectEntries(workflow: AlfredWorkflow): Entry[] {
  const resolve = (value: PlistValue | undefined): string =>
    resolveWorkflowTemplate(plistString(value), workflow).trim();
  const entries = workflow.objects.map((object) => ({
    object,
    keyword: resolve(object.config.keyword),
    triggerId: resolve(object.config.triggerid),
  }));
  const inputs = entries.filter((entry) => ENTRY_TYPES.has(entry.object.type));
  const withKeyword = inputs.filter((entry) => entry.keyword !== "");
  if (withKeyword.length > 0) return withKeyword;
  // Inputs without keywords are still runnable when nothing feeds into them.
  const targets = new Set(workflow.connections.map((connection) => connection.to));
  const roots = inputs.filter((entry) => !targets.has(entry.object.uid));
  if (roots.length > 0) return roots;
  return entries.filter(
    (entry) => entry.object.type === EXTERNAL_TRIGGER && entry.triggerId !== "",
  );
}

function reachesUi(workflow: AlfredWorkflow, start: string): boolean {
  const types = new Map(workflow.objects.map((object) => [object.uid, object.type]));
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const uid = queue.shift()!;
    for (const connection of workflow.connections) {
      if (connection.disabled || connection.from !== uid || seen.has(connection.to)) continue;
      if (UI_TYPES.has(types.get(connection.to) ?? "")) return true;
      seen.add(connection.to);
      queue.push(connection.to);
    }
  }
  return false;
}

function keywordArguments(object: AlfredObject): AlfredArgument[] {
  if (object.type !== KEYWORD) return [];
  const argumentType = object.config.argumenttype;
  if (argumentType === 2) return [];
  return [
    { name: "query", type: "text", required: argumentType === 0, placeholder: "Query", data: [] },
  ];
}

/**
 * Builds the Blast manifest for a workflow. `entryUids` maps each command
 * name to the Alfred object it starts from.
 */
export function workflowToManifest(
  workflow: AlfredWorkflow,
  options: { existingFiles?: ReadonlySet<string> } = {},
): { manifest: AlfredManifest; entryUids: Record<string, string> } {
  const files = options.existingFiles ?? new Set<string>();
  const resolve = (value: PlistValue | undefined): string =>
    resolveWorkflowTemplate(plistString(value), workflow).trim();
  const used = new Set<string>();
  const entryUids: Record<string, string> = {};
  const commands: AlfredCommand[] = [];

  for (const { object, keyword, triggerId } of selectEntries(workflow)) {
    const title = resolve(object.config.title) || resolve(object.config.text);
    const base =
      [keyword, triggerId, title, object.uid].map(slugify).find((slug) => slug !== "") ?? "command";
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
    used.add(name);
    entryUids[name] = object.uid;

    const mode =
      VIEW_ENTRY_TYPES.has(object.type) || reachesUi(workflow, object.uid) ? "view" : "no-view";
    const icon = `${object.uid}.png`;
    commands.push({
      name,
      title: title || keyword || triggerId || name,
      subtitle: resolve(object.config.subtext),
      description: workflow.description,
      mode,
      arguments: keywordArguments(object),
      preferences: [],
      ...(files.has(icon) ? { icon } : {}),
    });
  }

  const manifestName = workflow.bundleId.trim() || slugify(workflow.name) || "alfred-workflow";
  return {
    manifest: {
      name: manifestName,
      title: workflow.name.trim() || manifestName,
      preferences: mapUserConfigToPreferences(workflow.userConfig),
      commands,
      ...(files.has("icon.png") ? { icon: "icon.png" } : {}),
    },
    entryUids,
  };
}
