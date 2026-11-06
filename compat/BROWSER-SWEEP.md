# Browser catalog sweep

Catalog commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; date 2026-11-06; 237 command records; wall time 32.4 s.

## Totals

- capability-denied:applications.frontmost: 1 command(s)
- capability-denied:applications.list: 50 command(s)
- capability-denied:clipboard.read: 5 command(s)
- capability-denied:selection.text: 4 command(s)
- capability-denied:storage.all: 3 command(s)
- capability-denied:storage.get: 18 command(s)
- capability-denied:storage.set: 1 command(s)
- empty: 15 command(s)
- network: 1 command(s)
- rendered: 34 command(s)
- runtime-error:Cache requires an assigned support directory: 15 command(s)
- runtime-error:Cannot read properties of undefined (reading '$and'): 1 command(s)
- runtime-error:Ready: 1 command(s)
- runtime-error:Runtime failed: Error: Error: Cache requires an assigned support directory: 8 command(s)
- runtime-error:Runtime failed: Error: Error: Cannot find module 'stream/promises': 80 command(s)

## Failures

| Signature                                                                                | Commands | Examples                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| runtime-error:Runtime failed: Error: Error: Cannot find module 'stream/promises'         |       80 | `advanced-replace/advanced-replace`, `anilist-airing-schedule/index`, `bugmenot/find-login`, `chakra-ui-docs/components`, `chakra-ui-docs/get-started`                                                                   |
| capability-denied:applications.list                                                      |       50 | `appgrid/index`, `menucloak/open-settings`, `menucloak/toggle`, `menucloak/turn-off`, `menucloak/turn-on`                                                                                                                |
| capability-denied:storage.get                                                            |       18 | `clocky-time-tracker/clock-in`, `clocky-time-tracker/clock-out`, `clocky-time-tracker/history`, `clocky-time-tracker/status`, `clocky-time-tracker/today`                                                                |
| runtime-error:Cache requires an assigned support directory                               |       15 | `convert-px-to-vw-vh/menu-bar`, `douban/search-books`, `douban/search-games`, `douban/search-groups`, `douban/search-movies`                                                                                             |
| runtime-error:Runtime failed: Error: Error: Cache requires an assigned support directory |        8 | `atomtick/analog-clock`, `humaans/clock-in`, `humaans/clock-out`, `humaans/holidays`, `humaans/people`                                                                                                                   |
| capability-denied:clipboard.read                                                         |        5 | `invisible-text-detector/analyze-clipboard-invisible-characters`, `invisible-text-detector/fix-invisible-characters`, `rtl-reader/rtl-text`, `tategaki/japanese-vertical-text`, `text-decorator/decorate-text-with-font` |
| capability-denied:selection.text                                                         |        4 | `8-divide/divide-by-8`, `cangjie/cangjie`, `color-studio-picker/index`, `input-source-switcher/index`                                                                                                                    |
| capability-denied:storage.all                                                            |        3 | `hetzner/manageProject`, `hetzner/manageServer`, `multi-ai-chat/run-presets`                                                                                                                                             |
| capability-denied:applications.frontmost                                                 |        1 | `input-source-switcher/form`                                                                                                                                                                                             |
| capability-denied:storage.set                                                            |        1 | `saved-items/index`                                                                                                                                                                                                      |
| network                                                                                  |        1 | `gradle-plugins/index`                                                                                                                                                                                                   |
| runtime-error:Cannot read properties of undefined (reading '$and')                       |        1 | `hyrule-compendium-search/getEntry`                                                                                                                                                                                      |
| runtime-error:Ready                                                                      |        1 | `uk-bank-holidays/index`                                                                                                                                                                                                 |

## Capability usage

- applications.frontmost: 1 command(s)
- applications.list: 50 command(s)
- clipboard.read: 5 command(s)
- selection.text: 4 command(s)
- storage.all: 3 command(s)
- storage.get: 18 command(s)
- storage.set: 1 command(s)
