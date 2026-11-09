# Browser catalog sweep

Catalog commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; date 2026-11-09; 237 command records; wall time 72.8 s.

## Totals

- completed: 3 command(s)
- empty: 2 command(s)
- missing-arguments: 1 command(s)
- needs-preferences: 51 command(s)
- network: 4 command(s)
- rendered: 104 command(s)
- runtime-error:Applications are unavailable in a browser tab: 1 command(s)
- runtime-error:Cannot find module 'sqlite': 1 command(s)
- runtime-error:Cannot read properties of undefined (reading '$and'): 1 command(s)
- runtime-error:Could not create an Ego Lite tab: 1 command(s)
- runtime-error:ENOENT: no such file or directory, open '/blast/assets/dot-new/dataset.json': 1 command(s)
- runtime-error:ENOENT: no such file or directory, open '/blast/assets/package.json': 1 command(s)
- runtime-error:ENOENT: no such file or directory, open '/blast/assets/sf-symbols-search/symbols/data.json': 1 command(s)
- runtime-error:Error during unlock process: Error: Not authenticated. Please run the 'Authenticate' command.: 1 command(s)
- runtime-error:Error: The database does not exist: 1 command(s)
- runtime-error:Height must be an integer: 1 command(s)
- runtime-error:MenuCloak is not installed: 4 command(s)
- runtime-error:No text selected: 1 command(s)
- runtime-error:No text to analyze: 1 command(s)
- runtime-error:No text to process: 1 command(s)
- runtime-error:Rectangle is not installed.: 41 command(s)
- runtime-error:Refused to set unsafe header "user-agent": 2 command(s)
- runtime-error:Selection is unavailable in a browser tab: 6 command(s)
- runtime-error:Superwhisper is not installed.: 4 command(s)
- runtime-error:Unexpected end of JSON input: 1 command(s)
- runtime-error:Width must be an integer: 1 command(s)

## Failures

| Signature                                                                                                   | Commands | Examples                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| needs-preferences                                                                                           |       51 | `bookstack/search-command`, `bookstack/show-all-books`, `bookstack/show-all-shelves`, `codepen/create-collection`, `codepen/create-pen`       |
| runtime-error:Rectangle is not installed.                                                                   |       41 | `rectangle/almost-maximize`, `rectangle/bottom-center-sixth`, `rectangle/bottom-half`, `rectangle/bottom-left`, `rectangle/bottom-left-sixth` |
| runtime-error:Selection is unavailable in a browser tab                                                     |        6 | `8-divide/divide-by-8`, `cangjie/cangjie`, `color-studio-picker/index`, `fix-helper/fix-parser`, `tategaki/japanese-vertical-text`            |
| network                                                                                                     |        4 | `gradle-plugins/index`, `jisho/search`, `leetcode/daily-challenge`, `scrapbook/view-recent-posts`                                             |
| runtime-error:MenuCloak is not installed                                                                    |        4 | `menucloak/open-settings`, `menucloak/toggle`, `menucloak/turn-off`, `menucloak/turn-on`                                                      |
| runtime-error:Superwhisper is not installed.                                                                |        4 | `superwhisper/copy-last-history`, `superwhisper/open-settings`, `superwhisper/paste-last-history`, `superwhisper/toggle-record`               |
| runtime-error:Refused to set unsafe header "user-agent"                                                     |        2 | `splatoon/splatoon-2-schedules`, `splatoon/splatoon-3-schedules`                                                                              |
| missing-arguments                                                                                           |        1 | `pinch-svg/custom-rectangle`                                                                                                                  |
| runtime-error:Applications are unavailable in a browser tab                                                 |        1 | `input-source-switcher/form`                                                                                                                  |
| runtime-error:Cannot find module 'sqlite'                                                                   |        1 | `ego-lite/search-bookmarks`                                                                                                                   |
| runtime-error:Cannot read properties of undefined (reading '$and')                                          |        1 | `hyrule-compendium-search/getEntry`                                                                                                           |
| runtime-error:Could not create an Ego Lite tab                                                              |        1 | `ego-lite/new-tab`                                                                                                                            |
| runtime-error:ENOENT: no such file or directory, open '/blast/assets/dot-new/dataset.json'                  |        1 | `dot-new/index`                                                                                                                               |
| runtime-error:ENOENT: no such file or directory, open '/blast/assets/package.json'                          |        1 | `trenit/departures-and-arrivals`                                                                                                              |
| runtime-error:ENOENT: no such file or directory, open '/blast/assets/sf-symbols-search/symbols/data.json'   |        1 | `sf-symbols-search/index`                                                                                                                     |
| runtime-error:Error during unlock process: Error: Not authenticated. Please run the 'Authenticate' command. |        1 | `ring-intercom/unlock`                                                                                                                        |
| runtime-error:Error: The database does not exist                                                            |        1 | `flighty/view-flights`                                                                                                                        |
| runtime-error:Height must be an integer                                                                     |        1 | `convert-px-to-vw-vh/height`                                                                                                                  |
| runtime-error:No text selected                                                                              |        1 | `input-source-switcher/index`                                                                                                                 |
| runtime-error:No text to analyze                                                                            |        1 | `invisible-text-detector/analyze-clipboard-invisible-characters`                                                                              |
| runtime-error:No text to process                                                                            |        1 | `invisible-text-detector/fix-invisible-characters`                                                                                            |
| runtime-error:Unexpected end of JSON input                                                                  |        1 | `uk-bank-holidays/index`                                                                                                                      |
| runtime-error:Width must be an integer                                                                      |        1 | `convert-px-to-vw-vh/width`                                                                                                                   |

## Capability usage
