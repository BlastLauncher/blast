// A typing game in the shape of Raytyping (`fixtures/scenes/raytyping.json`):
// the extension owns the search text, reads every keystroke, shows its state
// in the selected item's detail, and clears the field when a round ends.
// @covers List.Props.searchText
// @covers List.Props.searchBarPlaceholder
// @covers List.Props.isShowingDetail
// @covers List.Item.Detail.Props.markdown
// @covers List.Item.Detail.Props.metadata
// @covers List.Item.Detail.Metadata.Label.Props.text
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { createController } from "./controller.ts";

const fixture = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../fixtures/scenes/raytyping.json"), "utf8"),
) as SceneMessage;

let revision = 1;
/** The fixture with the game's state replaced, as the extension re-renders it. */
function game(searchText: string, markdown: string, metadata?: [string, string][]): SceneMessage {
  const visit = (node: SceneNode): SceneNode => {
    const children = node.children.map(visit);
    if (node.type === "List") return { ...node, props: { ...node.props, searchText }, children };
    if (node.type !== "List.Item.Detail") return { ...node, children };
    const labels = (metadata ?? []).map(([title, value], index) => ({
      id: `label-${index}`,
      type: "List.Item.Detail.Metadata.Label",
      props: { title, text: { color: "raycast-green", value } },
      children: [],
    }));
    return {
      ...node,
      props: { ...node.props, markdown },
      children: metadata
        ? [
            {
              id: "metadata",
              type: "Slot",
              props: { name: "metadata" },
              children: [
                { id: "meta", type: "List.Item.Detail.Metadata", props: {}, children: labels },
              ],
            },
          ]
        : [],
    };
  };
  return { ...fixture, revision: ++revision, root: visit(fixture.root!) };
}

test("the game's placeholder, row and detail are in the view while typed text never filters it", () => {
  const controller = createController({ platform: "Linux" });
  controller.scene(fixture);
  const view = controller.view();
  expect(view.kind).toBe("list");
  expect(view.search).toEqual({ text: "red f", placeholder: "Type here" });
  expect(view.loading).toBe(true);
  // `onSearchTextChange` turns client filtering off: the typed text is the game's input.
  expect(view.rows.map((row) => row.title)).toEqual(["42 wpm"]);
  expect(view.detail).toBe("**red f**ox jumps over");
  expect(view.dropdown?.label).toBe("10 words");
});

test("fast typing outruns the echoes; the round's end clears the field and shows the metadata", () => {
  const controller = createController({ platform: "Linux" });
  controller.scene(game("", "red fox"));
  const typed = ["r", "re", "red", "red ", "red f", "red fo", "red fox"];
  for (const text of typed) {
    const result = controller.input({ type: "search", text });
    expect(result.events).toEqual([{ node: "13", handler: "onSearchTextChange", args: [text] }]);
  }
  // Echoes of earlier keystrokes arrive after the visitor typed on.
  controller.scene(game("r", "**r**ed fox"));
  controller.scene(game("red", "**red** fox"));
  expect(controller.view().search.text).toBe("red fox");
  // The echo of the last keystroke, then the extension ends the round.
  controller.scene(game("red fox", "**red fox**"));
  controller.scene(
    game("", "You are super, to reload press **Enter**", [
      ["Speed", "42 wpm"],
      ["Accuracy", "100 %"],
    ]),
  );
  const view = controller.view();
  expect(view.search.text).toBe("");
  expect(view.detail).toBe(
    "You are super, to reload press **Enter**\nSpeed: 42 wpm\nAccuracy: 100 %",
  );
});
