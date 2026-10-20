/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SceneMessage } from "@blastlauncher/protocol";
import { App } from "./app.tsx";
import { openCommand } from "./session.ts";
import { waitForFrame, waitScene } from "./test-support.ts";
import { sceneToView } from "@blastlauncher/client-core";

const view = (scene: SceneMessage | undefined) =>
  sceneToView(scene, { searchText: "", selectedId: null });

const field = (scene: SceneMessage, id: string) =>
  view(scene).list?.children.find((node) => node.props.id === id);

for (const command of ["index", "secret"]) {
  test(`terminal form edits and submits ${command}`, async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "blast-form-tui-"));
    const opened = await openCommand(
      new URL("../../../fixtures/extensions/form", import.meta.url).pathname,
      command,
      { dataDir },
    );
    await waitScene(opened.session, (scene) => view(scene).list?.type === "Form");
    const terminal = await testRender(<App session={opened.session} onQuit={() => {}} />, {
      width: 140,
      height: 35,
      exitOnCtrlC: false,
    });
    const key = async (name: string, ctrl = false, shift = false) => {
      await act(async () => {
        if (name === "tab") terminal.mockInput.pressTab({ shift });
        else if (name === "return") terminal.mockInput.pressEnter({ ctrl });
        else if (name === "right") terminal.mockInput.pressArrow("right");
        else if (name === "space") terminal.mockInput.pressKey(" ");
        else if (name === "backspace") terminal.mockInput.pressBackspace();
        else terminal.mockInput.pressKey(name, { ctrl, shift });
      });
    };
    const type = async (value: string) => {
      await act(async () => {
        await terminal.mockInput.typeText(value);
      });
    };
    const changed = async (
      action: () => Promise<void>,
      predicate: (scene: SceneMessage) => boolean,
    ) => {
      await act(async () => {
        const next = waitScene(opened.session, predicate);
        await action();
        await next;
      });
    };

    try {
      await waitForFrame(terminal, (frame) =>
        frame.includes(command === "index" ? "Fill form" : "Fill secret form"),
      );
      if (command === "index") {
        await changed(
          () => type("Ada"),
          (scene) => field(scene, "name")?.props.value === "Ada",
        );
        await key("tab");
        await waitForFrame(terminal, (frame) => frame.includes("› notes"));
        await key("e", true);
        await key("return");
        await changed(
          () => type("notes"),
          (scene) => field(scene, "notes")?.props.value === "initial\nnotes",
        );
        await key("tab");
        await key("right");
        await changed(
          () => key("space"),
          (scene) => field(scene, "drink")?.props.value === "tea",
        );
        await key("tab");
        await changed(
          () => key("space"),
          (scene) => field(scene, "agree")?.props.value === true,
        );
        await key("tab");
        await type("2024-02-30");
        await waitForFrame(terminal, (frame) => frame.includes("valid ISO date"));
        expect(field(opened.session.latestScene!, "date")?.props.value).toBeNull();
        await key("backspace");
        await key("backspace");
        await changed(
          () => type("29"),
          (scene) => field(scene, "date")?.props.value === "2024-02-29T00:00:00.000Z",
        );
        await changed(
          () => key("s", true),
          (scene) => view(scene).title.includes('"name":"Ada"'),
        );
        expect(JSON.parse(view(opened.session.latestScene).title)).toEqual({
          name: "Ada",
          notes: "initial\nnotes",
          drink: "tea",
          agree: true,
          date: "2024-02-29T00:00:00.000Z",
        });
      } else {
        await key("right");
        await key("space");
        await key("tab");
        const secret = "never-echo-me";
        for (const [index, char] of Array.from(secret).entries()) {
          if (index === 0)
            await changed(
              () => type(char),
              (scene) => field(scene, "password")?.props.hasValue === true,
            );
          else await type(char);
          await waitForFrame(terminal, (frame) => {
            expect(frame).not.toContain(secret.slice(0, 5));
            return frame.includes("••••••••");
          });
        }
        await waitForFrame(terminal, (frame) => frame.includes("••••••••"));
        // A bracketed paste appends to the secret without echoing it.
        await act(async () => {
          await terminal.mockInput.pasteBracketedText("-pasted-part\n");
        });
        await waitForFrame(terminal, (frame) => {
          expect(frame).not.toContain("pasted-part");
          return frame.includes("••••••••");
        });
        expect(JSON.stringify(opened.session.latestScene)).not.toContain(secret);
        await key("k", true);
        await waitForFrame(terminal, (frame) => frame.includes("Filter actions"));
        await changed(
          () => key("return"),
          (scene) => view(scene).title.includes("<set>"),
        );
        expect(JSON.parse(view(opened.session.latestScene).title)).toEqual({
          tags: ["green"],
          password: "<set>",
        });
        await waitForFrame(terminal, (frame) => {
          expect(frame).not.toContain(secret);
          return frame.includes("<set>");
        });
      }
    } finally {
      await act(async () => terminal.dispose());
      await opened.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 30_000);
}

test("terminal drafts restore after close and successful submission clears them", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-form-draft-"));
  try {
    for (const round of [0, 1, 2]) {
      const opened = await openCommand(
        new URL("../../../fixtures/extensions/form", import.meta.url).pathname,
        "persist",
        { dataDir },
      );
      await waitScene(opened.session, (scene) => view(scene).list?.type === "Form");
      const terminal = await testRender(<App session={opened.session} onQuit={() => {}} />, {
        width: 100,
        height: 25,
      });
      try {
        await waitForFrame(terminal, (frame) =>
          frame.includes(round === 1 ? "launch:saved:false" : "launch:none:false"),
        );
        if (round === 0) {
          await act(async () => terminal.mockInput.pressTab());
          await waitForFrame(terminal, (frame) => frame.includes("› draft"));
          await act(async () => {
            const changed = waitScene(
              opened.session,
              (scene) => field(scene, "draft")?.props.value === "saved",
            );
            await terminal.mockInput.typeText("saved");
            await changed;
          });
        } else if (round === 1) {
          expect(field(opened.session.latestScene!, "draft")?.props.value).toBe("saved");
          await act(async () => {
            const changed = waitScene(opened.session, (scene) => view(scene).title === "submitted");
            terminal.mockInput.pressKey("s", { ctrl: true });
            await changed;
          });
        } else expect(field(opened.session.latestScene!, "draft")?.props.value).toBe("");
      } finally {
        await act(async () => terminal.dispose());
        await opened.close();
      }
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}, 30_000);
