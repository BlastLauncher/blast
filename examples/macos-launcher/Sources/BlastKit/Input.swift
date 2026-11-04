import Foundation

/// The semantic inputs an embedder forwards to a viewed session, mirroring
/// `controllerInput` in the embedder schema. Only the fields that belong to a
/// case are encoded, so each input is exactly one schema variant.
public enum ControllerInput: Equatable, Sendable {
    public enum Direction: String, Codable, Sendable {
        case up, down, left, right
    }

    /// One key press; `meta` is Command on macOS, `superKey` the Windows key.
    public struct KeyPress: Codable, Equatable, Sendable {
        public let name: String
        public let ctrl: Bool?
        public let meta: Bool?
        public let shift: Bool?
        public let option: Bool?
        public let superKey: Bool?

        public init(
            name: String,
            ctrl: Bool? = nil,
            meta: Bool? = nil,
            shift: Bool? = nil,
            option: Bool? = nil,
            superKey: Bool? = nil
        ) {
            self.name = name
            self.ctrl = ctrl
            self.meta = meta
            self.shift = shift
            self.option = option
            self.superKey = superKey
        }

        private enum CodingKeys: String, CodingKey {
            case name, ctrl, meta, shift, option
            case superKey = "super"
        }
    }

    case search(String)
    case actionsQuery(String)
    case dropdownQuery(String)
    case move(Direction)
    case select(String)
    case focus(String)
    case toggle(String)
    case setValue(id: String, value: String)
    case optionMove(Double)
    case key(KeyPress)
    case toastAction(index: Int)
    case alert(confirm: Bool, remember: Bool?)
    case primary
    case openActions
    case closeActions
    case back
    case openDropdown
    case chooseDropdown
    case focusNext
    case focusPrev
    case optionChoose
    case submit
}

public extension ControllerInput {
    /// The wire object, before it is nested under `session.input`'s `input`.
    func toJSON() throws -> JSONValue {
        switch self {
        case .search(let text):
            return .object(["type": .string("search"), "text": .string(text)])
        case .actionsQuery(let text):
            return .object(["type": .string("actionsQuery"), "text": .string(text)])
        case .dropdownQuery(let text):
            return .object(["type": .string("dropdownQuery"), "text": .string(text)])
        case .move(let direction):
            return .object(["type": .string("move"), "direction": .string(direction.rawValue)])
        case .select(let id):
            return .object(["type": .string("select"), "id": .string(id)])
        case .focus(let id):
            return .object(["type": .string("focus"), "id": .string(id)])
        case .toggle(let id):
            return .object(["type": .string("toggle"), "id": .string(id)])
        case .setValue(let id, let value):
            return .object(["type": .string("setValue"), "id": .string(id), "value": .string(value)])
        case .optionMove(let delta):
            return .object(["type": .string("optionMove"), "delta": .number(delta)])
        case .key(let press):
            return .object(["type": .string("key"), "key": try press.jsonValue()])
        case .toastAction(let index):
            return .object(["type": .string("toastAction"), "index": .number(Double(index))])
        case .alert(let confirm, let remember):
            var object: [String: JSONValue] = ["type": .string("alert"), "confirm": .bool(confirm)]
            if let remember { object["remember"] = .bool(remember) }
            return .object(object)
        case .primary:
            return .object(["type": .string("primary")])
        case .openActions:
            return .object(["type": .string("openActions")])
        case .closeActions:
            return .object(["type": .string("closeActions")])
        case .back:
            return .object(["type": .string("back")])
        case .openDropdown:
            return .object(["type": .string("openDropdown")])
        case .chooseDropdown:
            return .object(["type": .string("chooseDropdown")])
        case .focusNext:
            return .object(["type": .string("focusNext")])
        case .focusPrev:
            return .object(["type": .string("focusPrev")])
        case .optionChoose:
            return .object(["type": .string("optionChoose")])
        case .submit:
            return .object(["type": .string("submit")])
        }
    }

    init(json: JSONValue) throws {
        guard let object = json.objectValue, let type = object["type"]?.stringValue else {
            throw Self.malformed("controller input must be an object with a string type")
        }
        func string(_ key: String) throws -> String {
            guard let value = object[key]?.stringValue else {
                throw Self.malformed("\(type) input is missing string \(key)")
            }
            return value
        }
        switch type {
        case "search": self = .search(try string("text"))
        case "actionsQuery": self = .actionsQuery(try string("text"))
        case "dropdownQuery": self = .dropdownQuery(try string("text"))
        case "move":
            guard let direction = Direction(rawValue: try string("direction")) else {
                throw Self.malformed("move input has an unknown direction")
            }
            self = .move(direction)
        case "select": self = .select(try string("id"))
        case "focus": self = .focus(try string("id"))
        case "toggle": self = .toggle(try string("id"))
        case "setValue": self = .setValue(id: try string("id"), value: try string("value"))
        case "optionMove":
            guard let delta = object["delta"]?.doubleValue else {
                throw Self.malformed("optionMove input is missing number delta")
            }
            self = .optionMove(delta)
        case "key":
            guard let press = object["key"] else {
                throw Self.malformed("key input is missing key")
            }
            self = .key(try press.decode(KeyPress.self))
        case "toastAction":
            guard let index = object["index"]?.intValue else {
                throw Self.malformed("toastAction input is missing integer index")
            }
            self = .toastAction(index: index)
        case "alert":
            guard let confirm = object["confirm"]?.boolValue else {
                throw Self.malformed("alert input is missing boolean confirm")
            }
            self = .alert(confirm: confirm, remember: object["remember"]?.boolValue)
        case "primary": self = .primary
        case "openActions": self = .openActions
        case "closeActions": self = .closeActions
        case "back": self = .back
        case "openDropdown": self = .openDropdown
        case "chooseDropdown": self = .chooseDropdown
        case "focusNext": self = .focusNext
        case "focusPrev": self = .focusPrev
        case "optionChoose": self = .optionChoose
        case "submit": self = .submit
        default: throw Self.malformed("unknown controller input type \(type)")
        }
    }

    private static func malformed(_ message: String) -> DecodingError {
        DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: message))
    }
}

extension ControllerInput: Codable {
    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(JSONValue.self)
        try self.init(json: value)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(try toJSON())
    }
}

private extension Encodable {
    func jsonValue() throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(self))
    }
}
