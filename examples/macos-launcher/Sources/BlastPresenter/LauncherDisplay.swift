import Foundation

/// One rendered line in the results list. The AppKit layer only lays these out;
/// deciding what is a row, what is selected and what text a row carries is the
/// presenter's job, which keeps that logic testable without a window server.
public struct LauncherRow: Equatable, Sendable {
    public enum Kind: String, Equatable, Sendable {
        case item
        case section
        case gridCell
        case gridHeader
        case formField
        case menuBarItem
        case menuBarSection
    }

    public let id: String
    public let kind: Kind
    public let title: String
    public let subtitle: String
    public let accessories: String
    public let iconText: String
    public let selected: Bool
    public let enabled: Bool

    public init(
        id: String,
        kind: Kind = .item,
        title: String,
        subtitle: String = "",
        accessories: String = "",
        iconText: String = "",
        selected: Bool = false,
        enabled: Bool = true
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.subtitle = subtitle
        self.accessories = accessories
        self.iconText = iconText
        self.selected = selected
        self.enabled = enabled
    }
}

/// One row of the action panel, with the server-rendered shortcut label.
public struct LauncherAction: Equatable, Sendable {
    public let id: String
    public let kind: String
    public let title: String
    public let shortcut: String
    public let selected: Bool

    public init(id: String, kind: String, title: String, shortcut: String, selected: Bool) {
        self.id = id
        self.kind = kind
        self.title = title
        self.shortcut = shortcut
        self.selected = selected
    }
}

public struct LauncherToast: Equatable, Sendable {
    public struct Action: Equatable, Sendable {
        public let title: String
        public let shortcut: String

        public init(title: String, shortcut: String) {
            self.title = title
            self.shortcut = shortcut
        }
    }

    public let style: String
    public let title: String
    public let message: String
    public let actions: [Action]

    public init(style: String, title: String, message: String, actions: [Action] = []) {
        self.style = style
        self.title = title
        self.message = message
        self.actions = actions
    }
}

/// The state of the content area beneath the search field.
public enum LauncherBody: Equatable, Sendable {
    case loading
    case empty(title: String, description: String)
    case rows([LauncherRow])
    case detail(markdown: String)
}

/// Everything the AppKit views need for one frame. It is a value type so a
/// render is a pure function of the server's last `ControllerView`.
public struct LauncherDisplay: Equatable, Sendable {
    public let title: String
    public let searchText: String
    public let searchPlaceholder: String
    public let body: LauncherBody
    public let selectedRowIndex: Int?
    public let actionsOpen: Bool
    public let actionsTitle: String
    public let actionsBreadcrumb: [String]
    public let actions: [LauncherAction]
    public let selectedActionIndex: Int?
    public let canGoBack: Bool
    public let primaryTitle: String
    public let primaryShortcut: String
    public let primaryEnabled: Bool
    public let toast: LauncherToast?
    /// A transient `feedback.hud` title; client-core already times it out.
    public let hud: String?

    public init(
        title: String,
        searchText: String,
        searchPlaceholder: String,
        body: LauncherBody,
        selectedRowIndex: Int?,
        actionsOpen: Bool,
        actionsTitle: String,
        actionsBreadcrumb: [String] = [],
        actions: [LauncherAction],
        selectedActionIndex: Int?,
        canGoBack: Bool,
        primaryTitle: String,
        primaryShortcut: String,
        primaryEnabled: Bool,
        toast: LauncherToast? = nil,
        hud: String? = nil
    ) {
        self.title = title
        self.searchText = searchText
        self.searchPlaceholder = searchPlaceholder
        self.body = body
        self.selectedRowIndex = selectedRowIndex
        self.actionsOpen = actionsOpen
        self.actionsTitle = actionsTitle
        self.actionsBreadcrumb = actionsBreadcrumb
        self.actions = actions
        self.selectedActionIndex = selectedActionIndex
        self.canGoBack = canGoBack
        self.primaryTitle = primaryTitle
        self.primaryShortcut = primaryShortcut
        self.primaryEnabled = primaryEnabled
        self.toast = toast
        self.hud = hud
    }

    /// Shown before a session exists (while `blast serve` is starting).
    public static let initial = LauncherDisplay(
        title: "",
        searchText: "",
        searchPlaceholder: "Search…",
        body: .loading,
        selectedRowIndex: nil,
        actionsOpen: false,
        actionsTitle: "Actions",
        actions: [],
        selectedActionIndex: nil,
        canGoBack: false,
        primaryTitle: "",
        primaryShortcut: "",
        primaryEnabled: false
    )

    public var rows: [LauncherRow] {
        if case .rows(let rows) = body { return rows }
        return []
    }

    public var selectedRowId: String? {
        guard let index = selectedRowIndex, rows.indices.contains(index) else { return nil }
        return rows[index].id
    }

    public var selectedActionId: String? {
        guard let index = selectedActionIndex, actions.indices.contains(index) else { return nil }
        return actions[index].id
    }

    public var primaryLabel: String {
        guard primaryEnabled else { return "" }
        return [primaryTitle, primaryShortcut].filter { !$0.isEmpty }.joined(separator: "  ")
    }

    public var actionLines: [String] {
        actions.map { action in
            var line = action.title
            if !action.shortcut.isEmpty { line += "  \(action.shortcut)" }
            if action.kind == "submenu" { line += "  ›" }
            return line
        }
    }
}

/// A key press described without AppKit so the presenter stays Foundation-only.
public struct LauncherKey: Equatable, Sendable {
    public enum Code: Equatable, Sendable {
        case up, down, left, right, returnKey, escape, character
    }

    public let code: Code
    public let character: String?
    public let command: Bool
    public let shift: Bool
    public let option: Bool
    public let control: Bool

    public init(
        code: Code,
        character: String? = nil,
        command: Bool = false,
        shift: Bool = false,
        option: Bool = false,
        control: Bool = false
    ) {
        self.code = code
        self.character = character
        self.command = command
        self.shift = shift
        self.option = option
        self.control = control
    }
}
