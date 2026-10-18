# Corpus smoke report

Headless run of every command of the curated extensions at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`, with a deny-all broker and manifest preference
defaults. Regenerate with `bun run corpus:smoke` (network required; not
part of `bun run verify`).

13 commands: rendered 2, bundle-failed 0, crashed 0, timeout 0, unsupported-mode 0, unsupported-api 11.

| Command                                         | Mode | Outcome         | Detail               |
| ----------------------------------------------- | ---- | --------------- | -------------------- |
| `axios-docs/index`                              | view | unsupported-api | Action.OpenInBrowser |
| `biaodian/biaodian`                             | view | unsupported-api | PasteAction          |
| `code-review-emojis/index`                      | view | unsupported-api | Action.OpenInBrowser |
| `conventional-commits/commit-message-structure` | view | unsupported-api | Detail               |
| `conventional-commits/index`                    | view | unsupported-api | Action.Paste         |
| `fibonacci-sequence/index`                      | view | unsupported-api | Action.Paste         |
| `markdown-reference/markdown-reference`         | view | unsupported-api | useNavigation        |
| `ohmyzsh-git-alias/index`                       | view | unsupported-api | Action.Paste         |
| `px-to-rem-converter/index`                     | view | rendered        | 11 nodes, root List  |
| `radix/colors`                                  | view | unsupported-api | Action.OpenInBrowser |
| `radix/primitives`                              | view | unsupported-api | Action.OpenInBrowser |
| `radix/themes`                                  | view | unsupported-api | Action.OpenInBrowser |
| `ratio-calculator/calculate-ratio`              | view | rendered        | 2 nodes, root List   |

## Failures

- `axios-docs/index` (unsupported-api): Action.OpenInBrowser
- `biaodian/biaodian` (unsupported-api): PasteAction
- `code-review-emojis/index` (unsupported-api): Action.OpenInBrowser
- `conventional-commits/commit-message-structure` (unsupported-api): Detail
- `conventional-commits/index` (unsupported-api): Action.Paste
- `fibonacci-sequence/index` (unsupported-api): Action.Paste
- `markdown-reference/markdown-reference` (unsupported-api): useNavigation
- `ohmyzsh-git-alias/index` (unsupported-api): Action.Paste
- `radix/colors` (unsupported-api): Action.OpenInBrowser
- `radix/primitives` (unsupported-api): Action.OpenInBrowser
- `radix/themes` (unsupported-api): Action.OpenInBrowser
