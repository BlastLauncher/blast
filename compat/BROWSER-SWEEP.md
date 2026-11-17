# Browser catalog sweep

Catalog commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; date 2026-11-17; 174 command records; wall time 108.6 s.

Rendered: **130 / 174** (110 rendered + 20 rendered with placeholder preferences) of 174 commands − 0 browser-limit.
Not rendered: 14 Blast failure(s), 24 needing real credentials.

## Totals

- completed: 4 command(s)
- empty: 2 command(s)
- needs-credentials: 24 command(s)
- rendered: 110 command(s)
- rendered-with-placeholders: 20 command(s)
- runtime-error:Error during unlock process: Error: Not authenticated. Please run the 'Authenticate' command.: 1 command(s)
- runtime-error:Error in event listener: TypeError: xe.default.createBrotliDecompress is not a function: 1 command(s)
- runtime-error:Failed to load resource: the server responded with a status of 403 (Forbidden): 4 command(s)
- runtime-error:Failed to load resource: the server responded with a status of 404 (Not Found): 1 command(s)
- runtime-error:Failed to load resource: the server responded with a status of 502 (Bad Gateway): 4 command(s)
- runtime-error:Height must be an integer: 1 command(s)
- runtime-error:Width must be an integer: 1 command(s)
- timeout: 1 command(s)

## Blast failures

| Signature                                                                                                   | Commands | Examples                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| runtime-error:Failed to load resource: the server responded with a status of 403 (Forbidden)                |        4 | `keeper-security/generate-passphrase`, `keeper-security/generate-password-quick`, `keeper-security/my-vault`, `scrapbook/view-recent-posts` |
| runtime-error:Failed to load resource: the server responded with a status of 502 (Bad Gateway)              |        4 | `mealie/add-to-shopping-list`, `mealie/meal-plan`, `mealie/search-recipes`, `mealie/shopping-lists`                                         |
| runtime-error:Error during unlock process: Error: Not authenticated. Please run the 'Authenticate' command. |        1 | `ring-intercom/unlock`                                                                                                                      |
| runtime-error:Error in event listener: TypeError: xe.default.createBrotliDecompress is not a function       |        1 | `uk-bank-holidays/index`                                                                                                                    |
| runtime-error:Failed to load resource: the server responded with a status of 404 (Not Found)                |        1 | `hyrule-compendium-search/broadSearch`                                                                                                      |
| runtime-error:Height must be an integer                                                                     |        1 | `convert-px-to-vw-vh/height`                                                                                                                |
| runtime-error:Width must be an integer                                                                      |        1 | `convert-px-to-vw-vh/width`                                                                                                                 |
| timeout                                                                                                     |        1 | `sf-symbols-search/index`                                                                                                                   |

## Needs credentials

Ran with placeholder preferences, then the service refused them.

| Response                               | Commands | Examples                                                                                                                                      |
| -------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP 404 api.keygen.sh                 |        7 | `keygen/api-tokens`, `keygen/api-usage`, `keygen/environments`, `keygen/licenses`, `keygen/policies`                                          |
| HTTP 401 api.v0.dev                    |        5 | `v0-by-vercel/manage-profiles`, `v0-by-vercel/new-chat`, `v0-by-vercel/view-billing`, `v0-by-vercel/view-chats`, `v0-by-vercel/view-projects` |
| HTTP 401 api.codepen.io                |        3 | `codepen/search-assets`, `codepen/search-collections`, `codepen/search-pens`                                                                  |
| HTTP 401 api.hevyapp.com               |        2 | `hevy/search-routines`, `hevy/search-workouts`                                                                                                |
| HTTP 401 app.humaans.io                |        2 | `humaans/clock-in`, `humaans/clock-out`                                                                                                       |
| HTTP 404 placeholder URL               |        2 | `bookstack/show-all-books`, `bookstack/show-all-shelves`                                                                                      |
| HTTP 401 api.parcel.app                |        1 | `parcel/my-deliveries`                                                                                                                        |
| HTTP 401 workflowy.com                 |        1 | `workflowy-inbox/view`                                                                                                                        |
| HTTP 404 botw-compendium.herokuapp.com |        1 | `hyrule-compendium-search/getEntry`                                                                                                           |

## Browser limits

Denied by the browser host (capability log), not by Blast's runtime.

| Capability | Commands | Examples |
| ---------- | -------: | -------- |

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
| `ego-lite/search-bookmarks`                                      | node:sqlite            |
| `fix-helper/fix-parser`                                          | selection.text         |
| `flighty/view-flights`                                           | applications.list      |
| `input-source-switcher/form`                                     | applications.frontmost |
| `invisible-text-detector/analyze-clipboard-invisible-characters` | selection.text         |
| `invisible-text-detector/fix-invisible-characters`               | selection.text         |
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
| `superwhisper/copy-last-history`                                 | applications.list      |
| `superwhisper/open-settings`                                     | applications.list      |
| `superwhisper/paste-last-history`                                | applications.list      |
| `superwhisper/toggle-record`                                     | applications.list      |
| `tategaki/japanese-vertical-text`                                | selection.text         |
| `text-decorator/decorate-text-with-font`                         | selection.text         |
