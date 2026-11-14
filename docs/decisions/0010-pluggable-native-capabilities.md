# 0010 — Native behaviour is pluggable

Status: accepted 2026-10-19; refines 0001 and 0009

## Decision

The engine core has no OS-specific behaviour. Embedders register capability
handlers by name and may override them per extension or launch; unregistered
capabilities remain denied. The protocol catalog defines every name, scope and
params/result shape, and tests reject runtime requests absent from the catalog.

`@blastlauncher/native` is an optional package implementing clipboard, open,
file manager, trash, applications, selection and window capabilities on macOS,
Windows and Linux through injectable system-tool commands. The CLI and TUI are
reference clients that register their own handlers.

## Why

Embedders already own their platform layer. Keeping it outside the engine makes
the core portable while preserving a working native integration.

## Consequences

Native failures name the missing tool or platform limitation. Platform checks
and real-OS validation belong in the native package, not engine verification.
