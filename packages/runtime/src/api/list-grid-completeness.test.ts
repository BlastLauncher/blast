import { afterEach, expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { Grid, List } from "./index.ts";

afterEach(() => setCapabilityRequester(undefined));

function setup() {
  let scene: SceneSnapshot;
  const root = createSceneRoot({
    publish: (next) => {
      scene = next;
    },
  });
  return { root, latest: () => scene.root! };
}

// @covers List.Props.pagination
// @covers List.Props.pagination.pageSize
// @covers List.Props.pagination.hasMore
// @covers List.Props.pagination.onLoadMore
// @covers List.Props.enableFiltering
// @covers List.Item.Props
// @covers List.Item.Props.title.value
// @covers List.Item.Props.title.tooltip
// @covers List.Item.Props.subtitle.value
// @covers List.Item.Props.subtitle.tooltip
// @covers List.Item.Props.icon.value
// @covers List.Item.Props.icon.tooltip
// @covers List.Item.Props.quickLook
// @covers List.Item.Props.quickLook.name
// @covers List.Item.Props.quickLook.path
// @covers List.Item.Props.accessoryIcon
// @covers List.Item.Props.accessoryTitle
// @covers List.Section.Props
// @covers List.Section.Props.id
test("List pagination dispatches and item tooltip, Quick Look and legacy props survive the scene", () => {
  const { root, latest } = setup();
  let pages = 0;
  root.render(
    h(
      List,
      {
        enableFiltering: false,
        pagination: {
          pageSize: 20,
          hasMore: true,
          onLoadMore: () => {
            pages++;
          },
        },
      },
      h(
        List.Section,
        { id: "files", title: "Files", subtitle: "Local" },
        h(List.Item, {
          title: { value: "File", tooltip: "Full title" },
          subtitle: { value: null, tooltip: null },
          icon: { value: null, tooltip: "Missing" },
          quickLook: { name: null, path: "/tmp/file" },
          accessoryIcon: "star.png",
          accessoryTitle: "Legacy",
        }),
      ),
    ),
  );
  const list = latest();
  expect(list.props.pagination).toEqual({
    pageSize: 20,
    hasMore: true,
    onLoadMore: { $handler: "pagination.onLoadMore" },
  });
  root.dispatch(list.id, "pagination.onLoadMore", []);
  expect(pages).toBe(1);
  expect(list.props.enableFiltering).toBe(false);
  expect(list.children[0]!.props).toEqual({ id: "files", title: "Files", subtitle: "Local" });
  expect(list.children[0]!.children[0]!.props).toEqual({
    title: { value: "File", tooltip: "Full title" },
    subtitle: { value: null, tooltip: null },
    icon: { value: null, tooltip: "Missing" },
    quickLook: { name: null, path: "/tmp/file" },
    accessoryIcon: "star.png",
    accessoryTitle: "Legacy",
  });
  root.unmount();
});

// @covers List.EmptyView.Props
// @covers Grid.EmptyView.Props
test("List and Grid empty views preserve a null icon", () => {
  const { root, latest } = setup();
  for (const Empty of [List.EmptyView, Grid.EmptyView]) {
    root.render(h(Empty, { title: "Empty", description: "Try searching", icon: null }));
    expect(latest().props).toEqual({ title: "Empty", description: "Try searching", icon: null });
  }
  root.unmount();
});

// @covers List.Dropdown.Props
// @covers Grid.Dropdown.Props
// @covers List.Dropdown.Props.storeValue partial
// @covers Grid.Dropdown.Props.storeValue partial
// @covers List.Dropdown.Props.filtering.keepSectionOrder partial
// @covers Grid.Dropdown.Props.filtering.keepSectionOrder partial
for (const Dropdown of [List.Dropdown, Grid.Dropdown]) {
  test(`${Dropdown.name} restores, saves and retains uncontrolled values with controlled precedence`, async () => {
    const { root, latest } = setup();
    const requests: unknown[] = [];
    let stored = "wine";
    setCapabilityRequester(async (name, params) => {
      requests.push([name, params]);
      if (name === "storage.get") return stored;
      stored = String(params.value);
      return null;
    });
    const changed: string[] = [];
    const render = (extra = {}) =>
      root.render(
        h(
          Dropdown,
          {
            tooltip: "Drink",
            id: "drink",
            storeValue: true,
            defaultValue: "water",
            filtering: { keepSectionOrder: true },
            onChange: (value) => changed.push(value),
            ...extra,
          },
          h(Dropdown.Section, null, h(Dropdown.Item, { value: "wine", title: "Wine" })),
        ),
      );
    render();
    expect(latest().props.value).toBe("water");
    await Promise.resolve();
    root.flush();
    expect(latest().props.value).toBe("wine");
    expect(changed).toEqual(["wine"]);
    expect(latest().props.filtering).toEqual({ keepSectionOrder: true });
    root.dispatch(latest().id, "onChange", ["beer"]);
    root.flush();
    expect(latest().props.value).toBe("beer");
    expect(stored).toBe("beer");
    render({ defaultValue: "juice" });
    expect(latest().props.value).toBe("beer");
    render({ value: "controlled" });
    root.dispatch(latest().id, "onChange", ["edit"]);
    root.flush();
    expect(latest().props.value).toBe("controlled");
    expect(changed).toEqual(["wine", "beer", "edit"]);
    expect(requests).toEqual([
      ["storage.get", { scope: "blast:dropdown", key: expect.stringContaining("drink") }],
      [
        "storage.set",
        { scope: "blast:dropdown", key: expect.stringContaining("drink"), value: "beer" },
      ],
      [
        "storage.set",
        { scope: "blast:dropdown", key: expect.stringContaining("drink"), value: "edit" },
      ],
    ]);
    root.unmount();
  });

  test(`${Dropdown.name} ignores stale or absent stored options and never overwrites a user's edit`, async () => {
    const { root, latest } = setup();
    let resolve!: (value: string) => void;
    setCapabilityRequester((name) =>
      name === "storage.get"
        ? new Promise<string>((done) => {
            resolve = done;
          })
        : Promise.resolve(null),
    );
    const render = () =>
      root.render(
        h(
          Dropdown,
          { tooltip: "Drink", storeValue: true, defaultValue: "water" },
          h(Dropdown.Item, { value: "wine", title: "Wine" }),
        ),
      );
    render();
    resolve("missing");
    await Promise.resolve();
    root.flush();
    expect(latest().props.value).toBe("water");
    root.unmount();
    render();
    root.dispatch(latest().id, "onChange", ["beer"]);
    root.flush();
    resolve("wine");
    await Promise.resolve();
    root.flush();
    expect(latest().props.value).toBe("beer");
    root.unmount();
  });
}
