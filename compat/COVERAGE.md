# Raycast API coverage

Denominator: the `@raycast/api@2.11.1` declarations. Evidence:
`// @covers` tags in `packages/**/*.test.ts(x)`. A parent is not implied covered
by its children. Partial support is reported separately from covered.
Proven aliases inherit descendant evidence from their targets (`via` in JSON).

**Non-deprecated coverage: 1539/1540 covered (99.9%), 1 partial, 0 missing.**
Deprecated: 942/942 covered (100.0%), 0 partial, 0 missing.

## Totals

| Status | Non-deprecated | Deprecated | All |
| --- | --- | --- | --- |
| covered | 1539 | 942 | 2481 |
| partial | 1 | 0 | 1 |
| missing | 0 | 0 | 0 |

## Totals by kind

| Kind | Covered | Partial | Missing | Total |
| --- | --- | --- | --- | --- |
| namespace | 9 | 0 | 0 | 9 |
| component | 116 | 0 | 0 | 116 |
| function | 49 | 1 | 0 | 50 |
| const | 21 | 0 | 0 | 21 |
| class | 3 | 0 | 0 | 3 |
| enum | 13 | 0 | 0 | 13 |
| enum-member | 696 | 0 | 0 | 696 |
| interface | 64 | 0 | 0 | 64 |
| type | 179 | 0 | 0 | 179 |
| property | 1307 | 0 | 0 | 1307 |
| method | 24 | 0 | 0 | 24 |

## Top-level symbols

Children counts include all descendants, as covered/partial/total.

| Symbol | Kind | Status | Children | Extensions |
| --- | --- | --- | --- | --- |
| `AI` | namespace | covered | 271/0/271 | 116 |
| `Action` | component | covered | 110/0/110 | 3033 |
| `ActionPanel` | component | covered | 129/0/129 | 3070 |
| `ActionPanelChildren` | type | covered | 0/0/0 | 0 |
| `ActionPanelItem` | component | covered | 104/0/104 | 1 |
| `ActionPanelItemProps` | interface | covered | 7/0/7 | 0 |
| `ActionPanelProps` | interface | covered | 2/0/2 | 0 |
| `ActionPanelSection` | component | covered | 3/0/3 | 0 |
| `ActionPanelSectionChildren` | type | covered | 0/0/0 | 0 |
| `ActionPanelSectionProps` | interface | covered | 2/0/2 | 0 |
| `ActionPanelState` | interface | covered | 1/0/1 | 0 |
| `ActionPanelSubmenu` | component | covered | 13/0/13 | 0 |
| `ActionPanelSubmenuProps` | interface | covered | 12/0/12 | 0 |
| `Alert` | namespace | covered | 15/0/15 | 749 |
| `AlertActionOptions` | interface | covered | 3/0/3 | 0 |
| `AlertActionStyle` | enum | covered | 3/0/3 | 1 |
| `AlertOptions` | interface | covered | 6/0/6 | 0 |
| `Application` | interface | covered | 5/0/5 | 121 |
| `ArgumentsLaunchProps` | interface | covered | 1/0/1 | 1 |
| `BrowserExtension` | namespace | covered | 7/1/8 | 67 |
| `Cache` | class | covered | 17/0/17 | 344 |
| `Clipboard` | namespace | covered | 18/0/18 | 1070 |
| `Color` | enum | covered | 22/0/22 | 1454 |
| `ColorLike` | type | covered | 3/0/3 | 0 |
| `CopyToClipboardAction` | component | covered | 8/0/8 | 23 |
| `CopyToClipboardActionProps` | interface | covered | 7/0/7 | 0 |
| `Detail` | component | covered | 33/0/33 | 1335 |
| `DetailProps` | interface | covered | 5/0/5 | 0 |
| `DynamicColor` | type | covered | 3/0/3 | 0 |
| `Environment` | interface | covered | 17/0/17 | 2 |
| `FileIcon` | interface | covered | 1/0/1 | 1 |
| `FileSystemItem` | interface | covered | 1/0/1 | 9 |
| `Form` | component | covered | 213/0/213 | 1396 |
| `FormCheckbox` | const | covered | 2/0/2 | 0 |
| `FormCheckboxProps` | interface | covered | 12/0/12 | 0 |
| `FormDatePicker` | const | covered | 2/0/2 | 0 |
| `FormDatePickerProps` | interface | covered | 14/0/14 | 0 |
| `FormDropdown` | const | covered | 2/0/2 | 0 |
| `FormDropdownItem` | const | covered | 0/0/0 | 0 |
| `FormDropdownItemProps` | interface | covered | 4/0/4 | 0 |
| `FormDropdownProps` | interface | covered | 18/0/18 | 0 |
| `FormDropdownSection` | const | covered | 0/0/0 | 0 |
| `FormDropdownSectionProps` | interface | covered | 2/0/2 | 0 |
| `FormItemProps` | interface | covered | 11/0/11 | 0 |
| `FormLaunchProps` | interface | covered | 1/0/1 | 0 |
| `FormProps` | interface | covered | 6/0/6 | 0 |
| `FormSeparator` | component | covered | 1/0/1 | 0 |
| `FormSeparatorProps` | interface | covered | 0/0/0 | 0 |
| `FormTagPicker` | const | covered | 2/0/2 | 0 |
| `FormTagPickerItem` | const | covered | 0/0/0 | 0 |
| `FormTagPickerItemProps` | interface | covered | 3/0/3 | 0 |
| `FormTagPickerProps` | interface | covered | 13/0/13 | 0 |
| `FormTextArea` | const | covered | 2/0/2 | 0 |
| `FormTextAreaProps` | interface | covered | 13/0/13 | 0 |
| `FormTextField` | const | covered | 2/0/2 | 0 |
| `FormTextFieldProps` | interface | covered | 12/0/12 | 0 |
| `FormValue` | type | covered | 0/0/0 | 2 |
| `FormValues` | interface | covered | 0/0/0 | 1 |
| `Grid` | component | covered | 87/0/87 | 318 |
| `Icon` | enum | covered | 478/0/478 | 2639 |
| `Image` | interface | covered | 21/0/21 | 495 |
| `ImageLike` | type | covered | 5/0/5 | 2 |
| `ImageMask` | enum | covered | 2/0/2 | 8 |
| `ImageSource` | type | covered | 2/0/2 | 0 |
| `KeyEquivalent` | type | covered | 0/0/0 | 4 |
| `KeyModifier` | type | covered | 0/0/0 | 0 |
| `Keyboard` | namespace | covered | 32/0/32 | 848 |
| `KeyboardShortcut` | type | covered | 11/0/11 | 1 |
| `LaunchProps` | type | covered | 5/0/5 | 675 |
| `LaunchType` | enum | covered | 2/0/2 | 472 |
| `List` | component | covered | 122/0/122 | 2649 |
| `ListItem` | component | covered | 52/0/52 | 1 |
| `ListItemProps` | interface | covered | 19/0/19 | 0 |
| `ListProps` | interface | covered | 19/0/19 | 0 |
| `ListSection` | component | covered | 5/0/5 | 1 |
| `ListSectionProps` | interface | covered | 4/0/4 | 0 |
| `LocalStorage` | namespace | covered | 7/0/7 | 983 |
| `LocalStorageValue` | type | covered | 0/0/0 | 0 |
| `LocalStorageValues` | interface | covered | 0/0/0 | 0 |
| `MenuBarExtra` | component | covered | 28/0/28 | 350 |
| `Navigation` | interface | covered | 2/0/2 | 5 |
| `OAuth` | namespace | covered | 70/0/70 | 137 |
| `OpenAction` | component | covered | 7/0/7 | 3 |
| `OpenActionProps` | interface | covered | 6/0/6 | 0 |
| `OpenInBrowserAction` | component | covered | 6/0/6 | 29 |
| `OpenInBrowserActionProps` | interface | covered | 5/0/5 | 0 |
| `OpenWithAction` | component | covered | 6/0/6 | 1 |
| `OpenWithActionProps` | interface | covered | 5/0/5 | 0 |
| `PasteAction` | component | covered | 6/0/6 | 2 |
| `PasteActionProps` | interface | covered | 5/0/5 | 0 |
| `PopToRootType` | enum | covered | 3/0/3 | 132 |
| `Preference` | interface | covered | 10/0/10 | 0 |
| `PreferenceValues` | interface | covered | 0/0/0 | 14 |
| `Preferences` | type | covered | 0/0/0 | 4 |
| `PushAction` | component | covered | 7/0/7 | 8 |
| `PushActionProps` | interface | covered | 6/0/6 | 0 |
| `ShowInFinderAction` | component | covered | 6/0/6 | 0 |
| `ShowInFinderActionProps` | interface | covered | 5/0/5 | 0 |
| `SubmitFormAction` | const | covered | 1/0/1 | 10 |
| `SubmitFormActionProps` | interface | covered | 5/0/5 | 0 |
| `Toast` | class | covered | 22/0/22 | 2454 |
| `ToastActionOptions` | interface | covered | 3/0/3 | 0 |
| `ToastOptions` | interface | covered | 5/0/5 | 0 |
| `ToastStyle` | enum | covered | 3/0/3 | 43 |
| `Tool` | namespace | covered | 1/0/1 | 132 |
| `TrashAction` | component | covered | 6/0/6 | 0 |
| `TrashActionProps` | interface | covered | 5/0/5 | 0 |
| `WindowManagement` | namespace | covered | 30/0/30 | 2 |
| `allLocalStorageItems` | function | covered | 0/0/0 | 1 |
| `captureException` | function | covered | 0/0/0 | 43 |
| `captureMemorySnapshot` | function | covered | 0/0/0 | 0 |
| `clearClipboard` | function | covered | 0/0/0 | 0 |
| `clearLocalStorage` | function | covered | 0/0/0 | 2 |
| `clearSearchBar` | function | covered | 0/0/0 | 41 |
| `closeMainWindow` | function | covered | 0/0/0 | 612 |
| `confirmAlert` | function | covered | 0/0/0 | 882 |
| `copyTextToClipboard` | function | covered | 0/0/0 | 3 |
| `environment` | const | covered | 17/0/17 | 773 |
| `getApplications` | function | covered | 0/0/0 | 223 |
| `getDefaultApplication` | function | covered | 0/0/0 | 20 |
| `getFrontmostApplication` | function | covered | 0/0/0 | 103 |
| `getLocalStorageItem` | function | covered | 0/0/0 | 10 |
| `getPreferenceValues` | function | covered | 0/0/0 | 2157 |
| `getSelectedFinderItems` | function | covered | 0/0/0 | 170 |
| `getSelectedText` | function | covered | 0/0/0 | 253 |
| `launchCommand` | function | covered | 0/0/0 | 416 |
| `open` | function | covered | 0/0/0 | 955 |
| `openCommandPreferences` | function | covered | 0/0/0 | 191 |
| `openExtensionPreferences` | function | covered | 0/0/0 | 564 |
| `pasteText` | function | covered | 0/0/0 | 3 |
| `popToRoot` | function | covered | 0/0/0 | 573 |
| `preferences` | const | covered | 0/0/0 | 6 |
| `randomId` | const | covered | 0/0/0 | 3 |
| `removeLocalStorageItem` | function | covered | 0/0/0 | 3 |
| `render` | const | covered | 0/0/0 | 1 |
| `setLocalStorageItem` | function | covered | 0/0/0 | 10 |
| `showHUD` | function | covered | 0/0/0 | 957 |
| `showInFinder` | function | covered | 0/0/0 | 154 |
| `showToast` | function | covered | 0/0/0 | 2511 |
| `specialKeys` | const | covered | 16/0/16 | 0 |
| `trash` | function | covered | 0/0/0 | 46 |
| `unstable_AI` | const | covered | 0/0/0 | 0 |
| `updateCommandMetadata` | function | covered | 0/0/0 | 109 |
| `useActionPanel` | function | covered | 0/0/0 | 0 |
| `useId` | const | covered | 0/0/0 | 0 |
| `useNavigation` | function | covered | 0/0/0 | 1080 |
| `useUnstableAI` | const | covered | 0/0/0 | 0 |

## Top missing by usage

Weight is the number of corpus extensions using the path (static imports, member chains, JSX and explicit props).
Each extension counts once per path. Dynamic accesses and spread props are not inferred. Source: [raycast-usage.json](raycast-usage.json).

| Path | Extensions |
| --- | --- |
