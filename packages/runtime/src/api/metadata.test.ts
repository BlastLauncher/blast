import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneNode, type SceneSnapshot } from "../reconciler/index.ts";
import { Detail, List } from "./index.ts";

function setup() {
  let scene: SceneSnapshot;
  const root = createSceneRoot({
    publish: (next) => {
      scene = next;
    },
  });
  return { root, latest: () => scene.root! };
}

/** The element rendered for an element-valued prop, e.g. `metadata`. */
function slotted(node: SceneNode, name: string): SceneNode {
  const found = node.children.find((child) => child.type === "Slot" && child.props.name === name);
  expect(found).toBeDefined();
  return found!.children[0]!;
}

// Lives at module scope: it only echoes the click for dispatch assertions.
const tagClicked = () => "clicked";

// @covers Detail.Metadata
// @covers Detail.Metadata.Props
// @covers Detail.Metadata.Props.children
// @covers Detail.Metadata.Label
// @covers Detail.Metadata.Label.Props
// @covers Detail.Metadata.Label.Props.title
// @covers Detail.Metadata.Label.Props.icon
// @covers Detail.Metadata.Label.Props.text
// @covers Detail.Metadata.Label.Props.text.value
// @covers Detail.Metadata.Label.Props.text.color
// @covers Detail.Metadata.Separator
// @covers Detail.Metadata.Separator.Props
// @covers Detail.Metadata.Link
// @covers Detail.Metadata.Link.Props
// @covers Detail.Metadata.Link.Props.title
// @covers Detail.Metadata.Link.Props.target
// @covers Detail.Metadata.Link.Props.text
// @covers Detail.Metadata.TagList
// @covers Detail.Metadata.TagList.Props
// @covers Detail.Metadata.TagList.Props.title
// @covers Detail.Metadata.TagList.Props.children
// @covers Detail.Metadata.TagList.Item
// @covers Detail.Metadata.TagList.Item.Props
// @covers Detail.Metadata.TagList.Item.Props.icon
// @covers Detail.Metadata.TagList.Item.Props.text
// @covers Detail.Metadata.TagList.Item.Props.color
// @covers Detail.Metadata.TagList.Item.Props.onAction
test("renders Detail.Metadata children with the public host paths and dispatches a TagList item", () => {
  const { root, latest } = setup();
  root.render(
    h(Detail, {
      markdown: "# Hello",
      metadata: h(
        Detail.Metadata,
        null,
        h(Detail.Metadata.Label, {
          title: "Type",
          icon: "leaf.png",
          text: { value: "Grass", color: "raycast-green" },
        }),
        h(Detail.Metadata.Label, { title: "Height", text: "70cm" }),
        h(Detail.Metadata.Link, {
          title: "Docs",
          target: "https://example.com/grass",
          text: "example.com",
        }),
        h(Detail.Metadata.Separator),
        h(
          Detail.Metadata.TagList,
          { title: "Tags" },
          h(Detail.Metadata.TagList.Item, {
            icon: "tag.png",
            text: "grass",
            color: { light: "#00ff00", dark: "#008000" },
            onAction: tagClicked,
          }),
        ),
      ),
    }),
  );
  const detail = latest();
  expect(detail.type).toBe("Detail");
  const metadata = slotted(detail, "metadata");
  expect(metadata.type).toBe("Detail.Metadata");
  expect(metadata.props).toEqual({});
  expect(metadata.children.map((child) => child.type)).toEqual([
    "Detail.Metadata.Label",
    "Detail.Metadata.Label",
    "Detail.Metadata.Link",
    "Detail.Metadata.Separator",
    "Detail.Metadata.TagList",
  ]);
  const [coloredLabel, plainLabel, link, separator, tagList] = metadata.children;
  expect(coloredLabel!.props).toEqual({
    title: "Type",
    icon: "leaf.png",
    text: { value: "Grass", color: "raycast-green" },
  });
  expect(plainLabel!.props).toEqual({ title: "Height", text: "70cm" });
  expect(link!.props).toEqual({
    title: "Docs",
    target: "https://example.com/grass",
    text: "example.com",
  });
  expect(separator!.props).toEqual({});
  expect(tagList!.props).toEqual({ title: "Tags" });
  const tag = tagList!.children[0]!;
  expect(tag.type).toBe("Detail.Metadata.TagList.Item");
  expect(tag.props).toEqual({
    icon: "tag.png",
    text: "grass",
    color: { light: "#00ff00", dark: "#008000" },
    onAction: { $handler: "onAction" },
  });
  expect(root.dispatch(tag.id, "onAction", [])).toBe("clicked");
  root.unmount();
});

// @covers List.Item.Detail
// @covers List.Item.Detail.Props
// @covers List.Item.Detail.Props.isLoading
// @covers List.Item.Detail.Props.markdown
// @covers List.Item.Detail.Props.metadata
// @covers List.Item.Detail.Metadata
// @covers List.Item.Detail.Metadata.Props
// @covers List.Item.Detail.Metadata.Props.children
// @covers List.Item.Detail.Metadata.Label
// @covers List.Item.Detail.Metadata.Label.Props
// @covers List.Item.Detail.Metadata.Label.Props.title
// @covers List.Item.Detail.Metadata.Label.Props.icon
// @covers List.Item.Detail.Metadata.Label.Props.text
// @covers List.Item.Detail.Metadata.Label.Props.text.value
// @covers List.Item.Detail.Metadata.Label.Props.text.color
// @covers List.Item.Detail.Metadata.Separator
// @covers List.Item.Detail.Metadata.Separator.Props
// @covers List.Item.Detail.Metadata.Link
// @covers List.Item.Detail.Metadata.Link.Props
// @covers List.Item.Detail.Metadata.Link.Props.title
// @covers List.Item.Detail.Metadata.Link.Props.target
// @covers List.Item.Detail.Metadata.Link.Props.text
// @covers List.Item.Detail.Metadata.TagList
// @covers List.Item.Detail.Metadata.TagList.Props
// @covers List.Item.Detail.Metadata.TagList.Props.title
// @covers List.Item.Detail.Metadata.TagList.Props.children
// @covers List.Item.Detail.Metadata.TagList.Item
// @covers List.Item.Detail.Metadata.TagList.Item.Props
// @covers List.Item.Detail.Metadata.TagList.Item.Props.icon
// @covers List.Item.Detail.Metadata.TagList.Item.Props.text
// @covers List.Item.Detail.Metadata.TagList.Item.Props.color
// @covers List.Item.Detail.Metadata.TagList.Item.Props.onAction
test("renders List.Item.Detail.Metadata under the item's detail Slot", () => {
  const { root, latest } = setup();
  root.render(
    h(
      List,
      { isShowingDetail: true },
      h(List.Item, {
        title: "Bulbasaur",
        detail: h(List.Item.Detail, {
          isLoading: true,
          markdown: "A seed on its back.",
          metadata: h(
            List.Item.Detail.Metadata,
            null,
            h(List.Item.Detail.Metadata.Label, {
              title: "Types",
              icon: "grass.png",
              text: { value: "Grass", color: "raycast-green" },
            }),
            h(List.Item.Detail.Metadata.Label, { title: "Height", text: "70cm" }),
            h(List.Item.Detail.Metadata.Link, {
              title: "Dex",
              target: "https://example.com/bulbasaur",
              text: "example.com",
            }),
            h(List.Item.Detail.Metadata.Separator),
            h(
              List.Item.Detail.Metadata.TagList,
              { title: "Tags" },
              h(List.Item.Detail.Metadata.TagList.Item, {
                icon: "tag.png",
                text: "starter",
                color: "raycast-orange",
                onAction: tagClicked,
              }),
            ),
          ),
        }),
      }),
    ),
  );
  const listItem = latest().children[0]!;
  expect(listItem.type).toBe("List.Item");
  const detail = slotted(listItem, "detail");
  expect(detail.type).toBe("List.Item.Detail");
  expect(detail.props).toEqual({ isLoading: true, markdown: "A seed on its back." });
  const metadata = slotted(detail, "metadata");
  expect(metadata.type).toBe("List.Item.Detail.Metadata");
  expect(metadata.children.map((child) => child.type)).toEqual([
    "List.Item.Detail.Metadata.Label",
    "List.Item.Detail.Metadata.Label",
    "List.Item.Detail.Metadata.Link",
    "List.Item.Detail.Metadata.Separator",
    "List.Item.Detail.Metadata.TagList",
  ]);
  const [coloredLabel, , link, , tagList] = [
    metadata.children[0]!,
    metadata.children[1]!,
    metadata.children[2]!,
    metadata.children[3]!,
    metadata.children[4]!,
  ];
  expect(coloredLabel.props).toEqual({
    title: "Types",
    icon: "grass.png",
    text: { value: "Grass", color: "raycast-green" },
  });
  expect(link.props).toEqual({
    title: "Dex",
    target: "https://example.com/bulbasaur",
    text: "example.com",
  });
  expect(tagList.props).toEqual({ title: "Tags" });
  const tag = tagList.children[0]!;
  expect(tag.type).toBe("List.Item.Detail.Metadata.TagList.Item");
  expect(tag.props).toEqual({
    icon: "tag.png",
    text: "starter",
    color: "raycast-orange",
    onAction: { $handler: "onAction" },
  });
  expect(root.dispatch(tag.id, "onAction", [])).toBe("clicked");
  root.render(h(List.Item.Detail, { markdown: null }));
  expect(latest().props).toEqual({ markdown: null });
  expect(latest().children).toEqual([]);
  root.unmount();
});
