# Corpus dependencies

What the pinned corpus needs beyond the packages Blast already provides
(`@raycast/api`, `@raycast/utils`, `react`) and Node built-ins. An extension is
*satisfied* when every package it declares in `dependencies` and every
package its non-test sources import is provided. `devDependencies`, test
files and `@types/*` never count because they are not bundled, and a
specifier npm could not name (`#imports`, a native module) is not a
package; a scope-shaped tsconfig alias (`@lib/utils`) is, because the
bundler cannot resolve it either.

Source: [dependencies.json](dependencies.json), from the same scan as
[raycast-usage.json](raycast-usage.json) at commit `3b812d1e153a1862df29bc8ec34e170c728512ea`
(3443 extensions).

## Summary

- 1573 of 3443 extensions need nothing beyond the provided set.
- 1427 packages are declared or imported by at least one extension.

## Cumulative curve

How many extensions are satisfied once the top N packages by imports are provided.

| Packages provided | Extensions satisfied |
| --- | --- |
| 0 | 1573 |
| 10 | 1986 |
| 20 | 2139 |
| 30 | 2205 |
| 50 | 2306 |

## Top 60 packages

Ordered by imported extensions (desc), then name. Declared counts
`dependencies` entries only; the share is of the declaring extensions.

| Package | Imported | Declared | Top major |
| --- | --- | --- | --- |
| `node-fetch` | 331 | 366 | 3 (95%) |
| `axios` | 200 | 211 | 1 (87%) |
| `date-fns` | 135 | 141 | 4 (53%) |
| `run-applescript` | 96 | 111 | 6 (69%) |
| `lodash` | 72 | 81 | 4 (100%) |
| `zod` | 64 | 69 | 4 (51%) |
| `cheerio` | 62 | 64 | 1 (98%) |
| `dayjs` | 59 | 61 | 1 (100%) |
| `fuse.js` | 49 | 51 | 7 (67%) |
| `uuid` | 49 | 50 | 11 (42%) |
| `nanoid` | 48 | 52 | 5 (48%) |
| `cross-fetch` | 46 | 46 | 4 (78%) |
| `moment` | 36 | 39 | 2 (100%) |
| `node-html-markdown` | 36 | 39 | 1 (74%) |
| `rss-parser` | 35 | 35 | 3 (100%) |
| `execa` | 34 | 34 | 9 (53%) |
| `got` | 33 | 39 | 12 (46%) |
| `turndown` | 33 | 34 | 7 (100%) |
| `fs-extra` | 32 | 34 | 11 (88%) |
| `openai` | 29 | 29 | 4 (66%) |
| `plist` | 22 | 22 | 3 (95%) |
| `swr` | 22 | 23 | 2 (70%) |
| `raycast-cross-extension` | 21 | 23 | 0 (100%) |
| `fast-xml-parser` | 20 | 20 | 5 (75%) |
| `form-data` | 20 | 26 | 4 (100%) |
| `yaml` | 20 | 20 | 2 (100%) |
| `algoliasearch` | 19 | 19 | 4 (95%) |
| `ai` | 18 | 18 | 7 (67%) |
| `chrono-node` | 18 | 18 | 2 (100%) |
| `javascript-time-ago` | 18 | 18 | 2 (100%) |
| `js-yaml` | 18 | 16 | 4 (100%) |
| `@chrismessina/raycast-logger` | 17 | 17 | 1 (100%) |
| `@tanstack/react-query` | 17 | 19 | 5 (100%) |
| `filesize` | 17 | 17 | 11 (82%) |
| `open` | 17 | 23 | 8 (78%) |
| `qrcode` | 16 | 16 | 1 (100%) |
| `node-html-parser` | 14 | 17 | 6 (47%) |
| `file-type` | 12 | 13 | 21 (38%) |
| `jimp` | 12 | 14 | 1 (79%) |
| `marked` | 12 | 12 | 15 (25%) |
| `tildify` | 12 | 12 | 3 (100%) |
| `xml2js` | 12 | 13 | 0 (100%) |
| `@supabase/supabase-js` | 11 | 11 | 2 (100%) |
| `raycast-toolkit` | 11 | 11 | 1 (100%) |
| `fast-glob` | 10 | 9 | 3 (100%) |
| `gray-matter` | 10 | 10 | 4 (100%) |
| `lodash.groupby` | 10 | 10 | 4 (100%) |
| `luxon` | 10 | 10 | 3 (100%) |
| `mime-types` | 10 | 10 | 2 (60%) |
| `semver` | 10 | 10 | 7 (100%) |
| `@ai-sdk/openai-compatible` | 9 | 9 | 3 (67%) |
| `@apollo/client` | 9 | 9 | 3 (100%) |
| `@modelcontextprotocol/sdk` | 9 | 9 | 1 (100%) |
| `csv-parse` | 9 | 9 | 5 (78%) |
| `domhandler` | 9 | 0 | — |
| `json2md` | 9 | 10 | 2 (70%) |
| `linkedom` | 9 | 9 | 0 (100%) |
| `pinyin-pro` | 9 | 9 | 3 (100%) |
| `proper-lockfile` | 9 | 9 | 4 (100%) |
| `sql.js` | 9 | 9 | 1 (100%) |

