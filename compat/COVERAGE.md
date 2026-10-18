# Raycast API coverage

Denominator: the `@raycast/api@2.8.2` declarations. Evidence:
`// @covers` tags in `packages/**/*.test.ts(x)`. A parent is not implied covered
by its children. Partial support is reported separately from covered.

**Non-deprecated coverage: 671/1534 covered (43.7%), 17 partial, 846 missing.**
Deprecated: 17/939 covered (1.8%), 4 partial, 918 missing.

## Totals

| Status | Non-deprecated | Deprecated | All |
| --- | --- | --- | --- |
| covered | 671 | 17 | 688 |
| partial | 17 | 4 | 21 |
| missing | 846 | 918 | 1764 |

## Totals by kind

| Kind | Covered | Partial | Missing | Total |
| --- | --- | --- | --- | --- |
| namespace | 2 | 1 | 6 | 9 |
| component | 16 | 14 | 86 | 116 |
| function | 3 | 3 | 44 | 50 |
| const | 1 | 1 | 19 | 21 |
| class | 1 | 0 | 2 | 3 |
| enum | 6 | 0 | 7 | 13 |
| enum-member | 499 | 0 | 192 | 691 |
| interface | 4 | 1 | 59 | 64 |
| type | 15 | 0 | 163 | 178 |
| property | 138 | 1 | 1165 | 1304 |
| method | 3 | 0 | 21 | 24 |

## Top-level symbols

Children counts include all descendants, as covered/partial/total.

| Symbol | Kind | Status | Children | Extensions |
| --- | --- | --- | --- | --- |
| `AI` | namespace | missing | 0/0/266 | 115 |
| `Action` | component | partial | 29/3/110 | 2985 |
| `ActionPanel` | component | partial | 4/2/129 | 3023 |
| `ActionPanelChildren` | type | missing | 0/0/0 | 0 |
| `ActionPanelItem` | component | partial | 0/0/104 | 1 |
| `ActionPanelItemProps` | interface | missing | 0/0/7 | 0 |
| `ActionPanelProps` | interface | missing | 0/0/2 | 0 |
| `ActionPanelSection` | component | missing | 0/0/3 | 0 |
| `ActionPanelSectionChildren` | type | missing | 0/0/0 | 0 |
| `ActionPanelSectionProps` | interface | missing | 0/0/2 | 0 |
| `ActionPanelState` | interface | missing | 0/0/1 | 0 |
| `ActionPanelSubmenu` | component | missing | 0/0/13 | 0 |
| `ActionPanelSubmenuProps` | interface | missing | 0/0/12 | 0 |
| `Alert` | namespace | covered | 13/1/15 | 718 |
| `AlertActionOptions` | interface | missing | 0/0/3 | 0 |
| `AlertActionStyle` | enum | covered | 3/0/3 | 1 |
| `AlertOptions` | interface | missing | 0/0/6 | 0 |
| `Application` | interface | missing | 0/0/5 | 119 |
| `ArgumentsLaunchProps` | interface | missing | 0/0/1 | 1 |
| `BrowserExtension` | namespace | missing | 0/0/8 | 62 |
| `Cache` | class | missing | 0/0/17 | 333 |
| `Clipboard` | namespace | partial | 1/0/16 | 1049 |
| `Color` | enum | covered | 9/0/22 | 1420 |
| `ColorLike` | type | missing | 0/0/3 | 0 |
| `CopyToClipboardAction` | component | partial | 0/0/8 | 23 |
| `CopyToClipboardActionProps` | interface | missing | 0/0/7 | 0 |
| `Detail` | component | partial | 32/0/33 | 1310 |
| `DetailProps` | interface | missing | 0/0/5 | 0 |
| `DynamicColor` | type | missing | 0/0/3 | 0 |
| `Environment` | interface | missing | 0/0/17 | 2 |
| `FileIcon` | interface | missing | 0/0/1 | 1 |
| `FileSystemItem` | interface | missing | 0/0/1 | 10 |
| `Form` | component | missing | 0/0/213 | 1362 |
| `FormCheckbox` | const | missing | 0/0/2 | 0 |
| `FormCheckboxProps` | interface | missing | 0/0/12 | 0 |
| `FormDatePicker` | const | missing | 0/0/2 | 0 |
| `FormDatePickerProps` | interface | missing | 0/0/14 | 0 |
| `FormDropdown` | const | missing | 0/0/2 | 0 |
| `FormDropdownItem` | const | missing | 0/0/0 | 0 |
| `FormDropdownItemProps` | interface | missing | 0/0/4 | 0 |
| `FormDropdownProps` | interface | missing | 0/0/18 | 0 |
| `FormDropdownSection` | const | missing | 0/0/0 | 0 |
| `FormDropdownSectionProps` | interface | missing | 0/0/2 | 0 |
| `FormItemProps` | interface | missing | 0/0/11 | 0 |
| `FormLaunchProps` | interface | missing | 0/0/1 | 0 |
| `FormProps` | interface | missing | 0/0/6 | 0 |
| `FormSeparator` | component | missing | 0/0/1 | 0 |
| `FormSeparatorProps` | interface | missing | 0/0/0 | 0 |
| `FormTagPicker` | const | missing | 0/0/2 | 0 |
| `FormTagPickerItem` | const | missing | 0/0/0 | 0 |
| `FormTagPickerItemProps` | interface | missing | 0/0/3 | 0 |
| `FormTagPickerProps` | interface | missing | 0/0/13 | 0 |
| `FormTextArea` | const | missing | 0/0/2 | 0 |
| `FormTextAreaProps` | interface | missing | 0/0/13 | 0 |
| `FormTextField` | const | missing | 0/0/2 | 0 |
| `FormTextFieldProps` | interface | missing | 0/0/12 | 0 |
| `FormValue` | type | missing | 0/0/0 | 2 |
| `FormValues` | interface | missing | 0/0/0 | 1 |
| `Grid` | component | missing | 0/0/87 | 311 |
| `Icon` | enum | covered | 478/0/478 | 2587 |
| `Image` | interface | missing | 0/0/21 | 478 |
| `ImageLike` | type | missing | 0/0/5 | 2 |
| `ImageMask` | enum | missing | 0/0/2 | 8 |
| `ImageSource` | type | missing | 0/0/2 | 0 |
| `KeyEquivalent` | type | missing | 0/0/0 | 4 |
| `KeyModifier` | type | missing | 0/0/0 | 0 |
| `Keyboard` | namespace | covered | 19/0/32 | 790 |
| `KeyboardShortcut` | type | missing | 0/0/11 | 1 |
| `LaunchProps` | type | missing | 0/0/5 | 657 |
| `LaunchType` | enum | missing | 0/0/2 | 454 |
| `List` | component | partial | 56/3/122 | 2604 |
| `ListItem` | component | missing | 0/0/52 | 1 |
| `ListItemProps` | interface | missing | 0/0/19 | 0 |
| `ListProps` | interface | missing | 0/0/19 | 0 |
| `ListSection` | component | missing | 0/0/5 | 1 |
| `ListSectionProps` | interface | missing | 0/0/4 | 0 |
| `LocalStorage` | namespace | missing | 0/0/7 | 960 |
| `LocalStorageValue` | type | missing | 0/0/0 | 0 |
| `LocalStorageValues` | interface | missing | 0/0/0 | 0 |
| `MenuBarExtra` | component | missing | 0/0/28 | 342 |
| `Navigation` | interface | covered | 2/0/2 | 5 |
| `OAuth` | namespace | missing | 0/0/68 | 135 |
| `OpenAction` | component | missing | 0/0/7 | 3 |
| `OpenActionProps` | interface | missing | 0/0/6 | 0 |
| `OpenInBrowserAction` | component | missing | 0/0/6 | 29 |
| `OpenInBrowserActionProps` | interface | missing | 0/0/5 | 0 |
| `OpenWithAction` | component | missing | 0/0/6 | 1 |
| `OpenWithActionProps` | interface | missing | 0/0/5 | 0 |
| `PasteAction` | component | partial | 0/0/6 | 2 |
| `PasteActionProps` | interface | missing | 0/0/5 | 0 |
| `PopToRootType` | enum | missing | 0/0/3 | 126 |
| `Preference` | interface | missing | 0/0/10 | 0 |
| `PreferenceValues` | interface | missing | 0/0/0 | 14 |
| `Preferences` | type | missing | 0/0/0 | 4 |
| `PushAction` | component | covered | 0/0/7 | 8 |
| `PushActionProps` | interface | missing | 0/0/6 | 0 |
| `ShowInFinderAction` | component | missing | 0/0/6 | 0 |
| `ShowInFinderActionProps` | interface | missing | 0/0/5 | 0 |
| `SubmitFormAction` | const | missing | 0/0/1 | 11 |
| `SubmitFormActionProps` | interface | missing | 0/0/5 | 0 |
| `Toast` | class | covered | 22/0/22 | 2413 |
| `ToastActionOptions` | interface | missing | 0/0/3 | 0 |
| `ToastOptions` | interface | missing | 0/0/5 | 0 |
| `ToastStyle` | enum | covered | 3/0/3 | 44 |
| `Tool` | namespace | missing | 0/0/1 | 128 |
| `TrashAction` | component | missing | 0/0/6 | 0 |
| `TrashActionProps` | interface | missing | 0/0/5 | 0 |
| `WindowManagement` | namespace | missing | 0/0/30 | 2 |
| `allLocalStorageItems` | function | missing | 0/0/0 | 1 |
| `captureException` | function | missing | 0/0/0 | 41 |
| `captureMemorySnapshot` | function | missing | 0/0/0 | 0 |
| `clearClipboard` | function | missing | 0/0/0 | 0 |
| `clearLocalStorage` | function | missing | 0/0/0 | 2 |
| `clearSearchBar` | function | missing | 0/0/0 | 41 |
| `closeMainWindow` | function | missing | 0/0/0 | 600 |
| `confirmAlert` | function | partial | 0/0/0 | 849 |
| `copyTextToClipboard` | function | missing | 0/0/0 | 3 |
| `environment` | const | partial | 6/0/17 | 738 |
| `getApplications` | function | missing | 0/0/0 | 216 |
| `getDefaultApplication` | function | missing | 0/0/0 | 20 |
| `getFrontmostApplication` | function | missing | 0/0/0 | 99 |
| `getLocalStorageItem` | function | missing | 0/0/0 | 10 |
| `getPreferenceValues` | function | partial | 0/0/0 | 2119 |
| `getSelectedFinderItems` | function | missing | 0/0/0 | 164 |
| `getSelectedText` | function | missing | 0/0/0 | 249 |
| `launchCommand` | function | missing | 0/0/0 | 398 |
| `open` | function | missing | 0/0/0 | 928 |
| `openCommandPreferences` | function | missing | 0/0/0 | 187 |
| `openExtensionPreferences` | function | missing | 0/0/0 | 541 |
| `pasteText` | function | missing | 0/0/0 | 3 |
| `popToRoot` | function | missing | 0/0/0 | 567 |
| `preferences` | const | missing | 0/0/0 | 6 |
| `randomId` | const | missing | 0/0/0 | 3 |
| `removeLocalStorageItem` | function | missing | 0/0/0 | 3 |
| `render` | const | missing | 0/0/0 | 1 |
| `setLocalStorageItem` | function | missing | 0/0/0 | 10 |
| `showHUD` | function | partial | 0/0/0 | 931 |
| `showInFinder` | function | missing | 0/0/0 | 145 |
| `showToast` | function | covered | 0/0/0 | 2471 |
| `specialKeys` | const | missing | 0/0/16 | 0 |
| `trash` | function | missing | 0/0/0 | 43 |
| `unstable_AI` | const | missing | 0/0/0 | 0 |
| `updateCommandMetadata` | function | missing | 0/0/0 | 105 |
| `useActionPanel` | function | missing | 0/0/0 | 0 |
| `useId` | const | missing | 0/0/0 | 0 |
| `useNavigation` | function | covered | 0/0/0 | 1048 |
| `useUnstableAI` | const | missing | 0/0/0 | 0 |

## Top missing by usage

Weight is the number of corpus extensions using the path (static imports, member chains, JSX and explicit props).
Each extension counts once per path. Dynamic accesses and spread props are not inferred. Source: [raycast-usage.json](raycast-usage.json).

| Path | Extensions |
| --- | --- |
| `List.Item.Props.accessories` | 1884 |
| `Form` | 1362 |
| `Form.Props.actions` | 1356 |
| `Action.SubmitForm` | 1267 |
| `Action.SubmitForm.Props.onSubmit` | 1267 |
| `Action.SubmitForm.Props.title` | 1181 |
| `List.Props.onSearchTextChange` | 1174 |
| `Form.TextField` | 1102 |
| `Form.TextField.Props.title` | 1090 |
| `Form.TextField.Props.placeholder` | 983 |
| `LocalStorage` | 960 |
| `LocalStorage.setItem` | 935 |
| `open` | 928 |
| `List.Dropdown` | 923 |
| `List.Dropdown.Item` | 921 |
| `List.Dropdown.Item.Props.title` | 916 |
| `List.Dropdown.Item.Props.value` | 916 |
| `List.Dropdown.Props.tooltip` | 915 |
| `List.Dropdown.Props.onChange` | 912 |
| `LocalStorage.getItem` | 911 |
| `Action.Style` | 880 |
| `Action.Props.style` | 872 |
| `Form.Dropdown` | 799 |
| `Form.Dropdown.Item` | 793 |
| `Form.Dropdown.Item.Props.title` | 793 |
| `Form.Dropdown.Item.Props.value` | 793 |
| `Form.Dropdown.Props.title` | 793 |
| `Form.Description` | 765 |
| `Form.Description.Props.text` | 765 |
| `Form.TextField.Props.id` | 764 |
| `List.Props.throttle` | 723 |
| `Form.TextArea` | 678 |
| `Action.SubmitForm.Props.icon` | 675 |
| `Form.TextArea.Props.title` | 665 |
| `LaunchProps` | 657 |
| `Form.Props.isLoading` | 651 |
| `Form.Dropdown.Props.id` | 605 |
| `closeMainWindow` | 600 |
| `Form.TextArea.Props.placeholder` | 590 |
| `popToRoot` | 567 |
| `openExtensionPreferences` | 541 |
| `List.Dropdown.Props.value` | 509 |
| `Form.TextField.Props.onChange` | 506 |
| `Form.TextArea.Props.id` | 491 |
| `Image` | 478 |
| `LaunchType` | 454 |
| `Form.Description.Props.title` | 453 |
| `Form.Props.navigationTitle` | 451 |
| `Form.Separator` | 443 |
| `List.Props.filtering` | 428 |
