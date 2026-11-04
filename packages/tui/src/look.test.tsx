/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { RGBA } from "@opentui/core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session } from "@blastlauncher/host";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { App } from "./app.tsx";
import { openCommand } from "./session.ts";
import { waitForFrame, waitScene } from "./test-support.ts";
import { theme } from "./theme.ts";

type MockLog = { level: "info" | "warn" | "error"; message: string };
type MockExit = { code: number | null; signal: NodeJS.Signals | null; error?: Error };

/** A session stand-in: one scene, captured logs and a controllable exit. */
function mockSession(
  scene: SceneMessage | undefined,
  options: { logs?: MockLog[]; exit?: MockExit } = {},
) {
  const logs: MockLog[] = options.logs ?? [];
  const listeners = new Set<(log: MockLog) => void>();
  const session = {
    latestScene: scene,
    scenes: () => () => {},
    sendEvent: () => {},
    sendProvider: () => {},
    logs,
    onLog: (callback: (log: MockLog) => void) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    exited: options.exit ? Promise.resolve(options.exit) : new Promise<never>(() => {}),
    shutdown: async () => ({ code: 0, signal: null }),
  } as unknown as Session;
  return {
    session,
    log: (message: string, level: MockLog["level"] = "info") => {
      const entry = { level, message };
      logs.push(entry);
      for (const listener of listeners) listener(entry);
    },
  };
}

const node = (
  type: string,
  id: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ type, id, props, children });

const sceneOf = (root: SceneNode): SceneMessage => ({ type: "scene", revision: 1, root });

/** The span whose text contains `needle`, for colour and attribute assertions. */
function spanWith(
  terminal: Awaited<ReturnType<typeof testRender>>,
  needle: string,
): { fg: RGBA } | undefined {
  for (const line of terminal.captureSpans().lines)
    for (const span of line.spans) if (span.text.includes(needle)) return span;
  return undefined;
}

test("look: 80x24 renders rounded frame, search bar, list row accessories, footer shortcuts, and action panel", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-look-80-"));
  const fixturePath = new URL("../../../fixtures/extensions/list-extras", import.meta.url).pathname;
  const opened = await openCommand(fixturePath, "index", { dataDir });

  try {
    await waitScene(opened.session, (scene) => JSON.stringify(scene).includes("beer"));
    const terminal = await testRender(<App session={opened.session} onQuit={() => {}} />, {
      width: 80,
      height: 24,
      exitOnCtrlC: false,
    });

    try {
      await waitForFrame(terminal, (frame) => frame.includes("beer"));
      const frame = terminal.captureCharFrame();

      // Top-left corner glyph ╭ appears in the frame
      expect(frame).toContain("╭");

      // Selected row title and its right-aligned accessory are rendered on the same line
      const lines = frame.split("\n");
      const selectedLine = lines.find((l) => l.includes("›") && l.includes("beer"));
      expect(selectedLine).toBeDefined();
      expect(selectedLine).toContain("Germany");

      // Verify the look with captureSpans: selected row subtitle has different fg from title
      const { lines: spanLines } = terminal.captureSpans();
      const beerLine = spanLines.find((line) => line.spans.some((s) => s.text.includes("beer")));
      const titleSpan = beerLine?.spans.find((s) => s.text.includes("beer"));
      const subtitleSpan = beerLine?.spans.find((s) => s.text.includes("Germany"));
      expect(titleSpan).toBeDefined();
      expect(subtitleSpan).toBeDefined();
      expect(subtitleSpan!.fg.toString()).not.toEqual(titleSpan!.fg.toString());

      // Footer contains ↵ and ^K
      expect(frame).toContain("↵");
      expect(frame).toContain("^K");

      // Action panel shows a bordered box with right-aligned shortcut
      await act(async () => {
        terminal.mockInput.pressKey("k", { ctrl: true });
      });
      await waitForFrame(terminal, (f) => f.includes("Filter actions"));
      const actionFrame = terminal.captureCharFrame();
      expect(actionFrame).toContain("╭─Actions");
      const actionLines = actionFrame.split("\n");
      const deleteLine = actionLines.find((l) => l.includes("Delete beer"));
      expect(deleteLine).toBeDefined();
      expect(deleteLine).toContain("↵");
    } finally {
      await act(async () => terminal.dispose());
    }
  } finally {
    await opened.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}, 30_000);

test("look: Detail renders headings, emphasis, lists, quotes, code and dimmed link URLs", async () => {
  const markdown = [
    "# Heading",
    "**bold** and *italic* with `code`",
    "- bullet",
    "> quoted",
    "```",
    "const x = 1;",
    "```",
    "[docs](https://example.com)",
  ].join("\n");
  const { session } = mockSession(
    sceneOf(node("Detail", "detail", { navigationTitle: "Notes", markdown })),
  );
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 80,
    height: 24,
    exitOnCtrlC: false,
  });
  try {
    const frame = await waitForFrame(
      terminal,
      (f) =>
        ["Heading", "bold", "italic", "code", "• bullet", "│ quoted", "const x = 1;"].every(
          (value) => f.includes(value),
        ) && f.includes("docs (https://example.com)"),
    );
    expect(frame).not.toContain("**");
    expect(frame).not.toContain("```");

    const heading = spanWith(terminal, "Heading");
    const link = spanWith(terminal, "docs");
    const url = spanWith(terminal, "https://example.com");
    expect(heading?.fg.equals(RGBA.fromHex(theme.colors.accent))).toBe(true);
    expect(link?.fg.equals(RGBA.fromHex(theme.colors.accent))).toBe(true);
    expect(url?.fg.equals(RGBA.fromHex(theme.colors.textMuted))).toBe(true);
    expect(url?.fg.equals(link!.fg)).toBe(false);
  } finally {
    await act(async () => terminal.dispose());
  }
});

test("look: List.Item.Detail markdown and tinted icons render beside the list", async () => {
  const { session } = mockSession(
    sceneOf(
      node("List", "list", { navigationTitle: "Notes", isShowingDetail: true }, [
        node(
          "List.Item",
          "readme",
          { title: "Readme", icon: { source: "star-16", tintColor: "raycast-red" } },
          [
            node("Slot", "detail-slot", { name: "detail" }, [
              node("List.Item.Detail", "detail", {
                markdown: "## Notes\nSee [site](https://x.dev)",
              }),
            ]),
          ],
        ),
      ]),
    ),
  );
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 80,
    height: 20,
    exitOnCtrlC: false,
  });
  try {
    await waitForFrame(
      terminal,
      (f) => f.includes("Readme") && f.includes("Notes") && f.includes("site (https://x.dev)"),
    );
    const star = spanWith(terminal, "★");
    expect(star).toBeDefined();
    expect(star!.fg.equals(RGBA.fromHex(theme.colors.danger))).toBe(true);
  } finally {
    await act(async () => terminal.dispose());
  }
});

test("look: EmptyView shows icon, title and description; a bare empty list says No results", async () => {
  const emptyList = mockSession(
    sceneOf(
      node("List", "list", { navigationTitle: "Empty" }, [
        node("List.EmptyView", "empty", {
          title: "Nothing here",
          description: "Add a note to get started",
          icon: "calendar-16",
        }),
      ]),
    ),
  );
  const listTerminal = await testRender(<App session={emptyList.session} onQuit={() => {}} />, {
    width: 80,
    height: 15,
    exitOnCtrlC: false,
  });
  try {
    await waitForFrame(
      listTerminal,
      (f) => f.includes("▦") && f.includes("Nothing here") && f.includes("Add a note"),
    );
  } finally {
    await act(async () => listTerminal.dispose());
  }

  const bare = mockSession(sceneOf(node("List", "bare", { navigationTitle: "Bare" }, [])));
  const bareTerminal = await testRender(<App session={bare.session} onQuit={() => {}} />, {
    width: 80,
    height: 15,
    exitOnCtrlC: false,
  });
  try {
    await waitForFrame(bareTerminal, (f) => f.includes("No results"));
  } finally {
    await act(async () => bareTerminal.dispose());
  }

  const emptyGrid = mockSession(
    sceneOf(
      node("Grid", "grid", { navigationTitle: "Grid" }, [
        node("Grid.EmptyView", "grid-empty", {
          title: "No shortcuts",
          description: "Try another search",
          icon: "star-16",
        }),
      ]),
    ),
  );
  const gridTerminal = await testRender(<App session={emptyGrid.session} onQuit={() => {}} />, {
    width: 80,
    height: 15,
    exitOnCtrlC: false,
  });
  try {
    await waitForFrame(
      gridTerminal,
      (f) => f.includes("★") && f.includes("No shortcuts") && f.includes("Try another search"),
    );
  } finally {
    await act(async () => gridTerminal.dispose());
  }
});

test("look: loading uses one consistent indicator", async () => {
  const { session } = mockSession(
    sceneOf(
      node("List", "list", { navigationTitle: "Fetch", isLoading: true }, [
        node("List.Item", "item", { title: "Loaded row" }),
      ]),
    ),
  );
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 80,
    height: 15,
    exitOnCtrlC: false,
  });
  try {
    await waitForFrame(terminal, (f) => f.includes("◌ Loading…"));
    const lines = terminal
      .captureCharFrame()
      .split("\n")
      .filter((line) => line.includes("Loading"));
    expect(lines).toHaveLength(1);
  } finally {
    await act(async () => terminal.dispose());
  }
});

test("look: form descriptions, separators and links are plain non-focusable text", async () => {
  const { session } = mockSession(
    sceneOf(
      node("Form", "form", { navigationTitle: "Details" }, [
        node("Form.Description", "description", { title: "Help", text: "Enter a value" }),
        node("Form.Separator", "separator"),
        node("Form.TextField", "value", { title: "Value", value: "" }),
        node("Slot", "search", { name: "searchBarAccessory" }, [
          node("Form.LinkAccessory", "link", { text: "Docs", target: "https://example.test" }),
        ]),
      ]),
    ),
  );
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 100,
    height: 15,
    exitOnCtrlC: false,
  });
  try {
    await waitForFrame(terminal, (frame) => frame.includes("Enter a value"));
    const frame = terminal.captureCharFrame();
    expect(frame).toContain("Enter a value");
    expect(frame).toContain("────────");
    expect(frame).toContain("Docs  https://example.test");
    expect(frame).not.toContain("› Help");
  } finally {
    await act(async () => terminal.dispose());
  }
});

test("look: a failed command shows its message, the last log line and back hint", async () => {
  const { session } = mockSession(
    sceneOf(
      node("List", "list", { navigationTitle: "Crash" }, [
        node("List.Item", "item", { title: "Row" }),
      ]),
    ),
    {
      logs: [
        { level: "info", message: "starting up" },
        { level: "error", message: "warn: slow\nboom failure" },
      ],
      exit: { code: null, signal: null, error: new Error("Runtime blew up") },
    },
  );
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 80,
    height: 20,
    exitOnCtrlC: false,
  });
  try {
    const frame = await waitForFrame(
      terminal,
      (f) =>
        f.includes("Runtime blew up") &&
        f.includes("Last log: boom failure") &&
        f.includes("Press Esc/B to go back"),
    );
    expect(frame).not.toContain("warn: slow");
  } finally {
    await act(async () => terminal.dispose());
  }
});

test("look: unknown node types show a dimmed notice, not the raw placeholder", async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  const { session } = mockSession(
    sceneOf(
      node("List", "list", { navigationTitle: "Mixed" }, [
        node("List.Item", "known", { title: "Known view" }),
        node("Future", "future"),
      ]),
    ),
  );
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 80,
    height: 15,
    exitOnCtrlC: false,
  });
  try {
    const frame = await waitForFrame(
      terminal,
      (f) => f.includes("Known view") && f.includes("Unsupported view: Future"),
    );
    expect(frame).not.toContain("[Unsupported:");
    expect(
      spanWith(terminal, "Unsupported view")?.fg.equals(RGBA.fromHex(theme.colors.textMuted)),
    ).toBe(true);
    // The raw marker survives in the process log even though the frame is terse.
    expect(warnings.filter((line) => line.includes("[Unsupported: Future]"))).toHaveLength(1);
  } finally {
    console.warn = originalWarn;
    await act(async () => terminal.dispose());
  }
});

test("look: 60x20 renders without line wrapping wider than terminal width", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-look-60-"));
  const fixturePath = new URL("../../../fixtures/extensions/list-extras", import.meta.url).pathname;
  const opened = await openCommand(fixturePath, "index", { dataDir });

  try {
    await waitScene(opened.session, (scene) => JSON.stringify(scene).includes("beer"));
    const terminal = await testRender(<App session={opened.session} onQuit={() => {}} />, {
      width: 60,
      height: 20,
      exitOnCtrlC: false,
    });

    try {
      await waitForFrame(terminal, (frame) => frame.includes("beer"));
      const frame = terminal.captureCharFrame();

      // Assert that no line in the 60x20 frame exceeds 60 columns
      const lines = frame.split("\n");
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(60);
      }

      // Corner and footer shortcuts still present in compact width
      expect(frame).toContain("╭");
      expect(frame).toContain("↵");
      expect(frame).toContain("^K");
    } finally {
      await act(async () => terminal.dispose());
    }
  } finally {
    await opened.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}, 30_000);

test("look: failure toast renders in the footer using danger styling and text", async () => {
  const failureScene: SceneMessage = {
    type: "scene",
    revision: 1,
    root: {
      id: "root",
      type: "Navigation",
      props: { depth: 1 },
      children: [
        {
          id: "entry",
          type: "Navigation.Entry",
          props: { active: true },
          children: [
            {
              id: "list",
              type: "List",
              props: { navigationTitle: "Toast Look Test" },
              children: [
                {
                  id: "item1",
                  type: "List.Item",
                  props: { title: "Item 1" },
                  children: [],
                },
              ],
            },
          ],
        },
        {
          id: "toast",
          type: "Toast",
          props: { title: "Sync failed", message: "Network timeout", style: "failure" },
          children: [],
        },
      ],
    },
  };

  const toastSession = {
    latestScene: failureScene,
    scenes: () => () => {},
    sendEvent: () => {},
    logs: [],
    exited: new Promise<{ code: number; signal: null }>(() => {}),
    sendProvider: () => {},
  } as unknown as Session;

  const terminal = await testRender(<App session={toastSession} onQuit={() => {}} />, {
    width: 80,
    height: 24,
    exitOnCtrlC: false,
  });

  try {
    await waitForFrame(terminal, (frame) => frame.includes("Sync failed"));
    const frame = terminal.captureCharFrame();

    // Footer contains failure toast style and text
    expect(frame).toContain("failure · Sync failed · Network timeout");
  } finally {
    await act(async () => terminal.dispose());
  }
}, 30_000);
