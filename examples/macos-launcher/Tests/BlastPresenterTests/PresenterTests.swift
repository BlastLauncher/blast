import Foundation
import Testing
import BlastKit
@testable import BlastPresenter

@Suite("Launcher presenter")
struct PresenterTests {
    // MARK: - Contract fixtures

    @Test("maps the list fixture: rows, selection, search, actions and primary")
    func list() throws {
        let display = LauncherPresenter(view: try Fixtures.view("list")).display

        #expect(display.title == "hello-list")
        #expect(display.searchText == "")
        #expect(display.searchPlaceholder == "Search…")
        #expect(display.rows.map(\.title) == ["apple", "banana", "cherry"])
        #expect(display.rows.map(\.iconText) == ["A", "B", "C"])
        #expect(display.rows.allSatisfy { $0.kind == .item && $0.enabled })
        #expect(display.selectedRowIndex == 0)
        #expect(display.selectedRowId == "5")
        #expect(display.canGoBack == false)
        #expect(display.primaryTitle == "Copy apple")
        #expect(display.primaryLabel == "Copy apple  ↵")
        #expect(display.toast == nil)

        // The action panel is closed but its rows are already labelled.
        #expect(display.actionsOpen == false)
        #expect(display.actions.map(\.title) == ["Copy apple", "Pin apple"])
        #expect(display.actions.map(\.shortcut) == ["⌘C", "⌘↵"])
        #expect(display.selectedActionIndex == 0)
    }

    @Test("maps the grid fixture: headers and cells become selected rows")
    func grid() throws {
        let display = LauncherPresenter(view: try Fixtures.view("grid")).display

        #expect(display.title == "grid")
        #expect(display.rows.map(\.title) == ["Drinks — Still or sparkling", "beer", "wine", "water"])
        #expect(display.rows.map(\.kind) == [.gridHeader, .gridCell, .gridCell, .gridCell])
        #expect(display.rows.map(\.subtitle) == ["", "Germany", "France", "Norway"])
        #expect(display.rows.first?.enabled == false)
        #expect(display.selectedRowIndex == 1)
        #expect(display.selectedRowId == "4")
        #expect(display.primaryTitle == "Delete beer")
    }

    @Test("maps the form fixture: fields become rows with the focused field selected")
    func form() throws {
        let display = LauncherPresenter(view: try Fixtures.view("form")).display

        #expect(display.title == "Fill form")
        #expect(display.rows.map(\.title) == ["name", "notes", "drink", "agree", "date"])
        #expect(display.rows.map(\.kind) == Array(repeating: .formField, count: 5))
        #expect(display.rows.map(\.subtitle) == [
            "TextField",
            "TextArea: initial",
            "Dropdown: water",
            "Checkbox: Agree",
            "DatePicker",
        ])
        #expect(display.selectedRowIndex == 0)
        #expect(display.selectedRowId == "1")
        #expect(display.primaryTitle == "Submit Form")
    }

    @Test("maps the root fixture: extension sections head their command rows")
    func root() throws {
        let display = LauncherPresenter(view: try Fixtures.view("root")).display

        #expect(display.title == "Commands")
        #expect(display.searchPlaceholder == "Search commands…")
        #expect(display.rows.map(\.title) == ["hello-list", "index"])
        #expect(display.rows.map(\.kind) == [.section, .item])
        #expect(display.rows.map(\.enabled) == [false, true])
        #expect(display.rows.last?.accessories == "Command")
        #expect(display.rows.last?.iconText == "I")
        #expect(display.selectedRowIndex == 1)
        #expect(display.selectedRowId == "hello-list:index")
        #expect(display.canGoBack == false)
        #expect(display.primaryTitle == "Open Command")
    }

    @Test("maps the prompt fixture: missing preference and argument become form rows")
    func prompt() throws {
        let display = LauncherPresenter(view: try Fixtures.view("prompt")).display

        #expect(display.title == "Set up index")
        #expect(display.rows.map(\.title) == ["Token", "query"])
        #expect(display.rows.map(\.kind) == [.formField, .formField])
        #expect(display.rows.map(\.subtitle) == ["PasswordField", "TextField"])
        #expect(display.selectedRowIndex == 0)
        #expect(display.selectedRowId == "token")
        #expect(display.canGoBack)
        #expect(display.primaryTitle == "Save & Launch")
    }

    @Test("maps the menu-bar fixture: sections are not selectable")
    func menuBar() throws {
        let display = LauncherPresenter(view: try Fixtures.view("menu-bar")).display

        #expect(display.title == "Ready")
        #expect(display.rows.map(\.title) == ["Tools", "More"])
        #expect(display.rows.map(\.kind) == [.menuBarSection, .menuBarItem])
        #expect(display.rows.first?.enabled == false)
        #expect(display.selectedRowIndex == 1)
        #expect(display.selectedRowId == "2")
        #expect(display.actionsOpen == false)
        #expect(display.primaryEnabled == false)
        #expect(display.primaryLabel == "")
    }

    @Test("maps the action-panel fixture: open panel, shortcuts and selected action")
    func actionPanel() throws {
        let display = LauncherPresenter(view: try Fixtures.view("action-panel")).display

        #expect(display.title == "actions-variants")
        #expect(display.rows.map(\.title) == ["Everything"])
        #expect(display.actionsOpen)
        #expect(display.actionsTitle == "Actions")
        #expect(display.actions.count == 9)
        #expect(display.actions.first?.kind == "submenu")
        #expect(display.actionLines.contains("Open Target  ⌘↵"))
        #expect(display.actionLines.contains("Labels  ›"))
        #expect(display.selectedActionIndex == 0)
        #expect(display.selectedActionId == "4")
        #expect(display.primaryLabel == "Open Target  ↵")
    }

    @Test("maps the toast fixture: toast fields and the empty state")
    func toast() throws {
        let display = LauncherPresenter(view: try Fixtures.view("toast")).display

        #expect(display.body == .empty(title: "No results", description: ""))
        #expect(display.rows.isEmpty)
        #expect(display.toast == LauncherToast(style: "success", title: "Confirmed", message: ""))
    }

    @Test("maps the detail fixture: markdown body and back affordance")
    func detail() throws {
        let display = LauncherPresenter(view: try Fixtures.view("detail")).display

        #expect(display.title == "Blast")
        #expect(display.body == .detail(markdown: "pushed detail"))
        #expect(display.canGoBack)
        #expect(display.primaryEnabled == false)
        #expect(display.rows.isEmpty)
    }

    @Test("maps loading and empty views")
    func states() throws {
        let loading = LauncherPresenter(view: try Fixtures.synthetic(loading: true)).display
        #expect(loading.body == .loading)

        let emptyText = LauncherPresenter(view: try Fixtures.synthetic(emptyText: "Nothing here")).display
        #expect(emptyText.body == .empty(title: "Nothing here", description: ""))

        let described = LauncherPresenter(
            view: try Fixtures.synthetic(
                emptyText: "No results",
                empty: .object([
                    "title": .string("No matches"),
                    "description": .string("Try another search."),
                    "iconLabel": .string(""),
                    "iconTint": .null,
                ])
            )
        ).display
        #expect(described.body == .empty(title: "No matches", description: "Try another search."))
    }

    @Test("maps feedback.hud to the transient overlay while it is present")
    func hud() throws {
        #expect(LauncherPresenter(view: try Fixtures.view("list")).display.hud == nil)
        #expect(LauncherPresenter(view: try Fixtures.synthetic(hudTitle: "Copied")).display.hud == "Copied")
        #expect(LauncherPresenter(view: try Fixtures.synthetic(hudTitle: "")).display.hud == nil)
    }

    // MARK: - Key mapping

    @Test("maps arrows to move inputs")
    func arrows() throws {
        let presenter = LauncherPresenter(view: try Fixtures.view("list"))
        #expect(presenter.input(for: LauncherKey(code: .up)) == .move(.up))
        #expect(presenter.input(for: LauncherKey(code: .down)) == .move(.down))
        #expect(presenter.input(for: LauncherKey(code: .left)) == .move(.left))
        #expect(presenter.input(for: LauncherKey(code: .right)) == .move(.right))
    }

    @Test("maps Return and Command+Return")
    func returnKeys() throws {
        let presenter = LauncherPresenter(view: try Fixtures.view("list"))
        #expect(presenter.input(for: LauncherKey(code: .returnKey)) == .primary)
        #expect(
            presenter.input(for: LauncherKey(code: .returnKey, command: true))
                == .key(ControllerInput.KeyPress(name: "return", meta: true))
        )
    }

    @Test("maps Command+K to openActions")
    func commandK() throws {
        let presenter = LauncherPresenter(view: try Fixtures.view("list"))
        #expect(presenter.input(for: LauncherKey(code: .character, character: "k", command: true)) == .openActions)
        #expect(presenter.input(for: LauncherKey(code: .character, character: "K", command: true)) == .openActions)
    }

    @Test("maps Escape to closeActions, back, or nothing")
    func escape() throws {
        let list = LauncherPresenter(view: try Fixtures.view("list"))
        #expect(list.input(for: LauncherKey(code: .escape)) == nil)

        let detail = LauncherPresenter(view: try Fixtures.view("detail"))
        #expect(detail.input(for: LauncherKey(code: .escape)) == .back)

        let actions = LauncherPresenter(view: try Fixtures.view("action-panel"))
        #expect(actions.input(for: LauncherKey(code: .escape)) == .closeActions)
    }

    @Test("maps typing to search and action-filter inputs")
    func typing() throws {
        let list = LauncherPresenter(view: try Fixtures.view("list"))
        #expect(list.input(for: LauncherKey(code: .character, character: "b")) == .search("b"))
        #expect(list.input(for: LauncherKey(code: .character, character: "an")) == .search("an"))
        #expect(list.textInput("") == nil)

        let actions = LauncherPresenter(view: try Fixtures.view("action-panel"))
        #expect(actions.input(for: LauncherKey(code: .character, character: "b")) == .actionsQuery("b"))
        #expect(actions.searchChanged("op") == .actionsQuery("op"))
    }

    @Test("maps other Command shortcuts to key presses")
    func otherShortcuts() throws {
        let presenter = LauncherPresenter(view: try Fixtures.view("list"))
        #expect(
            presenter.input(for: LauncherKey(code: .character, character: "c", command: true))
                == .key(ControllerInput.KeyPress(name: "c", meta: true))
        )
    }
}

enum Fixtures {
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

    /// A view with every field the decoder requires, for states no fixture records.
    static func synthetic(
        kind: String = "list",
        loading: Bool = false,
        emptyText: String = "No results",
        empty: JSONValue = .null,
        canGoBack: Bool = false,
        hudTitle: String? = nil
    ) throws -> ControllerView {
        let json: JSONValue = .object([
            "kind": .string(kind),
            "title": .string("Synthetic"),
            "navigation": .object(["canGoBack": .bool(canGoBack)]),
            "loading": .bool(loading),
            "search": .object(["text": .string(""), "placeholder": .string("Search…")]),
            "rows": .array([]),
            "grid": .null,
            "selectedId": .null,
            "emptyText": .string(emptyText),
            "empty": empty,
            "detail": .string(""),
            "primary": .object([
                "title": .string("Run"),
                "shortcut": .string("↵"),
                "enabled": .bool(false),
            ]),
            "actions": .object([
                "open": .bool(false),
                "title": .string("Actions"),
                "query": .string(""),
                "breadcrumb": .array([]),
                "rows": .array([]),
                "selectedIndex": .number(-1),
            ]),
            "dropdown": .null,
            "feedback": .object([
                "toast": .null,
                "hud": hudTitle.map { .object(["title": .string($0)]) } ?? .null,
                "alert": .null,
            ]),
            "menuBar": .null,
            "form": .null,
            "requests": .object(["quit": .bool(false), "clearSearch": .bool(false)]),
        ])
        return try JSONDecoder().decode(ControllerView.self, from: JSONEncoder().encode(json))
    }
}

@Suite("Launcher behaviours")
struct LauncherBehaviourTests {
    private final class FakeHotkey: LauncherHotkeySource, @unchecked Sendable {
        var callback: (@Sendable () -> Void)?
        func start(_ handler: @escaping @Sendable () -> Void) throws { callback = handler }
        func stop() { callback = nil }
        func press() { callback?() }
    }
    private final class BoolRecorder: @unchecked Sendable {
        var values: [Bool] = []
    }
    private final class AttemptRecorder: @unchecked Sendable {
        var values: [Bool] = []
    }

    @Test("injected hotkey toggles presentation without registering a system shortcut")
    func hotkeyToggle() throws {
        let source = FakeHotkey()
        let recorder = BoolRecorder()
        let controller = LauncherHotkeyController(source: source) { recorder.values.append($0) }
        try controller.start()
        source.press(); source.press()
        #expect(controller.hotkey == .defaultOptionSpace)
        #expect(controller.isPresented == false)
        #expect(recorder.values == [true, false])
    }

    @Test("dependency prompt retries only after confirmation")
    func dependencyRetry() async throws {
        let dependency = MissingDependencies(unresolved: ["left-pad"], installable: true, pinned: true)
        let remote = EmbedderError(code: "missing_dependencies", message: "install", data: try JSONEncoder().encode(dependency).jsonValue)
        let recorder = AttemptRecorder()
        let coordinator = LauncherLaunchCoordinator(
            launch: { install in
                recorder.values.append(install)
                if !install { throw BlastError.remote(remote) }
                return "session"
            },
            confirmInstall: { _ in true }
        )
        #expect(try await coordinator.run() == "session")
        #expect(recorder.values == [false, true])
    }
}

private extension Data {
    var jsonValue: JSONValue { (try? JSONDecoder().decode(JSONValue.self, from: self)) ?? .null }
}
