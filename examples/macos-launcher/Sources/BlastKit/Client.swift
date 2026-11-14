import Foundation

/// What the engine answered the handshake with.
public struct Welcome: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let engineVersion: String
    /// Capability name to its catalog entry (`scope`, `summary`, `params`, …).
    public let catalog: [String: JSONValue]

    public init(protocolVersion: Int, engineVersion: String, catalog: [String: JSONValue]) {
        self.protocolVersion = protocolVersion
        self.engineVersion = engineVersion
        self.catalog = catalog
    }
}

/// Events the engine pushes; none of them answer a request by themselves.
public enum BlastEvent: Equatable, Sendable {
    case view(session: String, view: ControllerView)
    case rootView(root: String, view: ControllerView)
    case rootLaunched(root: String, session: String)
    case scene(session: String, scene: JSONValue)
    case log(session: String, log: JSONValue)
    case exited(session: String, code: Int?, error: EmbedderError?)
    case dependenciesLog(extension: String, message: String)
    case manifestChanged(extension: String, manifest: JSONValue?)
    case manifestError(extension: String, error: EmbedderError)
    case capabilityCancelled(id: String)
    /// Any event this client does not model yet; the payload is the whole message.
    case other(name: String, payload: JSONValue)
}

/// The platform whose shortcuts and labels the server should render.
public enum ViewPlatform: String, Codable, Sendable {
    case macOS = "macOS"
    case windows = "Windows"
    case linux = "Linux"
}

/// A `blast serve` client: handshake, request/response correlation, events and
/// capability forwarding over any `BlastTransport`.
///
/// State is guarded by one lock and continuations are resumed outside it, so a
/// handler may safely start another request. The class is safe to share, which
/// `@unchecked Sendable` asserts for the lock-protected storage.
public final class BlastClient: @unchecked Sendable {
    public static let protocolVersion = 1

    public let transport: any BlastTransport

    private let lock = NSLock()
    private var requestSequence = 0
    private var pending: [String: CheckedContinuation<JSONValue, Error>] = [:]
    private var welcomeWaiter: CheckedContinuation<Welcome, Error>?
    private var welcomeInfo: Welcome?
    private var started = false
    private var closed = false

    private var eventHandler: (@Sendable (BlastEvent) -> Void)?
    private var diagnosticHandler: (@Sendable (BlastError) -> Void)?
    private var capability: (any CapabilityHandler)?

    public init(transport: any BlastTransport, capabilityHandler: (any CapabilityHandler)? = nil) {
        self.transport = transport
        self.capability = capabilityHandler
    }

    public var capabilityHandler: (any CapabilityHandler)? {
        get {
            lock.lock()
            defer { lock.unlock() }
            return capability
        }
        set {
            lock.lock()
            capability = newValue
            lock.unlock()
        }
    }

    /// Receives every non-capability event. Called on the transport's thread.
    public var onEvent: (@Sendable (BlastEvent) -> Void)? {
        get {
            lock.lock()
            defer { lock.unlock() }
            return eventHandler
        }
        set {
            lock.lock()
            eventHandler = newValue
            lock.unlock()
        }
    }

    /// Receives recoverable protocol problems (malformed or oversized lines).
    public var onDiagnostic: (@Sendable (BlastError) -> Void)? {
        get {
            lock.lock()
            defer { lock.unlock() }
            return diagnosticHandler
        }
        set {
            lock.lock()
            diagnosticHandler = newValue
            lock.unlock()
        }
    }

    /// The handshake result, once `start` returned.
    public var welcome: Welcome? {
        lock.lock()
        defer { lock.unlock() }
        return welcomeInfo
    }

    /// Sends `hello` and waits for a protocol-1 `welcome`.
    @discardableResult
    public func start(capabilities: [String] = []) async throws -> Welcome {
        let hello = JSONValue.object([
            "type": .string("hello"),
            "protocol": .number(Double(Self.protocolVersion)),
            "capabilities": .array(capabilities.map(JSONValue.string)),
        ])
        let encodedHello = try Self.encode(hello)
        return try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if started {
                lock.unlock()
                continuation.resume(throwing: BlastError.transport("the client already started"))
                return
            }
            started = true
            welcomeWaiter = continuation
            lock.unlock()
            do {
                try transport.start(
                    onLine: { [weak self] line in self?.receive(line: line) },
                    onError: { [weak self] error in self?.report(error) },
                    onExit: { [weak self] error in self?.transportExited(error: error) }
                )
                try transport.send(encodedHello)
            } catch {
                finishWelcome(with: .failure(error))
            }
        }
    }

    /// Sends one request and returns its `result` (`.null` for void methods).
    public func request(_ method: String, params: JSONValue = .object([:])) async throws -> JSONValue {
        let id: String = lock.withLock {
            requestSequence += 1
            return String(requestSequence)
        }
        let message = JSONValue.object([
            "type": .string("request"),
            "id": .string(id),
            "method": .string(method),
            "params": params,
        ])
        let encoded = try Self.encode(message)
        return try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if closed {
                lock.unlock()
                continuation.resume(throwing: BlastError.closed)
                return
            }
            pending[id] = continuation
            lock.unlock()
            do {
                try transport.send(encoded)
            } catch {
                respond(to: id, with: .failure(BlastError.transport(String(describing: error))))
            }
        }
    }

    public func openExtension(dir: String) async throws -> String {
        let result = try await request("extension.open", params: .object(["dir": .string(dir)]))
        guard let extensionID = result["extension"]?.stringValue else {
            throw BlastError.malformedMessage("extension.open did not return an extension id")
        }
        return extensionID
    }

    public func launchExtension(
        extension extensionID: String,
        command: String,
        views: ViewPlatform? = .macOS,
        installDependencies: Bool = false
    ) async throws -> String {
        var params: [String: JSONValue] = ["extension": .string(extensionID), "command": .string(command)]
        if let views {
            params["views"] = .object(["platform": .string(views.rawValue)])
        }
        if installDependencies { params["installDependencies"] = .bool(true) }
        let result = try await request("extension.launch", params: .object(params))
        guard let session = result["session"]?.stringValue else {
            throw BlastError.malformedMessage("extension.launch did not return a session id")
        }
        return session
    }

    public func openRoot(views: ViewPlatform? = .macOS) async throws -> String {
        var params: [String: JSONValue] = [:]
        if let views { params["views"] = .object(["platform": .string(views.rawValue)]) }
        let result = try await request("root.open", params: .object(params))
        guard let root = result["root"]?.stringValue else {
            throw BlastError.malformedMessage("root.open did not return a root id")
        }
        return root
    }

    public func sendInput(_ input: ControllerInput, root: String) async throws {
        _ = try await request(
            "root.input",
            params: .object(["root": .string(root), "input": try input.toJSON()])
        )
    }

    public func sendInput(_ input: ControllerInput, session: String) async throws {
        _ = try await request(
            "session.input",
            params: .object(["session": .string(session), "input": try input.toJSON()])
        )
    }

    public func closeExtension(_ extensionID: String) async throws {
        _ = try await request("extension.close", params: .object(["extension": .string(extensionID)]))
    }

    public func closeSession(_ session: String) async throws {
        _ = try await request("session.close", params: .object(["session": .string(session)]))
    }

    public func shutdown() async throws {
        _ = try await request("engine.shutdown")
    }

    /// Closes the transport and fails anything still outstanding.
    public func close() {
        lock.lock()
        closed = true
        lock.unlock()
        transport.close()
        failAll(BlastError.closed)
    }

    // MARK: - Incoming messages

    private func receive(line: Data) {
        let message: JSONValue
        do {
            message = try JSONDecoder().decode(JSONValue.self, from: line)
        } catch {
            report(.malformedMessage("line is not JSON: \(error)"))
            return
        }
        guard let object = message.objectValue, let type = object["type"]?.stringValue else {
            report(.malformedMessage("message is not an object with a string type"))
            return
        }
        switch type {
        case "welcome": receiveWelcome(object)
        case "response": receiveResponse(object)
        case "event": receiveEvent(object)
        case "capability.request": receiveCapabilityRequest(object)
        case "capability.cancel":
            guard let id = object["id"]?.stringValue else {
                report(.malformedMessage("capability.cancel is missing id"))
                return
            }
            emit(.capabilityCancelled(id: id))
        case "error":
            let error = Self.embedderError(object["error"])
                ?? EmbedderError(code: "invalid_message", message: "server sent an error without a code and message")
            let failure = BlastError.remote(error)
            report(failure)
            finishWelcome(with: .failure(failure))
        default:
            report(.malformedMessage("unknown message type \(type)"))
        }
    }

    private func receiveWelcome(_ object: [String: JSONValue]) {
        guard
            let version = object["protocol"]?.intValue,
            let engineVersion = object["engine"]?["version"]?.stringValue,
            let catalog = object["catalog"]?.objectValue
        else {
            finishWelcome(
                with: .failure(BlastError.malformedMessage("welcome is missing protocol, engine.version or catalog"))
            )
            return
        }
        guard version == Self.protocolVersion else {
            let failure = BlastError.versionMismatch(expected: Self.protocolVersion, received: version)
            report(failure)
            finishWelcome(with: .failure(failure))
            return
        }
        finishWelcome(
            with: .success(
                Welcome(protocolVersion: version, engineVersion: engineVersion, catalog: catalog)
            )
        )
    }

    private func receiveResponse(_ object: [String: JSONValue]) {
        guard let id = object["id"]?.stringValue else {
            report(.malformedMessage("response is missing id"))
            return
        }
        if object["ok"]?.boolValue == true {
            respond(to: id, with: .success(object["result"] ?? .null))
            return
        }
        guard let error = Self.embedderError(object["error"]) else {
            respond(to: id, with: .failure(BlastError.malformedMessage("response \(id) has no valid error")))
            return
        }
        respond(to: id, with: .failure(BlastError.remote(error)))
    }

    private func receiveEvent(_ object: [String: JSONValue]) {
        guard let name = object["event"]?.stringValue else {
            report(.malformedMessage("event is missing its name"))
            return
        }
        switch name {
        case "root.view":
            guard let root = object["root"]?.stringValue, let value = object["view"] else {
                report(.malformedMessage("root.view is missing root or view"))
                return
            }
            do { emit(.rootView(root: root, view: try value.decode(ControllerView.self))) }
            catch { report(.malformedMessage("root.view could not be decoded: \(error)")) }
        case "root.launched":
            guard let root = object["root"]?.stringValue, let session = object["session"]?.stringValue else {
                report(.malformedMessage("root.launched is missing root or session"))
                return
            }
            emit(.rootLaunched(root: root, session: session))
        case "session.view":
            guard let session = object["session"]?.stringValue, let value = object["view"] else {
                report(.malformedMessage("session.view is missing session or view"))
                return
            }
            do {
                emit(.view(session: session, view: try value.decode(ControllerView.self)))
            } catch {
                report(.malformedMessage("session.view could not be decoded: \(error)"))
            }
        case "session.scene":
            guard let session = object["session"]?.stringValue, let scene = object["scene"] else {
                report(.malformedMessage("session.scene is missing session or scene"))
                return
            }
            emit(.scene(session: session, scene: scene))
        case "session.log":
            guard let session = object["session"]?.stringValue, let log = object["log"] else {
                report(.malformedMessage("session.log is missing session or log"))
                return
            }
            emit(.log(session: session, log: log))
        case "session.exited":
            guard let session = object["session"]?.stringValue else {
                report(.malformedMessage("session.exited is missing session"))
                return
            }
            emit(
                .exited(
                    session: session,
                    code: object["code"]?.intValue,
                    error: Self.embedderError(object["error"])
                )
            )
        case "dependencies.log":
            guard
                let extensionID = object["extension"]?.stringValue,
                let message = object["message"]?.stringValue
            else {
                report(.malformedMessage("dependencies.log is missing extension or message"))
                return
            }
            emit(.dependenciesLog(extension: extensionID, message: message))
        case "manifest.changed":
            guard let extensionID = object["extension"]?.stringValue else {
                report(.malformedMessage("manifest.changed is missing extension"))
                return
            }
            emit(.manifestChanged(extension: extensionID, manifest: object["manifest"]))
        case "manifest.error":
            guard
                let extensionID = object["extension"]?.stringValue,
                let error = Self.embedderError(object["error"])
            else {
                report(.malformedMessage("manifest.error is missing extension or error"))
                return
            }
            emit(.manifestError(extension: extensionID, error: error))
        default:
            emit(.other(name: name, payload: .object(object)))
        }
    }

    private func receiveCapabilityRequest(_ object: [String: JSONValue]) {
        guard
            let id = object["id"]?.stringValue,
            let session = object["session"]?.stringValue,
            let name = object["name"]?.stringValue
        else {
            report(.malformedMessage("capability.request is missing id, session or name"))
            return
        }
        let request = CapabilityRequest(id: id, session: session, name: name, params: object["params"] ?? .null)
        Task { [weak self] in
            await self?.answer(request)
        }
    }

    private func answer(_ request: CapabilityRequest) async {
        guard let handler = capabilityHandler else {
            sendCapabilityResult(
                id: request.id,
                result: .failure(
                    EmbedderError(
                        code: "unhandled_capability",
                        message: "No capability handler is installed for \(request.name)."
                    )
                )
            )
            return
        }
        do {
            sendCapabilityResult(id: request.id, result: .success(try await handler.handle(request)))
        } catch let error as EmbedderError {
            sendCapabilityResult(id: request.id, result: .failure(error))
        } catch {
            sendCapabilityResult(
                id: request.id,
                result: .failure(
                    EmbedderError(code: "capability_failed", message: String(describing: error))
                )
            )
        }
    }

    private func sendCapabilityResult(id: String, result: Result<JSONValue, EmbedderError>) {
        let message: JSONValue
        switch result {
        case .success(let value):
            message = .object([
                "type": .string("capability.result"),
                "id": .string(id),
                "ok": .bool(true),
                "value": value,
            ])
        case .failure(let error):
            message = .object([
                "type": .string("capability.result"),
                "id": .string(id),
                "ok": .bool(false),
                "error": .object(["code": .string(error.code), "message": .string(error.message)]),
            ])
        }
        guard let encoded = try? Self.encode(message) else { return }
        try? transport.send(encoded)
    }

    // MARK: - Continuations

    private func respond(to id: String, with result: Result<JSONValue, Error>) {
        lock.lock()
        let waiter = pending.removeValue(forKey: id)
        lock.unlock()
        waiter?.resume(with: result)
    }

    private func finishWelcome(with result: Result<Welcome, Error>) {
        lock.lock()
        let waiter = welcomeWaiter
        welcomeWaiter = nil
        if case .success(let welcome) = result { welcomeInfo = welcome }
        lock.unlock()
        waiter?.resume(with: result)
    }

    private func failAll(_ error: Error) {
        lock.lock()
        let waiters = pending.values
        pending.removeAll()
        lock.unlock()
        for waiter in waiters { waiter.resume(throwing: error) }
    }

    private func transportExited(error: Error?) {
        lock.lock()
        closed = true
        lock.unlock()
        let failure = error ?? BlastError.closed
        finishWelcome(with: .failure(failure))
        failAll(failure)
    }

    private func emit(_ event: BlastEvent) {
        lock.lock()
        let handler = eventHandler
        lock.unlock()
        handler?(event)
    }

    private func report(_ error: BlastError) {
        lock.lock()
        let handler = diagnosticHandler
        lock.unlock()
        handler?(error)
    }

    // MARK: - Helpers

    private static func encode(_ value: JSONValue) throws -> Data {
        try JSONEncoder().encode(value)
    }

    private static func embedderError(_ value: JSONValue?) -> EmbedderError? {
        guard let value else { return nil }
        return try? value.decode(EmbedderError.self)
    }
}
