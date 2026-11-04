import Foundation
import Testing
import BlastKit
@testable import BlastPresenter

/// The full path the UI takes: a real `blast serve`, the `hello-list` fixture
/// extension, the presenter mapping each view, and presenter-generated inputs
/// travelling back. Capabilities are answered by a recording fake, so nothing
/// touches the system clipboard.
@Suite("Launcher end to end")
struct LauncherEndToEndTests {
    @Test(
        .enabled(if: NodeRuntime.isAvailable, "node must be on PATH to run blast serve"),
        .timeLimit(.minutes(2))
    )
    func helloListThroughPresenter() async throws {
        let dataDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("blast-launcher-e2e-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dataDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dataDirectory) }

        var environment = ProcessInfo.processInfo.environment
        environment["XDG_DATA_HOME"] = dataDirectory.path
        let transport = ProcessTransport(
            servePath: repositoryRoot.appendingPathComponent(ProcessTransport.defaultServePath).path,
            workingDirectory: repositoryRoot,
            environment: environment
        )
        let handler = RecordingClipboardHandler()
        let client = BlastClient(transport: transport, capabilityHandler: handler)
        let recorder = ViewRecorder()
        client.onEvent = { recorder.record($0) }
        client.onDiagnostic = { recorder.record($0) }
        defer { client.close() }

        _ = try await client.start(capabilities: ["clipboard.copy"])
        let extensionID = try await client.openExtension(
            dir: repositoryRoot.appendingPathComponent("fixtures/extensions/hello-list").path
        )
        let session = try await client.launchExtension(extension: extensionID, command: "index")
        let presenter = LauncherPresenter()

        // The command opens on a list; the presenter renders it.
        let list = try await waitForView(recorder, after: 0, "the hello-list rows") {
            $0.kind == .list && $0.rows.count == 3
        }
        presenter.apply(list)
        #expect(presenter.display.rows.map(\.title) == ["apple", "banana", "cherry"])
        #expect(presenter.display.selectedRowIndex == 0)
        #expect(presenter.display.primaryTitle == "Copy apple")

        // Type in the search field: the presenter turns it into a search input.
        let search = presenter.input(for: LauncherKey(code: .character, character: "a"))
        #expect(search == .search("a"))
        let beforeSearch = recorder.views.count
        try await client.sendInput(try #require(search), session: session)
        let searched = try await waitForView(recorder, after: beforeSearch, "the filtered rows") {
            $0.search.text == "a" && $0.rows.count == 2
        }
        presenter.apply(searched)
        #expect(presenter.display.searchText == "a")
        #expect(presenter.display.rows.map(\.title) == ["apple", "banana"])

        // Move down through the presenter's key mapping.
        let move = presenter.input(for: LauncherKey(code: .down))
        #expect(move == .move(.down))
        let beforeMove = recorder.views.count
        try await client.sendInput(try #require(move), session: session)
        let moved = try await waitForView(recorder, after: beforeMove, "the moved selection") {
            $0.selectedRow?.title == "banana"
        }
        presenter.apply(moved)
        #expect(presenter.display.selectedRowId == moved.selectedRow?.id)

        // Return runs the primary action; the fake capability receives the text.
        let primary = presenter.input(for: LauncherKey(code: .returnKey))
        #expect(primary == .primary)
        let beforePrimary = recorder.views.count
        try await client.sendInput(try #require(primary), session: session)
        let copy = try await eventually("the clipboard.copy capability call", timeout: .seconds(30)) {
            handler.calls.first
        }
        #expect(copy.name == "clipboard.copy")
        #expect(copy.session == session)
        #expect(copy.params["text"] == .string("banana"))

        let copied = try await waitForView(recorder, after: beforePrimary, "the copied title") {
            $0.title.contains("copied banana")
        }
        presenter.apply(copied)
        #expect(presenter.display.title == "copied banana")
        #expect(presenter.display.toast == nil)

        try await client.shutdown()
        #expect(recorder.diagnostics.isEmpty)
    }
}

private let repositoryRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent() // BlastPresenterTests
    .deletingLastPathComponent() // Tests
    .deletingLastPathComponent() // macos-launcher
    .deletingLastPathComponent() // examples
    .deletingLastPathComponent() // repository root

private struct WaitTimeout: Error, CustomStringConvertible {
    let label: String
    var description: String { "timed out waiting for \(label)" }
}

private func eventually<T>(
    _ label: String,
    timeout: Duration = .seconds(5),
    _ body: @Sendable () async -> T?
) async throws -> T {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
        if let value = await body() { return value }
        try await Task.sleep(for: .milliseconds(5))
    }
    if let value = await body() { return value }
    throw WaitTimeout(label: label)
}

private func waitForView(
    _ recorder: ViewRecorder,
    after index: Int,
    _ label: String,
    timeout: Duration = .seconds(30),
    where predicate: @escaping @Sendable (ControllerView) -> Bool
) async throws -> ControllerView {
    try await eventually(label, timeout: timeout) {
        let views = recorder.views
        guard index < views.count else { return nil }
        return views[index...].map(\.view).first(where: predicate)
    }
}

private final class RecordingClipboardHandler: CapabilityHandler, @unchecked Sendable {
    struct Call: Equatable, Sendable {
        let name: String
        let session: String
        let params: JSONValue
    }

    private let lock = NSLock()
    private var storage: [Call] = []

    var calls: [Call] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }

    func handle(_ request: CapabilityRequest) async throws -> JSONValue {
        lock.withLock {
            storage.append(Call(name: request.name, session: request.session, params: request.params))
        }
        return .null
    }
}

private final class ViewRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var events: [BlastEvent] = []
    private var recorded: [BlastError] = []

    func record(_ event: BlastEvent) {
        lock.lock()
        events.append(event)
        lock.unlock()
    }

    func record(_ error: BlastError) {
        lock.lock()
        recorded.append(error)
        lock.unlock()
    }

    var views: [(session: String, view: ControllerView)] {
        lock.lock()
        defer { lock.unlock() }
        return events.compactMap { event in
            guard case .view(let session, let view) = event else { return nil }
            return (session, view)
        }
    }

    var diagnostics: [BlastError] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }
}

private enum NodeRuntime {
    static let isAvailable: Bool = {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", "--version"]
        process.standardOutput = Pipe()
        process.standardError = Pipe()
        do {
            try process.run()
        } catch {
            return false
        }
        process.waitUntilExit()
        return process.terminationStatus == 0
    }()
}
