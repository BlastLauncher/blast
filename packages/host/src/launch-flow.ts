import {
  createPromptController,
  type ControllerInput,
  type ControllerOptions,
  type ControllerView,
  type PromptEffect,
  type PromptField,
  type PromptForm,
  type PromptValues,
} from "@blastlauncher/client-core";
import type { Preference } from "./bundle.ts";
import {
  DependenciesRequiredError,
  MissingLaunchValuesError,
  type ExtensionHandle,
  type ExtensionLaunchOptions,
} from "./extension.ts";
import type { ExtensionCommand, ExtensionManifest } from "./extension-manifest.ts";

export type LaunchFlowOptions = {
  /** Platform and appearance of the prompt views. */
  views: Pick<ControllerOptions, "platform" | "appearance">;
  /** Passed to the launch; `argumentValues` seed the form. */
  launch?: ExtensionLaunchOptions;
  /**
   * Show the command's preferences form (every extension and command
   * preference, current values filled in) and save it, without launching.
   */
  configure?: boolean;
  configureScope?: "extension" | "command";
};

type Opened = Awaited<ReturnType<ExtensionHandle["launch"]>>;

/**
 * What the engine does between "launch this command" and "it renders", as
 * views: a form for missing required preferences and arguments, a toast while
 * dependencies install (a failure offers Retry), then the launch itself.
 * `opened` settles with the running command, or with `undefined` when the
 * user cancelled (or, for `configure`, saved or cancelled). Errors that are
 * not about missing values or dependencies reject it.
 */
export type LaunchFlow = {
  view(): ControllerView;
  subscribe(listener: (view: ControllerView) => void): () => void;
  input(input: ControllerInput): void;
  opened: Promise<Opened | undefined>;
  /** Argument values used by the successful launch, for a direct relaunch. */
  argumentValues: Promise<Record<string, string>>;
  /** Stop now; closes the command if it already started. */
  cancel(): void;
};

const ARGUMENT = "argument:";
const field = (preference: Preference): PromptField => ({
  key: preference.name,
  type: preference.type,
  title: preference.title,
  required: preference.required,
  data: preference.data,
  ...(preference.description ? { description: preference.description } : {}),
  ...(preference.placeholder ? { placeholder: preference.placeholder } : {}),
  ...(preference.label ? { label: preference.label } : {}),
});
const initial = (
  fields: Preference[],
  stored: Record<string, string | number | boolean>,
): PromptValues =>
  Object.fromEntries(
    fields.flatMap((preference) => {
      const value = stored[preference.name] ?? preference.default;
      return value === undefined ? [] : [[preference.name, value] as const];
    }),
  );
const argumentFields = (command: ExtensionCommand): PromptField[] =>
  command.arguments.map((argument) => ({
    key: `${ARGUMENT}${argument.name}`,
    type: argument.type === "password" ? "password" : argument.type,
    title: argument.name,
    required: argument.required,
    data: argument.data,
    ...(argument.placeholder ? { placeholder: argument.placeholder } : {}),
  }));
const lastLine = (message: string) =>
  message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)
    ?.slice(0, 200);

export function startLaunchFlow(
  handle: ExtensionHandle,
  commandName: string,
  options: LaunchFlowOptions,
): LaunchFlow {
  const prompt = createPromptController(options.views);
  let cancelled = false;
  let waiting: ((effect: PromptEffect) => void) | undefined;
  let running: Opened | undefined;
  const argumentResult = Promise.withResolvers<Record<string, string>>();

  const ask = (): Promise<PromptEffect> =>
    cancelled
      ? Promise.resolve({ type: "cancel" })
      : new Promise((resolve) => {
          waiting = resolve;
        });
  const cancel = () => {
    cancelled = true;
    const answer = waiting;
    waiting = undefined;
    answer?.({ type: "cancel" });
    argumentResult.resolve({});
    void running?.close();
  };

  const configure = async (manifest: ExtensionManifest, command: ExtensionCommand) => {
    const { values } = await handle.preferences(commandName, options.configureScope);
    const sections = [
      { title: "Extension", fields: manifest.preferences },
      { title: "Command", fields: command.preferences },
    ].filter(
      (section) =>
        section.fields.length &&
        (!options.configureScope ||
          (options.configureScope === "extension" ? section.title === "Extension" : section.title === "Command")),
    );
    const form: PromptForm = {
      title: `Configure ${command.title}`,
      submit: "Save",
      ...(sections.length ? {} : { description: "This command has no preferences." }),
      sections: sections.map((section) => ({
        title: section.title,
        fields: section.fields.map(field),
      })),
      values: initial(
        sections.flatMap((section) => section.fields),
        values,
      ),
    };
    prompt.form(form);
    const effect = await ask();
    if (effect.type === "submit")
      await handle.savePreferences(commandName, effect.values, options.configureScope);
    argumentResult.resolve({});
  };

  const failure = async (title: string, message: string): Promise<boolean> => {
    prompt.status({
      title: commandName,
      toast: { style: "failure", title, message, retry: true },
    });
    return (await ask()).type === "retry";
  };

  const run = async (): Promise<Opened | undefined> => {
    const manifest = await handle.manifest();
    const command = manifest.commands.find((candidate) => candidate.name === commandName);
    if (!command) throw new Error(`Unknown extension command: ${commandName}`);
    if (options.configure) {
      await configure(manifest, command);
      return undefined;
    }
    let argumentValues = { ...options.launch?.argumentValues };
    let installed = false;
    let installNow = false;
    for (;;) {
      if (cancelled) return undefined;
      const { missing, values } = await handle.preferences(commandName);
      const absent = command.arguments.filter(
        (argument) => argument.required && !argumentValues[argument.name],
      );
      if (missing.length || absent.length) {
        const sections = [
          ...(missing.length ? [{ title: "Extension", fields: missing.map(field) }] : []),
          { title: "Arguments", fields: argumentFields(command) },
        ].filter((section) => section.fields.length);
        prompt.form({
          title: `Set up ${command.title}`,
          submit: missing.length ? "Save & Launch" : "Launch",
          description: "These values are required before the command can run.",
          sections,
          values: {
            ...initial(missing, values),
            ...Object.fromEntries(
              Object.entries(argumentValues).map(([name, value]) => [`${ARGUMENT}${name}`, value]),
            ),
          },
        });
        const effect = await ask();
        if (effect.type !== "submit") return undefined;
        const preferences: PromptValues = {};
        for (const [key, value] of Object.entries(effect.values)) {
          if (key.startsWith(ARGUMENT)) {
            if (value !== "")
              argumentValues = { ...argumentValues, [key.slice(ARGUMENT.length)]: String(value) };
          } else preferences[key] = value;
        }
        if (Object.keys(preferences).length) await handle.savePreferences(commandName, preferences);
        continue;
      }

      const status = await handle.dependencies.check();
      if (!installed && (installNow || (status.unresolved.length > 0 && status.installable))) {
        prompt.status({
          title: command.title,
          toast: { style: "animated", title: "Installing dependencies", message: "" },
        });
        try {
          await handle.dependencies.install({
            onLog: (message) => {
              options.launch?.onDependencyLog?.(message);
              const line = lastLine(message);
              if (line && !cancelled)
                prompt.status({
                  title: command.title,
                  toast: { style: "animated", title: "Installing dependencies", message: line },
                });
            },
          });
        } catch (error) {
          if (cancelled) return undefined;
          if (await failure("Could not install dependencies", String((error as Error).message)))
            continue;
          return undefined;
        }
        installed = true;
        installNow = false;
        continue;
      }
      if (cancelled) return undefined;

      try {
        const opened = await handle.launch(commandName, {
          ...options.launch,
          argumentValues,
          installDependencies: false,
        });
        if (cancelled) {
          await opened.close();
          return undefined;
        }
        running = opened;
        argumentResult.resolve({ ...argumentValues });
        return opened;
      } catch (error) {
        if (error instanceof MissingLaunchValuesError) continue;
        if (!(error instanceof DependenciesRequiredError)) throw error;
        // The bundle found an import the check did not: install once, then show why it still fails.
        if (error.installable && !installed) {
          installNow = true;
          continue;
        }
        if (await failure("Missing dependencies", error.message)) {
          installed = false;
          continue;
        }
        return undefined;
      }
    }
  };

  const opened = run();
  return {
    view: () => prompt.view(),
    // Like `Root.subscribe`: the current view first, then every change.
    subscribe(listener) {
      listener(prompt.view());
      return prompt.subscribe(listener);
    },
    input(input) {
      for (const effect of prompt.input(input).effects) {
        if (effect.type === "cancel") cancel();
        else {
          const answer = waiting;
          waiting = undefined;
          answer?.(effect);
        }
      }
    },
    opened,
    argumentValues: argumentResult.promise,
    cancel,
  };
}
