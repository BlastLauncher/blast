# Corpus sweep report

Corpus commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; seed `0091`; 100 selected extensions and 288 commands (288 command records).
Peak .cache 533.3 MB; wall time 113 s; 152.42 commands/min; 0 resumed command(s).
Rendered means a first scene was published; it does not assert that the command works with live data or actions.
Projected full population: 0.6 h; projected peak 533.3 MB.

## Outcomes

- rendered: 176 command(s)
- completed: 0 command(s)
- capability-denied: 3 command(s)
- bundle-failed: 104 command(s)
- bundle-timeout: 0 command(s)
- crashed: 5 command(s)
- network: 0 command(s)
- timeout: 0 command(s)
- unsupported-mode: 0 command(s)
- unsupported-api: 0 command(s)
- missing-arguments: 0 command(s)

## Failure causes

- 19 command(s): missing dependencies: run-applescript
- 13 command(s): missing dependencies: #
- 7 command(s): missing dependencies: @chrismessina/raycast-kit, rust:..
- 6 command(s): missing dependencies: qs
- 5 command(s): missing dependencies: swr
- 4 command(s): Command failed: chmod +x <path> chmod: Unable to change file mode on <path> Operation not permitted
- 4 command(s): missing dependencies: execa, p-queue, valibot
- 3 command(s): missing dependencies: @supernovaio/supernova-sdk, tinycolor2
- 3 command(s): missing dependencies: form-data
- 3 command(s): missing dependencies: js-yaml
- 2 command(s): missing dependencies: @googleapis/calendar
- 2 command(s): missing dependencies: cjk-conv
- 2 command(s): missing dependencies: css.gg
- 2 command(s): missing dependencies: es-toolkit, semver, ts-pattern
- 2 command(s): missing dependencies: say
- 2 command(s): missing dependencies: semver
- 1 command(s): Capability denied: clipboard.copy
- 1 command(s): Capability denied: command.launch
- 1 command(s): Capability denied: storage.get
- 1 command(s): ENOENT: no such file or directory, open '<path>
- 1 command(s): missing dependencies: @hyzyla/pdfium, image-size, pngjs, run-jxa
- 1 command(s): missing dependencies: @mem-labs/mem-node
- 1 command(s): missing dependencies: @supernovaio/supernova-sdk, color-namer, tinycolor2
- 1 command(s): missing dependencies: @supernovaio/supernova-sdk, parse-url, tinycolor2
- 1 command(s): missing dependencies: @supernovaio/supernova-sdk, run-applescript, tinycolor2
- 1 command(s): missing dependencies: @tanstack/query-async-storage-persister, @tanstack/react-query, @tanstack/react-query-persist-client, chartjs-to-image, fastest-levenshtein
- 1 command(s): missing dependencies: bignumber.js, nzh
- 1 command(s): missing dependencies: bplist-parser
- 1 command(s): missing dependencies: change-case, got, sort-keys
- 1 command(s): missing dependencies: csv-parse, say
- 1 command(s): missing dependencies: culori
- 1 command(s): missing dependencies: culori, json5, style-dictionary
- 1 command(s): missing dependencies: expand-tilde, plist
- 1 command(s): missing dependencies: extract-zip, proper-lockfile, sanitize-filename, tar
- 1 command(s): missing dependencies: glob, gray-matter
- 1 command(s): missing dependencies: glob, gray-matter, open
- 1 command(s): missing dependencies: got
- 1 command(s): missing dependencies: iconv-lite
- 1 command(s): missing dependencies: jalali-moment
- 1 command(s): missing dependencies: jimp, pixelmatch
- 1 command(s): missing dependencies: laravel-echo, pusher, pusher-js
- 1 command(s): missing dependencies: ldapts
- 1 command(s): missing dependencies: lodash.unescape
- 1 command(s): missing dependencies: node-html-parser
- 1 command(s): missing dependencies: open
- 1 command(s): missing dependencies: pinyin-pro
- 1 command(s): missing dependencies: semver, ts-pattern
- 1 command(s): missing dependencies: simple-icons
- 1 command(s): missing dependencies: turndown

## Unsupported and denied capabilities

- 1 command(s): clipboard.copy
- 1 command(s): command.launch
- 1 command(s): storage.get

The per-command log remains in `.cache/sweep/results.jsonl` and is intentionally not committed.
