import Foundation
import Testing

@testable import BlastKit

@Suite("ViewPatch")
struct ViewPatchTests {
    @Test("applies every shared fixture case and matches next")
    func sharedFixtures() throws {
        let fixtureURL = repositoryRoot.appendingPathComponent("fixtures/protocol/view-patches.json")
        let data = try Data(contentsOf: fixtureURL)
        let root = try JSONDecoder().decode(JSONValue.self, from: data)
        let cases = try #require(root["cases"]?.arrayValue)
        #expect(!cases.isEmpty)

        for entry in cases {
            let name = try #require(entry["name"]?.stringValue)
            let prev = try #require(entry["prev"])
            let patchJSON = try #require(entry["patch"])
            let next = try #require(entry["next"])
            let patch = try ViewPatch(json: patchJSON)
            let applied = try patch.apply(to: prev, currentRevision: patch.baseRevision)
            #expect(applied == next, "fixture case \(name) did not match next")
        }
    }

    @Test("rejects missing paths, invalid parents, out-of-bounds splices and revision mismatches")
    func errorCases() throws {
        let view: JSONValue = .object([
            "title": .string("a"),
            "empty": .null,
            "search": .object(["text": .string("")]),
            "rows": .array([.object(["id": .string("1")])]),
        ])

        #expect(throws: ViewPatchError.pathDoesNotExist(["missing", "child"])) {
            try ViewPatch(ops: [.set(path: ["missing", "child"], value: .number(1))]).apply(to: view)
        }
        #expect(throws: ViewPatchError.pathDoesNotExist(["empty", "title"])) {
            try ViewPatch(ops: [.set(path: ["empty", "title"], value: .string("x"))]).apply(to: view)
        }
        #expect(throws: ViewPatchError.pathDoesNotExist(["rows", "0"])) {
            try ViewPatch(ops: [.set(path: ["rows", "0"], value: .string("x"))]).apply(to: view)
        }
        #expect(throws: ViewPatchError.pathDoesNotExist(["nonexistent"])) {
            try ViewPatch(ops: [.delete(path: ["nonexistent"])]).apply(to: view)
        }
        #expect(throws: ViewPatchError.cannotDeleteRoot) {
            try ViewPatch(ops: [.delete(path: [])]).apply(to: view)
        }
        #expect(throws: ViewPatchError.pathDoesNotExist(["missing"])) {
            try ViewPatch(ops: [.splice(path: ["missing"], at: 0, remove: 0, insert: [])]).apply(to: view)
        }
        #expect(throws: ViewPatchError.spliceTargetNotArray(["title"])) {
            try ViewPatch(ops: [.splice(path: ["title"], at: 0, remove: 0, insert: [])]).apply(to: view)
        }
        #expect(throws: ViewPatchError.spliceOutOfBounds(at: 2, remove: 0, count: 1)) {
            try ViewPatch(ops: [.splice(path: ["rows"], at: 2, remove: 0, insert: [])]).apply(to: view)
        }
        #expect(throws: ViewPatchError.spliceOutOfBounds(at: 0, remove: 2, count: 1)) {
            try ViewPatch(ops: [.splice(path: ["rows"], at: 0, remove: 2, insert: [])]).apply(to: view)
        }
        #expect(throws: ViewPatchError.spliceOutOfBounds(at: 1, remove: Int.max, count: 1)) {
            try ViewPatch(ops: [.splice(path: ["rows"], at: 1, remove: Int.max, insert: [])]).apply(to: view)
        }
        #expect(throws: ViewPatchError.baseRevisionMismatch(expected: 1, received: 2)) {
            try ViewPatch(revision: 3, baseRevision: 2, ops: []).apply(to: view, currentRevision: 1)
        }
        #expect(throws: ViewPatchError.revisionMismatch(expected: 2, received: 4)) {
            try ViewPatch(revision: 4, baseRevision: 1, ops: []).apply(to: view, currentRevision: 1)
        }
    }
}
