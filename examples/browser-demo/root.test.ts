import { expect, test } from "bun:test";
import { rootModel, rootRows, validateCatalog, type Catalog } from "./root.ts";

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
