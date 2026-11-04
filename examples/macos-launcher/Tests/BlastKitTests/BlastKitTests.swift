import Foundation
import Testing
@testable import BlastKit

final class FakeTransport: BlastTransport {
    var sent: [Data] = []; var line: ((Data) -> Void)?; var exit: ((Error?) -> Void)?
    func start(onLine: @escaping (Data) -> Void, onExit: @escaping (Error?) -> Void) throws { line = onLine; exit = onExit }
    func send(_ data: Data) throws { sent.append(data) }
    func close() {}
    func emit(_ object: [String: JSONValue]) { line?(try! JSONEncoder().encode(JSONValue.object(object))) }
}

@Test("NDJSON handles split and joined lines")
func framing() throws {
    let decoder = NDJSONDecoder(); let lines = try decoder.append(Data("{\"a\":1}\n{\"b\":2}\n".utf8))
    #expect(lines.count == 2); #expect(try decoder.append(Data("{\"c\"".utf8)).isEmpty)
    #expect(try decoder.append(Data(":3}\n".utf8)).count == 1)
}

@Test("NDJSON rejects oversize lines")
func oversize() {
    #expect(throws: BlastError.lineTooLarge) { _ = try NDJSONDecoder(maxLineBytes: 3).append(Data("1234".utf8)) }
}

@Test("ControllerInput round trips semantic actions")
func inputCoding() throws {
    let inputs: [ControllerInput] = [.search("a"), .move("down"), .primary, .setValue(id: "x", value: "y"), .alert(confirm: true, remember: false)]
    let decoder = JSONDecoder(); let encoder = JSONEncoder()
    for input in inputs { #expect(try decoder.decode(ControllerInput.self, from: encoder.encode(input)) == input) }
}

@Test("client correlates responses and dispatches events")
func clientCorrelation() async throws {
    let transport = FakeTransport(); let client = BlastClient(transport: transport)
    let start = Task { try await client.start() }
    while transport.sent.isEmpty { await Task.yield() }
    transport.emit(["type": .string("welcome"), "protocol": .number(1), "engine": .object(["version": .string("test")]), "catalog": .object([:])])
    try await start.value
    let request = Task { try await client.request(method: "extension.open", params: ["dir": .string("fixture")]) }
    while transport.sent.count < 2 { await Task.yield() }
    let sent = try JSONDecoder().decode(JSONValue.self, from: transport.sent[1]); guard case .object(let requestObject) = sent, case .string(let id) = requestObject["id"] else { Issue.record("missing id"); return }
    transport.emit(["type": .string("response"), "id": .string(id), "ok": .bool(true), "result": .object(["extension": .string("e")])])
    #expect(try await request.value == .object(["extension": .string("e")]))
}

@Test("version mismatch fails handshake")
func versionMismatch() async {
    let transport = FakeTransport(); let client = BlastClient(transport: transport)
    let start = Task { try await client.start() }
    while transport.sent.isEmpty { await Task.yield() }
    transport.emit(["type": .string("welcome"), "protocol": .number(2), "engine": .object([:]), "catalog": .object([:])])
    do { _ = try await start.value; Issue.record("expected mismatch") } catch { #expect(error as? BlastError == .versionMismatch(2)) }
}

final class ClipboardHandler: CapabilityHandler {
    func handle(name: String, session: String, params: JSONValue) async throws -> JSONValue { #expect(name == "clipboard.copy"); return .null }
}

@Test("capability requests use injectable handler")
func capability() async throws {
    let transport = FakeTransport(); let client = BlastClient(transport: transport, capabilityHandler: ClipboardHandler())
    let start = Task { try await client.start() }; while transport.sent.isEmpty { await Task.yield() }
    transport.emit(["type": .string("welcome"), "protocol": .number(1), "engine": .object([:]), "catalog": .object([:])]); try await start.value
    transport.emit(["type": .string("capability.request"), "id": .string("cap"), "session": .string("s"), "name": .string("clipboard.copy"), "params": .object(["text": .string("safe")])])
    while transport.sent.count < 2 { await Task.yield() }
    let result = try JSONDecoder().decode(JSONValue.self, from: transport.sent.last!)
    guard case .object(let object) = result else { Issue.record("not object"); return }
    #expect(object["type"] == .string("capability.result")); #expect(object["ok"] == .bool(true))
}

@Test("contract fixtures decode")
func contractFixtures() throws {
    let bundle = Bundle.module
    let names = ["list", "grid", "detail", "form", "menu-bar", "toast", "action-panel"]
    for name in names {
        let url = try #require(bundle.url(forResource: name, withExtension: "json"))
        let view = try JSONDecoder().decode(ControllerView.self, from: Data(contentsOf: url))
        #expect(view.kind == "list" || !view.kind.isEmpty)
    }
}
