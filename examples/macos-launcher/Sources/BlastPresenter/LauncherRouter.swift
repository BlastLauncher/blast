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
    /// `root.subscribe` draws at once, so serve writes the first `root.view`
    /// before the `root.open` response that names the root.
    private var pendingRootViews: [String: ControllerView] = [:]

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
        let view = pendingRootViews[root]
        pendingRootViews = [:]
        return view
    }

    /// Records lifecycle events and returns the view to draw, if this event carries one.
    public mutating func receive(_ event: BlastEvent) -> ControllerView? {
        switch event {
        case .rootView(let eventRoot, let view):
            guard let root else {
                pendingRootViews[eventRoot] = view
                return nil
            }
            return eventRoot == root && session == nil ? view : nil
        case .rootLaunched(let eventRoot, let launched):
            if root != nil, eventRoot == root { session = launched }
            return nil
        case .view(let eventSession, let view):
            return session != nil && eventSession == session ? view : nil
        case .exited(let eventSession, _, _):
            if session != nil, eventSession == session { session = nil }
            return nil
        default:
            return nil
        }
    }
}
