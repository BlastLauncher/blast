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
  expect(result.external).toEqual(["External"]);
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

test("does not report generic, mapped, or inferred type parameters as external", () => {
  expect(
    inventory(
      `export type A<T> = { [K in keyof T]: T[K] }; export type B<T> = T extends infer U ? U : T;`,
    ).external,
  ).toEqual([]);
});

test("stops property expansion at named types while expanding inline objects", () => {
  const result = entries(`
    export namespace Image { interface ImageLike { tintColor: { dark: string }; } }
    export namespace Keyboard { interface Shortcut { key: string; } }
    export namespace List { namespace Item { interface Accessory { text: string; } } }
    export interface Props {
      icon: Image.ImageLike;
      shortcut: Keyboard.Shortcut;
      accessory: List.Item.Accessory;
      mixed: Image.ImageLike | { inline: { value: string }; named: Keyboard.Shortcut };
    }
  `);
  for (const path of [
    "Props.icon",
    "Props.shortcut",
    "Props.accessory",
    "Image.ImageLike.tintColor.dark",
    "Keyboard.Shortcut.key",
    "List.Item.Accessory.text",
    "Props.mixed.inline.value",
    "Props.mixed.named",
  ])
    expect(result[path]?.kind).toBe("property");
  for (const path of [
    "Props.icon.tintColor",
    "Props.shortcut.key",
    "Props.accessory.text",
    "Props.mixed.tintColor",
    "Props.mixed.named.key",
  ])
    expect(result[path]).toBeUndefined();
});

test("classifies callback properties separately from methods and declared functions", () => {
  const result = entries(`
    declare function handler(): void;
    export interface Props {
      onAction: () => void;
      onCopy?: (value: string) => Promise<void>;
      callback: typeof handler;
      run(): void;
    }
    export declare function showToast(): void;
    export namespace Clipboard { function copy(): void; }
  `);
  for (const path of ["Props.onAction", "Props.onCopy", "Props.callback"])
    expect(result[path]?.kind).toBe("property");
  expect(result["Props.run"]?.kind).toBe("method");
  for (const path of ["showToast", "Clipboard.copy"]) expect(result[path]?.kind).toBe("function");
});

test("inherits deprecation through namespaces, component props, aliases and enum members", () => {
  const result = entries(`
    import { FunctionComponent } from "react";
    interface Props { title: string; nested: { value: string }; }
    /** @deprecated old */ export const Old: FunctionComponent<Props>;
    export namespace Old { namespace Child { type Value = { value: string }; } }
    /** @deprecated old */ export enum Mode { One }
    /** @deprecated old */ interface Legacy { nested: { value: string }; }
    export type Alias = Legacy;
    export interface Current { /** @deprecated old */ nested: { value: string }; ok: string; }
  `);
  for (const [path, entry] of Object.entries(result))
    if (
      path.startsWith("Old.") ||
      path.startsWith("Mode.") ||
      path.startsWith("Alias.") ||
      path.startsWith("Current.nested")
    )
      expect(entry.deprecated).toBe(true);
  expect(result["Old.Props.nested.value"]?.deprecated).toBe(true);
  expect(result["Old.Child.Value.value"]?.deprecated).toBe(true);
  expect(result["Current.ok"]?.deprecated).toBe(false);
});

test("reports unique sorted external names without standard library globals", () => {
  const result = inventory(`
    import { ReactNode, ReactElement } from "react";
    import { PathLike } from "node:fs";
    export interface Props {
      node: ReactNode; again: ReactNode; element: ReactElement;
      path: PathLike; promise: Promise<Array<Record<string, Extract<string, string>>>>;
      date: Date; url: URL; bytes: Uint8Array<ArrayBuffer>; signal: AbortSignal;
      stream: ReadableStream<AsyncIterable<string>>; map: ReadonlyMap<string, unknown>;
      utility: Partial<Pick<{ a: string }, "a">>;
    }
  `);
  expect(result.external).toEqual(["PathLike", "ReactElement", "ReactNode"]);
  expect(result).not.toHaveProperty("unresolved");
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
  for (const entry of Object.values(result))
    if (entry.path.startsWith("ActionPanel.Item.") || entry.path.startsWith("ActionPanelItem."))
      expect(entry.deprecated).toBe(true);
  expect(result["Action.Props.onAction"]?.kind).toBe("property");
  expect(result["Action.CopyToClipboard.Props.onCopy"]?.kind).toBe("property");
  expect(result["ActionPanel.Item.CopyToClipboard.Props.icon.tintColor.dark"]).toBeUndefined();
});

test("records public alias targets with lexical scope and excludes structural duplicates", () => {
  const result = entries(`
    export namespace Current { interface Props { title: string } const Item: { run(): void }; }
    export const OldItem: typeof Current.Item;
    export const Container: { Old: typeof Current.Item };
    interface Internal { value: string }
    export type InternalAlias = Internal;
    export type OldProps = Current.Props;
    export interface LegacyProps extends Current.Props {}
    export interface Extended extends Current.Props { own: string }
    export interface Duplicate { title: string }
    export const data: Current.Props;
    export namespace Nested {
      interface Props { value: string }
      type Alias = Props;
      type Outer = Current.Props;
    }
  `);
  expect(result["Container.Old"]?.aliasTarget).toBe("Current.Item");
  expect(result.InternalAlias?.aliasTarget).toBe("Internal");
  expect(result.OldItem?.aliasTarget).toBe("Current.Item");
  expect(result.OldProps?.aliasTarget).toBe("Current.Props");
  expect(result.LegacyProps?.aliasTarget).toBe("Current.Props");
  expect(result["Nested.Alias"]?.aliasTarget).toBe("Nested.Props");
  expect(result["Nested.Outer"]?.aliasTarget).toBe("Current.Props");
  for (const path of ["Extended", "Duplicate", "data", "OldItem.run"])
    expect(result[path]?.aliasTarget).toBeUndefined();
});
