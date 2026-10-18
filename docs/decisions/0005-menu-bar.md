# 0005 — Menu-bar commands in scene snapshots

Status: accepted 2026-10-18

## Decision

Menu-bar commands render directly into the existing scene protocol, without a
Navigation provider. A command returning MenuBarExtra publishes that host root;
returning null removes it. Item, Section, Submenu and deprecated Separator use
their public MenuBarExtra paths. Element-valued `alternate` is a Slot child.
Section boundaries imply separators; an item without onAction and an empty
submenu are disabled. Clients own menu presentation, tooltips and shortcuts.
Alternates inherit their parent's shortcut plus Option; the primary shortcut
has Option removed. Selecting an item sends onAction an event object with type
left-click (including keyboard activation) or right-click. The CLI's action
command sends left-click.

Raycast keeps a command loaded while isLoading is true or a menu is open,
and can unload it once loading finishes and the menu is closed. isLoading
(default false) is preserved in the scene. Blast's current protocol has no
menu-open/closed notification or retained OS menu model, so automatic unloading
is deferred: a headless session stays alive through loading transitions and
null renders until client shutdown or stdin EOF, which unmounts the tree and
ends the process. This preserves callbacks for subsequent headless events.
A desktop client must add open-state reporting and a retained menu snapshot
before implementing Raycast's unload/reload behavior. MenuBarExtra lifecycle
coverage remains partial until then. Menu-bar feedback requiring Navigation
is also deferred; the command has no navigation context.

Manifest interval scheduling and an actual OS menu bar are out of scope.
The host starts a menu-bar session only when explicitly asked; no automatic
background refresh or resident scheduler is introduced.
