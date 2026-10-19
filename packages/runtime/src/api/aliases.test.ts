import { expect, test } from "bun:test";
import * as api from "./index.ts";

// @covers ActionPanelItem
// @covers ActionPanelSection
// @covers ActionPanelSubmenu
// @covers AlertActionStyle
// @covers CopyToClipboardAction
// @covers FormCheckbox
// @covers FormDatePicker
// @covers FormDropdown
// @covers FormDropdownItem
// @covers FormDropdownSection
// @covers FormSeparator
// @covers FormTagPicker
// @covers FormTagPickerItem
// @covers FormTextArea
// @covers FormTextField
// @covers ImageMask
// @covers ListItem
// @covers ListSection
// @covers OpenAction
// @covers OpenInBrowserAction
// @covers OpenWithAction
// @covers PasteAction
// @covers PushAction
// @covers ShowInFinderAction
// @covers SubmitFormAction
// @covers ToastStyle
// @covers TrashAction
// @covers allLocalStorageItems
// @covers clearClipboard
// @covers clearLocalStorage
// @covers copyTextToClipboard
// @covers getLocalStorageItem
// @covers pasteText
// @covers removeLocalStorageItem
// @covers setLocalStorageItem
// @covers unstable_AI
test("deprecated value aliases share the public modern identity", () => {
  expect(api.ActionPanelItem).toBe(api.Action);
  expect(api.ActionPanelSection).toBe(api.ActionPanel.Section);
  expect(api.ActionPanelSubmenu).toBe(api.ActionPanel.Submenu);
  expect(api.AlertActionStyle).toBe(api.Alert.ActionStyle);
  expect(api.CopyToClipboardAction).toBe(api.Action.CopyToClipboard);
  expect(api.FormCheckbox).toBe(api.Form.Checkbox);
  expect(api.FormDatePicker).toBe(api.Form.DatePicker);
  expect(api.FormDropdown).toBe(api.Form.Dropdown);
  expect(api.FormDropdownItem).toBe(api.Form.Dropdown.Item);
  expect(api.FormDropdownSection).toBe(api.Form.Dropdown.Section);
  expect(api.FormSeparator).toBe(api.Form.Separator);
  expect(api.FormTagPicker).toBe(api.Form.TagPicker);
  expect(api.FormTagPickerItem).toBe(api.Form.TagPicker.Item);
  expect(api.FormTextArea).toBe(api.Form.TextArea);
  expect(api.FormTextField).toBe(api.Form.TextField);
  expect(api.ImageMask).toBe(api.Image.Mask);
  expect(api.ListItem).toBe(api.List.Item);
  expect(api.ListSection).toBe(api.List.Section);
  expect(api.OpenAction).toBe(api.Action.Open);
  expect(api.OpenInBrowserAction).toBe(api.Action.OpenInBrowser);
  expect(api.OpenWithAction).toBe(api.Action.OpenWith);
  expect(api.PasteAction).toBe(api.Action.Paste);
  expect(api.PushAction).toBe(api.Action.Push);
  expect(api.ShowInFinderAction).toBe(api.Action.ShowInFinder);
  expect(api.SubmitFormAction).toBe(api.Action.SubmitForm);
  expect(api.ToastStyle).toBe(api.Toast.Style);
  expect(api.TrashAction).toBe(api.Action.Trash);
  expect(api.allLocalStorageItems).toBe(api.LocalStorage.allItems);
  expect(api.clearClipboard).toBe(api.Clipboard.clear);
  expect(api.clearLocalStorage).toBe(api.LocalStorage.clear);
  expect(api.copyTextToClipboard).toBe(api.Clipboard.copy);
  expect(api.getLocalStorageItem).toBe(api.LocalStorage.getItem);
  expect(api.pasteText).toBe(api.Clipboard.paste);
  expect(api.removeLocalStorageItem).toBe(api.LocalStorage.removeItem);
  expect(api.setLocalStorageItem).toBe(api.LocalStorage.setItem);
  expect(api.unstable_AI).toBe(api.AI);
});

// @covers specialKeys
// @covers specialKeys.return
// @covers specialKeys.delete
// @covers specialKeys.deleteForward
// @covers specialKeys.tab
// @covers specialKeys.arrowUp
// @covers specialKeys.arrowDown
// @covers specialKeys.arrowLeft
// @covers specialKeys.arrowRight
// @covers specialKeys.pageUp
// @covers specialKeys.pageDown
// @covers specialKeys.home
// @covers specialKeys.end
// @covers specialKeys.space
// @covers specialKeys.escape
// @covers specialKeys.enter
// @covers specialKeys.backspace
test("legacy special keys are literal key strings", () => {
  expect(Object.keys(api.specialKeys)).toHaveLength(16);
  for (const [key, value] of Object.entries(api.specialKeys)) expect(value).toBe(key);
});

function sameType<A, B extends A>(assign: (value: A) => B) {
  expect(assign).toBeFunction();
}

// @covers ActionPanelChildren
// @covers ActionPanelItemProps
// @covers ActionPanelProps
// @covers ActionPanelSectionChildren
// @covers ActionPanelSectionProps
// @covers ActionPanelSubmenuProps
// @covers AlertActionOptions
// @covers AlertOptions
// @covers ColorLike
// @covers CopyToClipboardActionProps
// @covers DetailProps
// @covers DynamicColor
// @covers FormCheckboxProps
// @covers FormDatePickerProps
// @covers FormDropdownItemProps
// @covers FormDropdownProps
// @covers FormDropdownSectionProps
// @covers FormItemProps
// @covers FormProps
// @covers FormSeparatorProps
// @covers FormTagPickerItemProps
// @covers FormTagPickerProps
// @covers FormTextAreaProps
// @covers FormTextFieldProps
// @covers FormValue
// @covers FormValues
// @covers ImageLike
// @covers ImageSource
// @covers KeyEquivalent
// @covers KeyModifier
// @covers KeyboardShortcut
// @covers ListItemProps
// @covers ListProps
// @covers ListSectionProps
// @covers LocalStorageValue
// @covers LocalStorageValues
// @covers OpenActionProps
// @covers OpenInBrowserActionProps
// @covers OpenWithActionProps
// @covers PasteActionProps
// @covers PushActionProps
// @covers ShowInFinderActionProps
// @covers SubmitFormActionProps
// @covers ToastActionOptions
// @covers ToastOptions
// @covers TrashActionProps
test("deprecated type aliases accept assignments in both directions", () => {
  sameType<api.ActionPanelChildren, import("react").ReactNode>((value) => value);
  sameType<api.ActionPanelItemProps, import("./action.ts").ActionProps>((value) => value);
  sameType<api.ActionPanelProps, import("./action-panel.ts").ActionPanelProps>((value) => value);
  sameType<api.ActionPanelSectionChildren, import("react").ReactNode>((value) => value);
  sameType<api.ActionPanelSectionProps, import("./action-panel.ts").ActionPanelSectionProps>(
    (value) => value,
  );
  sameType<api.ActionPanelSubmenuProps, import("./action-panel.ts").ActionPanelSubmenuProps>(
    (value) => value,
  );
  sameType<api.AlertActionOptions, import("./feedback.ts").AlertActionOptions>((value) => value);
  sameType<api.AlertOptions, import("./feedback.ts").AlertOptions>((value) => value);
  sameType<api.ColorLike, import("./types.ts").ColorLike>((value) => value);
  sameType<api.CopyToClipboardActionProps, import("./action.ts").CopyToClipboardProps>(
    (value) => value,
  );
  sameType<api.DetailProps, import("./detail.ts").DetailProps>((value) => value);
  sameType<api.DynamicColor, import("./types.ts").ColorDynamic>((value) => value);
  sameType<api.FormCheckboxProps, import("./form.ts").FormCheckboxProps>((value) => value);
  sameType<api.FormDatePickerProps, import("./form.ts").FormDatePickerProps>((value) => value);
  sameType<api.FormDropdownItemProps, import("./form.ts").FormDropdownItemProps>((value) => value);
  sameType<api.FormDropdownProps, import("./form.ts").FormDropdownProps>((value) => value);
  sameType<api.FormDropdownSectionProps, import("./form.ts").FormDropdownSectionProps>(
    (value) => value,
  );
  sameType<api.FormItemProps<string>, import("./form.ts").FormItemProps<string>>((value) => value);
  sameType<api.FormProps, import("./form.ts").FormProps>((value) => value);
  sameType<api.FormSeparatorProps, Record<string, never>>((value) => value);
  sameType<api.FormTagPickerItemProps, import("./form.ts").FormTagPickerItemProps>(
    (value) => value,
  );
  sameType<api.FormTagPickerProps, import("./form.ts").FormTagPickerProps>((value) => value);
  sameType<api.FormTextAreaProps, import("./form.ts").FormTextAreaProps>((value) => value);
  sameType<api.FormTextFieldProps, import("./form.ts").FormTextFieldProps>((value) => value);
  sameType<api.FormValue, import("./form.ts").FormValue>((value) => value);
  sameType<api.FormValues, import("./form.ts").FormValues>((value) => value);
  sameType<api.ImageLike, import("./types.ts").ImageLike>((value) => value);
  sameType<api.ImageSource, import("./types.ts").ImageSource>((value) => value);
  sameType<api.KeyEquivalent, import("./keyboard.ts").KeyEquivalent>((value) => value);
  sameType<api.KeyModifier, import("./keyboard.ts").KeyModifier>((value) => value);
  sameType<api.KeyboardShortcut, import("./types.ts").Shortcut>((value) => value);
  sameType<api.ListItemProps, import("./list.ts").ListItemProps>((value) => value);
  sameType<api.ListProps, import("./list.ts").ListProps>((value) => value);
  sameType<api.ListSectionProps, import("./list.ts").ListSectionProps>((value) => value);
  sameType<api.LocalStorageValue, import("./storage.ts").LocalStorageValue>((value) => value);
  sameType<api.LocalStorageValues, import("./storage.ts").LocalStorageValues>((value) => value);
  sameType<api.OpenActionProps, import("./action.ts").OpenProps>((value) => value);
  sameType<api.OpenInBrowserActionProps, import("./action.ts").OpenInBrowserProps>(
    (value) => value,
  );
  sameType<api.OpenWithActionProps, import("./action.ts").OpenWithProps>((value) => value);
  sameType<api.PasteActionProps, import("./action.ts").PasteProps>((value) => value);
  sameType<api.PushActionProps, import("./action.ts").PushProps>((value) => value);
  sameType<api.ShowInFinderActionProps, import("./action.ts").ShowInFinderProps>((value) => value);
  sameType<api.SubmitFormActionProps, import("./form.ts").SubmitFormProps>((value) => value);
  sameType<api.ToastActionOptions, import("./feedback.ts").ToastActionOptions>((value) => value);
  sameType<api.ToastOptions, import("./feedback.ts").ToastOptions>((value) => value);
  sameType<api.TrashActionProps, import("./action.ts").TrashProps>((value) => value);
});

// @covers ActionPanel.Item
// @covers Form.DropdownItem
// @covers Form.DropdownSection
// @covers Form.TagPickerItem
test("nested deprecated members share public target identities", () => {
  expect(api.ActionPanel.Item).toBe(api.Action);
  expect(api.Form.DropdownItem).toBe(api.Form.Dropdown.Item);
  expect(api.Form.DropdownSection).toBe(api.Form.Dropdown.Section);
  expect(api.Form.TagPickerItem).toBe(api.Form.TagPicker.Item);
});

// @covers ArgumentsLaunchProps
// @covers FormLaunchProps
test("legacy launch props accept the modern launch values and preserve their optional subsets", () => {
  sameType<api.ArgumentsLaunchProps, Partial<Pick<api.LaunchProps, "arguments">>>((value) => value);
  sameType<api.FormLaunchProps, Pick<api.LaunchProps, "draftValues">>((value) => value);
  const launch: api.LaunchProps = { arguments: { name: "Blast" }, launchType: "userInitiated" };
  const args: api.ArgumentsLaunchProps = launch;
  const form: api.FormLaunchProps = launch;
  expect(args.arguments).toEqual({ name: "Blast" });
  expect(form.draftValues).toBeUndefined();
  const emptyArgs: api.ArgumentsLaunchProps = {};
  const emptyForm: api.FormLaunchProps = {};
  expect(emptyArgs.arguments).toBeUndefined();
  expect(emptyForm.draftValues).toBeUndefined();
});
