import Foundation

/// A protocol-level error sent by `blast serve` (`embedderError` in the schema).
public struct EmbedderError: Codable, Equatable, Sendable, Error {
    public let code: String
    public let message: String
    public let data: JSONValue?

    public init(code: String, message: String, data: JSONValue? = nil) {
        self.code = code
        self.message = message
        self.data = data
    }
}

/// `missing_values` data: the preferences and arguments a launch still needs.
public struct MissingValues: Codable, Equatable, Sendable {
    public struct Preference: Codable, Equatable, Sendable {
        public let name: String
        public let type: String?
        public let title: String?
    }

    public let preferences: [Preference]
    public let arguments: [String]
}

/// `missing_dependencies` data: what a launch needs installed before it can run.
public struct MissingDependencies: Codable, Equatable, Sendable {
    public let unresolved: [String]
    public let installable: Bool
    public let pinned: Bool
}

public extension EmbedderError {
    var missingValues: MissingValues? {
        guard code == "missing_values", let data else { return nil }
        return try? data.decode(MissingValues.self)
    }

    var missingDependencies: MissingDependencies? {
        guard code == "missing_dependencies", let data else { return nil }
        return try? data.decode(MissingDependencies.self)
    }
}

/// Everything BlastKit itself can fail with.
public enum BlastError: Error, Equatable, Sendable {
    /// The transport could not start, write, or stay alive.
    case transport(String)
    /// A line was not a protocol message; the client reports it and keeps reading.
    case malformedMessage(String)
    /// A line exceeded the 8 MiB cap; the rest of that line is discarded.
    case lineTooLarge(limit: Int)
    /// The engine speaks another protocol version; the handshake cannot continue.
    case versionMismatch(expected: Int, received: Int)
    /// The engine answered with a protocol error.
    case remote(EmbedderError)
    /// The client or transport was closed before the operation finished.
    case closed
}

public extension BlastError {
    var remoteError: EmbedderError? {
        guard case .remote(let error) = self else { return nil }
        return error
    }
}
