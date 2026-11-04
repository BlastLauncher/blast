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

/// One command discovered in a package.json under a launcher root.
public struct DiscoveredLauncherCommand: Equatable, Sendable {
    public let command: LauncherCommand
    public let extensionDirectory: URL

    public init(command: LauncherCommand, extensionDirectory: URL) {
        self.command = command
        self.extensionDirectory = extensionDirectory
    }
}

public enum LauncherCommandCatalogError: Error, Equatable, Sendable {
    case unreadableManifest(URL)
    case malformedManifest(URL)
}

/// Reads extension manifests without touching the engine. A directory that is
/// itself an extension is accepted; otherwise its immediate child directories
/// are scanned in stable path order.
public enum LauncherCommandCatalog {
    public static func load(from root: URL, fileManager: FileManager = .default) throws -> [DiscoveredLauncherCommand] {
        let directories: [URL]
        if fileManager.fileExists(atPath: root.appendingPathComponent("package.json").path) {
            directories = [root]
        } else {
            directories = try fileManager.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
                .filter { (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true }
                .sorted { $0.path < $1.path }
        }
        return try directories.compactMap { directory -> [DiscoveredLauncherCommand]? in
            let manifestURL = directory.appendingPathComponent("package.json")
            guard fileManager.fileExists(atPath: manifestURL.path) else { return nil }
            guard let data = try? Data(contentsOf: manifestURL) else { throw LauncherCommandCatalogError.unreadableManifest(manifestURL) }
            guard let object = try? JSONDecoder().decode(JSONValue.self, from: data), let manifest = object.objectValue else {
                throw LauncherCommandCatalogError.malformedManifest(manifestURL)
            }
            let extensionName = manifest["name"]?.stringValue ?? directory.lastPathComponent
            return (manifest["commands"]?.arrayValue ?? []).compactMap { entry -> DiscoveredLauncherCommand? in
                guard let name = entry["name"]?.stringValue else { return nil }
                let title = entry["title"]?.stringValue ?? name
                let mode = entry["mode"]?.stringValue ?? ""
                let subtitle = entry["subtitle"]?.stringValue ?? (mode.isEmpty ? extensionName : mode)
                let command = LauncherCommand(name: name, title: title, subtitle: subtitle, extensionDirectory: directory.path, extensionName: extensionName)
                return DiscoveredLauncherCommand(command: command, extensionDirectory: directory)
            }
        }
        .flatMap { $0 }
    }
}

/// Coordinates a launch and the decision required by decision 0012. It is
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
