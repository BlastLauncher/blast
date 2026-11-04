import AppKit
import Foundation
import BlastKit
import BlastPresenter

/// Grants every capability the launcher asks for and logs it. Copying to the
/// real system clipboard is deliberately out of scope for this example (0107);
/// the log keeps the capability visible without touching user state.
struct LoggingCapabilityHandler: CapabilityHandler, Sendable {
    func handle(_ request: CapabilityRequest) async throws -> JSONValue {
        let line = "capability \(request.name) \(request.params)\n"
        FileHandle.standardError.write(Data(line.utf8))
        return .null
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private enum Mode {
        case picker
        case session
    }

    private let extensionDirectory: String
    private let requestedCommand: String?
    private let presenter = LauncherPresenter()
    private var windowController: LauncherWindowController?
    private var client: BlastClient?
    private var session: String?
    private var extensionID: String?
    private var mode: Mode = .picker
    private var picker = LauncherCommandPicker(commands: [])

    init(extensionDirectory: String, command: String?) {
        self.extensionDirectory = extensionDirectory
        self.requestedCommand = command
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = LauncherWindowController(presenter: presenter)
        controller.onInput = { [weak self] input in self?.handle(input) }
        controller.onCancel = { NSApplication.shared.terminate(nil) }
        windowController = controller
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        controller.window?.makeFirstResponder(controller.searchField)
        Task { await start() }
    }

    func applicationWillTerminate(_ notification: Notification) {
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
            let blast = BlastClient(transport: transport, capabilityHandler: LoggingCapabilityHandler())
            client = blast
            blast.onEvent = { [weak self] event in
                Task { @MainActor in self?.handle(event) }
            }
            _ = try await blast.start(capabilities: ["clipboard.copy"])
            let opened = try await blast.openExtension(dir: extensionDirectory)
            extensionID = opened

            if let requestedCommand {
                await launch(requestedCommand)
                return
            }
            let manifest = try await blast.request(
                "extension.manifest",
                params: .object(["extension": .string(opened)])
            )
            picker = LauncherCommandPicker(commands: Self.commands(from: manifest))
            mode = .picker
            render(picker.display)
        } catch {
            present(error)
        }
    }

    private func launch(_ command: String) async {
        guard let blast = client, let extensionID else { return }
        do {
            mode = .session
            session = try await blast.launchExtension(extension: extensionID, command: command)
        } catch {
            present(error)
        }
    }

    // MARK: - Events and inputs

    private func handle(_ event: BlastEvent) {
        guard case .view(let viewSession, let view) = event else { return }
        if session == nil { session = viewSession }
        guard viewSession == session else { return }
        presenter.apply(view)
        render(presenter.display)
    }

    private func handle(_ input: ControllerInput) {
        switch mode {
        case .picker:
            handlePicker(input)
        case .session:
            send(input)
        }
    }

    private func handlePicker(_ input: ControllerInput) {
        switch input {
        case .move(let direction):
            picker.move(direction)
            render(picker.display)
        case .search(let text):
            picker.search(text)
            render(picker.display)
        case .select(let id):
            picker.select(id: id)
            render(picker.display)
        case .primary:
            guard let command = picker.selectedCommand else { return }
            Task { await launch(command.name) }
        default:
            break
        }
    }

    private func send(_ input: ControllerInput) {
        guard let client, let session else { return }
        Task {
            do {
                try await client.sendInput(input, session: session)
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

    static func commands(from manifest: JSONValue) -> [LauncherCommand] {
        (manifest["commands"]?.arrayValue ?? []).compactMap { entry in
            guard let name = entry["name"]?.stringValue else { return nil }
            let title = entry["title"]?.stringValue ?? name
            let mode = entry["mode"]?.stringValue ?? ""
            let subtitle = entry["subtitle"]?.stringValue ?? ""
            return LauncherCommand(name: name, title: title, subtitle: subtitle.isEmpty ? mode : subtitle)
        }
    }

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

    var description: String {
        switch self {
        case .missingEngine(let message): message
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
