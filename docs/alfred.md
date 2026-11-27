# Alfred workflows

Blast runs Alfred workflows next to Raycast extensions (decision 0021). A
source is an unpacked workflow directory (`info.plist`, no `package.json`) or
an `.alfredworkflow` archive. Archives are extracted once per content hash into
`<dataDir>/workflows/`; nothing is installed. Each command runs in its own
`@blastlauncher/alfred/main` child that speaks protocol v1, so every client
draws workflows unchanged.

## Running a workflow

```bash
bun run blast run ./MyWorkflow.alfredworkflow search --argument query=hello
bun run tui ./MyWorkflow.alfredworkflow ./my-raycast-extension
bun run blast:serve --native        # then extension.open {"dir": "<workflow>"}
```

- `blast run` prints scenes as text (`--json` for NDJSON); see [cli.md](cli.md).
- `blast-tui` lists workflow commands in the root view; see [tui.md](tui.md).
- `blast serve` (`extension.open`, [embedding.md](embedding.md)) and in-process
  `createEngine().openExtension({ extensionDir })` take a workflow path.

Commands are the workflow's entry objects: Keywords, Script, List and File
Filters with a keyword; failing that, inputs nothing connects into; failing
that, External Triggers. A Keyword's text arrives as the `query` argument
(required when its argument is required, absent when it takes none).

## Supported objects

`SUPPORTED_OBJECT_TYPES` and, per `taskuid`, `SUPPORTED_AUTOMATION_TASKS` in
`@blastlauncher/alfred` are the source of truth; `support.test.ts` checks both.

| Group          | Types                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inputs         | Keyword, Script Filter, List Filter, File Filter, External Trigger                                                                                     |
| User interface | Text View, Grid View, Image View                                                                                                                       |
| Actions        | Run Script, Run NSAppleScript, Open URL, Open File, Reveal in Finder, Launch Apps/Files, Default Web Search                                            |
| Automation     | Run Shortcut; core Automation Tasks (files and folders, text, arguments, window bounds, current app, frontmost tab)                                    |
| Outputs        | Copy to Clipboard, Post Notification, Large Type, Write Text File, Call External Trigger, Play Sound, Speak                                            |
| Utilities      | Junction, Arg and Vars, Conditional, Filter, Replace, Split, Join, Transform, JSON Config, Delay, Debug, Hide Alfred, Dialog, Random, Expression, File |

Hotkey, Universal Action, File Action, Fallback Search, Snippet and Remote
triggers (`PASSIVE_TRIGGER_TYPES`) are ignored: only Alfred can fire them, and
the objects they lead to stay reachable from other entries. Anything else
(other Automation Tasks, …) stops its branch with a named warning; the host
never crashes. Expression evaluates arithmetic (`+ - * / % ^`, `pi`, `sqrt`,
…) with its own parser, never JavaScript `eval`.

Script Filters follow Alfred's JSON and legacy XML output, `rerun`, `cache`
(with `loosereload`), `variables`, modifiers, `autocomplete`, `quicklookurl`,
`text.copy` / `text.largetype`, queue delay modes, and "Alfred filters
results". A pending queue delay shows a loading state rather than "No
Results". Lists over `MAX_SCENE_ITEMS` (200) items are filtered in the runtime
(every word must appear in the title, subtitle or `match`; title matches rank
first unless `fixedorder`) and only the best 200 are sent.

File Filters ask Spotlight (`mdfind -onlyin`) on macOS; elsewhere, or when it
fails or finds nothing in an existing (unindexed) scope, a bounded folder walk
answers. Both honour scopes (`~`, `{var:…}`, `config` overrides), UTIs with
supertypes, `not` field filters, date range, sort mode and limit (≤ 200).

## Preferences

`userconfigurationconfig` maps to Blast preferences, prompted and stored like
extension preferences:

| Alfred          | Blast preference                   |
| --------------- | ---------------------------------- |
| Text field/view | `textfield` (placeholder, default) |
| Checkbox        | `checkbox` (label from its text)   |
| Popup button    | `dropdown` (pairs become options)  |
| File picker     | `file`, or `directory` for folders |
| Slider          | `textfield` holding the number     |

A required field with an empty default stays unset so the launch flow asks for
it. Scripts see the values as workflow variables, layered as Alfred does:
configuration defaults, workflow variables, stored preferences, then session
variables.

## Scripts and brokered capabilities

Scripts run with Alfred's interpreters and argv / `{query}` conventions, in the
workflow folder, in their own process group (killed on cancel or shutdown).
They get the `alfred_*` environment: `alfred_workflow_data`,
`alfred_workflow_cache`, `alfred_workflow_bundleid`, `alfred_version` and
`alfred_theme_background`, which follows the host's light or dark appearance.

Privileged actions go through the broker and are denied unless the host grants
them: `clipboard.*` (`clipboard.read` backs `{clipboard}`), `open.url`,
`open.path`, `finder.show`, `trash`, `applications.frontmost`, `browser.tabs`
and `window.*`. See [capabilities.md](capabilities.md).

## Platform notes

- AppleScript and JavaScript for Automation scripts, Run NSAppleScript and Run
  Shortcut (`shortcuts run`) need macOS; elsewhere they fail with a named
  reason. Play Sound (`afplay`) and Speak (`say`) only log a warning there.
- Interpreters use Alfred's fixed paths (`/usr/bin/php`, …). One that is
  missing (newer macOS ships no PHP or Python 2) is looked up on the script's
  `PATH`, then `/opt/homebrew/bin` and `/usr/local/bin` on macOS.
- Archives are read with zip-slip, symlink, entry-count and size limits;
  executable bits survive so external scripts run.

## Measuring a corpus

Compatibility is measured against real workflows, never claimed. Point the
analyzer at a folder of downloaded workflows (it reads archives in memory and
runs nothing):

```bash
bun run alfred:analyze ./workflows          # summary
bun run alfred:analyze ./workflows --json   # per-workflow detail
bun run alfred:analyze ./workflows --top 20
```

It reports workflows found, how many parse with a valid manifest, have a
runnable entry, and are fully supported; object counts (supported, passive,
unsupported); execution coverage (supported share of non-passive objects); and
the most common unsupported types (an Automation Task by its `taskuid`). Keep
third-party workflows out of the repository.
