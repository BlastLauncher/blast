# Corpus smoke report

Headless run of every command of the curated extensions at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`, with Blast's headless broker — deny-all except the
read-only defaults `applications.list` (empty), `clipboard.read` (empty)
and `preferences.open` (recorded) — and manifest preference defaults.
Regenerate with `bun run corpus:smoke` (network required; not part of
`bun run verify`).

66 commands: rendered 61, completed 1, capability-denied 2, bundle-failed 0, crashed 0, timeout 0, unsupported-mode 1, unsupported-api 1.

| Command                                                          | Mode     | Outcome           | Detail                                                     |
| ---------------------------------------------------------------- | -------- | ----------------- | ---------------------------------------------------------- |
| `8-divide/divide-by-8`                                           | view     | rendered          | 3 nodes, root Navigation                                   |
| `android-versions/search-android-version`                        | view     | rendered          | 273 nodes, root Navigation                                 |
| `atomtick/analog-clock`                                          | view     | rendered          | 12 nodes, root Navigation                                  |
| `atomtick/copy-atomic-time`                                      | no-view  | capability-denied | denied capability clipboard.copy                           |
| `axios-docs/index`                                               | view     | rendered          | 76 nodes, root Navigation                                  |
| `biaodian/biaodian`                                              | view     | rendered          | 133 nodes, root Navigation                                 |
| `chakra-ui-docs/components`                                      | view     | rendered          | 616 nodes, root Navigation                                 |
| `chakra-ui-docs/get-started`                                     | view     | rendered          | 43 nodes, root Navigation                                  |
| `chakra-ui-docs/hooks`                                           | view     | rendered          | 103 nodes, root Navigation                                 |
| `chakra-ui-docs/styled-system`                                   | view     | rendered          | 83 nodes, root Navigation                                  |
| `code-review-emojis/index`                                       | view     | rendered          | 88 nodes, root Navigation                                  |
| `conventional-commits/commit-message-structure`                  | view     | rendered          | 3 nodes, root Navigation                                   |
| `conventional-commits/index`                                     | view     | rendered          | 47 nodes, root Navigation                                  |
| `devpod/workspaces-manage`                                       | view     | rendered          | 7 nodes, root Navigation                                   |
| `dice-tiles/index`                                               | view     | rendered          | 19 nodes, root Navigation                                  |
| `donut/show-donut`                                               | view     | rendered          | 3 nodes, root Navigation                                   |
| `ego-lite/new-tab`                                               | no-view  | rendered          | 4 nodes, root Navigation                                   |
| `ego-lite/search-bookmarks`                                      | view     | rendered          | 4 nodes, root Navigation                                   |
| `ego-lite/search-history`                                        | view     | rendered          | 4 nodes, root Navigation                                   |
| `evernote/search-notes`                                          | view     | rendered          | 3 nodes, root Navigation                                   |
| `evernote/search-tasks`                                          | view     | rendered          | 3 nodes, root Navigation                                   |
| `fibonacci-sequence/index`                                       | view     | rendered          | 78 nodes, root Navigation                                  |
| `google-cloud-run/index`                                         | view     | rendered          | 6 nodes, root Navigation                                   |
| `google-maps-search/find`                                        | view     | rendered          | 4 nodes, root Navigation                                   |
| `google-maps-search/quickSearchMaps`                             | no-view  | completed         | command mode "no-view" completed without rendering a scene |
| `google-maps-search/travelHome`                                  | no-view  | capability-denied | denied capability open.url                                 |
| `google-maps-search/travelTo`                                    | view     | rendered          | 18 nodes, root Navigation                                  |
| `invisible-text-detector/analyze-clipboard-invisible-characters` | no-view  | rendered          | 3 nodes, root Navigation                                   |
| `invisible-text-detector/fix-invisible-characters`               | no-view  | rendered          | 3 nodes, root Navigation                                   |
| `invisible-text-detector/open-invisible-text-detector`           | view     | rendered          | 32 nodes, root Navigation                                  |
| `laravel-shift/generate-shift`                                   | view     | rendered          | 59 nodes, root Navigation                                  |
| `markdown-reference/markdown-reference`                          | view     | rendered          | 63 nodes, root Navigation                                  |
| `menucloak/open-settings`                                        | no-view  | rendered          | 4 nodes, root Navigation                                   |
| `menucloak/set-focus`                                            | view     | rendered          | 7 nodes, root Navigation                                   |
| `menucloak/toggle`                                               | no-view  | rendered          | 4 nodes, root Navigation                                   |
| `menucloak/turn-off`                                             | no-view  | rendered          | 4 nodes, root Navigation                                   |
| `menucloak/turn-on`                                              | no-view  | rendered          | 4 nodes, root Navigation                                   |
| `mise-window-sets/apply-set`                                     | view     | rendered          | 3 nodes, root Navigation                                   |
| `mise-window-sets/reload-sets`                                   | no-view  | rendered          | 3 nodes, root Navigation                                   |
| `nano-games/play-nano-snake`                                     | view     | rendered          | 8 nodes, root Navigation                                   |
| `nterm-calculator/nterm-calculator`                              | view     | rendered          | 39 nodes, root Navigation                                  |
| `ohmyzsh-git-alias/index`                                        | view     | rendered          | 1632 nodes, root Navigation                                |
| `one-thing/remove-one-thing`                                     | no-view  | unsupported-api   | closeMainWindow                                            |
| `one-thing/set-one-thing`                                        | view     | rendered          | 7 nodes, root Navigation                                   |
| `one-thing/show-one-thing`                                       | menu-bar | unsupported-mode  | command mode "menu-bar" is not supported                   |
| `pinch-svg/custom-rectangle`                                     | view     | rendered          | 2 nodes, root Navigation                                   |
| `pinch-svg/grid`                                                 | view     | rendered          | 8 nodes, root Navigation                                   |
| `pokemon-tcg-pocket-binder/pokemon-tcg-pocket-binder`            | view     | rendered          | 39 nodes, root Navigation                                  |
| `portless/list`                                                  | view     | rendered          | 3 nodes, root Navigation                                   |
| `promptty/search-promptty`                                       | view     | rendered          | 4 nodes, root Navigation                                   |
| `px-to-rem-converter/index`                                      | view     | rendered          | 13 nodes, root Navigation                                  |
| `radix/colors`                                                   | view     | rendered          | 53 nodes, root Navigation                                  |
| `radix/primitives`                                               | view     | rendered          | 265 nodes, root Navigation                                 |
| `radix/themes`                                                   | view     | rendered          | 429 nodes, root Navigation                                 |
| `ratio-calculator/calculate-ratio`                               | view     | rendered          | 4 nodes, root Navigation                                   |
| `raytyping/raytype`                                              | view     | rendered          | 15 nodes, root Navigation                                  |
| `rtl-reader/rtl-text`                                            | view     | rendered          | 9 nodes, root Navigation                                   |
| `spacejump/list-spaces`                                          | view     | rendered          | 3 nodes, root Navigation                                   |
| `spacejump/switch-space`                                         | view     | rendered          | 3 nodes, root Navigation                                   |
| `storybook-sandboxes/local`                                      | view     | rendered          | 538 nodes, root Navigation                                 |
| `storybook-sandboxes/online`                                     | view     | rendered          | 538 nodes, root Navigation                                 |
| `tategaki/japanese-vertical-text`                                | view     | rendered          | 24 nodes, root Navigation                                  |
| `url-designer/create-prompt`                                     | view     | rendered          | 6 nodes, root Navigation                                   |
| `vim-bro/index`                                                  | view     | rendered          | 924 nodes, root Navigation                                 |
| `windows-domain/my-user`                                         | view     | rendered          | 5 nodes, root Navigation                                   |
| `windows-domain/search-user`                                     | view     | rendered          | 4 nodes, root Navigation                                   |

## Failures

- `atomtick/copy-atomic-time` (capability-denied): denied capability clipboard.copy
- `google-maps-search/travelHome` (capability-denied): denied capability open.url
- `one-thing/remove-one-thing` (unsupported-api): closeMainWindow
- `one-thing/show-one-thing` (unsupported-mode): command mode "menu-bar" is not supported
