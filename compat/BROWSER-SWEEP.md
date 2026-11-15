# Browser catalog sweep

Catalog commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; date 2026-11-15; 170 command records; wall time 118.6 s.

Rendered: **141 / 168** (108 rendered + 33 rendered with placeholder preferences) of 170 commands − 2 browser-limit.
Not rendered: 5 Blast failure(s), 16 needing real credentials.

## Totals

- browser-limit: 2 command(s)
- completed: 4 command(s)
- empty: 2 command(s)
- needs-credentials: 16 command(s)
- rendered: 108 command(s)
- rendered-with-placeholders: 33 command(s)
- runtime-error:Error during unlock process: Error: Not authenticated. Please run the 'Authenticate' command.: 1 command(s)
- runtime-error:Height must be an integer: 1 command(s)
- runtime-error:Width must be an integer: 1 command(s)
- timeout: 2 command(s)

## Blast failures

| Signature | Commands | Examples |
| --- | ---: | --- |
| timeout | 2 | `sf-symbols-search/index`, `uk-bank-holidays/index` |
| runtime-error:Error during unlock process: Error: Not authenticated. Please run the 'Authenticate' command. | 1 | `ring-intercom/unlock` |
| runtime-error:Height must be an integer | 1 | `convert-px-to-vw-vh/height` |
| runtime-error:Width must be an integer | 1 | `convert-px-to-vw-vh/width` |

## Needs credentials

Ran with placeholder preferences, then the service refused them.

| Response | Commands | Examples |
| --- | ---: | --- |
| HTTP 404 api.keygen.sh | 7 | `keygen/api-tokens`, `keygen/api-usage`, `keygen/environments`, `keygen/licenses`, `keygen/policies` |
| HTTP 401 api.v0.dev | 3 | `v0-by-vercel/new-chat`, `v0-by-vercel/view-billing`, `v0-by-vercel/view-projects` |
| HTTP 401 api.hevyapp.com | 2 | `hevy/search-routines`, `hevy/search-workouts` |
| HTTP 401 app.humaans.io | 2 | `humaans/clock-in`, `humaans/clock-out` |
| HTTP 404 placeholder URL | 2 | `bookstack/show-all-books`, `bookstack/show-all-shelves` |

## Browser limits

Denied by the browser host (capability log), not by Blast's runtime.

| Capability | Commands | Examples |
| --- | ---: | --- |
| network | 1 | `hyrule-compendium-search/getEntry` |
| node:sqlite | 1 | `ego-lite/search-bookmarks` |

## Excluded from the demo

Dropped from `examples/browser-demo/catalog.json` by `scripts/browser-catalog.ts`
because a sweep found them `browser-limit`.

| Command | Denied capability |
| --- | --- |
| `8-divide/divide-by-8` | selection.text |
| `appgrid/index` | applications.list |
| `cangjie/cangjie` | selection.text |
| `color-studio-picker/index` | selection.text |
| `ego-lite/new-tab` | applications.list |
| `fix-helper/fix-parser` | selection.text |
| `flighty/view-flights` | applications.list |
| `gradle-plugins/index` | network |
| `input-source-switcher/form` | applications.frontmost |
| `invisible-text-detector/analyze-clipboard-invisible-characters` | selection.text |
| `invisible-text-detector/fix-invisible-characters` | selection.text |
| `jisho/search` | network |
| `leetcode/daily-challenge` | network |
| `menucloak/open-settings` | applications.list |
| `menucloak/toggle` | applications.list |
| `menucloak/turn-off` | applications.list |
| `menucloak/turn-on` | applications.list |
| `quick-jump/search` | applications.list |
| `rectangle/almost-maximize` | applications.list |
| `rectangle/bottom-center-sixth` | applications.list |
| `rectangle/bottom-half` | applications.list |
| `rectangle/bottom-left` | applications.list |
| `rectangle/bottom-left-sixth` | applications.list |
| `rectangle/bottom-right` | applications.list |
| `rectangle/bottom-right-sixth` | applications.list |
| `rectangle/cascade-all` | applications.list |
| `rectangle/center` | applications.list |
| `rectangle/center-half` | applications.list |
| `rectangle/center-third` | applications.list |
| `rectangle/first-fourth` | applications.list |
| `rectangle/first-third` | applications.list |
| `rectangle/first-three-fourths` | applications.list |
| `rectangle/first-two-thirds` | applications.list |
| `rectangle/larger` | applications.list |
| `rectangle/last-fourth` | applications.list |
| `rectangle/last-third` | applications.list |
| `rectangle/last-three-fourths` | applications.list |
| `rectangle/last-two-thirds` | applications.list |
| `rectangle/left-half` | applications.list |
| `rectangle/maximize` | applications.list |
| `rectangle/maximize-height` | applications.list |
| `rectangle/move-down` | applications.list |
| `rectangle/move-left` | applications.list |
| `rectangle/move-right` | applications.list |
| `rectangle/move-up` | applications.list |
| `rectangle/next-display` | applications.list |
| `rectangle/previous-display` | applications.list |
| `rectangle/restore` | applications.list |
| `rectangle/right-half` | applications.list |
| `rectangle/second-fourth` | applications.list |
| `rectangle/smaller` | applications.list |
| `rectangle/specified` | applications.list |
| `rectangle/third-fourth` | applications.list |
| `rectangle/top-center-sixth` | applications.list |
| `rectangle/top-half` | applications.list |
| `rectangle/top-left` | applications.list |
| `rectangle/top-left-sixth` | applications.list |
| `rectangle/top-right` | applications.list |
| `rectangle/top-right-sixth` | applications.list |
| `scrapbook/view-recent-posts` | network |
| `superwhisper/copy-last-history` | applications.list |
| `superwhisper/open-settings` | applications.list |
| `superwhisper/paste-last-history` | applications.list |
| `superwhisper/toggle-record` | applications.list |
| `tategaki/japanese-vertical-text` | selection.text |
| `text-decorator/decorate-text-with-font` | selection.text |
| `workflowy-inbox/view` | network |

