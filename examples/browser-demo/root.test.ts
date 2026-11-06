import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  catalogCommandTitle,
  executeRootAction,
  rootActionModel,
  rootActions,
  rootModel,
  rootRows,
  validateCatalog,
  type Catalog,
} from "./root.ts";

const catalog: Catalog = {
  commit: "x",
  extensions: [
    { name: "zeta", title: "Zeta", commands: [{ name: "run", title: "Run Zeta", mode: "view" }] },
    {
      name: "hello-list",
      title: "Hello List",
      commands: [{ name: "index", title: "Hello List", mode: "view" }],
    },
    {
      name: "alpha",
      title: "Alpha",
      commands: [{ name: "open", title: "Open Alpha", mode: "view" }],
    },
  ],
};

test("root rows rank matches and keep curated suggestions first", () => {
  expect(rootRows(catalog, "zeta").map((row) => row.extension)).toEqual(["zeta"]);
  expect(rootRows(catalog, "").map((row) => row.extension)).toEqual([
    "hello-list",
    "alpha",
    "zeta",
  ]);
});

const realCatalog = validateCatalog(
  JSON.parse(await readFile(join(import.meta.dir, "catalog.json"), "utf8")),
);

test("cmdk's matcher ranks real catalog titles", () => {
  expect(rootRows(realCatalog, "ratio")[0]?.title).toBe("Calculate Ratio");
  expect(rootRows(realCatalog, "cal rat")[0]?.title).toBe("Calculate Ratio");

  const rectangle = rootRows(realCatalog, "rect");
  expect(rectangle[0]?.title).toBe("Rectangle Actions");
  expect(rectangle.slice(0, 5).every((row) => row.extension === "rectangle")).toBe(true);

  expect(rootRows(realCatalog, "tl")[0]?.title).toBe("Top Left");
  expect(rootRows(realCatalog, "zzzzqqq")).toEqual([]);
});

test("catalog icons resolve from each extension assets directory", () => {
  const row = rootRows(
    {
      commit: "abc123",
      extensions: [
        {
          name: "ratio-calculator",
          title: "Ratio Calculator",
          icon: "icon.png",
          commands: [{ name: "index", title: "Ratio", mode: "view" }],
        },
      ],
    },
    "",
  )[0]!;
  expect(row.icon).toBe("⌘");
  expect(row.iconUrl).toContain("/extensions/ratio-calculator/assets/icon.png");
});

test("URL row and selection are clamped", () => {
  const model = rootModel(
    catalog,
    "https://github.com/raycast/extensions/tree/main/extensions/x",
    99,
  );
  expect(model.rows[0]?.title).toBe("Run from URL");
  expect(model.selected).toBe(model.rows.length - 1);
  expect(rootModel(catalog, "", -4).selected).toBe(0);
});

test("the catalog supplies the command title used as the view title fallback", () => {
  expect(
    catalogCommandTitle(
      catalog,
      "https://github.com/raycast/extensions/tree/x/extensions/zeta",
      "run",
    ),
  ).toBe("Run Zeta");
  expect(catalogCommandTitle(catalog, "https://example.com/runner", "run")).toBeUndefined();
  expect(
    catalogCommandTitle(undefined, "https://github.com/raycast/extensions/tree/x", "run"),
  ).toBe(undefined);
});

test("catalog validation requires sorted extensions", () => {
  expect(() =>
    validateCatalog({
      commit: "x",
      extensions: [
        { name: "z", title: "z", commands: [] },
        { name: "a", title: "a", commands: [] },
      ],
    }),
  ).toThrow("sorted");
});

test("actions filter, clamp selection, and produce host effects", () => {
  const row = rootRows(catalog, "zeta")[0]!;
  expect(rootActions(row).map((action) => action.title)).toEqual([
    "Run Command",
    "Open Extension on GitHub",
    "Copy Extension URL",
  ]);
  expect(rootActionModel(row, "copy", 99)).toMatchObject({
    selected: 0,
    actions: [{ id: "copy", title: "Copy Extension URL" }],
  });
  expect(executeRootAction(row, "run")).toEqual({ type: "run" });
  expect(executeRootAction(row, "github")).toEqual({
    type: "open",
    url: "https://github.com/raycast/extensions/tree/x/extensions/zeta",
  });
  expect(executeRootAction(row, "copy")).toEqual({
    type: "copy",
    url: "https://github.com/raycast/extensions/tree/x/extensions/zeta",
  });
});
