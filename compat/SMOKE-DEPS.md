# Corpus smoke report (installed dependencies)

Headless run of every command of the dependency-heavy set
([corpus-deps.json](corpus-deps.json)) at corpus commit
`3b812d1e153a1862df29bc8ec34e170c728512ea`. Each extension's own dependencies are installed with the
engine's dependency install (decision 0008: `npm install --omit=dev --ignore-scripts`
from the extension's lockfile) before its commands are bundled, with the shared
dependency fallback present; the install is deleted afterwards. Broker, preference
defaults and probe are the same as [SMOKE.md](SMOKE.md). Commands requiring launch
arguments or preferences without a default are bundled but not run.
Regenerate with `bun run corpus:smoke-deps` (network required; not part of
`bun run verify`).

25/25 installs succeeded. 56 commands: rendered 35, completed 0, install-failed 0, bundle-failed 0, crashed 0, needs-arguments 6, needs-preferences 14, capability-denied 1, network 0, timeout 0, unsupported-api 0, unsupported-mode 0.
Peak .cache 446.1 MB, wall time 178 s.

## Installs

| Extension                     | Packages                                                                   | Install   | Time   | Size     | Detail |
| ----------------------------- | -------------------------------------------------------------------------- | --------- | ------ | -------- | ------ |
| `android-adb-input`           | `execa`                                                                    | installed | 0.7 s  | 0.2 MB   |        |
| `atomberg-raycast-extension`  | `@tanstack/react-query`                                                    | installed | 3.6 s  | 4.3 MB   |        |
| `bed-time-calculator`         | `chrono-node`                                                              | installed | 1.3 s  | 3.0 MB   |        |
| `caschys-blog`                | `xml2js`                                                                   | installed | 1.4 s  | 4.7 MB   |        |
| `ccfddl`                      | `js-yaml`                                                                  | installed | 3.2 s  | 2.8 MB   |        |
| `colorify`                    | `@lokesh.dhakar/quantize`, `file-type`, `get-pixels`, `image-size`, `jimp` | installed | 2.6 s  | 29.4 MB  |        |
| `commandcode-ai`              | `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`, `ai`                     | installed | 2.7 s  | 22.2 MB  |        |
| `control-d`                   | `form-data`                                                                | installed | 0.9 s  | 2.3 MB   |        |
| `defichain-lottery`           | `qrcode`                                                                   | installed | 1.4 s  | 8.1 MB   |        |
| `emojify`                     | `openai`                                                                   | installed | 3.6 s  | 19.5 MB  |        |
| `esa-search`                  | `@suin/esa-api`, `swr`                                                     | installed | 2.8 s  | 6.5 MB   |        |
| `featurebase`                 | `turndown`                                                                 | installed | 3.0 s  | 8.7 MB   |        |
| `image-diff-checker`          | `jimp`, `pixelmatch`                                                       | installed | 4.1 s  | 27.2 MB  |        |
| `irish-rail`                  | `fast-xml-parser`                                                          | installed | 1.6 s  | 3.4 MB   |        |
| `lyne`                        | `open`                                                                     | installed | 0.5 s  | 0.1 MB   |        |
| `markdown-preview`            | `marked`                                                                   | installed | 2.7 s  | 2.6 MB   |        |
| `monorepo-manager`            | `@yarnpkg/core`, `fs-extra`, `parse-git-config`                            | installed | 3.2 s  | 14.6 MB  |        |
| `oci`                         | `filesize`, `oci-sdk`                                                      | installed | 23.6 s | 216.3 MB |        |
| `owl`                         | `raycast`, `raycast-cross-extension`                                       | installed | 3.4 s  | 2.4 MB   |        |
| `screen-sharing-recents`      | `plist`                                                                    | installed | 0.9 s  | 8.7 MB   |        |
| `search-composer-packagist`   | `algoliasearch`                                                            | installed | 3.1 s  | 2.2 MB   |        |
| `search-regexp`               | `got`                                                                      | installed | 1.0 s  | 0.7 MB   |        |
| `shopify-developer-changelog` | `rss-parser`                                                               | installed | 0.7 s  | 2.1 MB   |        |
| `vanishlink`                  | `node-html-parser`                                                         | installed | 3.5 s  | 3.0 MB   |        |
| `youtube`                     | `@googleapis/youtube`, `duration-iso-8601`, `he`, `javascript-time-ago`    | installed | 6.3 s  | 26.7 MB  |        |

## Top failures

| Commands | Outcome           | Cause                      | Extensions     | Likely fix                                                              |
| -------- | ----------------- | -------------------------- | -------------- | ----------------------------------------------------------------------- |
| 1        | capability-denied | capability denied open.url | `caschys-blog` | headless broker: add a default handler or classify it as needing a host |

## Commands

| Command                                                  | Mode    | Outcome           | Detail                                                                                    |
| -------------------------------------------------------- | ------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `android-adb-input/index`                                | view    | rendered          | 8 nodes, root Navigation                                                                  |
| `atomberg-raycast-extension/list-atomberg-devices`       | view    | rendered          | 7 nodes, root Navigation                                                                  |
| `atomberg-raycast-extension/manage-atomberg-credentials` | view    | rendered          | 24 nodes, root Navigation                                                                 |
| `bed-time-calculator/sleep-at`                           | view    | needs-arguments   | requires launch arguments: sleepAtTime; not run                                           |
| `bed-time-calculator/sleep-now`                          | view    | rendered          | 29 nodes, root Navigation                                                                 |
| `bed-time-calculator/wake-up-at`                         | view    | needs-arguments   | requires launch arguments: wakeUpTime; not run                                            |
| `caschys-blog/latest-articles`                           | view    | rendered          | 7 nodes, root Navigation                                                                  |
| `caschys-blog/open-website`                              | no-view | capability-denied | denied capability open.url                                                                |
| `caschys-blog/search-blog`                               | view    | rendered          | 4 nodes, root Navigation                                                                  |
| `caschys-blog/submit-tip`                                | view    | rendered          | 13 nodes, root Navigation                                                                 |
| `ccfddl/search`                                          | view    | rendered          | 3 nodes, root Navigation                                                                  |
| `colorify/generate-theme`                                | view    | rendered          | 3 nodes, root Navigation                                                                  |
| `commandcode-ai/ask-commandcode-ai`                      | view    | rendered          | 8 nodes, root Navigation                                                                  |
| `commandcode-ai/refresh-models`                          | no-view | rendered          | 4 nodes, root Navigation                                                                  |
| `control-d/change-filters`                               | view    | needs-preferences | requires preferences without a default: api-key; bundled, not run                         |
| `control-d/learn-my-ip`                                  | view    | needs-preferences | requires preferences without a default: api-key; bundled, not run                         |
| `control-d/list-profiles`                                | view    | needs-preferences | requires preferences without a default: api-key; bundled, not run                         |
| `control-d/modify-profile`                               | view    | needs-preferences | requires preferences without a default: api-key; bundled, not run                         |
| `control-d/status`                                       | view    | needs-preferences | requires preferences without a default: api-key; bundled, not run                         |
| `defichain-lottery/add-address`                          | no-view | needs-arguments   | requires launch arguments: address; not run                                               |
| `defichain-lottery/remove-address`                       | view    | rendered          | 4 nodes, root Navigation                                                                  |
| `defichain-lottery/stats`                                | view    | rendered          | 4 nodes, root Navigation                                                                  |
| `defichain-lottery/tickets`                              | view    | rendered          | 8 nodes, root Navigation                                                                  |
| `emojify/emoji-selector`                                 | view    | needs-arguments   | requires launch arguments: text; not run                                                  |
| `emojify/emojify`                                        | view    | rendered          | 6 nodes, root Navigation                                                                  |
| `esa-search/createPost`                                  | no-view | needs-preferences | requires preferences without a default: primaryTeamName, primaryToken; bundled, not run   |
| `esa-search/searchPost`                                  | view    | needs-arguments   | requires launch arguments: keyword; not run                                               |
| `featurebase/manage-changelogs`                          | view    | needs-preferences | requires preferences without a default: api_key, organization_subdomain; bundled, not run |
| `featurebase/manage-feedback`                            | view    | needs-preferences | requires preferences without a default: api_key, organization_subdomain; bundled, not run |
| `featurebase/manage-help-center`                         | view    | needs-preferences | requires preferences without a default: api_key, organization_subdomain; bundled, not run |
| `featurebase/manage-users`                               | view    | needs-preferences | requires preferences without a default: api_key, organization_subdomain; bundled, not run |
| `image-diff-checker/image-diff-check`                    | view    | rendered          | 21 nodes, root Navigation                                                                 |
| `irish-rail/index`                                       | view    | rendered          | 9 nodes, root Navigation                                                                  |
| `lyne/create-horizontal-lines`                           | view    | rendered          | 9 nodes, root Navigation                                                                  |
| `lyne/create-rectangle`                                  | view    | rendered          | 10 nodes, root Navigation                                                                 |
| `lyne/create-vertical-lines`                             | view    | rendered          | 9 nodes, root Navigation                                                                  |
| `markdown-preview/preview-markdown`                      | view    | rendered          | 8 nodes, root Navigation                                                                  |
| `monorepo-manager/manageMonorepo`                        | view    | rendered          | 3 nodes, root Navigation                                                                  |
| `oci/core`                                               | view    | rendered          | 6 nodes, root Navigation                                                                  |
| `oci/email-delivery`                                     | view    | needs-arguments   | requires launch arguments: view; not run                                                  |
| `oci/nosql-database`                                     | view    | rendered          | 6 nodes, root Navigation                                                                  |
| `oci/object-storage`                                     | view    | rendered          | 6 nodes, root Navigation                                                                  |
| `oci/vault`                                              | view    | rendered          | 6 nodes, root Navigation                                                                  |
| `owl/configure-owls`                                     | view    | rendered          | 8 nodes, root Navigation                                                                  |
| `owl/owl`                                                | view    | rendered          | 4 nodes, root Navigation                                                                  |
| `screen-sharing-recents/index`                           | view    | rendered          | 4 nodes, root Navigation                                                                  |
| `search-composer-packagist/composer`                     | view    | rendered          | 3 nodes, root Navigation                                                                  |
| `search-regexp/searchRegexp`                             | view    | rendered          | 232 nodes, root Navigation                                                                |
| `shopify-developer-changelog/shopify-changelog`          | view    | rendered          | 3 nodes, root Navigation                                                                  |
| `vanishlink/add`                                         | view    | rendered          | 8 nodes, root Navigation                                                                  |
| `vanishlink/add-from-clipboard`                          | no-view | rendered          | 3 nodes, root Navigation                                                                  |
| `vanishlink/search`                                      | view    | rendered          | 7 nodes, root Navigation                                                                  |
| `youtube/popular-videos`                                 | view    | needs-preferences | requires preferences without a default: apikey; bundled, not run                          |
| `youtube/search-channel`                                 | view    | needs-preferences | requires preferences without a default: apikey; bundled, not run                          |
| `youtube/search-live`                                    | view    | needs-preferences | requires preferences without a default: apikey; bundled, not run                          |
| `youtube/search-videos`                                  | view    | needs-preferences | requires preferences without a default: apikey; bundled, not run                          |

## Failures

- `caschys-blog/open-website` (capability-denied): denied capability open.url
