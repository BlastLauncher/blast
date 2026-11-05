# 0013 — Browser runtime: almostnode in a cross-origin sandbox

Status: accepted 2026-11-05; extends 0001 (process model) and 0010 (capabilities)

## Decision

1. **Where untrusted code runs.** In a browser, extension code only runs
   inside almostnode's `SandboxRuntime`, in an iframe on a separate origin
   that holds no user data. The host page never evaluates extension code.
2. **Split by trust.**
   - **Host page (trusted tools):** fetches extension source by URL, resolves
     and downloads npm tarballs (no install scripts), bundles with
     esbuild-wasm, and runs `client-core` and the renderer. Bundling and
     installing read the extension's files but never execute them.
   - **Sandbox (untrusted code):** runs only the finished bundle, Blast's
     runtime, and almostnode's Node built-ins.
3. **Transport.** The runtime's browser entry replaces stdio NDJSON and
   `registerHooks` with `postMessage` framing of the existing protocol
   messages. `@raycast/api`, React and the reconciler are bundled in at build
   time, and `node:*` imports stay external so almostnode serves them.
4. **Capabilities.** Capabilities cross the sandbox boundary as protocol
   requests. The host page answers each one from browser APIs, and denies any
   it cannot back. There is no OS access.
5. **Dependencies.** The same rules as desktop lean installs (0008): only
   packages Blast does not supply; never `@raycast/*`. No lifecycle scripts.
   Native modules fail with a typed error.
6. **almostnode is pinned and patched explicitly.** At 0.2.14 its sandbox
   runtime only bundles for the browser after one import is redirected
   (`shims/child_process` → `shims/child_process-browser`). The build applies
   this and fails loudly if the source changes. Upgrades re-run
   `bun run example:browser:e2e`.

## Why

Spike 0115 (`examples/browser-runtime`, headless Chromium, two local
origins):

- Blast's real runtime rendered a fixture inside almostnode's sandbox.
- Search events and a `clipboard.copy` round trip worked.
- `node:path`, `node:crypto.createHash` and `Buffer` came from almostnode.
- Sandboxed code could not reach the host DOM or storage, and saw no cookies.
- First scene appeared in about 100–140 ms cold and about 60 ms warm, from
  1.5 MB of responses.

Running bundling and installs on the host is what makes "load by URL"
feasible: neither step executes extension code. The spike's in-sandbox
attempts failed for reasons that do not apply there: a Promise returned
across `postMessage`, and installing `@raycast/api` itself.

## Consequences

- **almostnode is a pinned, experimental dependency.** Its npm resolver
  rejected a satisfiable caret range (`@oclif/core@^4`), so installs need
  their own tests and diagnostics, or our own resolver.
- **Browser limits.** Network calls from extensions are subject to CORS, and
  `child_process` and native modules cannot work. Both surface as typed launch
  or runtime errors, not hangs.
- **A second runtime entry and bundle target.** Desktop `blast run` and
  `blast serve` stay unchanged.
