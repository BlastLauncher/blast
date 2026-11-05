import AppKit
import ApplicationServices
import Carbon.HIToolbox
import BlastKit

/// The thin AppKit side of `clipboard.*`. Everything decision-shaped lives in
/// `ClipboardContent`; only this file touches `NSPasteboard`.
enum ClipboardAdapter {
    private static let concealedType = NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType")

    @MainActor
    static func write(_ content: ClipboardContent, to pasteboard: NSPasteboard) {
        let item = NSPasteboardItem()
        for entry in content.items {
            let type: NSPasteboard.PasteboardType = switch entry.kind {
            case .text: .string
            case .html: .html
            case .file: .fileURL
            }
            item.setString(entry.value, forType: type)
        }
        if content.concealed {
            item.setData(Data(), forType: concealedType)
        }
        pasteboard.clearContents()
        pasteboard.writeObjects([item])
    }

    /// Writes the content, yields the frontmost application its focus back and
    /// presses ⌘V. Posting keystrokes needs Accessibility permission; without
    /// it the request fails instead of silently doing nothing.
    static func paste(_ plan: ClipboardPastePlan) async throws {
        guard !plan.content.isEmpty else {
            throw EmbedderError(code: "invalid_argument", message: "clipboard.paste requires text, html or file")
        }
        guard AXIsProcessTrusted() else {
            throw EmbedderError(
                code: "accessibility_required",
                message: "clipboard.paste needs Accessibility permission to post ⌘V"
            )
        }
        await MainActor.run {
            write(plan.content, to: .general)
            NSApplication.shared.hide(nil)
        }
        // Give the previously frontmost application time to take focus back
        // before the keystroke is posted.
        try await Task.sleep(for: .milliseconds(60))
        postCommandV()
        if !plan.closeMainWindow {
            await MainActor.run {
                NSApp.unhideWithoutActivation()
            }
        }
    }

    static func postCommandV() {
        for isDown in [true, false] {
            guard let event = CGEvent(
                keyboardEventSource: nil,
                virtualKey: CGKeyCode(kVK_ANSI_V),
                keyDown: isDown
            ) else { continue }
            event.flags = .maskCommand
            event.post(tap: .cghidEventTap)
        }
    }
}
