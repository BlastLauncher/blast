import Foundation

/// The stdio-shaped byte channel `BlastClient` speaks over.
///
/// Messages are one JSON object per line in both directions. `onLine` delivers
/// a line without its newline, `onError` reports recoverable framing problems,
/// and `onExit` fires once when the channel is gone.
public protocol BlastTransport: AnyObject, Sendable {
    func start(
        onLine: @escaping @Sendable (Data) -> Void,
        onError: @escaping @Sendable (BlastError) -> Void,
        onExit: @escaping @Sendable (Error?) -> Void
    ) throws

    func send(_ data: Data) throws
    func close()
}
