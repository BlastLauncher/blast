# Browser catalog sweep

Catalog commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; date 2026-11-06; 237 command records; wall time 64.8 s.

## Totals

- empty: 72 command(s)
- needs-preferences: 51 command(s)
- network: 5 command(s)
- rendered: 93 command(s)
- runtime-error:Applications are unavailable in a browser tab: 1 command(s)
- runtime-error:Cannot find module 'sqlite': 1 command(s)
- runtime-error:Cannot read properties of undefined (reading '$and'): 1 command(s)
- runtime-error:ENOENT: no such file or directory, open '/blast/assets/dot-new/dataset.json': 1 command(s)
- runtime-error:ENOENT: no such file or directory, open '/blast/assets/package.json': 1 command(s)
- runtime-error:ENOENT: no such file or directory, open '/blast/assets/sf-symbols-search/symbols/data.json': 1 command(s)
- runtime-error:Selection is unavailable in a browser tab: 9 command(s)
- runtime-error:Unexpected end of JSON input: 1 command(s)

## Failures

| Signature                                                                                                 | Commands | Examples                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------------------------------- |
| needs-preferences                                                                                         |       51 | `bookstack/search-command`, `bookstack/show-all-books`, `bookstack/show-all-shelves`, `codepen/create-collection`, `codepen/create-pen` |
| runtime-error:Selection is unavailable in a browser tab                                                   |        9 | `8-divide/divide-by-8`, `cangjie/cangjie`, `color-studio-picker/index`, `fix-helper/fix-parser`, `input-source-switcher/index`          |
| network                                                                                                   |        5 | `gradle-plugins/index`, `hyrule-compendium-search/broadSearch`, `jisho/search`, `leetcode/potd-menu-bar`, `scrapbook/view-recent-posts` |
| runtime-error:Applications are unavailable in a browser tab                                               |        1 | `input-source-switcher/form`                                                                                                            |
| runtime-error:Cannot find module 'sqlite'                                                                 |        1 | `ego-lite/search-bookmarks`                                                                                                             |
| runtime-error:Cannot read properties of undefined (reading '$and')                                        |        1 | `hyrule-compendium-search/getEntry`                                                                                                     |
| runtime-error:ENOENT: no such file or directory, open '/blast/assets/dot-new/dataset.json'                |        1 | `dot-new/index`                                                                                                                         |
| runtime-error:ENOENT: no such file or directory, open '/blast/assets/package.json'                        |        1 | `trenit/departures-and-arrivals`                                                                                                        |
| runtime-error:ENOENT: no such file or directory, open '/blast/assets/sf-symbols-search/symbols/data.json' |        1 | `sf-symbols-search/index`                                                                                                               |
| runtime-error:Unexpected end of JSON input                                                                |        1 | `uk-bank-holidays/index`                                                                                                                |

## Capability usage
