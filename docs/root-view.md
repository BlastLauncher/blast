# Root view

Part of [embedding.md](embedding.md).

The engine serves a Raycast-style root search over every opened extension's
commands as a list view, so an embedder writes no command picker: sections per
extension, subtitles, mode labels, icons, and an "Open Command" action. Over
stdio it is `root.open`; in process it is `engine.root`.

## Over stdio

`root.open {views?}` returns `{root}`; `views` falls back to `hello.views` and
one of the two is required. `root.view` sends the initial list (`revision: 1`),
and updates arrive as `root.view.patch` events (including extensions opened,
closed, or edited later); send `root.resync {root}` for a fresh full
`root.view`. `root.input` accepts semantic inputs (`search`, `move`, `select`,
`primary`, `openActions`, `back`, …); others are ignored.

A `primary` input launches the selected command as a session and emits
`root.launched {root, session}`. From then on, draw that session's
`session.view` / `session.view.patch` events and send `session.input`. Missing
preferences, arguments, or dependencies run as [launch prompts](launch-prompts.md)
on that session; other launch errors stay on the root with a failure toast.
`back` at the command's root closes it; after `session.exited` the root resumes
with its search cleared.

The actions panel (`⌘⇧,`) includes Configure Command, which opens the command's
preferences form as a session (`extension.configure`). `root.close` releases the
root.

## In process

```js
const root = engine.root({ views: { platform: "macOS" } });
await root.ready(); // manifests of extensions opened so far are read
root.subscribe((view) => draw(view));
root.input({ type: "primary" });
```

`engine.root(options)` returns `{ view, subscribe, input, ready, close }` over
every extension opened on the engine. After `primary`, `view` becomes the launch
prompt's, then the running command's, until its session ends and the root list
returns. Hosts that key sessions themselves (like `blast serve`) pass
`launch(target)` and return an `{ exited }` promise.
