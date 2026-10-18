# Raycast API coverage

Denominator: the `@raycast/api@2.8.2` declarations. Evidence:
`// @covers` tags in `packages/**/*.test.ts(x)`. A parent is not implied covered
by its children. Partial support is reported separately from covered.

**Non-deprecated coverage: 40/1534 covered (2.6%), 9 partial, 1485 missing.**
Deprecated: 0/939 covered (0.0%), 0 partial, 939 missing.

## Totals

| Status | Non-deprecated | Deprecated | All |
| --- | --- | --- | --- |
| covered | 40 | 0 | 40 |
| partial | 9 | 0 | 9 |
| missing | 1485 | 939 | 2424 |

## Totals by kind

| Kind | Covered | Partial | Missing | Total |
| --- | --- | --- | --- | --- |
| namespace | 0 | 1 | 8 | 9 |
| component | 0 | 8 | 108 | 116 |
| function | 1 | 0 | 49 | 50 |
| const | 0 | 0 | 21 | 21 |
| class | 0 | 0 | 3 | 3 |
| enum | 0 | 0 | 13 | 13 |
| enum-member | 0 | 0 | 691 | 691 |
| interface | 0 | 0 | 64 | 64 |
| type | 0 | 0 | 178 | 178 |
| property | 39 | 0 | 1265 | 1304 |
| method | 0 | 0 | 24 | 24 |

## Top-level symbols

Children counts include all descendants, as covered/partial/total.

| Symbol | Kind | Status | Children |
| --- | --- | --- | --- |
| `AI` | namespace | missing | 0/0/266 |
| `Action` | component | partial | 11/1/110 |
| `ActionPanel` | component | partial | 4/1/129 |
| `ActionPanelChildren` | type | missing | 0/0/0 |
| `ActionPanelItem` | component | missing | 0/0/104 |
| `ActionPanelItemProps` | interface | missing | 0/0/7 |
| `ActionPanelProps` | interface | missing | 0/0/2 |
| `ActionPanelSection` | component | missing | 0/0/3 |
| `ActionPanelSectionChildren` | type | missing | 0/0/0 |
| `ActionPanelSectionProps` | interface | missing | 0/0/2 |
| `ActionPanelState` | interface | missing | 0/0/1 |
| `ActionPanelSubmenu` | component | missing | 0/0/13 |
| `ActionPanelSubmenuProps` | interface | missing | 0/0/12 |
| `Alert` | namespace | missing | 0/0/15 |
| `AlertActionOptions` | interface | missing | 0/0/3 |
| `AlertActionStyle` | enum | missing | 0/0/3 |
| `AlertOptions` | interface | missing | 0/0/6 |
| `Application` | interface | missing | 0/0/5 |
| `ArgumentsLaunchProps` | interface | missing | 0/0/1 |
| `BrowserExtension` | namespace | missing | 0/0/8 |
| `Cache` | class | missing | 0/0/17 |
| `Clipboard` | namespace | partial | 1/0/16 |
| `Color` | enum | missing | 0/0/22 |
| `ColorLike` | type | missing | 0/0/3 |
| `CopyToClipboardAction` | component | missing | 0/0/8 |
| `CopyToClipboardActionProps` | interface | missing | 0/0/7 |
| `Detail` | component | missing | 0/0/33 |
| `DetailProps` | interface | missing | 0/0/5 |
| `DynamicColor` | type | missing | 0/0/3 |
| `Environment` | interface | missing | 0/0/17 |
| `FileIcon` | interface | missing | 0/0/1 |
| `FileSystemItem` | interface | missing | 0/0/1 |
| `Form` | component | missing | 0/0/213 |
| `FormCheckbox` | const | missing | 0/0/2 |
| `FormCheckboxProps` | interface | missing | 0/0/12 |
| `FormDatePicker` | const | missing | 0/0/2 |
| `FormDatePickerProps` | interface | missing | 0/0/14 |
| `FormDropdown` | const | missing | 0/0/2 |
| `FormDropdownItem` | const | missing | 0/0/0 |
| `FormDropdownItemProps` | interface | missing | 0/0/4 |
| `FormDropdownProps` | interface | missing | 0/0/18 |
| `FormDropdownSection` | const | missing | 0/0/0 |
| `FormDropdownSectionProps` | interface | missing | 0/0/2 |
| `FormItemProps` | interface | missing | 0/0/11 |
| `FormLaunchProps` | interface | missing | 0/0/1 |
| `FormProps` | interface | missing | 0/0/6 |
| `FormSeparator` | component | missing | 0/0/1 |
| `FormSeparatorProps` | interface | missing | 0/0/0 |
| `FormTagPicker` | const | missing | 0/0/2 |
| `FormTagPickerItem` | const | missing | 0/0/0 |
| `FormTagPickerItemProps` | interface | missing | 0/0/3 |
| `FormTagPickerProps` | interface | missing | 0/0/13 |
| `FormTextArea` | const | missing | 0/0/2 |
| `FormTextAreaProps` | interface | missing | 0/0/13 |
| `FormTextField` | const | missing | 0/0/2 |
| `FormTextFieldProps` | interface | missing | 0/0/12 |
| `FormValue` | type | missing | 0/0/0 |
| `FormValues` | interface | missing | 0/0/0 |
| `Grid` | component | missing | 0/0/87 |
| `Icon` | enum | missing | 0/0/478 |
| `Image` | interface | missing | 0/0/21 |
| `ImageLike` | type | missing | 0/0/5 |
| `ImageMask` | enum | missing | 0/0/2 |
| `ImageSource` | type | missing | 0/0/2 |
| `KeyEquivalent` | type | missing | 0/0/0 |
| `KeyModifier` | type | missing | 0/0/0 |
| `Keyboard` | namespace | missing | 0/0/32 |
| `KeyboardShortcut` | type | missing | 0/0/11 |
| `LaunchProps` | type | missing | 0/0/5 |
| `LaunchType` | enum | missing | 0/0/2 |
| `List` | component | partial | 24/3/122 |
| `ListItem` | component | missing | 0/0/52 |
| `ListItemProps` | interface | missing | 0/0/19 |
| `ListProps` | interface | missing | 0/0/19 |
| `ListSection` | component | missing | 0/0/5 |
| `ListSectionProps` | interface | missing | 0/0/4 |
| `LocalStorage` | namespace | missing | 0/0/7 |
| `LocalStorageValue` | type | missing | 0/0/0 |
| `LocalStorageValues` | interface | missing | 0/0/0 |
| `MenuBarExtra` | component | missing | 0/0/28 |
| `Navigation` | interface | missing | 0/0/2 |
| `OAuth` | namespace | missing | 0/0/68 |
| `OpenAction` | component | missing | 0/0/7 |
| `OpenActionProps` | interface | missing | 0/0/6 |
| `OpenInBrowserAction` | component | missing | 0/0/6 |
| `OpenInBrowserActionProps` | interface | missing | 0/0/5 |
| `OpenWithAction` | component | missing | 0/0/6 |
| `OpenWithActionProps` | interface | missing | 0/0/5 |
| `PasteAction` | component | missing | 0/0/6 |
| `PasteActionProps` | interface | missing | 0/0/5 |
| `PopToRootType` | enum | missing | 0/0/3 |
| `Preference` | interface | missing | 0/0/10 |
| `PreferenceValues` | interface | missing | 0/0/0 |
| `Preferences` | type | missing | 0/0/0 |
| `PushAction` | component | missing | 0/0/7 |
| `PushActionProps` | interface | missing | 0/0/6 |
| `ShowInFinderAction` | component | missing | 0/0/6 |
| `ShowInFinderActionProps` | interface | missing | 0/0/5 |
| `SubmitFormAction` | const | missing | 0/0/1 |
| `SubmitFormActionProps` | interface | missing | 0/0/5 |
| `Toast` | class | missing | 0/0/22 |
| `ToastActionOptions` | interface | missing | 0/0/3 |
| `ToastOptions` | interface | missing | 0/0/5 |
| `ToastStyle` | enum | missing | 0/0/3 |
| `Tool` | namespace | missing | 0/0/1 |
| `TrashAction` | component | missing | 0/0/6 |
| `TrashActionProps` | interface | missing | 0/0/5 |
| `WindowManagement` | namespace | missing | 0/0/30 |
| `allLocalStorageItems` | function | missing | 0/0/0 |
| `captureException` | function | missing | 0/0/0 |
| `captureMemorySnapshot` | function | missing | 0/0/0 |
| `clearClipboard` | function | missing | 0/0/0 |
| `clearLocalStorage` | function | missing | 0/0/0 |
| `clearSearchBar` | function | missing | 0/0/0 |
| `closeMainWindow` | function | missing | 0/0/0 |
| `confirmAlert` | function | missing | 0/0/0 |
| `copyTextToClipboard` | function | missing | 0/0/0 |
| `environment` | const | missing | 0/0/17 |
| `getApplications` | function | missing | 0/0/0 |
| `getDefaultApplication` | function | missing | 0/0/0 |
| `getFrontmostApplication` | function | missing | 0/0/0 |
| `getLocalStorageItem` | function | missing | 0/0/0 |
| `getPreferenceValues` | function | missing | 0/0/0 |
| `getSelectedFinderItems` | function | missing | 0/0/0 |
| `getSelectedText` | function | missing | 0/0/0 |
| `launchCommand` | function | missing | 0/0/0 |
| `open` | function | missing | 0/0/0 |
| `openCommandPreferences` | function | missing | 0/0/0 |
| `openExtensionPreferences` | function | missing | 0/0/0 |
| `pasteText` | function | missing | 0/0/0 |
| `popToRoot` | function | missing | 0/0/0 |
| `preferences` | const | missing | 0/0/0 |
| `randomId` | const | missing | 0/0/0 |
| `removeLocalStorageItem` | function | missing | 0/0/0 |
| `render` | const | missing | 0/0/0 |
| `setLocalStorageItem` | function | missing | 0/0/0 |
| `showHUD` | function | missing | 0/0/0 |
| `showInFinder` | function | missing | 0/0/0 |
| `showToast` | function | missing | 0/0/0 |
| `specialKeys` | const | missing | 0/0/16 |
| `trash` | function | missing | 0/0/0 |
| `unstable_AI` | const | missing | 0/0/0 |
| `updateCommandMetadata` | function | missing | 0/0/0 |
| `useActionPanel` | function | missing | 0/0/0 |
| `useId` | const | missing | 0/0/0 |
| `useNavigation` | function | missing | 0/0/0 |
| `useUnstableAI` | const | missing | 0/0/0 |
