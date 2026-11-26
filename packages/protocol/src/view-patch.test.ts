import { describe, expect, test } from "bun:test";
import { applyViewPatch, diffView, type ViewPatchOp } from "./view-patch.ts";
import type { JsonValue } from "./messages.ts";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }
  return value;
}

function roundTrip(prev: JsonValue, next: JsonValue): ViewPatchOp[] {
  const frozenPrev = deepFreeze(structuredClone(prev));
  const ops = diffView(frozenPrev, next);
  const patched = applyViewPatch(frozenPrev, { ops });
  expect(patched).toEqual(next);
  return ops;
}

function makeListView(
  items: Array<{ id: string; title: string; subtitle: string; tag: string }>,
  selectedIndex: number,
  searchText: string,
): JsonValue {
  return {
    kind: "list",
    title: "Benchmark List",
    loading: false,
    navigation: { canGoBack: false },
    search: { text: searchText, placeholder: "Search..." },
    selectedId: items[selectedIndex]?.id ?? null,
    rows: items.map((item, idx) => ({
      id: item.id,
      kind: "item",
      title: item.title,
      subtitle: item.subtitle,
      accessories: item.tag,
      icon: false,
      count: null,
      selected: idx === selectedIndex,
      iconLabel: "",
      text: `${item.title} ${item.subtitle} ${item.tag}`,
    })),
    grid: null,
    emptyText: "",
    empty: null,
    detail: "",
    primary: { title: "Open", shortcut: "↵", enabled: items.length > 0 },
    actions: {
      open: false,
      title: "Actions",
      query: "",
      breadcrumb: [],
      rows: [{ id: "a1", kind: "action", title: "Open", shortcut: "↵", selected: true }],
      selectedIndex: 0,
    },
    dropdown: null,
    feedback: { toast: null, hud: null, alert: null },
    menuBar: null,
    form: null,
    requests: { quit: false, clearSearch: false },
  };
}

describe("diffView / applyViewPatch", () => {
  test("identical values produce no ops", () => {
    const view: JsonValue = {
      kind: "list",
      title: "Commands",
      loading: false,
      rows: [
        { id: "a", title: "Alpha", selected: true },
        { id: "b", title: "Beta", selected: false },
      ],
      empty: null,
    };
    expect(diffView(view, structuredClone(view))).toEqual([]);
    expect(applyViewPatch(view, { ops: [] })).toEqual(view);
  });

  test("covers set, delete, nested objects, null <-> object and arrays of objects", () => {
    // Primitive set + adding optional key + deleting optional key.
    const ops1 = roundTrip(
      { title: "Old", count: 1, iconTint: "#fff" },
      { title: "New", count: 1, iconMask: "circle" },
    );
    expect(ops1).toEqual([
      { op: "delete", path: ["iconTint"] },
      { op: "set", path: ["title"], value: "New" },
      { op: "set", path: ["iconMask"], value: "circle" },
    ]);

    // Nested objects recurse key by key without replacing unchanged siblings.
    const ops2 = roundTrip(
      {
        search: { text: "", placeholder: "Search..." },
        feedback: {
          toast: { style: "animated", title: "Loading", message: "step 1", actions: [] },
          hud: null,
        },
      },
      {
        search: { text: "ap", placeholder: "Search..." },
        feedback: {
          toast: { style: "success", title: "Done", message: "step 1", actions: [] },
          hud: { title: "Copied" },
        },
      },
    );
    expect(ops2).toEqual([
      { op: "set", path: ["search", "text"], value: "ap" },
      { op: "set", path: ["feedback", "toast", "style"], value: "success" },
      { op: "set", path: ["feedback", "toast", "title"], value: "Done" },
      { op: "set", path: ["feedback", "hud"], value: { title: "Copied" } },
    ]);

    // null <-> object transitions in both directions.
    expect(roundTrip({ empty: null }, { empty: { title: "No results", description: "" } })).toEqual(
      [{ op: "set", path: ["empty"], value: { title: "No results", description: "" } }],
    );
    expect(roundTrip({ empty: { title: "No results", description: "" } }, { empty: null })).toEqual(
      [{ op: "set", path: ["empty"], value: null }],
    );
    expect(roundTrip(null, { kind: "list" })).toEqual([
      { op: "set", path: [], value: { kind: "list" } },
    ]);
    expect(roundTrip({ kind: "list" }, null)).toEqual([{ op: "set", path: [], value: null }]);

    // Arrays of objects: prefix/suffix splice on a single modified object.
    const rowsBefore: JsonValue = {
      rows: [
        { id: "1", title: "One", selected: true },
        { id: "2", title: "Two", selected: false },
        { id: "3", title: "Three", selected: false },
      ],
    };
    const rowsAfter: JsonValue = {
      rows: [
        { id: "1", title: "One", selected: false },
        { id: "2", title: "Two", selected: true },
        { id: "3", title: "Three", selected: false },
      ],
    };
    const ops3 = roundTrip(rowsBefore, rowsAfter);
    expect(ops3).toEqual([
      {
        op: "splice",
        path: ["rows"],
        at: 0,
        remove: 2,
        insert: [
          { id: "1", title: "One", selected: false },
          { id: "2", title: "Two", selected: true },
        ],
      },
    ]);
  });

  test("handles array splices (prepend, append, middle delete/insert, duplicates) and whole-array set", () => {
    expect(roundTrip({ a: [1, 2, 3] }, { a: [0, 1, 2, 3] })).toEqual([
      { op: "splice", path: ["a"], at: 0, remove: 0, insert: [0] },
    ]);
    expect(roundTrip({ a: [1, 2, 3] }, { a: [1, 2, 3, 4] })).toEqual([
      { op: "splice", path: ["a"], at: 3, remove: 0, insert: [4] },
    ]);
    expect(roundTrip({ a: [1, 2, 3] }, { a: [1, 3] })).toEqual([
      { op: "splice", path: ["a"], at: 1, remove: 1, insert: [] },
    ]);
    expect(roundTrip({ a: [1, 1] }, { a: [1, 1, 1] })).toEqual([
      { op: "splice", path: ["a"], at: 2, remove: 0, insert: [1] },
    ]);
    expect(roundTrip({ a: [2, 1, 1] }, { a: [1, 1] })).toEqual([
      { op: "splice", path: ["a"], at: 0, remove: 1, insert: [] },
    ]);
    // Whole-array replacement becomes `set`, not `splice`.
    expect(roundTrip({ a: [1, 2] }, { a: [3, 4] })).toEqual([
      { op: "set", path: ["a"], value: [3, 4] },
    ]);
    expect(roundTrip({ a: [] }, { a: [1, 2] })).toEqual([
      { op: "set", path: ["a"], value: [1, 2] },
    ]);
    expect(roundTrip({ a: [1, 2] }, { a: [] })).toEqual([{ op: "set", path: ["a"], value: [] }]);
  });

  test("treats undefined object properties as absent, matching wire JSON", () => {
    const prev = { a: 1, opt: undefined as unknown as JsonValue };
    const next = { a: 1, added: "x", missing: undefined as unknown as JsonValue };
    const ops = diffView(prev, next);
    expect(ops).toEqual([{ op: "set", path: ["added"], value: "x" }]);
    expect(applyViewPatch({ a: 1 }, { ops })).toEqual({ a: 1, added: "x" });
  });

  test("round-trips 1k and 10k bench list cases with small edit and selection patches", () => {
    for (const count of [1_000, 10_000]) {
      const baseItems = Array.from({ length: count }, (_, i) => ({
        id: `item-${i}`,
        title: `Item ${i}`,
        subtitle: `Category ${i % 10}`,
        tag: `tag-${i % 5}`,
      }));
      const initial = makeListView(baseItems, 0, "");

      // One-row edit
      const editedItems = baseItems.slice();
      editedItems[0] = { ...baseItems[0]!, title: "Item 0 (pinned)", tag: "pinned" };
      const edited = makeListView(editedItems, 0, "");
      const editOps = roundTrip(initial, edited);
      expect(editOps).toHaveLength(1);
      expect(editOps[0]!.op).toBe("splice");
      expect(Buffer.byteLength(JSON.stringify(editOps), "utf8")).toBeLessThan(2048);

      // Selection move (down)
      const moved = makeListView(editedItems, 1, "");
      const moveOps = roundTrip(edited, moved);
      expect(moveOps.some((op) => op.op === "splice")).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(moveOps), "utf8")).toBeLessThan(2048);

      // Search filter ("42")
      const filteredItems = editedItems.filter((item) => item.title.includes("42"));
      const filtered = makeListView(filteredItems, 0, "42");
      roundTrip(moved, filtered);
    }
  });

  test("validates baseRevision and revision when supplied", () => {
    const prev: JsonValue = { title: "a" };
    const ops = diffView(prev, { title: "b" });
    expect(applyViewPatch(prev, { revision: 2, baseRevision: 1, ops }, 1)).toEqual({ title: "b" });
    expect(() => applyViewPatch(prev, { revision: 3, baseRevision: 2, ops }, 1)).toThrow(
      /baseRevision mismatch/,
    );
    expect(() => applyViewPatch(prev, { revision: 1, baseRevision: 0, ops }, 1)).toThrow(
      /baseRevision mismatch/,
    );
    expect(() => applyViewPatch(prev, { ops }, 1)).toThrow(/missing baseRevision/);
    expect(() => applyViewPatch(prev, { revision: 4, baseRevision: 1, ops }, 1)).toThrow(
      /revision mismatch/,
    );
  });

  test("throws on missing paths, invalid parents, and out-of-bounds splices", () => {
    const view: JsonValue = {
      title: "a",
      empty: null,
      search: { text: "" },
      rows: [{ id: "1" }],
    };
    expect(() =>
      applyViewPatch(view, { ops: [{ op: "set", path: ["missing", "child"], value: 1 }] }),
    ).toThrow(/Path does not exist/);
    expect(() =>
      applyViewPatch(view, { ops: [{ op: "set", path: ["empty", "title"], value: "x" }] }),
    ).toThrow(/Path does not exist/);
    expect(() =>
      applyViewPatch(view, { ops: [{ op: "set", path: ["title", "sub"], value: "x" }] }),
    ).toThrow(/Path does not exist/);
    expect(() =>
      applyViewPatch(view, { ops: [{ op: "set", path: ["rows", "0"], value: "x" }] }),
    ).toThrow(/Path does not exist/);
    expect(() => applyViewPatch(view, { ops: [{ op: "delete", path: ["nonexistent"] }] })).toThrow(
      /Path does not exist/,
    );
    expect(() =>
      applyViewPatch(view, { ops: [{ op: "delete", path: ["search", "nonexistent"] }] }),
    ).toThrow(/Path does not exist/);
    expect(() => applyViewPatch(view, { ops: [{ op: "delete", path: [] }] })).toThrow(
      /Cannot delete view root/,
    );
    expect(() =>
      applyViewPatch(view, {
        ops: [{ op: "splice", path: ["missing"], at: 0, remove: 0, insert: [] }],
      }),
    ).toThrow(/Path does not exist/);
    expect(() =>
      applyViewPatch(view, {
        ops: [{ op: "splice", path: ["title"], at: 0, remove: 0, insert: [] }],
      }),
    ).toThrow(/not an array/);
    expect(() =>
      applyViewPatch(view, {
        ops: [{ op: "splice", path: ["rows"], at: 2, remove: 0, insert: [] }],
      }),
    ).toThrow(/out of bounds/);
    expect(() =>
      applyViewPatch(view, {
        ops: [{ op: "splice", path: ["rows"], at: 0, remove: 2, insert: [] }],
      }),
    ).toThrow(/out of bounds/);
  });
});
