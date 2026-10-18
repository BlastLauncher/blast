# Corpus smoke report

Headless run of every command of the curated extensions at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`, with a deny-all broker and manifest preference
defaults. Regenerate with `bun run corpus:smoke` (network required; not
part of `bun run verify`).

13 commands: rendered 1, bundle-failed 0, crashed 12, timeout 0, unsupported-mode 0.

| Command                                         | Mode | Outcome  | Detail                                                                                                                                                           |
| ----------------------------------------------- | ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axios-docs/index`                              | view | crashed  | code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg… |
| `biaodian/biaodian`                             | view | crashed  | code 1; The requested module '@raycast/api' does not provide an export named 'CopyToClipboardAction'                                                             |
| `code-review-emojis/index`                      | view | crashed  | code 1; The requested module '@raycast/api' does not provide an export named 'Keyboard'                                                                          |
| `conventional-commits/commit-message-structure` | view | crashed  | code 1; The requested module '@raycast/api' does not provide an export named 'Detail'                                                                            |
| `conventional-commits/index`                    | view | crashed  | code 1; The requested module '@raycast/api' does not provide an export named 'Color'                                                                             |
| `fibonacci-sequence/index`                      | view | crashed  | code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg… |
| `markdown-reference/markdown-reference`         | view | crashed  | code 1; The requested module '@raycast/api' does not provide an export named 'Detail'                                                                            |
| `ohmyzsh-git-alias/index`                       | view | crashed  | code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg… |
| `px-to-rem-converter/index`                     | view | rendered | 11 nodes, root List                                                                                                                                              |
| `radix/colors`                                  | view | crashed  | code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg… |
| `radix/primitives`                              | view | crashed  | code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg… |
| `radix/themes`                                  | view | crashed  | code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg… |
| `ratio-calculator/calculate-ratio`              | view | crashed  | code 1; The requested module '@raycast/api' does not provide an export named 'Icon'                                                                              |

## Failures

- `axios-docs/index` (crashed): code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg…
  - log: RUNTIME_ERROR: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You like…
- `biaodian/biaodian` (crashed): code 1; The requested module '@raycast/api' does not provide an export named 'CopyToClipboardAction'
  - log: RUNTIME_ERROR: The requested module '@raycast/api' does not provide an export named 'CopyToClipboardAction'
- `code-review-emojis/index` (crashed): code 1; The requested module '@raycast/api' does not provide an export named 'Keyboard'
  - log: RUNTIME_ERROR: The requested module '@raycast/api' does not provide an export named 'Keyboard'
- `conventional-commits/commit-message-structure` (crashed): code 1; The requested module '@raycast/api' does not provide an export named 'Detail'
  - log: RUNTIME_ERROR: The requested module '@raycast/api' does not provide an export named 'Detail'
- `conventional-commits/index` (crashed): code 1; The requested module '@raycast/api' does not provide an export named 'Color'
  - log: RUNTIME_ERROR: The requested module '@raycast/api' does not provide an export named 'Color'
- `fibonacci-sequence/index` (crashed): code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg…
  - log: RUNTIME_ERROR: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You like…
- `markdown-reference/markdown-reference` (crashed): code 1; The requested module '@raycast/api' does not provide an export named 'Detail'
  - log: RUNTIME_ERROR: The requested module '@raycast/api' does not provide an export named 'Detail'
- `ohmyzsh-git-alias/index` (crashed): code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg…
  - log: RUNTIME_ERROR: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You like…
- `radix/colors` (crashed): code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg…
  - log: RUNTIME_ERROR: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You like…
- `radix/primitives` (crashed): code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg…
  - log: RUNTIME_ERROR: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You like…
- `radix/themes` (crashed): code 1; Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forg…
  - log: RUNTIME_ERROR: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You like…
- `ratio-calculator/calculate-ratio` (crashed): code 1; The requested module '@raycast/api' does not provide an export named 'Icon'
  - log: RUNTIME_ERROR: The requested module '@raycast/api' does not provide an export named 'Icon'
