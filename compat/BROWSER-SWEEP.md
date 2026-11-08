# Browser catalog sweep

Catalog commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; date 2026-11-08; 237 command records; wall time 36.5 s.

## Totals

- completed: 58 command(s)
- empty: 6 command(s)
- needs-preferences: 51 command(s)
- network: 3 command(s)
- rendered: 107 command(s)
- runtime-error:Applications are unavailable in a browser tab: 1 command(s)
- runtime-error:Command exited with code 1: 5 command(s)
- runtime-error:Selection is unavailable in a browser tab: 6 command(s)

## Failures

| Signature                                                   | Commands | Examples                                                                                                                                       |
| ----------------------------------------------------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| needs-preferences                                           |       51 | `bookstack/search-command`, `bookstack/show-all-books`, `bookstack/show-all-shelves`, `codepen/create-collection`, `codepen/create-pen`        |
| runtime-error:Selection is unavailable in a browser tab     |        6 | `8-divide/divide-by-8`, `cangjie/cangjie`, `color-studio-picker/index`, `fix-helper/fix-parser`, `tategaki/japanese-vertical-text`             |
| runtime-error:Command exited with code 1                    |        5 | `dot-new/index`, `ego-lite/search-bookmarks`, `hyrule-compendium-search/getEntry`, `sf-symbols-search/index`, `trenit/departures-and-arrivals` |
| network                                                     |        3 | `gradle-plugins/index`, `jisho/search`, `scrapbook/view-recent-posts`                                                                          |
| runtime-error:Applications are unavailable in a browser tab |        1 | `input-source-switcher/form`                                                                                                                   |

## Capability usage
