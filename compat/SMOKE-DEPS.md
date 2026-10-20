# Corpus smoke report (installed dependencies)

Headless run of every command of the dependency-heavy set
([corpus-deps.json](corpus-deps.json)) at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`. Each extension's own dependencies are installed with the
engine's dependency install (decision 0008: `npm install --omit=dev --ignore-scripts`
from the extension's lockfile) before its commands are bundled, with the shared
dependency fallback present; the install is deleted afterwards. Broker, preference
defaults and probe are the same as [SMOKE.md](SMOKE.md).
Required launch arguments and preferences without a default get deterministic
placeholders, so the outcome is what the command really does with them (the `Inputs`
column): text/password arguments `blast`, dropdown arguments their first option;
textfield/password preferences `blast-smoke`, checkbox `false`, dropdown the first
option, appPicker empty, file/directory a scratch directory.
Regenerate with `bun run corpus:smoke-deps` (network required; not part of
`bun run verify`).

25/25 installs succeeded. 56 commands: rendered 54, completed 0, install-failed 0, bundle-failed 0, bundle-timeout 0, crashed 0, needs-arguments 0, needs-preferences 0, capability-denied 2, network 0, timeout 0, unsupported-api 0, unsupported-mode 0.
Peak .cache 446.1 MB, wall time 208 s.
20 ran with placeholder inputs (arguments 5, preferences 14, both 1).

## Installs

| Extension                     | Packages                                                                   | Install   | Time   | Size     | Detail |
| ----------------------------- | -------------------------------------------------------------------------- | --------- | ------ | -------- | ------ |
| `android-adb-input`           | `execa`                                                                    | installed | 0.9 s  | 0.2 MB   |        |
| `atomberg-raycast-extension`  | `@tanstack/react-query`                                                    | installed | 3.8 s  | 4.3 MB   |        |
| `bed-time-calculator`         | `chrono-node`                                                              | installed | 1.6 s  | 3.0 MB   |        |
| `caschys-blog`                | `xml2js`                                                                   | installed | 1.9 s  | 4.7 MB   |        |
| `ccfddl`                      | `js-yaml`                                                                  | installed | 2.7 s  | 2.8 MB   |        |
| `colorify`                    | `@lokesh.dhakar/quantize`, `file-type`, `get-pixels`, `image-size`, `jimp` | installed | 2.6 s  | 29.4 MB  |        |
| `commandcode-ai`              | `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`, `ai`                     | installed | 3.4 s  | 22.2 MB  |        |
| `control-d`                   | `form-data`                                                                | installed | 1.3 s  | 2.3 MB   |        |
| `defichain-lottery`           | `qrcode`                                                                   | installed | 2.0 s  | 8.1 MB   |        |
| `emojify`                     | `openai`                                                                   | installed | 4.3 s  | 19.5 MB  |        |
| `esa-search`                  | `@suin/esa-api`, `swr`                                                     | installed | 3.3 s  | 6.5 MB   |        |
| `featurebase`                 | `turndown`                                                                 | installed | 3.6 s  | 8.7 MB   |        |
| `image-diff-checker`          | `jimp`, `pixelmatch`                                                       | installed | 6.8 s  | 27.2 MB  |        |
| `irish-rail`                  | `fast-xml-parser`                                                          | installed | 1.8 s  | 3.4 MB   |        |
| `lyne`                        | `open`                                                                     | installed | 0.7 s  | 0.1 MB   |        |
| `markdown-preview`            | `marked`                                                                   | installed | 3.7 s  | 2.6 MB   |        |
| `monorepo-manager`            | `@yarnpkg/core`, `fs-extra`, `parse-git-config`                            | installed | 4.9 s  | 14.6 MB  |        |
| `oci`                         | `filesize`, `oci-sdk`                                                      | installed | 31.8 s | 216.3 MB |        |
| `owl`                         | `raycast`, `raycast-cross-extension`                                       | installed | 2.7 s  | 2.4 MB   |        |
| `screen-sharing-recents`      | `plist`                                                                    | installed | 0.8 s  | 8.7 MB   |        |
| `search-composer-packagist`   | `algoliasearch`                                                            | installed | 2.4 s  | 2.2 MB   |        |
| `search-regexp`               | `got`                                                                      | installed | 0.9 s  | 0.7 MB   |        |
| `shopify-developer-changelog` | `rss-parser`                                                               | installed | 0.7 s  | 2.1 MB   |        |
| `vanishlink`                  | `node-html-parser`                                                         | installed | 2.8 s  | 3.0 MB   |        |
| `youtube`                     | `@googleapis/youtube`, `duration-iso-8601`, `he`, `javascript-time-ago`    | installed | 3.8 s  | 26.7 MB  |        |

## Top failures

| Commands | Outcome           | Cause                      | Extensions                   | Likely fix                                                              |
| -------- | ----------------- | -------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| 2        | capability-denied | capability denied open.url | `caschys-blog`, `esa-search` | headless broker: add a default handler or classify it as needing a host |

## Commands

| Command                                                  | Mode    | Outcome           | Bundle ms | Inputs      | Detail                     |
| -------------------------------------------------------- | ------- | ----------------- | --------- | ----------- | -------------------------- |
| `android-adb-input/index`                                | view    | rendered          | 220       | —           | 8 nodes, root Navigation   |
| `atomberg-raycast-extension/list-atomberg-devices`       | view    | rendered          | 879       | —           | 7 nodes, root Navigation   |
| `atomberg-raycast-extension/manage-atomberg-credentials` | view    | rendered          | 555       | —           | 24 nodes, root Navigation  |
| `bed-time-calculator/sleep-at`                           | view    | rendered          | 1687      | arguments   | 5 nodes, root Navigation   |
| `bed-time-calculator/sleep-now`                          | view    | rendered          | 1639      | —           | 29 nodes, root Navigation  |
| `bed-time-calculator/wake-up-at`                         | view    | rendered          | 1447      | arguments   | 5 nodes, root Navigation   |
| `caschys-blog/latest-articles`                           | view    | rendered          | 497       | —           | 7 nodes, root Navigation   |
| `caschys-blog/open-website`                              | no-view | capability-denied | 22        | —           | denied capability open.url |
| `caschys-blog/search-blog`                               | view    | rendered          | 448       | —           | 4 nodes, root Navigation   |
| `caschys-blog/submit-tip`                                | view    | rendered          | 62        | —           | 13 nodes, root Navigation  |
| `ccfddl/search`                                          | view    | rendered          | 282       | —           | 3 nodes, root Navigation   |
| `colorify/generate-theme`                                | view    | rendered          | 2886      | —           | 3 nodes, root Navigation   |
| `commandcode-ai/ask-commandcode-ai`                      | view    | rendered          | 1355      | —           | 8 nodes, root Navigation   |
| `commandcode-ai/refresh-models`                          | no-view | rendered          | 1004      | —           | 4 nodes, root Navigation   |
| `control-d/change-filters`                               | view    | rendered          | 703       | preferences | 9 nodes, root Navigation   |
| `control-d/learn-my-ip`                                  | view    | rendered          | 847       | preferences | 7 nodes, root Navigation   |
| `control-d/list-profiles`                                | view    | rendered          | 633       | preferences | 3 nodes, root Navigation   |
| `control-d/modify-profile`                               | view    | rendered          | 712       | preferences | 8 nodes, root Navigation   |
| `control-d/status`                                       | view    | rendered          | 639       | preferences | 12 nodes, root Navigation  |
| `defichain-lottery/add-address`                          | no-view | rendered          | 11        | arguments   | 3 nodes, root Navigation   |
| `defichain-lottery/remove-address`                       | view    | rendered          | 28        | —           | 4 nodes, root Navigation   |
| `defichain-lottery/stats`                                | view    | rendered          | 977       | —           | 4 nodes, root Navigation   |
| `defichain-lottery/tickets`                              | view    | rendered          | 753       | —           | 8 nodes, root Navigation   |
| `emojify/emoji-selector`                                 | view    | rendered          | 914       | arguments   | 5 nodes, root Navigation   |
| `emojify/emojify`                                        | view    | rendered          | 948       | —           | 6 nodes, root Navigation   |
| `esa-search/createPost`                                  | no-view | capability-denied | 10        | preferences | denied capability open.url |
| `esa-search/searchPost`                                  | view    | rendered          | 721       | both        | 10 nodes, root Navigation  |
| `featurebase/manage-changelogs`                          | view    | rendered          | 43        | preferences | 7 nodes, root Navigation   |
| `featurebase/manage-feedback`                            | view    | rendered          | 496       | preferences | 3 nodes, root Navigation   |
| `featurebase/manage-help-center`                         | view    | rendered          | 70        | preferences | 7 nodes, root Navigation   |
| `featurebase/manage-users`                               | view    | rendered          | 41        | preferences | 3 nodes, root Navigation   |
| `image-diff-checker/image-diff-check`                    | view    | rendered          | 1737      | —           | 21 nodes, root Navigation  |
| `irish-rail/index`                                       | view    | rendered          | 984       | —           | 9 nodes, root Navigation   |
| `lyne/create-horizontal-lines`                           | view    | rendered          | 46        | —           | 9 nodes, root Navigation   |
| `lyne/create-rectangle`                                  | view    | rendered          | 37        | —           | 10 nodes, root Navigation  |
| `lyne/create-vertical-lines`                             | view    | rendered          | 63        | —           | 9 nodes, root Navigation   |
| `markdown-preview/preview-markdown`                      | view    | rendered          | 47        | —           | 8 nodes, root Navigation   |
| `monorepo-manager/manageMonorepo`                        | view    | rendered          | 6754      | —           | 3 nodes, root Navigation   |
| `oci/core`                                               | view    | rendered          | 8767      | —           | 6 nodes, root Navigation   |
| `oci/email-delivery`                                     | view    | rendered          | 1774      | arguments   | 6 nodes, root Navigation   |
| `oci/nosql-database`                                     | view    | rendered          | 2027      | —           | 6 nodes, root Navigation   |
| `oci/object-storage`                                     | view    | rendered          | 2363      | —           | 6 nodes, root Navigation   |
| `oci/vault`                                              | view    | rendered          | 2470      | —           | 6 nodes, root Navigation   |
| `owl/configure-owls`                                     | view    | rendered          | 294       | —           | 8 nodes, root Navigation   |
| `owl/owl`                                                | view    | rendered          | 415       | —           | 4 nodes, root Navigation   |
| `screen-sharing-recents/index`                           | view    | rendered          | 260       | —           | 4 nodes, root Navigation   |
| `search-composer-packagist/composer`                     | view    | rendered          | 321       | —           | 3 nodes, root Navigation   |
| `search-regexp/searchRegexp`                             | view    | rendered          | 303       | —           | 232 nodes, root Navigation |
| `shopify-developer-changelog/shopify-changelog`          | view    | rendered          | 280       | —           | 3 nodes, root Navigation   |
| `vanishlink/add`                                         | view    | rendered          | 469       | —           | 8 nodes, root Navigation   |
| `vanishlink/add-from-clipboard`                          | no-view | rendered          | 254       | —           | 3 nodes, root Navigation   |
| `vanishlink/search`                                      | view    | rendered          | 456       | —           | 7 nodes, root Navigation   |
| `youtube/popular-videos`                                 | view    | rendered          | 821       | preferences | 3 nodes, root Navigation   |
| `youtube/search-channel`                                 | view    | rendered          | 842       | preferences | 3 nodes, root Navigation   |
| `youtube/search-live`                                    | view    | rendered          | 812       | preferences | 3 nodes, root Navigation   |
| `youtube/search-videos`                                  | view    | rendered          | 838       | preferences | 3 nodes, root Navigation   |

## Failures

- `caschys-blog/open-website` (capability-denied): denied capability open.url
- `esa-search/createPost` (capability-denied): denied capability open.url
