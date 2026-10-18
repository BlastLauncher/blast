# Corpus smoke report

Headless run of every command of the curated extensions at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`, with a deny-all broker and manifest preference
defaults. Regenerate with `bun run corpus:smoke` (network required; not
part of `bun run verify`).

13 commands: rendered 13, bundle-failed 0, crashed 0, timeout 0, unsupported-mode 0, unsupported-api 0.

| Command                                         | Mode | Outcome  | Detail                      |
| ----------------------------------------------- | ---- | -------- | --------------------------- |
| `axios-docs/index`                              | view | rendered | 76 nodes, root Navigation   |
| `biaodian/biaodian`                             | view | rendered | 133 nodes, root Navigation  |
| `code-review-emojis/index`                      | view | rendered | 88 nodes, root Navigation   |
| `conventional-commits/commit-message-structure` | view | rendered | 3 nodes, root Navigation    |
| `conventional-commits/index`                    | view | rendered | 47 nodes, root Navigation   |
| `fibonacci-sequence/index`                      | view | rendered | 78 nodes, root Navigation   |
| `markdown-reference/markdown-reference`         | view | rendered | 63 nodes, root Navigation   |
| `ohmyzsh-git-alias/index`                       | view | rendered | 1632 nodes, root Navigation |
| `px-to-rem-converter/index`                     | view | rendered | 13 nodes, root Navigation   |
| `radix/colors`                                  | view | rendered | 53 nodes, root Navigation   |
| `radix/primitives`                              | view | rendered | 265 nodes, root Navigation  |
| `radix/themes`                                  | view | rendered | 429 nodes, root Navigation  |
| `ratio-calculator/calculate-ratio`              | view | rendered | 4 nodes, root Navigation    |
