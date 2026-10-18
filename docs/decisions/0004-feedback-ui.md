# 0004 — Feedback in scene snapshots

Status: accepted 2026-10-18

## Decision

Feedback is command-local UI state, carried by existing scene/event messages.
`Navigation` has feedback children after its navigation entries: at most one
`Toast`, one `HUD`, and the first queued `Alert`. Feedback stays visible across
push/pop. No protocol or capability changes are needed.

Toast props carry title, message and style. `Toast.Action` children carry name
(`primaryAction` or `secondaryAction`), title, shortcut and an `onAction`
handler. Calling the handler passes the original Toast instance to the callback.
Showing replaces the current toast; hiding an older toast leaves its replacement
alone. Property mutations publish updates only while that toast is visible.
Show/hide promises settle after a scene commit. There are no automatic timers.

HUD props record title, clearRootSearch and popToRootType. Showing replaces the
previous HUD and resolves after publication. Search clearing, window closing,
popping and automatic dismissal await a desktop client.

Alerts queue in call order. An `Alert` carries title, message, icon and
rememberUserChoice. Its two `Alert.Action` children carry name, title, style
and `onAction`. Dispatching primaryAction resolves true; dismissAction resolves
false. The matching callback runs once; duplicate events cannot answer the
next alert. Default button titles are OK/Cancel, styles default/cancel.
rememberUserChoice is recorded only: persistent confirmation choices and a
settings reset control remain unimplemented, so confirmAlert coverage is partial.

No-view commands lazily mount an empty Navigation scene when feedback is first
requested, so alerts can receive events while the command awaits its result.
Commands without feedback still publish no scenes. Feedback is discarded on
unmount; pending alerts resolve false without invoking callbacks. The CLI's
confirm/dismiss commands dispatch the matching alert action. All feedback is
printed by the normal tree renderer.
