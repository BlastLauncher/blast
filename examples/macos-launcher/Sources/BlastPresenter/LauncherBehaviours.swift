import Foundation
import BlastKit

/// A configurable shortcut understood by the launcher. The AppKit adapter owns
/// registration; this value and the toggle state are platform independent.
public struct LauncherHotkey: Equatable, Sendable {
    public let key: String
    public let option: Bool
    public let command: Bool
    public let control: Bool
    public let shift: Bool

    public init(key: String = "space", option: Bool = true, command: Bool = false, control: Bool = false, shift: Bool = false) {
        self.key = key
        self.option = option
        self.command = command
        self.control = control
        self.shift = shift
    }

    public static let defaultOptionSpace = LauncherHotkey()
}

public protocol LauncherHotkeySource: Sendable {
    func start(_ handler: @escaping @Sendable () -> Void) throws
    func stop()
}

/// Owns only the hotkey's observable state. Tests can inject a source that
/// invokes the callback without registering a system shortcut.
public final class LauncherHotkeyController: @unchecked Sendable {
    public private(set) var isPresented = false
    public let hotkey: LauncherHotkey
    private let source: any LauncherHotkeySource
    private let lock = NSLock()
    private var onToggle: (@Sendable (Bool) -> Void)?

    public init(hotkey: LauncherHotkey = .defaultOptionSpace, source: any LauncherHotkeySource, onToggle: (@Sendable (Bool) -> Void)? = nil) {
        self.hotkey = hotkey
        self.source = source
        self.onToggle = onToggle
    }

    public func start() throws {
        try source.start { [weak self] in self?.toggle() }
    }

    public func stop() { source.stop() }

    public func toggle() {
        lock.lock()
        isPresented.toggle()
        let value = isPresented
        let callback = onToggle
        lock.unlock()
        callback?(value)
    }
}

/// Coordinates a launch and the decision required by decision 0002. It is
/// deliberately closure based so tests inject engine responses and confirmation.
public final class LauncherLaunchCoordinator: @unchecked Sendable {
    public typealias Launch = @Sendable (_ installDependencies: Bool) async throws -> String
    public typealias ConfirmInstall = @Sendable (_ dependencies: MissingDependencies) async -> Bool
    public typealias Prompt = @Sendable (_ dependencies: MissingDependencies) -> Void

    private let launch: Launch
    private let confirmInstall: ConfirmInstall
    private let prompt: Prompt?

    public init(launch: @escaping Launch, confirmInstall: @escaping ConfirmInstall, prompt: Prompt? = nil) {
        self.launch = launch
        self.confirmInstall = confirmInstall
        self.prompt = prompt
    }

    public func run() async throws -> String {
        do {
            return try await launch(false)
        } catch let error as BlastError {
            guard let remote = error.remoteError, let dependencies = remote.missingDependencies, dependencies.installable else { throw error }
            prompt?(dependencies)
            guard await confirmInstall(dependencies) else { throw error }
            return try await launch(true)
        }
    }
}
