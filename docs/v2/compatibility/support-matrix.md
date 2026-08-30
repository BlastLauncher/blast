# Support matrix

Real Raycast extensions run through the full V2 pipeline: filesystem catalog,
child-process launch with esbuild bundling (`@raycast/api` resolved to the
compatibility adapter, React externalized), compatibility adapter, scene
renderer, and traffic relay. Committed fixtures are trimmed to manifest and
sources, so matrix runs are hermetic and deterministic.

- corpus: `raycast/extensions@d4aae99c5e1d7ec19b2341f1058c20adfd3fdc91`
- probed: all 3,231 extensions (one deterministic command probe per extension)
- executable test: `packages/blast-e2e/test/support-matrix.test.mjs`
- reproducible corpus probe: `packages/blast-e2e/scripts/probe-corpus.mjs`
- fixture set: `packages/blast-e2e/test/fixtures/real/`

## Corpus probe results

The probe uses the pinned corpus revision and the source-only checkout used
for runtime execution. It selects the first command declared with `mode:
"view"`, falling back to the first command whose mode is unset and then the
first `menu-bar` command; extensions with only `no-view` commands are counted
but are not renderable by the scene contract. The pre-slice result is preserved in
[`runtime-probe-baseline.json`](./runtime-probe-baseline.json). The current
post-slice result, including one result per extension, is
[`runtime-probe-post-slice.json`](./runtime-probe-post-slice.json).

The current post-slice run supplies the workspace's installed packages through
the explicit `vendored` dependency policy. The private e2e package now adds
sixteen bounded, exact-version dependency rounds covering 219 utility, parser,
fetch, image, state, compatibility-helper, SDK, client, and JavaScript utility
packages; their transitive graph is recorded in the lockfile. This round was
selected to install on the ARM64 Linux runner with package-manager scripts
disabled; no native, WASM, macOS, or host-process package was selected directly.
Ethers and OpenAI still resolve through the workspace's existing optional
websocket-helper graph. The probe does not install the corpus or run
package-manager scripts; unavailable packages remain dependency failures.

| Outcome                        | Baseline | Previous post-slice | Current post-slice | Current vs previous |
| ------------------------------ | -------: | ------------------: | -----------------: | ------------------: |
| third-party dependency failure |    2,361 |                 585 |                580 |                  -5 |
| not renderable command mode    |      358 |                 316 |                316 |                   0 |
| other process/startup failure  |      432 |                 250 |                248 |                  -2 |
| structured compatibility error |       23 |                   1 |                  2 |                  +1 |
| renders a scene end to end     |       54 |               2,075 |              2,082 |                  +7 |
| no entrypoint found            |        3 |                   3 |                  3 |                   0 |

Reading: the current post-slice extension pass rate is 2,082/3,231 (64.44%);
among the 2,915 extensions with a selected renderable command it is 2,082/2,915
(71.42%). The declaration-backed Icon enum, Raycast color values, collection
metadata, List/Grid/Form search and pagination events, shared dropdown
accessories, Clipboard read/clear behavior, Submenu lifecycle, nested public
Props and utility namespaces, Keyboard shortcut aliases, Cache callback binding,
and official aliases are now covered by the adapter tests and probe. Zero
pagination page-size fallbacks are preserved and the targeted
`modrinth-search/search-projects` command now
renders. Empty and absent `Action.OpenInBrowser` targets are handled at the
action-readiness boundary; the four targeted commands now render. Menu-bar
alternate items now carry a nested semantic marker and separate right-click
events. The only remaining static import gap is one `fetch` import.
Dependency, process, and non-renderable outcomes remain tracked separately
from API coverage.
The current top-level API import census and emitted declaration audit are clean
for the measured corpus surface, so priority remains the remaining dependency
and runtime outcomes while the adapter continues to preserve strict API
boundaries. This refresh completes the full 478-member Icon surface and
preserves legacy names, adds declaration-backed collection/search/pagination
fields, and closes the shared List/Grid dropdown boundary. It also corrects
Raycast theme color identifiers, decodes structured Clipboard reads, supports
Clipboard clear, adds Submenu search/open/id behavior, and publishes nested
Props aliases for the measured components. `MenuBarExtra.Item.alternate` now
publishes a nested alternate item with a distinct right-click event. The current
aggregate retains `crawldoc` and `open-targets-raycast/platform` as strict List
text-child diagnostics; a focused serial reprobe deterministically surfaces the
same boundary in both commands. These remain boundary checks rather than
reasons to widen the semantic collection contract. The targeted
`modrinth-search/search-projects` and four
OpenInBrowser reprobes now render after preserving their declaration-shaped
readiness fallbacks. The context-provider boundary moves
`dictionary/fromCmd` through to a rendered scene. The fourth dependency seed
moved 47 entries out of the dependency-failure class in the aggregate run and
increased rendered outcomes by 46; the targeted old dependency set rendered 33
entries and left 16 in process/runtime failure, so the aggregate change
remains subject to normal process and dependency variance.

The first audited vendor seed is `axios@1.8.4`, `cheerio@1.0.0`,
`cross-fetch@4.0.0`, `date-fns@4.1.0`, `fast-xml-parser@5.3.2`, `fuse.js@7.1.0`,
`moment@2.30.1`, `node-html-markdown@1.3.0`, `rss-parser@3.13.0`, and
`zod@3.24.3`; it moved 317 extensions out of the dependency-failure class and
182 of those rendered scenes in its reprobe. The second seed is
`file-url@4.0.0`, `filesize@11.0.13`, `gray-matter@4.0.3`,
`javascript-time-ago@2.6.4`, `luxon@3.7.2`, `node-html-parser@7.0.1`,
`qrcode@1.5.4`, `tildify@3.0.0`, `ts-pattern@5.9.0`, and `turndown@7.2.0`;
it moved 44 more extensions out of the dependency-failure class and 27 of
those rendered scenes. The remaining dependency failures are still tracked
separately below.

The third seed is `@chrismessina/raycast-logger@1.4.0`,
`@tanstack/react-query@5.66.9`, `algoliasearch@4.25.2`, `jimp@1.6.1`,
`openai@5.12.2`, `raycast-cross-extension@0.2.3`, `remove-markdown@0.6.4`,
`striptags@3.2.0`, `swr@2.3.3`, `untildify@6.0.0`, and
`use-debounce@10.1.1`. A targeted reprobe of the 915 previously dependency-
classified entries rendered 55 and moved 29 to process/runtime failures; the
full corpus run reduced dependency failures by 71 and recorded 1,866 rendered
scenes. The selected group is a measurement input only: cross-extension and
network behavior remains host-policy work even when a package bundles.

The fourth seed is `adm-zip@0.5.16`, `bplist-parser@0.3.2`,
`change-case@5.4.4`, `chrono-node@2.9.1`, `d3-color@3.1.0`,
`date-fns-tz@3.2.0`, `graphql-tag@2.12.7`, `image-size@2.0.2`,
`jotai@2.12.2`, `json2md@2.0.3`, `linkedom@0.18.13`, `marked@15.0.7`,
`moment-timezone@0.5.46`, `papaparse@5.5.3`, `parse-git-config@3.0.0`,
`pinyin-pro@3.28.1`, `pretty-bytes@6.1.1`, `query-string@8.1.0`,
`raycast-toolkit@1.0.6`, `slugify@1.6.6`, `timeago.js@4.0.2`, and
`turndown-plugin-gfm@1.0.2`. A targeted reprobe of the 844 previously
dependency-classified entries rendered 33 and moved 16 to process/runtime
failures; the full corpus run reduced dependency failures by 47 and recorded
1,912 rendered scenes. Pure parsing and utility availability remains separate
from host behavior, and the probe still never installs extension dependencies.

The fifth seed is `@mozilla/readability@0.6.0`, `bignumber.js@11.1.1`,
`color-hash@2.0.2`, `cron-parser@5.6.0`, `dateformat@5.0.3`,
`dedent-js@1.0.1`, `eventsource-parser@1.1.2`, `fast-fuzzy@1.12.0`,
`fuzzysort@3.1.0`, `hi-base32@0.5.1`, `html-to-text@10.0.0`,
`jose@6.2.3`, `js-base64@3.8.0`, `lodash.groupby@4.6.0`, `numeral@2.0.6`,
`otpauth@9.5.0`, and `validator@13.15.35`. A targeted reprobe of the 797
previously dependency-classified entries rendered 24 and moved 5 to
process/runtime failures; the full corpus run reduced dependency failures by
27 and recorded 1,938 rendered scenes. These packages provide parser, utility,
formatting, and local crypto behavior only; the probe still never installs
extension dependencies or grants network/host capabilities.

The sixth seed is `@noble/hashes@1.8.0`, `bs58@6.0.0`, `crypto-js@4.2.0`,
`culori@4.0.1`, `currency-codes@2.2.0`, `exifr@7.1.3`, `jwt-decode@4.0.0`,
`lodash.orderby@4.6.0`, `lunar-date-vn@1.0.6`, `node-localstorage@3.0.5`,
`otplib@12.0.1`, `parse-github-url@1.0.3`, `proper-url-join@2.1.1`,
`ramda@0.32.0`, `react-error-boundary@6.1.1`, `tiny-relative-date@2.0.2`,
and `usehooks-ts@3.1.0`. A targeted reprobe of the 770 previously
dependency-classified entries rendered 13 and moved 2 to process/runtime
failures; the full corpus run reduced dependency failures by 16 and recorded
1,948 rendered scenes. The group provides encoding, date, URL, numeric,
image-metadata, and React utility behavior only; the probe still never installs
extension dependencies or grants network/host capabilities.

The seventh seed is `color-namer@1.4.0`, `cronstrue@3.24.0`,
`csv-parse@5.6.0`, `debounce@1.2.1`, `dedupe@4.0.3`, `fromnow@3.0.1`,
`image-meta@0.2.1`, `is-image@4.0.0`, `is-valid-domain@0.1.6`,
`lodash.isempty@4.4.0`, `lodash.unescape@4.0.1`, `nzh@1.0.14`,
`parse-url@11.1.0`, `simple-plist@1.4.0`, `tiny-pinyin@1.3.2`,
`title@3.5.3`, `use-interval@1.4.0`, `url-join@5.0.0`,
`weeknumber@1.2.1`, and `xml-js@1.6.11`. A targeted reprobe of the 754
previously dependency-classified entries rendered 18 and moved 4 to
process/runtime failures; the full corpus run reduced dependency failures by
20 and recorded 1,967 rendered scenes. The group provides parsing, formatting,
date, URL, color, and small local-data behavior only; the probe still never
installs extension dependencies or grants network/host capabilities.

The eighth seed is `@faker-js/faker@10.5.0`, `@iarna/toml@2.2.5`,
`@nem035/gpt-3-encoder@1.1.7`, `@total-typescript/ts-reset@0.6.1`,
`@web3-storage/parse-link-header@3.1.0`, `calendar@0.1.1`,
`expand-tilde@2.0.2`, `formdata-node@6.0.3`, `fzf@0.5.2`, `p-queue@8.0.1`,
`react-use@17.6.0`, `stream-json@1.9.1`, and `valibot@1.1.0`. A targeted
reprobe of the 734 previously dependency-classified entries rendered 20 and
moved 6 to process/runtime failures; the full corpus run reduced dependency
failures by 25 and recorded 1,980 rendered scenes. The group provides test
data, encoding, parsing, queue, validation, React utility, and form-data
behavior only; the probe still never installs extension dependencies or grants
network/host capabilities.

The ninth seed is `@chrismessina/raycast-kit@0.1.4`, `@ts-rest/core@3.52.1`,
`@zxcvbn-ts/core@3.0.4`, `@zxcvbn-ts/language-common@3.0.4`,
`@zxcvbn-ts/language-en@3.0.2`, `colord@2.10.0`, `es-toolkit@1.52.0`,
`friendly-mimes@3.0.1`, `html-to-md@0.8.8`, `jsqr@1.4.0`, `json-ts@1.6.4`,
`linkify-it@5.0.2`, `minisearch@7.2.0`, `node-emoji@2.2.0`,
`opentype.js@1.3.4`, `p-min-delay@4.2.0`, `polished@4.3.1`,
`protobufjs@7.5.4`, `raycast-hooks@1.0.4`, `sanitize-html@2.17.7`, and
`sql-formatter@15.8.2`. A targeted reprobe of the 709 previously
dependency-classified entries rendered 21 and moved 5 to process/runtime
failures; the full corpus run reduced dependency failures by 26 and recorded
2,005 rendered scenes. The group provides bounded parsing, search, color, text,
validation, typography, SQL formatting, and Raycast helper behavior only; the
probe still never installs extension dependencies or grants network, host,
native, or WASM capabilities.

The tenth seed is `binary-split@1.0.5`, `city-timezones@1.3.4`, `edn-data@1.2.2`,
`js-beautify@1.15.4`, `jsonwebtoken@9.0.3`, `lodash-es@4.18.1`,
`mailparser@3.9.17`, `phone@3.1.72`, `showdown@2.1.0`, `suncalc@1.9.0`,
`svgson@5.3.1`, `through2-map@4.0.0`, `tlds@1.261.0`, `ts-dedent@2.3.0`,
`ts-fsrs@4.6.1`, `ts-md5@1.3.1`, `ts-results-es@3.6.0`, `ulid@2.4.0`,
`utf8@3.0.0`, `vkbeautify@0.99.3`, and `xstate@5.32.6`. A targeted reprobe of
the 683 previously dependency-classified entries rendered 14 and moved 4 to
process/runtime failures; the full corpus run reduced dependency failures by
15 and recorded 2,022 rendered scenes. The group provides bounded local
parsing, text, hashing, date, XML, state-machine, and stream behavior only; the
probe still never installs extension dependencies or grants network, host,
native, or WASM capabilities.

The eleventh seed is `@adobe/leonardo-contrast-colors@1.0.0-alpha.13`,
`@asyncapi/parser@1.14.1`,
`@tanstack/query-async-storage-persister@5.66.4`,
`@tanstack/react-query-persist-client@5.66.9`, `@xstate/react@6.1.0`,
`colorjs.io@0.5.2`, `oazapfts@4.10.0`, and `tough-cookie@6.0.2`. A targeted
reprobe of the 668 previously dependency-classified entries rendered 3 and
moved 3 to process/runtime failures; the full corpus run reduced dependency
failures by 5 and recorded 2,024 rendered scenes. The group provides bounded
color, schema, persistence, state, OpenAPI, and cookie parsing behavior only;
the probe still never installs extension dependencies or grants network, host,
native, or WASM capabilities.

The twelfth seed is `@apollo/client@3.14.1`, `@notionhq/client@2.3.0`,
`@supabase/supabase-js@2.112.4`, `graphql-request@7.4.0`, `ky@1.14.3`,
`ofetch@1.5.1`, and `octokit@5.0.5`. A targeted reprobe of the 663 previously
dependency-classified entries rendered 14 and moved 12 to process/runtime
failures; the full corpus run reduced dependency failures by 21 and recorded
2,039 rendered scenes. The group was selected as a JavaScript-only SDK seed
and installed successfully on the ARM64 Linux runner with lifecycle scripts
disabled. It measures dependency availability only: network calls, host
providers, and cross-extension behavior remain outside the compatibility
boundary. The two structured outcomes are deterministic unsupported List text
child diagnostics, not native or platform installation failures.

The thirteenth seed is `ai@5.0.249`, `@ai-sdk/openai@2.0.122`,
`@anthropic-ai/sdk@0.122.0`, `@modelcontextprotocol/sdk@1.30.0`,
`@slack/web-api@7.19.0`, `ethers@6.17.0`, `eventsource@2.0.2`,
`meilisearch@0.45.0`, `openapi-fetch@0.17.0`, `stripe@17.7.0`,
`user-agents@1.1.675`, and `youtube-transcript@1.3.1`; the existing `zod`
seed was advanced to `3.25.76` for provider SDK peer compatibility. A targeted
reprobe of the 642 previously dependency-classified entries rendered 16 and
moved 6 to process/runtime failures; the full corpus run reduced dependency
failures by 21 and recorded 2,055 rendered scenes. The group provides
JavaScript SDK and HTTP-client availability only: network calls, host providers,
and cross-extension behavior remain outside the compatibility boundary. No
native, WASM, macOS, or host-process package was selected directly; Solana was
held because its websocket graph includes optional native helpers.

The fourteenth seed is `@aws-sdk/client-s3@3.1121.0`,
`@googleapis/calendar@16.0.0`, `@googleapis/gmail@18.0.0`,
`@tryfabric/martian@1.2.4`, `@vitalets/google-translate-api@9.2.1`,
`archiver@8.0.0`, `download@8.0.0`, `mongodb@7.6.0`, `mqtt@5.15.2`,
`pg@8.23.0`, `pocketbase@0.28.0`, `quicktype-core@26.0.0`, and
`xlsx@0.18.5`. A targeted reprobe of the 621 previously dependency-classified
entries rendered 13 and moved 5 to process/runtime failures; the full corpus
run reduced dependency failures by 18 and recorded 2,072 rendered scenes. The
group provides JavaScript SDK, archive, database-client, messaging, translation,
and code-generation availability only: network, database, host providers, and
cross-extension behavior remain outside the compatibility boundary. Postgres
and MongoDB native addons were not installed; the batch remains suitable for
the ARM64 Linux measurement runner with lifecycle scripts disabled.

The fifteenth seed is `@alicloud/pop-core@1.8.0`,
`@api-blueprints/pathmaker@1.3.0`, `@aternus/csv-to-xlsx@3.0.5`,
`ali-oss@6.23.0`, `cloudconvert@3.0.0`, `cloudinary@2.11.0`,
`imapflow@1.7.6`, `mixpanel@0.23.0`, `placeholders-toolkit@0.1.5`,
`proper-lockfile@4.1.2`, `proxy-agent@8.0.2`, and `ytdl-core@4.11.5`.
A targeted reprobe of the 603 previously dependency-classified entries rendered
15 and moved 3 to process/runtime failures, leaving 585 dependency failures in
that set. The full corpus run recorded 2,075 rendered scenes, 585 dependency
failures, 250 process/startup failures, 2 structured compatibility errors, 316
non-renderable commands, and 3 missing entrypoints. The aggregate gained 3
rendered outcomes; the larger process and structured deltas remain normal probe
variance. The group provides portable client and local utility availability
only: network, host providers, cross-extension behavior, and database access
remain outside the compatibility boundary. All selected roots resolved on the
ARM64 Linux runner with lifecycle scripts disabled; no native, WASM, macOS, or
host-process package was selected directly.

The sixteenth seed is `@atproto/api@0.18.16`, `@atproto/identity@0.4.1`,
`@atproto/lexicon@0.4.0`, `@atproto/uri@0.1.1`, and
`@aws-sdk/s3-request-presigner@3.1121.0`. A targeted reprobe of the 585
previously dependency-classified entries rendered 4 and left 581 in the
dependency-failure class. The full corpus run recorded 2,082 rendered scenes,
580 dependency failures, 248 process/startup failures, 2 structured
compatibility errors, 316 non-renderable commands, and 3 missing entrypoints.
The aggregate gained 7 rendered outcomes and reduced dependency failures by 5;
the process delta is normal probe variance. The group provides AT Protocol and
AWS signing-client availability only: network, credentials, host providers, and
cross-extension behavior remain outside the compatibility boundary. All roots
resolved on the ARM64 Linux runner with lifecycle scripts disabled; no native,
WASM, macOS, or host-process package was selected directly.

## Committed fixtures

| Fixture                        | Root           | Items | Measured APIs                                                                                                                                                                                              |
| ------------------------------ | -------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `papersize`                    | list           |    42 | Action, ActionPanel, Icon, List                                                                                                                                                                            |
| `golden-ratio`                 | list           |     1 | Action, ActionPanel, Clipboard, Icon, List, showToast, Toast                                                                                                                                               |
| `pokemon-tcg-pocket-binder`    | list           |     6 | Action, ActionPanel, List, showToast, Toast                                                                                                                                                                |
| `ruby-evaluate`                | list           |     0 | Action, ActionPanel, List, Detail, getPreferenceValues                                                                                                                                                     |
| `wifi-password-reveal`         | list           |     0 | Action, ActionPanel, Detail, Icon, List, showToast, Toast                                                                                                                                                  |
| `go-links`                     | list           |     0 | Action, ActionPanel, Icon, List, showToast, Toast                                                                                                                                                          |
| `utm-virtual-machines`         | list           |     0 | Action, ActionPanel, Icon, List, showToast, Toast                                                                                                                                                          |
| `time`                         | detail         |     0 | Detail                                                                                                                                                                                                     |
| `deutscherwetterdienst`        | detail         |     0 | Detail                                                                                                                                                                                                     |
| `donut`                        | detail         |     0 | Detail                                                                                                                                                                                                     |
| `big-o`                        | list           |     3 | Action, ActionPanel, List                                                                                                                                                                                  |
| `balatro-compendium`           | list           |     3 | Action, ActionPanel, Detail, Icon, List, showToast, Toast                                                                                                                                                  |
| `cache-control-builder`        | list           |     3 | Action, ActionPanel, Detail, Icon, List, environment, useNavigation                                                                                                                                        |
| `single-disk-eject`            | list           |     0 | Action, ActionPanel, List, environment, getPreferenceValues, showToast, Toast                                                                                                                              |
| `form-submission`              | form           |     4 | Action, ActionPanel, Form (DatePicker, TagPicker, FilePicker)                                                                                                                                              |
| `composite-children`           | form           |     3 | Action, ActionPanel, Form, custom component and fragment composition                                                                                                                                       |
| `launch-boundaries`            | list           |     1 | Image masks, LaunchProps, LaunchType, closeMainWindow, popToRoot, openExtensionPreferences                                                                                                                 |
| `desktop-discovery-boundaries` | list           |     2 | Application, getApplications, getSelectedText, openCommandPreferences                                                                                                                                      |
| `finder-boundaries`            | list           |     2 | FileSystemItem, getFrontmostApplication, getSelectedFinderItems, showInFinder                                                                                                                              |
| `window-management-boundaries` | list           |     1 | WindowManagement, environment                                                                                                                                                                              |
| `legacy-alias-boundaries`      | list           |     1 | ActionPanel, ActionPanelItem, AlertActionStyle, Icon, List, ListSection, OpenWithAction                                                                                                                    |
| `import-shape-boundaries`      | list           |     1 | namespace, dynamic, side-effect, and literal require `@raycast/api` imports                                                                                                                                |
| `host-boundaries`              | list           |     1 | BrowserExtension, ToastStyle, Tool.Confirmation, clearSearchBar, trash                                                                                                                                     |
| `coverage-next`                | list           |     1 | Color, CopyToClipboardAction, Detail.Metadata, Icon, List.Item.Detail, OpenInBrowserAction, getPreferenceValues, environment, preferences, randomId, and legacy type aliases                               |
| `coverage-followup`            | form           |     2 | ImageMask, List, OpenAction, PasteAction, PushAction, SubmitFormAction, clearLocalStorage, copyTextToClipboard, getLocalStorageItem, pasteText, removeLocalStorageItem, setLocalStorageItem, useNavigation |
| `runtime-boundaries`           | list           |     1 | AI, OAuth, updateCommandMetadata                                                                                                                                                                           |
| `grid-boundaries`              | grid           |     2 | Grid, Grid.Item, Grid.Section, Grid.Dropdown, Grid.EmptyView, Icon                                                                                                                                         |
| `menu-bar-boundaries`          | menu-bar-extra |     2 | MenuBarExtra, Item, Item.alternate, Section, Submenu, Separator, Icon                                                                                                                                      |
| `choose-a-license`             | list           |     8 | Action.OpenInBrowser, Action.CopyToClipboard, Action.Push                                                                                                                                                  |

The twenty-eight matrix render fixtures assert root type and minimum item counts
through real child processes; the desktop-discovery fixture additionally waits
for three brokered capability responses, the Finder fixture waits for three
additional capability responses, and the form fixture dispatches text, date,
tag-array, and file-path changes plus a submit event with client-provided
values. The launch-boundaries fixture is also exercised by the vertical suite.
The runtime-boundaries fixture waits for an AI response, command subtitle
update, and OAuth token lookup; the host-boundaries fixture waits for browser
tab/content, search, and trash capability responses; the `coverage-next`
fixture additionally exercises Detail metadata, List.Item.Detail, measured
icons, default-application, and telemetry responses
plus deprecated and modern browser/clipboard action events. The
`coverage-followup` fixture additionally exercises legacy form, open, paste,
storage, image-mask, and push/pop aliases, including navigation calls from a
separately bundled child view. The `window-management-boundaries` fixture
waits for active-window, desktop-window, and desktop-list responses, then
dispatches a bounds mutation through the explicit host capability.

## Known gaps surfaced by the matrix

- action groups, `ActionPanel.Item`, `ActionPanel.Section`, submenus, tinted icons, shortcut
  objects, action styles, `autoFocus`, `Action.OpenInBrowser`, `Action.Open`,
  `Action.Paste`, `Action.ShowInFinder`, `Action.Trash`, `Action.InstallMCPServer`,
  and the deprecated browser/clipboard/action aliases are measured. Submenus
  include search, lazy-open, loading, filtering, throttling, and deprecated
  `id` behavior; custom React components/fragments can compose action children;
  broader action helpers remain unsupported;
- `Action.OpenInBrowser` preserves empty string URLs while data is loading and
  omits the action when its required URL is absent at runtime; non-string
  values remain structured errors, and activation still crosses the validated
  `open.open` capability boundary;
- `Action.CreateSnippet` and `Action.ToggleQuickLook` are measured. Snippet
  payloads cross `snippet.create`; Quick Look toggles cross `quick-look.toggle`,
  while List/Grid item preview paths are carried as validated scene metadata.
  Native snippet and Quick Look UI remain host/client work;
- Grid accepts positive safe-integer column counts and preserves empty content
  tooltips, while `List.Item` accepts measured `{ value, tooltip }` icon
  descriptors. The adapter mirrors all 478 declaration-backed `Icon` members,
  preserves legacy names, and accepts `List.Dropdown` and `Grid.Dropdown`
  interchangeably as search accessories. List/Grid pagination accepts
  non-negative safe-integer page sizes, including zero values emitted by
  asynchronous pagination hooks; layout clamping and icon rendering remain
  client work;
- `Detail.Metadata` and `List.Item.Detail` serialize labels, separators, links,
  tag lists, loading state, navigation titles, and list detail selection as
  explicit scene data. Title/subtitle tooltip descriptors are preserved;
  `Action.SubmitForm` also supports the measured generic Detail-action usage
  outside Form with an empty callback value bag. The measured icon surface now
  includes `Icon.CircleProgress` and `Icon.AppWindowList`.
- toast lifecycle, mutable fields, action callbacks, and toast-action shortcut
  objects are measured; client toast timing/stacking remains unsupported;
- `useNavigation` and `Action.Push` (28.8% of extensions),
  `LocalStorage`/`Cache` (26.5%), and `environment` (19.7%) are measured in
  the adapter but still have limited fixture coverage. `LocalStorage.allItems`
  and `allLocalStorageItems` now share the brokered storage boundary; the
  legacy push, open,
  paste, storage, preference, environment, and `ImageMask` aliases are covered
  by the `coverage-followup` and `coverage-next` fixtures;
- `showHUD`, `open`, and `confirmAlert` are measured through capability
  requests, but production host providers and consent policy are still absent;
- `LaunchProps`, `LaunchType`, `Image.Mask`, `closeMainWindow`, `popToRoot`,
  `openExtensionPreferences`, `Grid`, `MenuBarExtra`, and `launchCommand` are
  measured. Launch props default to a
  user-initiated launch with an empty argument map in the current launcher;
  explicit command launching is brokered, while host-side target resolution
  and process orchestration remain future client plumbing;
- `MenuBarExtra.Item.alternate` is measured as a nested menu-bar item. Main
  item actions carry `left-click`, alternate actions carry `right-click`, and
  the client remains responsible for native alternate-item presentation;
- `getSelectedText`, `getApplications`, `Application`, `FileIcon`, and
  `openCommandPreferences` are measured through `selection.read`,
  `application.list`, and `preferences.openCommand`; deterministic providers
  make corpus and fixture runs reproducible, while production OS providers and
  consent policy remain absent;
- `getSelectedFinderItems`, `showInFinder`, `FileSystemItem`, and
  `getFrontmostApplication` are measured through `finder.selectedItems`,
  `finder.show`, and `application.frontmost`; deterministic providers make
  corpus and fixture runs reproducible, while production Finder/frontmost
  application providers and consent policy remain absent;
- `WindowManagement` discovery and bounds mutation are measured through the
  explicit `window-management` capability, including validated desktop/window
  result shapes and JSON-encoded bounds options. Deterministic providers make
  corpus and fixture runs reproducible; production window enumeration,
  permission/consent state, and OS bounds mutation remain host work;
- `List.Section`/`ListSection`, `ActionPanel.Item`/`ActionPanelItem`, `AlertActionStyle`,
  `OpenWithAction`, and legacy `render(<Command />)` are measured. List sections
  cross as semantic `list-section` nodes, and Open With intent crosses the
  existing `open.open` capability as a primitive `openWith` flag; client list
  section rendering and the application chooser remain host/client work;
- `Form.searchBarAccessory` and `Form.LinkAccessory` are measured. The
  accessory is a semantic child with validated target/text props and a stable
  open event that invokes the existing `open.open` capability; client-side Form
  chrome placement remains host/client work;
- `Action.CreateQuicklink`, `Action.PickDate`, and the deprecated direct Form
  dropdown/tag-picker members are measured. Quicklink creation and date picking
  use explicit `quicklink.create` and `date-picker.pick` capabilities; provider
  consent and native UI remain host work.
- `List`, `Grid`, and `Form.Dropdown` carry search text, filtering, loading,
  throttling, selection, and pagination fields as semantic scene properties
  and events. `Clipboard.read`/`readText` decode the official `{ text }` shape
  as well as plain and empty responses, and `Clipboard.clear` crosses the
  explicit `clipboard.clear` capability.
- `Action.ShowInFinder`/`ShowInFinderAction` and `Action.Trash`/`TrashAction` are
  measured. Both use the shared action scene shape, normalize `PathLike`
  values, and route activation through `finder.show` or `filesystem.trash`;
  host-side Finder integration, filesystem authorization, destructive-operation
  consent, and platform-specific native titles remain host work.
- namespace imports, literal dynamic imports, literal side-effect imports, and
  literal CommonJS `require("@raycast/api")` calls resolve through the same
  launcher alias as named imports when they access measured adapter members.
  The remaining `fetch` import is intentionally not supported because network
  access needs an explicit host capability and policy;
- custom function components, React fragments, and React context
  providers/consumers can compose measured action, list, grid, menu-bar, and
  form children; raw text, intrinsic DOM elements, and invalid resolved
  children remain outside the semantic scene contract. React
  memo/forward-ref/lazy wrappers are treated as composites, and an exact
  numeric `0` is ignored as the standard JSX conditional-child sentinel;
- nullable async state is accepted as a top-level `null` initial value for
  non-date Form controls and omitted from the scene props; DatePicker retains
  its native `Date | null` behavior. Optional string-array initial values omit
  `undefined` entries only when all other entries are strings; null members and
  other invalid entries remain rejected;
- `open-targets-raycast/platform` contains malformed List children under the
  probe's default arguments and remains a structured error rather than being
  silently widened or sent to the host. An earlier aggregate also recorded
  `crawldoc` as structured, but a serial reprobe classified it as a process
  failure; that result remains tracked as run variance;
- string-valued Form and Grid dropdown labels and values, Form checkbox labels,
  and Form descriptions preserve empty strings; non-string values remain
  invalid;
- `Color` now emits Raycast's `raycast-*` theme identifiers while retaining the
  legacy raw `Pink`/`Brown` values. The public nested `Props` namespaces for
  `Action`, `ActionPanel`, `List`, `Grid`, `Form`, and `MenuBarExtra` mirror the
  pinned declaration, the `Alert`/`Cache`/`Keyboard`/`Toast` utility namespaces and
  `Form.ItemReference` mirror the pinned declaration. Nested Form field ref
  aliases, `Form.DatePicker.Type`, and the deprecated Form field value statics
  are also declaration-compatible. `Cache.subscribe` remains bound for
  external-store hooks. Form fields attach stable focus/reset handles, while
  their client-side behavior remains deferred until a host control boundary is
  defined;
- command-scoped manifest preference defaults are merged into the selected
  command descriptor, with command values taking precedence over extension-level
  values; the focused Grid-column failures now proceed past `getPreferenceValues()`
  into their later measured boundaries;
- `BrowserExtension.getTabs`, `BrowserExtension.getContent`, `clearSearchBar`,
  `trash`, `ToastStyle`, and the type-only `Tool.Confirmation` contract are
  measured. Browser integration, navigation state, destructive filesystem
  behavior, and permission/consent policy remain host work; broader browser,
  action, and Tool APIs remain unsupported;
- `captureException`, `getDefaultApplication`, `PreferenceValues`,
  `OpenInBrowserAction`, and `CopyToClipboardAction` are measured. Exception
  payloads, default-application results, and action activation are brokered;
  telemetry retention, desktop integration, clipboard policy, and consent
  remain production host work;
- `AI.ask` is measured through `ai.ask`, including creativity/model option
  normalization, abort preflight, and the final-result `.on("data")` adapter;
  model execution and streaming providers remain host work;
- `OAuth.PKCEClient` is measured through host-owned `oauth` operations for
  authorization requests, browser authorization, token storage, lookup, and
  removal. PKCE generation, browser routing, secure storage, consent, and
  provider-specific network flows remain production host work;
- `updateCommandMetadata` is measured through `command.updateMetadata` for
  subtitle updates and explicit `null` clears; client-side command chrome is
  still future work;
- third-party npm dependency availability (the post-slice report records these
  as `third-party-dependency`; vendored roots are explicit but not yet a full
  audited corpus dependency set).

These are ordered for the next surface increments in `status.md`.
