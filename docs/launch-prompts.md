# Launch prompts

Part of [embedding.md](embedding.md).

A command that needs required preferences or arguments, or whose dependencies
are not installed, does not have to fail back to you. With `prompts: true` the
launch returns its session id at once and the session's views are:

1. a form (`kind: "form"`, `form.fields`) for the missing preferences
   (password fields hide their value) and all of the command's arguments;
   field ids are the preference name or `argument:<name>`. Each field includes
   `required`; its `info` is present while focused. `primary`/`submit`
   validates required fields (`error: "Required"`), saves preferences and
   continues; `back` ends the session (`session.exited`, code 0);
2. while dependencies install, a `feedback.toast` with style `animated`
   (`message` is the installer's latest line); a failed install is a
   `failure` toast with a Retry action (`toastAction` index 0, or `primary`),
   `back` gives up;
3. then the command's own views, under the same session id.

```text
← {"type":"request","id":"7","method":"extension.launch","params":{"extension":"1","command":"index","prompts":true}}
→ {"type":"response","id":"7","ok":true,"result":{"session":"4"}}
→ {"type":"event","event":"session.view","session":"4","view":{"kind":"form",...}}
← {"type":"request","id":"8","method":"session.input","params":{"session":"4","input":{"type":"setValue","id":"token","value":"..."}}}
← {"type":"request","id":"9","method":"session.input","params":{"session":"4","input":{"type":"primary"}}}
→ {"type":"event","event":"session.view","session":"4","view":{"kind":"list",...}}
```

`prompts` needs views (the hello's or the launch's) and ignores
`installDependencies`: the flow installs what it needs regardless of the
server's `--dependencies` policy. Errors that are not about missing values or
dependencies (a broken bundle) still fail the request or end the session with
`session.exited` carrying an `error`. `extension.configure` (`extension`,
`command`, optional `scope`) starts a session whose view is the selected
preferences form with current values; submit saves and ends it. Launches from
the root view use prompts, and its actions panel (or ⌘⇧,) has Configure
Command.

In process, `startLaunchFlow(extension, "index", { views })` from
`@blastlauncher/engine` returns `{ view, subscribe, input, opened,
argumentValues, cancel }`; `opened` settles with the same `{ session, close }`
as `launch` (or `undefined` when cancelled), and `argumentValues` resolves to
the values used by a successful launch so a client can relaunch directly.
Afterward you drive the command as usual. `engine.root` does this for you.
