import Foundation

/// One capability forwarded by the engine: answer it with a value or an error.
public struct CapabilityRequest: Equatable, Sendable {
    public let id: String
    public let session: String
    public let name: String
    public let params: JSONValue

    public init(id: String, session: String, name: String, params: JSONValue) {
        self.id = id
        self.session = session
        self.name = name
        self.params = params
    }
}

/// The embedder side of granted capabilities (clipboard, open, …).
///
/// `BlastClient` calls `handle` off the read loop and sends the returned value
/// as `capability.result`; a thrown `EmbedderError` is forwarded as the
/// `ok: false` error, and an uninstalled handler answers `ok: false` with
/// `unhandled_capability`.
public protocol CapabilityHandler: Sendable {
    func handle(_ request: CapabilityRequest) async throws -> JSONValue
}

/// Routes named capabilities to injected handlers. This keeps capability
/// selection testable while platform code supplies the handlers themselves.
public final class CapabilityRouter: CapabilityHandler, @unchecked Sendable {
    public typealias Handler = @Sendable (CapabilityRequest) async throws -> JSONValue
    private let handlers: [String: Handler]

    public init(handlers: [String: Handler]) { self.handlers = handlers }

    public func handle(_ request: CapabilityRequest) async throws -> JSONValue {
        guard let handler = handlers[request.name] else {
            throw EmbedderError(code: "unhandled_capability", message: "No handler for (request.name).")
        }
        return try await handler(request)
    }
}
