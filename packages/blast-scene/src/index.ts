import {
  validateProtocolEnvelope,
  type ProtocolEnvelope,
  type ValidationIssue,
  type ValidationResult,
} from "@blastlauncher/protocol";

export const SCENE_TRANSACTION_MESSAGE = "scene.transaction" as const;
export const SCENE_EVENT_MESSAGE = "scene.event" as const;
export const UI_TOAST_MESSAGE = "ui.toast" as const;

export const SCENE_NODE_TYPES = [
  "list",
  "list-item",
  "list-section",
  "list-empty-view",
  "list-dropdown",
  "list-dropdown-item",
  "list-dropdown-section",
  "grid",
  "grid-item",
  "grid-section",
  "grid-empty-view",
  "grid-dropdown",
  "grid-dropdown-item",
  "grid-dropdown-section",
  "menu-bar-extra",
  "menu-bar-item",
  "menu-bar-section",
  "menu-bar-submenu",
  "menu-bar-separator",
  "action",
  "detail",
  "detail-metadata",
  "detail-metadata-label",
  "detail-metadata-separator",
  "detail-metadata-link",
  "detail-metadata-tag-list",
  "detail-metadata-tag-list-item",
  "action-group",
  "form",
  "form-link-accessory",
  "form-text-field",
  "form-text-area",
  "form-password-field",
  "form-checkbox",
  "form-dropdown",
  "form-dropdown-item",
  "form-dropdown-section",
  "form-date-picker",
  "form-tag-picker",
  "form-tag-picker-item",
  "form-file-picker",
  "form-description",
  "form-separator",
] as const;

export type SceneNodeType = (typeof SCENE_NODE_TYPES)[number];

/**
 * A normalized keyboard shortcut. Keeping this structured lets clients
 * render platform-specific shortcut labels without parsing display text.
 */
export interface SceneShortcut {
  readonly modifiers: readonly string[];
  readonly key: string;
}

export type ScenePropValue = string | number | boolean | readonly string[] | SceneShortcut;

export interface SceneNode {
  readonly id: string;
  readonly type: SceneNodeType;
  readonly props: Readonly<Record<string, ScenePropValue>>;
  readonly children: readonly SceneNode[];
}

export type SceneSnapshotOperation = { readonly type: "snapshot"; readonly root: SceneNode };

export type SceneInsertOperation = {
  readonly type: "insert";
  readonly node: SceneNode;
  readonly parentId: string;
  readonly index?: number;
};

export type SceneUpdateOperation = {
  readonly type: "update";
  readonly nodeId: string;
  readonly props: Readonly<Record<string, ScenePropValue | null>>;
};

export type SceneRemoveOperation = { readonly type: "remove"; readonly nodeId: string };

export type SceneReorderOperation = {
  readonly type: "reorder";
  readonly parentId: string;
  readonly order: readonly string[];
};

export type SceneOperation =
  | SceneSnapshotOperation
  | SceneInsertOperation
  | SceneUpdateOperation
  | SceneRemoveOperation
  | SceneReorderOperation;

export interface SceneTransaction {
  readonly transactionId: string;
  readonly operations: readonly SceneOperation[];
}

export interface SceneEventPayload {
  readonly eventId: string;
  /**
   * Values supplied by a client when an interactive form control changes or
   * when a form action is submitted. The wire representation deliberately
   * stays JSON-compatible; dates are ISO strings and multi-value controls use
   * arrays of strings.
   */
  readonly values?: SceneFormValues;
}

export type SceneFormValue = string | boolean | null | readonly string[];
export type SceneFormValues = Readonly<Record<string, SceneFormValue>>;

export type SceneTransactionMessage = ProtocolEnvelope<typeof SCENE_TRANSACTION_MESSAGE, SceneTransaction>;

export type SceneEventMessage = ProtocolEnvelope<typeof SCENE_EVENT_MESSAGE, SceneEventPayload>;

/**
 * Receives one ordered transaction per commit. The React renderer publishes to
 * this boundary (ADR 0004); clients and test harnesses consume it without
 * knowing which transport carried the transaction.
 */
export interface SceneTransactionSink {
  publish(transaction: SceneTransaction): void | Promise<void>;
}

/**
 * Deterministic in-memory sink used by tests and the first client fixtures.
 */
export function createCollectingSceneSink(): SceneTransactionSink & {
  readonly transactions: SceneTransaction[];
} {
  const transactions: SceneTransaction[] = [];
  return {
    transactions,
    publish(transaction) {
      transactions.push(transaction);
    },
  };
}

const PROP_WHITELIST: Record<SceneNodeType, readonly string[]> = {
  list: [
    "navigationTitle",
    "searchBarPlaceholder",
    "isLoading",
    "isShowingDetail",
    "searchText",
    "filtering",
    "filteringKeepSectionOrder",
    "throttle",
    "selectedItemId",
    "onSelectionChange",
    "onSearchTextChange",
    "paginationPageSize",
    "paginationHasMore",
    "onLoadMore",
  ],
  "list-item": [
    "id",
    "title",
    "titleTooltip",
    "subtitle",
    "subtitleTooltip",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "iconTooltip",
    "keywords",
    "accessories",
    "accessoryIcon",
    "accessoryIconDark",
    "accessoryIconFallback",
    "accessoryIconFallbackDark",
    "accessoryIconMask",
    "accessoryIconTintColor",
    "accessoryIconTintColorDark",
    "accessoryIconTintColorAdjustContrast",
    "accessoryTitle",
    "quickLookPath",
    "quickLookName",
  ],
  "list-section": ["id", "title", "subtitle"],
  "list-empty-view": [
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "title",
    "description",
  ],
  "list-dropdown": [
    "id",
    "tooltip",
    "placeholder",
    "isLoading",
    "filtering",
    "filteringKeepSectionOrder",
    "throttle",
    "storeValue",
    "value",
    "defaultValue",
    "onChange",
    "onSearchTextChange",
  ],
  "list-dropdown-item": [
    "value",
    "title",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "keywords",
  ],
  "list-dropdown-section": ["title"],
  grid: [
    "navigationTitle",
    "searchBarPlaceholder",
    "isLoading",
    "columns",
    "itemSize",
    "aspectRatio",
    "fit",
    "inset",
    "searchText",
    "filtering",
    "filteringKeepSectionOrder",
    "throttle",
    "selectedItemId",
    "onSelectionChange",
    "onSearchTextChange",
    "paginationPageSize",
    "paginationHasMore",
    "onLoadMore",
  ],
  "grid-item": [
    "id",
    "content",
    "contentDark",
    "contentFallback",
    "contentFallbackDark",
    "contentMask",
    "contentTintColor",
    "contentTintColorDark",
    "contentTintColorAdjustContrast",
    "contentTooltip",
    "title",
    "subtitle",
    "keywords",
    "accessoryIcon",
    "accessoryIconDark",
    "accessoryIconFallback",
    "accessoryIconFallbackDark",
    "accessoryIconMask",
    "accessoryIconTintColor",
    "accessoryIconTintColorDark",
    "accessoryIconTintColorAdjustContrast",
    "accessoryTooltip",
    "quickLookPath",
    "quickLookName",
  ],
  "grid-section": ["title", "subtitle", "columns", "aspectRatio", "fit", "inset"],
  "grid-empty-view": [
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "title",
    "description",
  ],
  "grid-dropdown": [
    "id",
    "tooltip",
    "placeholder",
    "isLoading",
    "filtering",
    "filteringKeepSectionOrder",
    "throttle",
    "storeValue",
    "value",
    "defaultValue",
    "onChange",
    "onSearchTextChange",
  ],
  "grid-dropdown-item": [
    "value",
    "title",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "keywords",
  ],
  "grid-dropdown-section": ["title"],
  "menu-bar-extra": [
    "title",
    "tooltip",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "isLoading",
  ],
  "menu-bar-item": [
    "title",
    "subtitle",
    "tooltip",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "shortcut",
    "onAction",
    "isAlternate",
  ],
  "menu-bar-section": ["title"],
  "menu-bar-submenu": [
    "title",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
  ],
  "menu-bar-separator": [],
  action: [
    "id",
    "title",
    "onAction",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "shortcut",
    "style",
    "autoFocus",
  ],
  detail: ["markdown", "navigationTitle", "isLoading"],
  "detail-metadata": [],
  "detail-metadata-label": [
    "title",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "text",
    "textColor",
  ],
  "detail-metadata-separator": [],
  "detail-metadata-link": ["title", "target", "text"],
  "detail-metadata-tag-list": ["title"],
  "detail-metadata-tag-list-item": [
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "text",
    "color",
    "onAction",
  ],
  "action-group": [
    "id",
    "title",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
    "shortcut",
    "filtering",
    "filteringKeepSectionOrder",
    "isLoading",
    "throttle",
    "onSearchTextChange",
    "onOpen",
    "autoFocus",
    "isSubmenu",
  ],
  form: ["navigationTitle", "isLoading", "enableDrafts"],
  "form-link-accessory": ["target", "text", "onOpen"],
  "form-text-field": [
    "id",
    "title",
    "placeholder",
    "info",
    "error",
    "storeValue",
    "autoFocus",
    "value",
    "defaultValue",
    "onChange",
    "onFocus",
    "onBlur",
  ],
  "form-text-area": [
    "id",
    "title",
    "placeholder",
    "info",
    "error",
    "storeValue",
    "autoFocus",
    "value",
    "defaultValue",
    "enableMarkdown",
    "onChange",
    "onFocus",
    "onBlur",
  ],
  "form-password-field": [
    "id",
    "title",
    "placeholder",
    "info",
    "error",
    "storeValue",
    "autoFocus",
    "value",
    "defaultValue",
    "onChange",
    "onFocus",
    "onBlur",
  ],
  "form-checkbox": [
    "id",
    "title",
    "label",
    "info",
    "error",
    "storeValue",
    "autoFocus",
    "value",
    "defaultValue",
    "onChange",
    "onFocus",
    "onBlur",
  ],
  "form-dropdown": [
    "id",
    "title",
    "placeholder",
    "isLoading",
    "filtering",
    "filteringKeepSectionOrder",
    "throttle",
    "info",
    "error",
    "storeValue",
    "autoFocus",
    "value",
    "defaultValue",
    "onChange",
    "onFocus",
    "onBlur",
    "onSearchTextChange",
  ],
  "form-dropdown-item": [
    "value",
    "title",
    "keywords",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
  ],
  "form-dropdown-section": ["title"],
  "form-date-picker": [
    "id",
    "title",
    "type",
    "min",
    "max",
    "info",
    "error",
    "storeValue",
    "autoFocus",
    "value",
    "defaultValue",
    "onChange",
    "onFocus",
    "onBlur",
  ],
  "form-tag-picker": [
    "id",
    "title",
    "placeholder",
    "info",
    "error",
    "storeValue",
    "autoFocus",
    "value",
    "defaultValue",
    "onChange",
    "onFocus",
    "onBlur",
  ],
  "form-tag-picker-item": [
    "value",
    "title",
    "icon",
    "iconDark",
    "iconFallback",
    "iconFallbackDark",
    "iconMask",
    "iconTintColor",
    "iconTintColorDark",
    "iconTintColorAdjustContrast",
  ],
  "form-file-picker": [
    "id",
    "title",
    "info",
    "error",
    "storeValue",
    "autoFocus",
    "value",
    "defaultValue",
    "onChange",
    "onFocus",
    "onBlur",
    "canChooseFiles",
    "canChooseDirectories",
    "showHiddenFiles",
    "allowMultipleSelection",
  ],
  "form-description": ["title", "text"],
  "form-separator": [],
};

/**
 * The documented per-type property whitelist. Producers such as the React
 * renderer serialize exactly these properties; anything else is a contract
 * violation.
 */
export const SCENE_PROP_WHITELIST: Record<SceneNodeType, readonly string[]> = PROP_WHITELIST;

const REQUIRED_PROPS: Record<SceneNodeType, readonly string[]> = {
  list: [],
  "list-item": ["title"],
  "list-section": [],
  "list-empty-view": [],
  "list-dropdown": [],
  "list-dropdown-item": ["value", "title"],
  "list-dropdown-section": [],
  grid: [],
  "grid-item": ["content"],
  "grid-section": [],
  "grid-empty-view": [],
  "grid-dropdown": [],
  "grid-dropdown-item": ["value", "title"],
  "grid-dropdown-section": [],
  "menu-bar-extra": [],
  "menu-bar-item": ["title"],
  "menu-bar-section": [],
  "menu-bar-submenu": ["title"],
  "menu-bar-separator": [],
  action: ["title", "onAction"],
  detail: [],
  "detail-metadata": [],
  "detail-metadata-label": ["title"],
  "detail-metadata-separator": [],
  "detail-metadata-link": ["title", "target", "text"],
  "detail-metadata-tag-list": ["title"],
  "detail-metadata-tag-list-item": [],
  "action-group": [],
  form: [],
  "form-link-accessory": ["target", "text", "onOpen"],
  "form-text-field": ["id", "onChange"],
  "form-text-area": ["id", "onChange"],
  "form-password-field": ["id", "onChange"],
  "form-checkbox": ["id", "label", "onChange"],
  "form-dropdown": ["id", "onChange"],
  "form-dropdown-item": ["value", "title"],
  "form-dropdown-section": [],
  "form-date-picker": ["id", "onChange"],
  "form-tag-picker": ["id", "onChange"],
  "form-tag-picker-item": ["value", "title"],
  "form-file-picker": ["id", "onChange"],
  "form-description": ["text"],
  "form-separator": [],
};

type ScenePropType = "string" | "boolean" | "number" | "string[]" | "shortcut";

const PROP_TYPES: Record<SceneNodeType, Readonly<Record<string, ScenePropType>>> = {
  list: {
    navigationTitle: "string",
    searchBarPlaceholder: "string",
    isLoading: "boolean",
    isShowingDetail: "boolean",
    searchText: "string",
    filtering: "boolean",
    filteringKeepSectionOrder: "boolean",
    throttle: "boolean",
    selectedItemId: "string",
    onSelectionChange: "string",
    onSearchTextChange: "string",
    paginationPageSize: "number",
    paginationHasMore: "boolean",
    onLoadMore: "string",
  },
  "list-item": {
    id: "string",
    title: "string",
    titleTooltip: "string",
    subtitle: "string",
    subtitleTooltip: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    iconTooltip: "string",
    keywords: "string[]",
    accessories: "string",
    accessoryIcon: "string",
    accessoryIconDark: "string",
    accessoryIconFallback: "string",
    accessoryIconFallbackDark: "string",
    accessoryIconMask: "string",
    accessoryIconTintColor: "string",
    accessoryIconTintColorDark: "string",
    accessoryIconTintColorAdjustContrast: "boolean",
    accessoryTitle: "string",
    quickLookPath: "string",
    quickLookName: "string",
  },
  "list-section": { id: "string", title: "string", subtitle: "string" },
  "list-empty-view": {
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    title: "string",
    description: "string",
  },
  "list-dropdown": {
    id: "string",
    tooltip: "string",
    placeholder: "string",
    isLoading: "boolean",
    filtering: "boolean",
    filteringKeepSectionOrder: "boolean",
    throttle: "boolean",
    storeValue: "boolean",
    value: "string",
    defaultValue: "string",
    onChange: "string",
    onSearchTextChange: "string",
  },
  "list-dropdown-item": {
    value: "string",
    title: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    keywords: "string[]",
  },
  "list-dropdown-section": { title: "string" },
  grid: {
    navigationTitle: "string",
    searchBarPlaceholder: "string",
    isLoading: "boolean",
    columns: "number",
    itemSize: "string",
    aspectRatio: "string",
    fit: "string",
    inset: "string",
    searchText: "string",
    filtering: "boolean",
    filteringKeepSectionOrder: "boolean",
    throttle: "boolean",
    selectedItemId: "string",
    onSelectionChange: "string",
    onSearchTextChange: "string",
    paginationPageSize: "number",
    paginationHasMore: "boolean",
    onLoadMore: "string",
  },
  "grid-item": {
    id: "string",
    content: "string",
    contentDark: "string",
    contentFallback: "string",
    contentFallbackDark: "string",
    contentMask: "string",
    contentTintColor: "string",
    contentTintColorDark: "string",
    contentTintColorAdjustContrast: "boolean",
    contentTooltip: "string",
    title: "string",
    subtitle: "string",
    keywords: "string[]",
    accessoryIcon: "string",
    accessoryIconDark: "string",
    accessoryIconFallback: "string",
    accessoryIconFallbackDark: "string",
    accessoryIconMask: "string",
    accessoryIconTintColor: "string",
    accessoryIconTintColorDark: "string",
    accessoryIconTintColorAdjustContrast: "boolean",
    accessoryTooltip: "string",
    quickLookPath: "string",
    quickLookName: "string",
  },
  "grid-section": {
    title: "string",
    subtitle: "string",
    columns: "number",
    aspectRatio: "string",
    fit: "string",
    inset: "string",
  },
  "grid-empty-view": {
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    title: "string",
    description: "string",
  },
  "grid-dropdown": {
    id: "string",
    tooltip: "string",
    placeholder: "string",
    isLoading: "boolean",
    filtering: "boolean",
    filteringKeepSectionOrder: "boolean",
    throttle: "boolean",
    storeValue: "boolean",
    value: "string",
    defaultValue: "string",
    onChange: "string",
    onSearchTextChange: "string",
  },
  "grid-dropdown-item": {
    value: "string",
    title: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    keywords: "string[]",
  },
  "grid-dropdown-section": { title: "string" },
  "menu-bar-extra": {
    title: "string",
    tooltip: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    isLoading: "boolean",
  },
  "menu-bar-item": {
    title: "string",
    subtitle: "string",
    tooltip: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    shortcut: "shortcut",
    onAction: "string",
    isAlternate: "boolean",
  },
  "menu-bar-section": { title: "string" },
  "menu-bar-submenu": {
    title: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
  },
  "menu-bar-separator": {},
  action: {
    id: "string",
    title: "string",
    onAction: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    shortcut: "shortcut",
    style: "string",
    autoFocus: "boolean",
  },
  detail: { markdown: "string", navigationTitle: "string", isLoading: "boolean" },
  "detail-metadata": {},
  "detail-metadata-label": {
    title: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    text: "string",
    textColor: "string",
  },
  "detail-metadata-separator": {},
  "detail-metadata-link": { title: "string", target: "string", text: "string" },
  "detail-metadata-tag-list": { title: "string" },
  "detail-metadata-tag-list-item": {
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    text: "string",
    color: "string",
    onAction: "string",
  },
  "action-group": {
    id: "string",
    title: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
    shortcut: "shortcut",
    filtering: "boolean",
    filteringKeepSectionOrder: "boolean",
    isLoading: "boolean",
    throttle: "boolean",
    onSearchTextChange: "string",
    onOpen: "string",
    autoFocus: "boolean",
    isSubmenu: "boolean",
  },
  form: { navigationTitle: "string", isLoading: "boolean", enableDrafts: "boolean" },
  "form-link-accessory": { target: "string", text: "string", onOpen: "string" },
  "form-text-field": {
    id: "string",
    title: "string",
    placeholder: "string",
    info: "string",
    error: "string",
    storeValue: "boolean",
    autoFocus: "boolean",
    value: "string",
    defaultValue: "string",
    onChange: "string",
    onFocus: "string",
    onBlur: "string",
  },
  "form-text-area": {
    id: "string",
    title: "string",
    placeholder: "string",
    info: "string",
    error: "string",
    storeValue: "boolean",
    autoFocus: "boolean",
    value: "string",
    defaultValue: "string",
    enableMarkdown: "boolean",
    onChange: "string",
    onFocus: "string",
    onBlur: "string",
  },
  "form-password-field": {
    id: "string",
    title: "string",
    placeholder: "string",
    info: "string",
    error: "string",
    storeValue: "boolean",
    autoFocus: "boolean",
    value: "string",
    defaultValue: "string",
    onChange: "string",
    onFocus: "string",
    onBlur: "string",
  },
  "form-checkbox": {
    id: "string",
    title: "string",
    label: "string",
    info: "string",
    error: "string",
    storeValue: "boolean",
    autoFocus: "boolean",
    value: "boolean",
    defaultValue: "boolean",
    onChange: "string",
    onFocus: "string",
    onBlur: "string",
  },
  "form-dropdown": {
    id: "string",
    title: "string",
    placeholder: "string",
    isLoading: "boolean",
    filtering: "boolean",
    filteringKeepSectionOrder: "boolean",
    throttle: "boolean",
    info: "string",
    error: "string",
    storeValue: "boolean",
    autoFocus: "boolean",
    value: "string",
    defaultValue: "string",
    onChange: "string",
    onFocus: "string",
    onBlur: "string",
    onSearchTextChange: "string",
  },
  "form-dropdown-item": {
    value: "string",
    title: "string",
    keywords: "string[]",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
  },
  "form-dropdown-section": { title: "string" },
  "form-date-picker": {
    id: "string",
    title: "string",
    type: "string",
    min: "string",
    max: "string",
    info: "string",
    error: "string",
    storeValue: "boolean",
    autoFocus: "boolean",
    value: "string",
    defaultValue: "string",
    onChange: "string",
    onFocus: "string",
    onBlur: "string",
  },
  "form-tag-picker": {
    id: "string",
    title: "string",
    placeholder: "string",
    info: "string",
    error: "string",
    storeValue: "boolean",
    autoFocus: "boolean",
    value: "string[]",
    defaultValue: "string[]",
    onChange: "string",
    onFocus: "string",
    onBlur: "string",
  },
  "form-tag-picker-item": {
    value: "string",
    title: "string",
    icon: "string",
    iconDark: "string",
    iconFallback: "string",
    iconFallbackDark: "string",
    iconMask: "string",
    iconTintColor: "string",
    iconTintColorDark: "string",
    iconTintColorAdjustContrast: "boolean",
  },
  "form-file-picker": {
    id: "string",
    title: "string",
    info: "string",
    error: "string",
    storeValue: "boolean",
    autoFocus: "boolean",
    value: "string[]",
    defaultValue: "string[]",
    onChange: "string",
    onFocus: "string",
    onBlur: "string",
    canChooseFiles: "boolean",
    canChooseDirectories: "boolean",
    showHiddenFiles: "boolean",
    allowMultipleSelection: "boolean",
  },
  "form-description": { title: "string", text: "string" },
  "form-separator": {},
};

const CHILD_TYPES: Record<SceneNodeType, readonly SceneNodeType[]> = {
  list: ["list-item", "list-section", "list-empty-view", "list-dropdown", "grid-dropdown", "action-group"],
  "list-item": ["action", "action-group", "detail"],
  "list-section": ["list-item", "list-empty-view"],
  "list-empty-view": ["action-group"],
  "list-dropdown": ["list-dropdown-item", "list-dropdown-section"],
  "list-dropdown-item": [],
  "list-dropdown-section": ["list-dropdown-item"],
  grid: ["grid-item", "grid-section", "grid-empty-view", "grid-dropdown", "list-dropdown", "action-group"],
  "grid-item": ["action", "action-group"],
  "grid-section": ["grid-item"],
  "grid-empty-view": ["action-group"],
  "grid-dropdown": ["grid-dropdown-item", "grid-dropdown-section"],
  "grid-dropdown-item": [],
  "grid-dropdown-section": ["grid-dropdown-item"],
  "menu-bar-extra": ["menu-bar-item", "menu-bar-section", "menu-bar-submenu", "menu-bar-separator"],
  "menu-bar-item": ["menu-bar-item"],
  "menu-bar-section": ["menu-bar-item", "menu-bar-submenu"],
  "menu-bar-submenu": ["menu-bar-item", "menu-bar-section", "menu-bar-submenu", "menu-bar-separator"],
  "menu-bar-separator": [],
  action: [],
  detail: ["detail-metadata", "action-group"],
  "detail-metadata": [
    "detail-metadata-label",
    "detail-metadata-separator",
    "detail-metadata-link",
    "detail-metadata-tag-list",
  ],
  "detail-metadata-label": [],
  "detail-metadata-separator": [],
  "detail-metadata-link": [],
  "detail-metadata-tag-list": ["detail-metadata-tag-list-item"],
  "detail-metadata-tag-list-item": [],
  "action-group": ["action", "action-group"],
  form: [
    "form-link-accessory",
    "form-text-field",
    "form-text-area",
    "form-password-field",
    "form-checkbox",
    "form-dropdown",
    "form-date-picker",
    "form-tag-picker",
    "form-file-picker",
    "form-description",
    "form-separator",
    "action-group",
  ],
  "form-link-accessory": [],
  "form-text-field": [],
  "form-text-area": [],
  "form-password-field": [],
  "form-checkbox": [],
  "form-dropdown": ["form-dropdown-item", "form-dropdown-section"],
  "form-dropdown-item": [],
  "form-dropdown-section": ["form-dropdown-item"],
  "form-date-picker": [],
  "form-tag-picker": ["form-tag-picker-item"],
  "form-tag-picker-item": [],
  "form-file-picker": [],
  "form-description": [],
  "form-separator": [],
};

export class SceneError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SceneError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
export function validateSceneTransactionMessage(value: unknown): ValidationResult<SceneTransactionMessage> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value.type !== SCENE_TRANSACTION_MESSAGE) {
    return invalid("$.type", `Expected ${JSON.stringify(SCENE_TRANSACTION_MESSAGE)}`);
  }

  const issues: ValidationIssue[] = [];
  validateTransactionPayload(envelope.value.payload, "$.payload", issues);
  return issues.length === 0 ? { ok: true, value: envelope.value as SceneTransactionMessage } : { ok: false, issues };
}

export function validateSceneTransactionPayload(value: unknown): ValidationResult<SceneTransaction> {
  const issues: ValidationIssue[] = [];
  validateTransactionPayload(value, "$", issues);
  return issues.length === 0 ? { ok: true, value: value as SceneTransaction } : { ok: false, issues };
}

function validateTransactionPayload(value: unknown, basePath: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: basePath, message: "Expected an object" });
    return;
  }
  validateNonEmptyString(value.transactionId, `${basePath}.transactionId`, issues);
  if (!Array.isArray(value.operations)) {
    issues.push({ path: `${basePath}.operations`, message: "Expected an array" });
    return;
  }
  value.operations.forEach((operation, index) => {
    validateOperation(operation, `${basePath}.operations[${index}]`, issues);
  });
}

export function validateSceneEventMessage(value: unknown): ValidationResult<SceneEventMessage> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value.type !== SCENE_EVENT_MESSAGE) {
    return invalid("$.type", `Expected ${JSON.stringify(SCENE_EVENT_MESSAGE)}`);
  }

  const issues: ValidationIssue[] = [];
  validateEventPayload(envelope.value.payload, "$.payload", issues);
  return issues.length === 0 ? { ok: true, value: envelope.value as SceneEventMessage } : { ok: false, issues };
}

export const TOAST_STYLES = ["success", "failure", "animated", "neutral"] as const;

export type ToastStyle = (typeof TOAST_STYLES)[number];

export const TOAST_OPERATIONS = ["show", "update", "hide"] as const;

export type ToastOperation = (typeof TOAST_OPERATIONS)[number];

export interface ToastActionPayload {
  readonly title: string;
  readonly eventId: string;
  readonly shortcut?: SceneShortcut;
}

export interface ToastPayload {
  readonly toastId?: string;
  readonly operation?: ToastOperation;
  readonly title?: string;
  readonly message?: string;
  readonly style?: ToastStyle;
  readonly primaryAction?: ToastActionPayload;
  readonly secondaryAction?: ToastActionPayload;
}

export type ToastMessage = ProtocolEnvelope<typeof UI_TOAST_MESSAGE, ToastPayload>;

export function validateToastMessage(value: unknown): ValidationResult<ToastMessage> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value.type !== UI_TOAST_MESSAGE) {
    return invalid("$.type", `Expected ${JSON.stringify(UI_TOAST_MESSAGE)}`);
  }

  const issues: ValidationIssue[] = [];
  validateToastPayloadShape(envelope.value.payload, "$.payload", issues);
  return issues.length === 0 ? { ok: true, value: envelope.value as ToastMessage } : { ok: false, issues };
}

export function validateToastPayload(value: unknown): ValidationResult<ToastPayload> {
  const issues: ValidationIssue[] = [];
  validateToastPayloadShape(value, "$", issues);
  return issues.length === 0 ? { ok: true, value: value as ToastPayload } : { ok: false, issues };
}

function validateToastPayloadShape(value: unknown, basePath: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: basePath, message: "Expected an object" });
    return;
  }

  const operation = value.operation === undefined ? "show" : value.operation;
  if (typeof operation !== "string" || !TOAST_OPERATIONS.includes(operation as ToastOperation)) {
    issues.push({ path: `${basePath}.operation`, message: "Unknown toast operation" });
    return;
  }
  if (value.toastId !== undefined) {
    validateNonEmptyString(value.toastId, `${basePath}.toastId`, issues);
  }
  if ((operation === "update" || operation === "hide") && value.toastId === undefined) {
    issues.push({ path: `${basePath}.toastId`, message: "Toast operation requires a toastId" });
  }
  if (operation === "hide") {
    return;
  }

  validateNonEmptyString(value.title, `${basePath}.title`, issues);
  if (value.message !== undefined && (typeof value.message !== "string" || value.message.length === 0)) {
    issues.push({ path: `${basePath}.message`, message: "Expected a non-empty string" });
  }
  if (
    value.style !== undefined &&
    value.style !== "success" &&
    value.style !== "failure" &&
    value.style !== "animated" &&
    value.style !== "neutral"
  ) {
    issues.push({ path: `${basePath}.style`, message: "Unknown toast style" });
  }
  validateToastActionPayload(value.primaryAction, `${basePath}.primaryAction`, issues);
  validateToastActionPayload(value.secondaryAction, `${basePath}.secondaryAction`, issues);
}

function validateToastActionPayload(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected an object" });
    return;
  }
  validateNonEmptyString(value.title, `${path}.title`, issues);
  validateNonEmptyString(value.eventId, `${path}.eventId`, issues);
  if (value.shortcut !== undefined && !isSceneShortcut(value.shortcut)) {
    issues.push({ path: `${path}.shortcut`, message: "Expected a normalized shortcut object" });
  }
}

export function validateSceneEventPayload(value: unknown): ValidationResult<SceneEventPayload> {
  const issues: ValidationIssue[] = [];
  validateEventPayload(value, "$", issues);
  return issues.length === 0 ? { ok: true, value: value as SceneEventPayload } : { ok: false, issues };
}

function validateEventPayload(value: unknown, basePath: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: basePath, message: "Expected an object" });
    return;
  }
  validateNonEmptyString(value.eventId, `${basePath}.eventId`, issues);
  if (value.values !== undefined) {
    if (!isRecord(value.values)) {
      issues.push({ path: `${basePath}.values`, message: "Expected an object" });
    } else {
      for (const [key, formValue] of Object.entries(value.values)) {
        validateNonEmptyString(key, `${basePath}.values.${key}`, issues);
        if (!isSceneFormValue(formValue)) {
          issues.push({
            path: `${basePath}.values.${key}`,
            message: "Expected a string, boolean, null, or string array form value",
          });
        }
      }
    }
  }
}
function validateOperation(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value) || typeof value.type !== "string") {
    issues.push({ path, message: "Expected an operation object with a type" });
    return;
  }

  switch (value.type) {
    case "snapshot":
      validateNode(value.root, `${path}.root`, issues);
      return;
    case "insert":
      validateNode(value.node, `${path}.node`, issues);
      validateNonEmptyString(value.parentId, `${path}.parentId`, issues);
      if (value.index !== undefined && (!isInteger(value.index) || value.index < 0)) {
        issues.push({ path: `${path}.index`, message: "Expected a non-negative integer" });
      }
      return;
    case "update":
      validateNonEmptyString(value.nodeId, `${path}.nodeId`, issues);
      validateUpdateProps(value.props, issues);
      return;
    case "remove":
      validateNonEmptyString(value.nodeId, `${path}.nodeId`, issues);
      return;
    case "reorder":
      validateNonEmptyString(value.parentId, `${path}.parentId`, issues);
      if (!Array.isArray(value.order)) {
        issues.push({ path: `${path}.order`, message: "Expected an array" });
        return;
      }
      value.order.forEach((nodeId, index) => {
        validateNonEmptyString(nodeId, `${path}.order[${index}]`, issues);
      });
      return;
    default:
      issues.push({ path: `${path}.type`, message: "Unknown scene operation type" });
  }
}

function validateNode(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a scene node object" });
    return;
  }
  validateNonEmptyString(value.id, `${path}.id`, issues);
  if (typeof value.type !== "string" || !SCENE_NODE_TYPES.includes(value.type as SceneNodeType)) {
    issues.push({ path: `${path}.type`, message: "Unknown scene node type" });
    return;
  }
  const nodeType = value.type as SceneNodeType;

  if (!isRecord(value.props)) {
    issues.push({ path: `${path}.props`, message: "Expected a props object" });
    return;
  }
  for (const key of Object.keys(value.props)) {
    if (!PROP_WHITELIST[nodeType].includes(key)) {
      issues.push({ path: `${path}.props.${key}`, message: "Property is not in the whitelist" });
      continue;
    }
    const expected = PROP_TYPES[nodeType][key];
    if (expected !== undefined && !isPropType(value.props[key], expected)) {
      issues.push({ path: `${path}.props.${key}`, message: `Expected a ${expected} value` });
    }
  }
  for (const required of REQUIRED_PROPS[nodeType]) {
    if (!(required in value.props)) {
      issues.push({ path: `${path}.props.${required}`, message: "Required property is missing" });
    }
  }

  if (!Array.isArray(value.children)) {
    issues.push({ path: `${path}.children`, message: "Expected a children array" });
    return;
  }
  value.children.forEach((child, index) => {
    const childPath = `${path}.children[${index}]`;
    if (isRecord(child) && !CHILD_TYPES[nodeType].includes(child.type as SceneNodeType)) {
      issues.push({ path: `${childPath}.type`, message: `A ${nodeType} cannot contain a ${String(child.type)}` });
    }
    validateNode(child, childPath, issues);
  });
}

function validateUpdateProps(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: "props", message: "Expected a props object" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (value[key] !== null) {
      validatePropValue(value[key], `props.${key}`, issues);
    }
  }
}

function validatePropValue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isScenePropValue(value)) {
    issues.push({ path, message: "Expected a JSON-compatible scene property value" });
  }
}

interface InternalNode {
  readonly type: SceneNodeType;
  readonly props: Readonly<Record<string, ScenePropValue>>;
  readonly childIds: readonly string[];
}

/**
 * Applies ordered scene transactions and exposes the materialized scene.
 * Referential integrity is enforced here: unknown parents or nodes, duplicate
 * identifiers, invalid child placement, incomplete reorders, and removal of
 * required properties fail with structured error codes. Node shape and the
 * property whitelist are validated by the message validators before a
 * transaction reaches this buffer.
 */
export class SceneStateBuffer {
  readonly #nodes = new Map<string, InternalNode>();
  #rootId?: string;

  get rootId(): string | undefined {
    return this.#rootId;
  }

  get nodeCount(): number {
    return this.#nodes.size;
  }

  has(nodeId: string): boolean {
    return this.#nodes.has(nodeId);
  }

  get(nodeId: string): SceneNode | undefined {
    const node = this.#nodes.get(nodeId);
    return node === undefined ? undefined : this.#materialize(nodeId, node);
  }

  childrenOf(nodeId: string): readonly SceneNode[] {
    const node = this.#internal(nodeId);
    return node.childIds.map((childId) => {
      const child = this.#nodes.get(childId) as InternalNode;
      return this.#materialize(childId, child);
    });
  }

  apply(transaction: SceneTransaction): void {
    if (typeof transaction.transactionId !== "string" || transaction.transactionId.length === 0) {
      throw new SceneError("invalid_transaction", "Scene transaction requires a transactionId");
    }
    if (!Array.isArray(transaction.operations)) {
      throw new SceneError("invalid_transaction", "Scene transaction requires an operations array");
    }
    for (const operation of transaction.operations) {
      this.#applyOperation(operation);
    }
  }

  toJSON(): SceneNode | undefined {
    if (this.#rootId === undefined) {
      return undefined;
    }
    return this.#materialize(this.#rootId, this.#nodes.get(this.#rootId) as InternalNode);
  }

  #internal(nodeId: string): InternalNode {
    const node = this.#nodes.get(nodeId);
    if (node === undefined) {
      throw new SceneError("unknown_node", "Scene node does not exist", { nodeId });
    }
    return node;
  }

  #materialize(nodeId: string, node: InternalNode): SceneNode {
    return {
      id: nodeId,
      type: node.type,
      props: { ...node.props },
      children: node.childIds.map((childId) => {
        const child = this.#nodes.get(childId) as InternalNode;
        return this.#materialize(childId, child);
      }),
    };
  }

  #applyOperation(operation: SceneOperation): void {
    switch (operation.type) {
      case "snapshot":
        this.#applySnapshot(operation.root);
        return;
      case "insert":
        this.#applyInsert(operation);
        return;
      case "update":
        this.#applyUpdate(operation);
        return;
      case "remove":
        this.#applyRemove(operation);
        return;
      case "reorder":
        this.#applyReorder(operation);
        return;
      default:
        throw new SceneError("unknown_operation", "Unknown scene operation", { operation });
    }
  }

  #applySnapshot(root: SceneNode): void {
    if (
      root.type !== "list" &&
      root.type !== "detail" &&
      root.type !== "form" &&
      root.type !== "grid" &&
      root.type !== "menu-bar-extra"
    ) {
      throw new SceneError("invalid_root", "The scene root must be a list, detail, form, grid, or menu-bar-extra", {
        nodeType: root.type,
      });
    }

    this.#nodes.clear();
    this.#rootId = root.id;
    for (const [nodeId, node] of collectNodes(root)) {
      assertPropTypes(node.type, node.props, nodeId);
      this.#nodes.set(nodeId, toInternalNode(node));
    }
  }

  #applyInsert(operation: SceneInsertOperation): void {
    const parent = this.#nodes.get(operation.parentId);
    if (parent === undefined) {
      throw new SceneError("unknown_parent", "Insert parent does not exist", { parentId: operation.parentId });
    }
    if (this.#nodes.has(operation.node.id)) {
      throw new SceneError("duplicate_node", "Scene node already exists", { nodeId: operation.node.id });
    }
    if (!CHILD_TYPES[parent.type].includes(operation.node.type)) {
      throw new SceneError("invalid_child", `A ${parent.type} cannot contain a ${operation.node.type}`, {
        parentId: operation.parentId,
        childType: operation.node.type,
      });
    }
    if (operation.index !== undefined && (operation.index < 0 || operation.index > parent.childIds.length)) {
      throw new SceneError("invalid_index", "Insert index is out of bounds", {
        parentId: operation.parentId,
        index: operation.index,
      });
    }

    for (const [nodeId, node] of collectNodes(operation.node)) {
      assertPropTypes(node.type, node.props, nodeId);
      this.#nodes.set(nodeId, toInternalNode(node));
    }
    const childIds = [...parent.childIds];
    if (operation.index === undefined) {
      childIds.push(operation.node.id);
    } else {
      childIds.splice(operation.index, 0, operation.node.id);
    }
    this.#nodes.set(operation.parentId, { ...parent, childIds });
  }

  #applyUpdate(operation: SceneUpdateOperation): void {
    const node = this.#internal(operation.nodeId);
    const props: Record<string, ScenePropValue> = { ...node.props };
    for (const [key, value] of Object.entries(operation.props)) {
      if (!PROP_WHITELIST[node.type].includes(key)) {
        throw new SceneError("invalid_prop", "Property is not in the whitelist", {
          nodeId: operation.nodeId,
          property: key,
        });
      }
      if (value === null) {
        if (REQUIRED_PROPS[node.type].includes(key)) {
          throw new SceneError("missing_required_prop", "Required property cannot be removed", {
            nodeId: operation.nodeId,
            property: key,
          });
        }
        delete props[key];
        continue;
      }
      const expected = PROP_TYPES[node.type][key];
      if (expected !== undefined && !isPropType(value, expected)) {
        throw new SceneError("invalid_prop", `Expected a ${expected} value`, {
          nodeId: operation.nodeId,
          property: key,
        });
      }
      props[key] = value;
    }
    for (const required of REQUIRED_PROPS[node.type]) {
      if (!(required in props)) {
        throw new SceneError("missing_required_prop", "Required property is missing", {
          nodeId: operation.nodeId,
          property: required,
        });
      }
    }
    this.#nodes.set(operation.nodeId, { ...node, props });
  }

  #applyRemove(operation: SceneRemoveOperation): void {
    this.#internal(operation.nodeId);
    if (operation.nodeId === this.#rootId) {
      throw new SceneError("remove_root", "The scene root cannot be removed", { nodeId: operation.nodeId });
    }

    const parentEntry = [...this.#nodes.entries()].find(([, candidate]) =>
      candidate.childIds.includes(operation.nodeId),
    );
    if (parentEntry === undefined) {
      throw new SceneError("orphan_node", "Removed node is not attached to the scene", { nodeId: operation.nodeId });
    }
    const [parentId, parent] = parentEntry;
    this.#nodes.set(parentId, {
      ...parent,
      childIds: parent.childIds.filter((childId) => childId !== operation.nodeId),
    });

    const removed: string[] = [];
    collectChildIds(operation.nodeId, this.#nodes, removed);
    for (const nodeId of removed) {
      this.#nodes.delete(nodeId);
    }
  }

  #applyReorder(operation: SceneReorderOperation): void {
    const parent = this.#nodes.get(operation.parentId);
    if (parent === undefined) {
      throw new SceneError("unknown_parent", "Reorder parent does not exist", { parentId: operation.parentId });
    }
    const current = [...parent.childIds].toSorted().join("\u0000");
    const order = [...operation.order].toSorted().join("\u0000");
    if (operation.order.length !== parent.childIds.length || order !== current) {
      throw new SceneError("reorder_mismatch", "Reorder must contain exactly the current children", {
        parentId: operation.parentId,
        expected: parent.childIds,
        received: operation.order,
      });
    }
    this.#nodes.set(operation.parentId, { ...parent, childIds: [...operation.order] });
  }
}

function toInternalNode(node: SceneNode): InternalNode {
  return {
    type: node.type,
    props: { ...node.props },
    childIds: node.children.map((child) => child.id),
  };
}

function assertPropTypes(nodeType: SceneNodeType, props: Readonly<Record<string, unknown>>, nodeId: string): void {
  for (const [key, value] of Object.entries(props)) {
    const expected = PROP_TYPES[nodeType][key];
    if (expected !== undefined && !isPropType(value, expected)) {
      throw new SceneError("invalid_prop", `Expected a ${expected} value`, { nodeId, property: key });
    }
  }
}

function collectNodes(node: SceneNode): Map<string, SceneNode> {
  const nodes = new Map<string, SceneNode>();
  const visit = (current: SceneNode): void => {
    if (nodes.has(current.id)) {
      throw new SceneError("duplicate_node", "Scene node identifiers must be unique within a tree", {
        nodeId: current.id,
      });
    }
    nodes.set(current.id, current);
    for (const child of current.children) {
      visit(child);
    }
  };
  visit(node);
  return nodes;
}

function collectChildIds(rootId: string, nodes: Map<string, InternalNode>, removed: string[]): void {
  const node = nodes.get(rootId);
  if (node === undefined) {
    return;
  }
  removed.push(rootId);
  for (const childId of node.childIds) {
    collectChildIds(childId, nodes, removed);
  }
}

function validateNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ path, message: "Expected a non-empty string" });
  }
}

function isSceneFormValue(value: unknown): value is SceneFormValue {
  return value === null || typeof value === "string" || typeof value === "boolean" || isStringArray(value);
}

export function isScenePropValue(value: unknown): value is ScenePropValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    isStringArray(value) ||
    isSceneShortcut(value)
  );
}

function isPropType(value: unknown, expected: ScenePropType): boolean {
  if (expected === "string[]") {
    return isStringArray(value);
  }
  if (expected === "shortcut") {
    return isSceneShortcut(value);
  }
  return typeof value === expected;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isSceneShortcut(value: unknown): value is SceneShortcut {
  return (
    isRecord(value) &&
    Array.isArray(value.modifiers) &&
    value.modifiers.every((modifier) => typeof modifier === "string" && modifier.length > 0) &&
    typeof value.key === "string" &&
    value.key.length > 0
  );
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid<T>(path: string, message: string): ValidationResult<T> {
  return { ok: false, issues: [{ path, message }] };
}
