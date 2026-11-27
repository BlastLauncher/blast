// Which Alfred object types Blast runs, for measuring real workflows against
// (decision 0021, point 5). `support.test.ts` checks the list against the
// graph executor so it cannot drift.

/** Every `alfred.workflow.*` type the runtime (`runtime.ts`, `graph.ts`) implements. */
export const SUPPORTED_OBJECT_TYPES: readonly string[] = [
  "input.keyword",
  "input.scriptfilter",
  "input.listfilter",
  "trigger.external",
  "userinterface.text",
  "userinterface.grid",
  "utility.junction",
  "utility.argument",
  "utility.conditional",
  "utility.filter",
  "utility.replace",
  "utility.split",
  "utility.transform",
  "utility.json",
  "utility.delay",
  "utility.debug",
  "utility.hidealfred",
  "utility.dialog",
  "action.script",
  "action.openurl",
  "action.openfile",
  "action.revealfile",
  "output.clipboard",
  "output.notification",
  "output.largetype",
  "output.writefile",
  "output.callexternaltrigger",
].map((type) => `alfred.workflow.${type}`);

/**
 * Triggers only Alfred itself can fire. Blast ignores them without harm: the
 * objects they lead to stay reachable through the workflow's other entries.
 */
export const PASSIVE_TRIGGER_TYPES: readonly string[] = [
  "hotkey",
  "universalaction",
  "action",
  "fallback",
  "snippet",
  "remote",
].map((type) => `alfred.workflow.trigger.${type}`);
