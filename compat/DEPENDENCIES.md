# Corpus dependencies

What the pinned corpus needs beyond the baseline packages Blast provides
(`@raycast/api`, `@raycast/utils`, `react`) and Node built-ins. An extension is
*satisfied* when every package it declares in `dependencies` and every
package its non-test sources import is provided. `devDependencies`, test
files and `@types/*` never count because they are not bundled, and a
specifier npm could not name (`#imports`, a native module) is not a
package; a scope-shaped tsconfig alias (`@lib/utils`) is, because the
bundler cannot resolve it either.

Source: [dependencies.json](dependencies.json), from the same scan as
[raycast-usage.json](raycast-usage.json) at commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`
(3493 extensions).

## Summary

- 1607 of 3493 extensions need nothing beyond the baseline set.
- 1939 of 3493 extensions are satisfied by the current shared allowlist
  (`@raycast/api`, `@raycast/utils`, `axios`, `cheerio`, `cross-fetch`, `date-fns`, `dayjs`, `fuse.js`, `lodash`, `moment`, `nanoid`, `node-fetch`, `node-html-markdown`, `react`, `uuid`, `zod`).
- 1436 packages are declared or imported by at least one extension.

## Cumulative curve

How many extensions are satisfied once the top N packages by imports are provided.

| Packages provided | Extensions satisfied |
| --- | --- |
| 0 | 1607 |
| 10 | 1933 |
| 20 | 2061 |
| 30 | 2124 |
| 50 | 2218 |

## Top 60 packages

Ordered by imported extensions (desc), then name. Declared counts
`dependencies` entries only; the share is of the declaring extensions.

| Package | Imported | Declared | Top major |
| --- | --- | --- | --- |
| `node-fetch` | 328 | 363 | 3 (94%) |
| `axios` | 199 | 210 | 1 (87%) |
| `date-fns` | 135 | 141 | 4 (53%) |
| `run-applescript` | 95 | 110 | 6 (69%) |
| `lodash` | 72 | 81 | 4 (100%) |
| `zod` | 66 | 71 | 4 (51%) |
| `cheerio` | 62 | 64 | 1 (98%) |
| `dayjs` | 60 | 62 | 1 (100%) |
| `fuse.js` | 50 | 52 | 7 (67%) |
| `uuid` | 49 | 50 | 11 (42%) |
| `nanoid` | 48 | 52 | 5 (48%) |
| `cross-fetch` | 46 | 46 | 4 (78%) |
| `node-html-markdown` | 37 | 40 | 1 (73%) |
| `moment` | 36 | 39 | 2 (100%) |
| `execa` | 35 | 35 | 9 (54%) |
| `rss-parser` | 35 | 35 | 3 (100%) |
| `got` | 33 | 39 | 12 (46%) |
| `turndown` | 33 | 34 | 7 (100%) |
| `fs-extra` | 32 | 34 | 11 (88%) |
| `openai` | 29 | 29 | 4 (59%) |
| `plist` | 22 | 22 | 3 (95%) |
| `swr` | 22 | 23 | 2 (70%) |
| `raycast-cross-extension` | 21 | 23 | 0 (100%) |
| `yaml` | 21 | 21 | 2 (100%) |
| `@chrismessina/raycast-logger` | 20 | 20 | 1 (100%) |
| `fast-xml-parser` | 20 | 20 | 5 (75%) |
| `form-data` | 20 | 26 | 4 (100%) |
| `algoliasearch` | 19 | 19 | 4 (95%) |
| `chrono-node` | 19 | 19 | 2 (100%) |
| `ai` | 18 | 18 | 7 (67%) |
| `filesize` | 18 | 18 | 11 (83%) |
| `javascript-time-ago` | 18 | 18 | 2 (100%) |
| `js-yaml` | 18 | 16 | 4 (100%) |
| `@tanstack/react-query` | 17 | 19 | 5 (100%) |
| `open` | 16 | 22 | 8 (77%) |
| `qrcode` | 16 | 16 | 1 (100%) |
| `marked` | 13 | 13 | 15 (31%) |
| `node-html-parser` | 13 | 16 | 6 (50%) |
| `@chrismessina/raycast-kit` | 12 | 12 | 0 (100%) |
| `file-type` | 12 | 13 | 21 (38%) |
| `jimp` | 12 | 14 | 1 (79%) |
| `proper-lockfile` | 12 | 12 | 4 (100%) |
| `tildify` | 12 | 12 | 3 (100%) |
| `xml2js` | 12 | 13 | 0 (100%) |
| `@supabase/supabase-js` | 11 | 11 | 2 (100%) |
| `raycast-toolkit` | 11 | 11 | 1 (100%) |
| `fast-glob` | 10 | 9 | 3 (100%) |
| `gray-matter` | 10 | 10 | 4 (100%) |
| `linkedom` | 10 | 10 | 0 (100%) |
| `lodash.groupby` | 10 | 10 | 4 (100%) |
| `luxon` | 10 | 10 | 3 (100%) |
| `mime-types` | 10 | 10 | 2 (60%) |
| `semver` | 10 | 10 | 7 (100%) |
| `@ai-sdk/openai-compatible` | 9 | 9 | 3 (67%) |
| `@apollo/client` | 9 | 9 | 3 (100%) |
| `@modelcontextprotocol/sdk` | 9 | 9 | 1 (100%) |
| `csv-parse` | 9 | 9 | 5 (67%) |
| `domhandler` | 9 | 0 | — |
| `json2md` | 9 | 10 | 2 (70%) |
| `pinyin-pro` | 9 | 9 | 3 (100%) |

