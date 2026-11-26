import BlastKit

/// Where the launcher sends input: the engine's root search, or the command
/// session the root launched.
public enum LauncherInputTarget: Equatable, Sendable {
    case root(String)
    case session(String)
}

/// Follows one root and the session it launches. The root ignores input while
/// its command runs, so input and the display belong to the session from
/// `root.launched` until that session's `session.exited`, then to the root again.
public struct LauncherRouter: Equatable, Sendable {
    public private(set) var root: String?
    public private(set) var session: String?
    /// Last view received per root. Covers both the initial `root.view` serve
    /// writes before `root.open` returns and redrawing the root when a launched
    /// session exits without changing the root view (decision 0020).
    private var rootViews: [String: ControllerView] = [:]

    public init() {}

    public var inputTarget: LauncherInputTarget? {
        if let session { return .session(session) }
        if let root { return .root(root) }
        return nil
    }

    /// Adopts the root `root.open` returned and gives back the view it already drew, if any.
    public mutating func open(root: String) -> ControllerView? {
        self.root = root
        session = nil
        return rootViews[root]
    }

    /// Records lifecycle events and returns the view to draw, if this event carries one
    /// or restores the cached root view after the active session exits.
    public mutating func receive(_ event: BlastEvent) -> ControllerView? {
        switch event {
        case .rootView(let eventRoot, let view):
            rootViews[eventRoot] = view
            guard let root else { return nil }
            return eventRoot == root && session == nil ? view : nil
        case .rootLaunched(let eventRoot, let launched):
            if root != nil, eventRoot == root { session = launched }
            return nil
        case .view(let eventSession, let view):
            return session != nil && eventSession == session ? view : nil
        case .exited(let eventSession, _, _):
            guard session != nil, eventSession == session else { return nil }
            session = nil
            return root.flatMap { rootViews[$0] }
        default:
            return nil
        }
    }
}
