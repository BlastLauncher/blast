import Foundation

/// Splits a byte stream into newline-delimited JSON lines.
///
/// Chunks are arbitrary: zero, one, or many lines may arrive at once. An
/// oversized line is dropped whole and reported once; the framer then discards
/// bytes through the next newline so the stream recovers, matching `serve`.
public struct NDJSONFramer: Sendable {
    public static let defaultMaxLineBytes = 8 << 20

    public enum Event: Equatable, Sendable {
        case line(Data)
        case oversizedLine(limit: Int)
    }

    public let maxLineBytes: Int
    private var buffer: [UInt8] = []
    private var discarding = false

    public init(maxLineBytes: Int = NDJSONFramer.defaultMaxLineBytes) {
        self.maxLineBytes = maxLineBytes
    }

    public mutating func append(_ chunk: Data) -> [Event] {
        var events: [Event] = []
        buffer.reserveCapacity(buffer.count + chunk.count)
        for byte in chunk {
            if discarding {
                if byte == 0x0A { discarding = false }
                continue
            }
            if byte == 0x0A {
                if let line = takeLine() { events.append(.line(line)) }
                continue
            }
            buffer.append(byte)
            if buffer.count > maxLineBytes {
                buffer.removeAll(keepingCapacity: false)
                discarding = true
                events.append(.oversizedLine(limit: maxLineBytes))
            }
        }
        return events
    }

    /// Flushes an unterminated trailing line, if any.
    public mutating func finish() -> [Event] {
        guard !discarding else {
            buffer.removeAll()
            return []
        }
        guard !buffer.isEmpty else { return [] }
        if let line = takeLine() { return [.line(line)] }
        return []
    }

    private mutating func takeLine() -> Data? {
        var line = Data(buffer)
        buffer.removeAll(keepingCapacity: true)
        if line.last == 0x0D { line.removeLast() }
        return line.isEmpty ? nil : line
    }
}
