import Foundation

/// Errors thrown while decoding or applying a protocol-2 view patch (decision 0020).
public enum ViewPatchError: Error, Equatable, Sendable {
    case invalidRevision(String)
    case baseRevisionMismatch(expected: Int, received: Int)
    case revisionMismatch(expected: Int, received: Int)
    case pathDoesNotExist([String])
    case cannotDeleteRoot
    case spliceTargetNotArray([String])
    case spliceOutOfBounds(at: Int, remove: Int, count: Int)
    case invalidOperation(String)
}

/// One generic JSON patch operation against a serialized `ControllerView`.
public enum ViewPatchOp: Equatable, Sendable {
    case set(path: [String], value: JSONValue)
    case delete(path: [String])
    case splice(path: [String], at: Int, remove: Int, insert: [JSONValue])

    public init(json: JSONValue) throws {
        guard let object = json.objectValue else {
            throw ViewPatchError.invalidOperation("view patch op must be an object")
        }
        guard let kind = object["op"]?.stringValue else {
            throw ViewPatchError.invalidOperation("view patch op missing string op")
        }
        guard let rawPath = object["path"]?.arrayValue else {
            throw ViewPatchError.invalidOperation("view patch op missing array path")
        }
        var path: [String] = []
        path.reserveCapacity(rawPath.count)
        for segment in rawPath {
            guard let key = segment.stringValue else {
                throw ViewPatchError.invalidOperation("view patch path segment must be a string")
            }
            path.append(key)
        }
        switch kind {
        case "set":
            guard let value = object["value"] else {
                throw ViewPatchError.invalidOperation("set op missing value")
            }
            self = .set(path: path, value: value)
        case "delete":
            self = .delete(path: path)
        case "splice":
            guard
                let at = object["at"]?.intValue,
                let remove = object["remove"]?.intValue,
                let insert = object["insert"]?.arrayValue
            else {
                throw ViewPatchError.invalidOperation("splice op missing at, remove or insert")
            }
            self = .splice(path: path, at: at, remove: remove, insert: insert)
        default:
            throw ViewPatchError.invalidOperation("unknown view patch op: \(kind)")
        }
    }
}

/// A protocol-2 view patch bundle (`packages/protocol/src/view-patch.ts`).
public struct ViewPatch: Equatable, Sendable {
    public let revision: Int?
    public let baseRevision: Int?
    public let ops: [ViewPatchOp]

    public init(revision: Int? = nil, baseRevision: Int? = nil, ops: [ViewPatchOp]) {
        self.revision = revision
        self.baseRevision = baseRevision
        self.ops = ops
    }

    public init(json: JSONValue) throws {
        guard let object = json.objectValue else {
            throw ViewPatchError.invalidOperation("view patch must be an object")
        }
        let revision: Int?
        if let rawRevision = object["revision"], rawRevision != .null {
            guard let parsed = rawRevision.intValue else {
                throw ViewPatchError.invalidRevision("revision must be an integer")
            }
            revision = parsed
        } else {
            revision = nil
        }
        let baseRevision: Int?
        if let rawBase = object["baseRevision"], rawBase != .null {
            guard let parsed = rawBase.intValue else {
                throw ViewPatchError.invalidRevision("baseRevision must be an integer")
            }
            baseRevision = parsed
        } else {
            baseRevision = nil
        }
        guard let rawOps = object["ops"]?.arrayValue else {
            throw ViewPatchError.invalidOperation("view patch missing ops array")
        }
        let ops = try rawOps.map(ViewPatchOp.init(json:))
        self.init(revision: revision, baseRevision: baseRevision, ops: ops)
    }

    /// Purely applies this patch to `view` without mutating it.
    public func apply(to view: JSONValue, currentRevision: Int? = nil) throws -> JSONValue {
        if let currentRevision {
            guard currentRevision >= 1 else {
                throw ViewPatchError.invalidRevision("invalid currentRevision: \(currentRevision)")
            }
            guard let baseRevision else {
                throw ViewPatchError.invalidRevision("view patch missing baseRevision (expected \(currentRevision))")
            }
            guard baseRevision == currentRevision else {
                throw ViewPatchError.baseRevisionMismatch(expected: currentRevision, received: baseRevision)
            }
        }
        if let baseRevision, let revision, revision != baseRevision + 1 {
            throw ViewPatchError.revisionMismatch(expected: baseRevision + 1, received: revision)
        }
        var current = view
        for op in ops {
            current = try Self.applyOp(current, op)
        }
        return current
    }

    private static func applyAt(
        _ node: JSONValue,
        path: [String],
        depth: Int,
        leaf: (JSONValue) throws -> JSONValue
    ) throws -> JSONValue {
        if depth == path.count { return try leaf(node) }
        guard case .object(var dict) = node else {
            throw ViewPatchError.pathDoesNotExist(path)
        }
        let key = path[depth]
        let isFinal = depth == path.count - 1
        if !isFinal && dict[key] == nil {
            throw ViewPatchError.pathDoesNotExist(path)
        }
        dict[key] = try applyAt(dict[key] ?? .null, path: path, depth: depth + 1, leaf: leaf)
        return .object(dict)
    }

    private static func applyOp(_ root: JSONValue, _ op: ViewPatchOp) throws -> JSONValue {
        switch op {
        case .set(let path, let value):
            if path.isEmpty { return value }
            return try applyAt(root, path: path, depth: 0) { _ in value }

        case .delete(let path):
            guard let key = path.last else {
                throw ViewPatchError.cannotDeleteRoot
            }
            let parentPath = Array(path.dropLast())
            let applyDelete: (JSONValue) throws -> JSONValue = { target in
                guard case .object(var dict) = target, dict[key] != nil else {
                    throw ViewPatchError.pathDoesNotExist(path)
                }
                dict.removeValue(forKey: key)
                return .object(dict)
            }
            return parentPath.isEmpty
                ? try applyDelete(root)
                : try applyAt(root, path: parentPath, depth: 0, leaf: applyDelete)

        case .splice(let path, let at, let remove, let insert):
            let applySplice: (JSONValue) throws -> JSONValue = { target in
                guard case .array(let array) = target else {
                    throw ViewPatchError.spliceTargetNotArray(path)
                }
                guard at >= 0, at <= array.count, remove >= 0, remove <= array.count - at else {
                    throw ViewPatchError.spliceOutOfBounds(at: at, remove: remove, count: array.count)
                }
                var next: [JSONValue] = []
                next.reserveCapacity(array.count - remove + insert.count)
                next.append(contentsOf: array[..<at])
                next.append(contentsOf: insert)
                next.append(contentsOf: array[(at + remove)...])
                return .array(next)
            }
            if path.isEmpty { return try applySplice(root) }
            let parentPath = Array(path.dropLast())
            let key = path[path.count - 1]
            let spliceInParent: (JSONValue) throws -> JSONValue = { parent in
                guard case .object(var dict) = parent, let target = dict[key] else {
                    throw ViewPatchError.pathDoesNotExist(path)
                }
                dict[key] = try applySplice(target)
                return .object(dict)
            }
            return parentPath.isEmpty
                ? try spliceInParent(root)
                : try applyAt(root, path: parentPath, depth: 0, leaf: spliceInParent)
        }
    }
}
