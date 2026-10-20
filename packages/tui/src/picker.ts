import type {
  ExtensionCommand as PickerCommand,
  ExtensionMode as PickerMode,
} from "@blastlauncher/host";

/** Case-insensitive match on title, subtitle and name, like the List view. */
export function filterCommands(commands: PickerCommand[], query: string): PickerCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  return commands.filter((command) =>
    [command.title, command.subtitle, command.name].some((value) =>
      value.toLowerCase().includes(needle),
    ),
  );
}

export function modeLabel(mode: PickerMode): string {
  switch (mode) {
    case "view":
      return "Command";
    case "no-view":
      return "No View";
    case "menu-bar":
      return "Menu Bar";
  }
}

/** One picker row: title, then subtitle (else description), then the mode. */
export function commandRow(command: PickerCommand): string {
  return [command.title, command.subtitle || command.description, modeLabel(command.mode)]
    .filter(Boolean)
    .join("  ");
}
