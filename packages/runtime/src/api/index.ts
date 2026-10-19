export * from "./unsupported.generated.ts";
export { CopyToClipboard } from "./action.ts";
export { Image } from "./enums.generated.ts";
import { Image } from "./enums.generated.ts";
export type {
  LaunchCommandOptions,
  LaunchContext,
  LaunchProps,
  LaunchTypeValue,
} from "./launch.ts";
export type { CloseMainWindowOptions, PopToRootTypeValue } from "./window.ts";
export type { ActionProps, ActionStyle, CopyToClipboardProps } from "./action.ts";
export type {
  OpenProps,
  OpenWithProps,
  ShowInFinderProps,
  TrashProps,
  Snippet,
  Quicklink,
  CreateSnippetProps,
  CreateQuicklinkProps,
  ToggleQuickLookProps,
  PickDateProps,
  DatePickerTypeValue,
  InstallMCPServerProps,
  MCPServer,
  StdioMCPServer,
  SSEMCPServer,
  IconValue,
} from "./action.ts";
export type {
  ActionPanelProps,
  ActionPanelSectionProps,
  ActionPanelSubmenuProps,
} from "./action-panel.ts";
export type { ClipboardContent, CopyOptions, ReadContent } from "./clipboard.ts";
export type {
  Environment,
  Appearance,
  EntryPointMode,
  EntryPointType,
  TextSize,
} from "./environment.ts";
export type {
  FileIcon,
  ColorDynamic,
  ColorLike,
  ColorRaw,
  ImageFallback,
  ImageLike,
  ImageObject,
  ImagePath,
  ImageSource,
  ImageThemeSource,
  KeyShortcut,
  Shortcut,
} from "./types.ts";
export type { KeyEquivalent, KeyModifier } from "./keyboard.ts";
export type {
  ListProps,
  ListItemProps,
  ListSectionProps,
  ListEmptyViewProps,
  ListAccessory,
  ListDropdownProps,
  ListDropdownItemProps,
  ListDropdownSectionProps,
} from "./list.ts";
export type {
  GridProps,
  GridItemProps,
  GridSectionProps,
  GridEmptyViewProps,
  GridItemContent,
  GridItemAccessory,
  GridAspectRatio,
  GridInset,
  GridFit,
  GridItemSize,
  GridDropdownProps,
  GridDropdownItemProps,
  GridDropdownSectionProps,
} from "./grid.ts";
export type { DetailProps, ListItemDetailProps } from "./detail.ts";
export type {
  MetadataComponents,
  MetadataLabelProps,
  MetadataLinkProps,
  MetadataProps,
  MetadataSeparatorProps,
  MetadataTagListItemProps,
  MetadataTagListProps,
} from "./metadata.ts";
export type { PreferenceValues } from "./preferences.ts";

export type { PushProps } from "./action.ts";
export type { Navigation, ClearSearchBarOptions } from "./navigation.ts";
export type { PopToRootOptions } from "./navigation.ts";
export type { RuntimeLogLevel } from "./diagnostics.ts";
export type {
  Desktop,
  DesktopTypeValue,
  Window,
  WindowBounds,
  SetWindowBoundsOptions,
} from "./window-management.ts";

export type {
  ToastOptions,
  ToastActionOptions,
  AlertOptions,
  AlertActionOptions,
  HUDOptions,
} from "./feedback.ts";
export type { LocalStorageValue, LocalStorageValues } from "./storage.ts";
export type { Application } from "./open.ts";

export type {
  FormItemRef,
  FormProps,
  FormItemProps,
  FormValue,
  FormValues,
  FormEvent,
  FormTextFieldProps,
  FormTextAreaProps,
  FormCheckboxProps,
  FormDatePickerProps,
  FormDropdownProps,
  FormDropdownItemProps,
  FormDropdownSectionProps,
  FormDescriptionProps,
  FormPasswordFieldProps,
  FormTagPickerProps,
  FormTagPickerItemProps,
  FormLinkAccessoryProps,
  SubmitFormProps,
} from "./form.ts";

export type {
  MenuBarExtraProps,
  MenuBarItemProps,
  MenuBarSectionProps,
  MenuBarSubmenuProps,
  MenuBarActionEvent,
} from "./menu-bar.ts";

export type { FileSystemItem } from "./selection.ts";
export type { FormFilePickerProps } from "./form.ts";

export type {
  AskOptions,
  Creativity,
  ModelSelector,
  BrowserTab,
  BrowserContentOptions,
  ToolConfirmation,
} from "./ai-browser.ts";

// Keep the stub-backed value while exposing the provider's erased type surface.
import { AI as aiWithStubs } from "./unsupported.generated.ts";
export const AI = aiWithStubs;
export namespace AI {
  export type RegisteredModel = import("@blastlauncher/protocol").RegisteredModel<
    import("./types.ts").ImageLike
  >;
  export type GetModels = import("@blastlauncher/protocol").GetModels<
    import("./types.ts").ImageLike
  >;
  export type StreamCompletion = import("@blastlauncher/protocol").StreamCompletion<
    import("./types.ts").ImageLike
  >;
  export type ModelMessage = import("@blastlauncher/protocol").ModelMessage;
  export type ModelTool = import("@blastlauncher/protocol").ModelTool;
  export type ModelToolSet = import("@blastlauncher/protocol").ModelToolSet;
  export type ModelProviderOptions = import("@blastlauncher/protocol").ModelProviderOptions;
  export type ModelRequest = import("@blastlauncher/protocol").ModelRequest;
  export type ModelTextStream = import("@blastlauncher/protocol").ModelTextStream;
  export type ModelStreamPart = import("@blastlauncher/protocol").ModelStreamPart;
  export type ModelFullStream = import("@blastlauncher/protocol").ModelFullStream;
  export type ModelStream = import("@blastlauncher/protocol").ModelStream;
  export type ModelMessageContent =
    | import("@blastlauncher/protocol").ModelAssistantMessageContent
    | import("@blastlauncher/protocol").ModelUserMessageContent;
}

// Bind aliases to the public values, which include unsupported-member proxies.
import {
  Action,
  ActionPanel as actionPanelWithStubs,
  Alert,
  Clipboard,
  Form as formWithStubs,
  List,
  LocalStorage,
  Toast,
} from "./unsupported.generated.ts";
// Keep aliases on public facades without mutating the underlying implementations.
export const ActionPanel = new Proxy(actionPanelWithStubs, {
  get(target, key, receiver) {
    return key === "Item" ? Action : Reflect.get(target, key, receiver);
  },
});
const formAliases = {
  DropdownItem: formWithStubs.Dropdown.Item,
  DropdownSection: formWithStubs.Dropdown.Section,
  TagPickerItem: formWithStubs.TagPicker.Item,
};
export const Form = new Proxy(formWithStubs, {
  get(target, key, receiver) {
    return Object.hasOwn(formAliases, key)
      ? Reflect.get(formAliases, key)
      : Reflect.get(target, key, receiver);
  },
}) as typeof formWithStubs & typeof formAliases;
export const ActionPanelItem = Action;
export const ActionPanelSection = ActionPanel.Section;
export const ActionPanelSubmenu = ActionPanel.Submenu;
export const AlertActionStyle = Alert.ActionStyle;
export const CopyToClipboardAction = Action.CopyToClipboard;
export const FormCheckbox = Form.Checkbox;
export const FormDatePicker = Form.DatePicker;
export const FormDropdown = Form.Dropdown;
export const FormDropdownItem = Form.Dropdown.Item;
export const FormDropdownSection = Form.Dropdown.Section;
export const FormSeparator = Form.Separator;
export const FormTagPicker = Form.TagPicker;
export const FormTagPickerItem = Form.TagPicker.Item;
export const FormTextArea = Form.TextArea;
export const FormTextField = Form.TextField;
export const ImageMask = Image.Mask;
export const ListItem = List.Item;
export const ListSection = List.Section;
export const OpenAction = Action.Open;
export const OpenInBrowserAction = Action.OpenInBrowser;
export const OpenWithAction = Action.OpenWith;
export const PasteAction = Action.Paste;
export const PushAction = Action.Push;
export const ShowInFinderAction = Action.ShowInFinder;
export const SubmitFormAction = Action.SubmitForm;
export const ToastStyle = Toast.Style;
export const TrashAction = Action.Trash;
export const allLocalStorageItems = LocalStorage.allItems;
export const clearClipboard = Clipboard.clear;
export const clearLocalStorage = LocalStorage.clear;
export const copyTextToClipboard = Clipboard.copy;
export const getLocalStorageItem = LocalStorage.getItem;
export const pasteText = Clipboard.paste;
export const removeLocalStorageItem = LocalStorage.removeItem;
export const setLocalStorageItem = LocalStorage.setItem;
export const unstable_AI = AI;

/** @deprecated Use the key string directly. */
export const specialKeys = Object.fromEntries(
  [
    "return",
    "delete",
    "deleteForward",
    "tab",
    "arrowUp",
    "arrowDown",
    "arrowLeft",
    "arrowRight",
    "pageUp",
    "pageDown",
    "home",
    "end",
    "space",
    "escape",
    "enter",
    "backspace",
  ].map((key) => [key, key]),
);
export type ActionPanelItemProps = import("./action.ts").ActionProps;
export type CopyToClipboardActionProps = import("./action.ts").CopyToClipboardProps;
export type OpenActionProps = import("./action.ts").OpenProps;
export type OpenInBrowserActionProps = import("./action.ts").OpenInBrowserProps;
export type OpenWithActionProps = import("./action.ts").OpenWithProps;
export type PasteActionProps = import("./action.ts").PasteProps;
export type PushActionProps = import("./action.ts").PushProps;
export type ShowInFinderActionProps = import("./action.ts").ShowInFinderProps;
export type SubmitFormActionProps = import("./form.ts").SubmitFormProps;
export type TrashActionProps = import("./action.ts").TrashProps;
export type FormSeparatorProps = Record<string, never>;
export type DynamicColor = import("./types.ts").ColorDynamic;
export type KeyboardShortcut = import("./types.ts").Shortcut;
export type ActionPanelChildren = import("react").ReactNode;
export type ActionPanelSectionChildren = import("react").ReactNode;

/** @deprecated Use LaunchProps directly. */
export type ArgumentsLaunchProps = Partial<Pick<import("./launch.ts").LaunchProps, "arguments">>;
/** @deprecated Use LaunchProps directly. */
export type FormLaunchProps = Pick<import("./launch.ts").LaunchProps, "draftValues">;
