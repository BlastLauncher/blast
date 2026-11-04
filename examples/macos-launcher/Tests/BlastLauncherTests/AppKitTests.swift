import AppKit
import Testing
import BlastKit
import BlastPresenter
@testable import BlastLauncher

/// These build the real window offscreen: no event loop, no ordering front, no
/// user input. They assert what `render` produced, which is the whole contract
/// of the AppKit layer.
@Suite("Launcher AppKit views")
struct AppKitTests {
    @Test("renders list rows, selection and chrome offscreen")
    @MainActor
    func rendersList() throws {
        _ = NSApplication.shared
        let controller = LauncherWindowController(presenter: LauncherPresenter(view: try Fixtures.view("list")))
        defer { controller.window?.close() }
        var inputs: [ControllerInput] = []
        controller.onInput = { inputs.append($0) }
        controller.render(controller.presenter.display)
        controller.tableView.layoutSubtreeIfNeeded()

        #expect(controller.window?.isVisible == false)
        #expect(controller.tableView.numberOfRows == 3)
        #expect(controller.tableView.selectedRow == 0)
        #expect(controller.tableScrollView.isHidden == false)
        #expect(controller.detailScrollView.isHidden)
        #expect(controller.emptyLabel.isHidden)
        #expect(controller.actionPanelView.isHidden)
        #expect(controller.backButton.isHidden)
        #expect(controller.toastLabel.isHidden)
        #expect(controller.titleLabel.stringValue == "hello-list")
        #expect(controller.searchField.placeholderString == "Search…")
        #expect(controller.primaryLabel.stringValue == "Copy apple  ↵")

        #expect(cell(controller, row: 0).titleLabel.stringValue == "apple")
        #expect(cell(controller, row: 0).iconLabel.stringValue == "A")
        #expect(cell(controller, row: 1).titleLabel.stringValue == "banana")
        #expect(cell(controller, row: 2).titleLabel.stringValue == "cherry")
        #expect(isBold(cell(controller, row: 0).titleLabel))
        #expect(!isBold(cell(controller, row: 1).titleLabel))

        // Rendering is not user input: it must not echo a select back.
        #expect(inputs.isEmpty)
    }

    @Test("renders grid rows and selection")
    @MainActor
    func rendersGrid() throws {
        _ = NSApplication.shared
        let controller = LauncherWindowController(presenter: LauncherPresenter(view: try Fixtures.view("grid")))
        defer { controller.window?.close() }
        controller.render(controller.presenter.display)
        controller.tableView.layoutSubtreeIfNeeded()

        #expect(controller.tableView.numberOfRows == 4)
        #expect(controller.tableView.selectedRow == 1)
        #expect(cell(controller, row: 0).titleLabel.stringValue == "Drinks — Still or sparkling")
        #expect(cell(controller, row: 1).titleLabel.stringValue == "beer")
        #expect(cell(controller, row: 1).subtitleLabel.stringValue == "Germany")
        #expect(cell(controller, row: 0).titleLabel.textColor == .disabledControlTextColor)
    }

    @Test("renders the action panel with shortcut labels")
    @MainActor
    func rendersActionPanel() throws {
        _ = NSApplication.shared
        let controller = LauncherWindowController(presenter: LauncherPresenter(view: try Fixtures.view("action-panel")))
        defer { controller.window?.close() }
        controller.render(controller.presenter.display)

        #expect(controller.actionPanelView.isHidden == false)
        let lines = controller.actionLines
        #expect(lines.first == "Actions")
        #expect(lines.contains("Open Target  ⌘↵"))
        #expect(lines.contains("Labels  ›"))
        let selected = controller.actionStackView.arrangedSubviews
            .compactMap { $0 as? NSTextField }
            .first { $0.stringValue == "Labels  ›" }
        #expect(selected.map(isBold) == true)
        let unselected = controller.actionStackView.arrangedSubviews
            .compactMap { $0 as? NSTextField }
            .first { $0.stringValue == "Open Target  ⌘↵" }
        #expect(unselected.map(isBold) == false)
    }

    @Test("renders detail markdown and the back affordance")
    @MainActor
    func rendersDetail() throws {
        _ = NSApplication.shared
        let controller = LauncherWindowController(presenter: LauncherPresenter(view: try Fixtures.view("detail")))
        defer { controller.window?.close() }
        controller.render(controller.presenter.display)

        #expect(controller.detailScrollView.isHidden == false)
        #expect(controller.tableScrollView.isHidden)
        #expect(controller.detailTextView.string == "pushed detail")
        #expect(controller.backButton.isHidden == false)
    }

    @Test("renders empty and toast states")
    @MainActor
    func rendersToastAndEmpty() throws {
        _ = NSApplication.shared
        let controller = LauncherWindowController(presenter: LauncherPresenter(view: try Fixtures.view("toast")))
        defer { controller.window?.close() }
        controller.render(controller.presenter.display)

        #expect(controller.emptyLabel.isHidden == false)
        #expect(controller.emptyLabel.stringValue == "No results")
        #expect(controller.toastLabel.stringValue == "Confirmed")

        controller.render(
            LauncherDisplay(
                title: "Blast",
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
        )
        #expect(controller.emptyLabel.stringValue == "Loading…")
    }

    @Test("renders an empty state with a description")
    @MainActor
    func rendersEmptyDescription() throws {
        _ = NSApplication.shared
        let controller = LauncherWindowController()
        defer { controller.window?.close() }
        controller.render(
            LauncherDisplay(
                title: "Blast",
                searchText: "zzz",
                searchPlaceholder: "Search…",
                body: .empty(title: "No matches", description: "Try another search."),
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
        )

        #expect(controller.emptyLabel.stringValue == "No matches\nTry another search.")
        #expect(controller.searchField.stringValue == "zzz")
    }

    @Test("maps AppKit key events to presenter keys")
    @MainActor
    func keyEvents() throws {
        func event(
            _ characters: String,
            keyCode: UInt16,
            modifiers: NSEvent.ModifierFlags = []
        ) throws -> NSEvent {
            try #require(
                NSEvent.keyEvent(
                    with: .keyDown,
                    location: .zero,
                    modifierFlags: modifiers,
                    timestamp: 0,
                    windowNumber: 0,
                    context: nil,
                    characters: characters,
                    charactersIgnoringModifiers: characters,
                    isARepeat: false,
                    keyCode: keyCode
                )
            )
        }

        let down = try #require(LauncherKey(event: event("\u{F701}", keyCode: 125)))
        #expect(down == LauncherKey(code: .down))
        let back = try #require(LauncherKey(event: event("\u{1B}", keyCode: 53)))
        #expect(back == LauncherKey(code: .escape))
        let enter = try #require(LauncherKey(event: event("\r", keyCode: 36, modifiers: [.command])))
        #expect(enter == LauncherKey(code: .returnKey, command: true))
        let commandK = try #require(LauncherKey(event: event("k", keyCode: 40, modifiers: [.command])))
        #expect(commandK == LauncherKey(code: .character, character: "k", command: true))
        #expect(commandK.shouldForwardFromSearchField)

        let typing = try #require(LauncherKey(event: event("k", keyCode: 40)))
        #expect(typing == LauncherKey(code: .character, character: "k"))
        #expect(!typing.shouldForwardFromSearchField)
    }

    @Test("parses extension manifest commands for the picker")
    @MainActor
    func manifestCommands() {
        let manifest = JSONValue.object([
            "commands": .array([
                .object([
                    "name": .string("index"),
                    "title": .string("Search Files"),
                    "subtitle": .string("Find anything"),
                    "mode": .string("view"),
                ]),
                .object([
                    "name": .string("plain"),
                    "mode": .string("no-view"),
                ]),
            ])
        ])

        #expect(AppDelegate.commands(from: manifest) == [
            LauncherCommand(name: "index", title: "Search Files", subtitle: "Find anything"),
            LauncherCommand(name: "plain", title: "plain", subtitle: "no-view"),
        ])
    }

    @Test("converts markdown into an attributed string")
    @MainActor
    func markdown() {
        _ = NSApplication.shared
        let attributed = LauncherWindowController.attributedMarkdown("# Heading\n\nSome **bold** text")
        #expect(attributed.string.contains("Heading"))
        #expect(attributed.string.contains("bold"))
        #expect(attributed.attribute(.font, at: 0, effectiveRange: nil) != nil)

        let controller = LauncherWindowController()
        defer { controller.window?.close() }
        controller.render(
            LauncherDisplay(
                title: "Doc",
                searchText: "",
                searchPlaceholder: "Search…",
                body: .detail(markdown: "# Heading\n\nSome **bold** text"),
                selectedRowIndex: nil,
                actionsOpen: false,
                actionsTitle: "Actions",
                actions: [],
                selectedActionIndex: nil,
                canGoBack: true,
                primaryTitle: "",
                primaryShortcut: "",
                primaryEnabled: false
            )
        )
        #expect(controller.detailTextView.string.contains("Heading"))
        #expect(controller.backButton.isHidden == false)
    }

    @MainActor
    private func cell(_ controller: LauncherWindowController, row: Int) -> LauncherRowCell {
        guard let cell = controller.tableView.view(atColumn: 0, row: row, makeIfNecessary: true) as? LauncherRowCell else {
            Issue.record("row \(row) did not render a LauncherRowCell")
            return LauncherRowCell(frame: .zero)
        }
        return cell
    }

    @MainActor
    private func isBold(_ label: NSTextField) -> Bool {
        label.font?.fontDescriptor.symbolicTraits.contains(.bold) ?? false
    }
}

private enum Fixtures {
    static let directory = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Fixtures")

    static func view(_ name: String) throws -> ControllerView {
        try JSONDecoder().decode(
            ControllerView.self,
            from: Data(contentsOf: directory.appendingPathComponent("\(name).json"))
        )
    }
}
