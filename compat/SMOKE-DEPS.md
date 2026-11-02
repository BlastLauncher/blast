# Corpus smoke report (installed dependencies)

Headless run of every command of the dependency-heavy set
([corpus-deps.json](corpus-deps.json)) at corpus commit
`bad7de0172ce6ea5e721ed919f4e1d7186f74192`. Each extension's own dependencies are installed with the
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

25/25 installs succeeded. 52 commands: rendered 51, completed 0, install-failed 0, bundle-failed 0, bundle-timeout 0, crashed 0, needs-arguments 0, needs-preferences 0, capability-denied 1, network 0, timeout 0, unsupported-api 0, unsupported-mode 0.
Peak .cache 267.0 MB, wall time 115 s.
23 ran with placeholder inputs (arguments 5, preferences 17, both 1).

## Installs

| Extension                     | Packages                                                                   | Install   | Time  | Size    | Detail |
| ----------------------------- | -------------------------------------------------------------------------- | --------- | ----- | ------- | ------ |
| `atomberg-raycast-extension`  | `@tanstack/react-query`                                                    | installed | 5.5 s | 4.4 MB  |        |
| `bed-time-calculator`         | `chrono-node`                                                              | installed | 0.5 s | 3.0 MB  |        |
| `ccfddl`                      | `js-yaml`                                                                  | installed | 2.2 s | 2.8 MB  |        |
| `colorify`                    | `@lokesh.dhakar/quantize`, `file-type`, `get-pixels`, `image-size`, `jimp` | installed | 2.1 s | 29.4 MB |        |
| `control-d`                   | `form-data`                                                                | installed | 0.4 s | 2.3 MB  |        |
| `defichain-lottery`           | `qrcode`                                                                   | installed | 0.5 s | 8.1 MB  |        |
| `emojify`                     | `openai`                                                                   | installed | 2.7 s | 16.9 MB |        |
| `esa-search`                  | `@suin/esa-api`, `swr`                                                     | installed | 2.6 s | 6.6 MB  |        |
| `featurebase`                 | `turndown`                                                                 | installed | 2.3 s | 8.7 MB  |        |
| `grammaring`                  | `@ai-sdk/openai`, `ai`                                                     | installed | 4.0 s | 12.8 MB |        |
| `irish-rail`                  | `fast-xml-parser`                                                          | installed | 0.4 s | 3.4 MB  |        |
| `lyne`                        | `open`                                                                     | installed | 0.3 s | 0.1 MB  |        |
| `markdown-preview`            | `marked`                                                                   | installed | 2.5 s | 2.6 MB  |        |
| `meta-music`                  | `filesize`, `mime`, `node-id3`                                             | installed | 3.0 s | 23.4 MB |        |
| `monorepo-manager`            | `@yarnpkg/core`, `fs-extra`, `parse-git-config`                            | installed | 2.5 s | 14.7 MB |        |
| `owl`                         | `raycast`, `raycast-cross-extension`                                       | installed | 2.2 s | 2.4 MB  |        |
| `raycast-store-updates`       | `@chrismessina/raycast-kit`                                                | installed | 2.1 s | 1.3 MB  |        |
| `reddit-search`               | `@chrismessina/raycast-logger`, `fast-xml-parser`                          | installed | 1.4 s | 3.0 MB  |        |
| `screen-sharing-recents`      | `plist`                                                                    | installed | 0.3 s | 8.7 MB  |        |
| `search-composer-packagist`   | `algoliasearch`                                                            | installed | 5.0 s | 2.3 MB  |        |
| `search-regexp`               | `got`                                                                      | installed | 0.6 s | 0.7 MB  |        |
| `shopify-developer-changelog` | `rss-parser`                                                               | installed | 0.3 s | 2.1 MB  |        |
| `vanishlink`                  | `node-html-parser`                                                         | installed | 2.3 s | 3.0 MB  |        |
| `youtube`                     | `@googleapis/youtube`, `duration-iso-8601`, `he`, `javascript-time-ago`    | installed | 2.4 s | 26.7 MB |        |
| `zoxide-git-projects`         | `execa`, `fzf`, `node-cache`                                               | installed | 2.5 s | 2.0 MB  |        |

## Top failures

| Commands | Outcome           | Cause                      | Extensions   | Likely fix                                                              |
| -------- | ----------------- | -------------------------- | ------------ | ----------------------------------------------------------------------- |
| 1        | capability-denied | capability denied open.url | `esa-search` | headless broker: add a default handler or classify it as needing a host |

## Commands

| Command                                                  | Mode     | Outcome           | Bundle ms | Inputs      | Detail                     |
| -------------------------------------------------------- | -------- | ----------------- | --------- | ----------- | -------------------------- |
| `atomberg-raycast-extension/list-atomberg-devices`       | view     | rendered          | 415       | —           | 7 nodes, root Navigation   |
| `atomberg-raycast-extension/manage-atomberg-credentials` | view     | rendered          | 355       | —           | 24 nodes, root Navigation  |
| `bed-time-calculator/sleep-at`                           | view     | rendered          | 1043      | arguments   | 5 nodes, root Navigation   |
| `bed-time-calculator/sleep-now`                          | view     | rendered          | 999       | —           | 29 nodes, root Navigation  |
| `bed-time-calculator/wake-up-at`                         | view     | rendered          | 994       | arguments   | 5 nodes, root Navigation   |
| `ccfddl/search`                                          | view     | rendered          | 188       | —           | 3 nodes, root Navigation   |
| `colorify/generate-theme`                                | view     | rendered          | 1363      | —           | 3 nodes, root Navigation   |
| `control-d/change-filters`                               | view     | rendered          | 425       | preferences | 9 nodes, root Navigation   |
| `control-d/learn-my-ip`                                  | view     | rendered          | 410       | preferences | 7 nodes, root Navigation   |
| `control-d/list-profiles`                                | view     | rendered          | 386       | preferences | 3 nodes, root Navigation   |
| `control-d/modify-profile`                               | view     | rendered          | 387       | preferences | 8 nodes, root Navigation   |
| `control-d/status`                                       | view     | rendered          | 385       | preferences | 12 nodes, root Navigation  |
| `defichain-lottery/add-address`                          | no-view  | rendered          | 7         | arguments   | 3 nodes, root Navigation   |
| `defichain-lottery/remove-address`                       | view     | rendered          | 6         | —           | 4 nodes, root Navigation   |
| `defichain-lottery/stats`                                | view     | rendered          | 511       | —           | 4 nodes, root Navigation   |
| `defichain-lottery/tickets`                              | view     | rendered          | 399       | —           | 8 nodes, root Navigation   |
| `emojify/emoji-selector`                                 | view     | rendered          | 678       | arguments   | 5 nodes, root Navigation   |
| `emojify/emojify`                                        | view     | rendered          | 658       | —           | 6 nodes, root Navigation   |
| `esa-search/createPost`                                  | no-view  | capability-denied | 6         | preferences | denied capability open.url |
| `esa-search/searchPost`                                  | view     | rendered          | 318       | both        | 10 nodes, root Navigation  |
| `featurebase/manage-changelogs`                          | view     | rendered          | 16        | preferences | 7 nodes, root Navigation   |
| `featurebase/manage-feedback`                            | view     | rendered          | 277       | preferences | 3 nodes, root Navigation   |
| `featurebase/manage-help-center`                         | view     | rendered          | 35        | preferences | 7 nodes, root Navigation   |
| `featurebase/manage-users`                               | view     | rendered          | 16        | preferences | 3 nodes, root Navigation   |
| `grammaring/fix-fact-text`                               | no-view  | rendered          | 484       | preferences | 3 nodes, root Navigation   |
| `grammaring/fix-fact-text-input`                         | view     | rendered          | 500       | preferences | 7 nodes, root Navigation   |
| `irish-rail/index`                                       | view     | rendered          | 423       | —           | 9 nodes, root Navigation   |
| `lyne/create-horizontal-lines`                           | view     | rendered          | 19        | —           | 9 nodes, root Navigation   |
| `lyne/create-rectangle`                                  | view     | rendered          | 18        | —           | 10 nodes, root Navigation  |
| `lyne/create-vertical-lines`                             | view     | rendered          | 19        | —           | 9 nodes, root Navigation   |
| `markdown-preview/preview-markdown`                      | view     | rendered          | 13        | —           | 8 nodes, root Navigation   |
| `meta-music/manage-id3-tags`                             | view     | rendered          | 4380      | —           | 3 nodes, root Navigation   |
| `monorepo-manager/manageMonorepo`                        | view     | rendered          | 4602      | —           | 3 nodes, root Navigation   |
| `owl/configure-owls`                                     | view     | rendered          | 184       | —           | 8 nodes, root Navigation   |
| `owl/owl`                                                | view     | rendered          | 270       | —           | 4 nodes, root Navigation   |
| `raycast-store-updates/store-updates-menu-bar`           | menu-bar | rendered          | 21        | —           | 5 nodes, root MenuBarExtra |
| `raycast-store-updates/view-store-updates`               | view     | rendered          | 42        | —           | 10 nodes, root Navigation  |
| `reddit-search/index`                                    | view     | rendered          | 131       | —           | 14 nodes, root Navigation  |
| `reddit-search/quick-search-subreddit`                   | no-view  | rendered          | 16        | arguments   | 4 nodes, root Navigation   |
| `reddit-search/search-subreddits`                        | view     | rendered          | 129       | —           | 7 nodes, root Navigation   |
| `screen-sharing-recents/index`                           | view     | rendered          | 205       | —           | 4 nodes, root Navigation   |
| `search-composer-packagist/composer`                     | view     | rendered          | 225       | —           | 3 nodes, root Navigation   |
| `search-regexp/searchRegexp`                             | view     | rendered          | 211       | —           | 232 nodes, root Navigation |
| `shopify-developer-changelog/shopify-changelog`          | view     | rendered          | 223       | —           | 3 nodes, root Navigation   |
| `vanishlink/add`                                         | view     | rendered          | 374       | —           | 8 nodes, root Navigation   |
| `vanishlink/add-from-clipboard`                          | no-view  | rendered          | 174       | —           | 3 nodes, root Navigation   |
| `vanishlink/search`                                      | view     | rendered          | 315       | —           | 7 nodes, root Navigation   |
| `youtube/popular-videos`                                 | view     | rendered          | 577       | preferences | 3 nodes, root Navigation   |
| `youtube/search-channel`                                 | view     | rendered          | 693       | preferences | 3 nodes, root Navigation   |
| `youtube/search-live`                                    | view     | rendered          | 587       | preferences | 3 nodes, root Navigation   |
| `youtube/search-videos`                                  | view     | rendered          | 587       | preferences | 3 nodes, root Navigation   |
| `zoxide-git-projects/find`                               | view     | rendered          | 241       | preferences | 3 nodes, root Navigation   |

## Failures

- `esa-search/createPost` (capability-denied): denied capability open.url
