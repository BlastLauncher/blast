# 0002 — Extension dependency resolution

Status: accepted 2026-10-18; amended by task 0037 (interim allowlist)

## Decision

Until v1, extensions run without installing their dependencies. The host's
esbuild plugin resolves imports in this order:

1. `@raycast/api`, `react`, and `react/*` stay external; the runtime supplies them.
2. `PROVIDED_PACKAGES` in `packages/host/src/dependencies.ts` resolves from the
   host's exact pins, including subpaths; corpus selection uses the same list.
   Transitive graphs are bundled privately, with the same API/React externals.
3. Node built-ins stay external, using Node's list even when Bun bundles.
   Other bare imports fail even if locally installed. Emitted external imports
   are checked before writing the bundle; unresolved npm imports fail there too.

Pick greedily by `compat/dependencies.json` imported rank (ties by name), using
latest exact versions in each most-declared major. Hard filters: non-portable
macOS automation, native addons, dependency install hooks, browser/CLI binaries,
or a single installed graph over 15 MB of logical bytes (`du -sb`, including
transitives). Total added allocated disk space (`du -sk`) must stay ≤ 75 MiB.
Keep higher-ranked eligible picks before lower ones; on overflow remove the
lowest-ranked pick. Do not fill leftover space with packages below that cutoff.

Ranks 1–14 yield 13 additions through `node-html-markdown`; `run-applescript`
(rank 4) is excluded as macOS automation. `date-fns@4.4.0` is 10,902,084 bytes
unpacked, 11,893,316 logical installed graph bytes, but 28,076 KiB allocated due
to its many small files. It meets the logical graph guard; its allocated cost
counts fully toward the total. `zod` (6.1 MB unpacked) also earns its size by
rank (64 importing extensions); both graphs have no native addons/install hooks.

Adding rank 15 `rss-parser` exceeds the budget (77.01 MiB added). Lower-ranked
`execa`, `got`, `turndown`, `fs-extra`, `openai`, `plist`, `swr`,
`raycast-cross-extension`, `fast-xml-parser`, `form-data`, `yaml`, `algoliasearch`,
`ai`, `chrono-node`, `javascript-time-ago`, and all later ranks are excluded by
that cutoff, even when individually small enough. Rechecked installed logical
graphs: `turndown` 8.07 MB, `openai` 11.86 MB, `chrono-node` 3.89 MB; none has
native addons/install hooks. `javascript-time-ago` also exceeds 15 MB (15.74 MB).
Exact pins, sizes and before/after allocated totals are in task 0037's Handoff.

Extensions receive the shared major even when they declare another one. The CLI
prints a `# log` warning (JSON: warning record) naming package, declared range
and provided version when the range excludes that major entirely; non-semver
ranges are skipped. Missing dependencies expose `MissingDependencyError`, code
`MISSING_DEPENDENCY`, and sorted unique package names; the CLI exits 3. Optional
imports in provided graphs retain esbuild's normal try/catch handling.

CommonJS globals derive from the bundled `import.meta.url`. Static `require`
follows import policy; dynamic `require` allows only Node built-ins.

## Consequences

- Explicitly interim until the first release: production should use a thin layer
  referencing each extension repo's own pinned dependencies with minimal disk.
- No extension-local lookup, source changes, or per-extension installs.
- Tree shaking utils avoids linking unused shim symbols. Assets need provisioning.
- Bundling policy is not a security sandbox for arbitrary Node code.
- Package satisfaction counts names, not major/API/host-capability compatibility.
