import Foundation
import Testing

@testable import BlastKit

@Suite("ControllerInput encoding")
struct InputTests {
    /// Every schema variant with the exact object an embedder must send.
    static let cases: [(input: ControllerInput, json: JSONValue)] = [
        (.search("apple"), .object(["type": .string("search"), "text": .string("apple")])),
        (.actionsQuery("copy"), .object(["type": .string("actionsQuery"), "text": .string("copy")])),
        (.dropdownQuery("win"), .object(["type": .string("dropdownQuery"), "text": .string("win")])),
        (.move(.down), .object(["type": .string("move"), "direction": .string("down")])),
        (.move(.up), .object(["type": .string("move"), "direction": .string("up")])),
        (.move(.left), .object(["type": .string("move"), "direction": .string("left")])),
        (.move(.right), .object(["type": .string("move"), "direction": .string("right")])),
        (.select("4"), .object(["type": .string("select"), "id": .string("4")])),
        (.focus("1"), .object(["type": .string("focus"), "id": .string("1")])),
        (.toggle("2"), .object(["type": .string("toggle"), "id": .string("2")])),
        (
            .setValue(id: "1", value: "name"),
            .object(["type": .string("setValue"), "id": .string("1"), "value": .string("name")])
        ),
        (.optionMove(1.5), .object(["type": .string("optionMove"), "delta": .number(1.5)])),
        (
            .key(ControllerInput.KeyPress(name: "return", meta: true)),
            .object([
                "type": .string("key"),
                "key": .object(["name": .string("return"), "meta": .bool(true)]),
            ])
        ),
        (
            .key(ControllerInput.KeyPress(name: "k", ctrl: true, superKey: false)),
            .object([
                "type": .string("key"),
                "key": .object([
                    "name": .string("k"), "ctrl": .bool(true), "super": .bool(false),
                ]),
            ])
        ),
        (.toastAction(index: 2), .object(["type": .string("toastAction"), "index": .number(2)])),
        (
            .alert(confirm: true, remember: false),
            .object([
                "type": .string("alert"), "confirm": .bool(true), "remember": .bool(false),
            ])
        ),
        (
            .alert(confirm: false, remember: nil),
            .object(["type": .string("alert"), "confirm": .bool(false)])
        ),
        (.primary, .object(["type": .string("primary")])),
        (.openActions, .object(["type": .string("openActions")])),
        (.closeActions, .object(["type": .string("closeActions")])),
        (.back, .object(["type": .string("back")])),
        (.openDropdown, .object(["type": .string("openDropdown")])),
        (.chooseDropdown, .object(["type": .string("chooseDropdown")])),
        (.focusNext, .object(["type": .string("focusNext")])),
        (.focusPrev, .object(["type": .string("focusPrev")])),
        (.optionChoose, .object(["type": .string("optionChoose")])),
        (.submit, .object(["type": .string("submit")])),
    ]

    @Test("each input encodes exactly one schema variant")
    func exactEncoding() throws {
        for (input, expected) in Self.cases {
            #expect(try input.toJSON() == expected)
        }
    }

    @Test("every input round trips through JSON")
    func roundTrip() throws {
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        for (input, expected) in Self.cases {
            #expect(try decoder.decode(ControllerInput.self, from: encoder.encode(input)) == input)
            #expect(try decoder.decode(ControllerInput.self, from: encoder.encode(expected)) == input)
        }
    }

    @Test("an unknown input type fails to decode")
    func unknownType() {
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(ControllerInput.self, from: Data("{\"type\":\"teleport\"}".utf8))
        }
    }

    @Test("an input without a type fails to decode")
    func missingType() {
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(ControllerInput.self, from: Data("{\"text\":\"a\"}".utf8))
        }
    }

    @Test("session.input nests the encoded input")
    func sessionInput() async throws {
        let transport = FakeTransport()
        let client = BlastClient(transport: transport)
        _ = try await connect(client, over: transport)
        let input = Task { try await client.sendInput(.move(.down), session: "7") }
        let request = try await eventually("the session.input request") { transport.requests.first }
        #expect(request["id"]?.stringValue == "1")
        #expect(request["method"] == .string("session.input"))
        #expect(
            request["params"] == .object([
                "session": .string("7"),
                "input": .object(["type": .string("move"), "direction": .string("down")]),
            ])
        )
        transport.emit(response(id: "1", result: .null))
        try await input.value
    }
}
