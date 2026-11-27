---
id: "0206"
title: Alfred workflow IR, ExtensionManifest mapper, and Script Filter parser
status: doing
milestone: M21
depends: ["0205"]
---

## Goal

Add the typed Alfred workflow intermediate representation (`workflow.ts`), the
`info.plist` → Blast `ExtensionManifest` mapper (`manifest.ts`), and the
Script Filter JSON + legacy XML output parser (`script-filter.ts`) to
`packages/alfred/`.

## Context

- Follows `docs/decisions/0021-alfred-workflows.md` and builds on
  `packages/alfred/src/plist.ts` and `packages/alfred/src/archive.ts` (0205).
- Blast's manifest and preference contracts live in:
  - `packages/host/src/extension-manifest.ts` (`ExtensionManifest`,
    `ExtensionCommand`, `ExtensionArgument`, `ExtensionMode`)
  - `packages/protocol/src/preference-fields.ts` (`Preference`,
    `PreferenceValue`, `missingPreferences`)
- Add `"@blastlauncher/protocol": "workspace:*"` to
  `packages/alfred/package.json` (zero external npm dependencies; run
  `bun install` to update `bun.lock` and verify `bun install --frozen-lockfile`).
- `packages/alfred/src/workflow.ts`:
  - Export `AlfredWorkflow`, `AlfredObject`, `AlfredConnection`,
    `AlfredUserConfigItem`, `AlfredListFilterItem`, `ModifierName`
    (`"cmd" | "alt" | "ctrl" | "shift" | "fn"`), `decodeModifierMask(mask)`,
    `normalizeModifierKey(key)` (canonical order `cmd`, `alt`, `ctrl`,
    `shift`, `fn` joined by `+`, accepting aliases `command`/`option`/`opt`/
    `control`/`fn`), `parseWorkflow(plist: PlistValue): AlfredWorkflow`,
    `loadWorkflow(workflowDir: string): Promise<AlfredWorkflow>`, and
    `parseListFilterItems(raw: PlistValue): AlfredListFilterItem[]`.
  - Modifier bitmasks are macOS `NSEventModifierFlags`: `shift = 131072`
    (`1 << 17`), `ctrl = 262144` (`1 << 18`), `alt = 524288` (`1 << 19`),
    `cmd = 1048576` (`1 << 20`), `fn = 8388608` (`1 << 23`).
  - Real Alfred `listfilter` objects store `config.items` as a JSON-encoded
    string (`"[{\"title\":...,\"subtitle\":...,\"arg\":...,\"imagefile\":...}]"`);
    `parseListFilterItems` must handle both JSON strings and already-parsed
    arrays.
  - Reject non-dict root plists with a descriptive error. Tolerate optional
    missing sections (`objects`, `connections`, `variables`,
    `userconfigurationconfig`, `uidata`, `variablesdontexport`) with empty
    defaults.
- `packages/alfred/src/manifest.ts`:
  - Export `AlfredManifest` (structurally assignable to `ExtensionManifest`
    without importing `@blastlauncher/host`), `resolveWorkflowTemplate`,
    `mapUserConfigToPreferences(items: AlfredUserConfigItem[]): Preference[]`,
    and `workflowToManifest(workflow: AlfredWorkflow, options?: { existingFiles?: ReadonlySet<string> }): { manifest: AlfredManifest; entryUids: Record<string, string> }`.
  - `resolveWorkflowTemplate(text, workflow, overrides?)` expands `{var:name}`
    (from `overrides`, `workflow.variables`, and `userconfigurationconfig`
    defaults) and `{const:alfred_workflow_name|alfred_workflow_bundleid|alfred_workflow_description|alfred_workflow_version}`.
  - `mapUserConfigToPreferences` maps all 6 Alfred 5 `userconfigurationconfig`
    types:
    - `textfield` / `textarea` → `type: "textfield"`
    - `checkbox` → `type: "checkbox"` (`label: config.text || item.label || item.variable`, boolean `default`)
    - `popupbutton` → `type: "dropdown"` (`data` from `config.pairs` `[title, value]` tuples)
    - `filepicker` → `type: config.filtermode === 1 ? "directory" : "file"`
    - `slider` → `type: "textfield"` (`default` from `config.defaultvalue` as string when defined)
    - unknown types → safe fallback `type: "textfield"`
    - Important: when `required` is true and `default` is `""`, omit `default`
      (leave `undefined`) so `missingPreferences` prompts the user for it.
  - `workflowToManifest`:
    - Primary commands are `alfred.workflow.input.scriptfilter`,
      `alfred.workflow.input.keyword`, and `alfred.workflow.input.listfilter`
      objects whose resolved `keyword` is non-empty.
    - If none have a non-empty keyword, fall back to root-level
      `scriptfilter`/`keyword`/`listfilter` objects (no incoming connections),
      and if still empty, `alfred.workflow.trigger.external` objects with a
      non-empty `triggerid`.
    - Command `name`: deterministic unique slug of resolved `keyword` (or
      `triggerid` / `title` / `uid`), disambiguated with `-2`, `-3`, ... in
      object order. `entryUids[command.name] = object.uid`.
    - `keyword` arguments: `argumenttype === 0` adds required `"query"` text
      argument; `argumenttype === 1` adds optional `"query"` text argument;
      `argumenttype === 2` adds no arguments.
    - Command `mode`: `"view"` for `scriptfilter` and `listfilter`; for
      `keyword` and `trigger.external`, `"view"` if any UI node
      (`scriptfilter`, `listfilter`, `userinterface.text`, `userinterface.grid`,
      `output.largetype`, `utility.dialog`) is reachable via enabled
      connections, else `"no-view"`.
    - Icons: when `existingFiles` contains `"<uid>.png"`, set `command.icon = "<uid>.png"`;
      when it contains `"icon.png"`, set `manifest.icon = "icon.png"`.
    - `manifest.name`: `workflow.bundleId` if non-empty, else sanitized
      `workflow.name` or `"alfred-workflow"`.
- `packages/alfred/src/script-filter.ts`:
  - Export `ScriptFilterOutput`, `ScriptFilterItem`, `ScriptFilterIcon`,
    `ScriptFilterMod`, and `parseScriptFilterOutput(stdout: string): ScriptFilterOutput`.
  - Empty/whitespace stdout returns `{ items: [] }`.
  - JSON format: parses `items`, `variables` (stringified values), `rerun`
    (finite number clamped to `0.1`–`5`), `cache` (`seconds` clamped to
    `5`–`86400`, optional `loosereload`), `skipknowledge`. For each item:
    `uid`, `title`, `subtitle`, `arg` (`string | string[]`), `valid` (default
    `true`), `autocomplete`, `match`, `type` (`"default" | "file" | "file:skipcheck"`,
    default `"default"`), `icon` (`{ type?, path }`), `mods` (keys canonicalized
    with `normalizeModifierKey`), `text` (`copy`, `largetext`), `quicklookurl`,
    `variables`, `action`.
  - Legacy XML format (`<items><item ...>...</item></items>`): parses item
    attributes (`uid`, `arg`, `valid`, `autocomplete`, `type`) and child
    elements (`<title>`, `<subtitle>` including `mod="..."`, `<arg>`,
    `<icon type="...">`, `<text type="copy|largetext">`, `<quicklookurl>`,
    `<mod key="..." subtitle="..." arg="..." valid="..."/>`), decoding XML
    entities and CDATA.
- Re-export `workflow.ts`, `manifest.ts`, and `script-filter.ts` from
  `packages/alfred/src/index.ts`.

## Acceptance

- [ ] `packages/alfred/package.json` depends only on `@blastlauncher/protocol` (`"workspace:*"`), and `bun install --frozen-lockfile` succeeds.
- [ ] `packages/alfred/src/workflow.test.ts` covers `parseWorkflow`, `loadWorkflow`, modifier bitmask decoding & key canonicalization, and `parseListFilterItems` (both JSON string and array forms).
- [ ] `packages/alfred/src/manifest.test.ts` covers all 6 `userconfigurationconfig` types (including required empty-default omission), `{var:...}`/`{const:...}` template resolution, duplicate keyword slug disambiguation, `keyword` argument types & reachable-UI mode detection, fallback entry selection, and `icon.png` / `<uid>.png` icon assignment.
- [ ] `packages/alfred/src/script-filter.test.ts` covers JSON output (items, array `arg`, `mods` canonicalization, `variables`, `rerun`, `cache`, `icon`, `text`, `quicklookurl`), legacy XML output (attributes, `<subtitle mod>`, `<mod>`, `<icon>`, `<text>`, CDATA, entities), empty stdout, and invalid payload errors.
- [ ] `node -e 'import("./packages/alfred/src/index.ts").then(m => { if (!m.parseWorkflow || !m.workflowToManifest || !m.parseScriptFilterOutput) process.exit(1); })'` exits 0 on Node 24.
- [ ] `bun run verify` passes.

## Out of scope

- Spawning workflow scripts or executing workflow graphs (Task 0207).
- `@blastlauncher/alfred/main` protocol runtime or scene rendering (Task 0208).
- Integrating into `packages/host`, `packages/cli`, `packages/serve`, or `packages/tui` (Task 0209).

## Handoff

```
Branch/commit: t3/alfred-ir-manifest-scriptfilter @ 8e3da221 (Handoff commit follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 37.2s
Done:
- packages/alfred depends only on @blastlauncher/protocol (workspace:*); bun.lock updated, frozen install passes.
- workflow.ts: AlfredWorkflow IR, parseWorkflow (rejects non-dict roots, defaults optional sections), loadWorkflow, decodeModifierMask, normalizeModifierKey, parseListFilterItems (JSON string or array).
- manifest.ts: AlfredManifest (structural ExtensionManifest), resolveWorkflowTemplate ({var:} / {const:}), mapUserConfigToPreferences (all 6 types plus fallback; required "" default omitted), workflowToManifest (entry selection plus fallbacks, unique slugs, keyword args, reachable-UI mode, icons).
- script-filter.ts: parseScriptFilterOutput for JSON (clamped rerun/cache, canonical mods, stringified variables) and legacy XML (own small reader: attributes, CDATA, entities, <subtitle mod>, <mod>, <icon>, <text>).
- Tests: workflow.test.ts, manifest.test.ts, script-filter.test.ts; index.ts re-exports all three. Node 24 import check exits 0.
Not done / risks:
- normalizeModifierKey returns undefined for empty or unknown tokens; script-filter drops such mods rather than failing the whole output.
- UI type strings userinterface.grid and utility.dialog are taken from this task as written; not checked against real workflows yet (0207/0208 corpus should confirm).
- Choices the task did not specify: object-level `disabled` is not modeled (connection `disabled` is); keyword argumenttype missing or unknown → optional query; command subtitle = resolved subtext, description = workflow description; checkbox defaults expand to "1"/"0" in {var:}.
- Legacy XML keeps unknown or invalid entity references verbatim instead of failing; legacy <text type="largetype"> (Alfred's documented spelling) and "largetext" both map to text.largetext.
```
