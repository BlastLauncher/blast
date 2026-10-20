# 0011 — Embedder protocol over stdio

Status: accepted 2026-10-20

## Decision

1. `node packages/serve/src/main.ts` (`bun run blast:serve`) speaks protocol
   version 1. `--native` supplies optional native handlers below embedder grants.
   stdout contains only NDJSON; stderr is diagnostic output.
2. Lines are UTF-8 JSON objects, capped at 8 MiB (0001). Malformed lines emit
   `error {error:{code,message}}` and parsing resumes at the next newline.
   An unterminated final line is malformed. Blank lines are ignored.
3. First send `hello {protocol:1,capabilities:string[]}`. Receive
   `welcome {protocol:1,engine:{version},catalog:CAPABILITIES}`. Unsupported
   versions emit `error` with code `version_mismatch` and exit 2.
4. Requests are `request {id:string,method,params}`. Responses are
   `response {id,ok:true,result}` or `response {id,ok:false,error}`; errors
   have `{code,message,data?}`. IDs must be unique while outstanding.
   Independent requests may finish out of order. Await open/launch responses
   before using their opaque `extension`/`session` IDs.
5. Methods: `extension.open {dir}`; `extension.manifest|watch|unwatch|close
   {extension}`; `extension.dependencies.check|install {extension}`;
   `extension.preferences {extension,command}`; `extension.savePreferences
   {extension,command,values}`; `extension.launch {extension,command,
   argumentValues?,launchContext?}`; `session.event {session,node,handler,args}`;
   `session.close {session}`; `engine.shutdown {}`. Void results are null.
   Launch errors use `missing_values`, with `{preferences,arguments}` data.
6. Server `event` messages carry `event` plus `extension` or `session`:
   `manifest.changed {manifest}`, `manifest.error {error}`,
   `dependencies.log {message}`, `session.scene {scene}` (whole 0001 message),
   `session.log {log}` (0001 log), `session.exited {code,error?}`.
   Events may precede the corresponding response, including during launch.
7. Declared grant capabilities emit `capability.request {id,session,name,params}`.
   Reply `capability.result {id,ok:true,value}` or `{id,ok:false,error}`.
   Send `capability.progress {id,value}` for streaming progress. Runtime abort
   emits `capability.cancel {id}`; late answers are ignored. IDs are global
   within the connection. Undeclared grants are denied unless native supplies
   them; session-owned storage/OAuth/AI retain the engine's internal precedence.
8. EOF and `engine.shutdown` stop accepting requests, finish pending engine
   operations, close all handles/sessions, cancel forwarded work and exit 0.
   `extension.close` also closes its sessions. Logs are drained before exit
   events. Unknown handles produce request errors; invalid methods or params
   are malformed messages.

9. **Views (optional, additive in v1).** Launch with
   `views:{platform:"macOS"|"Windows"|"Linux"}` to create a session controller.
   `session.input {session,input}` accepts client-core semantic inputs and
   returns null. The server forwards controller events, schedules its timer
   effects, and closes on quit. Deduplicated `session.view {session,view}`
   events carry the JSON view model alongside unchanged `session.scene`
   events. Without `views`, sessions retain raw scene/event behaviour.

## Consequences

The dependency-free protocol package owns types and input validation. The
serve package adapts the engine and optional client-core controller; the
generated JSON Schema describes the wire contract.
