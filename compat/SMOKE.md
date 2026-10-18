# Corpus smoke report

Headless run of every command of the curated extensions at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`, with a deny-all broker and manifest preference
defaults. Regenerate with `bun run corpus:smoke` (network required; not
part of `bun run verify`).

66 commands: rendered 35, bundle-failed 0, crashed 2, timeout 0, unsupported-mode 2, unsupported-api 27.

| Command                                                          | Mode     | Outcome          | Detail                                                     |
| ---------------------------------------------------------------- | -------- | ---------------- | ---------------------------------------------------------- |
| `8-divide/divide-by-8`                                           | view     | rendered         | 3 nodes, root Navigation                                   |
| `android-versions/search-android-version`                        | view     | rendered         | 273 nodes, root Navigation                                 |
| `atomtick/analog-clock`                                          | view     | unsupported-api  | Cache                                                      |
| `atomtick/copy-atomic-time`                                      | no-view  | unsupported-api  | Cache                                                      |
| `axios-docs/index`                                               | view     | rendered         | 76 nodes, root Navigation                                  |
| `biaodian/biaodian`                                              | view     | rendered         | 133 nodes, root Navigation                                 |
| `chakra-ui-docs/components`                                      | view     | unsupported-api  | Cache                                                      |
| `chakra-ui-docs/get-started`                                     | view     | unsupported-api  | Cache                                                      |
| `chakra-ui-docs/hooks`                                           | view     | rendered         | 103 nodes, root Navigation                                 |
| `chakra-ui-docs/styled-system`                                   | view     | rendered         | 83 nodes, root Navigation                                  |
| `code-review-emojis/index`                                       | view     | rendered         | 88 nodes, root Navigation                                  |
| `conventional-commits/commit-message-structure`                  | view     | rendered         | 3 nodes, root Navigation                                   |
| `conventional-commits/index`                                     | view     | rendered         | 47 nodes, root Navigation                                  |
| `devpod/workspaces-manage`                                       | view     | unsupported-api  | Cache                                                      |
| `dice-tiles/index`                                               | view     | rendered         | 19 nodes, root Navigation                                  |
| `donut/show-donut`                                               | view     | rendered         | 3 nodes, root Navigation                                   |
| `ego-lite/new-tab`                                               | no-view  | rendered         | 4 nodes, root Navigation                                   |
| `ego-lite/search-bookmarks`                                      | view     | rendered         | 4 nodes, root Navigation                                   |
| `ego-lite/search-history`                                        | view     | crashed          | code 1; __filename is not defined                          |
| `evernote/search-notes`                                          | view     | rendered         | 3 nodes, root Navigation                                   |
| `evernote/search-tasks`                                          | view     | rendered         | 3 nodes, root Navigation                                   |
| `fibonacci-sequence/index`                                       | view     | rendered         | 78 nodes, root Navigation                                  |
| `google-cloud-run/index`                                         | view     | unsupported-api  | Cache                                                      |
| `google-maps-search/find`                                        | view     | rendered         | 4 nodes, root Navigation                                   |
| `google-maps-search/quickSearchMaps`                             | no-view  | unsupported-mode | command mode "no-view" completed without rendering a scene |
| `google-maps-search/travelHome`                                  | no-view  | crashed          | code 1; Capability denied: open.url                        |
| `google-maps-search/travelTo`                                    | view     | unsupported-api  | Form                                                       |
| `invisible-text-detector/analyze-clipboard-invisible-characters` | no-view  | unsupported-api  | Clipboard.readText                                         |
| `invisible-text-detector/fix-invisible-characters`               | no-view  | rendered         | 3 nodes, root Navigation                                   |
| `invisible-text-detector/open-invisible-text-detector`           | view     | unsupported-api  | Form                                                       |
| `laravel-shift/generate-shift`                                   | view     | unsupported-api  | Form                                                       |
| `markdown-reference/markdown-reference`                          | view     | rendered         | 63 nodes, root Navigation                                  |
| `menucloak/open-settings`                                        | no-view  | unsupported-api  | getApplications                                            |
| `menucloak/set-focus`                                            | view     | unsupported-api  | Form                                                       |
| `menucloak/toggle`                                               | no-view  | unsupported-api  | getApplications                                            |
| `menucloak/turn-off`                                             | no-view  | unsupported-api  | getApplications                                            |
| `menucloak/turn-on`                                              | no-view  | unsupported-api  | getApplications                                            |
| `mise-window-sets/apply-set`                                     | view     | unsupported-api  | Cache                                                      |
| `mise-window-sets/reload-sets`                                   | no-view  | rendered         | 3 nodes, root Navigation                                   |
| `nano-games/play-nano-snake`                                     | view     | unsupported-api  | Cache                                                      |
| `nterm-calculator/nterm-calculator`                              | view     | unsupported-api  | Form                                                       |
| `ohmyzsh-git-alias/index`                                        | view     | rendered         | 1632 nodes, root Navigation                                |
| `one-thing/remove-one-thing`                                     | no-view  | unsupported-api  | Cache                                                      |
| `one-thing/set-one-thing`                                        | view     | unsupported-api  | Cache                                                      |
| `one-thing/show-one-thing`                                       | menu-bar | unsupported-mode | command mode "menu-bar" is not supported                   |
| `pinch-svg/custom-rectangle`                                     | view     | rendered         | 2 nodes, root Navigation                                   |
| `pinch-svg/grid`                                                 | view     | unsupported-api  | Grid                                                       |
| `pokemon-tcg-pocket-binder/pokemon-tcg-pocket-binder`            | view     | rendered         | 39 nodes, root Navigation                                  |
| `portless/list`                                                  | view     | unsupported-api  | Cache                                                      |
| `promptty/search-promptty`                                       | view     | unsupported-api  | Cache                                                      |
| `px-to-rem-converter/index`                                      | view     | rendered         | 13 nodes, root Navigation                                  |
| `radix/colors`                                                   | view     | rendered         | 53 nodes, root Navigation                                  |
| `radix/primitives`                                               | view     | rendered         | 265 nodes, root Navigation                                 |
| `radix/themes`                                                   | view     | rendered         | 429 nodes, root Navigation                                 |
| `ratio-calculator/calculate-ratio`                               | view     | rendered         | 4 nodes, root Navigation                                   |
| `raytyping/raytype`                                              | view     | rendered         | 15 nodes, root Navigation                                  |
| `rtl-reader/rtl-text`                                            | view     | unsupported-api  | Form                                                       |
| `spacejump/list-spaces`                                          | view     | rendered         | 3 nodes, root Navigation                                   |
| `spacejump/switch-space`                                         | view     | rendered         | 3 nodes, root Navigation                                   |
| `storybook-sandboxes/local`                                      | view     | unsupported-api  | openExtensionPreferences                                   |
| `storybook-sandboxes/online`                                     | view     | unsupported-api  | openExtensionPreferences                                   |
| `tategaki/japanese-vertical-text`                                | view     | rendered         | 24 nodes, root Navigation                                  |
| `url-designer/create-prompt`                                     | view     | rendered         | 6 nodes, root Navigation                                   |
| `vim-bro/index`                                                  | view     | rendered         | 924 nodes, root Navigation                                 |
| `windows-domain/my-user`                                         | view     | unsupported-api  | Cache                                                      |
| `windows-domain/search-user`                                     | view     | rendered         | 4 nodes, root Navigation                                   |

## Failures

- `atomtick/analog-clock` (unsupported-api): Cache
- `atomtick/copy-atomic-time` (unsupported-api): Cache
- `chakra-ui-docs/components` (unsupported-api): Cache
- `chakra-ui-docs/get-started` (unsupported-api): Cache
- `devpod/workspaces-manage` (unsupported-api): Cache
- `ego-lite/search-history` (crashed): code 1; __filename is not defined
  - log: RUNTIME_ERROR: __filename is not defined
- `google-cloud-run/index` (unsupported-api): Cache
- `google-maps-search/quickSearchMaps` (unsupported-mode): command mode "no-view" completed without rendering a scene
- `google-maps-search/travelHome` (crashed): code 1; Capability denied: open.url
  - log: RUNTIME_ERROR: Capability denied: open.url
- `google-maps-search/travelTo` (unsupported-api): Form
- `invisible-text-detector/analyze-clipboard-invisible-characters` (unsupported-api): Clipboard.readText
- `invisible-text-detector/open-invisible-text-detector` (unsupported-api): Form
- `laravel-shift/generate-shift` (unsupported-api): Form
- `menucloak/open-settings` (unsupported-api): getApplications
- `menucloak/set-focus` (unsupported-api): Form
- `menucloak/toggle` (unsupported-api): getApplications
- `menucloak/turn-off` (unsupported-api): getApplications
- `menucloak/turn-on` (unsupported-api): getApplications
- `mise-window-sets/apply-set` (unsupported-api): Cache
- `nano-games/play-nano-snake` (unsupported-api): Cache
- `nterm-calculator/nterm-calculator` (unsupported-api): Form
- `one-thing/remove-one-thing` (unsupported-api): Cache
- `one-thing/set-one-thing` (unsupported-api): Cache
- `one-thing/show-one-thing` (unsupported-mode): command mode "menu-bar" is not supported
- `pinch-svg/grid` (unsupported-api): Grid
- `portless/list` (unsupported-api): Cache
- `promptty/search-promptty` (unsupported-api): Cache
- `rtl-reader/rtl-text` (unsupported-api): Form
- `storybook-sandboxes/local` (unsupported-api): openExtensionPreferences
- `storybook-sandboxes/online` (unsupported-api): openExtensionPreferences
- `windows-domain/my-user` (unsupported-api): Cache
