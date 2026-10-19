// Pure command-picker logic: manifest parsing, row text, filtering and the
// required-argument check. The view lives in picker.tsx.

export type PickerMode = "view" | "no-view" | "menu-bar";
export type PickerOption = { title: string; value: string };
export type PickerArgument = {
  name: string;
  type: "text" | "password" | "dropdown";
  /** A required argument must be filled before Enter launches the command. */
  required: boolean;
  placeholder: string;
  /** A dropdown argument's options, in declaration order. */
  data: PickerOption[];
};
export type PickerCommand = {
  name: string;
  title: string;
  subtitle: string;
  description: string;
  mode: PickerMode;
  arguments: PickerArgument[];
};
export type Manifest = { name: string; title: string; commands: PickerCommand[] };

const MODES: PickerMode[] = ["view", "no-view", "menu-bar"];
const ARGUMENT_TYPES = ["text", "password", "dropdown"];

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Parses a package.json value into picker rows. Structural problems (bad
 * JSON aside) throw with a readable message: the picker shows the error and
 * keeps its last good list instead of launching something unusable.
 */
export function parseManifest(value: unknown): Manifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("manifest must be an object");
  const manifest = value as Record<string, unknown>;
  const name = string(manifest.name);
  if (!name) throw new Error('manifest needs a string "name"');
  if (!Array.isArray(manifest.commands)) throw new Error('manifest needs a "commands" array');
  return {
    name,
    title: string(manifest.title) || name,
    commands: manifest.commands.map(parseCommand),
  };
}

function parseCommand(value: unknown, index: number): PickerCommand {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`command ${index + 1} must be an object`);
  const command = value as Record<string, unknown>;
  const name = string(command.name);
  if (!name) throw new Error(`command ${index + 1} needs a name`);
  const mode = command.mode === undefined ? "view" : command.mode;
  if (typeof mode !== "string" || !MODES.includes(mode as PickerMode))
    throw new Error(`command ${JSON.stringify(name)} has an unknown mode`);
  return {
    name,
    title: string(command.title) || name,
    subtitle: string(command.subtitle),
    description: string(command.description),
    mode: mode as PickerMode,
    arguments: Array.isArray(command.arguments) ? command.arguments.map(parseArgument) : [],
  };
}

function parseArgument(value: unknown, index: number): PickerArgument {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`argument ${index + 1} must be an object`);
  const argument = value as Record<string, unknown>;
  const name = string(argument.name);
  if (!name) throw new Error(`argument ${index + 1} needs a name`);
  const type = string(argument.type);
  if (!ARGUMENT_TYPES.includes(type))
    throw new Error(`argument ${JSON.stringify(name)} has an unknown type ${JSON.stringify(type)}`);
  const data = Array.isArray(argument.data)
    ? argument.data.map(parseOption).filter((option) => option !== undefined)
    : [];
  return {
    name,
    type: type as PickerArgument["type"],
    required: argument.required === true,
    placeholder: string(argument.placeholder),
    data,
  };
}

function parseOption(value: unknown): PickerOption | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const option = value as Record<string, unknown>;
  const optionValue = string(option.value);
  if (!optionValue) return undefined;
  return { title: string(option.title) || optionValue, value: optionValue };
}

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

/** Required argument names that the form has not filled yet. */
export function missingRequired(args: PickerArgument[], values: Record<string, string>): string[] {
  return args
    .filter((argument) => argument.required && (values[argument.name] ?? "") === "")
    .map((argument) => argument.name);
}
