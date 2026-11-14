# Root view

Part of [embedding.md](embedding.md).

The engine serves Raycast-style root search over every opened extension's
commands as an ordinary list view, so an embedder writes no command picker:
sections per extension, subtitles, mode labels, icons and an "Open Command"
action. Over stdio it is `root.open`; in process it is `engine.root`.

## Over stdio

`root.open {views?}` returns `{root}`; `views` defaults to the hello's and one
of the two is required. `root.view` carries the whole list again after every
change, including extensions opened, closed or edited later. `root.input`
takes the usual semantic inputs (`search`, `move`, `select`, `primary`,
`openActions`, `back`, …); others are ignored.

A `primary` starts the selected command as a normal session and reports it
with `root.launched {root, session}`. From then on draw that session's
`session.view` events and send `session.input`. A launch with missing
preferences, arguments or dependencies shows the
[launch prompts](launch-prompts.md) as that session's views; any other
failure stays on the root with a failure toast. `back` at the command's root
closes it; after `session.exited` the root resumes with a fresh `root.view`
and its search cleared. The actions panel (⌘⇧,) has Configure Command, which
opens the command's preferences form as a session (`extension.configure`).
`root.close` releases the root.

## In process

```js
const root = engine.root({ views: { platform: "macOS" } });
await root.ready(); // manifests of the extensions opened so far are read
root.subscribe((view) => draw(view));
root.input({ type: "primary" });
```

`engine.root(options)` returns `{ view, subscribe, input, ready, close }` over
every extension opened on the engine. After a `primary` the view is the launch
prompt's, then the running command's, until its session ends; then the root
list returns. A host that keys sessions itself (as `blast serve` does) passes
`launch(target)` in the options and runs the command its own way; the root
waits for the returned `exited` promise.
