# Browser runtime spike

`e2e.ts` is a deliberately small feasibility harness. It installs the pinned
`almostnode@0.2.14` and `playwright@1.58.0` packages only when the check runs,
keeps Chromium under `.cache/ms-playwright`, starts two localhost origins, and
closes both servers in `finally`.

The host imports almostnode's prebundled browser distribution and creates a
cross-origin `createRuntime` sandbox. The command source in the VFS is a
browser-safe stand-in for the pre-bundled `hello-list`: it emits the same list
scene, handles search and selection, and models the `clipboard.copy` capability
as a host round trip. This isolates the browser/runtime transport questions
while the Node bundle and `packages/runtime` changes remain listed in the task
handoff rather than being silently implied to work.

Run:

```sh
bun run example:browser:e2e
```
