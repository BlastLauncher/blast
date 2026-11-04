import Foundation
import BlastKit

public struct LauncherRow: Equatable, Sendable {
    public let id: String
    public let title: String
    public let subtitle: String
    public let accessories: String
    public let selected: Bool
    public let iconLabel: String

    public init(id: String, title: String, subtitle: String = "", accessories: String = "", selected: Bool = false, iconLabel: String = "") {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.accessories = accessories
        self.selected = selected
        self.iconLabel = iconLabel
    }
}

public struct LauncherAction: Equatable, Sendable {
    public let id: String
    public let title: String
    public let shortcut: String
    public let selected: Bool

    public init(id: String, title: String, shortcut: String = "", selected: Bool = false) {
        self.id = id
        self.title = title
        self.shortcut = shortcut
        self.selected = selected
    }
}

public struct LauncherToast: Equatable, Sendable {
    public let title: String
    public let message: String
    public let style: String
}

public enum LauncherBody: Equatable, Sendable {
    case loading
    case empty(title: String, description: String)
    case rows([LauncherRow])
    case detail(markdown: String)
}

public struct LauncherDisplay: Equatable, Sendable {
    public let title: String
    public let searchText: String
    public let searchPlaceholder: String
    public let body: LauncherBody
    public let selectedRowIndex: Int?
    public let actionsOpen: Bool
    public let actionsTitle: String
    public let actions: [LauncherAction]
    public let selectedActionIndex: Int?
    public let canGoBack: Bool
    public let primaryTitle: String
    public let primaryShortcut: String
    public let primaryEnabled: Bool
    public let toast: LauncherToast?

    public static let commandPicker = LauncherDisplay(
        title: "Commands", searchText: "", searchPlaceholder: "Search commands…",
        body: .empty(title: "Choose a command", description: "Start an extension command to continue."),
        selectedRowIndex: nil, actionsOpen: false, actionsTitle: "Actions", actions: [], selectedActionIndex: nil,
        canGoBack: false, primaryTitle: "", primaryShortcut: "", primaryEnabled: false, toast: nil
    )
}

public struct LauncherKey: Equatable, Sendable {
    public enum Code: String, Sendable { case up, down, left, right, returnKey, escape, character }
    public let code: Code
    public let character: String?
    public let command: Bool
    public let shift: Bool
    public let option: Bool
    public let control: Bool

    public init(code: Code, character: String? = nil, command: Bool = false, shift: Bool = false, option: Bool = false, control: Bool = false) {
        self.code = code; self.character = character; self.command = command; self.shift = shift; self.option = option; self.control = control
    }
}

public final class LauncherPresenter: @unchecked Sendable {
    public private(set) var view: ControllerView?
    public private(set) var display: LauncherDisplay = .commandPicker

    public init(view: ControllerView? = nil) { if let view { apply(view) } }

    public func apply(_ view: ControllerView) {
        self.view = view
        let body: LauncherBody
        if view.loading { body = .loading }
        else if view.kind == .detail { body = .detail(markdown: view.detail) }
        else if let empty = view.empty, view.rows.isEmpty { body = .empty(title: empty.title, description: empty.description) }
        else if view.rows.isEmpty && view.kind == .empty { body = .empty(title: view.empty?.title ?? view.emptyText, description: view.empty?.description ?? "") }
        else { body = .rows(view.rows.map { LauncherRow(id: $0.id, title: $0.title, subtitle: $0.subtitle, accessories: $0.accessories, selected: $0.selected, iconLabel: $0.iconLabel) }) }
        let selectedRowIndex = view.rows.firstIndex(where: { $0.selected })
        let actions = view.actions.rows.map { LauncherAction(id: $0.id, title: $0.title, shortcut: $0.shortcut, selected: $0.selected) }
        display = LauncherDisplay(title: view.title, searchText: view.search.text, searchPlaceholder: view.search.placeholder,
            body: body, selectedRowIndex: selectedRowIndex, actionsOpen: view.actions.open, actionsTitle: view.actions.title,
            actions: actions, selectedActionIndex: view.actions.selectedIndex >= 0 ? view.actions.selectedIndex : nil,
            canGoBack: view.navigation.canGoBack, primaryTitle: view.primary.title, primaryShortcut: view.primary.shortcut,
            primaryEnabled: view.primary.enabled, toast: view.feedback.toast.map { LauncherToast(title: $0.title, message: $0.message, style: $0.style) })
    }

    public func searchChanged(_ text: String) -> ControllerInput {
        view?.actions.open == true ? .actionsQuery(text) : .search(text)
    }

    public func input(for key: LauncherKey) -> ControllerInput? {
        if key.code == .character, key.command, key.character?.lowercased() == "k" { return .openActions }
        if key.code == .up { return .move(.up) }
        if key.code == .down { return .move(.down) }
        if key.code == .left { return .move(.left) }
        if key.code == .right { return .move(.right) }
        if key.code == .returnKey { return key.command ? .key(.init(name: "return", meta: true)) : .primary }
        if key.code == .escape { return display.actionsOpen ? .closeActions : (display.canGoBack ? .back : nil) }
        return nil
    }

    public func textInput(_ text: String) -> ControllerInput? {
        guard !text.isEmpty else { return nil }
        let current = view?.actions.open == true ? (view?.actions.query ?? "") : (view?.search.text ?? "")
        return searchChanged(current + text)
    }
}
