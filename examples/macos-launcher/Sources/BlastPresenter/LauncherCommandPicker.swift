import Foundation
import BlastKit

/// One runnable command read from an extension manifest.
public struct LauncherCommand: Equatable, Sendable {
    public let name: String
    public let title: String
    public let subtitle: String

    public init(name: String, title: String, subtitle: String = "") {
        self.name = name
        self.title = title
        self.subtitle = subtitle
    }
}

/// The command picker shown before a session starts. It is a value type with
/// the same semantics as `LauncherPresenter`: the AppKit layer renders
/// `display` and forwards `LauncherKey` presses back into `input(for:)`.
public struct LauncherCommandPicker: Equatable, Sendable {
    public let commands: [LauncherCommand]
    public private(set) var query: String
    public private(set) var selectedIndex: Int

    public init(commands: [LauncherCommand], query: String = "", selectedIndex: Int = 0) {
        self.commands = commands
        self.query = query
        self.selectedIndex = Self.clamped(selectedIndex, count: commands.count)
    }

    /// Commands matching the query by name, title or subtitle.
    public var filtered: [LauncherCommand] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return commands }
        return commands.filter {
            $0.title.lowercased().contains(needle)
                || $0.name.lowercased().contains(needle)
                || $0.subtitle.lowercased().contains(needle)
        }
    }

    public var selectedCommand: LauncherCommand? {
        let matches = filtered
        guard matches.indices.contains(selectedIndex) else { return nil }
        return matches[selectedIndex]
    }

    public mutating func search(_ text: String) {
        query = text
        selectedIndex = 0
    }

    /// Up/down move the selection; left/right are ignored in a flat picker.
    public mutating func move(_ direction: ControllerInput.Direction) {
        let count = filtered.count
        guard count > 0 else {
            selectedIndex = 0
            return
        }
        switch direction {
        case .up:
            selectedIndex = max(0, selectedIndex - 1)
        case .down:
            selectedIndex = min(count - 1, selectedIndex + 1)
        case .left, .right:
            break
        }
    }

    public mutating func select(id: String) {
        guard let index = filtered.firstIndex(where: { $0.name == id }) else { return }
        selectedIndex = index
    }

    public var display: LauncherDisplay {
        let matches = filtered
        let rows = matches.enumerated().map { index, command in
            LauncherRow(
                id: command.name,
                kind: .item,
                title: command.title,
                subtitle: command.subtitle,
                iconText: command.title.first.map { String($0).uppercased() } ?? "",
                selected: index == selectedIndex
            )
        }
        let body: LauncherBody = rows.isEmpty
            ? .empty(
                title: "No commands",
                description: query.isEmpty ? "This extension declares no commands." : "No command matches “\(query)”."
            )
            : .rows(rows)
        return LauncherDisplay(
            title: "Commands",
            searchText: query,
            searchPlaceholder: "Search commands…",
            body: body,
            selectedRowIndex: rows.isEmpty ? nil : selectedIndex,
            actionsOpen: false,
            actionsTitle: "Actions",
            actions: [],
            selectedActionIndex: nil,
            canGoBack: false,
            primaryTitle: rows.isEmpty ? "" : "Run",
            primaryShortcut: "↵",
            primaryEnabled: !rows.isEmpty
        )
    }

    private static func clamped(_ index: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        return min(max(0, index), count - 1)
    }
}
