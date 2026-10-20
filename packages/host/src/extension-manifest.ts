import { parsePreferences, type Preference } from "./bundle.ts";

export type ExtensionMode = "view" | "no-view" | "menu-bar";
export type ExtensionOption = { title: string; value: string };
export type ExtensionArgument = {
  name: string;
  type: "text" | "password" | "dropdown";
  /** A required argument must be filled before Enter launches the command. */
  required: boolean;
  placeholder: string;
  /** A dropdown argument's options, in declaration order. */
  data: ExtensionOption[];
};
export type ExtensionCommand = {
  name: string;
  title: string;
  subtitle: string;
  description: string;
  mode: ExtensionMode;
  arguments: ExtensionArgument[];
  preferences: Preference[];
};
export type ExtensionManifest = {
  name: string;
  title: string;
  preferences: Preference[];
  commands: ExtensionCommand[];
};

const MODES: ExtensionMode[] = ["view", "no-view", "menu-bar"];
const ARGUMENT_TYPES = ["text", "password", "dropdown"];

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Validates manifest metadata shared by embedders and reference clients. */
export function parseManifest(value: unknown): ExtensionManifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("manifest must be an object");
  const manifest = value as Record<string, unknown>;
  const name = string(manifest.name);
  if (!name) throw new Error('manifest needs a string "name"');
  if (!Array.isArray(manifest.commands)) throw new Error('manifest needs a "commands" array');
  return {
    name,
    title: string(manifest.title) || name,
    preferences: parsePreferences(manifest.preferences),
    commands: manifest.commands.map(parseCommand),
  };
}

function parseCommand(value: unknown, index: number): ExtensionCommand {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`command ${index + 1} must be an object`);
  const command = value as Record<string, unknown>;
  const name = string(command.name);
  if (!name) throw new Error(`command ${index + 1} needs a name`);
  const mode = command.mode === undefined ? "view" : command.mode;
  if (typeof mode !== "string" || !MODES.includes(mode as ExtensionMode))
    throw new Error(`command ${JSON.stringify(name)} has an unknown mode`);
  return {
    name,
    title: string(command.title) || name,
    subtitle: string(command.subtitle),
    description: string(command.description),
    mode: mode as ExtensionMode,
    preferences: parsePreferences(command.preferences),
    arguments: Array.isArray(command.arguments) ? command.arguments.map(parseArgument) : [],
  };
}

function parseArgument(value: unknown, index: number): ExtensionArgument {
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
    type: type as ExtensionArgument["type"],
    required: argument.required === true,
    placeholder: string(argument.placeholder),
    data,
  };
}

function parseOption(value: unknown): ExtensionOption | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const option = value as Record<string, unknown>;
  const optionValue = string(option.value);
  if (!optionValue) return undefined;
  return { title: string(option.title) || optionValue, value: optionValue };
}

/** Required argument names that the form has not filled yet. */
export function missingRequired(
  args: ExtensionArgument[],
  values: Record<string, string>,
): string[] {
  return args
    .filter((argument) => argument.required && (values[argument.name] ?? "") === "")
    .map((argument) => argument.name);
}
