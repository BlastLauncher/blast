import Foundation
import Testing

@testable import BlastKit

@Suite("blast serve integration")
struct ProcessIntegrationTests {
    /// Drives the real engine with `hello-list`: handshake, launch with views,
    /// move the selection down, run `primary`, and answer `clipboard.copy`
    /// through an injected handler. Nothing touches the system clipboard.
    @Test(
        .enabled(if: NodeRuntime.isAvailable, "node must be on PATH to run blast serve"),
        .timeLimit(.minutes(2))
    )
    func helloList() async throws {
        let dataDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("blastkit-integration-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dataDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dataDirectory) }

        var environment = ProcessInfo.processInfo.environment
        environment["XDG_DATA_HOME"] = dataDirectory.path
        let transport = ProcessTransport(
            servePath: repositoryRoot.appendingPathComponent(ProcessTransport.defaultServePath).path,
            workingDirectory: repositoryRoot,
            environment: environment
        )
        let handler = RecordingCapabilityHandler()
        let client = BlastClient(transport: transport, capabilityHandler: handler)
        let recorder = EventRecorder()
        client.onEvent = { recorder.record($0) }
        client.onDiagnostic = { recorder.record($0) }
        defer { client.close() }

        let welcome = try await client.start(capabilities: ["clipboard.copy"])
        #expect(welcome.protocolVersion == 1)
        #expect(welcome.catalog["clipboard.copy"]?["scope"] == .string("grant"))

        let extensionID = try await client.openExtension(
            dir: repositoryRoot.appendingPathComponent("fixtures/extensions/hello-list").path
        )
        let session = try await client.launchExtension(extension: extensionID, command: "index")

        let list = try await waitForView(recorder, after: recorder.views.count, "the first list view") {
            $0.kind == .list && $0.rows.count == 3
        }
        #expect(list.rows.count == 3)
        let first = try #require(list.selectedRow)
        #expect(first.selected)
        #expect(first.id == list.selectedId)
        #expect(list.rows.first?.id == first.id)

        let beforeMove = recorder.views.count
        try await client.sendInput(.move(.down), session: session)
        let moved = try await waitForView(recorder, after: beforeMove, "the moved selection") {
            $0.selectedRow?.id != first.id
        }
        let second = try #require(moved.selectedRow)
        #expect(second.id == moved.selectedId)
        #expect(second.id == list.rows[1].id)
        #expect(second.title == list.rows[1].title)

        let beforePrimary = recorder.views.count
        try await client.sendInput(.primary, session: session)
        let copy = try await eventually("the clipboard.copy capability call") { handler.calls.first }
        #expect(copy.name == "clipboard.copy")
        #expect(copy.session == session)
        #expect(copy.params["text"] == .string(second.title))

        let copied = try await waitForView(recorder, after: beforePrimary, "the copied title") {
            $0.title.contains("copied \(second.title)")
        }
        #expect(copied.primary.title == "Copy \(second.title)")

        try await client.shutdown()
        #expect(recorder.recordedDiagnostics.isEmpty)
    }
}

private func waitForView(
    _ recorder: EventRecorder,
    after index: Int,
    _ label: String,
    timeout: Duration = .seconds(30),
    where predicate: @escaping @Sendable (ControllerView) -> Bool
) async throws -> ControllerView {
    try await eventually(label, timeout: timeout) {
        let views = recorder.views
        guard index < views.count else { return nil }
        return views[index...].map { $0.view }.first(where: predicate)
    }
}
