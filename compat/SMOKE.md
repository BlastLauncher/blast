# Corpus smoke report

Headless run of every command of the curated extensions at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`, with a deny-all broker and manifest preference
defaults. Regenerate with `bun run corpus:smoke` (network required; not
part of `bun run verify`).

13 commands: rendered 12, bundle-failed 0, crashed 0, timeout 0, unsupported-mode 0, unsupported-api 1.

| Command                                         | Mode | Outcome         | Detail                |
| ----------------------------------------------- | ---- | --------------- | --------------------- |
| `axios-docs/index`                              | view | rendered        | 74 nodes, root List   |
| `biaodian/biaodian`                             | view | rendered        | 131 nodes, root List  |
| `code-review-emojis/index`                      | view | rendered        | 86 nodes, root List   |
| `conventional-commits/commit-message-structure` | view | rendered        | 1 nodes, root Detail  |
| `conventional-commits/index`                    | view | rendered        | 45 nodes, root List   |
| `fibonacci-sequence/index`                      | view | rendered        | 76 nodes, root List   |
| `markdown-reference/markdown-reference`         | view | unsupported-api | useNavigation         |
| `ohmyzsh-git-alias/index`                       | view | rendered        | 1630 nodes, root List |
| `px-to-rem-converter/index`                     | view | rendered        | 11 nodes, root List   |
| `radix/colors`                                  | view | rendered        | 51 nodes, root List   |
| `radix/primitives`                              | view | rendered        | 263 nodes, root List  |
| `radix/themes`                                  | view | rendered        | 427 nodes, root List  |
| `ratio-calculator/calculate-ratio`              | view | rendered        | 2 nodes, root List    |

## Failures

- `markdown-reference/markdown-reference` (unsupported-api): useNavigation
