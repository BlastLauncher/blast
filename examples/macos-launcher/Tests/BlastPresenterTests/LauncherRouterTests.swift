import Foundation
import Testing
import BlastKit
@testable import BlastPresenter

// Mutating calls stay outside `#expect`, which may capture its operands as values.
@Suite("Launcher router")
struct LauncherRouterTests {
    @Test("sends input to the root until it launches a command")
    func rootBeforeLaunch() throws {
        var router = LauncherRouter()
        #expect(router.inputTarget == nil)

        let rootView = try Fixtures.view("root")
        let pending = router.open(root: "r1")
        #expect(pending == nil)
        #expect(router.inputTarget == .root("r1"))
        let drawn = router.receive(.rootView(root: "r1", view: rootView))
        #expect(drawn == rootView)
        #expect(router.inputTarget == .root("r1"))
    }

    @Test("draws the root view serve sent before the root.open response")
    func earlyRootView() throws {
        var router = LauncherRouter()
        let rootView = try Fixtures.view("root")
        let early = router.receive(.rootView(root: "r1", view: rootView))
        #expect(early == nil)
        let pending = router.open(root: "r1")
        #expect(pending == rootView)
        #expect(router.inputTarget == .root("r1"))
    }

    @Test("sends input to the launched session and draws only its views")
    func sessionAfterLaunch() throws {
        var router = LauncherRouter()
        _ = router.open(root: "r1")
        let rootView = try Fixtures.view("root")
        let commandView = try Fixtures.view("form")

        let launched = router.receive(.rootLaunched(root: "r1", session: "s1"))
        #expect(launched == nil)
        #expect(router.inputTarget == .session("s1"))
        let drawn = router.receive(.view(session: "s1", view: commandView))
        #expect(drawn == commandView)
        // The root keeps publishing (manifest edits); the running command keeps the display.
        let hidden = router.receive(.rootView(root: "r1", view: rootView))
        #expect(hidden == nil)
        #expect(router.inputTarget == .session("s1"))
    }

    @Test("returns input and the display to the root after the session exits")
    func backToRoot() throws {
        var router = LauncherRouter()
        _ = router.open(root: "r1")
        let rootView = try Fixtures.view("root")
        _ = router.receive(.rootLaunched(root: "r1", session: "s1"))

        let exited = router.receive(.exited(session: "s1", code: 0, error: nil))
        #expect(exited == nil)
        #expect(router.session == nil)
        #expect(router.inputTarget == .root("r1"))
        let drawn = router.receive(.rootView(root: "r1", view: rootView))
        #expect(drawn == rootView)
        let stale = router.receive(.view(session: "s1", view: try Fixtures.view("form")))
        #expect(stale == nil)
    }

    @Test("redraws the cached root view on session exit when no new root event arrives")
    func redrawsCachedRootOnSessionExit() throws {
        var router = LauncherRouter()
        let rootView = try Fixtures.view("root")
        let commandView = try Fixtures.view("form")

        // Serve sends the initial root view before root.open resolves.
        #expect(router.receive(.rootView(root: "r1", view: rootView)) == nil)
        #expect(router.open(root: "r1") == rootView)

        #expect(router.receive(.rootLaunched(root: "r1", session: "s1")) == nil)
        #expect(router.receive(.view(session: "s1", view: commandView)) == commandView)

        // Protocol 2 sends no root.view when the root view is unchanged on exit.
        let redrawn = router.receive(.exited(session: "s1", code: 0, error: nil))
        #expect(redrawn == rootView)
        #expect(router.session == nil)
        #expect(router.inputTarget == .root("r1"))

        // If the root updates while a later session runs, exit redraws the latest root view.
        let updatedRootView = try Fixtures.view("list")
        #expect(router.receive(.rootLaunched(root: "r1", session: "s2")) == nil)
        #expect(router.receive(.rootView(root: "r1", view: updatedRootView)) == nil)
        let redrawnUpdated = router.receive(.exited(session: "s2", code: 0, error: nil))
        #expect(redrawnUpdated == updatedRootView)
    }

    @Test("ignores events for other roots and sessions")
    func otherHandles() throws {
        var router = LauncherRouter()
        _ = router.open(root: "r1")
        let view = try Fixtures.view("root")

        let otherRootView = router.receive(.rootView(root: "r2", view: view))
        #expect(otherRootView == nil)
        _ = router.receive(.rootLaunched(root: "r2", session: "s2"))
        #expect(router.inputTarget == .root("r1"))
        let otherSessionView = router.receive(.view(session: "s2", view: view))
        #expect(otherSessionView == nil)

        _ = router.receive(.rootLaunched(root: "r1", session: "s1"))
        let foreignView = router.receive(.view(session: "s2", view: view))
        #expect(foreignView == nil)
        _ = router.receive(.exited(session: "s2", code: 0, error: nil))
        #expect(router.inputTarget == .session("s1"))
    }
}
