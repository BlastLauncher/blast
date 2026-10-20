# 0008 — Installed extension dependencies

Status: accepted 2026-10-19; extends 0002 (the shared allowlist stays as fallback)

## Decision

1. **An explicit build step installs an extension's own dependencies.**
   `blast deps <extensionDir>` (and the TUI before its first launch) installs
   the manifest's production `dependencies` at the versions pinned by the
   extension's own `package-lock.json`. Without a lockfile it installs the
   declared ranges and warns that versions are unpinned.
2. **Never inside the extension.** Installs go to
   `<dataDir>/deps/<encoded extension name>/` (dataDir as in storage), holding
   copies of `package.json`/`package-lock.json`, `node_modules/` and a `key`
   file. The key is a SHA-256 of the dependency fields and the lockfile; a key
   change replaces the directory, so each extension keeps at most one install.
   Extension source is never written, matching AGENTS.md.
3. **Runtime-supplied packages are stripped before install.** `@raycast/api`,
   `react`, `react/*` and `@types/*` are removed from the copied manifest (the
   real `@raycast/api` is ~30 MB plus esbuild/oclif). They stay external at
   bundle time exactly as today. `react-dom` is installed and bundled against
   the runtime's `react`.
4. **Installer:** `npm install --omit=dev --ignore-scripts --no-audit --no-fund`
   in that directory, using the copied lockfile so pinned versions win. npm
   ships with Node 24, so the host stays Node-runnable. Install hooks never run;
   native addons that need them fail at runtime with their own error.
5. **Resolution order at bundle time:** API/React externals → the
   extension's installed `node_modules` (when its key matches the current
   manifest and lockfile) → optional `@blastlauncher/shared-deps` (0002) → missing-dependency
   error. That error now names `blast deps` as the fix when a declared
   dependency is not installed, or `@blastlauncher/shared-deps` for the fallback.
   Installed packages bundle with the same
   externals and Node built-in rules as provided ones.
6. **Corpus tooling does not install.** `corpus:smoke` and the TUI smoke stay
   allowlist-only (`bundleCommand({ installedDependencies: false })`) and offline
   after fetch, so reports remain comparable and
   disk-bounded. The one exception is `corpus:smoke-deps`, a separate report
   over a dependency-heavy set that installs each extension, runs it and deletes
   the install before the next.

## Why

The extensions people actually use declare packages beyond the allowlist, and
they also need their own `@raycast/utils` major. Installing from the
extension's own lockfile is the "thin, pinned layer" 0002 promised. Keeping it
outside the extension and keyed per extension bounds disk use to one install
per extension, which can be deleted at any time.

## Consequences

- Network is needed once per extension and lockfile change. `bun test` never
  installs from the registry: tests inject the installer or use offline
  `file:` dependencies.
- Dependency code still runs only in the command's child process. The bundle
  policy is not a sandbox (0002), and skipping install scripts removes the
  install-time attack surface.
- An installed `@raycast/utils` replaces the shared copy for that extension,
  so the major-version mismatch warning goes away.
