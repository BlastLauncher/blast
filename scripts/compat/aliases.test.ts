import { expect, test } from "bun:test";
import { applyStructuralAliases } from "./aliases.ts";
import { inventory } from "./inventory.ts";

const declarations = `
  export interface Current { shared: { value: string }; extra: number; }
  /** @deprecated */ export interface Legacy { shared: { value: string }; }
`;

test("structural aliases permit target-only members and retain every alias member", () => {
  const { entries } = inventory(declarations);
  const before = entries.map((entry) => entry.path);
  applyStructuralAliases(entries, { Legacy: "Current" });
  expect(entries.find((entry) => entry.path === "Legacy")?.aliasTarget).toBe("Current");
  expect(entries.map((entry) => entry.path)).toEqual(before);
});

test("structural drift lists every missing member without applying any aliases", () => {
  const { entries } = inventory(`${declarations}
    export interface Invalid { shared: { absent: string }; own: boolean; }
  `);
  expect(() => applyStructuralAliases(entries, { Legacy: "Current", Invalid: "Current" })).toThrow(
    "Invalid.own → Current.own: missing member\nInvalid.shared.absent → Current.shared.absent: missing member",
  );
  expect(entries.find((entry) => entry.path === "Legacy")?.aliasTarget).toBeUndefined();
});

test("structural aliases reject missing roots, member-kind changes and invalid targets", () => {
  const { entries } = inventory(`
    export interface Legacy { run(): void }
    export interface Current { run: string }
  `);
  expect(() => applyStructuralAliases(entries, { Absent: "Current", Legacy: "Missing" })).toThrow(
    "missing alias 'Absent'\nmissing target 'Missing' for 'Legacy'",
  );
  expect(() => applyStructuralAliases(entries, { Legacy: "Current" })).toThrow(
    "Legacy.run → Current.run: kind method != property",
  );
  expect(() => applyStructuralAliases(entries, { Legacy: "Legacy" })).toThrow("invalid alias");
});
