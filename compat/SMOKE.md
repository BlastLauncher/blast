# Corpus smoke report

Headless run of every command of the curated extensions at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`, with Blast's headless broker — deny-all except the
headless defaults `applications.list` (empty), `clipboard.read` (empty),
`preferences.open` and `command.metadata` (recorded) — and manifest preference defaults.
Regenerate with `bun run corpus:smoke` (network required; not part of
`bun run verify`).

200 commands: rendered 185, completed 2, capability-denied 7, bundle-failed 0, crashed 6, network 0, timeout 0, unsupported-mode 0, unsupported-api 0.

| Command                                                          | Mode     | Outcome           | Detail                                                                                                         |
| ---------------------------------------------------------------- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `8-divide/divide-by-8`                                           | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `android-versions/search-android-version`                        | view     | rendered          | 273 nodes, root Navigation                                                                                     |
| `appgrid/index`                                                  | view     | rendered          | 17 nodes, root Navigation                                                                                      |
| `atomtick/analog-clock`                                          | view     | rendered          | 12 nodes, root Navigation                                                                                      |
| `atomtick/copy-atomic-time`                                      | no-view  | capability-denied | denied capability clipboard.copy                                                                               |
| `axios-docs/index`                                               | view     | rendered          | 76 nodes, root Navigation                                                                                      |
| `biaodian/biaodian`                                              | view     | rendered          | 133 nodes, root Navigation                                                                                     |
| `bugmenot/find-login`                                            | view     | crashed           | code 1; Cannot find package 'undici' imported from /tmp/blast/builds/command-9JeFrw/find-login.mjs             |
| `cangjie/cangjie`                                                | view     | rendered          | 8 nodes, root Navigation                                                                                       |
| `chakra-ui-docs/components`                                      | view     | rendered          | 616 nodes, root Navigation                                                                                     |
| `chakra-ui-docs/get-started`                                     | view     | rendered          | 43 nodes, root Navigation                                                                                      |
| `chakra-ui-docs/hooks`                                           | view     | rendered          | 103 nodes, root Navigation                                                                                     |
| `chakra-ui-docs/styled-system`                                   | view     | rendered          | 83 nodes, root Navigation                                                                                      |
| `clocky-time-tracker/clock-in`                                   | view     | rendered          | 6 nodes, root Navigation                                                                                       |
| `clocky-time-tracker/clock-out`                                  | view     | rendered          | 6 nodes, root Navigation                                                                                       |
| `clocky-time-tracker/history`                                    | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `clocky-time-tracker/status`                                     | menu-bar | rendered          | 4 nodes, root MenuBarExtra                                                                                     |
| `clocky-time-tracker/today`                                      | view     | rendered          | 10 nodes, root Navigation                                                                                      |
| `clocky-time-tracker/toggle-pause`                               | view     | rendered          | 6 nodes, root Navigation                                                                                       |
| `clocky-time-tracker/week`                                       | view     | rendered          | 49 nodes, root Navigation                                                                                      |
| `code-review-emojis/index`                                       | view     | rendered          | 88 nodes, root Navigation                                                                                      |
| `codepen/create-collection`                                      | view     | rendered          | 12 nodes, root Navigation                                                                                      |
| `codepen/create-pen`                                             | view     | rendered          | 19 nodes, root Navigation                                                                                      |
| `codepen/search-assets`                                          | view     | rendered          | 11 nodes, root Navigation                                                                                      |
| `codepen/search-collections`                                     | view     | rendered          | 11 nodes, root Navigation                                                                                      |
| `codepen/search-pens`                                            | view     | rendered          | 23 nodes, root Navigation                                                                                      |
| `codepen/upload-asset`                                           | view     | rendered          | 9 nodes, root Navigation                                                                                       |
| `color-studio-picker/index`                                      | view     | rendered          | 716 nodes, root Navigation                                                                                     |
| `conventional-commits/commit-message-structure`                  | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `conventional-commits/index`                                     | view     | rendered          | 47 nodes, root Navigation                                                                                      |
| `convert-px-to-vw-vh/height`                                     | no-view  | rendered          | 3 nodes, root Navigation                                                                                       |
| `convert-px-to-vw-vh/index`                                      | view     | rendered          | 27 nodes, root Navigation                                                                                      |
| `convert-px-to-vw-vh/menu-bar`                                   | menu-bar | rendered          | 5 nodes, root MenuBarExtra                                                                                     |
| `convert-px-to-vw-vh/width`                                      | no-view  | rendered          | 3 nodes, root Navigation                                                                                       |
| `devpod/workspaces-manage`                                       | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `dice-tiles/index`                                               | view     | rendered          | 19 nodes, root Navigation                                                                                      |
| `donut/show-donut`                                               | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `duan-raycast-extension/list-links`                              | view     | rendered          | 9 nodes, root Navigation                                                                                       |
| `duan-raycast-extension/shorten-link`                            | view     | rendered          | 10 nodes, root Navigation                                                                                      |
| `ego-lite/new-tab`                                               | no-view  | rendered          | 2 nodes, root Navigation                                                                                       |
| `ego-lite/search-bookmarks`                                      | view     | rendered          | 4 nodes, root Navigation                                                                                       |
| `ego-lite/search-history`                                        | view     | rendered          | 4 nodes, root Navigation                                                                                       |
| `evernote/search-notes`                                          | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `evernote/search-tasks`                                          | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `fibonacci-sequence/index`                                       | view     | rendered          | 78 nodes, root Navigation                                                                                      |
| `fix-helper/fix-parser`                                          | view     | rendered          | 9 nodes, root Navigation                                                                                       |
| `fix-helper/fix-search-tags`                                     | view     | rendered          | 3253 nodes, root Navigation                                                                                    |
| `google-cloud-run/index`                                         | view     | rendered          | 6 nodes, root Navigation                                                                                       |
| `google-maps-search/find`                                        | view     | rendered          | 4 nodes, root Navigation                                                                                       |
| `google-maps-search/quickSearchMaps`                             | no-view  | completed         | command mode "no-view" completed without rendering a scene                                                     |
| `google-maps-search/travelHome`                                  | no-view  | capability-denied | denied capability open.url                                                                                     |
| `google-maps-search/travelTo`                                    | view     | rendered          | 18 nodes, root Navigation                                                                                      |
| `hevy/search-routines`                                           | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `hevy/search-workouts`                                           | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `humaans/book-time`                                              | no-view  | capability-denied | denied capability open.url                                                                                     |
| `humaans/clock-in`                                               | no-view  | rendered          | 2 nodes, root Navigation                                                                                       |
| `humaans/clock-out`                                              | no-view  | rendered          | 2 nodes, root Navigation                                                                                       |
| `humaans/holidays`                                               | view     | crashed           | code 1; api key missing                                                                                        |
| `humaans/me-time-away`                                           | no-view  | capability-denied | denied capability open.url                                                                                     |
| `humaans/people`                                                 | view     | crashed           | code 1; api key missing                                                                                        |
| `hyrule-compendium-search/broadSearch`                           | view     | rendered          | 1559 nodes, root Navigation                                                                                    |
| `hyrule-compendium-search/getEntry`                              | view     | crashed           | code 1; Cannot read properties of undefined (reading '$and')                                                   |
| `input-source-switcher/form`                                     | view     | rendered          | 17 nodes, root Navigation                                                                                      |
| `input-source-switcher/index`                                    | no-view  | rendered          | 3 nodes, root Navigation                                                                                       |
| `invisible-text-detector/analyze-clipboard-invisible-characters` | no-view  | rendered          | 3 nodes, root Navigation                                                                                       |
| `invisible-text-detector/fix-invisible-characters`               | no-view  | rendered          | 3 nodes, root Navigation                                                                                       |
| `invisible-text-detector/open-invisible-text-detector`           | view     | rendered          | 32 nodes, root Navigation                                                                                      |
| `kaalam/index`                                                   | view     | rendered          | 107 nodes, root Navigation                                                                                     |
| `kaalam/now`                                                     | no-view  | capability-denied | denied capability clipboard.paste                                                                              |
| `keeper-security/generate-passphrase`                            | view     | rendered          | 9 nodes, root Navigation                                                                                       |
| `keeper-security/generate-password`                              | view     | rendered          | 14 nodes, root Navigation                                                                                      |
| `keeper-security/generate-password-quick`                        | view     | rendered          | 2 nodes, root Navigation                                                                                       |
| `keeper-security/my-vault`                                       | view     | rendered          | 31 nodes, root Navigation                                                                                      |
| `keygen/api-tokens`                                              | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `keygen/api-usage`                                               | no-view  | rendered          | 3 nodes, root Navigation                                                                                       |
| `keygen/environments`                                            | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `keygen/licenses`                                                | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `keygen/policies`                                                | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `keygen/products`                                                | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `keygen/users`                                                   | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `laravel-artisan/index`                                          | view     | rendered          | 6 nodes, root Navigation                                                                                       |
| `laravel-shift/generate-shift`                                   | view     | rendered          | 59 nodes, root Navigation                                                                                      |
| `leap-new/generate-app`                                          | view     | rendered          | 29 nodes, root Navigation                                                                                      |
| `leap-new/menu-bar`                                              | menu-bar | rendered          | 5 nodes, root MenuBarExtra                                                                                     |
| `leetcode/daily-challenge`                                       | view     | rendered          | 8 nodes, root Navigation                                                                                       |
| `leetcode/potd-menu-bar`                                         | menu-bar | rendered          | 7 nodes, root MenuBarExtra                                                                                     |
| `leetcode/problem-search`                                        | view     | rendered          | 13 nodes, root Navigation                                                                                      |
| `leetcode/random-problem`                                        | view     | rendered          | 45 nodes, root Navigation                                                                                      |
| `leetcode/user-profile`                                          | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `markdown-reference/markdown-reference`                          | view     | rendered          | 63 nodes, root Navigation                                                                                      |
| `mealie/add-to-shopping-list`                                    | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `mealie/import-recipe`                                           | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `mealie/meal-plan`                                               | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `mealie/search-recipes`                                          | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `mealie/shopping-lists`                                          | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `melanite-search/search-files`                                   | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `menucloak/open-settings`                                        | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `menucloak/set-focus`                                            | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `menucloak/toggle`                                               | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `menucloak/turn-off`                                             | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `menucloak/turn-on`                                              | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `mise-window-sets/apply-set`                                     | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `mise-window-sets/reload-sets`                                   | no-view  | rendered          | 3 nodes, root Navigation                                                                                       |
| `multi-ai-chat/multi-ai-chat`                                    | view     | rendered          | 36 nodes, root Navigation                                                                                      |
| `multi-ai-chat/run-presets`                                      | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `nano-games/play-nano-snake`                                     | view     | rendered          | 8 nodes, root Navigation                                                                                       |
| `nterm-calculator/nterm-calculator`                              | view     | rendered          | 39 nodes, root Navigation                                                                                      |
| `ohmyzsh-git-alias/index`                                        | view     | rendered          | 1632 nodes, root Navigation                                                                                    |
| `one-thing/remove-one-thing`                                     | no-view  | rendered          | 2 nodes, root Navigation                                                                                       |
| `one-thing/set-one-thing`                                        | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `one-thing/show-one-thing`                                       | menu-bar | rendered          | empty menu bar                                                                                                 |
| `parcel/add-delivery`                                            | view     | rendered          | 11 nodes, root Navigation                                                                                      |
| `parcel/my-deliveries`                                           | view     | crashed           | code 1; API key not found. Please add your Parcel API key in extension preferences.                            |
| `pbr-assistant/find-pbr-ior-value`                               | view     | rendered          | 672 nodes, root Navigation                                                                                     |
| `pinch-svg/custom-rectangle`                                     | view     | rendered          | 2 nodes, root Navigation                                                                                       |
| `pinch-svg/grid`                                                 | view     | rendered          | 8 nodes, root Navigation                                                                                       |
| `pokemon-tcg-pocket-binder/pokemon-tcg-pocket-binder`            | view     | rendered          | 39 nodes, root Navigation                                                                                      |
| `portless/list`                                                  | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `promptty/search-promptty`                                       | view     | rendered          | 4 nodes, root Navigation                                                                                       |
| `punch-clock/menu-bar`                                           | menu-bar | rendered          | 3 nodes, root MenuBarExtra                                                                                     |
| `punch-clock/start-timer`                                        | view     | rendered          | 11 nodes, root Navigation                                                                                      |
| `px-to-rem-converter/index`                                      | view     | rendered          | 13 nodes, root Navigation                                                                                      |
| `quick-jump/search`                                              | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `radix/colors`                                                   | view     | rendered          | 53 nodes, root Navigation                                                                                      |
| `radix/primitives`                                               | view     | rendered          | 265 nodes, root Navigation                                                                                     |
| `radix/themes`                                                   | view     | rendered          | 429 nodes, root Navigation                                                                                     |
| `random-color/random-color`                                      | no-view  | capability-denied | denied capability clipboard.copy                                                                               |
| `random-color/select-color`                                      | view     | rendered          | 59 nodes, root Navigation                                                                                      |
| `ratio-calculator/calculate-ratio`                               | view     | rendered          | 4 nodes, root Navigation                                                                                       |
| `raytyping/raytype`                                              | view     | rendered          | 15 nodes, root Navigation                                                                                      |
| `rectangle/almost-maximize`                                      | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/bottom-center-sixth`                                  | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/bottom-half`                                          | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/bottom-left`                                          | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/bottom-left-sixth`                                    | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/bottom-right`                                         | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/bottom-right-sixth`                                   | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/cascade-all`                                          | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/center`                                               | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/center-half`                                          | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/center-third`                                         | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/first-fourth`                                         | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/first-third`                                          | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/first-three-fourths`                                  | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/first-two-thirds`                                     | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/index`                                                | view     | rendered          | 326 nodes, root Navigation                                                                                     |
| `rectangle/larger`                                               | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/last-fourth`                                          | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/last-third`                                           | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/last-three-fourths`                                   | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/last-two-thirds`                                      | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/left-half`                                            | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/maximize`                                             | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/maximize-height`                                      | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/move-down`                                            | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/move-left`                                            | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/move-right`                                           | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/move-up`                                              | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/next-display`                                         | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/previous-display`                                     | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/restore`                                              | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/right-half`                                           | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/second-fourth`                                        | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/smaller`                                              | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/specified`                                            | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/third-fourth`                                         | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/top-center-sixth`                                     | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/top-half`                                             | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/top-left`                                             | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/top-left-sixth`                                       | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/top-right`                                            | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `rectangle/top-right-sixth`                                      | no-view  | rendered          | 4 nodes, root Navigation                                                                                       |
| `ring-intercom/authenticate`                                     | view     | rendered          | 6 nodes, root Navigation                                                                                       |
| `ring-intercom/unlock`                                           | no-view  | rendered          | 3 nodes, root Navigation                                                                                       |
| `rtl-reader/rtl-text`                                            | view     | rendered          | 9 nodes, root Navigation                                                                                       |
| `saved-items/index`                                              | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `sf-symbols-search/index`                                        | view     | rendered          | 37 nodes, root Navigation                                                                                      |
| `spacejump/list-spaces`                                          | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `spacejump/switch-space`                                         | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `stockholm-public-transport/departures`                          | view     | rendered          | 5 nodes, root Navigation                                                                                       |
| `storybook-sandboxes/local`                                      | view     | rendered          | 538 nodes, root Navigation                                                                                     |
| `storybook-sandboxes/online`                                     | view     | rendered          | 538 nodes, root Navigation                                                                                     |
| `tategaki/japanese-vertical-text`                                | view     | rendered          | 24 nodes, root Navigation                                                                                      |
| `text-decorator/decorate-text`                                   | no-view  | capability-denied | denied capability command.launch                                                                               |
| `text-decorator/decorate-text-with-font`                         | view     | rendered          | 143 nodes, root Navigation                                                                                     |
| `text-decorator/undecorate-text`                                 | no-view  | rendered          | 2 nodes, root Navigation                                                                                       |
| `time-until-i-do/index`                                          | view     | rendered          | 6 nodes, root Navigation                                                                                       |
| `timezone-buddy/timezone-buddy`                                  | view     | rendered          | 7 nodes, root Navigation                                                                                       |
| `timezone-buddy/timezone-buddy-menubar`                          | menu-bar | rendered          | 2 nodes, root MenuBarExtra                                                                                     |
| `tiny-tycho/index`                                               | view     | rendered          | 867 nodes, root Navigation                                                                                     |
| `uk-bank-holidays/index`                                         | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `uk-bank-holidays/next-holiday`                                  | no-view  | completed         | command mode "no-view" completed without rendering a scene                                                     |
| `url-designer/create-prompt`                                     | view     | rendered          | 6 nodes, root Navigation                                                                                       |
| `valkey-commands-search/search-valkey-commands`                  | view     | crashed           | code 1; Cannot find package 'undici' imported from /tmp/blast/builds/command-ZePPNc/search-valkey-commands.mjs |
| `vim-bro/index`                                                  | view     | rendered          | 924 nodes, root Navigation                                                                                     |
| `vocab-search/vocab`                                             | view     | rendered          | 3 nodes, root Navigation                                                                                       |
| `windows-domain/my-user`                                         | view     | rendered          | 5 nodes, root Navigation                                                                                       |
| `windows-domain/search-user`                                     | view     | rendered          | 4 nodes, root Navigation                                                                                       |
| `workflowy-inbox/index`                                          | view     | rendered          | 12 nodes, root Navigation                                                                                      |
| `workflowy-inbox/view`                                           | view     | rendered          | 6 nodes, root Navigation                                                                                       |

## Failures

- `atomtick/copy-atomic-time` (capability-denied): denied capability clipboard.copy
- `bugmenot/find-login` (crashed): code 1; Cannot find package 'undici' imported from /tmp/blast/builds/command-9JeFrw/find-login.mjs
  - log: RUNTIME_ERROR: Cannot find package 'undici' imported from <tmp>/blast/builds/command-9JeFrw/find-login.mjs
- `google-maps-search/travelHome` (capability-denied): denied capability open.url
- `humaans/book-time` (capability-denied): denied capability open.url
- `humaans/holidays` (crashed): code 1; api key missing
  - log: RUNTIME_ERROR: api key missing
- `humaans/me-time-away` (capability-denied): denied capability open.url
- `humaans/people` (crashed): code 1; api key missing
  - log: RUNTIME_ERROR: api key missing
- `hyrule-compendium-search/getEntry` (crashed): code 1; Cannot read properties of undefined (reading '$and')
  - log: RUNTIME_ERROR: Cannot read properties of undefined (reading '$and')
- `kaalam/now` (capability-denied): denied capability clipboard.paste
- `parcel/my-deliveries` (crashed): code 1; API key not found. Please add your Parcel API key in extension preferences.
  - log: RUNTIME_ERROR: API key not found. Please add your Parcel API key in extension preferences.
- `random-color/random-color` (capability-denied): denied capability clipboard.copy
- `text-decorator/decorate-text` (capability-denied): denied capability command.launch
- `valkey-commands-search/search-valkey-commands` (crashed): code 1; Cannot find package 'undici' imported from /tmp/blast/builds/command-ZePPNc/search-valkey-commands.mjs
  - log: RUNTIME_ERROR: Cannot find package 'undici' imported from <tmp>/blast/builds/command-ZePPNc/search-valkey-commands.mjs
