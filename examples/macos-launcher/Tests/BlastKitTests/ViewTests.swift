import Foundation
import Testing

@testable import BlastKit

@Suite("ControllerView contract fixtures")
struct ViewTests {
    @Test("every fixture decodes")
    func allFixturesDecode() throws {
        for name in fixtureNames {
            let view = try Fixtures.view(name)
            #expect(!view.title.isEmpty, "\(name) has no title")
        }
    }

    @Test("fixtures cover every view kind")
    func fixturesCoverEveryKind() throws {
        let kinds = try fixtureNames.map { try Fixtures.view($0).kind }
        for kind in [ViewKind.list, .grid, .detail, .form, .menuBar, .empty] {
            #expect(kinds.contains(kind), "no fixture for \(kind.rawValue)")
        }
    }

    @Test("list fixture")
    func listFixture() throws {
        let view = try Fixtures.view("list")
        #expect(view.kind == .list)
        #expect(view.rows.count == 3)
        let selected = try #require(view.selectedRow)
        #expect(selected.kind == "item")
        #expect(selected.selected)
        #expect(selected.id == view.selectedId)
        #expect(!selected.text.isEmpty)
        #expect(!view.search.placeholder.isEmpty)
        #expect(!view.primary.title.isEmpty)
    }

    @Test("grid fixture")
    func gridFixture() throws {
        let view = try Fixtures.view("grid")
        #expect(view.kind == .grid)
        let rows = try #require(view.grid)
        #expect(rows.contains(where: { $0.header.contains("Drinks") }))
        let cell = try #require(view.selectedGridCell)
        #expect(cell.id == view.selectedId)
        #expect(!cell.content.isEmpty)
        #expect(view.rows.isEmpty)
    }

    @Test("detail fixture")
    func detailFixture() throws {
        let view = try Fixtures.view("detail")
        #expect(view.kind == .detail)
        #expect(!view.detail.isEmpty)
        #expect(view.navigation.canGoBack)
    }

    @Test("form fixture")
    func formFixture() throws {
        let view = try Fixtures.view("form")
        #expect(view.kind == .form)
        let form = try #require(view.form)
        #expect(!form.fields.isEmpty)
        let focused = try #require(view.focusedField)
        #expect(focused.id == form.focusId)
        #expect(focused.focused)
        #expect(!focused.type.isEmpty)
    }

    @Test("menu-bar fixture")
    func menuBarFixture() throws {
        let view = try Fixtures.view("menu-bar")
        #expect(view.kind == .menuBar)
        let bar = try #require(view.menuBar)
        #expect(!bar.rows.isEmpty)
        #expect(bar.rows.contains(where: { $0.selected }))
        #expect(bar.selectedId != nil)
    }

    @Test("toast fixture")
    func toastFixture() throws {
        let view = try Fixtures.view("toast")
        #expect(view.kind == .empty)
        let toast = try #require(view.feedback.toast)
        #expect(toast.title == "Confirmed")
        #expect(!toast.style.isEmpty)
    }

    @Test("action panel fixture")
    func actionPanelFixture() throws {
        let view = try Fixtures.view("action-panel")
        #expect(view.actions.open)
        #expect(!view.actions.rows.isEmpty)
        #expect(view.actions.selectedIndex >= 0)
        #expect(view.actions.rows.contains(where: { $0.selected }))
    }

    @Test("unknown view kinds stay decodable")
    func unknownKind() throws {
        let view = try minimalViewJSON(kind: "timeline").decode(ControllerView.self)
        #expect(view.kind == .unknown("timeline"))
        #expect(view.kind.rawValue == "timeline")
    }

    @Test("optional row fields decode as nil")
    func optionalFields() throws {
        let view = try Fixtures.view("list")
        #expect(view.rows.first?.iconTint == nil)
        #expect(view.rows.first?.count == nil)
    }
}
