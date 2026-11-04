/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session } from "@blastlauncher/host";
import type { SceneMessage } from "@blastlauncher/protocol";
import { App } from "./app.tsx";
import { openCommand } from "./session.ts";
import { waitForFrame, waitScene } from "./test-support.ts";
import { renderMarkdownLines } from "./markdown.tsx";

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

test("markdown renderer keeps terminal syntax readable", () => {
  const lines = renderMarkdownLines(
    "# Heading\n**bold** and *emphasis* with `code`\n- item\n> quote\n[docs](https://example.com)\n```\nconst x = 1;\n```",
  );
  expect(lines.map((line) => line.segments.map((segment) => segment.text).join(""))).toEqual([
    "Heading",
    "bold and emphasis with code",
    "• item",
    "│ quote",
    "docs (https://example.com)",
    "│ ",
    "│ const x = 1;",
  ]);
  expect(lines[0]?.kind).toBe("heading");
  expect(lines[1]?.segments.map((segment) => segment.style)).toEqual([
    "emphasis",
    "plain",
    "emphasis",
    "plain",
    "code",
  ]);
});

test("look: detail markdown and icons render as terminal-native text", async () => {
  const scene: SceneMessage = {
    type: "scene",
    revision: 1,
    root: {
      id: "detail",
      type: "Detail",
      props: { navigationTitle: "Notes", markdown: "# Heading\n**bold** [docs](https://example.com)" },
      children: [],
    },
  };
  const session = {
    latestScene: scene,
    scenes: () => () => {},
    sendEvent: () => {},
    logs: [],
    onLog: () => () => {},
    exited: new Promise<{ code: number; signal: null }>(() => {}),
    sendProvider: () => {},
  } as unknown as Session;
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 80,
    height: 15,
    exitOnCtrlC: false,
  });
  try {
    await waitForFrame(terminal, (frame) =>
      ["Heading", "bold", "docs", "https://example.com"].every((value) => frame.includes(value)),
    );
  } finally {
    await act(async () => terminal.dispose());
  }
});

test("look: empty view, unsupported nodes, and runtime log hint are deliberate", async () => {
  const scene: SceneMessage = {
    type: "scene",
    revision: 1,
    root: {
      id: "list",
      type: "List",
      props: { navigationTitle: "Empty" },
      children: [
        { id: "empty", type: "List.EmptyView", props: { title: "Nothing here", description: "Try again", icon: "calendar-16" }, children: [] },
      ],
    },
  };
  let logListener: ((log: { message: string }) => void) | undefined;
  const session = {
    latestScene: scene,
    scenes: () => () => {},
    sendEvent: () => {},
    logs: [{ level: "error", message: "last runtime line" }],
    onLog: (listener: (log: { message: string }) => void) => {
      logListener = listener;
      return () => {
        logListener = undefined;
      };
    },
    exited: new Promise<{ code: number; signal: null }>(() => {}),
    sendProvider: () => {},
  } as unknown as Session;
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 80,
    height: 15,
    exitOnCtrlC: false,
  });
  try {
    await waitForFrame(terminal, (frame) =>
      ["Nothing here", "Try again", "▣", "Press Esc to quit", "last runtime line"].every((value) =>
        frame.includes(value),
      ),
    );
    logListener?.({ message: "new runtime line" });
    await waitForFrame(terminal, (frame) => frame.includes("new runtime line"));
  } finally {
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

  const mockSession = {
    latestScene: failureScene,
    scenes: () => () => {},
    sendEvent: () => {},
    logs: [],
    exited: new Promise<{ code: number; signal: null }>(() => {}),
    sendProvider: () => {},
  } as unknown as Session;

  const terminal = await testRender(<App session={mockSession} onQuit={() => {}} />, {
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
