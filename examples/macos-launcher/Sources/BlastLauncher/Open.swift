import AppKit
import BlastKit

/// The thin `NSWorkspace` side of `open.url`/`open.path`. Argument validation
/// happens in `OpenArguments`; here only application lookup and opening remain.
enum WorkspaceOpener {
    @MainActor
    static func open(_ arguments: OpenArguments) {
        let url: URL
        switch arguments.target {
        case .url(let value): url = value
        case .file(let value): url = value
        }

        if let reference = arguments.application, let applicationURL = resolve(reference) {
            NSWorkspace.shared.open(
                [url],
                withApplicationAt: applicationURL,
                configuration: NSWorkspace.OpenConfiguration(),
                completionHandler: nil
            )
            return
        }
        NSWorkspace.shared.open(url)
    }

    /// A path wins over a bundle id, which wins over a display name. Anything
    /// that does not resolve falls back to the default application.
    @MainActor
    static func resolve(_ reference: ApplicationReference) -> URL? {
        if let path = reference.path {
            let expanded = (path as NSString).expandingTildeInPath
            if FileManager.default.fileExists(atPath: expanded) {
                return URL(fileURLWithPath: expanded)
            }
        }
        if let bundleID = reference.bundleID,
           let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID) {
            return url
        }
        if let name = reference.name {
            if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: name) {
                return url
            }
            // NSWorkspace no longer resolves display names; the standard
            // application folders cover the common cases without a deprecated
            // LaunchServices call.
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            for directory in ["/Applications", "/System/Applications", "\(home)/Applications"] {
                var candidate = URL(fileURLWithPath: directory).appendingPathComponent(name)
                if candidate.pathExtension != "app" {
                    candidate = candidate.appendingPathExtension("app")
                }
                if FileManager.default.fileExists(atPath: candidate.path) {
                    return candidate
                }
            }
        }
        return nil
    }
}
