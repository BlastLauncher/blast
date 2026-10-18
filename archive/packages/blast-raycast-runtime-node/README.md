# `@blastlauncher/raycast-runtime-node`

Packaged Node.js composition for the measured Raycast-compatible Blast V2
runtime.

The package combines `@blastlauncher/extension-runtime-node` with
`@blastlauncher/raycast-compat`. Its build emits `dist/v2-bootstrap.cjs`, a
fixed stdio child-process bootstrap, and `dist/v2-raycast-api.cjs`, the
explicit `@raycast/api` alias used while extension entrypoints are bundled.
Both resources keep React external so the bootstrap and extension components
share one runtime instance. The Electron Forge configuration copies these
resources and the React package into the app resources for the explicit
`BLAST_V2_MODE=packaged` path.

The bootstrap reads optional `BLAST_V2_VENDOR_ROOTS` and
`BLAST_EXTENSION_BUNDLE_PREFIX` values from its child environment. It never
installs dependencies or chooses an extension; the trusted core catalog still
supplies the descriptor and entrypoint.

This package may use Node.js and React at the composition boundary. It does
not depend on Electron, the prototype runtime, or a concrete client window.
