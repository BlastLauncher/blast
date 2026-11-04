import Foundation
import Testing
import BlastKit
@testable import BlastPresenter

@Suite("Blast launcher presenter")
struct PresenterTests {
    @Test("maps list rows, selection, search and primary")
    func list() throws {
        let view = try Fixtures.view("list")
        let presenter = LauncherPresenter(view: view)
        #expect(presenter.display.title == "hello-list")
        #expect(presenter.display.searchPlaceholder == "Search…")
        guard case .rows(let rows) = presenter.display.body else { Issue.record("expected rows"); return }
        #expect(rows.map(\.title) == ["apple", "banana", "cherry"])
        #expect(presenter.display.selectedRowIndex == 0)
        #expect(presenter.display.primaryEnabled)
        #expect(presenter.searchChanged("ap") == .search("ap"))
    }

    @Test("maps action panel, toast and detail")
    func secondaryStates() throws {
        let action = LauncherPresenter(view: try Fixtures.view("action-panel")).display
        #expect(action.actionsOpen)
        #expect(action.actions.contains { $0.shortcut == "⌘↵" })
        let toast = LauncherPresenter(view: try Fixtures.view("toast")).display
        #expect(toast.toast?.title == "Confirmed")
        let detail = LauncherPresenter(view: try Fixtures.view("detail")).display
        #expect(detail.canGoBack)
        if case .detail(let markdown) = detail.body { #expect(markdown.contains("#")) } else { Issue.record("expected detail") }
    }

    @Test("maps keyboard semantics")
    func keys() throws {
        let presenter = LauncherPresenter(view: try Fixtures.view("list"))
        #expect(presenter.input(for: LauncherKey(code: .up)) == .move(.up))
        #expect(presenter.input(for: LauncherKey(code: .down)) == .move(.down))
        #expect(presenter.input(for: LauncherKey(code: .character, character: "k", command: true)) == .openActions)
        #expect(presenter.input(for: LauncherKey(code: .returnKey)) == .primary)
        #expect(presenter.input(for: LauncherKey(code: .returnKey, command: true)) == .key(.init(name: "return", meta: true)))
        #expect(presenter.input(for: LauncherKey(code: .escape)) == nil)
    }
}

private enum Fixtures {
    static func view(_ name: String) throws -> ControllerView {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("BlastKitTests/Fixtures").standardizedFileURL
        return try JSONDecoder().decode(ControllerView.self, from: Data(contentsOf: root.appendingPathComponent("\(name).json")))
    }
}
