import Foundation
import Testing

@testable import BlastKit

@Suite("NDJSON framing")
struct FramingTests {
    @Test("several lines in one chunk keep their order")
    func joinedLines() {
        var framer = NDJSONFramer()
        let events = framer.append(Data("{\"a\":1}\n{\"b\":2}\n".utf8))
        #expect(
            events == [
                .line(Data("{\"a\":1}".utf8)),
                .line(Data("{\"b\":2}".utf8)),
            ]
        )
    }

    @Test("a line split across chunks is reassembled")
    func splitLines() {
        var framer = NDJSONFramer()
        #expect(framer.append(Data("{\"a\"".utf8)).isEmpty)
        #expect(framer.append(Data(":1}\n{\"b\":".utf8)) == [.line(Data("{\"a\":1}".utf8))])
        #expect(framer.append(Data("2}".utf8)).isEmpty)
        #expect(framer.finish() == [.line(Data("{\"b\":2}".utf8))])
        #expect(framer.finish().isEmpty)
    }

    @Test("blank lines are ignored and CRLF is accepted")
    func blankAndCRLF() {
        var framer = NDJSONFramer()
        let events = framer.append(Data("\n\r\n{\"a\":1}\r\n".utf8))
        #expect(events == [.line(Data("{\"a\":1}".utf8))])
    }

    @Test("an oversized line is reported once and the stream recovers")
    func oversizeRecovery() {
        var framer = NDJSONFramer(maxLineBytes: 3)
        #expect(framer.append(Data("1234".utf8)) == [.oversizedLine(limit: 3)])
        #expect(framer.append(Data("567\nok\n".utf8)) == [.line(Data("ok".utf8))])
    }

    @Test("an oversized line with a newline in the same chunk still yields later lines")
    func oversizeSameChunk() {
        var framer = NDJSONFramer(maxLineBytes: 3)
        #expect(
            framer.append(Data("1234\nok\n".utf8)) == [
                .oversizedLine(limit: 3),
                .line(Data("ok".utf8)),
            ]
        )
    }

    @Test("an oversized trailing line is dropped at finish")
    func oversizeFinish() {
        var framer = NDJSONFramer(maxLineBytes: 3)
        #expect(framer.append(Data("1234".utf8)) == [.oversizedLine(limit: 3)])
        #expect(framer.finish().isEmpty)
    }

    @Test("the default cap is 8 MiB")
    func defaultCap() {
        #expect(NDJSONFramer.defaultMaxLineBytes == 8 * 1024 * 1024)
        #expect(NDJSONFramer().maxLineBytes == NDJSONFramer.defaultMaxLineBytes)
    }
}
