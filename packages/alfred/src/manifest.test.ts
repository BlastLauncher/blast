import { describe, expect, test } from "bun:test";
import { missingPreferences } from "@blastlauncher/protocol/preference-fields";
import {
  mapUserConfigToPreferences,
  resolveWorkflowTemplate,
  workflowToManifest,
} from "./manifest.ts";
import type { PlistValue } from "./plist.ts";
import { parseWorkflow, type AlfredUserConfigItem } from "./workflow.ts";

function workflow(plist: Record<string, PlistValue>) {
  return parseWorkflow({ bundleid: "com.example.wf", name: "Example WF", ...plist });
}

function item(
  type: string,
  variable: string,
  config: Record<string, PlistValue>,
  label = "",
): AlfredUserConfigItem {
  return { type, variable, label, description: "", config };
}

describe("mapUserConfigToPreferences", () => {
  test("maps all six Alfred 5 configuration types", () => {
    const preferences = mapUserConfigToPreferences([
      {
        ...item(
          "textfield",
          "api_key",
          { default: "", placeholder: "key", required: true },
          "API key",
        ),
        description: "Your key",
      },
      item("textarea", "notes", { default: "hello", required: false }),
      item("checkbox", "verbose", { default: true, text: "Log more" }, "Verbose"),
      item("checkbox", "quiet", {}, ""),
      item("popupbutton", "engine", {
        default: "ddg",
        pairs: [["Google", "google"], ["DuckDuckGo", "ddg"], ["broken"]],
      }),
      item("filepicker", "folder", { filtermode: 1, placeholder: "~/Notes", default: "" }),
      item("filepicker", "file", { filtermode: 0 }),
      item("slider", "limit", { defaultvalue: 20, minvalue: 1, maxvalue: 50 }, "Limit"),
      item("colorpicker", "future", { default: "#fff" }),
    ]);
    expect(preferences).toEqual([
      {
        name: "api_key",
        title: "API key",
        type: "textfield",
        required: true,
        data: [],
        description: "Your key",
        placeholder: "key",
      },
      {
        name: "notes",
        title: "notes",
        type: "textfield",
        required: false,
        data: [],
        default: "hello",
      },
      {
        name: "verbose",
        title: "Verbose",
        type: "checkbox",
        label: "Log more",
        required: false,
        data: [],
        default: true,
      },
      {
        name: "quiet",
        title: "quiet",
        type: "checkbox",
        label: "quiet",
        required: false,
        data: [],
        default: false,
      },
      {
        name: "engine",
        title: "engine",
        type: "dropdown",
        required: false,
        data: [
          { title: "Google", value: "google" },
          { title: "DuckDuckGo", value: "ddg" },
        ],
        default: "ddg",
      },
      {
        name: "folder",
        title: "folder",
        type: "directory",
        required: false,
        data: [],
        placeholder: "~/Notes",
        default: "",
      },
      { name: "file", title: "file", type: "file", required: false, data: [] },
      {
        name: "limit",
        title: "Limit",
        type: "textfield",
        required: false,
        data: [],
        default: "20",
      },
      {
        name: "future",
        title: "future",
        type: "textfield",
        required: false,
        data: [],
        default: "#fff",
      },
    ]);
  });

  test("leaves a required empty default unset so the user is prompted", () => {
    const preferences = mapUserConfigToPreferences([
      item("textfield", "token", { default: "", required: true }),
      item("textfield", "optional", { default: "", required: false }),
    ]);
    expect(preferences[0]!.default).toBeUndefined();
    expect(preferences[1]!.default).toBe("");
    expect(missingPreferences(preferences, {}).map((field) => field.name)).toEqual(["token"]);
  });
});

describe("resolveWorkflowTemplate", () => {
  const wf = workflow({
    description: "Does things",
    version: "2.0",
    variables: { greeting: "hi", shared: "from-variables" },
    userconfigurationconfig: [
      { type: "textfield", variable: "shared", config: { default: "from-config" } },
      { type: "textfield", variable: "kw", config: { default: "go" } },
      { type: "checkbox", variable: "on", config: { default: true } },
      { type: "slider", variable: "size", config: { defaultvalue: 7 } },
    ],
  });

  test("expands variables with overrides, then workflow variables, then config defaults", () => {
    expect(resolveWorkflowTemplate("{var:greeting} {var:shared} {var:kw}", wf)).toBe(
      "hi from-variables go",
    );
    expect(resolveWorkflowTemplate("{var:greeting}", wf, { greeting: "yo" })).toBe("yo");
    expect(resolveWorkflowTemplate("{var:on}/{var:size}", wf)).toBe("1/7");
    expect(resolveWorkflowTemplate("[{var:missing}]", wf)).toBe("[]");
  });

  test("expands workflow constants", () => {
    expect(
      resolveWorkflowTemplate(
        "{const:alfred_workflow_name}|{const:alfred_workflow_bundleid}|{const:alfred_workflow_description}|{const:alfred_workflow_version}",
        wf,
      ),
    ).toBe("Example WF|com.example.wf|Does things|2.0");
    expect(resolveWorkflowTemplate("{const:unknown}", wf)).toBe("{const:unknown}");
  });
});

describe("workflowToManifest", () => {
  test("maps primary inputs to commands with unique slugs", () => {
    const { manifest, entryUids } = workflowToManifest(
      workflow({
        variables: { kw: "Search Docs" },
        objects: [
          {
            uid: "SF1",
            type: "alfred.workflow.input.scriptfilter",
            config: { keyword: "{var:kw}", title: "Search docs", subtext: "Find pages" },
          },
          {
            uid: "SF2",
            type: "alfred.workflow.input.scriptfilter",
            config: { keyword: "search docs", title: "Search again" },
          },
          {
            uid: "LF",
            type: "alfred.workflow.input.listfilter",
            config: { keyword: "search-docs" },
          },
          { uid: "NOKW", type: "alfred.workflow.input.keyword", config: { keyword: "" } },
        ],
      }),
    );
    expect(manifest.name).toBe("com.example.wf");
    expect(manifest.title).toBe("Example WF");
    expect(manifest.commands.map((command) => command.name)).toEqual([
      "search-docs",
      "search-docs-2",
      "search-docs-3",
    ]);
    expect(entryUids).toEqual({
      "search-docs": "SF1",
      "search-docs-2": "SF2",
      "search-docs-3": "LF",
    });
    expect(manifest.commands[0]).toEqual({
      name: "search-docs",
      title: "Search docs",
      subtitle: "Find pages",
      description: "",
      mode: "view",
      arguments: [],
      preferences: [],
    });
    expect(manifest.commands[2]!.title).toBe("search-docs");
    expect(manifest.commands[2]!.mode).toBe("view");
  });

  test("keyword argument types and reachable UI decide arguments and mode", () => {
    const { manifest } = workflowToManifest(
      workflow({
        objects: [
          {
            uid: "K0",
            type: "alfred.workflow.input.keyword",
            config: { keyword: "req", argumenttype: 0, text: "Required" },
          },
          {
            uid: "K1",
            type: "alfred.workflow.input.keyword",
            config: { keyword: "opt", argumenttype: 1 },
          },
          {
            uid: "K2",
            type: "alfred.workflow.input.keyword",
            config: { keyword: "none", argumenttype: 2 },
          },
          {
            uid: "K3",
            type: "alfred.workflow.input.keyword",
            config: { keyword: "off", argumenttype: 2 },
          },
          { uid: "RUN", type: "alfred.workflow.action.script", config: {} },
          { uid: "TEXT", type: "alfred.workflow.userinterface.text", config: {} },
          { uid: "LARGE", type: "alfred.workflow.output.largetype", config: {} },
          { uid: "CLIP", type: "alfred.workflow.output.clipboard", config: {} },
        ],
        connections: {
          K0: [{ destinationuid: "RUN" }],
          RUN: [{ destinationuid: "TEXT" }],
          K1: [{ destinationuid: "CLIP" }],
          K2: [{ destinationuid: "LARGE", disabled: true }],
          K3: [{ destinationuid: "RUN" }],
        },
      }),
    );
    const byName = Object.fromEntries(manifest.commands.map((command) => [command.name, command]));
    expect(byName.req!.title).toBe("Required");
    expect(byName.req!.arguments).toEqual([
      { name: "query", type: "text", required: true, placeholder: "Query", data: [] },
    ]);
    expect(byName.opt!.arguments).toEqual([
      { name: "query", type: "text", required: false, placeholder: "Query", data: [] },
    ]);
    expect(byName.none!.arguments).toEqual([]);
    // K0 reaches a text view through a script; K3 reaches it the same way.
    expect(byName.req!.mode).toBe("view");
    expect(byName.off!.mode).toBe("view");
    expect(byName.opt!.mode).toBe("no-view");
    // A disabled connection does not count.
    expect(byName.none!.mode).toBe("no-view");
  });

  test("falls back to root inputs, then external triggers", () => {
    const roots = workflowToManifest(
      workflow({
        objects: [
          {
            uid: "ROOT",
            type: "alfred.workflow.input.scriptfilter",
            config: { title: "Root Filter" },
          },
          { uid: "FED", type: "alfred.workflow.input.listfilter", config: {} },
          { uid: "EXT", type: "alfred.workflow.trigger.external", config: { triggerid: "go" } },
        ],
        connections: { EXT: [{ destinationuid: "FED" }] },
      }),
    );
    expect(roots.entryUids).toEqual({ "root-filter": "ROOT" });

    const external = workflowToManifest(
      workflow({
        objects: [
          { uid: "FED", type: "alfred.workflow.input.keyword", config: {} },
          {
            uid: "EXT1",
            type: "alfred.workflow.trigger.external",
            config: { triggerid: "sync.now" },
          },
          { uid: "EXT2", type: "alfred.workflow.trigger.external", config: { triggerid: "" } },
          { uid: "DLG", type: "alfred.workflow.utility.dialog", config: {} },
        ],
        connections: { EXT1: [{ destinationuid: "FED" }], FED: [{ destinationuid: "DLG" }] },
      }),
    );
    expect(external.entryUids).toEqual({ "sync-now": "EXT1" });
    expect(external.manifest.commands[0]!.title).toBe("sync.now");
    expect(external.manifest.commands[0]!.mode).toBe("view");
    expect(external.manifest.commands[0]!.arguments).toEqual([]);

    const empty = workflowToManifest(parseWorkflow({ name: "  " }));
    expect(empty.manifest).toEqual({
      name: "alfred-workflow",
      title: "alfred-workflow",
      preferences: [],
      commands: [],
    });
  });

  test("assigns icons that exist and names unnamed bundles from the workflow name", () => {
    const { manifest } = workflowToManifest(
      parseWorkflow({
        name: "My Neat Workflow!",
        objects: [
          { uid: "A", type: "alfred.workflow.input.keyword", config: { keyword: "a" } },
          { uid: "B", type: "alfred.workflow.input.keyword", config: { keyword: "b" } },
        ],
        userconfigurationconfig: [{ type: "checkbox", variable: "x", config: {} }],
      }),
      { existingFiles: new Set(["icon.png", "A.png", "notes.txt"]) },
    );
    expect(manifest.name).toBe("my-neat-workflow");
    expect(manifest.icon).toBe("icon.png");
    expect(manifest.commands[0]!.icon).toBe("A.png");
    expect(manifest.commands[1]!.icon).toBeUndefined();
    expect(manifest.preferences.map((preference) => preference.name)).toEqual(["x"]);

    const noIcons = workflowToManifest(workflow({}));
    expect(noIcons.manifest.icon).toBeUndefined();
  });
});
