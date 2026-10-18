# ADR 0033: Measured import shapes

- Status: accepted
- Date: 2026-08-29

The fetch-specific boundary below was superseded by [ADR
0089](0089-allow-permissive-runtime-fetch.md) on 2026-08-31. The import-shape
decision remains active for the other four forms.

## Context

The corpus probe found twelve literal dynamic imports, four namespace imports,
one side-effect import, one literal `require`, and one `fetch` import from
`@raycast/api`. The first four forms resolve through the existing esbuild alias
and use API members that are already measured by the compatibility adapter. The
`fetch` import is not a Raycast API export in the pinned declaration and would
imply unbrokered network access if added as a convenience.

## Decision

- Treat literal `import()` calls, namespace imports, and side-effect imports of
  `@raycast/api` as supported import shapes when the accessed members are part
  of the measured adapter surface. Treat a literal `require("@raycast/api")`
  the same way for the CommonJS bundles produced by the Node runtime.
- Keep the import alias launcher-owned so all three forms share the same
  compatibility module and capability context as named imports.
- At the time of this decision, keep `fetch` outside the compatibility surface
  until a separately designed host network capability defines URL policy,
  consent, and response limits. The later fetch-specific boundary is recorded
  in ADR 0089.
- Cover the four safe forms with a real child-process fixture and keep the
  corpus probe's static allowlist explicit.

## Consequences

Import syntax no longer creates a false static blocker for measured API
members, while unsupported named members still fail through the adapter's
structured compatibility boundary. The fetch-specific probe behavior was
later superseded by ADR 0089.
