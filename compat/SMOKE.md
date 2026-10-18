# Corpus smoke report

Headless run of every command of the curated extensions at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`, with a deny-all broker and manifest preference
defaults. Regenerate with `bun run corpus:smoke` (network required; not
part of `bun run verify`).

13 commands: rendered 9, bundle-failed 0, crashed 0, timeout 0, unsupported-mode 0, unsupported-api 4.

| Command                                         | Mode | Outcome         | Detail                      |
| ----------------------------------------------- | ---- | --------------- | --------------------------- |
| `axios-docs/index`                              | view | rendered        | 76 nodes, root Navigation   |
| `biaodian/biaodian`                             | view | rendered        | 133 nodes, root Navigation  |
| `code-review-emojis/index`                      | view | rendered        | 88 nodes, root Navigation   |
| `conventional-commits/commit-message-structure` | view | rendered        | 3 nodes, root Navigation    |
| `conventional-commits/index`                    | view | rendered        | 47 nodes, root Navigation   |
| `fibonacci-sequence/index`                      | view | rendered        | 78 nodes, root Navigation   |
| `markdown-reference/markdown-reference`         | view | unsupported-api | ActionPanel.Item            |
| `ohmyzsh-git-alias/index`                       | view | rendered        | 1632 nodes, root Navigation |
| `px-to-rem-converter/index`                     | view | rendered        | 13 nodes, root Navigation   |
| `radix/colors`                                  | view | unsupported-api | List.Item.Detail            |
| `radix/primitives`                              | view | unsupported-api | List.Item.Detail            |
| `radix/themes`                                  | view | unsupported-api | List.Item.Detail            |
| `ratio-calculator/calculate-ratio`              | view | rendered        | 4 nodes, root Navigation    |

## Failures

- `markdown-reference/markdown-reference` (unsupported-api): ActionPanel.Item
- `radix/colors` (unsupported-api): List.Item.Detail
- `radix/primitives` (unsupported-api): List.Item.Detail
- `radix/themes` (unsupported-api): List.Item.Detail
