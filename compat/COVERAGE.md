# Raycast API coverage

Denominator: the `@raycast/api@2.8.2` declarations. Evidence:
`// @covers` tags in `packages/**/*.test.ts(x)`. A parent is not implied covered
by its children. Partial support is reported separately from covered.

**Non-deprecated coverage: 1496/1534 covered (97.5%), 38 partial, 0 missing.**
Deprecated: 182/939 covered (19.4%), 5 partial, 752 missing.

## Totals

| Status | Non-deprecated | Deprecated | All |
| --- | --- | --- | --- |
| covered | 1496 | 182 | 1678 |
| partial | 38 | 5 | 43 |
| missing | 0 | 752 | 752 |

## Totals by kind

| Kind | Covered | Partial | Missing | Total |
| --- | --- | --- | --- | --- |
| namespace | 9 | 0 | 0 | 9 |
| component | 64 | 11 | 41 | 116 |
| function | 43 | 3 | 4 | 50 |
| const | 5 | 0 | 16 | 21 |
| class | 3 | 0 | 0 | 3 |
| enum | 13 | 0 | 0 | 13 |
| enum-member | 691 | 0 | 0 | 691 |
| interface | 24 | 1 | 39 | 64 |
| type | 108 | 7 | 63 | 178 |
| property | 696 | 21 | 587 | 1304 |
| method | 22 | 0 | 2 | 24 |

## Top-level symbols

Children counts include all descendants, as covered/partial/total.

| Symbol | Kind | Status | Children | Extensions |
| --- | --- | --- | --- | --- |
| `AI` | namespace | covered | 266/0/266 | 115 |
| `Action` | component | covered | 105/3/110 | 2985 |
| `ActionPanel` | component | covered | 19/5/129 | 3023 |
| `ActionPanelChildren` | type | missing | 0/0/0 | 0 |
| `ActionPanelItem` | component | partial | 0/0/104 | 1 |
| `ActionPanelItemProps` | interface | missing | 0/0/7 | 0 |
| `ActionPanelProps` | interface | missing | 0/0/2 | 0 |
| `ActionPanelSection` | component | missing | 0/0/3 | 0 |
| `ActionPanelSectionChildren` | type | missing | 0/0/0 | 0 |
| `ActionPanelSectionProps` | interface | missing | 0/0/2 | 0 |
| `ActionPanelState` | interface | missing | 0/0/1 | 0 |
| `ActionPanelSubmenu` | component | covered | 0/0/13 | 0 |
| `ActionPanelSubmenuProps` | interface | missing | 0/0/12 | 0 |
| `Alert` | namespace | covered | 13/2/15 | 718 |
| `AlertActionOptions` | interface | missing | 0/0/3 | 0 |
| `AlertActionStyle` | enum | covered | 3/0/3 | 1 |
| `AlertOptions` | interface | missing | 0/0/6 | 0 |
| `Application` | interface | covered | 5/0/5 | 119 |
| `ArgumentsLaunchProps` | interface | missing | 0/0/1 | 1 |
| `BrowserExtension` | namespace | covered | 7/1/8 | 62 |
| `Cache` | class | covered | 16/1/17 | 333 |
| `Clipboard` | namespace | covered | 15/0/16 | 1049 |
| `Color` | enum | covered | 18/0/22 | 1420 |
| `ColorLike` | type | missing | 0/0/3 | 0 |
| `CopyToClipboardAction` | component | partial | 0/0/8 | 23 |
| `CopyToClipboardActionProps` | interface | missing | 0/0/7 | 0 |
| `Detail` | component | covered | 33/0/33 | 1310 |
| `DetailProps` | interface | missing | 0/0/5 | 0 |
| `DynamicColor` | type | missing | 0/0/3 | 0 |
| `Environment` | interface | covered | 13/0/17 | 2 |
| `FileIcon` | interface | covered | 1/0/1 | 1 |
| `FileSystemItem` | interface | covered | 1/0/1 | 10 |
| `Form` | component | covered | 194/4/213 | 1362 |
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
| `Grid` | component | partial | 79/8/87 | 311 |
| `Icon` | enum | covered | 478/0/478 | 2587 |
| `Image` | interface | covered | 21/0/21 | 478 |
| `ImageLike` | type | missing | 0/0/5 | 2 |
| `ImageMask` | enum | covered | 2/0/2 | 8 |
| `ImageSource` | type | missing | 0/0/2 | 0 |
| `KeyEquivalent` | type | missing | 0/0/0 | 4 |
| `KeyModifier` | type | missing | 0/0/0 | 0 |
| `Keyboard` | namespace | covered | 29/0/32 | 790 |
| `KeyboardShortcut` | type | missing | 0/0/11 | 1 |
| `LaunchProps` | type | covered | 4/1/5 | 657 |
| `LaunchType` | enum | covered | 2/0/2 | 454 |
| `List` | component | partial | 114/8/122 | 2604 |
| `ListItem` | component | missing | 0/0/52 | 1 |
| `ListItemProps` | interface | missing | 0/0/19 | 0 |
| `ListProps` | interface | missing | 0/0/19 | 0 |
| `ListSection` | component | missing | 0/0/5 | 1 |
| `ListSectionProps` | interface | missing | 0/0/4 | 0 |
| `LocalStorage` | namespace | covered | 7/0/7 | 960 |
| `LocalStorageValue` | type | missing | 0/0/0 | 0 |
| `LocalStorageValues` | interface | missing | 0/0/0 | 0 |
| `MenuBarExtra` | component | partial | 26/2/28 | 342 |
| `Navigation` | interface | covered | 2/0/2 | 5 |
| `OAuth` | namespace | covered | 68/0/68 | 135 |
| `OpenAction` | component | covered | 0/0/7 | 3 |
| `OpenActionProps` | interface | missing | 0/0/6 | 0 |
| `OpenInBrowserAction` | component | missing | 0/0/6 | 29 |
| `OpenInBrowserActionProps` | interface | missing | 0/0/5 | 0 |
| `OpenWithAction` | component | covered | 0/0/6 | 1 |
| `OpenWithActionProps` | interface | missing | 0/0/5 | 0 |
| `PasteAction` | component | partial | 0/0/6 | 2 |
| `PasteActionProps` | interface | missing | 0/0/5 | 0 |
| `PopToRootType` | enum | covered | 3/0/3 | 126 |
| `Preference` | interface | missing | 0/0/10 | 0 |
| `PreferenceValues` | interface | covered | 0/0/0 | 14 |
| `Preferences` | type | missing | 0/0/0 | 4 |
| `PushAction` | component | covered | 0/0/7 | 8 |
| `PushActionProps` | interface | missing | 0/0/6 | 0 |
| `ShowInFinderAction` | component | covered | 0/0/6 | 0 |
| `ShowInFinderActionProps` | interface | missing | 0/0/5 | 0 |
| `SubmitFormAction` | const | missing | 0/0/1 | 11 |
| `SubmitFormActionProps` | interface | missing | 0/0/5 | 0 |
| `Toast` | class | covered | 22/0/22 | 2413 |
| `ToastActionOptions` | interface | missing | 0/0/3 | 0 |
| `ToastOptions` | interface | missing | 0/0/5 | 0 |
| `ToastStyle` | enum | covered | 3/0/3 | 44 |
| `Tool` | namespace | covered | 1/0/1 | 128 |
| `TrashAction` | component | covered | 0/0/6 | 0 |
| `TrashActionProps` | interface | missing | 0/0/5 | 0 |
| `WindowManagement` | namespace | covered | 30/0/30 | 2 |
| `allLocalStorageItems` | function | covered | 0/0/0 | 1 |
| `captureException` | function | covered | 0/0/0 | 41 |
| `captureMemorySnapshot` | function | covered | 0/0/0 | 0 |
| `clearClipboard` | function | missing | 0/0/0 | 0 |
| `clearLocalStorage` | function | covered | 0/0/0 | 2 |
| `clearSearchBar` | function | covered | 0/0/0 | 41 |
| `closeMainWindow` | function | covered | 0/0/0 | 600 |
| `confirmAlert` | function | partial | 0/0/0 | 849 |
| `copyTextToClipboard` | function | missing | 0/0/0 | 3 |
| `environment` | const | covered | 14/0/17 | 738 |
| `getApplications` | function | covered | 0/0/0 | 216 |
| `getDefaultApplication` | function | covered | 0/0/0 | 20 |
| `getFrontmostApplication` | function | covered | 0/0/0 | 99 |
| `getLocalStorageItem` | function | covered | 0/0/0 | 10 |
| `getPreferenceValues` | function | covered | 0/0/0 | 2119 |
| `getSelectedFinderItems` | function | covered | 0/0/0 | 164 |
| `getSelectedText` | function | covered | 0/0/0 | 249 |
| `launchCommand` | function | covered | 0/0/0 | 398 |
| `open` | function | covered | 0/0/0 | 928 |
| `openCommandPreferences` | function | covered | 0/0/0 | 187 |
| `openExtensionPreferences` | function | covered | 0/0/0 | 541 |
| `pasteText` | function | missing | 0/0/0 | 3 |
| `popToRoot` | function | covered | 0/0/0 | 567 |
| `preferences` | const | missing | 0/0/0 | 6 |
| `randomId` | const | missing | 0/0/0 | 3 |
| `removeLocalStorageItem` | function | covered | 0/0/0 | 3 |
| `render` | const | missing | 0/0/0 | 1 |
| `setLocalStorageItem` | function | covered | 0/0/0 | 10 |
| `showHUD` | function | partial | 0/0/0 | 931 |
| `showInFinder` | function | covered | 0/0/0 | 145 |
| `showToast` | function | covered | 0/0/0 | 2471 |
| `specialKeys` | const | missing | 0/0/16 | 0 |
| `trash` | function | covered | 0/0/0 | 43 |
| `unstable_AI` | const | covered | 0/0/0 | 0 |
| `updateCommandMetadata` | function | covered | 0/0/0 | 105 |
| `useActionPanel` | function | missing | 0/0/0 | 0 |
| `useId` | const | missing | 0/0/0 | 0 |
| `useNavigation` | function | covered | 0/0/0 | 1048 |
| `useUnstableAI` | const | covered | 0/0/0 | 0 |

## Top missing by usage

Weight is the number of corpus extensions using the path (static imports, member chains, JSX and explicit props).
Each extension counts once per path. Dynamic accesses and spread props are not inferred. Source: [raycast-usage.json](raycast-usage.json).

| Path | Extensions |
| --- | --- |
| `ActionPanel.Item.Props.onAction` | 30 |
| `ActionPanel.Item.Props.title` | 30 |
| `OpenInBrowserAction` | 29 |
| `OpenInBrowserAction.Props.url` | 29 |
| `CopyToClipboardAction.Props.content` | 22 |
| `ActionPanel.Item.Props.icon` | 20 |
| `OpenInBrowserAction.Props.title` | 17 |
| `CopyToClipboardAction.Props.title` | 16 |
| `environment.commandMode` | 14 |
| `environment.theme` | 14 |
| `SubmitFormAction` | 11 |
| `Color.Brown` | 8 |
| `PushAction.Props.target` | 8 |
| `PushAction.Props.title` | 8 |
| `OpenInBrowserAction.Props.icon` | 7 |
| `PushAction.Props.icon` | 7 |
| `ActionPanel.Item.Props.shortcut` | 6 |
| `preferences` | 6 |
| `Form.DropdownItem` | 5 |
| `Form.DropdownItem.Props.title` | 5 |
| `Form.DropdownItem.Props.value` | 5 |
| `environment.launchContext` | 5 |
| `KeyEquivalent` | 4 |
| `OpenInBrowserAction.Props.shortcut` | 4 |
| `Preferences` | 4 |
| `CopyToClipboardAction.Props.shortcut` | 3 |
| `OpenAction.Props.target` | 3 |
| `OpenAction.Props.title` | 3 |
| `OpenInBrowserAction.Props.onOpen` | 3 |
| `copyTextToClipboard` | 3 |
| `pasteText` | 3 |
| `randomId` | 3 |
| `FormValue` | 2 |
| `ImageLike` | 2 |
| `OpenAction.Props.application` | 2 |
| `OpenAction.Props.icon` | 2 |
| `PasteAction.Props.content` | 2 |
| `ActionPanel.Item.Props.style` | 1 |
| `ActionPanelItem.Props.icon` | 1 |
| `ActionPanelItem.Props.onAction` | 1 |
| `ActionPanelItem.Props.shortcut` | 1 |
| `ActionPanelItem.Props.title` | 1 |
| `ArgumentsLaunchProps` | 1 |
| `CopyToClipboardAction.Props.onCopy` | 1 |
| `FormValues` | 1 |
| `KeyboardShortcut` | 1 |
| `ListItem` | 1 |
| `ListItem.Props.actions` | 1 |
| `ListItem.Props.subtitle` | 1 |
| `ListItem.Props.title` | 1 |
