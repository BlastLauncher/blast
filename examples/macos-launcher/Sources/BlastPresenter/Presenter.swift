import Foundation
import BlastKit

/// Turns the server-owned `ControllerView` into `LauncherDisplay` values and
/// key presses into `ControllerInput`. Pure Foundation: every UI decision is
/// unit-tested without an AppKit window.
public final class LauncherPresenter {
    public private(set) var view: ControllerView?
    public private(set) var display: LauncherDisplay = .initial

    public init(view: ControllerView? = nil) {
        if let view { apply(view) }
    }

    /// Replaces the displayed state with the engine's latest view.
    public func apply(_ view: ControllerView) {
        self.view = view
        let rows = Self.rows(for: view)
        let body: LauncherBody
        if view.loading {
            body = .loading
        } else if view.kind == .detail {
            body = .detail(markdown: view.detail)
        } else if let rows, !rows.isEmpty {
            body = .rows(rows)
        } else {
            body = .empty(
                title: view.empty?.title ?? view.emptyText,
                description: view.empty?.description ?? ""
            )
        }

        let selectedRowIndex = rows?.firstIndex(where: \.selected)
        let actions = view.actions.rows.map {
            LauncherAction(
                id: $0.id,
                kind: $0.kind,
                title: $0.title,
                shortcut: $0.shortcut,
                selected: $0.selected
            )
        }
        display = LauncherDisplay(
            title: view.title,
            searchText: view.search.text,
            searchPlaceholder: view.search.placeholder.isEmpty ? "Search…" : view.search.placeholder,
            body: body,
            selectedRowIndex: selectedRowIndex,
            actionsOpen: view.actions.open,
            actionsTitle: view.actions.title,
            actionsBreadcrumb: view.actions.breadcrumb,
            actions: actions,
            selectedActionIndex: Self.selectedActionIndex(view.actions, actions: actions),
            canGoBack: view.navigation.canGoBack,
            primaryTitle: view.primary.title,
            primaryShortcut: view.primary.shortcut,
            primaryEnabled: view.primary.enabled,
            toast: view.feedback.toast.map {
                LauncherToast(
                    style: $0.style,
                    title: $0.title,
                    message: $0.message,
                    actions: $0.actions.map { .init(title: $0.title, shortcut: $0.shortcut) }
                )
            },
            hud: view.feedback.hud.flatMap { $0.title.isEmpty ? nil : $0.title }
        )
    }

    /// A search-field change. While the action panel is open the same field
    /// filters actions instead of the list.
    public func searchChanged(_ text: String) -> ControllerInput {
        view?.actions.open == true ? .actionsQuery(text) : .search(text)
    }

    /// Appends typed text to whatever field currently owns the keyboard.
    public func textInput(_ text: String) -> ControllerInput? {
        guard !text.isEmpty else { return nil }
        let current = view?.actions.open == true ? (view?.actions.query ?? "") : (view?.search.text ?? "")
        return searchChanged(current + text)
    }

    /// The semantic input for a key press, or `nil` when the launcher handles it
    /// itself (Escape with nowhere to go closes the window).
    public func input(for key: LauncherKey) -> ControllerInput? {
        switch key.code {
        case .up: return .move(.up)
        case .down: return .move(.down)
        case .left: return .move(.left)
        case .right: return .move(.right)
        case .returnKey:
            return key.command ? .key(Self.keyPress("return", key)) : .primary
        case .escape:
            if display.actionsOpen { return .closeActions }
            return display.canGoBack ? .back : nil
        case .character:
            guard let character = key.character, !character.isEmpty else { return nil }
            if key.command && character.lowercased() == "k" { return .openActions }
            if key.command || key.control || key.option {
                return .key(Self.keyPress(character.lowercased(), key))
            }
            return textInput(character)
        }
    }

    // MARK: - Mapping

    private static func rows(for view: ControllerView) -> [LauncherRow]? {
        switch view.kind {
        case .grid:
            return gridRows(view)
        case .form:
            return formRows(view)
        case .menuBar:
            return menuBarRows(view)
        default:
            return view.rows.map(itemRow)
        }
    }

    private static func itemRow(_ row: ControllerView.Row) -> LauncherRow {
        LauncherRow(
            id: row.id,
            kind: .item,
            title: row.title,
            subtitle: row.subtitle,
            accessories: row.accessories,
            iconText: iconText(row.iconLabel, fallback: row.title),
            selected: row.selected
        )
    }

    private static func gridRows(_ view: ControllerView) -> [LauncherRow] {
        var rows: [LauncherRow] = []
        for (index, gridRow) in (view.grid ?? []).enumerated() {
            if !gridRow.header.isEmpty {
                rows.append(
                    LauncherRow(
                        id: gridRow.id ?? "grid-header-\(index)",
                        kind: .gridHeader,
                        title: gridRow.header,
                        enabled: false
                    )
                )
            }
            for cell in gridRow.cells {
                rows.append(
                    LauncherRow(
                        id: cell.id,
                        kind: .gridCell,
                        title: cell.title,
                        subtitle: cell.subtitle,
                        iconText: iconText("", fallback: cell.title),
                        selected: cell.selected
                    )
                )
            }
        }
        return rows
    }

    private static func formRows(_ view: ControllerView) -> [LauncherRow] {
        (view.form?.fields ?? []).map { field in
            LauncherRow(
                id: field.id,
                kind: .formField,
                title: field.title,
                subtitle: formDetail(field),
                accessories: field.error,
                selected: field.focused
            )
        }
    }

    private static func formDetail(_ field: ControllerView.Form.Field) -> String {
        if !field.placeholder.isEmpty { return field.placeholder }
        if !field.info.isEmpty { return field.info }
        let type = field.type.replacingOccurrences(of: "Form.", with: "")
        if !field.label.isEmpty { return "\(type): \(field.label)" }
        if !field.text.isEmpty { return "\(type): \(field.text)" }
        return type
    }

    private static func menuBarRows(_ view: ControllerView) -> [LauncherRow] {
        (view.menuBar?.rows ?? []).map { row in
            LauncherRow(
                id: row.id,
                kind: row.kind == "section" ? .menuBarSection : .menuBarItem,
                title: row.title,
                subtitle: row.subtitle,
                accessories: row.shortcut,
                selected: row.selected,
                enabled: !row.disabled
            )
        }
    }

    private static func selectedActionIndex(
        _ actions: ControllerView.Actions,
        actions mapped: [LauncherAction]
    ) -> Int? {
        guard !mapped.isEmpty else { return nil }
        if actions.selectedIndex >= 0 && actions.selectedIndex < mapped.count {
            return actions.selectedIndex
        }
        return mapped.firstIndex(where: \.selected)
    }

    private static func iconText(_ label: String, fallback: String) -> String {
        if !label.isEmpty { return label }
        guard let first = fallback.first else { return "" }
        return String(first).uppercased()
    }

    private static func keyPress(_ name: String, _ key: LauncherKey) -> ControllerInput.KeyPress {
        ControllerInput.KeyPress(
            name: name,
            ctrl: key.control ? true : nil,
            meta: key.command ? true : nil,
            shift: key.shift ? true : nil,
            option: key.option ? true : nil
        )
    }
}
