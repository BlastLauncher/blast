import Foundation
import Testing

@testable import BlastKit

// Paths come from this source file so the fixtures work from a checkout without
// bundling resources (SwiftPM cannot copy a directory outside the test target).
let blastKitTestsDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let fixturesDirectory = blastKitTestsDirectory.deletingLastPathComponent()
    .appendingPathComponent("Fixtures")
let macosLauncherDirectory = blastKitTestsDirectory.deletingLastPathComponent()
    .deletingLastPathComponent()
let repositoryRoot = macosLauncherDirectory.deletingLastPathComponent().deletingLastPathComponent()

let fixtureNames = ["list", "grid", "detail", "form", "menu-bar", "toast", "action-panel", "root", "prompt"]

struct WaitTimeout: Error, CustomStringConvertible {
    let label: String
    var description: String { "timed out waiting for \(label)" }
}

/// Polls `body` until it returns a value. The fake transports are asynchronous,
/// so unit tests wait on observable state instead of sleeping for a fixed time.
func eventually<T>(
    _ label: String,
    timeout: Duration = .seconds(5),
    _ body: @Sendable () async -> T?
) async throws -> T {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
        if let value = await body() { return value }
        try await Task.sleep(for: .milliseconds(2))
    }
    if let value = await body() { return value }
    throw WaitTimeout(label: label)
}

final class FakeTransport: BlastTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [Data] = []
    private var lineHandler: (@Sendable (Data) -> Void)?
    private var errorHandler: (@Sendable (BlastError) -> Void)?
    private var exitHandler: (@Sendable (Error?) -> Void)?
    private var started = false
    private var closeCount = 0

    var sentData: [Data] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }

    var sentMessages: [JSONValue] {
        sentData.compactMap { try? JSONDecoder().decode(JSONValue.self, from: $0) }
    }

    var requests: [JSONValue] {
        sentMessages.filter { $0["type"] == .string("request") }
    }

    var requestIDs: [String] {
        requests.compactMap { $0["id"]?.stringValue }
    }

    var capabilityResults: [JSONValue] {
        sentMessages.filter { $0["type"] == .string("capability.result") }
    }

    var isStarted: Bool {
        lock.lock()
        defer { lock.unlock() }
        return started
    }

    var closeCalls: Int {
        lock.lock()
        defer { lock.unlock() }
        return closeCount
    }

    func start(
        onLine: @escaping @Sendable (Data) -> Void,
        onError: @escaping @Sendable (BlastError) -> Void,
        onExit: @escaping @Sendable (Error?) -> Void
    ) throws {
        lock.lock()
        started = true
        lineHandler = onLine
        errorHandler = onError
        exitHandler = onExit
        lock.unlock()
    }

    func send(_ data: Data) throws {
        lock.lock()
        storage.append(data)
        lock.unlock()
    }

    func close() {
        lock.lock()
        closeCount += 1
        lock.unlock()
    }

    func emit(line: String) {
        sendToLineHandler(Data(line.utf8))
    }

    func emit(_ message: JSONValue) {
        guard let data = try? JSONEncoder().encode(message) else {
            Issue.record("could not encode a fake message")
            return
        }
        sendToLineHandler(data)
    }

    func emitError(_ error: BlastError) {
        lock.lock()
        let handler = errorHandler
        lock.unlock()
        handler?(error)
    }

    func emitExit(_ error: Error?) {
        lock.lock()
        let handler = exitHandler
        lock.unlock()
        handler?(error)
    }

    private func sendToLineHandler(_ data: Data) {
        lock.lock()
        let handler = lineHandler
        lock.unlock()
        handler?(data)
    }
}

func welcomeJSON(protocolVersion: Int = 1, engineVersion: String = "0.0.0-test") -> JSONValue {
    .object([
        "type": .string("welcome"),
        "protocol": .number(Double(protocolVersion)),
        "engine": .object(["version": .string(engineVersion)]),
        "catalog": .object([
            "clipboard.copy": .object(["scope": .string("grant")]),
            "storage.set": .object(["scope": .string("session")]),
        ]),
    ])
}

func response(id: String, result: JSONValue) -> JSONValue {
    .object(["type": .string("response"), "id": .string(id), "ok": .bool(true), "result": result])
}

func failureResponse(id: String, code: String, message: String, data: JSONValue? = nil) -> JSONValue {
    var error: [String: JSONValue] = ["code": .string(code), "message": .string(message)]
    if let data { error["data"] = data }
    return .object([
        "type": .string("response"),
        "id": .string(id),
        "ok": .bool(false),
        "error": .object(error),
    ])
}

func eventJSON(_ name: String, _ values: [String: JSONValue]) -> JSONValue {
    var object: [String: JSONValue] = ["type": .string("event"), "event": .string(name)]
    for (key, value) in values { object[key] = value }
    return .object(object)
}

/// A complete `ControllerView` with every field the decoder requires.
func minimalViewJSON(kind: String = "list") -> JSONValue {
    .object([
        "kind": .string(kind),
        "title": .string("Test"),
        "navigation": .object(["canGoBack": .bool(false)]),
        "loading": .bool(false),
        "search": .object(["text": .string(""), "placeholder": .string("Search…")]),
        "rows": .array([]),
        "grid": .null,
        "selectedId": .null,
        "emptyText": .string("No results"),
        "empty": .null,
        "detail": .string(""),
        "primary": .object([
            "title": .string("Run"), "shortcut": .string("↵"), "enabled": .bool(false),
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
        "feedback": .object(["toast": .null, "hud": .null, "alert": .null]),
        "menuBar": .null,
        "form": .null,
        "requests": .object(["quit": .bool(false), "clearSearch": .bool(false)]),
    ])
}

func connect(
    _ client: BlastClient,
    over transport: FakeTransport,
    capabilities: [String] = []
) async throws -> Welcome {
    let start = Task { try await client.start(capabilities: capabilities) }
    _ = try await eventually("the hello message") { transport.sentMessages.isEmpty ? nil : true }
    transport.emit(welcomeJSON())
    return try await start.value
}

enum Fixtures {
    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: fixturesDirectory.appendingPathComponent("\(name).json"))
    }

    static func view(_ name: String) throws -> ControllerView {
        try JSONDecoder().decode(ControllerView.self, from: data(name))
    }
}

final class RecordingCapabilityHandler: CapabilityHandler, @unchecked Sendable {
    struct Call: Equatable, Sendable {
        let name: String
        let session: String
        let params: JSONValue
    }

    private let lock = NSLock()
    private var storage: [Call] = []
    private let result: JSONValue
    private let failure: EmbedderError?

    init(result: JSONValue = .null) {
        self.result = result
        self.failure = nil
    }

    init(failingWith error: EmbedderError) {
        self.result = .null
        self.failure = error
    }

    var calls: [Call] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }

    func handle(_ request: CapabilityRequest) async throws -> JSONValue {
        lock.withLock {
            storage.append(Call(name: request.name, session: request.session, params: request.params))
        }
        if let failure { throw failure }
        return result
    }
}

final class EventRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [BlastEvent] = []
    private var diagnostics: [BlastError] = []

    func record(_ event: BlastEvent) {
        lock.lock()
        storage.append(event)
        lock.unlock()
    }

    func record(_ error: BlastError) {
        lock.lock()
        diagnostics.append(error)
        lock.unlock()
    }

    var events: [BlastEvent] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }

    var recordedDiagnostics: [BlastError] {
        lock.lock()
        defer { lock.unlock() }
        return diagnostics
    }

    var views: [(session: String, view: ControllerView)] {
        events.compactMap { event in
            guard case .view(let session, let view) = event else { return nil }
            return (session, view)
        }
    }
}

enum NodeRuntime {
    /// `node --version` through `/usr/bin/env`, matching how ProcessTransport starts it.
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
