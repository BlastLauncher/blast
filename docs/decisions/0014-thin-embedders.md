# 0014 — Thin embedders: the engine owns the launcher flow

Status: accepted 2026-11-14; amends 0009 (the picker is no longer the embedder's)

## Decision

1. **Embedders draw and forward; nothing else is required.** A complete
   embedder spawns or imports the engine, draws `ControllerView`s, forwards
   semantic input and answers the capabilities it chose to grant. Everything
   else Raycast does between "user opens the launcher" and "command renders"
   is engine work, exposed through the same view/input contract.
2. **Engine-owned flows**, each delivered as an ordinary view:
   - the root view: search and rank the commands of every opened extension,
     launch on primary, return to it when a command closes;
   - launch prompts: missing required preferences and arguments become a
     form view; submitting saves them and launches;
   - dependency installs: progress and failure as view feedback, then launch.
     Embedders that want their own picker may still call `extension.launch`
     directly; the root view is optional, not mandatory.
3. **Views are the default surface.** Scenes stay available for clients that
   want raw trees, but quickstarts, examples and the browser package use
   views. View fields carry drawable values (resolved icon sources, tints),
   not hints an embedder must reinterpret.
4. **Same contract on every surface.** In-process JS, `blast serve` (protocol
   v1, additive) and the browser package expose the same flows and view
   shapes. A change that needs a breaking wire change goes to `embedder-v2`.
5. **Measured, not claimed.** "Thin" is checked by a minimal stdlib-only
   embedder in a non-JS language that stays small (target ≤ 200 lines) while
   supporting root search, prompts, actions and one capability.

## Why

Every client so far re-implemented the same launcher flow: the TUI picker
(~800 lines), the browser root launcher (~300), the AppKit picker plus
presenter, and preference prompts. Embedding cost hundreds to thousands of
lines per language. The product is the engine; the less an embedder writes,
the more places Blast runs.

## Consequences

- `client-core` grows root, prompt and install states; `serve` and the
  browser package wire them without new client logic.
- Reference clients (TUI, AppKit, browser demo, Go) migrate to the
  engine-owned flows and shrink.
- Docs lead with the view/input contract and a short quickstart per surface.
