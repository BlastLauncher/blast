# ADR 0101: Register V2 menu-bar scenes in the native status item

- Status: Accepted
- Date: 2026-08-31

## Context

ADR 0099 makes `menu-bar-extra` scenes executable in the opt-in V2 command
window, but Raycast menu-bar commands are intended to be reachable without
opening that window. The Electron client already owns a persistent `Tray` with
static Show App, development restart, and Quit actions. The remaining client
boundary is to project the validated V2 command snapshot and active menu-bar
scene into that native status-item menu.

## Decision

Add a main-process V2 menu-bar presenter that subscribes to the existing
`CoreClientHost` snapshot stream and updates the Electron `Tray` menu:

- when no menu-bar command is active, expose only catalog commands whose
  `entryPointMode` is `menu-bar`;
- when a menu-bar command is active, project its validated
  `menu-bar-extra` children into native menu items, labeled sections,
  submenus, separators, tooltips, subtitles, and safe keyboard accelerators;
- map normal and alternate item actions to semantic `scene.event` messages,
  preserving alternate actions as an explicit submenu when the native menu
  has no right-click gesture;
- keep command launch and stop operations in the main process through the
  existing host, never exposing sockets, extension paths, or Electron objects
  to the renderer; and
- retain the existing static tray actions after the V2 projection and clear
  the projection when the presenter is disposed.

The scene-to-menu projection is a pure model transformation before the small
Electron adapter. Unsupported or malformed optional presentation values are
omitted rather than allowed to make native menu construction fail. The
existing application tray icon remains the native status-item icon; scene
icon asset resolution is still a renderer concern.

## Boundary

This registers the current V2 menu-bar command surface with Electron's native
status-item menu on supported desktop environments. It does not promise that
every Linux desktop shell exposes a tray area, does not add background
installation or migration, and does not change the V1 default or packaged-mode
opt-in policy.

## Consequences

Menu-bar commands can be launched and used from the OS-owned status menu while
sharing the same lifecycle and event policy as the V2 window. A single native
menu can represent one active menu-bar scene at a time, matching the current
one-active-command core session; other menu-bar commands remain available after
the active command stops. Headless Linux tests verify the deterministic model
and Forge packaging continues to verify the Electron boundary without
requiring a desktop session.

## Verification

- test filtering and ordering of menu-bar command descriptors;
- test scene projection, nested menus, separators, accelerators, and alternate
  actions as a pure model;
- type-check and bundle the Electron client for Linux/arm64; and
- keep the full V2, Electron, lint, and format gates green.
