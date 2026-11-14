# 0013 — Browser runtime: almostnode sandbox

Status: accepted 2026-11-05; refines 0001 and 0010

## Decision

Browser extensions run only in almostnode's `SandboxRuntime` inside a
cross-origin iframe. The trusted host page fetches sources, resolves npm
archives without lifecycle scripts, bundles with esbuild-wasm, and runs
`client-core` and the renderer; it never evaluates extension code. The sandbox
runs the finished bundle, Blast runtime and almostnode built-ins.

The browser entry replaces stdio framing and hook registration with
`postMessage` transport for the existing protocol. Raycast API, React and the
reconciler are bundled; `node:*` imports remain external to almostnode.
Capabilities cross the boundary as protocol requests and unsupported OS access
is denied. Dependency and native-module failures are typed launch/runtime
errors. almostnode remains pinned and its required child-process shim patch is
checked by the browser end-to-end workflow.

## Why

The split keeps extension code away from the host DOM, cookies and storage
while retaining the desktop runtime's protocol and dependency rules.

## Consequences

Network calls are subject to CORS, native modules and child processes cannot
work, and the browser has a separate runtime entry and bundle target.
