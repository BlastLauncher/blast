import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compareCondition,
  executeWorkflowGraph,
  type GraphExecutionOptions,
  type GraphHost,
  type GraphScriptRequest,
  type GraphScriptResult,
} from "./graph.ts";
import type { PlistValue } from "./plist.ts";
import { parseWorkflow, type AlfredWorkflow } from "./workflow.ts";

type Node = [
  uid: string,
  type: string,
  config?: Record<string, PlistValue>,
  extra?: Record<string, PlistValue>,
];
type Edge = [from: string, to: string, extra?: Record<string, PlistValue>];

function workflow(nodes: Node[], edges: Edge[]): AlfredWorkflow {
  const connections: Record<string, PlistValue[]> = {};
  for (const [from, to, extra] of edges) {
    (connections[from] ??= []).push({ destinationuid: to, modifiers: 0, ...extra });
  }
  return {
    ...parseWorkflow({
      bundleid: "com.example.graph",
      name: "Graph",
      variables: { base: "workflow" },
      objects: nodes.map(([uid, type, config = {}, extra = {}]) => ({
        uid,
        type: /^(input|output|action|utility|trigger|userinterface)\./.test(type)
          ? `alfred.workflow.${type}`
          : type,
        config,
        ...extra,
      })),
      connections,
    }),
    dir: "/workflows/graph",
  };
}

type Call = [string, unknown];

function host(
  overrides: Partial<GraphHost> & {
    script?: (request: GraphScriptRequest) => GraphScriptResult;
  } = {},
): GraphHost & { calls: Call[]; logs: string[] } {
  const calls: Call[] = [];
  const logs: string[] = [];
  return {
    calls,
    logs,
    request: async (capability, params) => {
      calls.push([capability, params]);
      return capability === "clipboard.read" ? { text: `clip${String(params.offset)}` } : null;
    },
    runScript: async (request) => {
      calls.push(["script", { query: request.query, variables: request.variables }]);
      return overrides.script?.(request) ?? { stdout: "", exitCode: 0 };
    },
    openView: (handoff) => {
      calls.push(["view", { uid: handoff.object.uid, ...handoff, object: undefined }]);
    },
    showNotification: (notification) => {
      calls.push(["notification", notification]);
    },
    showLargeType: (text) => {
      calls.push(["largetype", text]);
    },
    hideAlfred: () => {
      calls.push(["hide", null]);
    },
    log: (level, message) => {
      logs.push(`${level}: ${message}`);
    },
    ...overrides,
  };
}

function run(
  wf: AlfredWorkflow,
  h: GraphHost,
  extra: Partial<GraphExecutionOptions> = {},
): ReturnType<typeof executeWorkflowGraph> {
  return executeWorkflowGraph({
    workflow: wf,
    host: h,
    start: "IN",
    input: "Hello World",
    now: () => new Date(2026, 0, 2, 3, 4, 5),
    random: () => 0,
    uuid: () => "UUID",
    ...extra,
  });
}

const KEYWORD: Node = ["IN", "input.keyword", { keyword: "k" }];
const COPY = (uid = "COPY", text = "{query}"): Node => [
  uid,
  "output.clipboard",
  { clipboardtext: text },
];

describe("utilities", () => {
  test("argument, junction, transform and replace feed the next object", async () => {
    const h = host();
    const result = await run(
      workflow(
        [
          KEYWORD,
          ["ARG", "utility.argument", { argument: "{query}!", variables: { who: "{query}" } }],
          ["J", "utility.junction"],
          ["UP", "utility.transform", { type: 3 }],
          ["REP", "utility.replace", { matchstring: "WORLD", replacestring: "$1 there" }],
          [
            "RX",
            "utility.replace",
            { matchstring: "^(\\w+)", matchmode: 1, replacestring: "<$1>" },
          ],
          COPY("COPY", "{query} / {var:who} / {var:base}"),
        ],
        [
          ["IN", "ARG"],
          ["ARG", "J"],
          ["J", "UP"],
          ["UP", "REP"],
          ["REP", "RX"],
          ["RX", "COPY"],
        ],
      ),
      h,
    );
    expect(h.calls).toEqual([
      ["clipboard.copy", { text: "<HELLO> $1 there! / Hello World / workflow" }],
    ]);
    expect(result).toMatchObject({ steps: 6, warnings: [], aborted: false });
  });

  test("argument passthrough keeps the incoming argument", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          ["ARG", "utility.argument", { argument: "x", passthroughargument: true }],
          COPY(),
        ],
        [
          ["IN", "ARG"],
          ["ARG", "COPY"],
        ],
      ),
      h,
    );
    expect(h.calls).toEqual([["clipboard.copy", { text: "Hello World" }]]);
  });

  test("replace honours case sensitivity and multiline", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          [
            "A",
            "utility.replace",
            { matchstring: "hello", replacestring: "bye", matchcasesensitive: true },
          ],
          [
            "B",
            "utility.replace",
            { matchstring: "^w", matchmode: 1, replacestring: "_", multiline: true },
          ],
          COPY(),
        ],
        [
          ["IN", "A"],
          ["A", "B"],
          ["B", "COPY"],
        ],
      ),
      h,
      { input: "Hello\nworld" },
    );
    expect(h.calls).toEqual([["clipboard.copy", { text: "Hello\n_orld" }]]);
  });

  test("transform types 0-5", async () => {
    const texts: string[] = [];
    for (const type of [0, 1, 2, 3, 4, 5]) {
      const h = host();
      await run(
        workflow(
          [KEYWORD, ["T", "utility.transform", { type }], COPY()],
          [
            ["IN", "T"],
            ["T", "COPY"],
          ],
        ),
        h,
        { input: "  héllo wORLD, ok!  " },
      );
      texts.push((h.calls[0]![1] as { text: string }).text);
    }
    expect(texts).toEqual([
      "héllo wORLD, ok!",
      "  !ko ,DLROw olléh  ",
      "  héllo world, ok!  ",
      "  HÉLLO WORLD, OK!  ",
      "  Héllo World, Ok!  ",
      "  héllo wORLD ok  ",
    ]);
  });

  test("split into an array argument or numbered variables", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          [
            "S",
            "utility.split",
            { delimiter: "\\n", trimwhitespace: true, discardemptyvalues: true },
          ],
          ["URL", "action.openurl", { url: "https://x.test/{query}" }],
          ["V", "utility.split", { delimiter: ",", outputas: 1, variableprefix: "part" }],
          COPY("COPY", "{var:part1}+{var:part2}|{query}"),
        ],
        [
          ["IN", "S"],
          ["S", "URL"],
          ["IN", "V"],
          ["V", "COPY"],
        ],
      ),
      h,
      { input: "a b\n\n c,d " },
    );
    expect(h.calls).toEqual([
      ["open.url", { url: "https://x.test/a%20b" }],
      ["open.url", { url: "https://x.test/c%2Cd" }],
      ["clipboard.copy", { text: "a b\n\n c+d |a b\n\n c,d " }],
    ]);
  });

  test("json utility forwards arg, variables and config overrides", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          [
            "JSON",
            "utility.json",
            {
              json: '{"alfredworkflow":{"arg":"{query}","variables":{"v":"{var:base}"},"config":{"autopaste":true}}}',
            },
          ],
          COPY("COPY", "{query}={var:v}"),
          COPY("AFTER", "after"),
        ],
        [
          ["IN", "JSON"],
          ["JSON", "COPY"],
          ["COPY", "AFTER"],
        ],
      ),
      h,
      { input: 'say "hi"' },
    );
    // The override applies to the next object only.
    expect(h.calls).toEqual([
      ["clipboard.paste", { text: 'say "hi"=workflow' }],
      ["clipboard.copy", { text: "after" }],
    ]);
  });

  test("invalid json stops the branch with a warning", async () => {
    const h = host();
    const result = await run(
      workflow(
        [KEYWORD, ["JSON", "utility.json", { json: "{oops" }], COPY()],
        [
          ["IN", "JSON"],
          ["JSON", "COPY"],
        ],
      ),
      h,
    );
    expect(h.calls).toEqual([]);
    expect(result.warnings).toEqual([
      "alfred: alfred.workflow.utility.json (JSON) failed: JSON is not an alfredworkflow object",
    ]);
  });

  test("filter passes only matching input", async () => {
    const wf = workflow(
      [KEYWORD, ["F", "utility.filter", { matchmode: 4, matchstring: "^\\d+$" }], COPY()],
      [
        ["IN", "F"],
        ["F", "COPY"],
      ],
    );
    const yes = host();
    await run(wf, yes, { input: "42" });
    const no = host();
    await run(wf, no, { input: "x42" });
    expect(yes.calls).toEqual([["clipboard.copy", { text: "42" }]]);
    expect(no.calls).toEqual([]);
  });

  test("debug logs and hidealfred calls the host", async () => {
    const h = host();
    await run(
      workflow(
        [KEYWORD, ["D", "utility.debug", { text: "got {query}" }], ["H", "utility.hidealfred"]],
        [
          ["IN", "D"],
          ["D", "H"],
        ],
      ),
      h,
      { variables: { s: "1" } },
    );
    expect(h.logs).toEqual(['debug: D: got Hello World {"s":"1"}']);
    expect(h.calls).toEqual([["hide", null]]);
  });

  test("delay waits and is abortable", async () => {
    const short = host();
    await run(
      workflow(
        [KEYWORD, ["W", "utility.delay", { seconds: "0.001" }], COPY()],
        [
          ["IN", "W"],
          ["W", "COPY"],
        ],
      ),
      short,
    );
    expect(short.calls).toHaveLength(1);

    const controller = new AbortController();
    const long = host();
    const pending = run(
      workflow(
        [KEYWORD, ["W", "utility.delay", { seconds: 600 }], COPY()],
        [
          ["IN", "W"],
          ["W", "COPY"],
        ],
      ),
      long,
      { signal: controller.signal },
    );
    controller.abort();
    const result = await pending;
    expect(result.aborted).toBe(true);
    expect(long.calls).toEqual([]);
  });
});

describe("conditional", () => {
  test("compareCondition covers modes 0-6 and case sensitivity", () => {
    expect(compareCondition("A", 0, "a", false)).toBe(true);
    expect(compareCondition("A", 0, "a", true)).toBe(false);
    expect(compareCondition("A", 1, "b", false)).toBe(true);
    expect(compareCondition("9", 2, "10", false)).toBe(true);
    expect(compareCondition("b", 2, "a", false)).toBe(false);
    expect(compareCondition("10", 3, "9", false)).toBe(true);
    expect(compareCondition("ABC", 4, "^a", false)).toBe(true);
    expect(compareCondition("ABC", 4, "^a", true)).toBe(false);
    expect(compareCondition("5", 5, "5", false)).toBe(true);
    expect(compareCondition("4", 6, "5", false)).toBe(false);
    expect(() => compareCondition("a", 9, "b", false)).toThrow("unknown match mode 9");
  });

  const conditional = workflow(
    [
      KEYWORD,
      [
        "C",
        "utility.conditional",
        {
          conditions: [
            { inputstring: "{query}", matchmode: 0, matchstring: "yes", uid: "C1" },
            { inputstring: "{var:n}", matchmode: 3, matchstring: "5", uid: "C2" },
          ],
        },
      ],
      COPY("ONE", "one"),
      COPY("TWO", "two"),
      COPY("ELSE", "else"),
    ],
    [
      ["IN", "C"],
      ["C", "ONE", { sourceoutputuid: "C1" }],
      ["C", "TWO", { sourceoutputuid: "C2" }],
      ["C", "ELSE"],
    ],
  );

  test("routes the first matching condition", async () => {
    const first = host();
    await run(conditional, first, { input: "YES", variables: { n: "9" } });
    expect(first.calls).toEqual([["clipboard.copy", { text: "one" }]]);
    const second = host();
    await run(conditional, second, { input: "no", variables: { n: "9" } });
    expect(second.calls).toEqual([["clipboard.copy", { text: "two" }]]);
  });

  test("falls back to the else branch", async () => {
    const h = host();
    await run(conditional, h, { input: "no", variables: { n: "1" } });
    expect(h.calls).toEqual([["clipboard.copy", { text: "else" }]]);
  });
});

describe("dialog", () => {
  const nodes: Node[] = [
    KEYWORD,
    ["D", "utility.dialog", { title: "Sure?", text: "{query}", button1: "OK", button2: "Cancel" }],
    COPY("OK", "ok"),
    COPY("NO", "no"),
  ];

  test("routes by button output", async () => {
    const wf = workflow(nodes, [
      ["IN", "D"],
      ["D", "OK", { sourceoutputuid: "button1" }],
      ["D", "NO", { sourceoutputuid: "button2" }],
    ]);
    const seen: unknown[] = [];
    const h = host({
      showDialog: async (dialog) => {
        seen.push(dialog);
        return 1;
      },
    });
    await run(wf, h);
    expect(seen).toEqual([{ title: "Sure?", text: "Hello World", buttons: ["OK", "Cancel"] }]);
    expect(h.calls).toEqual([["clipboard.copy", { text: "no" }]]);
  });

  test("single output continues for any button; dismissal stops", async () => {
    const wf = workflow(nodes, [
      ["IN", "D"],
      ["D", "OK"],
    ]);
    const any = host({ showDialog: async () => 1 });
    await run(wf, any);
    expect(any.calls).toEqual([["clipboard.copy", { text: "ok" }]]);
    const dismissed = host({ showDialog: async () => undefined });
    await run(wf, dismissed);
    expect(dismissed.calls).toEqual([]);
  });

  test("hosts without dialogs get a named warning", async () => {
    const h = host();
    delete (h as Partial<GraphHost>).showDialog;
    const result = await run(workflow(nodes, [["IN", "D"]]), h);
    expect(result.warnings).toEqual([
      "alfred: alfred.workflow.utility.dialog (D) failed: this host cannot show dialogs",
    ]);
  });
});

describe("actions", () => {
  test("script output becomes the next argument", async () => {
    const h = host({
      script: (request) => ({ stdout: `out:${String(request.query)}`, exitCode: 0 }),
    });
    await run(
      workflow(
        [KEYWORD, ["S", "action.script", { type: 0, script: "x" }], COPY()],
        [
          ["IN", "S"],
          ["S", "COPY"],
        ],
      ),
      h,
      { variables: { s: "1" } },
    );
    expect(h.calls).toEqual([
      ["script", { query: "Hello World", variables: { s: "1" } }],
      ["clipboard.copy", { text: "out:Hello World" }],
    ]);
  });

  test("script alfredworkflow JSON sets arg, variables and config", async () => {
    const h = host({
      script: () => ({
        stdout:
          '{"alfredworkflow":{"arg":["a","b"],"variables":{"x":"1"},"config":{"clipboardtext":"{var:x}:{query}"}}}',
        exitCode: 0,
      }),
    });
    await run(
      workflow(
        [KEYWORD, ["S", "action.script"], COPY()],
        [
          ["IN", "S"],
          ["S", "COPY"],
        ],
      ),
      h,
    );
    expect(h.calls[1]).toEqual(["clipboard.copy", { text: "1:a\tb" }]);
  });

  test("a failing script warns and still passes its output on", async () => {
    const h = host({ script: () => ({ stdout: "partial", stderr: "boom\n", exitCode: 2 }) });
    const result = await run(
      workflow(
        [KEYWORD, ["S", "action.script"], COPY()],
        [
          ["IN", "S"],
          ["S", "COPY"],
        ],
      ),
      h,
    );
    expect(result.warnings).toEqual(["alfred: script S exited with 2: boom"]);
    expect(h.calls[1]).toEqual(["clipboard.copy", { text: "partial" }]);
  });

  test("openurl encodes placeholders, keeps a bare {query} URL, names the browser", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          ["U1", "action.openurl", { url: "https://s.test/?q={query}&v={var:base}", spaces: "+" }],
          ["U2", "action.openurl", { url: "{query}", browser: "com.example.browser" }],
          ["U3", "action.openurl", { url: "https://s.test/{query}", skipqueryencode: true }],
        ],
        [
          ["IN", "U1"],
          ["IN", "U2"],
          ["IN", "U3"],
        ],
      ),
      h,
      { input: "https://a.test/x y" },
    );
    expect(h.calls).toEqual([
      ["open.url", { url: "https://s.test/?q=https%3A%2F%2Fa.test%2Fx+y&v=workflow" }],
      ["open.url", { url: "https://a.test/x y", application: "com.example.browser" }],
      ["open.url", { url: "https://s.test/https://a.test/x y" }],
    ]);
  });

  test("openfile and revealfile resolve ~ and each argument", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          ["O", "action.openfile", { openwith: "Editor" }],
          ["S", "action.openfile", { sourcefile: "~/{var:base}.txt" }],
          ["R", "action.revealfile"],
        ],
        [
          ["IN", "O"],
          ["IN", "S"],
          ["IN", "R"],
        ],
      ),
      h,
      { input: ["~/a", "/b"], homeDir: "/home/u" },
    );
    expect(h.calls).toEqual([
      ["open.path", { path: "/home/u/a", application: "Editor" }],
      ["open.path", { path: "/b", application: "Editor" }],
      ["open.path", { path: "/home/u/workflow.txt" }],
      ["finder.show", { path: "/home/u/a" }],
      ["finder.show", { path: "/b" }],
    ]);
  });

  test("a denied capability stops the branch with a warning", async () => {
    const h = host({
      request: async () => {
        throw new Error("denied: open.url");
      },
    });
    const result = await run(workflow([KEYWORD, ["U", "action.openurl"]], [["IN", "U"]]), h);
    expect(result.warnings).toEqual([
      "alfred: alfred.workflow.action.openurl (U) failed: denied: open.url",
    ]);
  });
});

describe("outputs", () => {
  let dir = "";
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "blast-alfred-graph-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("clipboard copy, paste, transient and {clipboard}", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          COPY("C1", "{clipboard:1} {date} {random:x,y} {uuid}"),
          [
            "C2",
            "output.clipboard",
            { clipboardtext: "{query}", autopaste: true, transient: true },
          ],
          [
            "C3",
            "output.clipboard",
            { clipboardtext: "{clipboard}", ignoredynamicplaceholders: true },
          ],
        ],
        [
          ["IN", "C1"],
          ["IN", "C2"],
          ["IN", "C3"],
        ],
      ),
      h,
    );
    expect(h.calls).toEqual([
      ["clipboard.read", { offset: 1 }],
      ["clipboard.copy", { text: "clip1 2026-01-02 x UUID" }],
      ["clipboard.paste", { text: "Hello World", concealed: true }],
      ["clipboard.copy", { text: "{clipboard}" }],
    ]);
  });

  test("notification and large type", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          ["N", "output.notification", { title: "{const:alfred_workflow_name}" }],
          ["L", "output.largetype", { text: "big {query}" }],
        ],
        [
          ["IN", "N"],
          ["IN", "L"],
        ],
      ),
      h,
    );
    expect(h.calls).toEqual([
      ["notification", { title: "Graph", text: "Hello World" }],
      ["largetype", "big Hello World"],
    ]);
  });

  test("writefile overwrite, skip, append, folders, uuid and empty files", async () => {
    const write = (config: Record<string, PlistValue>, input: string, extra = {}) => {
      const h = host();
      return run(
        workflow(
          [KEYWORD, ["W", "output.writefile", config], COPY()],
          [
            ["IN", "W"],
            ["W", "COPY"],
          ],
        ),
        h,
        { input, homeDir: dir, ...extra },
      ).then((result) => ({ result, calls: h.calls }));
    };
    const file = join(dir, "out.txt");
    await write({ filename: file, type: 0 }, "one");
    await write({ filename: file, type: 0 }, "two");
    expect(await readFile(file, "utf8")).toBe("two");
    await write({ filename: file, type: 1 }, "three");
    expect(await readFile(file, "utf8")).toBe("two");
    await write({ filename: file, type: 2 }, "+four");
    expect(await readFile(file, "utf8")).toBe("two+four");

    const nested = await write(
      { filename: "deep/{var:base}.txt", createintermediatefolders: true, relativepathmode: 0 },
      "x",
    );
    expect(await readFile(join(dir, "deep", "workflow.txt"), "utf8")).toBe("x");
    expect(nested.calls).toEqual([["clipboard.copy", { text: join(dir, "deep", "workflow.txt") }]]);

    await write({ filename: "data.txt", relativepathmode: 1 }, "d", { supportPath: dir });
    expect(await readFile(join(dir, "data.txt"), "utf8")).toBe("d");

    await write({ filename: "~/id.md", adduuid: true }, "u");
    expect(await readFile(join(dir, "id UUID.md"), "utf8")).toBe("u");

    await write({ filename: "empty.txt" }, "");
    await expect(readFile(join(dir, "empty.txt"))).rejects.toThrow();
    await write({ filename: "empty.txt", allowemptyfiles: true }, "");
    expect(await readFile(join(dir, "empty.txt"), "utf8")).toBe("");

    const missing = await write({ filename: "nope/x.txt" }, "x");
    expect(missing.result.warnings[0]).toMatch(/output\.writefile \(W\) failed: ENOENT/);
  });

  test("writefile without a filename warns", async () => {
    await writeFile(join(dir, "unused"), "");
    const result = await run(workflow([KEYWORD, ["W", "output.writefile"]], [["IN", "W"]]), host());
    expect(result.warnings).toEqual([
      "alfred: alfred.workflow.output.writefile (W) failed: Write Text File has no filename",
    ]);
  });
});

describe("external triggers", () => {
  test("call an External Trigger with arguments and variables", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          ["ARG", "utility.argument", { variables: { kept: "yes" } }],
          [
            "CALL",
            "output.callexternaltrigger",
            { externaltriggerid: "next", passvariables: true },
          ],
          [
            "CALL2",
            "output.callexternaltrigger",
            {
              externaltriggerid: "next",
              workflowbundleid: "self",
              passinputasargument: false,
              argument: "custom {query}",
            },
          ],
          ["T", "trigger.external", { triggerid: "next" }],
          COPY("COPY", "{query}|{var:kept}"),
        ],
        [
          ["IN", "ARG"],
          ["ARG", "CALL"],
          ["ARG", "CALL2"],
          ["T", "COPY"],
        ],
      ),
      h,
    );
    expect(h.calls).toEqual([
      ["clipboard.copy", { text: "Hello World|yes" }],
      ["clipboard.copy", { text: "custom Hello World|" }],
    ]);
  });

  test("targets objects by inboundconfig.externalid", async () => {
    const h = host();
    await run(
      workflow(
        [
          KEYWORD,
          ["CALL", "output.callexternaltrigger", { externaltriggerid: "show" }],
          [
            "SF",
            "input.scriptfilter",
            { keyword: "sf" },
            { inboundconfig: { externalid: "show" } },
          ],
        ],
        [["IN", "CALL"]],
      ),
      h,
    );
    expect(h.calls).toEqual([
      ["view", { uid: "SF", input: "Hello World", variables: {}, configOverrides: {} }],
    ]);
  });

  test("loops stop at maxSteps", async () => {
    const h = host();
    const result = await run(
      workflow(
        [
          ["T", "trigger.external", { triggerid: "again" }],
          ["CALL", "output.callexternaltrigger", { externaltriggerid: "again" }],
        ],
        [["T", "CALL"]],
      ),
      h,
      { start: "T", maxSteps: 10 },
    );
    expect(result.steps).toBe(10);
    expect(result.stepLimitReached).toBe(true);
    expect(result.warnings).toEqual(["alfred: stopped after 10 steps; the workflow may loop"]);
  });

  test("unknown triggers and other workflows fail with a named reason", async () => {
    const result = await run(
      workflow(
        [
          KEYWORD,
          ["A", "output.callexternaltrigger", { externaltriggerid: "missing" }],
          [
            "B",
            "output.callexternaltrigger",
            { externaltriggerid: "x", workflowbundleid: "com.other" },
          ],
        ],
        [
          ["IN", "A"],
          ["IN", "B"],
        ],
      ),
      host(),
    );
    expect(result.warnings).toEqual([
      'alfred: alfred.workflow.output.callexternaltrigger (A) failed: no External Trigger named "missing"',
      "alfred: alfred.workflow.output.callexternaltrigger (B) failed: triggers in other workflows (com.other) are not supported",
    ]);
  });
});

describe("traversal", () => {
  test("hands interactive objects to the host with overrides and stops", async () => {
    const h = host();
    const result = await run(
      workflow(
        [
          KEYWORD,
          [
            "JSON",
            "utility.json",
            { json: '{"alfredworkflow":{"variables":{"v":"1"},"config":{"keyword":"z"}}}' },
          ],
          ["SF", "input.scriptfilter"],
          ["LF", "input.listfilter"],
          ["TXT", "userinterface.text"],
          ["GRID", "userinterface.grid"],
          COPY(),
        ],
        [
          ["IN", "JSON"],
          ["JSON", "SF"],
          ["SF", "COPY"],
          ["IN", "LF"],
          ["IN", "TXT"],
          ["IN", "GRID"],
        ],
      ),
      h,
    );
    expect(h.calls).toEqual([
      [
        "view",
        {
          uid: "SF",
          input: "Hello World",
          variables: { v: "1" },
          configOverrides: { keyword: "z" },
        },
      ],
      ["view", { uid: "LF", input: "Hello World", variables: {}, configOverrides: {} }],
      ["view", { uid: "TXT", input: "Hello World", variables: {}, configOverrides: {} }],
      ["view", { uid: "GRID", input: "Hello World", variables: {}, configOverrides: {} }],
    ]);
    expect(result.views.map((view) => view.object.uid)).toEqual(["SF", "LF", "TXT", "GRID"]);
  });

  test("unsupported objects warn and stop only their branch", async () => {
    const h = host();
    const result = await run(
      workflow(
        [
          KEYWORD,
          ["X", "action.terminalcommand"],
          ["Y", "com.vendor.custom"],
          COPY(),
          COPY("AFTER", "after"),
        ],
        [
          ["IN", "X"],
          ["X", "AFTER"],
          ["IN", "Y"],
          ["IN", "COPY"],
          ["IN", "GHOST"],
        ],
      ),
      h,
    );
    expect(h.calls).toEqual([["clipboard.copy", { text: "Hello World" }]]);
    expect(result.warnings).toEqual([
      "alfred: alfred.workflow.action.terminalcommand (X) is not supported; that branch stops here",
      "alfred: com.vendor.custom (Y) is not supported; that branch stops here",
      "alfred: connection points at missing object GHOST",
    ]);
    expect(h.logs).toEqual(result.warnings.map((warning) => `warn: ${warning}`));
  });

  test("entry modifiers select connections; disabled ones are skipped; vitoclose is tracked", async () => {
    const wf = workflow(
      [
        KEYWORD,
        COPY("PLAIN", "plain"),
        COPY("CMD", "cmd"),
        COPY("OFF", "off"),
        COPY("NEXT", "next"),
      ],
      [
        ["IN", "PLAIN"],
        ["IN", "CMD", { modifiers: 1 << 20, vitoclose: true }],
        ["IN", "OFF", { disabled: true }],
        ["CMD", "NEXT"],
      ],
    );
    const plain = host();
    const plainResult = await run(wf, plain);
    expect(plain.calls).toEqual([["clipboard.copy", { text: "plain" }]]);
    expect(plainResult.vitoclose).toBe(false);

    const cmd = host();
    const cmdResult = await run(wf, cmd, { modifiers: 1 << 20 });
    expect(cmd.calls).toEqual([
      ["clipboard.copy", { text: "cmd" }],
      ["clipboard.copy", { text: "next" }],
    ]);
    expect(cmdResult.vitoclose).toBe(true);
  });

  test("a missing start object is reported", async () => {
    const result = await run(workflow([KEYWORD], []), host(), { start: "NOPE" });
    expect(result.warnings).toEqual(["alfred: start object NOPE does not exist"]);
    expect(result.steps).toBe(0);
  });

  test("an aborted signal stops before any object runs", async () => {
    const h = host();
    const result = await run(workflow([KEYWORD, COPY()], [["IN", "COPY"]]), h, {
      signal: AbortSignal.abort(),
    });
    expect(result).toMatchObject({ aborted: true, steps: 0 });
    expect(h.calls).toEqual([]);
  });
});
