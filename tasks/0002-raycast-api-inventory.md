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
  one file. Do not resolve into `react` or `node` types; record unresolved
  references in a top-level `"unresolved"` list rather than failing.
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
- [x] Summary printed: total entries per kind and unresolved count; include the
      numbers in Handoff.
- [x] `bun run verify` passes.

## Out of scope

- Coverage evidence and reports (task 0003).
- Usage weights from the extension corpus (M2).

## Handoff

Branch/commit: t3/raycast-api-inventory @ 8035f2ffc56cbe976212bf52f8760730f479e1cd (implementation; handoff committed separately)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 1.1s
Done:

- Added pure oxc-parser inventory generation, local type/member resolution, component props, deprecation, provenance, and deterministic sorting.
- Generated 4,899 entries: namespace=9, component=116, function=223, const=20, class=3, enum=22, enum-member=736, interface=64, type=178, property=3504, method=24; unresolved=104.
- Added nine deterministic tests (35 total passing); verified required real API paths, identical hashes across two runs, and full verify failure after editing the generated JSON, then restored it.
- Added inventory staleness to the compat gate; pinned oxc-parser 0.95.0 (installed parser 1.4 MB + native binding 4.4 MB).

Not done / risks: No acceptance checks skipped. Unresolved records include external React, Node, and standard-library references; external declarations are intentionally not loaded. Coverage evidence/reporting remains task 0003. No push performed.
