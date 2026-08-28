# Compatibility census

Methodology and results for the public extension corpus census that informs
the measured Raycast compatibility surface.

## Corpus

- source: <https://github.com/raycast/extensions>
- revision: `d4aae99c5e1d7ec19b2341f1058c20adfd3fdc91`
- scanned: 3,231 extension directories (immediate subdirectories containing a
  `package.json`), 38,393 source files
- full report: [`census.json`](./census.json)

## Methodology

`@blastlauncher/compatibility` scans each extension statically:

- the manifest is summarized leniently (name, title, categories, command
  modes, preference types, and the `@raycast/api` dependency range);
- every source file (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` outside
  build directories) is parsed with the TypeScript compiler API, and all
  `@raycast/api` import sites are collected: named imports (including type-only
  and aliases), namespace imports (`<namespace>`), re-exports, dynamic
  `import()` (`<dynamic>`), and `require()` (`<require>`).

The scan is static only: it records import sites, not runtime behavior, and it
does not execute any extension code. Repeated runs over the same revision
produce byte-identical reports; each report records the corpus revision and
the Blast protocol version.

Regenerate with:

```bash
node packages/blast-compatibility/scripts/scan-corpus.mjs \
  <corpus-directory> <corpus-revision> docs/v2/compatibility/census.json \
  "https://github.com/raycast/extensions"
```

## Headline numbers

- 3,229 of 3,231 extensions import `@raycast/api`;
- command modes: 6,716 `view`, 2,925 `no-view`, 317 `menu-bar` commands;
- manifest preference types: `textfield` 1,716, `checkbox` 1,240,
  `dropdown` 1,021, `password` 1,007, plus smaller counts of `directory`,
  `appPicker`, and `file`.

## Top 30 APIs by extension count

| #   | API                        | Extensions | Import sites | Share |
| --- | -------------------------- | ---------: | -----------: | ----: |
| 1   | `ActionPanel`              |       2823 |         8792 | 87.4% |
| 2   | `Action`                   |       2785 |         9027 | 86.2% |
| 3   | `List`                     |       2415 |         6929 | 74.7% |
| 4   | `Icon`                     |       2394 |         8493 | 74.1% |
| 5   | `showToast`                |       2300 |         6898 | 71.2% |
| 6   | `Toast`                    |       2244 |         6742 | 69.5% |
| 7   | `getPreferenceValues`      |       1957 |         4064 | 60.6% |
| 8   | `Color`                    |       1296 |         3125 | 40.1% |
| 9   | `Form`                     |       1244 |         2649 | 38.5% |
| 10  | `Detail`                   |       1203 |         2157 | 37.2% |
| 11  | `Clipboard`                |        953 |         1566 | 29.5% |
| 12  | `useNavigation`            |        929 |         2113 | 28.8% |
| 13  | `LocalStorage`             |        856 |         1624 | 26.5% |
| 14  | `showHUD`                  |        835 |         1826 | 25.8% |
| 15  | `open`                     |        823 |         1484 | 25.5% |
| 16  | `confirmAlert`             |        753 |         1352 | 23.3% |
| 17  | `environment`              |        638 |         1005 | 19.7% |
| 18  | `Alert`                    |        627 |         1075 | 19.4% |
| 19  | `Keyboard`                 |        588 |         1181 | 18.2% |
| 20  | `LaunchProps`              |        577 |          965 | 17.9% |
| 21  | `closeMainWindow`          |        547 |         1181 | 16.9% |
| 22  | `popToRoot`                |        524 |          845 | 16.2% |
| 23  | `openExtensionPreferences` |        450 |          694 | 13.9% |
| 24  | `Image`                    |        433 |          753 | 13.4% |
| 25  | `LaunchType`               |        366 |          642 | 11.3% |
| 26  | `launchCommand`            |        313 |          538 |  9.7% |
| 27  | `MenuBarExtra`             |        296 |          367 |  9.2% |
| 28  | `Grid`                     |        294 |          510 |  9.1% |
| 29  | `Cache`                    |        292 |          413 |  9.0% |
| 30  | `getSelectedText`          |        228 |          287 |  7.1% |

The full 89-entry distribution is in [`census.json`](./census.json). The
remaining long tail (below 7% each) includes `getApplications`, OAuth,
`AI`, `Tool`, browser extensions, window management, and the deprecated
localStorage function forms.

## Reading for the adapter plan

- the view stack (`List`, `Detail`, `Grid`, plus `Action`/`ActionPanel` and
  `Icon`/`Color` imagery) covers the large majority of extensions and is the
  first renderer target, matching the scene contract's `List`/`List.Item`/
  action vocabulary;
- feedback (`showToast`, `showHUD`, `confirmAlert`) and `Clipboard` are the
  most-used imperative APIs and map onto capability-brokered host services;
- `getPreferenceValues`, manifest preferences, and the measured `Form` subset
  are the largest configuration surfaces;
- navigation (`useNavigation`, `push`, `popToRoot`) and `LocalStorage`/`Cache`
  are the next runtime services after the first view stack;
- `menu-bar` commands and `MenuBarExtra` are a distinct UI surface that should
  be scheduled after the main window path works.
