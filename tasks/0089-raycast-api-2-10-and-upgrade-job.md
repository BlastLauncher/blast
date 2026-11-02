---
id: "0089"
title: Upgrade to @raycast/api 2.10.1 and automate future upgrades
status: todo
milestone: M6
depends: ["0088"]
---

## Goal

`compat/` measures `@raycast/api` 2.10.1, its new surface is implemented with
evidence, and a weekly job flags future releases without manual polling.

## Context

Vendored version is 2.8.2. Declaration changes in 2.9 and 2.10:

- `Clipboard.paste(content, options?)` with `Clipboard.PasteOptions`
  (`closeMainWindow?: boolean`).
- `revocationEndpoint?: string` on the OAuth PKCE client options.
- AI model enum tables changed: added, reordered and remapped values.
- Minor: `JSX` imports from `react`; private members changed.

Blast already uses React 19.3.1, which is the version 2.10.1 depends on.

Add `bun run compat:upgrade [version]`, running the existing steps in order:
`compat:fetch`, `compat:inventory`, `compat:enums`, `compat:stubs`,
`compat:report`. Check that this is the right order against the generators.

Add `.github/workflows/compat-upgrade.yml` on a weekly `schedule` plus
`workflow_dispatch`. It compares the vendored version to the npm latest. When
newer, it runs `compat:upgrade`, pushes `compat/raycast-api-<version>`, and opens
one issue with a compare link, reusing an open issue if it already exists.
GitHub Actions cannot create PRs in this repo (the setting is off and must stay
off), so do not call `gh pr create`. Pin actions by SHA as `ci.yml` does, and
grant only `contents: write` and `issues: write`. The job has to tolerate a
coverage drop: its purpose is to report new symbols, not to implement them.

## Acceptance

- [ ] `compat/raycast-api/source.json` says 2.10.1, produced by the generators.
- [ ] `Clipboard.paste` honours `closeMainWindow` end to end and
      `revocationEndpoint` is implemented or forwarded, each with tests and
      `@covers` tags.
- [ ] `bun run compat:upgrade 2.10.1` run twice leaves the tree unchanged.
- [ ] The decision logic in the workflow (is an upgrade needed, branch and issue
      naming) lives in a tested script; the YAML only calls it.
- [ ] Handoff states the new coverage headline and the inventory diff.
- [ ] `bun run verify` passes.

## Out of scope

- Changing repository settings, or triggering the workflow on GitHub.
- Repinning the extension corpus (0090).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
