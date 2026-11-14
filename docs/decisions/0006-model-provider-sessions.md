# 0006 — Model provider sessions

Status: accepted 2026-10-18

## Decision

A provider runs in its own Node child using `init.command.mode: model-provider`.
It uses the normal handshake, logging, capabilities and shutdown, but does not
render a React scene. The host bundles the manifest's `ai.modelProvider` entry
with the extension dependency policy.

`provider.getModels`, `provider.stream` and `provider.abort` correlate by id;
the runtime answers models, stream parts, end or typed error messages. Streams
may be async iterables, readable streams, or Raycast text/full streams. Abort
stops host iteration, calls iterator return when available and ignores late
parts. Provider failures reject the request without crashing the command.

`AI.ask` reuses the calling extension's provider and refreshes its model list;
`ai.decide` is denied by default. Attachments use tagged JSON-safe strings,
URLs, bytes or buffers. Provider metadata is projected onto the declared model
shape before wire validation, and icons remain authored image-like JSON.

## Why

Providers need isolation and streaming while sharing the engine's established
transport and shutdown semantics.
