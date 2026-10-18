# 0006 — AI model provider sessions

Status: accepted 2026-10-18

## Decision

A provider uses its own Node runtime child with `init.command.mode` set to
`model-provider`. It imports the bundle without rendering a React scene.
The existing handshake, logging, capabilities, environment and shutdown apply.
The host bundles the manifest's `ai.modelProvider` basename from `src/` using
the command dependency policy and assets layout.

At corpus pin `3b812d1e`, Groq and LM Studio declare
`"ai": { "modelProvider": "models" }`. Both `src/models.ts` entries export
named `getModels: AI.GetModels` and `streamCompletion: AI.StreamCompletion`;
there is no required default export. No corpus source is redistributed.

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
or fullStream. String chunks become text-delta parts with textDelta. Other
parts retain the declared JSON union. End is transport completion; text-only
streams do not invent model usage or a finish reason. Icons stay authored
image-like JSON, including source/fallback/theme/mask/tintColor/fileIcon.

Only message attachment file.data needs non-JSON encoding. Each such value
is wrapped as `{ kind, value }`: string/url hold strings (URL.href), bytes/buffer
hold byte arrays. Runtime decoding restores string, URL, Uint8Array or
ArrayBuffer respectively. Tagging strings too avoids ambiguity. Other request
fields and stream parts must be JSON; the NDJSON size limit still applies.

## Consequences

The host API exposes listing and async iteration independently of AI.ask.
Callers own bundle output cleanup after shutdown. No provider registration,
network access grant, desktop picker or AI.ask routing is added here.
