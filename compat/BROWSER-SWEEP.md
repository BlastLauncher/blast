# Browser catalog sweep

Catalog commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; date 2026-11-14; 237 command records; wall time 176.0 s.

Rendered: **134 / 170** (104 rendered + 30 rendered with placeholder preferences) of 237 commands − 67 browser-limit.
Not rendered: 15 Blast failure(s), 16 needing real credentials.

## Totals

- browser-limit: 67 command(s)
- completed: 4 command(s)
- empty: 1 command(s)
- missing-arguments: 1 command(s)
- needs-credentials: 16 command(s)
- rendered: 104 command(s)
- rendered-with-placeholders: 30 command(s)
- runtime-error:Cannot find module 'sqlite': 1 command(s)
- runtime-error:Cannot read properties of undefined (reading '$and'): 1 command(s)
- runtime-error:ENOENT: no such file or directory, open '/blast/assets/dot-new/dataset.json': 1 command(s)
- runtime-error:ENOENT: no such file or directory, open '/blast/assets/package.json': 1 command(s)
- runtime-error:ENOENT: no such file or directory, open '/blast/assets/sf-symbols-search/symbols/data.json': 1 command(s)
- runtime-error:Error during unlock process: Error: Not authenticated. Please run the 'Authenticate' command.: 1 command(s)
- runtime-error:Failed to load resource: the server responded with a status of 404 (Not Found): 2 command(s)
- runtime-error:Height must be an integer: 1 command(s)
- runtime-error:Refused to set unsafe header "user-agent": 3 command(s)
- runtime-error:Unexpected end of JSON input: 1 command(s)
- runtime-error:Width must be an integer: 1 command(s)

## Blast failures

| Signature                                                                                                   | Commands | Examples                                                                           |
| ----------------------------------------------------------------------------------------------------------- | -------: | ---------------------------------------------------------------------------------- |
| runtime-error:Refused to set unsafe header "user-agent"                                                     |        3 | `humaans/people`, `splatoon/splatoon-2-schedules`, `splatoon/splatoon-3-schedules` |
| runtime-error:Failed to load resource: the server responded with a status of 404 (Not Found)                |        2 | `bookstack/show-all-books`, `bookstack/show-all-shelves`                           |
| missing-arguments                                                                                           |        1 | `pinch-svg/custom-rectangle`                                                       |
| runtime-error:Cannot find module 'sqlite'                                                                   |        1 | `ego-lite/search-bookmarks`                                                        |
| runtime-error:Cannot read properties of undefined (reading '$and')                                          |        1 | `hyrule-compendium-search/getEntry`                                                |
| runtime-error:ENOENT: no such file or directory, open '/blast/assets/dot-new/dataset.json'                  |        1 | `dot-new/index`                                                                    |
| runtime-error:ENOENT: no such file or directory, open '/blast/assets/package.json'                          |        1 | `trenit/departures-and-arrivals`                                                   |
| runtime-error:ENOENT: no such file or directory, open '/blast/assets/sf-symbols-search/symbols/data.json'   |        1 | `sf-symbols-search/index`                                                          |
| runtime-error:Error during unlock process: Error: Not authenticated. Please run the 'Authenticate' command. |        1 | `ring-intercom/unlock`                                                             |
| runtime-error:Height must be an integer                                                                     |        1 | `convert-px-to-vw-vh/height`                                                       |
| runtime-error:Unexpected end of JSON input                                                                  |        1 | `uk-bank-holidays/index`                                                           |
| runtime-error:Width must be an integer                                                                      |        1 | `convert-px-to-vw-vh/width`                                                        |

## Needs credentials

Ran with placeholder preferences, then the service refused them.

| Response                 | Commands | Examples                                                                                                           |
| ------------------------ | -------: | ------------------------------------------------------------------------------------------------------------------ |
| HTTP 404 api.keygen.sh   |        7 | `keygen/api-tokens`, `keygen/api-usage`, `keygen/environments`, `keygen/licenses`, `keygen/policies`               |
| HTTP 401 api.v0.dev      |        4 | `v0-by-vercel/manage-profiles`, `v0-by-vercel/new-chat`, `v0-by-vercel/view-billing`, `v0-by-vercel/view-projects` |
| HTTP 401 app.humaans.io  |        3 | `humaans/clock-in`, `humaans/clock-out`, `humaans/holidays`                                                        |
| HTTP 401 api.hevyapp.com |        2 | `hevy/search-routines`, `hevy/search-workouts`                                                                     |

## Browser limits

Denied by the browser host (capability log), not by Blast's runtime.

| Capability             | Commands | Examples                                                                                                                                                          |
| ---------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| applications.list      |       53 | `appgrid/index`, `ego-lite/new-tab`, `flighty/view-flights`, `menucloak/open-settings`, `menucloak/toggle`                                                        |
| selection.text         |        8 | `8-divide/divide-by-8`, `cangjie/cangjie`, `color-studio-picker/index`, `fix-helper/fix-parser`, `invisible-text-detector/analyze-clipboard-invisible-characters` |
| network                |        5 | `gradle-plugins/index`, `jisho/search`, `leetcode/daily-challenge`, `scrapbook/view-recent-posts`, `workflowy-inbox/view`                                         |
| applications.frontmost |        1 | `input-source-switcher/form`                                                                                                                                      |

## Excluded from the demo

Dropped from `examples/browser-demo/catalog.json` by `scripts/browser-catalog.ts`
because a sweep found them `browser-limit`.

| Command                                                          | Denied capability      |
| ---------------------------------------------------------------- | ---------------------- |
| `8-divide/divide-by-8`                                           | selection.text         |
| `appgrid/index`                                                  | applications.list      |
| `cangjie/cangjie`                                                | selection.text         |
| `color-studio-picker/index`                                      | selection.text         |
| `ego-lite/new-tab`                                               | applications.list      |
| `fix-helper/fix-parser`                                          | selection.text         |
| `flighty/view-flights`                                           | applications.list      |
| `gradle-plugins/index`                                           | network                |
| `input-source-switcher/form`                                     | applications.frontmost |
| `invisible-text-detector/analyze-clipboard-invisible-characters` | selection.text         |
| `invisible-text-detector/fix-invisible-characters`               | selection.text         |
| `jisho/search`                                                   | network                |
| `leetcode/daily-challenge`                                       | network                |
| `menucloak/open-settings`                                        | applications.list      |
| `menucloak/toggle`                                               | applications.list      |
| `menucloak/turn-off`                                             | applications.list      |
| `menucloak/turn-on`                                              | applications.list      |
| `quick-jump/search`                                              | applications.list      |
| `rectangle/almost-maximize`                                      | applications.list      |
| `rectangle/bottom-center-sixth`                                  | applications.list      |
| `rectangle/bottom-half`                                          | applications.list      |
| `rectangle/bottom-left`                                          | applications.list      |
| `rectangle/bottom-left-sixth`                                    | applications.list      |
| `rectangle/bottom-right`                                         | applications.list      |
| `rectangle/bottom-right-sixth`                                   | applications.list      |
| `rectangle/cascade-all`                                          | applications.list      |
| `rectangle/center`                                               | applications.list      |
| `rectangle/center-half`                                          | applications.list      |
| `rectangle/center-third`                                         | applications.list      |
| `rectangle/first-fourth`                                         | applications.list      |
| `rectangle/first-third`                                          | applications.list      |
| `rectangle/first-three-fourths`                                  | applications.list      |
| `rectangle/first-two-thirds`                                     | applications.list      |
| `rectangle/larger`                                               | applications.list      |
| `rectangle/last-fourth`                                          | applications.list      |
| `rectangle/last-third`                                           | applications.list      |
| `rectangle/last-three-fourths`                                   | applications.list      |
| `rectangle/last-two-thirds`                                      | applications.list      |
| `rectangle/left-half`                                            | applications.list      |
| `rectangle/maximize`                                             | applications.list      |
| `rectangle/maximize-height`                                      | applications.list      |
| `rectangle/move-down`                                            | applications.list      |
| `rectangle/move-left`                                            | applications.list      |
| `rectangle/move-right`                                           | applications.list      |
| `rectangle/move-up`                                              | applications.list      |
| `rectangle/next-display`                                         | applications.list      |
| `rectangle/previous-display`                                     | applications.list      |
| `rectangle/restore`                                              | applications.list      |
| `rectangle/right-half`                                           | applications.list      |
| `rectangle/second-fourth`                                        | applications.list      |
| `rectangle/smaller`                                              | applications.list      |
| `rectangle/specified`                                            | applications.list      |
| `rectangle/third-fourth`                                         | applications.list      |
| `rectangle/top-center-sixth`                                     | applications.list      |
| `rectangle/top-half`                                             | applications.list      |
| `rectangle/top-left`                                             | applications.list      |
| `rectangle/top-left-sixth`                                       | applications.list      |
| `rectangle/top-right`                                            | applications.list      |
| `rectangle/top-right-sixth`                                      | applications.list      |
| `scrapbook/view-recent-posts`                                    | network                |
| `superwhisper/copy-last-history`                                 | applications.list      |
| `superwhisper/open-settings`                                     | applications.list      |
| `superwhisper/paste-last-history`                                | applications.list      |
| `superwhisper/toggle-record`                                     | applications.list      |
| `tategaki/japanese-vertical-text`                                | selection.text         |
| `text-decorator/decorate-text-with-font`                         | selection.text         |
| `workflowy-inbox/view`                                           | network                |
