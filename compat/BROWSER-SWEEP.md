# Browser catalog sweep

Catalog commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; date 2026-11-06; 237 command records; wall time 47.9 s.

## Totals

- capability-denied:applications.frontmost: 1 command(s)
- capability-denied:applications.list: 58 command(s)
- capability-denied:clipboard.read: 6 command(s)
- capability-denied:command.metadata: 2 command(s)
- capability-denied:selection.text: 4 command(s)
- capability-denied:storage.all: 3 command(s)
- capability-denied:storage.get: 35 command(s)
- capability-denied:storage.set: 1 command(s)
- empty: 35 command(s)
- network: 6 command(s)
- rendered: 79 command(s)
- runtime-error:api key missing: 2 command(s)
- runtime-error:API key not found. Please add your Parcel API key in extension preferences.: 1 command(s)
- runtime-error:Cannot read properties of undefined (reading '$and'): 1 command(s)
- runtime-error:Runtime failed: Error: Error: Cannot find module 'sqlite': 1 command(s)
- runtime-error:Runtime failed: Error: Error: ENOENT: no such file or directory, open '/dataset.json': 1 command(s)
- runtime-error:Runtime failed: Error: Error: ENOENT: no such file or directory, open '/symbols/data.json': 1 command(s)

## Failures

| Signature                                                                                                | Commands | Examples                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| capability-denied:applications.list                                                                      |       58 | `appgrid/index`, `ego-lite/new-tab`, `evernote/search-notes`, `evernote/search-tasks`, `flighty/view-flights`                                                                                          |
| capability-denied:storage.get                                                                            |       35 | `advanced-replace/advanced-replace`, `clocky-time-tracker/clock-in`, `clocky-time-tracker/clock-out`, `clocky-time-tracker/history`, `clocky-time-tracker/status`                                      |
| capability-denied:clipboard.read                                                                         |        6 | `invisible-text-detector/analyze-clipboard-invisible-characters`, `invisible-text-detector/fix-invisible-characters`, `mealie/import-recipe`, `rtl-reader/rtl-text`, `tategaki/japanese-vertical-text` |
| network                                                                                                  |        6 | `gradle-plugins/index`, `hyrule-compendium-search/broadSearch`, `jisho/search`, `leetcode/potd-menu-bar`, `scrapbook/view-recent-posts`                                                                |
| capability-denied:selection.text                                                                         |        4 | `8-divide/divide-by-8`, `cangjie/cangjie`, `color-studio-picker/index`, `input-source-switcher/index`                                                                                                  |
| capability-denied:storage.all                                                                            |        3 | `hetzner/manageProject`, `hetzner/manageServer`, `multi-ai-chat/run-presets`                                                                                                                           |
| capability-denied:command.metadata                                                                       |        2 | `keygen/api-usage`, `one-thing/show-one-thing`                                                                                                                                                         |
| runtime-error:api key missing                                                                            |        2 | `humaans/holidays`, `humaans/people`                                                                                                                                                                   |
| capability-denied:applications.frontmost                                                                 |        1 | `input-source-switcher/form`                                                                                                                                                                           |
| capability-denied:storage.set                                                                            |        1 | `saved-items/index`                                                                                                                                                                                    |
| runtime-error:API key not found. Please add your Parcel API key in extension preferences.                |        1 | `parcel/my-deliveries`                                                                                                                                                                                 |
| runtime-error:Cannot read properties of undefined (reading '$and')                                       |        1 | `hyrule-compendium-search/getEntry`                                                                                                                                                                    |
| runtime-error:Runtime failed: Error: Error: Cannot find module 'sqlite'                                  |        1 | `ego-lite/search-bookmarks`                                                                                                                                                                            |
| runtime-error:Runtime failed: Error: Error: ENOENT: no such file or directory, open '/dataset.json'      |        1 | `dot-new/index`                                                                                                                                                                                        |
| runtime-error:Runtime failed: Error: Error: ENOENT: no such file or directory, open '/symbols/data.json' |        1 | `sf-symbols-search/index`                                                                                                                                                                              |

## Capability usage

- applications.frontmost: 1 command(s)
- applications.list: 58 command(s)
- clipboard.read: 6 command(s)
- command.metadata: 2 command(s)
- selection.text: 4 command(s)
- storage.all: 3 command(s)
- storage.get: 35 command(s)
- storage.set: 1 command(s)
