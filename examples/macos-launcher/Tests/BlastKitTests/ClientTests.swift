import Foundation
import Testing

@testable import BlastKit

@Suite("BlastClient protocol")
struct ClientTests {
    @Test("handshake sends hello and returns the welcome")
    func handshake() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        let start = Task { try await client.start(capabilities: ["clipboard.copy"]) }
        let hello = try await eventually("the hello message") { transport.sentMessages.first }
        #expect(hello["type"] == .string("hello"))
        #expect(hello["protocol"]?.intValue == 1)
        #expect(hello["capabilities"] == .array([.string("clipboard.copy")]))

        transport.emit(welcomeJSON(engineVersion: "9.9.9"))
        let welcome = try await start.value
        #expect(welcome.protocolVersion == 1)
        #expect(welcome.engineVersion == "9.9.9")
        #expect(welcome.catalog["clipboard.copy"]?["scope"] == .string("grant"))
        #expect(client.welcome == welcome)
    }

    @Test("a second start is rejected")
    func secondStart() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        _ = try await connect(client, over: transport)
        do {
            _ = try await client.start()
            Issue.record("expected the second start to fail")
        } catch {
            #expect((error as? BlastError) == .transport("the client already started"))
        }
    }

    @Test("a protocol version mismatch fails the handshake")
    func versionMismatch() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        let start = Task { try await client.start() }
        _ = try await eventually("the hello message") { transport.sentMessages.isEmpty ? nil : true }
        transport.emit(welcomeJSON(protocolVersion: 2))
        do {
            _ = try await start.value
            Issue.record("expected a version mismatch")
        } catch {
            #expect((error as? BlastError) == .versionMismatch(expected: 1, received: 2))
        }
    }

    @Test("a server error before the welcome fails the handshake")
    func errorBeforeWelcome() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        let start = Task { try await client.start() }
        _ = try await eventually("the hello message") { transport.sentMessages.isEmpty ? nil : true }
        transport.emit(
            .object([
                "type": .string("error"),
                "error": .object([
                    "code": .string("invalid_message"), "message": .string("bad hello"),
                ]),
            ])
        )
        do {
            _ = try await start.value
            Issue.record("expected the handshake to fail")
        } catch {
            #expect((error as? BlastError)?.remoteError?.code == "invalid_message")
        }
    }

    @Test("responses match their ids even when they arrive out of order")
    func outOfOrderResponses() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        _ = try await connect(client, over: transport)

        let first = Task { try await client.request("extension.open", params: .object(["dir": .string("a")])) }
        let second = Task { try await client.request("extension.open", params: .object(["dir": .string("b")])) }
        let requests = try await eventually("both requests") {
            transport.requests.count == 2 ? transport.requests : nil
        }
        func id(for dir: String) throws -> String {
            let request = requests.first { $0["params"]?["dir"] == .string(dir) }
            return try #require(request?["id"]?.stringValue)
        }
        let firstID = try id(for: "a")
        let secondID = try id(for: "b")
        #expect(firstID != secondID)

        // Answer the later request first; each task still gets its own result.
        transport.emit(response(id: secondID, result: .string("second")))
        transport.emit(response(id: firstID, result: .string("first")))
        let firstValue = try await first.value
        let secondValue = try await second.value
        #expect(firstValue == .string("first"))
        #expect(secondValue == .string("second"))
    }

    @Test("events can arrive before their response")
    func eventBeforeResponse() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        let recorder = EventRecorder()
        client.onEvent = { recorder.record($0) }
        _ = try await connect(client, over: transport)

        let launch = Task { try await client.launchExtension(extension: "1", command: "index") }
        let id = try await eventually("the launch request") { transport.requestIDs.first }
        transport.emit(
            eventJSON("session.view", ["session": .string("2"), "view": minimalViewJSON()])
        )
        transport.emit(response(id: id, result: .object(["session": .string("2")])))

        #expect(try await launch.value == "2")
        let views = try await eventually("the recorded view") { recorder.views.isEmpty ? nil : recorder.views }
        #expect(views.first?.session == "2")
        #expect(views.first?.view.kind == .list)
    }

    @Test("views, exits and dependency logs decode into events")
    func eventDecoding() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        let recorder = EventRecorder()
        client.onEvent = { recorder.record($0) }
        _ = try await connect(client, over: transport)

        transport.emit(eventJSON("session.view", ["session": .string("3"), "view": minimalViewJSON(kind: "grid")]))
        transport.emit(
            eventJSON("session.exited", [
                "session": .string("3"),
                "code": .number(0),
                "error": .object(["code": .string("crashed"), "message": .string("boom")]),
            ])
        )
        transport.emit(
            eventJSON("dependencies.log", [
                "extension": .string("1"), "message": .string("installing"),
            ])
        )
        transport.emit(eventJSON("future.event", ["payload": .number(1)]))

        _ = try await eventually("four events") { recorder.events.count == 4 ? true : nil }
        #expect(recorder.events.count == 4)
        guard case .view(let session, let view) = recorder.events[0] else {
            Issue.record("the first event is not a view")
            return
        }
        #expect(session == "3")
        #expect(view.kind == .grid)
        guard case .exited(let exitedSession, let code, let error) = recorder.events[1] else {
            Issue.record("the second event is not an exit")
            return
        }
        #expect(exitedSession == "3")
        #expect(code == 0)
        #expect(error?.code == "crashed")
        guard case .dependenciesLog(let extensionID, let message) = recorder.events[2] else {
            Issue.record("the third event is not a dependency log")
            return
        }
        #expect(extensionID == "1")
        #expect(message == "installing")
        guard case .other(let name, _) = recorder.events[3] else {
            Issue.record("the fourth event is not an unknown event")
            return
        }
        #expect(name == "future.event")
    }

    @Test("malformed lines are reported and the stream keeps working")
    func malformedLineRecovery() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        let recorder = EventRecorder()
        client.onDiagnostic = { recorder.record($0) }
        _ = try await connect(client, over: transport)

        transport.emit(line: "{broken")
        let diagnostic = try await eventually("the malformed-line report") {
            recorder.recordedDiagnostics.first
        }
        guard case .malformedMessage(let text) = diagnostic else {
            Issue.record("the diagnostic is not malformedMessage: \(diagnostic)")
            return
        }
        #expect(text.contains("JSON"))

        let request = Task { try await client.request("engine.shutdown") }
        let id = try await eventually("the shutdown request") { transport.requestIDs.first }
        transport.emit(response(id: id, result: .null))
        #expect(try await request.value == .null)
    }

    @Test("a missing_values error carries typed data")
    func missingValuesError() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        _ = try await connect(client, over: transport)

        let launch = Task { try await client.request("extension.launch") }
        let id = try await eventually("the launch request") { transport.requestIDs.first }
        transport.emit(
            failureResponse(
                id: id,
                code: "missing_values",
                message: "Missing required values: query",
                data: .object([
                    "preferences": .array([]),
                    "arguments": .array([.string("query")]),
                ])
            )
        )
        let error = try await expectBlastError(from: launch)
        let remote = try #require(error.remoteError)
        #expect(remote.code == "missing_values")
        #expect(remote.missingValues?.arguments == ["query"])
        #expect(remote.missingValues?.preferences.isEmpty == true)
    }

    @Test("a missing_dependencies error carries typed data")
    func missingDependenciesError() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        _ = try await connect(client, over: transport)

        let launch = Task { try await client.request("extension.launch") }
        let id = try await eventually("the launch request") { transport.requestIDs.first }
        transport.emit(
            failureResponse(
                id: id,
                code: "missing_dependencies",
                message: "Missing dependencies: a, b",
                data: .object([
                    "unresolved": .array([.string("a"), .string("b")]),
                    "installable": .bool(false),
                    "pinned": .bool(true),
                ])
            )
        )
        let error = try await expectBlastError(from: launch)
        let remote = try #require(error.remoteError)
        #expect(remote.code == "missing_dependencies")
        #expect(remote.missingDependencies == MissingDependencies(unresolved: ["a", "b"], installable: false, pinned: true))
        #expect(remote.data?["unresolved"]?.arrayValue?.count == 2)
    }

    @Test("a handler answers a capability request")
    func handledCapability() async throws {
        let handler = RecordingCapabilityHandler(result: .string("copied"))
        let transport = FakeTransport()
        let client = BlastClient(transport: transport, capabilityHandler: handler)
        _ = try await connect(client, over: transport)

        transport.emit(
            capabilityRequest(id: "cap-1", session: "2", name: "clipboard.copy", params: .object(["text": .string("apple")]))
        )
        let result = try await eventually("the capability result") { transport.capabilityResults.first }
        #expect(result["id"] == .string("cap-1"))
        #expect(result["ok"] == .bool(true))
        #expect(result["value"] == .string("copied"))
        #expect(handler.calls == [.init(name: "clipboard.copy", session: "2", params: .object(["text": .string("apple")]))])
    }

    @Test("an unhandled capability is answered with an error")
    func unhandledCapability() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        _ = try await connect(client, over: transport)

        transport.emit(capabilityRequest(id: "cap-2", session: "2", name: "open", params: .null))
        let result = try await eventually("the capability result") { transport.capabilityResults.first }
        #expect(result["ok"] == .bool(false))
        #expect(result["error"]?["code"] == .string("unhandled_capability"))
    }

    @Test("a handler error is forwarded with its code")
    func failingCapability() async throws {
        let handler = RecordingCapabilityHandler(
            failingWith: EmbedderError(code: "denied", message: "not allowed")
        )
        let transport = FakeTransport()
        let client = BlastClient(transport: transport, capabilityHandler: handler)
        _ = try await connect(client, over: transport)

        transport.emit(capabilityRequest(id: "cap-3", session: "2", name: "open", params: .null))
        let result = try await eventually("the capability result") { transport.capabilityResults.first }
        #expect(result["ok"] == .bool(false))
        #expect(result["error"]?["code"] == .string("denied"))
        #expect(result["error"]?["message"] == .string("not allowed"))
    }

    @Test("capability cancellation is reported as an event")
    func capabilityCancellation() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        let recorder = EventRecorder()
        client.onEvent = { recorder.record($0) }
        _ = try await connect(client, over: transport)

        transport.emit(.object(["type": .string("capability.cancel"), "id": .string("cap-4")]))
        let event = try await eventually("the cancellation event") {
            recorder.events.first(where: { if case .capabilityCancelled = $0 { true } else { false } })
        }
        #expect(event == .capabilityCancelled(id: "cap-4"))
    }

    @Test("a transport exit fails outstanding requests")
    func transportExit() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        _ = try await connect(client, over: transport)

        let request = Task { try await client.request("engine.shutdown") }
        _ = try await eventually("the shutdown request") { transport.requestIDs.isEmpty ? nil : true }
        transport.emitExit(BlastError.transport("pipe closed"))
        do {
            _ = try await request.value
            Issue.record("expected the request to fail")
        } catch {
            #expect((error as? BlastError) == .transport("pipe closed"))
        }
        #expect(client.welcome != nil)
    }

    @Test("close fails pending requests and closes the transport once")
    func closeFailsPending() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        _ = try await connect(client, over: transport)

        let request = Task { try await client.request("engine.shutdown") }
        _ = try await eventually("the shutdown request") { transport.requestIDs.isEmpty ? nil : true }
        client.close()
        do {
            _ = try await request.value
            Issue.record("expected the request to fail")
        } catch {
            #expect((error as? BlastError) == .closed)
        }
        #expect(transport.closeCalls == 1)
    }
}

private func capabilityRequest(id: String, session: String, name: String, params: JSONValue) -> JSONValue {
    .object([
        "type": .string("capability.request"),
        "id": .string(id),
        "session": .string(session),
        "name": .string(name),
        "params": params,
    ])
}

private func expectBlastError(from task: Task<JSONValue, Error>) async throws -> BlastError {
    do {
        _ = try await task.value
        Issue.record("expected the request to fail")
        throw WaitTimeout(label: "a BlastError")
    } catch let error as BlastError {
        return error
    }
}

@Suite("Capability routing")
struct CapabilityRoutingTests {
    @Test("routes named capabilities to injected handlers without OS side effects")
    func routes() async throws {
        let router = CapabilityRouter(handlers: [
            "clipboard.copy": { request in request.params["text"] ?? .null },
            "open.url": { _ in .string("opened") },
        ])
        let copy = try await router.handle(CapabilityRequest(
            id: "1", session: "s", name: "clipboard.copy", params: .object(["text": .string("safe")])
        ))
        #expect(copy == .string("safe"))
        #expect(try await router.handle(CapabilityRequest(id: "2", session: "s", name: "open.url", params: .null)) == .string("opened"))
        do {
            _ = try await router.handle(CapabilityRequest(id: "3", session: "s", name: "clipboard.read", params: .null))
            Issue.record("unhandled capability unexpectedly succeeded")
        } catch let error as EmbedderError {
            #expect(error.code == "unhandled_capability")
        }
    }
}
