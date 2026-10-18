---
id: "0002"
title: Generate the Raycast API inventory from vendored declarations
status: review
milestone: M0
depends: ["0001"]
---

## Goal

`bun run compat:inventory` parses `compat/raycast-api/index.d.ts` and writes a
deterministic `compat/raycast-api.inventory.json` listing every public API
symbol path an extension can use — the denominator for coverage.

## Context

- The file declares top-level `export declare` namespaces, consts, functions,
  classes, enums, interfaces and types, plus non-exported helper interfaces
  that exported consts reference (e.g. `export declare const Action:
  FunctionComponent<ActionProps> & ConvenienceActions & {...}` alongside
  `export declare namespace Action {...}`).
- Symbol paths use dots: `Clipboard.copy`, `List.Item`, `Action.CopyToClipboard`,
  `Toast.Style.Success`. Component props are paths too:
  `List.Item.Props.accessories` (follow the props type of the component).
- Each entry: `{ "path", "kind", "deprecated" }` where `kind` is one of
  `namespace|component|function|const|class|enum|enum-member|interface|type|
  property|method`, and `deprecated` reflects a JSDoc `@deprecated` tag.
- Resolve members by following type references and intersections within this
  one file. Do not resolve into `react` or `node` types; record referenced external
  names in a sorted, unique top-level `"external"` list, excluding TS library
  globals. This list is informational. Stop ordinary property expansion at
  named type references; expand inline anonymous object types.
- Use a real parser. Recommended: `oxc-parser` as a devDependency (pin exact).
  Check its disk size; keep the install small.
- Output is sorted by `path`, includes `version` and `sha256` copied from
  `compat/raycast-api/source.json`, and is byte-stable across runs.
- Extend the `compat` verify step: regenerating the inventory must produce no
  diff (stale inventory fails verify).
- Code in `scripts/compat/`; parsing logic is a pure function tested on small
  inline `.d.ts` fixtures, plus one test asserting a handful of known paths
  exist in the real vendored file.

## Acceptance

- [x] Inventory contains at least: `Clipboard.copy`, `List`, `List.Item`,
      `List.Item.Props.title`, `Action.CopyToClipboard`, `ActionPanel`,
      `showToast`, `Toast.Style.Success`, `LocalStorage.getItem`,
      `getPreferenceValues`, `environment`.
- [x] Deprecated symbols are flagged (assert at least one known example).
- [x] Fixture tests cover namespace recursion, const-with-intersection members,
      enum members, props-following, and deprecation.
- [x] Running the generator twice yields no diff; verify fails when the JSON is
      edited by hand.
- [x] Summary printed: total entries per kind and external count; include the
      numbers in Handoff.
- [x] `bun run verify` passes.

## Out of scope

- Coverage evidence and reports (task 0003).
- Usage weights from the extension corpus (M2).

## Handoff

Branch/commit: t3/raycast-api-inventory-fixes @ b95189e68f5da7e9a92c5ab3d253cfc50edb4ae9 (implementation; handoff committed separately)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 0.7s
Done:

- Fast-forwarded round 1; stopped ordinary property expansion at named types while preserving component props, runtime members, declaration aliases, inheritance, and inline anonymous objects.
- Corrected callback property kinds and inherited deprecation through descendants, including all ActionPanel.Item and ActionPanelItem descendants.
- Regenerated 2,473 entries: namespace=9, component=116, function=50, const=21, class=3, enum=13, enum-member=691, interface=64, type=178, property=1304, method=24. Maximum path depth: 8 segments (legitimate nested component props).
- Replaced unresolved records with external=7: ForwardRefExoticComponent, FunctionComponent, JSX.Element, PathLike, ReactElement, ReactNode, RefAttributes. TS standard library globals are excluded.
- Added one fixture for each review rule and real-file regression assertions; all 39 tests pass. Two regenerations matched each other and the committed inventory byte-for-byte; existing staleness tests detect edited JSON.

Not done / risks: No requested checks skipped. External declarations remain intentionally unloaded; the standard-library name set may need updates as future declarations introduce new globals. Task remains in review. No push performed.
