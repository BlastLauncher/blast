// Implemented `@raycast/api` exports. Element-valued props are
// rendered as `Slot` children (see docs/architecture.md, "Scene conventions").
import { Image } from "./enums.generated.ts";

export { Action, CopyToClipboard, type ActionProps, type CopyToClipboardProps } from "./action.ts";
export {
  Open,
  OpenAction,
  OpenWith,
  OpenWithAction,
  ShowInFinder,
  ShowInFinderAction,
  Trash,
  TrashAction,
  CreateSnippet,
  CreateQuicklink,
  ToggleQuickLook,
  PickDate,
  type OpenProps,
  type OpenWithProps,
  type ShowInFinderProps,
  type TrashProps,
  type Snippet,
  type Quicklink,
  type CreateSnippetProps,
  type CreateQuicklinkProps,
  type ToggleQuickLookProps,
  type PickDateProps,
  type DatePickerTypeValue,
  type InstallMCPServerProps,
  type MCPServer,
  type StdioMCPServer,
  type SSEMCPServer,
  type IconValue,
} from "./action.ts";
export {
  ActionPanel,
  ActionPanelItem,
  ActionPanelSubmenu,
  type ActionPanelProps,
  type ActionPanelSectionProps,
  type ActionPanelSubmenuProps,
} from "./action-panel.ts";
export {
  Clipboard,
  type ClipboardContent,
  type CopyOptions,
  type ReadContent,
} from "./clipboard.ts";
export { environment, type Environment } from "./environment.ts";
export {
  Grid,
  type GridAspectRatio,
  type GridDropdownItemProps,
  type GridDropdownProps,
  type GridDropdownSectionProps,
  type GridEmptyViewProps,
  type GridFit,
  type GridInset,
  type GridItemAccessory,
  type GridItemContent,
  type GridItemProps,
  type GridItemSize,
  type GridProps,
  type GridSectionProps,
} from "./grid.ts";
export {
  List,
  type ListProps,
  type ListItemProps,
  type ListSectionProps,
  type ListEmptyViewProps,
  type ListAccessory,
  type ListDropdownProps,
  type ListDropdownItemProps,
  type ListDropdownSectionProps,
} from "./list.ts";
export {
  getPreferenceValues,
  openCommandPreferences,
  openExtensionPreferences,
  type PreferenceValues,
} from "./preferences.ts";

export { Icon, Color, Image, LaunchType, PopToRootType } from "./enums.generated.ts";
/** Deprecated alias of `Image.Mask`, exactly as the declarations define it. */
export const ImageMask = Image.Mask;
export { OpenInBrowser, Paste, CopyToClipboardAction, PasteAction } from "./action.ts";
export { Detail, type DetailProps } from "./detail.ts";
export { Keyboard } from "./keyboard.ts";

export { closeMainWindow, type CloseMainWindowOptions } from "./window.ts";
export {
  launchCommand,
  updateCommandMetadata,
  type LaunchCommandOptions,
  type LaunchContext,
  type LaunchProps,
  type LaunchTypeValue,
} from "./launch.ts";

export { PushAction } from "./action.ts";
export {
  popToRoot,
  clearSearchBar,
  useNavigation,
  type ClearSearchBarOptions,
} from "./navigation.ts";

export {
  Toast,
  ToastStyle,
  Alert,
  AlertActionStyle,
  showToast,
  showHUD,
  confirmAlert,
} from "./feedback.ts";
export {
  LocalStorage,
  allLocalStorageItems,
  clearLocalStorage,
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
  type LocalStorageValue,
  type LocalStorageValues,
} from "./storage.ts";
export { open, type Application } from "./open.ts";
export { getApplications, getDefaultApplication } from "./applications.ts";

export { captureException, captureMemorySnapshot } from "./diagnostics.ts";

export {
  WindowManagement,
  DesktopType,
  type Desktop,
  type DesktopTypeValue,
  type Window,
  type WindowBounds,
  type SetWindowBoundsOptions,
} from "./window-management.ts";

export { Form, SubmitForm as SubmitFormAction } from "./form.ts";

export { Cache } from "./cache.ts";

export { MenuBarExtra } from "./menu-bar.ts";

export {
  getSelectedText,
  getSelectedFinderItems,
  getFrontmostApplication,
  showInFinder,
  trash,
} from "./selection.ts";

export { OAuth } from "./oauth.ts";

export { AI, BrowserExtension, Tool, unstable_AI, useUnstableAI } from "./ai-browser.ts";
