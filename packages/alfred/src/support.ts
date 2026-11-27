// Which Alfred object types Blast runs, for measuring real workflows against
// (decision 0021, point 5). `support.test.ts` checks the list against the
// graph executor so it cannot drift.

/** Every `alfred.workflow.*` type the runtime (`runtime.ts`, `graph.ts`) implements. */
export const SUPPORTED_OBJECT_TYPES: readonly string[] = [
  "input.keyword",
  "input.scriptfilter",
  "input.listfilter",
  "input.filefilter",
  "trigger.external",
  "userinterface.text",
  "userinterface.grid",
  "userinterface.image",
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
  "utility.joinargs",
  "utility.random",
  "utility.expression",
  "utility.file",
  "action.script",
  "action.openurl",
  "action.openfile",
  "action.revealfile",
  "action.launchfiles",
  "action.applescript",
  "action.systemwebsearch",
  "automation.runshortcut",
  "output.clipboard",
  "output.notification",
  "output.largetype",
  "output.writefile",
  "output.callexternaltrigger",
  "output.playsound",
  "output.speak",
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

export const AUTOMATION_TASK = "alfred.workflow.automation.task";

/**
 * Automation Tasks are one object type holding many tasks, so support is per
 * `taskuid`: a workflow using an unlisted task is not supported.
 */
export const SUPPORTED_AUTOMATION_TASKS: readonly string[] = [
  ...[
    "path.exists",
    "path.trash",
    "file.read",
    "directory.new",
    "directory.children.sort",
    "directory.children.sort.added.leading.1",
    "finder.move",
    "finder.copy",
    "file.quicklook",
    "file.uti.matching",
    "path.basename",
    "path.dirname",
    "path.extension",
    "path.expand-tilde",
    "path.older-than",
    "path.filter.older-than",
    "path.filter.newer-than",
  ].map((task) => `files-and-folders/${task}`),
  ...[
    "text.lines.trim",
    "text.metrics",
    "text.lines.empty.remove",
    "text.encode.percent",
    "text.decode.percent",
  ].map((task) => `text-processing/${task}`),
  ...[
    "argument.matching",
    "argument.count",
    "argument.randomise",
    "argument.randomise.leading.1",
    "argument.leading.x",
    "argument.strip.trailing.x",
  ].map((task) => `argument-processing/${task}`),
  ...[
    "windows.current.bounds.set.preset",
    "windows.current.bounds",
    "windows.current.bounds.set.custom",
    "windows.current.screen.change",
  ].map((task) => `window-management/${task}`),
  "macOS/app.current",
  "macOS/app.open",
]
  .map((task) => `com.alfredapp.automation.core/${task}`)
  .concat("com.alfredapp.automation.extras/web-browsers/frontmost-browser/frontmost.tabs.current");

export type AlfredObjectSupport = "supported" | "passive" | "unsupported";

/** How Blast treats one workflow object: by type, and for Automation Tasks by `taskuid`. */
export function classifyAlfredObject(object: {
  type: string;
  config?: Record<string, unknown>;
}): AlfredObjectSupport {
  if (object.type === AUTOMATION_TASK) {
    const taskuid = object.config?.taskuid;
    return typeof taskuid === "string" && SUPPORTED_AUTOMATION_TASKS.includes(taskuid.trim())
      ? "supported"
      : "unsupported";
  }
  if (SUPPORTED_OBJECT_TYPES.includes(object.type)) return "supported";
  if (PASSIVE_TRIGGER_TYPES.includes(object.type)) return "passive";
  return "unsupported";
}
