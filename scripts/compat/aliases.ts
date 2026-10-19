import type { Entry } from "./inventory.ts";

// Reviewed runtime identities (or erased launch-prop subsets), not name guesses.
export const STRUCTURAL_ALIASES: Readonly<Record<string, string>> = {
  ActionPanelItem: "Action", // Same callable and convenience actions.
  ArgumentsLaunchProps: "LaunchProps", // Legacy optional arguments subset.
  CopyToClipboardAction: "Action.CopyToClipboard", // Same component and props.
  "Form.DropdownItem": "Form.Dropdown.Item", // Public path for internal DropdownItem.
  "Form.DropdownSection": "Form.Dropdown.Section", // Public path for internal DropdownSection.
  "Form.TagPickerItem": "Form.TagPicker.Item", // Public path for internal TagPickerItem.
  FormLaunchProps: "LaunchProps", // Legacy optional draftValues subset.
  OpenAction: "Action.Open", // Same component and props.
  OpenInBrowserAction: "Action.OpenInBrowser", // Same component and props.
  OpenWithAction: "Action.OpenWith", // Same component and props.
  PasteAction: "Action.Paste", // Same component and props.
  PushAction: "Action.Push", // Same component and props.
  ShowInFinderAction: "Action.ShowInFinder", // Same component and props.
  TrashAction: "Action.Trash", // Same component and props.
};

export function applyStructuralAliases(
  entries: Entry[],
  aliases: Readonly<Record<string, string>>,
) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const errors: string[] = [];
  for (const [alias, target] of Object.entries(aliases)) {
    if (!byPath.has(alias)) errors.push(`missing alias '${alias}'`);
    if (!byPath.has(target)) errors.push(`missing target '${target}' for '${alias}'`);
    if (alias === target || target.startsWith(`${alias}.`))
      errors.push(`invalid alias '${alias}' → '${target}'`);
    for (const member of entries.filter((entry) => entry.path.startsWith(`${alias}.`))) {
      const targetPath = target + member.path.slice(alias.length);
      const match = byPath.get(targetPath);
      if (!match) errors.push(`${member.path} → ${targetPath}: missing member`);
      else if (match.kind !== member.kind)
        errors.push(`${member.path} → ${targetPath}: kind ${member.kind} != ${match.kind}`);
    }
  }
  // Validate the entire map before changing anything: drift must fail generation.
  if (errors.length) throw new Error(`Structural alias mismatches:\n${errors.join("\n")}`);
  for (const [alias, target] of Object.entries(aliases)) byPath.get(alias)!.aliasTarget = target;
}
