import AppKit
import Testing
import BlastKit
import BlastPresenter
@testable import BlastLauncher

@Suite("Blast launcher AppKit views")
struct AppKitTests {
    @Test("renders list rows and selection offscreen")
    @MainActor func rendersList() throws {
        let controller = LauncherWindowController()
        let view = try Fixture.view("list")
        controller.render(LauncherPresenter(view: view).display)
        #expect(controller.tableView.numberOfRows == 3)
        #expect(controller.tableView.selectedRow == 0)
        #expect(!controller.tableView.isHidden)
        #expect(controller.actionPanelView.isHidden)
    }

    @Test("renders action panel and detail markdown offscreen")
    @MainActor func rendersSecondary() throws {
        let controller = LauncherWindowController()
        controller.render(LauncherPresenter(view: try Fixture.view("action-panel")).display)
        #expect(!controller.actionPanelView.isHidden)
        controller.render(LauncherPresenter(view: try Fixture.view("detail")).display)
        #expect(!controller.detailTextView.isHidden)
        #expect(controller.detailTextView.string.contains("Details"))
    }
}

private enum Fixture {
    static func view(_ name: String) throws -> ControllerView {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("BlastKitTests/Fixtures").standardizedFileURL
        return try JSONDecoder().decode(ControllerView.self, from: Data(contentsOf: root.appendingPathComponent("\(name).json")))
    }
}
