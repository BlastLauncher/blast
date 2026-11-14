# 0015 — Web embedding boundary

The `@blastlauncher/web` package is a browser-only embedder. It owns the
browser host wiring and draws views into a page-selected element; it does not
import the Node host engine.

The embedding application hosts the almostnode sandbox files itself. The
package accepts a `sandboxUrl` pointing at those files. `blast.yukai.dev` may
serve them for the public demos, but is not a production dependency.

The sandbox is cross-origin and receives only the command bundle and the
runtime port. Extension code cannot reach the embedding page DOM, globals,
or network credentials. The page receives serialized views and may forward
input through the returned handle.

By default the package answers `storage` with `localStorage` (falling back to
memory when unavailable), `clipboard` through the browser Clipboard API after
permission is granted by the page, and `open.url` with `window.open`. These
handlers are deliberately overridable: `handlers` replaces individual
capabilities and may deny them by returning a rejected or denied result.

`mount(element, options)` starts one extension command, or the client-core
root controller when `root: true`. The default renderer supplies accessible,
themeable HTML; `render` receives every view and input opportunity for a
custom renderer. `close()` tears down the iframe and listeners.
