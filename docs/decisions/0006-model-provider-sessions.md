# 0006 — AI model provider sessions

Status: accepted 2026-10-18

A provider uses its own Node runtime child (`init.command.mode: model-provider`),
importing the bundle without rendering a React scene.
The existing handshake, logging, capabilities, environment and shutdown apply.
The host bundles the manifest's `ai.modelProvider` basename from `src/` using
the command dependency policy and assets layout.

At corpus pin `3b812d1e`, Groq and LM Studio declare
`"ai": { "modelProvider": "models" }`. Both `src/models.ts` entries export
named `getModels: AI.GetModels` and `streamCompletion: AI.StreamCompletion`.
No default export is required. No corpus source is redistributed.

Host → runtime messages:

- `provider.getModels { id }`
- `provider.stream { id, model, request }`
- `provider.abort { id }`

Runtime → host messages:

- `provider.models { id, models }`
- `provider.part { id, part }`
- `provider.end { id }`
- `provider.error { id, error: { code, message } }`

IDs correlate concurrent requests. A models response completes a listing;
end completes a stream; error rejects either. Provider errors are nonfatal.
Missing named exports fail startup loading. Child exit rejects pending work.
Abort immediately stops host iteration and runtime publication, calls iterator
return when available and ignores late parts. Providers receive the declared
request shape (no AbortSignal field); a blocked producer may continue until
shutdown, which has the existing bounded kill escalation.

Streams may be direct AsyncIterables/ReadableStreams or wrapped in textStream
or fullStream. Strings become text-delta parts with textDelta; other parts retain
the declared union. End completes transport without inventing usage or a finish
reason. Icons stay authored
image-like JSON, including source/fallback/theme/mask/tintColor/fileIcon.

Only message attachment file.data needs non-JSON encoding. Each such value
is wrapped as `{ kind, value }`: string/url hold strings (URL.href), bytes/buffer
hold byte arrays. Runtime decoding restores string, URL, Uint8Array or
ArrayBuffer respectively. Tagging strings too avoids ambiguity. Other request
fields and stream parts must be JSON; the NDJSON size limit still applies.

AI.ask with `{ id }` lazily starts and reuses the calling extension's provider;
ai.models.refresh re-lists it (no provider means no-op). Both need no grant.
capability.progress { id, value } carries text chunks before the final result;
capability.cancel { id } aborts host iteration. Command exit stops its provider
and removes its bundle. Other callers own bundle cleanup after shutdown.
User prompts become one user message containing a text part. Creativity maps
to temperature: none/low/medium/high/maximum → 0/0.5/1/1.5/2; numeric values
clamp to [0, 2], omission leaves it unset. Provider metadata is projected onto
RegisteredModel fields before strict wire validation. ai.decide is denied by
default; runtime validates supplied answers against the submitted questions.
