export type PreferenceValue = string | number | boolean;

export type Preference = {
  name: string;
  type: string;
  title: string;
  description?: string;
  placeholder?: string;
  label?: string;
  required: boolean;
  data: { title: string; value: string }[];
  default?: PreferenceValue;
};

const PREFERENCE_TYPES = [
  "appPicker",
  "checkbox",
  "dropdown",
  "password",
  "textfield",
  "file",
  "directory",
];

export function parsePreferences(value: unknown, at = "Preferences"): Preference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${at} must be an array`);
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item))
      throw new Error(`${at} entry ${index + 1} must be an object`);
    const declared = item as Record<string, unknown>;
    const { name, type, default: fallback, description, placeholder, label } = declared;
    if (typeof name !== "string" || !name) throw new Error(`${at} entry ${index + 1} needs a name`);
    if (typeof type !== "string" || !PREFERENCE_TYPES.includes(type))
      throw new Error(
        `Preference ${JSON.stringify(name)} has an unknown type ${JSON.stringify(type)}`,
      );
    if (
      fallback !== undefined &&
      typeof fallback !== "string" &&
      typeof fallback !== "boolean" &&
      !(typeof fallback === "number" && Number.isFinite(fallback))
    )
      throw new Error(`Preference ${JSON.stringify(name)} needs a scalar "default"`);
    if (description !== undefined && typeof description !== "string")
      throw new Error(`Preference ${JSON.stringify(name)} needs a string "description"`);
    return {
      name,
      type,
      title: ((type === "checkbox" ? label : declared.title) as string) || name,
      required: declared.required === true,
      data: Array.isArray(declared.data)
        ? declared.data.filter(
            (option: unknown): option is { value: string; title: string } =>
              !!option &&
              typeof option === "object" &&
              typeof (option as Record<string, unknown>).value === "string" &&
              typeof (option as Record<string, unknown>).title === "string",
          )
        : [],
      ...(typeof description === "string" ? { description } : {}),
      ...(typeof placeholder === "string" ? { placeholder } : {}),
      ...(typeof label === "string" ? { label } : {}),
      ...(fallback === undefined ? {} : { default: fallback }),
    };
  });
}

export function preferenceFields(extension: Preference[], command: Preference[]): Preference[] {
  return [...new Map([...extension, ...command].map((field) => [field.name, field])).values()];
}

export function preferenceDefaults(
  extension: Preference[],
  command: Preference[],
): Record<string, PreferenceValue> {
  return Object.fromEntries(
    preferenceFields(extension, command)
      .filter((field) => field.default !== undefined)
      .map((field) => [field.name, field.default!] as const),
  );
}

export function preferenceValues(
  extension: Record<string, PreferenceValue>,
  commands: Record<string, Record<string, PreferenceValue>>,
  command: string,
): Record<string, PreferenceValue> {
  return { ...extension, ...commands[command] };
}

export function missingPreferences(
  fields: Preference[],
  values: Record<string, unknown>,
): Preference[] {
  return fields.filter(
    (field) =>
      field.required &&
      field.default === undefined &&
      (values[field.name] === undefined || values[field.name] === ""),
  );
}
