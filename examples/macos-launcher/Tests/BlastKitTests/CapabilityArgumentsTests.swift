import Foundation
import Testing
@testable import BlastKit

@Suite("Capability arguments")
struct CapabilityArgumentsTests {
    // MARK: - Clipboard

    @Test("clipboard content maps text, html and file to pasteboard items")
    func clipboardItems() {
        let content = ClipboardContent(
            text: "hello",
            html: "<b>hello</b>",
            file: "/tmp/hello.txt",
            concealed: true
        )
        #expect(!content.isEmpty)
        #expect(content.items == [
            ClipboardItem(kind: .text, value: "hello"),
            ClipboardItem(kind: .html, value: "<b>hello</b>"),
            ClipboardItem(kind: .file, value: "file:///tmp/hello.txt"),
        ])
        #expect(content.concealed)
    }

    @Test("clipboard content keeps absent fields nil and detects emptiness")
    func clipboardEmpty() {
        #expect(ClipboardContent(params: .object([:])).isEmpty)
        #expect(ClipboardContent(params: .object(["text": .string("")])).isEmpty == false)
        #expect(ClipboardContent(params: .object(["text": .string("a")])).items == [
            ClipboardItem(kind: .text, value: "a"),
        ])
        #expect(ClipboardContent(params: .object(["concealed": .bool(true)])).concealed)
    }

    @Test("clipboard paste defaults to closing and accepts an explicit keep-visible flag")
    func clipboardPastePlan() {
        #expect(ClipboardPastePlan(params: .object([:])).closeMainWindow)
        #expect(ClipboardPastePlan(params: .object(["closeMainWindow": .bool(true)])).closeMainWindow)
        #expect(!ClipboardPastePlan(params: .object(["closeMainWindow": .bool(false)])).closeMainWindow)
        // A non-boolean value follows the safe default rather than opting out.
        #expect(ClipboardPastePlan(params: .object(["closeMainWindow": .string("false")])).closeMainWindow)
    }

    // MARK: - Open

    @Test("open.url parses an HTTP url without an application")
    func openURL() throws {
        let arguments = try OpenArguments.url(from: .object(["url": .string("https://example.com/a")]))
        #expect(arguments.target == .url(URL(string: "https://example.com/a")!))
        #expect(arguments.application == nil)
    }

    @Test("open.url rejects a missing target and a schemeless url")
    func openURLInvalid() {
        #expect(throws: OpenArgumentsError.missingTarget) {
            try OpenArguments.url(from: .object([:]))
        }
        #expect(throws: OpenArgumentsError.invalidURL) {
            try OpenArguments.url(from: .object(["url": .string("example.com")]))
        }
    }

    @Test("open.path parses the path and rejects an empty one")
    func openPath() throws {
        let arguments = try OpenArguments.path(from: .object(["path": .string("/tmp/report.pdf")]))
        #expect(arguments.target == .file(URL(fileURLWithPath: "/tmp/report.pdf")))
        #expect(throws: OpenArgumentsError.missingTarget) {
            try OpenArguments.path(from: .object(["path": .string("")]))
        }
    }

    @Test("an application string is a name unless it looks like a path")
    func applicationString() throws {
        let named = try OpenArguments.url(from: .object([
            "url": .string("https://example.com"),
            "application": .string("Safari"),
        ]))
        #expect(named.application == ApplicationReference(name: "Safari"))

        let path = try OpenArguments.path(from: .object([
            "path": .string("/tmp/a.txt"),
            "application": .string("/Applications/TextEdit.app"),
        ]))
        #expect(path.application == ApplicationReference(path: "/Applications/TextEdit.app"))
    }

    @Test("an application object keeps its path, bundle id and name")
    func applicationObject() throws {
        let arguments = try OpenArguments.url(from: .object([
            "url": .string("https://example.com"),
            "application": .object([
                "name": .string("Safari"),
                "path": .string("/Applications/Safari.app"),
                "bundleId": .string("com.apple.Safari"),
            ]),
        ]))
        #expect(arguments.application == ApplicationReference(
            name: "Safari",
            path: "/Applications/Safari.app",
            bundleID: "com.apple.Safari"
        ))

        let localized = try OpenArguments.url(from: .object([
            "url": .string("https://example.com"),
            "application": .object(["localizedName": .string("Finder")]),
        ]))
        #expect(localized.application == ApplicationReference(name: "Finder"))
    }

    @Test("an unusable application value is rejected")
    func applicationInvalid() throws {
        for value in [JSONValue.number(1), .object([:]), .string("  ")] {
            #expect(throws: OpenArgumentsError.invalidApplication) {
                try OpenArguments.url(from: .object([
                    "url": .string("https://example.com"),
                    "application": value,
                ]))
            }
        }
        // An explicit null means "the default application", not an error.
        #expect(try OpenArguments.url(from: .object([
            "url": .string("https://example.com"),
            "application": .null,
        ])).application == nil)
    }
}
