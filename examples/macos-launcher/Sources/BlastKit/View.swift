import Foundation

/// The view kinds `client-core` renders. Unknown kinds stay decodable so a newer
/// engine does not break an older launcher.
public enum ViewKind: Equatable, Sendable {
    case list, grid, detail, form, menuBar, empty
    case unknown(String)

    public var rawValue: String {
        switch self {
        case .list: "list"
        case .grid: "grid"
        case .detail: "detail"
        case .form: "form"
        case .menuBar: "menu-bar"
        case .empty: "empty"
        case .unknown(let value): value
        }
    }

    public init(rawValue: String) {
        switch rawValue {
        case "list": self = .list
        case "grid": self = .grid
        case "detail": self = .detail
        case "form": self = .form
        case "menu-bar": self = .menuBar
        case "empty": self = .empty
        default: self = .unknown(rawValue)
        }
    }
}

extension ViewKind: Codable {
    public init(from decoder: Decoder) throws {
        self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

/// The server-owned view model from `packages/client-core/src/controller.ts`.
/// Fields are wire-shaped: the launcher draws this and sends semantic inputs,
/// never scene nodes.
public struct ControllerView: Codable, Equatable, Sendable {
    public struct Navigation: Codable, Equatable, Sendable {
        public let canGoBack: Bool
    }

    public struct Search: Codable, Equatable, Sendable {
        public let text: String
        public let placeholder: String
    }

    public struct Row: Codable, Equatable, Sendable {
        public let id: String
        public let kind: String
        public let title: String
        public let subtitle: String
        public let accessories: String
        public let icon: Bool
        public let count: Int?
        public let selected: Bool
        public let iconLabel: String
        public let iconTint: String?
        public let text: String
    }

    public struct GridCell: Codable, Equatable, Sendable {
        public let id: String
        public let title: String
        public let subtitle: String
        public let content: String
        public let selected: Bool
    }

    public struct GridRow: Codable, Equatable, Sendable {
        public let id: String?
        public let header: String
        public let cells: [GridCell]
    }

    public struct ActionRow: Codable, Equatable, Sendable {
        public let id: String
        public let kind: String
        public let title: String
        public let shortcut: String
        public let selected: Bool
    }

    public struct Actions: Codable, Equatable, Sendable {
        public let open: Bool
        public let title: String
        public let query: String
        public let breadcrumb: [String]
        public let rows: [ActionRow]
        public let selectedIndex: Int
    }

    public struct DropdownOption: Codable, Equatable, Sendable {
        public let value: String
        public let title: String
        public let section: String
        public let current: Bool
        public let selected: Bool
    }

    public struct Dropdown: Codable, Equatable, Sendable {
        public let label: String
        public let tooltip: String
        public let open: Bool
        public let query: String
        public let options: [DropdownOption]
        public let selectedIndex: Int
    }

    public struct Toast: Codable, Equatable, Sendable {
        public struct Row: Codable, Equatable, Sendable {
            public let title: String
            public let shortcut: String
        }

        public let style: String
        public let title: String
        public let message: String
        public let actions: [Row]
    }

    public struct HUD: Codable, Equatable, Sendable {
        public let title: String
    }

    public struct Alert: Codable, Equatable, Sendable {
        public struct Button: Codable, Equatable, Sendable {
            public let title: String
            public let style: String
        }

        public let title: String
        public let message: String
        public let rememberUserChoice: Bool
        public let remember: Bool
        public let primary: Button?
        public let dismiss: Button?
    }

    public struct Feedback: Codable, Equatable, Sendable {
        public let toast: Toast?
        public let hud: HUD?
        public let alert: Alert?
    }

    public struct MenuBar: Codable, Equatable, Sendable {
        public struct Row: Codable, Equatable, Sendable {
            public let id: String
            public let kind: String
            public let title: String
            public let subtitle: String
            public let shortcut: String
            public let disabled: Bool
            public let selected: Bool
        }

        public let title: String
        public let tooltip: String
        public let loading: Bool
        public let path: [String]
        public let rows: [Row]
        public let selectedId: String?
    }

    public struct Form: Codable, Equatable, Sendable {
        public enum Item: Codable, Equatable, Sendable {
            case field(id: String)
            case separator(id: String)
            case description(id: String, title: String, text: String)

            private enum CodingKeys: String, CodingKey { case kind, id, title, text }

            public init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                let kind = try container.decode(String.self, forKey: .kind)
                let id = try container.decode(String.self, forKey: .id)
                switch kind {
                case "field": self = .field(id: id)
                case "separator": self = .separator(id: id)
                case "description":
                    self = .description(
                        id: id,
                        title: try container.decode(String.self, forKey: .title),
                        text: try container.decode(String.self, forKey: .text)
                    )
                default:
                    throw DecodingError.dataCorruptedError(
                        forKey: .kind,
                        in: container,
                        debugDescription: "Unknown form item kind: \(kind)"
                    )
                }
            }

            public func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                switch self {
                case .field(let id):
                    try container.encode("field", forKey: .kind)
                    try container.encode(id, forKey: .id)
                case .separator(let id):
                    try container.encode("separator", forKey: .kind)
                    try container.encode(id, forKey: .id)
                case .description(let id, let title, let text):
                    try container.encode("description", forKey: .kind)
                    try container.encode(id, forKey: .id)
                    try container.encode(title, forKey: .title)
                    try container.encode(text, forKey: .text)
                }
            }
        }

        public struct Field: Codable, Equatable, Sendable {
            public struct Option: Codable, Equatable, Sendable {
                public let value: String
                public let title: String
            }

            public let id: String
            public let type: String
            public let title: String
            public let info: String
            public let label: String
            public let placeholder: String
            public let error: String
            public let value: JSONValue
            public let text: String
            public let checked: Bool
            public let hasValue: Bool
            public let selected: [Option]
            public let options: [Option]
            public let optionIndex: Int
            public let query: String
            public let focused: Bool
        }

        public let items: [Item]
        public let fields: [Field]
        public let focusId: String?
    }

    public struct Empty: Codable, Equatable, Sendable {
        public let title: String
        public let description: String
        public let iconLabel: String
        public let iconTint: String?
    }

    public struct Primary: Codable, Equatable, Sendable {
        public let title: String
        public let shortcut: String
        public let enabled: Bool
    }

    public struct Requests: Codable, Equatable, Sendable {
        public let quit: Bool
        public let clearSearch: Bool
    }

    public let kind: ViewKind
    public let title: String
    public let navigation: Navigation
    public let loading: Bool
    public let search: Search
    public let rows: [Row]
    public let grid: [GridRow]?
    public let selectedId: String?
    public let emptyText: String
    public let empty: Empty?
    public let detail: String
    public let primary: Primary
    public let actions: Actions
    public let dropdown: Dropdown?
    public let feedback: Feedback
    public let menuBar: MenuBar?
    public let form: Form?
    public let requests: Requests
}

public extension ControllerView {
    var selectedRow: Row? {
        rows.first(where: \.selected)
    }

    var selectedGridCell: GridCell? {
        grid?.lazy.flatMap(\.cells).first(where: \.selected)
    }

    var focusedField: Form.Field? {
        guard let form else { return nil }
        return form.fields.first(where: { $0.id == form.focusId })
    }
}
