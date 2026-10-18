# Raycast API coverage

Denominator: the `@raycast/api@2.8.2` declarations. Evidence:
`// @covers` tags in `packages/**/*.test.ts(x)`. A parent is not implied covered
by its children. Partial support is reported separately from covered.

**Non-deprecated coverage: 45/1534 covered (2.9%), 11 partial, 1478 missing.**
Deprecated: 1/939 covered (0.1%), 0 partial, 938 missing.

## Totals

| Status | Non-deprecated | Deprecated | All |
| --- | --- | --- | --- |
| covered | 45 | 1 | 46 |
| partial | 11 | 0 | 11 |
| missing | 1478 | 938 | 2416 |

## Totals by kind

| Kind | Covered | Partial | Missing | Total |
| --- | --- | --- | --- | --- |
| namespace | 0 | 1 | 8 | 9 |
| component | 0 | 8 | 108 | 116 |
| function | 1 | 1 | 48 | 50 |
| const | 0 | 1 | 20 | 21 |
| class | 0 | 0 | 3 | 3 |
| enum | 0 | 0 | 13 | 13 |
| enum-member | 0 | 0 | 691 | 691 |
| interface | 0 | 0 | 64 | 64 |
| type | 0 | 0 | 178 | 178 |
| property | 45 | 0 | 1259 | 1304 |
| method | 0 | 0 | 24 | 24 |

## Top-level symbols

Children counts include all descendants, as covered/partial/total.

| Symbol | Kind | Status | Children | Extensions |
| --- | --- | --- | --- | --- |
| `AI` | namespace | missing | 0/0/266 | 115 |
| `Action` | component | partial | 11/1/110 | 2985 |
| `ActionPanel` | component | partial | 4/1/129 | 3023 |
| `ActionPanelChildren` | type | missing | 0/0/0 | 0 |
| `ActionPanelItem` | component | missing | 0/0/104 | 1 |
| `ActionPanelItemProps` | interface | missing | 0/0/7 | 0 |
| `ActionPanelProps` | interface | missing | 0/0/2 | 0 |
| `ActionPanelSection` | component | missing | 0/0/3 | 0 |
| `ActionPanelSectionChildren` | type | missing | 0/0/0 | 0 |
| `ActionPanelSectionProps` | interface | missing | 0/0/2 | 0 |
| `ActionPanelState` | interface | missing | 0/0/1 | 0 |
| `ActionPanelSubmenu` | component | missing | 0/0/13 | 0 |
| `ActionPanelSubmenuProps` | interface | missing | 0/0/12 | 0 |
| `Alert` | namespace | missing | 0/0/15 | 718 |
| `AlertActionOptions` | interface | missing | 0/0/3 | 0 |
| `AlertActionStyle` | enum | missing | 0/0/3 | 1 |
| `AlertOptions` | interface | missing | 0/0/6 | 0 |
| `Application` | interface | missing | 0/0/5 | 119 |
| `ArgumentsLaunchProps` | interface | missing | 0/0/1 | 1 |
| `BrowserExtension` | namespace | missing | 0/0/8 | 62 |
| `Cache` | class | missing | 0/0/17 | 333 |
| `Clipboard` | namespace | partial | 1/0/16 | 1049 |
| `Color` | enum | missing | 0/0/22 | 1420 |
| `ColorLike` | type | missing | 0/0/3 | 0 |
| `CopyToClipboardAction` | component | missing | 0/0/8 | 23 |
| `CopyToClipboardActionProps` | interface | missing | 0/0/7 | 0 |
| `Detail` | component | missing | 0/0/33 | 1310 |
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
| `Icon` | enum | missing | 0/0/478 | 2587 |
| `Image` | interface | missing | 0/0/21 | 478 |
| `ImageLike` | type | missing | 0/0/5 | 2 |
| `ImageMask` | enum | missing | 0/0/2 | 8 |
| `ImageSource` | type | missing | 0/0/2 | 0 |
| `KeyEquivalent` | type | missing | 0/0/0 | 4 |
| `KeyModifier` | type | missing | 0/0/0 | 0 |
| `Keyboard` | namespace | missing | 0/0/32 | 790 |
| `KeyboardShortcut` | type | missing | 0/0/11 | 1 |
| `LaunchProps` | type | missing | 0/0/5 | 657 |
| `LaunchType` | enum | missing | 0/0/2 | 454 |
| `List` | component | partial | 24/3/122 | 2604 |
| `ListItem` | component | missing | 0/0/52 | 1 |
| `ListItemProps` | interface | missing | 0/0/19 | 0 |
| `ListProps` | interface | missing | 0/0/19 | 0 |
| `ListSection` | component | missing | 0/0/5 | 1 |
| `ListSectionProps` | interface | missing | 0/0/4 | 0 |
| `LocalStorage` | namespace | missing | 0/0/7 | 960 |
| `LocalStorageValue` | type | missing | 0/0/0 | 0 |
| `LocalStorageValues` | interface | missing | 0/0/0 | 0 |
| `MenuBarExtra` | component | missing | 0/0/28 | 342 |
| `Navigation` | interface | missing | 0/0/2 | 5 |
| `OAuth` | namespace | missing | 0/0/68 | 135 |
| `OpenAction` | component | missing | 0/0/7 | 3 |
| `OpenActionProps` | interface | missing | 0/0/6 | 0 |
| `OpenInBrowserAction` | component | missing | 0/0/6 | 29 |
| `OpenInBrowserActionProps` | interface | missing | 0/0/5 | 0 |
| `OpenWithAction` | component | missing | 0/0/6 | 1 |
| `OpenWithActionProps` | interface | missing | 0/0/5 | 0 |
| `PasteAction` | component | missing | 0/0/6 | 2 |
| `PasteActionProps` | interface | missing | 0/0/5 | 0 |
| `PopToRootType` | enum | missing | 0/0/3 | 126 |
| `Preference` | interface | missing | 0/0/10 | 0 |
| `PreferenceValues` | interface | missing | 0/0/0 | 14 |
| `Preferences` | type | missing | 0/0/0 | 4 |
| `PushAction` | component | missing | 0/0/7 | 8 |
| `PushActionProps` | interface | missing | 0/0/6 | 0 |
| `ShowInFinderAction` | component | missing | 0/0/6 | 0 |
| `ShowInFinderActionProps` | interface | missing | 0/0/5 | 0 |
| `SubmitFormAction` | const | missing | 0/0/1 | 11 |
| `SubmitFormActionProps` | interface | missing | 0/0/5 | 0 |
| `Toast` | class | missing | 0/0/22 | 2413 |
| `ToastActionOptions` | interface | missing | 0/0/3 | 0 |
| `ToastOptions` | interface | missing | 0/0/5 | 0 |
| `ToastStyle` | enum | missing | 0/0/3 | 44 |
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
| `confirmAlert` | function | missing | 0/0/0 | 849 |
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
| `showHUD` | function | missing | 0/0/0 | 931 |
| `showInFinder` | function | missing | 0/0/0 | 145 |
| `showToast` | function | missing | 0/0/0 | 2471 |
| `specialKeys` | const | missing | 0/0/16 | 0 |
| `trash` | function | missing | 0/0/0 | 43 |
| `unstable_AI` | const | missing | 0/0/0 | 0 |
| `updateCommandMetadata` | function | missing | 0/0/0 | 105 |
| `useActionPanel` | function | missing | 0/0/0 | 0 |
| `useId` | const | missing | 0/0/0 | 0 |
| `useNavigation` | function | missing | 0/0/0 | 1048 |
| `useUnstableAI` | const | missing | 0/0/0 | 0 |

## Top missing by usage

Weight is the number of corpus extensions using the path (static imports, member chains, JSX and explicit props).
Each extension counts once per path. Dynamic accesses and spread props are not inferred. Source: [raycast-usage.json](raycast-usage.json).

| Path | Extensions |
| --- | --- |
| `Icon` | 2587 |
| `showToast` | 2471 |
| `Toast` | 2413 |
| `Toast.Style` | 2407 |
| `Toast.Style.Failure` | 2149 |
| `List.Item.Props.accessories` | 1884 |
| `Toast.Style.Success` | 1760 |
| `Action.OpenInBrowser` | 1540 |
| `Action.OpenInBrowser.Props.url` | 1540 |
| `Color` | 1420 |
| `Form` | 1362 |
| `Form.Props.actions` | 1356 |
| `Detail` | 1310 |
| `Detail.Props.markdown` | 1284 |
| `Action.SubmitForm` | 1267 |
| `Action.SubmitForm.Props.onSubmit` | 1267 |
| `Action.Push` | 1233 |
| `Action.Push.Props.target` | 1233 |
| `Action.Push.Props.title` | 1232 |
| `Action.OpenInBrowser.Props.title` | 1212 |
| `Toast.Style.Animated` | 1208 |
| `Action.SubmitForm.Props.title` | 1181 |
| `List.Props.onSearchTextChange` | 1174 |
| `Action.Push.Props.icon` | 1107 |
| `Form.TextField` | 1102 |
| `Form.TextField.Props.title` | 1090 |
| `Detail.Props.actions` | 1074 |
| `useNavigation` | 1048 |
| `Color.Green` | 1006 |
| `List.Item.Detail` | 993 |
| `Form.TextField.Props.placeholder` | 983 |
| `LocalStorage` | 960 |
| `LocalStorage.setItem` | 935 |
| `showHUD` | 931 |
| `open` | 928 |
| `List.Dropdown` | 923 |
| `List.Dropdown.Item` | 921 |
| `Icon.Trash` | 918 |
| `List.Dropdown.Item.Props.title` | 916 |
| `List.Dropdown.Item.Props.value` | 916 |
| `List.Dropdown.Props.tooltip` | 915 |
| `List.Dropdown.Props.onChange` | 912 |
| `LocalStorage.getItem` | 911 |
| `Color.Red` | 898 |
| `Action.Style` | 880 |
| `Action.Props.style` | 872 |
| `confirmAlert` | 849 |
| `Form.Dropdown` | 799 |
| `Form.Dropdown.Item` | 793 |
| `Form.Dropdown.Item.Props.title` | 793 |
