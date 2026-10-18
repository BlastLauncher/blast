import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { inventory } from "./inventory.ts";
import { VENDOR_TYPES } from "./check-vendor.ts";

const entries = (source: string) =>
  Object.fromEntries(inventory(source).entries.map((entry) => [entry.path, entry]));

test("recurses ambient namespaces and merges values with namespaces", () => {
  const result = entries(`
    export declare namespace Outer {
      namespace Inner { function run(): void; }
      const Style: typeof InternalStyle;
      export namespace Style { export type Good = InternalStyle.Good; }
    }
    declare enum InternalStyle { Good, /** @deprecated obsolete */ Bad }
  `);
  expect(result["Outer.Inner.run"]?.kind).toBe("function");
  expect(result["Outer.Style"]?.kind).toBe("enum");
  expect(result["Outer.Style.Good"]?.kind).toBe("enum-member");
  expect(result["Outer.Style.Bad"]?.deprecated).toBe(true);
  expect(result.InternalStyle).toBeUndefined();
});

test("follows intersections, aliases, component props, and inherited members", () => {
  const result = entries(`
    import { FunctionComponent } from "react";
    interface Base<T> { value: T; }
    interface Props extends Base<string> { title: string; /** @deprecated old */ old?: boolean; }
    type Component = FunctionComponent<Props>;
    declare const Item: Component;
    interface Members { Item: typeof Item; }
    export declare const List: FunctionComponent<Props> & Members & { extra(): void; };
    export declare namespace List { namespace Item { type Props = PropsAlias; } }
    type PropsAlias = Props;
  `);
  for (const path of ["List", "List.Item"]) expect(result[path]?.kind).toBe("component");
  for (const path of ["List.Props.title", "List.Item.Props.title", "List.Item.Props.value"])
    expect(result[path]?.kind).toBe("property");
  expect(result["List.Item.Props.old"]?.deprecated).toBe(true);
  expect(result["List.extra"]?.kind).toBe("method");
});

test("handles cycles, external references, class visibility, overloads and sorting", () => {
  const result = inventory(`
    import { External } from "external";
    interface Recursive { next?: Recursive; value: External; }
    export type Shape = Recursive;
    /** @deprecated old */ export declare function old(): void;
    export declare function old(value: string): void;
    export declare class Box { private hidden; protected secret; value: string; get size(): number; run(): void; }
  `);
  expect(result.entries.filter((entry) => entry.path === "old")).toEqual([
    { path: "old", kind: "function", deprecated: true },
  ]);
  expect(
    result.entries.some((entry) => entry.path === "Box.hidden" || entry.path === "Box.secret"),
  ).toBe(false);
  expect(result.entries.find((entry) => entry.path === "Box.size")?.kind).toBe("property");
  expect(result.unresolved).toEqual([{ path: "Shape", reference: "External" }]);
  expect(result.entries.map((entry) => entry.path)).toEqual(
    result.entries.map((entry) => entry.path).toSorted(),
  );
  expect(result.entries.length).toBeLessThan(15);
});

test("records enum values without inventing values on enum-typed properties", () => {
  const result = entries(
    `export declare enum Mode { One, Two } export interface Props { mode: Mode }`,
  );
  expect(result["Mode.One"]?.kind).toBe("enum-member");
  expect(result["Props.mode.One"]).toBeUndefined();
});

test("does not report generic, mapped, or inferred type parameters as unresolved", () => {
  expect(
    inventory(
      `export type A<T> = { [K in keyof T]: T[K] }; export type B<T> = T extends infer U ? U : T;`,
    ).unresolved,
  ).toEqual([]);
});

test("rejects invalid declarations", () => {
  expect(() => inventory("export declare const : ;")).toThrow();
});

test("inventories the pinned Raycast declarations", () => {
  const result = entries(readFileSync(VENDOR_TYPES, "utf8"));
  const expected = {
    "Clipboard.copy": "function",
    List: "component",
    "List.Item": "component",
    "List.Item.Props.title": "property",
    "Action.CopyToClipboard": "component",
    ActionPanel: "component",
    showToast: "function",
    "Toast.Style.Success": "enum-member",
    "LocalStorage.getItem": "function",
    getPreferenceValues: "function",
    environment: "const",
  } as const;
  for (const [path, kind] of Object.entries(expected)) expect(result[path]?.kind).toBe(kind);
  expect(result.ActionPanelItem?.deprecated).toBe(true);
});
