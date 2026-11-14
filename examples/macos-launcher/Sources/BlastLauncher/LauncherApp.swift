import AppKit
import Foundation
import BlastKit
import BlastPresenter

/// Thin AppKit adapters. Tests use CapabilityRouter with in-memory handlers;
/// this type is only constructed by the executable.
struct MacOSCapabilityHandler: CapabilityHandler, @unchecked Sendable {
    func handle(_ request: CapabilityRequest) async throws -> JSONValue {
        switch request.name {
        case "clipboard.copy":
            let content = ClipboardContent(params: request.params)
            await MainActor.run { ClipboardAdapter.write(content, to: .general) }
            return .null
        case "clipboard.paste":
            try await ClipboardAdapter.paste(ClipboardPastePlan(params: request.params))
            return .null
        case "open.url":
            let urlArguments = try Self.openArguments { try OpenArguments.url(from: request.params) }
            await MainActor.run { WorkspaceOpener.open(urlArguments) }
            return .null
        case "open.path":
            let pathArguments = try Self.openArguments { try OpenArguments.path(from: request.params) }
            await MainActor.run { WorkspaceOpener.open(pathArguments) }
            return .null
        default:
            throw EmbedderError(code: "unhandled_capability", message: "No handler for \(request.name).")
        }
    }

    private static func openArguments(_ parse: () throws -> OpenArguments) throws -> OpenArguments {
        do {
            return try parse()
        } catch let error as OpenArgumentsError {
            throw EmbedderError(code: "invalid_argument", message: "\(error)")
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let extensionDirectory: String
    private let requestedCommand: String?
    private let presenter = LauncherPresenter()
    private var windowController: LauncherWindowController?
    private var client: BlastClient?
    private var router = LauncherRouter()
    private var hotkeyController: LauncherHotkeyController?

    init(extensionDirectory: String, command: String?) {
        self.extensionDirectory = extensionDirectory
        self.requestedCommand = command
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = LauncherWindowController(presenter: presenter)
        let hotkeys = LauncherHotkeyController(source: CarbonHotkeySource(hotkey: .defaultOptionSpace)) { [weak self] presented in
            Task { @MainActor [weak self] in
                guard let window = self?.windowController?.window else { return }
                if presented {
                    NSApp.unhide(nil)
                    NSApp.activate()
                    window.makeKeyAndOrderFront(nil)
                } else {
                    window.orderOut(nil)
                }
            }
        }
        hotkeyController = hotkeys
        try? hotkeys.start()
        controller.onInput = { [weak self] input in self?.handle(input) }
        controller.onCancel = { NSApplication.shared.terminate(nil) }
        windowController = controller
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        controller.window?.makeFirstResponder(controller.searchField)
        Task { await start() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        hotkeyController?.stop()
        client?.close()
    }

    // MARK: - Startup

    private func start() async {
        do {
            guard let root = Self.repositoryRoot() else {
                throw LauncherError.missingEngine(
                    "cannot find packages/serve/src/main.ts above the working directory; set BLAST_REPO_ROOT"
                )
            }
            let transport = ProcessTransport(
                servePath: ProcessTransport.defaultServePath,
                workingDirectory: root
            )
            let blast = BlastClient(transport: transport, capabilityHandler: MacOSCapabilityHandler())
            client = blast
            blast.onEvent = { [weak self] event in
                Task { @MainActor in self?.handle(event) }
            }
            _ = try await blast.start(capabilities: ["clipboard.copy", "clipboard.paste", "open.url", "open.path"])
            _ = try await blast.openExtension(dir: extensionDirectory)
            let openedRoot = try await blast.openRoot(views: .macOS)
            if let view = router.open(root: openedRoot) { show(view) }
            if let requestedCommand {
                try await blast.sendInput(.search(requestedCommand), root: openedRoot)
                try await blast.sendInput(.primary, root: openedRoot)
            }
        } catch {
            present(error)
        }
    }

    // MARK: - Events and inputs

    private func handle(_ event: BlastEvent) {
        if let view = router.receive(event) { show(view) }
    }

    private func show(_ view: ControllerView) {
        presenter.apply(view)
        render(presenter.display)
    }

    private func handle(_ input: ControllerInput) {
        guard let client, let target = router.inputTarget else { return }
        Task {
            do {
                switch target {
                case .root(let root): try await client.sendInput(input, root: root)
                case .session(let session): try await client.sendInput(input, session: session)
                }
            } catch {
                present(error)
            }
        }
    }

    private func render(_ display: LauncherDisplay) {
        windowController?.render(display)
    }

    private func present(_ error: Error) {
        let alert = NSAlert()
        alert.messageText = "Blast Launcher"
        alert.informativeText = String(describing: error)
        alert.runModal()
        NSApplication.shared.terminate(nil)
    }

    // MARK: - Manifest

    /// `swift run` starts in the package directory, but the example may be
    /// launched from anywhere inside a checkout, so walk up to the engine.
    private static func repositoryRoot() -> URL? {
        if let value = ProcessInfo.processInfo.environment["BLAST_REPO_ROOT"], !value.isEmpty {
            return URL(fileURLWithPath: value)
        }
        var directory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        while true {
            let candidate = directory.appendingPathComponent(ProcessTransport.defaultServePath)
            if FileManager.default.fileExists(atPath: candidate.path) { return directory }
            let parent = directory.deletingLastPathComponent()
            if parent.path == directory.path { return nil }
            directory = parent
        }
    }
}

enum LauncherError: Error, CustomStringConvertible {
    case missingEngine(String)
    case noCommands

    var description: String {
        switch self {
        case .missingEngine(let message): message
        case .noCommands: "no commands found in extension directory"
        }
    }
}

@main
struct BlastLauncherMain {
    @MainActor
    static func main() {
        let arguments = Array(CommandLine.arguments.dropFirst())
        guard let directory = arguments.first else {
            FileHandle.standardError.write(Data("usage: BlastLauncher <extension-dir> [command]\n".utf8))
            exit(2)
        }
        let app = NSApplication.shared
        let delegate = AppDelegate(extensionDirectory: directory, command: arguments.dropFirst().first)
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.activate(ignoringOtherApps: true)
        app.run()
    }
}
