import Foundation

/// A named or bundled application a request asks to open with. Kept as plain
/// strings: resolving it needs `NSWorkspace`, which only the app adapter does.
public struct ApplicationReference: Equatable, Sendable {
    public let name: String?
    public let path: String?
    public let bundleID: String?

    public init(name: String? = nil, path: String? = nil, bundleID: String? = nil) {
        self.name = name
        self.path = path
        self.bundleID = bundleID
    }

    /// A string is a name, a path when it looks like one. An object may carry
    /// any of the catalog's `path`/`bundleId`/`name` fields; `localizedName`
    /// also names an application.
    public init?(value: JSONValue) {
        switch value {
        case .string(let raw):
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            if trimmed.hasPrefix("/") || trimmed.hasPrefix("~") || trimmed.hasSuffix(".app") {
                self.init(path: trimmed)
            } else {
                self.init(name: trimmed)
            }
        case .object:
            let path = value["path"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
            let bundleID = value["bundleId"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
            let name = (value["name"]?.stringValue ?? value["localizedName"]?.stringValue)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard [path, bundleID, name].contains(where: { $0?.isEmpty == false }) else { return nil }
            self.init(name: name, path: path, bundleID: bundleID)
        default:
            return nil
        }
    }
}

public enum OpenTarget: Equatable, Sendable {
    case url(URL)
    case file(URL)
}

public enum OpenArgumentsError: Error, Equatable, Sendable, CustomStringConvertible {
    case missingTarget
    case invalidURL
    case invalidApplication

    public var description: String {
        switch self {
        case .missingTarget: "a target is required"
        case .invalidURL: "the url is not a valid absolute URL"
        case .invalidApplication: "the application must be a name/path string or an object"
        }
    }
}

/// `open.url`/`open.path` params after validation, without opening anything.
public struct OpenArguments: Equatable, Sendable {
    public let target: OpenTarget
    public let application: ApplicationReference?

    public init(target: OpenTarget, application: ApplicationReference? = nil) {
        self.target = target
        self.application = application
    }

    public static func url(from params: JSONValue) throws -> OpenArguments {
        guard let raw = params["url"]?.stringValue else { throw OpenArgumentsError.missingTarget }
        guard let url = URL(string: raw), let scheme = url.scheme, !scheme.isEmpty else {
            throw OpenArgumentsError.invalidURL
        }
        return OpenArguments(target: .url(url), application: try application(from: params))
    }

    public static func path(from params: JSONValue) throws -> OpenArguments {
        guard let raw = params["path"]?.stringValue, !raw.isEmpty else { throw OpenArgumentsError.missingTarget }
        return OpenArguments(target: .file(URL(fileURLWithPath: raw)), application: try application(from: params))
    }

    private static func application(from params: JSONValue) throws -> ApplicationReference? {
        guard let value = params["application"], value != .null else { return nil }
        guard let reference = ApplicationReference(value: value) else { throw OpenArgumentsError.invalidApplication }
        return reference
    }
}
