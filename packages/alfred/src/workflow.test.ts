import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodeModifierMask,
  loadWorkflow,
  normalizeModifierKey,
  parseListFilterItems,
  parseWorkflow,
} from "./workflow.ts";

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>bundleid</key><string>com.example.search</string>
  <key>name</key><string>Search</string>
  <key>description</key><string>Search things</string>
  <key>createdby</key><string>Example</string>
  <key>version</key><string>1.2.0</string>
  <key>objects</key>
  <array>
    <dict>
      <key>uid</key><string>SF</string>
      <key>type</key><string>alfred.workflow.input.scriptfilter</string>
      <key>version</key><integer>3</integer>
      <key>config</key><dict><key>keyword</key><string>s</string></dict>
    </dict>
    <dict>
      <key>uid</key><string>CLIP</string>
      <key>type</key><string>alfred.workflow.output.clipboard</string>
    </dict>
  </array>
  <key>connections</key>
  <dict>
    <key>SF</key>
    <array>
      <dict>
        <key>destinationuid</key><string>CLIP</string>
        <key>modifiers</key><integer>1048576</integer>
        <key>modifiersubtext</key><string>Copy</string>
        <key>vitoclose</key><true/>
      </dict>
    </array>
  </dict>
  <key>variables</key><dict><key>api</key><string>https://example.com</string><key>flag</key><true/></dict>
  <key>variablesdontexport</key><array><string>token</string></array>
  <key>userconfigurationconfig</key>
  <array>
    <dict>
      <key>type</key><string>textfield</string>
      <key>variable</key><string>token</string>
      <key>label</key><string>Token</string>
      <key>config</key><dict><key>required</key><true/></dict>
    </dict>
  </array>
  <key>uidata</key><dict><key>SF</key><dict><key>xpos</key><real>30</real></dict></dict>
</dict>
</plist>
`;

describe("parseWorkflow", () => {
  test("builds objects, connections, variables and configuration", () => {
    const workflow = parseWorkflow({
      bundleid: "com.example",
      name: "Example",
      objects: [
        { uid: "A", type: "alfred.workflow.input.keyword", config: { keyword: "ex" } },
        { uid: "B", type: "alfred.workflow.action.script", version: 2 },
      ],
      connections: {
        A: [
          { destinationuid: "B", modifiers: 0, modifiersubtext: "", vitoclose: false },
          { destinationuid: "B", modifiers: 131072, sourceoutputuid: "OUT", disabled: true },
          { modifiers: 0 },
        ],
      },
    });
    expect(workflow.bundleId).toBe("com.example");
    expect(workflow.objects).toEqual([
      { uid: "A", type: "alfred.workflow.input.keyword", version: 1, config: { keyword: "ex" } },
      { uid: "B", type: "alfred.workflow.action.script", version: 2, config: {} },
    ]);
    expect(workflow.connections).toEqual([
      {
        from: "A",
        to: "B",
        modifiers: 0,
        modifierSubtext: "",
        vitoclose: false,
        disabled: false,
      },
      {
        from: "A",
        to: "B",
        modifiers: 131072,
        modifierSubtext: "",
        vitoclose: false,
        disabled: true,
        sourceOutputUid: "OUT",
      },
    ]);
  });

  test("defaults every optional section", () => {
    const workflow = parseWorkflow({ name: "Bare" });
    expect(workflow).toEqual({
      bundleId: "",
      name: "Bare",
      description: "",
      createdBy: "",
      webAddress: "",
      version: "",
      readme: "",
      category: "",
      disabled: false,
      objects: [],
      connections: [],
      variables: {},
      variablesDontExport: [],
      userConfig: [],
      uidata: {},
    });
  });

  test("rejects non-dictionary roots and malformed objects", () => {
    expect(() => parseWorkflow([])).toThrow("root must be a dictionary, found an array");
    expect(() => parseWorkflow("plist")).toThrow("root must be a dictionary, found string");
    expect(() => parseWorkflow(new Date(0))).toThrow("root must be a dictionary");
    expect(() => parseWorkflow({ objects: {} })).toThrow("`objects` must be an array");
    expect(() => parseWorkflow({ objects: [{ type: "x" }] })).toThrow("object 1 needs a uid");
    expect(() => parseWorkflow({ objects: [{ uid: "A" }] })).toThrow("object A needs a type");
    expect(() => parseWorkflow({ connections: [] })).toThrow("`connections` must be a dictionary");
  });
});

describe("loadWorkflow", () => {
  let dir = "";
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "blast-alfred-workflow-"));
    await writeFile(join(dir, "info.plist"), INFO_PLIST);
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("reads info.plist from a workflow directory", async () => {
    const workflow = await loadWorkflow(dir);
    expect(workflow.dir).toBe(dir);
    expect(workflow.name).toBe("Search");
    expect(workflow.version).toBe("1.2.0");
    expect(workflow.objects.map((object) => object.uid)).toEqual(["SF", "CLIP"]);
    expect(workflow.objects[0]!.version).toBe(3);
    expect(workflow.connections).toEqual([
      {
        from: "SF",
        to: "CLIP",
        modifiers: 1048576,
        modifierSubtext: "Copy",
        vitoclose: true,
        disabled: false,
      },
    ]);
    expect(workflow.variables).toEqual({ api: "https://example.com", flag: "1" });
    expect(workflow.variablesDontExport).toEqual(["token"]);
    expect(workflow.userConfig).toEqual([
      {
        type: "textfield",
        variable: "token",
        label: "Token",
        description: "",
        config: { required: true },
      },
    ]);
    expect(workflow.uidata).toEqual({ SF: { xpos: 30 } });
  });

  test("names the missing info.plist", async () => {
    await expect(loadWorkflow(join(dir, "missing"))).rejects.toThrow(
      /cannot read .*missing.info\.plist/,
    );
  });
});

describe("modifiers", () => {
  test("decodes NSEventModifierFlags in canonical order", () => {
    expect(decodeModifierMask(0)).toEqual([]);
    expect(decodeModifierMask(131072)).toEqual(["shift"]);
    expect(decodeModifierMask(262144)).toEqual(["ctrl"]);
    expect(decodeModifierMask(524288)).toEqual(["alt"]);
    expect(decodeModifierMask(1048576)).toEqual(["cmd"]);
    expect(decodeModifierMask(8388608)).toEqual(["fn"]);
    expect(decodeModifierMask(131072 | 1048576 | 8388608 | 524288 | 262144)).toEqual([
      "cmd",
      "alt",
      "ctrl",
      "shift",
      "fn",
    ]);
    // Unrelated bits (caps lock, device-dependent flags) are ignored.
    expect(decodeModifierMask(65536 | 256 | 1048576)).toEqual(["cmd"]);
    expect(decodeModifierMask(-1)).toEqual([]);
  });

  test("canonicalizes modifier keys and aliases", () => {
    expect(normalizeModifierKey("cmd")).toBe("cmd");
    expect(normalizeModifierKey("shift+cmd")).toBe("cmd+shift");
    expect(normalizeModifierKey("Command+Option")).toBe("cmd+alt");
    expect(normalizeModifierKey("opt+control+fn")).toBe("alt+ctrl+fn");
    expect(normalizeModifierKey("fn+shift+ctrl+alt+cmd")).toBe("cmd+alt+ctrl+shift+fn");
    expect(normalizeModifierKey(" ctrl + ctrl ")).toBe("ctrl");
    expect(normalizeModifierKey("")).toBeUndefined();
    expect(normalizeModifierKey("cmd+hyper")).toBeUndefined();
  });
});

describe("parseListFilterItems", () => {
  test("parses Alfred's JSON-encoded string", () => {
    const raw = JSON.stringify([
      { title: "One", subtitle: "first", arg: "1", imagefile: "one.png" },
      { title: "Two", arg: 2, match: "deux" },
      "skipped",
    ]);
    expect(parseListFilterItems(raw)).toEqual([
      { title: "One", subtitle: "first", arg: "1", imagefile: "one.png" },
      { title: "Two", subtitle: "", arg: "2", match: "deux" },
    ]);
  });

  test("accepts already-parsed arrays and empty strings", () => {
    expect(
      parseListFilterItems([{ title: "A", subtitle: "a", arg: "x", autocomplete: "A" }]),
    ).toEqual([{ title: "A", subtitle: "a", arg: "x", autocomplete: "A" }]);
    expect(parseListFilterItems("")).toEqual([]);
  });

  test("rejects invalid JSON and non-arrays", () => {
    expect(() => parseListFilterItems("[{")).toThrow("list filter items are not valid JSON");
    expect(() => parseListFilterItems('{"title":"x"}')).toThrow("must be an array");
    expect(() => parseListFilterItems(42)).toThrow("must be an array");
  });
});
