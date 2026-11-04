import AppKit
import Foundation
import BlastKit
import BlastPresenter

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var windowController: LauncherWindowController?
    private var client: BlastClient?
    private var session: String?
    private var extensionID: String?
    private let presenter = LauncherPresenter()
    private var extensionDirectory: String { CommandLine.arguments.dropFirst().first ?? FileManager.default.currentDirectoryPath }
    private var command: String { CommandLine.arguments.dropFirst(2).first ?? "index" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = LauncherWindowController(presenter: presenter); windowController = controller; controller.showWindow(nil); controller.window?.makeKeyAndOrderFront(nil); controller.window?.contentView?.window?.makeFirstResponder(controller.window?.contentView)
        controller.onInput = { [weak self] input in self?.send(input) }
        Task { await launch() }
    }

    private func launch() async {
        do {
            let transport = ProcessTransport(servePath: "packages/serve/src/main.ts", workingDirectory: URL(fileURLWithPath: repositoryRoot()))
            let blast = BlastClient(transport: transport)
            client = blast
            blast.onEvent = { [weak self] event in Task { @MainActor in self?.event(event) } }
            _ = try await blast.start(capabilities: ["clipboard.copy"])
            let id = try await blast.openExtension(dir: extensionDirectory); extensionID = id
            let launched = try await blast.launchExtension(extension: id, command: command); session = launched
        } catch { showError(error) }
    }

    private func event(_ event: BlastEvent) { if case .view(_, let view) = event { presenter.apply(view); windowController?.render(presenter.display) } }
    private func send(_ input: ControllerInput) { guard let client, let session else { return }; Task { try? await client.sendInput(input, session: session) } }
    private func showError(_ error: Error) { let alert = NSAlert(); alert.messageText = "Blast Launcher"; alert.informativeText = String(describing: error); alert.runModal() }
    private func repositoryRoot() -> String { URL(fileURLWithPath: FileManager.default.currentDirectoryPath).path }
    func applicationWillTerminate(_ notification: Notification) { client?.close() }
}

@main
struct BlastLauncherMain {
    static func main() { let app = NSApplication.shared; let delegate = AppDelegate(); app.delegate = delegate; app.setActivationPolicy(.regular); app.activate(ignoringOtherApps: true); app.run() }
}
