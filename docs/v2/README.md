# Blast V2 product direction

## Mission

Blast keeps open-source launcher extensions useful by providing a small, open,
portable host for Raycast-compatible commands.

The launcher is the first client of the runtime, not the runtime itself. A
future desktop, terminal, web, remote, or mobile client should be able to speak
the same protocol without becoming part of the extension process.

## Product promise

Blast will:

- run a useful, explicitly documented subset of existing Raycast extensions;
- make compatibility measurable at the command and API level;
- isolate extension failures from the launcher and other extensions;
- broker privileged host operations through declared capabilities;
- keep extension installation, diagnostics, patches, and upgrades inspectable;
- provide an open protocol that does not require the Electron client.

Blast will not initially attempt to reproduce every built-in Raycast feature.
AI chat, cloud sync, teams, notes, window management, and an advanced extension
store are not requirements for the first V2 release. They can be clients,
capability providers, or extensions later.

## Principles

### Compatibility is evidence

Compatibility is a report, not a binary marketing label. A scanner and test
harness will measure which APIs each extension uses and whether its commands
start, render, receive events, and call host capabilities successfully.

Unsupported APIs must fail with structured diagnostics. Extension-specific
workarounds should be reviewable compatibility patches rather than invisible
branches in the host.

### Keep the core narrow

The core owns extension discovery, lifecycle, protocol sessions, permissions,
and capability routing. Search, user interface, stores, and operating-system
integrations live outside the core.

### Preserve user choice

Extension source, manifests, preferences, compatibility patches, and diagnostic
output should remain inspectable and portable. No essential local workflow may
depend on a proprietary Blast service.

### Agents use public control surfaces

An agent should use the same versioned CLI and protocol available to a person.
Mutating operations must support preview, explicit authorization where needed,
structured results, and rollback. Agent support does not grant extensions or
agents ambient access to the desktop.

## First compatibility target

The first vertical slice will run a real extension command that:

1. is discovered from its manifest;
2. starts in a dedicated extension process;
3. negotiates a protocol version with the host;
4. renders a list and an action in the desktop client;
5. sends the action event back to the extension;
6. requests clipboard access through the capability broker;
7. produces structured logs and survives an extension crash.

After that slice works, an API-usage census of the public extension corpus will
determine which compatibility APIs are implemented next.

## Success measures

- cold and warm command-start latency are recorded on reference hardware;
- idle memory is measured separately for the client, core, and extension hosts;
- the compatibility report names tested extensions, commands, and API coverage;
- an extension crash does not terminate the core or desktop client;
- no extension receives an undeclared privileged capability;
- at least one extension can render through a second client or test renderer.
