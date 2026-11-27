# Launch prompts

Part of [embedding.md](embedding.md).

A command that needs required preferences, arguments, or dependencies does not
have to fail back to you. With `prompts: true`, `extension.launch` returns its
session id immediately and streams these views:

1. A form (`kind: "form"`, `form.fields`) for missing preferences (password
   fields hide their value) and all command arguments; field ids are the
   preference name or `argument:<name>`. Each field includes `required`, and
   `info` while focused. `primary`/`submit` validates required fields
   (`error: "Required"`), saves preferences, and continues; `back` ends the
   session (`session.exited`, code 0).
2. While dependencies install, a `feedback.toast` with style `animated`
   (`message` is the installer's latest line). A failed install shows a
   `failure` toast with Retry (`toastAction` index 0, or `primary`); `back`
   cancels.
3. The command's own views under the same session id.

```text
← {"type":"request","id":"7","method":"extension.launch","params":{"extension":"1","command":"index","prompts":true}}
→ {"type":"response","id":"7","ok":true,"result":{"session":"4"}}
→ {"type":"event","event":"session.view","session":"4","revision":1,"view":{"kind":"form",...}}
← {"type":"request","id":"8","method":"session.input","params":{"session":"4","input":{"type":"setValue","id":"token","value":"..."}}}
← {"type":"request","id":"9","method":"session.input","params":{"session":"4","input":{"type":"primary"}}}
→ {"type":"event","event":"session.view.patch","session":"4","revision":3,"baseRevision":2,"ops":[...]}
```

`prompts` requires `views` (in `hello` or launch params) and installs missing
dependencies regardless of `--dependencies`. Non-prompt errors (e.g. a broken
bundle) fail the request or end the session with `session.exited` carrying
`error`. `extension.configure` (`extension`, `command`, optional `scope`) opens
the preferences form with current values; submit saves and ends the session.
Root launches enable prompts automatically.

In process, `startLaunchFlow(extension, "index", { views })` from
`@blastlauncher/engine` returns `{ view, subscribe, input, opened,
argumentValues, cancel }`; `opened` resolves to `{ session, close }` (or
`undefined` on cancel), and `argumentValues` resolves to the submitted values.
`engine.root` wraps this flow for you.
