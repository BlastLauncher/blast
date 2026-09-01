# Blast V2 implementation status

This is the handoff ledger for future contributors and agents. Update it when a
slice changes what is executable, what is trusted, or what should happen next.

## Executable today

- A transport-independent protocol validates envelopes, peer identities,
  handshake messages, errors, and shutdown.
- Asymmetric sessions negotiate the highest shared version, assign one session
  ID, enforce ready/closing/closed/failed states, and fail closed on invalid or
  mismatched messages.
- Every transport can run one reusable conformance suite. Both the deterministic
  in-memory transport and the Node.js JSON-lines stream transport pass it.
- The extension lifecycle contract separates protocol readiness from command
  readiness with validated `extension.initialize` and `extension.ready`
  messages.
- The runtime-side framework negotiates with an extension host, validates its
  initialization descriptor, invokes an injected initialization hook, and
  acknowledges the exact command identity.
- The Node runtime bootstrap loads the descriptor's immutable entrypoint
  through the ECMAScript module loader, publishes it to an observer, and
  drains messages until shutdown, in child processes and in-memory tests.
- The semantic scene contract validates `scene.transaction` and `scene.event`
  messages, applies ordered snapshot/insert/update/remove/reorder operations
  to a materialized client state, and exposes the transport-independent
  mutation sink the React renderer will publish to.
- The runtime publishes validated scene transactions over its session through
  the extension channel and receives `scene.event` messages back; the Node
  bootstrap invokes the entrypoint's command export with a context of
  descriptor, publish, event handler, and capability requester.
- The capability broker denies every request by default; granted requests flow
  from the command context through the host to a provider and back as
  structured responses, with the host verifying request identity against the
  session descriptor.
- The core relays extension session traffic to a client-side scene sink and
  capability broker over a single validated receive pump, sends `scene.event`
  messages back toward the extension, and fails closed on invalid traffic.
- The extension host reserves identities, supervises startup and stopping,
  publishes only initialized sessions, removes exited processes, and exposes an
  async lifecycle event stream.
- The Node launcher runs a fixed bootstrap in a dedicated OS process with an
  explicit environment, bounded stdio protocol frames, stderr capture, and
  escalating shutdown.
- A real child-process integration fixture proves the complete lifecycle without
  Electron or WebSocket; failure fixtures cover a pre-handshake crash and a
  process that requires forced termination.
- The core accepts only stable command identities, resolves paths through a
  trusted catalog, delegates lifecycle, and coordinates shutdown with in-flight
  starts.
- The core exposes a transport-neutral client session boundary: a role-checked
  client can run and stop one active command, receive validated scene/toast
  messages, send validated scene events, observe startup failure or unexpected
  process exit, and trigger best-effort command cleanup on disconnect. The
  deterministic in-memory and real child-process vertical slices exercise the
  same boundary; daemon composition and Electron consumption remain later work
  (ADR 0090).
- `@blastlauncher/core-node` exposes the bounded Node local listener from [ADR
  0091](decisions/0091-bounded-local-core-listener.md): it exposes that session
  over an explicitly owned same-user socket, protects POSIX endpoints with
  mode `0600`, and keeps framing, handshake, connection, and shutdown limits
  outside the semantic protocol. Deterministic socket tests cover lifecycle,
  stale/active paths, malformed input, handshake timeout, and connection
  bounds.
- `NodeCoreDaemon` is the explicit Node composition from [ADR
  0092](decisions/0092-node-core-daemon-composition.md): it owns the catalog,
  fixed Node extension launcher, host, core, and local listener, starts at
  listener readiness, and closes client sessions before the extension host.
  A real fixture exercises command and scene traffic through this composition.
- `@blastlauncher/core-node` exposes the bounded local client connector from
  [ADR 0095](decisions/0095-bounded-local-core-client.md): it owns local socket
  creation, JSON-lines framing, connection/handshake deadlines, caller abort
  propagation, and failed-socket cleanup while returning the existing
  transport-neutral `CoreClient`. Real-socket tests cover successful discovery,
  missing endpoints, pre-connect abort, stalled handshakes, and deadline
  cleanup.
- The client session has a path-free command-discovery snapshot in [ADR
  0093](decisions/0093-path-free-command-discovery.md): clients request a
  deterministic list of stable command identities and display metadata;
  entrypoints, roots, dependencies, and preference values remain host-only.
- `@blastlauncher/client` provides the transport-neutral `CoreClientController`
  from [ADR 0094](decisions/0094-transport-neutral-client-consumer.md): it
  owns one client receive pump, tracks discovery and command lifecycle state,
  materializes validated scenes, forwards scene events, and isolates toast and
  snapshot subscribers. In-memory tests and the real daemon socket exercise the
  complete controller flow.
- `@blastlauncher/client` also provides the connection-owning
  `CoreClientHost` and JSON-safe snapshot serializer from [ADR
  0096](decisions/0096-electron-main-client-bridge.md). Host tests cover lazy
  shared startup, command forwarding, shutdown, and non-serializable failure
  details.
- The Electron app has the main-process bridge from ADR 0096: when an
  external `BLAST_V2_SOCKET_PATH`, explicit app-owned paths, or packaged mode
  is supplied, the main process registers snapshot/toast subscriptions and
  validated semantic command/event IPC over the bounded Node connector. The V1
  WebSocket runtime remains available through the explicit legacy mode; the
  ARM64 Linux Debian Forge bundle passes without launching the UI.
- The Electron app has the semantic scene renderer from [ADR
  0097](decisions/0097-opt-in-scene-client-ui.md): with the bridge exposed, it
  skips the V1 WebSocket setup and renders path-free discovery plus the first
  List, Grid, Detail, and Form scene roots through the same event channel. The
  renderer does not receive sockets or extension paths.
- The Electron app can own the V2 daemon lifecycle from [ADR
  0098](decisions/0098-electron-owned-opt-in-daemon.md): when absolute catalog,
  bootstrap, and socket paths are all supplied, the main process starts the
  trusted Node composition before exposing the bridge and skips the unused V1
  runtime. External-daemon socket mode and the explicit V1 legacy mode remain
  available; packaged mode is supplied by ADR 0100 and is now the default under
  ADR 0108.
- The opt-in Electron renderer now consumes `menu-bar-extra` scenes under [ADR
  0099](decisions/0099-menu-bar-scene-renderer.md), including labeled sections,
  expandable submenus, separators, icons, shortcuts, left-click actions, and
  marked alternate-item right-click actions. [ADR
  0101](decisions/0101-native-menu-bar-registration.md) now projects that
  surface into the main-process native status-item menu.
- [ADR 0102](decisions/0102-v2-toast-lifecycle-presentation.md) adds
  deterministic V2 toast show/update/hide reconciliation, bounded stacking,
  message/style presentation, and semantic primary/secondary action buttons
  in the opt-in Electron window; automatic timeout policy remains separate.
- [ADR 0103](decisions/0103-v2-scene-icon-source-presentation.md) presents
  validated dark/light icon sources and fallbacks through the existing client
  SVG registry, renders safe data/HTTP(S) image sources, and keeps a
  deterministic fallback for unsupported sources.
- [ADR 0104](decisions/0104-v2-action-chrome-fidelity.md) preserves structured
  action shortcut labels, regular/destructive styling, and validated auto-focus
  intent in the opt-in V2 scene renderer; broader action helpers remain
  separate.
- [ADR 0105](decisions/0105-v2-icon-mask-and-tint-presentation.md) presents
  circle/rounded-rectangle masks and supported light/dark tint colors across
  registered icons, safe image sources, Grid content, and deterministic
  fallbacks; [ADR 0112](decisions/0112-v2-icon-contrast-adjustment.md) now
  applies deterministic contrast adjustment to parseable colors.
- [ADR 0113](decisions/0113-v2-action-submenu-presentation.md) now presents
  measured `ActionPanel.Submenu` groups as accessible expandable controls with
  loading, open, search, local filtering, nested actions, and autofocus
  behavior over the existing scene-event bridge.
- [ADR 0114](decisions/0114-on-demand-catalog-refresh.md) now makes the
  existing V2 Refresh action truthful: the trusted filesystem catalog can be
  invalidated on demand, and core command discovery refreshes it before
  returning a path-free snapshot. Automatic watching and persistent indexes
  remain separate follow-ups.
- [ADR 0115](decisions/0115-managed-node-runtime-baseline.md) aligns the
  application-managed Node target with the V2/CI baseline and keeps failed
  first-run installations visible and retryable; it does not remove older
  managed runtimes or install extension dependencies.
- [ADR 0116](decisions/0116-automatic-catalog-change-detection.md) adds
  bounded Node filesystem change detection for configured extension roots,
  invalidates the trusted catalog on changes, and lets the Electron client
  refresh an idle command snapshot without interrupting an active command;
  installation, dependency provisioning, and persistent indexes remain out
  of scope.
- [ADR 0117](decisions/0117-v2-client-startup-recovery.md) makes transient V2
  startup failures retryable in the renderer and distinguishes an empty
  command catalog from an empty search result; it does not restart active
  controllers or add installation/provider behavior.
- [ADR 0106](decisions/0106-v2-collection-accessory-presentation.md) presents
  validated List accessory titles, icons, text/date/tag records, tooltips, and
  safe colors plus Grid accessory icons/tooltips in a compact trailing rail;
  malformed records are ignored at the client edge and accessory interaction
  remains separate.
- [ADR 0107](decisions/0107-v2-local-collection-filtering.md) implements
  deterministic local List/Grid title-and-keyword filtering with Raycast-style
  default inference, section retention, and custom-filtering opt-out behavior.
- [ADR 0100](decisions/0100-packaged-v2-bootstrap-and-catalog.md) adds the
  higher-level `@blastlauncher/raycast-runtime-node` composition and packages
  standalone V2 bootstrap, adapter, and React resources for Electron. The
  `BLAST_V2_MODE=packaged` mode reads the existing development and
  production extension roots with development precedence and owns a stable
  `~/.blast/v2/core.sock` endpoint; ADR 0108 now makes it the default, with V1
  available through the explicit legacy mode.
- The Node filesystem catalog discovers Raycast-style `package.json` manifests,
  probes `src/<command-name>` entrypoints, honors explicit entrypoint
  overrides, and never resolves a path outside the extension root.
- An end-to-end vertical slice runs over real child processes without
  Electron: the catalog resolves a manifest fixture, the launcher starts the
  fixed bootstrap, the runtime publishes a list scene, an action event flows
  back and the extension updates the list, a granted clipboard write reaches
  a broker provider while an ungranted read is denied, and a deliberate
  crash removes the session while the core keeps serving.
- The React renderer adapter runs a React tree on react-reconciler and
  publishes one ordered scene transaction per synchronous commit: a full
  snapshot for the first commit and recovery, then insert/update/remove
  operations with stable node identifiers, whitelisted props, and stable
  event identifiers for action and form-control callbacks. Nested removals are
  coalesced so a deleted subtree cannot leave stale child updates or inserts in
  the mutation stream.
- The Raycast compatibility adapter implements the census-measured view
  stack (List, List.Item, ActionPanel, Action, Detail, Form, Icon) over the
  renderer, routes Clipboard through the capability broker, and raises
  structured errors for unmeasured surface; a Raycast-style fixture
  extension runs end to end over child processes.
- The Node bootstrap bundles entrypoints with esbuild (TypeScript/JSX and
  literal `@raycast/api` imports resolved by launcher-provided aliases) and
  renders default-exported command components through the adapter, so
  unmodified Raycast-style TSX fixtures run end to end. Default temporary
  bundle directories are removed after each successful or failed load, with
  synchronous signal/exit cleanup for interrupted runtimes; an explicitly
  supplied cache directory remains caller-owned. The corpus probe uses
  run-scoped prefixes and reclaims its bundle directories after each run.
- The support matrix runs a committed set of real corpus extensions through
  the full pipeline in CI: twenty-eight render fixtures (list, list sections,
  and detail,
  navigation, action groups, tinted icons, form controls, toasts, preferences,
  brokered clipboard, desktop and window-management boundaries, legacy
  action/storage/list/render aliases, and cross-bundle navigation),
  while the corpus probe records exactly which unmeasured APIs block the rest.
- The declaration inventory compares the pinned Raycast 2.1.0 declaration,
  the emitted compatibility declaration, and the built adapter runtime on the
  ARM64 runner. The current artifact covers 147/147 top-level exports,
  1,167/1,167 normalized nested members, and 88/88 declared runtime exports;
  all 85 corpus-observed API names are represented by either Raycast or an
  explicit Blast compatibility alias, so the declaration/runtime finish gate
  is green. This remains a contract-shape gate; adapter behavior, host
  providers, and corpus rendering stay separate.
- The first application boundary slice in [ADR
  0110](decisions/0110-v2-application-boundary-performance-baseline.md) is
  implemented: the V2 command chooser supports keyboard selection, wrapping,
  Enter-to-run, selected-state semantics, and listbox metadata. The real
  daemon/client benchmark records cold and warm command-to-scene latency,
  scene-event round trips, and shutdown on the ARM64 runner; it remains
  separate from Electron paint, native providers, and extension-owned
  dependency startup.
- The three-sample ARM64 baseline is committed in
  [`v2-arm64-baseline.json`](performance/v2-arm64-baseline.json): after the
  daemon-owned catalog watcher, median client readiness is 6.532 ms, cold
  command-to-scene is 104.077 ms, warm command-to-scene is 104.010 ms,
  scene-event round trip is 2.606 ms, and warm stop is 11.227 ms. These are
  comparison points, not timing acceptance thresholds; the warm command still
  launches a fresh extension process. The baseline was refreshed on the same
  ARM64 runner after the catalog watcher slice.
- The e2e corpus probe has a bounded, exact-version development-only vendor
  seed for `axios`, `cheerio`, `cross-fetch`, `date-fns`, `fast-xml-parser`,
  `fuse.js`, `moment`, `node-html-markdown`, `rss-parser`, and `zod`. The seed
  is supplied by the explicit workspace vendor root; the runtime still never
  installs or downloads extension dependencies.
- A second bounded seed adds `file-url`, `filesize`, `gray-matter`,
  `javascript-time-ago`, `luxon`, `node-html-parser`, `qrcode`, `tildify`,
  `ts-pattern`, and `turndown`, also as exact-version e2e development
  dependencies. A third bounded seed adds `@chrismessina/raycast-logger`,
  `@tanstack/react-query`, `algoliasearch`, `jimp`, `openai`,
  `raycast-cross-extension`, `remove-markdown`, `striptags`, `swr`,
  `untildify`, and `use-debounce`. The latest pinned corpus probe passes
  1,866 of 3,231 extensions (57.75%), or 1,866 of 2,915 extensions with a
  selected renderable command (64.01%). The remaining losses are tracked
  separately: 844 third-party dependency failures, 201 process/startup
  failures, 316 non-renderable commands, 1 structured compatibility error,
  and 3 missing entrypoints. The targeted zero-pagination and OpenInBrowser
  reprobes are deterministic; aggregate changes also include normal process
  and dependency variance.
- A fourth bounded seed adds 22 exact-version e2e development dependencies:
  `adm-zip`, `bplist-parser`, `change-case`, `chrono-node`, `d3-color`,
  `date-fns-tz`, `graphql-tag`, `image-size`, `jotai`, `json2md`, `linkedom`,
  `marked`, `moment-timezone`, `papaparse`, `parse-git-config`, `pinyin-pro`,
  `pretty-bytes`, `query-string`, `raycast-toolkit`, `slugify`, `timeago.js`,
  and `turndown-plugin-gfm`. The latest pinned corpus probe passes 1,912 of
  3,231 extensions (59.18%), or 1,912 of 2,915 extensions with a selected
  renderable command (65.59%). The remaining losses are tracked separately:
  797 third-party dependency failures, 202 process/startup failures, 316
  non-renderable commands, 1 structured compatibility error, and 3 missing
  entrypoints. The focused context-provider reprobe moves `dictionary/fromCmd`
  through to a rendered scene; the aggregate change remains subject to normal
  process and dependency variance.
- A fifth bounded seed adds 17 exact-version e2e development dependencies:
  `@mozilla/readability`, `bignumber.js`, `color-hash`, `cron-parser`,
  `dateformat`, `dedent-js`, `eventsource-parser`, `fast-fuzzy`, `fuzzysort`,
  `hi-base32`, `html-to-text`, `jose`, `js-base64`, `lodash.groupby`,
  `numeral`, `otpauth`, and `validator`. The latest pinned corpus probe passes
  1,938 of 3,231 extensions (59.98%), or 1,938 of 2,915 extensions with a
  selected renderable command (66.48%). The remaining losses are tracked
  separately: 770 third-party dependency failures, 202 process/startup
  failures, 316 non-renderable commands, 2 structured compatibility errors,
  and 3 missing entrypoints. The targeted fifth-seed reprobe rendered 24 of
  the previous dependency failures; the aggregate change remains subject to
  normal process and dependency variance.
- A sixth bounded seed adds 17 exact-version e2e development dependencies:
  `@noble/hashes`, `bs58`, `crypto-js`, `culori`, `currency-codes`, `exifr`,
  `jwt-decode`, `lodash.orderby`, `lunar-date-vn`, `node-localstorage`,
  `otplib`, `parse-github-url`, `proper-url-join`, `ramda`,
  `react-error-boundary`, `tiny-relative-date`, and `usehooks-ts`. The latest
  pinned corpus probe passes 1,948 of 3,231 extensions (60.29%), or 1,948 of
  2,915 extensions with a selected renderable command (66.83%). The remaining
  losses are tracked separately: 754 third-party dependency failures, 210
  process/startup failures, 316 non-renderable commands, no structured
  compatibility errors, and 3 missing entrypoints. The targeted sixth-seed
  reprobe rendered 13 of the previous dependency failures; the aggregate
  change remains subject to normal process and dependency variance.
- A seventh bounded seed adds 20 exact-version e2e development dependencies:
  `color-namer`, `cronstrue`, `csv-parse`, `debounce`, `dedupe`, `fromnow`,
  `image-meta`, `is-image`, `is-valid-domain`, `lodash.isempty`,
  `lodash.unescape`, `nzh`, `parse-url`, `simple-plist`, `tiny-pinyin`,
  `title`, `use-interval`, `url-join`, `weeknumber`, and `xml-js`. The latest
  pinned corpus probe passes 1,967 of 3,231 extensions (60.88%), or 1,967 of
  2,915 extensions with a selected renderable command (67.48%). The remaining
  losses are tracked separately: 734 third-party dependency failures, 209
  process/startup failures, 316 non-renderable commands, 2 structured
  compatibility errors, and 3 missing entrypoints. The targeted seventh-seed
  reprobe rendered 18 of the previous dependency failures and moved 4 to
  process/runtime failures; the aggregate change remains subject to normal
  process and dependency variance.
- An eighth bounded seed adds 13 exact-version e2e development dependencies:
  `@faker-js/faker`, `@iarna/toml`, `@nem035/gpt-3-encoder`,
  `@total-typescript/ts-reset`, `@web3-storage/parse-link-header`, `calendar`,
  `expand-tilde`, `formdata-node`, `fzf`, `p-queue`, `react-use`, `stream-json`,
  and `valibot`. The latest pinned corpus probe passes 1,980 of 3,231
  extensions (61.28%), or 1,980 of 2,915 extensions with a selected renderable
  command (67.92%). The remaining losses are tracked separately: 709
  third-party dependency failures, 222 process/startup failures, 316
  non-renderable commands, 1 structured compatibility error, and 3 missing
  entrypoints. The targeted eighth-seed reprobe rendered 20 of the previous
  dependency failures and moved 6 to process/runtime failures; the aggregate
  change remains subject to normal process and dependency variance.
- A ninth bounded seed adds 21 exact-version e2e development dependencies:
  `@chrismessina/raycast-kit`, `@ts-rest/core`, `@zxcvbn-ts/core`,
  `@zxcvbn-ts/language-common`, `@zxcvbn-ts/language-en`, `colord`, `es-toolkit`,
  `friendly-mimes`, `html-to-md`, `jsqr`, `json-ts`, `linkify-it`, `minisearch`,
  `node-emoji`, `opentype.js`, `p-min-delay`, `polished`, `protobufjs`,
  `raycast-hooks`, `sanitize-html`, and `sql-formatter`. The latest pinned corpus
  probe passes 2,005 of 3,231 extensions (62.06%), or 2,005 of 2,915 extensions
  with a selected renderable command (68.78%). The remaining losses are tracked
  separately: 683 third-party dependency failures, 223 process/startup failures,
  316 non-renderable commands, 1 structured compatibility error, and 3 missing
  entrypoints. The targeted ninth-seed reprobe rendered 21 of the previous
  dependency failures and moved 5 to process/runtime failures; the aggregate
  change remains subject to normal process and dependency variance.
- A tenth bounded seed adds 21 exact-version e2e development dependencies:
  `binary-split`, `city-timezones`, `edn-data`, `js-beautify`, `jsonwebtoken`,
  `lodash-es`, `mailparser`, `phone`, `showdown`, `suncalc`, `svgson`,
  `through2-map`, `tlds`, `ts-dedent`, `ts-fsrs`, `ts-md5`, `ts-results-es`,
  `ulid`, `utf8`, `vkbeautify`, and `xstate`. The latest pinned corpus probe
  passes 2,022 of 3,231 extensions (62.58%), or 2,022 of 2,915 extensions with
  a selected renderable command (69.37%). The remaining losses are tracked
  separately: 668 third-party dependency failures, 220 process/startup
  failures, 316 non-renderable commands, 2 structured compatibility errors, and
  3 missing entrypoints. The targeted tenth-seed reprobe rendered 14 of the
  previous dependency failures and moved 4 to process/runtime failures; the
  aggregate change remains subject to normal process and dependency variance.
- An eleventh bounded seed adds 8 exact-version e2e development dependencies:
  `@adobe/leonardo-contrast-colors`, `@asyncapi/parser`,
  `@tanstack/query-async-storage-persister`,
  `@tanstack/react-query-persist-client`, `@xstate/react`, `colorjs.io`,
  `oazapfts`, and `tough-cookie`. The latest pinned corpus probe passes 2,024
  of 3,231 extensions (62.64%), or 2,024 of 2,915 extensions with a selected
  renderable command (69.43%). The remaining losses are tracked separately:
  663 third-party dependency failures, 225 process/startup failures, 316
  non-renderable commands, no structured compatibility errors, and 3 missing
  entrypoints. The targeted eleventh-seed reprobe rendered 3 of the previous
  dependency failures and moved 3 to process/runtime failures; the aggregate
  change remains subject to normal process and dependency variance.
- A twelfth bounded seed adds 7 exact-version e2e development dependencies:
  `@apollo/client`, `@notionhq/client`, `@supabase/supabase-js`,
  `graphql-request`, `ky`, `ofetch`, and `octokit`. The packages were selected
  as JavaScript-only SDKs and installed successfully on the ARM64 Linux runner
  with lifecycle scripts disabled; native, WASM, macOS, and host-process
  packages remain deferred. The latest pinned corpus probe passes 2,039 of
  3,231 extensions (63.11%), or 2,039 of 2,915 extensions with a selected
  renderable command (69.95%). The remaining losses are tracked separately:
  642 third-party dependency failures, 229 process/startup failures, 316
  non-renderable commands, 2 structured compatibility errors, and 3 missing
  entrypoints. The targeted twelfth-seed reprobe rendered 14 of the previous
  dependency failures and moved 12 to process/runtime failures; the full run
  reduced dependency failures by 21 and recorded 15 additional rendered
  outcomes net of normal process variance. The two structured diagnostics are
  strict malformed-child checks for unsupported List text nodes, not platform
  install failures.
- A thirteenth bounded seed adds 12 exact-version e2e development dependencies:
  `ai`, `@ai-sdk/openai`, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`,
  `@slack/web-api`, `ethers`, `eventsource`, `meilisearch`, `openapi-fetch`,
  `stripe`, `user-agents`, and `youtube-transcript`. The existing `zod` seed
  was advanced to `3.25.76` for the provider SDK peer range. The packages were
  selected as JavaScript SDKs and installed successfully on the ARM64 Linux
  runner with lifecycle scripts disabled; no native, WASM, macOS, or
  host-process package was selected directly. Ethers/OpenAI still resolve
  through the workspace's existing optional websocket-helper graph, so those
  helpers are not treated as a new host capability. The latest pinned corpus
  probe passes 2,055 of 3,231 extensions (63.60%), or 2,055 of 2,915
  extensions with a selected renderable command (70.50%). The remaining losses
  are tracked separately: 621 third-party dependency failures, 234
  process/startup failures, 316 non-renderable commands, 2 structured
  compatibility errors, and 3 missing entrypoints. The targeted thirteenth-seed
  reprobe rendered 16 of the previous dependency failures and moved 6 to
  process/runtime failures; the full run reduced dependency failures by 21 and
  recorded 16 additional rendered outcomes net of normal process variance.
  The two structured diagnostics remain strict malformed-child checks for
  unsupported List text nodes, not ARM64 installation failures.
- A fourteenth bounded seed adds 13 exact-version e2e development dependencies:
  `@aws-sdk/client-s3`, `@googleapis/calendar`, `@googleapis/gmail`,
  `@tryfabric/martian`, `@vitalets/google-translate-api`, `archiver`,
  `download`, `mongodb`, `mqtt`, `pg`, `pocketbase`, `quicktype-core`, and
  `xlsx`. The packages were selected as JavaScript SDKs, client libraries, and
  local utilities and installed successfully on the ARM64 Linux runner with
  lifecycle scripts disabled; no native, WASM, macOS, or host-process package
  was selected directly, and database-native addons were not installed. The
  latest pinned corpus probe passes 2,072 of 3,231 extensions (64.13%), or
  2,072 of 2,915 extensions with a selected renderable command (71.08%). The
  remaining losses are tracked separately: 603 third-party dependency
  failures, 236 process/startup failures, 316 non-renderable commands, 1
  structured compatibility error, and 3 missing entrypoints. The targeted
  fourteenth-seed reprobe rendered 13 of the previous dependency failures and
  moved 5 to process/runtime failures; the full run reduced dependency failures
  by 18 and recorded 17 additional rendered outcomes net of normal process
  variance. The focused serial reprobe still confirms the strict malformed List
  text-child boundary in `crawldoc` and `open-targets-raycast`.
- A fifteenth bounded seed adds 12 exact-version e2e development dependencies:
  `@alicloud/pop-core`, `@api-blueprints/pathmaker`, `@aternus/csv-to-xlsx`,
  `ali-oss`, `cloudconvert`, `cloudinary`, `imapflow`, `mixpanel`,
  `placeholders-toolkit`, `proper-lockfile`, `proxy-agent`, and `ytdl-core`.
  The packages were selected as portable client libraries and local utilities
  and installed successfully on the ARM64 Linux runner with lifecycle scripts
  disabled; no native, WASM, macOS, or host-process package was selected
  directly. The latest pinned corpus probe passes 2,075 of 3,231 extensions
  (64.22%), or 2,075 of 2,915 extensions with a selected renderable command
  (71.18%). The remaining losses are tracked separately: 585 third-party
  dependency failures, 250 process/startup failures, 316 non-renderable
  commands, 2 structured compatibility errors, and 3 missing entrypoints. The
  targeted fifteenth-seed reprobe rendered 15 of the previous dependency
  failures and moved 3 to process/runtime failures; the full run reduced
  dependency failures by 18 and recorded 3 additional rendered outcomes net of
  normal process variance. The aggregate currently records the deterministic
  malformed List text-child boundary in both `crawldoc` and
  `open-targets-raycast/platform`; these are compatibility diagnostics, not
  ARM64 installation failures.
- A sixteenth bounded seed adds 5 exact-version e2e development dependencies:
  `@atproto/api`, `@atproto/identity`, `@atproto/lexicon`, `@atproto/uri`, and
  `@aws-sdk/s3-request-presigner`. The packages were selected as portable
  protocol and signing clients and installed successfully on the ARM64 Linux
  runner with lifecycle scripts disabled; no native, WASM, macOS, or
  host-process package was selected directly. The latest pinned corpus probe
  passes 2,082 of 3,231 extensions (64.44%), or 2,082 of 2,915 extensions with
  a selected renderable command (71.42%). The remaining losses are tracked
  separately: 580 third-party dependency failures, 248 process/startup
  failures, 316 non-renderable commands, 2 structured compatibility errors,
  and 3 missing entrypoints. The targeted sixteenth-seed reprobe rendered 4 of
  the previous dependency failures; the full run reduced dependency failures by
  5 and recorded 7 additional rendered outcomes net of normal process
  variance. The deterministic malformed List text-child boundary remains in
  `crawldoc` and `open-targets-raycast/platform` and is unrelated to ARM64
  installation support.
- A seventeenth bounded seed adds 4 exact-version e2e development dependencies:
  `@clerk/backend`, `@langchain/core`, `@langchain/openai`, and
  `@salesforce/core`. The packages were selected as portable client libraries
  and installed successfully on the ARM64 Linux runner with lifecycle scripts
  disabled; no native, WASM, macOS, or host-process package was selected
  directly. The latest pinned corpus probe passes 2,085 of 3,231 extensions
  (64.53%), or 2,085 of 2,915 extensions with a selected renderable command
  (71.53%). The remaining losses are tracked separately: 575 third-party
  dependency failures, 250 process/startup failures, 316 non-renderable
  commands, 2 structured compatibility errors, and 3 missing entrypoints. The
  full run is subject to normal process variance; focused diagnostics confirm
  the structured outcomes are the deterministic invalid-Grid-column and
  malformed-List-child boundaries, not missing API exports or ARM64
  installation failures.
- The first API-first validation slice after the vendor rounds now enforces
  Raycast's `Grid`/`Grid.Section` column range (`1..8`) and rejects
  `BrowserExtension.getContent` markdown requests that also provide a CSS
  selector. Both boundaries have deterministic adapter tests and structured
  compatibility errors; the corpus outcome counters intentionally remain
  unchanged because these checks do not add dependencies or host providers.
- The API-first metadata slice, [ADR 0077](decisions/0077-preserve-raycast-entrypoint-mode.md),
  now preserves manifest `view`, `no-view`, and `menu-bar` modes through the
  trusted catalog and extension descriptor into both `environment.entryPointMode`
  and its deprecated `environment.commandMode` alias. Omitted modes and legacy
  manually constructed contexts default to `view`; contract, catalog, and
  adapter tests cover the three explicit modes.
- The API-first access-policy slice, [ADR 0078](decisions/0078-measured-environment-access-policy.md),
  now delegates `environment.canAccess` to an optional synchronous host policy.
  Known API tokens use realm-stable names across separately bundled adapter
  copies, unknown values remain host-policy inputs, non-boolean results fail
  with a structured compatibility error, and the default remains deny.
- The image descriptor fidelity slice in [ADR 0079](decisions/0079-preserve-raycast-image-descriptor-metadata.md)
  is now implemented: Raycast image source/fallback variants, masks, and
  dynamic tint metadata cross the scene and capability boundaries. ADR 0103
  now renders registered and safe data/HTTP(S) sources in the opt-in V2
  client; ADR 0112 now adjusts parseable icon tint colors against the active
  V2 canvas and preserves unsupported CSS values unchanged.
- The environment metadata slice in [ADR 0080](decisions/0080-preserve-raycast-environment-metadata.md)
  is now implemented: the trusted catalog carries manifest title and
  owner/author identity into `environment`, and the descriptor accepts
  validated host-supplied Raycast version, entrypoint type, development state,
  appearance, and text-size values. Legacy defaults remain in place; OS
  preference detection, tool execution, and production host providers remain
  outside this slice.
- The preference metadata slice in [ADR 0081](decisions/0081-preserve-raycast-preference-metadata.md)
  is now implemented: measured manifest declarations and dropdown data cross
  the trusted descriptor, command declarations override extension declarations,
  and deprecated `preferences` exposes declared entries with resolved values
  overlaid when available. `getPreferenceValues()` remains a deterministic
  default map; preference storage, secure password persistence, platform
  app-picker resolution, and onboarding UI remain out of scope.
- Navigation (useNavigation, Action.Push), LocalStorage through the
  capability broker with a reference in-memory provider, the callable plus
  property-based environment surface, and measured WindowManagement discovery
  and bounds operations are measured adapter APIs; the navigation stack retains
  entries and pop lifecycle callbacks, and only the top view contributes scene
  nodes. A realm-shared navigation proxy keeps bundled extension calls
  connected to the host-owned stack. Window-management data is JSON-encoded
  across explicit capability operations, and bounds mutation remains
  host-authorized.
- `LocalStorage.allItems` and the deprecated `allLocalStorageItems` alias now
  return the complete extension-local primitive-value map through a JSON
  encoded `local-storage.getAll` capability response; malformed responses are
  rejected before reaching extension code.
- Form field `onFocus` and `onBlur` callbacks now publish separate scene event
  IDs and receive validated `Form.Event` values reconstructed from the
  client-provided or runtime-retained field value. Literal CommonJS
  `require("@raycast/api")` imports are also covered alongside the measured
  dynamic, namespace, and side-effect import shapes.
- Non-date Form controls tolerate the common runtime shape of a top-level
  `null` initial value by omitting it from the scene and form runtime; strict
  validation still rejects wrong array members and other invalid types, while
  `DatePicker` preserves its native `Date | null` value semantics.
- String-valued Form and Grid dropdown labels and values accept empty strings
  because the pinned Raycast declarations require string types without a
  non-empty constraint; non-string values remain rejected at the adapter edge.
- The `Icon` export now mirrors all 478 members of the pinned Raycast
  declaration, while retaining legacy corpus names as explicit aliases;
  unknown members remain rejected rather than resolving through a fallback.
  `Color` emits Raycast's `raycast-*` theme identifiers while retaining the
  legacy raw `Pink`/`Gray` values and declaration-shaped dynamic `Brown`. The measured legacy
  `Toast.Style.SuccessMessage` constant is an identity alias of `Success`;
  both adapter-only aliases are recorded in [ADR 0086](decisions/0086-preserve-legacy-color-and-toast-aliases.md).
- Command-scoped manifest preference defaults now cross the catalog boundary:
  focused diagnostics identified four Grid-column failures caused by
  `getPreferenceValues()` omitting preferences declared on the selected
  command; those defaults now cross the catalog boundary.
- `ActionPanel.Item` is an identity-preserving alias of the measured action
  component, so extensions using the nested Raycast spelling share the same
  validation, event IDs, and scene serialization. Focused corpus diagnostics
  moved `iridium`, `markdown-reference`, and `vivaldi` through to rendered
  scenes; invalid action children remain structured compatibility errors.
- Whitespace-only text nodes produced by JSX formatting are ignored in measured
  collection mappers for forms, pickers, lists, grids, menus, and action
  groups. Meaningful text and invalid elements remain rejected; the canonical
  reprobe moved six formatting-only corpus failures through to rendered scenes.
- `Form.searchBarAccessory` accepts the measured `Form.LinkAccessory`, which
  serializes its target and text as a semantic accessory node and routes its
  open event through the existing `open.open` capability. Invalid accessory
  values remain structured compatibility errors.
- `Action.CreateQuicklink` and `Action.PickDate` now render through the shared
  action node. Quicklink payloads are validated and sent as JSON through the
  explicit `quicklink.create` capability; date-picker options cross the
  explicit `date-picker.pick` capability and restore an ISO result to
  `Date | null`. Deprecated direct `Form.DropdownItem`,
  `Form.DropdownSection`, and `Form.TagPickerItem` members preserve the same
  component identities as their nested counterparts.
- `Action.ShowInFinder` and `Action.Trash` now render through the shared action
  node and route normalized `PathLike` values through the existing
  `finder.show` and `filesystem.trash` capabilities. Deprecated direct action
  aliases preserve those component identities; activation callbacks run only
  after a successful host response.
- `Action.CreateSnippet` validates the measured `{ text, name?, keyword? }`
  payload and routes it through `snippet.create`; `Action.ToggleQuickLook`
  routes through `quick-look.toggle`. List and Grid item Quick Look metadata
  serializes validated paths and optional names into the scene, and the
  explicit icon subset includes `Icon.Snippets`.
- `Action.OpenInBrowser` preserves declaration-valid empty string URLs during
  loading and omits the action when its required URL is absent at runtime;
  host opening still validates non-empty targets on activation. The targeted
  reprobe moved `get-cat-images`, `manifest-viewer`, `vikunja`, and
  `webpage-to-markdown` through to rendered scenes.
- `Detail.Metadata` and `List.Item.Detail` now serialize measured labels,
  separators, links, tag lists, loading state, and navigation titles as
  explicit scene nodes. `List.isShowingDetail` plus title/subtitle tooltip
  descriptors are preserved, and `List.Item.Detail.Metadata` is the same
  measured metadata surface. The corpus also uses `Action.SubmitForm` as a
  generic Detail action; outside a Form its callback receives an empty value
  bag. `Icon.CircleProgress` and `Icon.AppWindowList` are now measured
  members.
- `List`, `Grid`, and `Form.Dropdown` now carry the declaration-backed search
  lifecycle, filtering, loading, and pagination fields that map to semantic
  scene events. `List.Dropdown` and `Grid.Dropdown` are accepted
  interchangeably as search-bar accessories, matching Raycast's shared
  dropdown contract.
- Clipboard `read`/`readText` decode the official structured `{ text }` shape,
  plain string responses, and empty responses; `clear` and `clearClipboard`
  use the explicit clipboard capability. `ActionPanel.Submenu` carries its
  search/open lifecycle and deprecated `id`, while `Action` preserves its
  deprecated `id` and `Action.InstallMCPServer` is brokered.
- The adapter now exposes the declaration-shaped nested `Props` namespaces
  for the measured `Action`, `ActionPanel`, `List`, `Grid`, `Form`, and
  `MenuBarExtra` APIs. `Cache.subscribe` stays bound when passed to React
  external-store hooks, and nullable `Form.TextArea.enableMarkdown` is omitted
  instead of crossing the scene boundary as `null`.
- The declaration surface now also exposes Raycast's `Alert.Options` and
  `Alert.ActionOptions`, `Cache.Options`/`Subscriber`/`Subscription`,
  `Keyboard.Shortcut`/`KeyModifier`/`KeyEquivalent`,
  `Toast.Options`/`ActionOptions`/`Style`, and `Form.ItemReference` aliases;
  `FormItemRef` is available as a top-level type. The nested Form field ref
  aliases and `Form.DatePicker.Type` are declaration-compatible, and deprecated
  Form field values retain their nested static members, including the legacy
  `Form.DatePicker.Date` and `DateTime` values. `Toast.Style` constants
  use Raycast's uppercase values and normalize to lower-case scene styles. Form
  fields attach stable `focus()`/`reset()` handles; those methods are currently
  no-ops until a host-facing control boundary is defined.
- The measured collection-value boundary now preserves empty Grid content
  tooltips, accepts Grid column counts from 1 through 8, and serializes
  `List.Item` icon descriptors with optional values and tooltips. Pagination
  preserves non-negative safe-integer page sizes, including the zero fallback
  emitted by async hooks before pagination state is initialized. The explicit
  icon subset includes the observed `Icon.AddPerson` member. JSX conditional
  numeric `0` sentinels and React memo/forward-ref/lazy composites are accepted
  in measured collection slots. Optional string-array Form initial values omit
  only `undefined` entries when all remaining entries are strings; null and
  other invalid members remain rejected.
- Measured collection components accept custom function components, React
  fragments, and React context providers/consumers in action, list, grid,
  menu-bar, and form child positions; the resolved children remain subject to
  semantic parent/child validation, while raw text and intrinsic DOM elements
  remain unsupported.
- ActionPanel renders as a scene action-group (titles, submenus, List-level
  panels), and object icons preserve light/dark sources, fallbacks, masks, and
  dynamic tint metadata as primitive scene properties. Existing light icon
  fields remain backwards compatible; the opt-in V2 client presents masks and
  supported tints; ADR 0112 now applies deterministic contrast adjustment when
  the color can be parsed safely.
- Form renders the measured text, textarea, password, checkbox, dropdown,
  `DatePicker`, `TagPicker`, `FilePicker`, description, separator, and
  submit-action subset. Form field changes and submissions carry validated
  string, boolean, null, or string-array wire values through `scene.event`;
  `DatePicker` ISO strings are restored to native `Date | null` values by the
  adapter, and `ActionPanel.Section` publishes nested action groups.
- Toasts support legacy show calls plus identified show/update/hide lifecycle
  messages, animated/success/failure styles, mutable fields, and primary or
  secondary actions addressed by validated `scene.event` IDs. The measured
  legacy `Toast.Style.SuccessMessage` alias is preserved as an adapter-local
  identity alias in ADR 0086.
- Action and action-group shortcut objects normalize into structured scene
  values, including platform-specific Raycast shortcut unions; measured action
  styles, `autoFocus`, and common keyboard shortcut constants are available.
- `SubmitFormAction`, `OpenAction`, `OpenWithAction`, and `PasteAction` preserve
  the measured form-submit and action shapes. `ImageMask` aliases `Image.Mask`,
  while the top-level clipboard and LocalStorage helpers route to the same
  brokered operations. `ListSection` maps to a semantic list-section node, and
  legacy `render(<Command />)` calls bridge into the active renderer.
- Legacy `preferences` exposes declaration-shaped manifest metadata, including
  required/type/description fields, optional labels/placeholders/defaults, and
  measured dropdown data; resolved values overlay the official `.value` field.
  `FormValue` includes the pinned numeric forms, and
  `Navigation`, `Environment`, `KeyEquivalent`, `FormValues`,
  `KeyboardShortcut`, and `ImageLike` aliases are available. Environment
  `canAccess` delegates to an optional host policy with stable measured API
  names and remains deny-by-default when no provider is connected;
  [ADR 0078](decisions/0078-measured-environment-access-policy.md) records the
  adapter boundary without claiming a production provider.
- `showHUD`, `open`, and `confirmAlert` cross explicit `hud.show`, `open.open`,
  and `alert.confirm` capability requests; alert callbacks run only after a
  validated boolean response.
- `Cache` provides synchronous namespaced UTF-8 LRU behavior as a session-local
  fallback. Its persistence-shaped `storageDirectory` remains a compatibility
  value until a host cache capability exists.
- `LaunchProps` and `LaunchType` are injected into Raycast-style default command
  components, with deterministic user-initiated/empty-argument defaults;
  `Image.Mask` constants resolve through the adapter.
- `closeMainWindow`, `popToRoot`, and `openExtensionPreferences` cross explicit
  `window.close`, `navigation.popToRoot`, and `preferences.openExtension`
  capability requests.
- `Grid` renders content tiles, sections, empty views, search-bar dropdowns,
  and measured layout props through a semantic grid scene root. `MenuBarExtra`
  renders menu-bar roots, items, sections, submenus, separators, shortcuts, and
  left-click action events. `MenuBarExtra.Item.alternate` renders a nested
  alternate item with a separate right-click event; menu-bar commands are
  included in corpus selection when no view command exists.
- `launchCommand` crosses an explicit `command.launch` capability. Command
  names, launch types, external targets, fallback text, and JSON-serializable
  arguments/context are validated before primitive-only wire encoding.
- `getSelectedText` and `getApplications` cross explicit `selection.read` and
  `application.list` capabilities. Selected text requires a string response;
  application results are JSON-decoded and validated into the measured
  `Application` shape, with an optional path encoded as a primitive argument.
- `openCommandPreferences` crosses the explicit
  `preferences.openCommand` capability.
- `getSelectedFinderItems` and `showInFinder` cross explicit
  `finder.selectedItems` and `finder.show` capabilities. Selected items are
  JSON-decoded into validated `FileSystemItem` paths, and reveal paths use the
  structural `PathLike` type.
- `getFrontmostApplication` crosses `application.frontmost` and reuses the
  validated `Application` response shape.
- `BrowserExtension.getTabs` and `BrowserExtension.getContent` cross explicit
  `browser-extension.getTabs` and `browser-extension.getContent` capabilities;
  tab responses are JSON-decoded and validated, while content format,
  selector, and tab ID options are normalized before crossing the boundary;
  markdown requests with a selector are rejected at the adapter edge.
- `clearSearchBar` and `trash` cross explicit `navigation.clearSearchBar` and
  `filesystem.trash` capabilities. Trash accepts one or many structural
  `PathLike` values and encodes only normalized primitive paths; browser,
  navigation, and destructive filesystem behavior remains host-owned.
- The top-level `ToastStyle` constants preserve Raycast's uppercase legacy
  values, and `Tool.Confirmation<T>` is available as a type-only contract;
  neither introduces an unbrokered runtime capability.
- `OpenInBrowserAction` and `Action.OpenInBrowser` share a validated scene
  action and cross `open.open`; `CopyToClipboardAction` and
  `Action.CopyToClipboard` support string, numeric, and structured content with
  `clipboard.write` normalization. `Action.Open`/`OpenAction` and
  `Action.Paste`/`PasteAction` use `open.open` and `clipboard.paste`; the
  deprecated clipboard helper aliases share those operations. `getDefaultApplication` crosses
  `application.default`, `PreferenceValues` is type-only, and
  `captureException` crosses `telemetry.captureException` without making
  telemetry failures observable to the command.
- `AI.ask` crosses the explicit `ai.ask` capability. Prompt, creativity, and
  model options are validated and normalized; the returned promise preserves
  Raycast's `.on("data")` shape while the host owns the actual model provider.
- `OAuth.PKCEClient` covers the measured authorization-request, browser,
  token-set, and removal lifecycle through explicit `oauth.*` capabilities.
  PKCE material, browser interaction, and secure token storage remain host
  responsibilities.
- `updateCommandMetadata` crosses `command.updateMetadata` for the measured
  subtitle string and `null` clear semantics.

## Trust boundaries already enforced

- Received transport values remain `unknown` until validators accept them.
- Protocol and extension domain messages have separate validators.
- Shared List/Grid dropdown accessories remain within the semantic collection
  child whitelist in either direction; the adapter does not silently widen
  arbitrary collection composition.
- Optional form values on `scene.event` are validated as a field-ID map before
  the relay dispatches them to runtime callbacks; string arrays are checked
  element-by-element, while the compatibility adapter validates and restores
  date values.
- Top-level `null` initial values are normalized at the Raycast adapter edge for
  non-date controls; null members inside array-valued controls remain rejected
  before they reach the scene contract.
- Finder and trash action paths are normalized to primitive strings before they
  reach the host; the host still owns filesystem policy, authorization, and
  destructive-operation consent.
- String-valued dropdown labels, values, checkbox labels, and descriptions are
  type-checked without imposing an extra non-empty constraint; scene-required
  properties remain present even when their string value is empty.
- Toast lifecycle operations, toast IDs, styles, and action event IDs are
  validated before the relay forwards them to the client-side toast sink.
- Browser tab responses are JSON-decoded and validated before they reach an
  extension; filesystem trash paths are normalized to primitive strings before
  the host receives them.
- A runtime must identify as `extension-runtime`; a host must identify as
  `extension-host`.
- The runtime cannot choose which descriptor it runs, and a client cannot choose
  filesystem paths through the core API.
- Node processes are launched without a shell, and environment inheritance must
  be explicit.
- Standard output is reserved for protocol frames.

## Intentionally missing

- a persistent, watched catalog index and extension installation flows; the
  current on-demand catalog refresh is implemented under ADR 0114;
- full dependency provisioning beyond the seventeen bounded e2e seeds, lockfile/audit
  policy for large npm graphs, and native package externalization (the runtime
  supports explicit local or vendored dependency roots but never installs
  packages); these dependency and platform concerns are tracked separately
  from Raycast API compatibility, and extension authors own third-party native
  module support on their target platforms;
- the remaining measured Raycast surface: broader desktop APIs, additional
  action helpers/providers, and additional Tool/browser APIs; the
  declaration-driven ARM64 finish gate is green, and the client toast timeout,
  icon contrast, and ActionPanel.Submenu presentation policies are now defined
  under ADRs 0111, 0112, and 0113 while the remaining behavior/provider
  boundaries stay separately measured;
- persistent catalog indexing and complete desktop rendering
  of every scene member (the local listener, Node
  daemon composition, path-free discovery snapshot, transport-neutral client
  consumer, Node local connector, opt-in Electron main bridge, first semantic
  scene renderer, explicit app-owned daemon mode, menu-bar scene renderer, and
  packaged bootstrap/catalog bridge, native status-item menu projection, and
  toast lifecycle/action presentation, scene icon/image source presentation,
  icon mask/tint presentation, icon contrast adjustment, action chrome fidelity,
  ActionPanel.Submenu presentation, and the keyboard command chooser, plus the
  bounded toast timeout policy, now exist; packaged mode is now the default
  under ADR 0108, while installation UI and internal V2
  migration/update flows, additional action helpers/providers, and remaining
  scene visuals are still missing. There is no V1 user
  migration path because V1 was never released);
- capability manifest declarations, real operating-system providers, audit
  records, and consent UI;
- production AI providers, OAuth browser/token-store providers, and command
  metadata client integration; deterministic providers currently exist only
  for compatibility probes and fixtures;
- structured logs beyond captured child stderr;
- startup deadlines chosen by the core, restart policy, quotas, and OS sandbox;
- authenticated local sockets, WebSocket transport, and remote pairing;
- installation UI and internal V2 migration/update flows, CLI control, mobile,
  and web clients. V1 was never released, so no V1 user migration is planned.

## Recommended continuation

The first extension-to-client vertical slice is complete, the corpus census
(`compatibility/README.md`) justified the adapter order, and the current
support matrix (`compatibility/support-matrix.md`) records the baseline and
post-slice probes. Coverage means the share of corpus extensions that bundle
and render through the current path, not the number of exported API names. The
shortcut, imperative, cache, launch-boundary, desktop-discovery,
finder-boundary, host-boundary, window-management, declaration,
image-descriptor, environment-metadata, and dependency-policy slices are
complete, but the measured
80% target is not yet met: the current run is 64.53% overall and 71.53% among
commands with a
renderable selection. Per [ADR 0109](decisions/0109-declaration-driven-arm64-compatibility-finish-line.md),
compatibility is now measured at the ARM64 declaration/runtime/import finish
line: the declaration shape, runtime export, observed-import, and static-blocker
checks all pass. The remaining measured adapter behavior is covered by focused
tests; the two aggregate structured outcomes are intentional validation
boundaries. Declaration shape, adapter behavior, corpus runtime coverage, and
host/provider coverage remain separate measurements. The first application
slice is now recorded by [ADR 0110](decisions/0110-v2-application-boundary-performance-baseline.md)
and its baseline artifact. The bounded toast timeout, icon contrast, and
ActionPanel.Submenu presentation slices are recorded by ADRs 0111, 0112, and
0113, 0114, 0115, and 0116; the managed runtime prerequisite is now aligned and
automatic catalog change detection and renderer startup recovery are now live,
while the next application work is extension installation/update UX, remaining action
helpers/providers, and scene visuals.
Installation UI and internal V2 migration/update flows are later product work;
no V1 user migration is needed because V1 was never released.
Native/macOS, WASM,
test-only, large-graph, and host-process dependencies remain deferred, with
only small portable JavaScript seeds eligible after the API-first slice.

1. Complete bounded application-layer policies first. The client-owned toast
   timeout, deterministic icon contrast, and ActionPanel.Submenu presentation
   are implemented under ADRs [0111](decisions/0111-v2-toast-timeout-policy.md),
   [0112](decisions/0112-v2-icon-contrast-adjustment.md), and
   [0113](decisions/0113-v2-action-submenu-presentation.md). The trusted
   on-demand catalog refresh is now implemented under [ADR
   0114](decisions/0114-on-demand-catalog-refresh.md). Automatic catalog
   change detection is implemented under [ADR
   0116](decisions/0116-automatic-catalog-change-detection.md), and renderer
   startup recovery is implemented under [ADR
   0117](decisions/0117-v2-client-startup-recovery.md); persistent indexes
   remain a follow-up. The managed Node prerequisite and
   retryable first-run installer are implemented under [ADR
   0115](decisions/0115-managed-node-runtime-baseline.md). Continue with
   extension installation/update UX and internal V2 migration/update flows,
   remaining action helpers/providers, and scene visuals. There is no V1 user
   migration requirement because V1 was never released. Keep these client
   boundaries separate from the already-green API finish gate and from
   host/provider work.
2. Finish measured Raycast API semantics as new gaps are found. The declaration inventory and
   declaration-derived corpus allowlist are green: 147/147 top-level exports,
   1,167/1,167 normalized nested members, 88/88 declared runtime exports, all
   85 observed corpus names represented, and zero static blockers. Continue
   closing any newly measured portable behavior gap with deterministic adapter,
   fixture, and focused-probe coverage. Keep API
   progress distinct from dependency/platform provisioning and host
   capability/renderability outcomes. The entrypoint-mode propagation in
   [ADR 0077](decisions/0077-preserve-raycast-entrypoint-mode.md) is now
   implemented: trusted manifest `view`/`no-view`/`menu-bar` mode crosses into
   the Environment API before any dependency round. Continue auditing the
   remaining measured API surface. The `environment.canAccess` delegation in
   [ADR 0078](decisions/0078-measured-environment-access-policy.md) is now
   implemented with default denial, stable host-policy names, and structured
   return validation. The image descriptor fidelity slice in [ADR
   0079](decisions/0079-preserve-raycast-image-descriptor-metadata.md) is now
   implemented: theme-aware source/fallback, mask, and dynamic tint metadata
   are carried as primitive scene and host-payload fields without pretending the
   current client can render them. Deterministic scene, adapter, and e2e
   verification covers 50, 90, and 41 tests respectively. The environment
   metadata slice in [ADR 0080](decisions/0080-preserve-raycast-environment-metadata.md)
   is also implemented: manifest title and owner/author values cross the
   trusted descriptor, and explicit scalar host metadata reaches the property
   and callable forms of `environment` with safe legacy defaults. The
   preference metadata slice in [ADR
   0081](decisions/0081-preserve-raycast-preference-metadata.md) is implemented:
   declared metadata and dropdown data cross the descriptor, resolved defaults
   overlay deprecated `preferences`, and storage/platform resolution remain a
   later host boundary. The AI model catalog slice in [ADR
   0082](decisions/0082-preserve-raycast-ai-model-catalog.md) is implemented:
   all 158 pinned `AI.Model` key/value pairs cross with their declared
   identifiers, the pre-existing legacy spelling remains supported, and
   unknown names retain the open runtime fallback. Model providers and
   availability stay host work. The OAuth provider metadata slice in [ADR
   0083](decisions/0083-preserve-raycast-oauth-provider-metadata.md) is
   implemented: provider icon variants, masks, tints, and descriptions cross
   the authorization-request boundary as validated primitives, while browser
   and token providers remain host-owned. The Form DatePicker compatibility
   slice in [ADR
   0084](decisions/0084-preserve-legacy-form-date-picker-values.md) is also
   implemented: the two corpus-observed legacy `Form.DatePicker.Date` and
   `DateTime` runtime values alias the declaration-backed `Type` values
   without widening the form scene contract. The Form Dropdown keyword slice
   in [ADR
   0085](decisions/0085-preserve-form-dropdown-keywords.md) is now implemented:
   `Form.Dropdown.Item.keywords` is validated and preserved as a scene string
   array, while filtering remains client behavior. The legacy constant slice
   in [ADR 0086](decisions/0086-preserve-legacy-color-and-toast-aliases.md) is
   now implemented: the one API-bound `Color.Gray` use and one
   `Toast.Style.SuccessMessage` use found by the binding-aware corpus audit
   remain supported, without adding extension-owned `Color.Grey` model values
   or speculative aliases. The legacy icon slice in [ADR
   0087](decisions/0087-preserve-measured-legacy-icon-aliases.md) is now
   implemented: the binding-aware audit's measured `Icon.Safari` and
   `Icon.Application` names map explicitly to the current globe and app-window
   glyphs because their original declaration values are absent from sampled
   public Raycast API archives. The focused probe reports no static unsupported
   APIs for either call site, while both remain separately classified at the
   existing dependency boundary. The next bounded client-facing icon step is
   documented in [ADR
   0088](decisions/0088-complete-available-client-icon-assets.md): register
   every additional unique existing local SVG already referenced by the client
   lookup table. ADR 0088 is now implemented with 302 active client map keys
   (171 added in this slice); the 102 absent numbered/warning assets remain
   explicit and ungenerated.
   The measured fetch slice in [ADR
   0089](decisions/0089-allow-permissive-runtime-fetch.md) is now implemented:
   the one corpus-observed named `fetch` import delegates to the current
   runtime without URL policy, with native-host network enforcement deferred
   to a later policy boundary.
   Preserve
   structured errors for values that would require a broader scene or host
   policy. Keep deterministic structured diagnostics such as the invalid
   `arabic-keyboard` Grid column and malformed `crawldoc` List child rather
   than weakening the scene or action validators around malformed children,
   invalid measured values, and empty or missing targets. Focused serial
   reprobes confirm these are deterministic boundary checks rather than
   platform-install failures.
   The targeted
   `modrinth-search/search-projects` reprobe renders
   after preserving its declaration-shaped zero page-size fallback, and the
   four targeted OpenInBrowser commands render after the action-readiness
   boundary was added; later full-run changes remain subject to process and
   dependency variance.
   The Quick Look/application-chooser surface and other client-focused visual
   boundaries remain explicitly deferred until compatibility behavior is signed
   off; they need host/client decisions before implementation even though the
   declaration/runtime finish gate is green.
3. Keep the command-scoped preference, nullable Form, empty-string,
   `LocalStorage.allItems`/`allLocalStorageItems`, Form event, literal `require`,
   composite-child/context-provider, declaration-backed Icon,
   cross-compatible dropdowns,
   `ActionPanel.Item`, whitespace-only
   collection boundaries, `Form.LinkAccessory`, the measured action creators,
   Form dropdown keyword metadata, Finder/trash actions, collection-value
   normalization, CreateSnippet and
   Quick Look actions, Detail metadata, `List.Item.Detail`, search/pagination
   events, zero pagination and OpenInBrowser readiness fallbacks, Clipboard
   read/clear, Submenu lifecycle,
   nested `Props` and utility namespaces, `Form.ItemReference`, deprecated
   Form/action member aliases, Grid column bounds, and the
   BrowserExtension markdown/selector rule, and Environment entrypoint-mode
   propagation covered by each test slice.
4. Keep safe dynamic, namespace, side-effect, and literal `require` import
   forms covered. The permissive runtime `fetch` slice in [ADR
   0089](decisions/0089-allow-permissive-runtime-fetch.md) is implemented
   without URL policy, consent, or response limits; leave those controls for a
   future native host boundary.
5. After each API slice, consider only small, exact-version,
   development-only portable JavaScript dependency seeds when the diagnostic
   census supports them. Keep each group reviewable and measure rendered
   outcomes after installation; hold network, cross-extension, native, macOS,
   WASM, test-only, large-graph, and host-process packages for explicit policy
   decisions. Do not count extension-owned platform incompatibility as a
   missing Raycast API member.
6. Integrate the transport-neutral client consumer from [ADR
   0094](decisions/0094-transport-neutral-client-consumer.md) into the Electron
   client. The bounded Node connector in [ADR
   0095](decisions/0095-bounded-local-core-client.md) and the opt-in main-process
   bridge in [ADR 0096](decisions/0096-electron-main-client-bridge.md) are now
   implemented, so Electron can reuse one socket connection, handshake,
   timeout, abort, cleanup, snapshot, and semantic event policy. The first
   semantic renderer is implemented in [ADR
   0097](decisions/0097-opt-in-scene-client-ui.md), and explicit app-owned
   daemon startup is implemented in [ADR
   0098](decisions/0098-electron-owned-opt-in-daemon.md). The packaged
   bootstrap/catalog bridge is implemented in [ADR
   0100](decisions/0100-packaged-v2-bootstrap-and-catalog.md), and [ADR
   0108](decisions/0108-default-packaged-v2-startup.md) now makes that packaged
   path the application default. Keep the V1 WebSocket path available through
   the explicit `BLAST_V2_MODE=legacy` escape hatch while compatibility and
   installation work continue. Core command discovery now refreshes the
   trusted catalog on demand under ADR 0114, and the managed Node prerequisite
   is aligned under ADR 0115.
   The
   transport-neutral client/core session slice in [ADR
   0090](decisions/0090-client-facing-core-session-boundary.md) is implemented:
   it establishes a validated client/core connection for one active command,
   semantic scene and event forwarding, lifecycle reporting, and disconnect
   cleanup. The bounded local listener from [ADR
   0091](decisions/0091-bounded-local-core-listener.md) now reuses this session
   without adding Electron or filesystem paths to the protocol, and the Node
   daemon composition from [ADR
   0092](decisions/0092-node-core-daemon-composition.md) now owns the local
   dependency graph. The path-free discovery contract in [ADR
   0093](decisions/0093-path-free-command-discovery.md) is now implemented as
   a deterministic snapshot, and the controller in ADR 0094 now consumes it;
   the Electron host/IPC adapter is now implemented behind an explicit socket
   opt-in; the first semantic SceneNode renderer is now implemented in [ADR
   0097](decisions/0097-opt-in-scene-client-ui.md), and Electron can now start
   the daemon itself when all paths are explicit under [ADR
   0098](decisions/0098-electron-owned-opt-in-daemon.md). The menu-bar scene
   renderer is now implemented under [ADR
   0099](decisions/0099-menu-bar-scene-renderer.md), and packaged
   daemon/bootstrap/catalog policy is implemented under [ADR
   0100](decisions/0100-packaged-v2-bootstrap-and-catalog.md), and default
   startup selection is defined by [ADR
   0108](decisions/0108-default-packaged-v2-startup.md), and the
   native status-item menu projection is implemented under [ADR
   0101](decisions/0101-native-menu-bar-registration.md), and the toast
   lifecycle/action presentation is now implemented under [ADR
   0102](decisions/0102-v2-toast-lifecycle-presentation.md), and scene
   icon/image source presentation is now implemented under [ADR
   0103](decisions/0103-v2-scene-icon-source-presentation.md), action chrome
   fidelity is now implemented under [ADR
   0104](decisions/0104-v2-action-chrome-fidelity.md), and supported icon
   mask/tint presentation is now implemented under [ADR
   0105](decisions/0105-v2-icon-mask-and-tint-presentation.md). The first
   application slice in [ADR 0110](decisions/0110-v2-application-boundary-performance-baseline.md)
   is complete, with keyboard command selection and a committed cold/warm
   latency baseline. ADRs 0111 and 0112 define the toast timeout and automatic
   icon contrast policies, and ADR 0113 defines ActionPanel.Submenu
   presentation. ADR 0114 adds on-demand catalog freshness, and ADR 0115
   aligns the managed Node prerequisite with the V2 baseline. Extension
   installation/update UI and internal V2 migration/update flows, remaining
   action helpers/providers, and remaining scene visuals follow; no V1 user
   migration is planned.

Keep WebSocket and remote execution as transport/provider additions. They do not
require changing the session, extension contract, runtime, host, or core
ownership boundaries established here.
