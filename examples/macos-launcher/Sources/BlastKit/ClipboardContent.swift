import Foundation

/// The content of a `clipboard.copy`/`clipboard.paste` request, parsed without
/// touching a pasteboard so the mapping is testable offscreen.
public struct ClipboardContent: Equatable, Sendable {
    public let text: String?
    public let html: String?
    public let file: String?
    public let concealed: Bool

    public init(text: String? = nil, html: String? = nil, file: String? = nil, concealed: Bool = false) {
        self.text = text
        self.html = html
        self.file = file
        self.concealed = concealed
    }

    /// Missing values stay nil; an explicit empty string is still content.
    public init(params: JSONValue) {
        text = params["text"]?.stringValue
        html = params["html"]?.stringValue
        file = params["file"]?.stringValue
        concealed = params["concealed"]?.boolValue == true
    }

    public var isEmpty: Bool {
        text == nil && html == nil && file == nil
    }
}

/// The content and window policy for a clipboard paste request. Parsing this
/// separately keeps the AppKit adapter's side effects out of the decision.
public struct ClipboardPastePlan: Equatable, Sendable {
    public let content: ClipboardContent
    public let closeMainWindow: Bool

    public init(content: ClipboardContent, closeMainWindow: Bool = true) {
        self.content = content
        self.closeMainWindow = closeMainWindow
    }

    public init(params: JSONValue) {
        content = ClipboardContent(params: params)
        // Only an explicit false opts out. This preserves Raycast's default
        // when older or malformed callers omit the flag.
        closeMainWindow = params["closeMainWindow"]?.boolValue != false
    }
}

/// One pasteboard representation. Order is the order the adapter writes them.
public struct ClipboardItem: Equatable, Sendable {
    public enum Kind: String, Equatable, Sendable {
        case text
        case html
        case file
    }

    public let kind: Kind
    public let value: String

    public init(kind: Kind, value: String) {
        self.kind = kind
        self.value = value
    }
}

public extension ClipboardContent {
    /// Text and HTML keep their bytes; a file becomes the URL pasteboard type's
    /// absolute string, which is what macOS expects for a dragged or pasted item.
    var items: [ClipboardItem] {
        var items: [ClipboardItem] = []
        if let text { items.append(ClipboardItem(kind: .text, value: text)) }
        if let html { items.append(ClipboardItem(kind: .html, value: html)) }
        if let file { items.append(ClipboardItem(kind: .file, value: URL(fileURLWithPath: file).absoluteString)) }
        return items
    }
}
