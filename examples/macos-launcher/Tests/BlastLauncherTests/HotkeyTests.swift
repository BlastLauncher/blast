import Carbon.HIToolbox
import Testing
import BlastPresenter
@testable import BlastLauncher

/// The binding is pure: these assertions never register a real global hotkey.
@Suite("Launcher hotkey mapping")
struct HotkeyMappingTests {
    @Test("the default option-space maps to Carbon's space key and option mask")
    func defaultBinding() throws {
        let binding = try launcherHotkeyBinding(for: .defaultOptionSpace)
        #expect(binding == LauncherHotkeyBinding(keyCode: UInt32(kVK_Space), modifiers: UInt32(optionKey)))
    }

    @Test("space, letters and digits map to their ANSI key codes")
    func keys() throws {
        func keyCode(_ key: String) throws -> UInt32 {
            try launcherHotkeyBinding(for: LauncherHotkey(key: key, option: false)).keyCode
        }
        #expect(try keyCode("space") == UInt32(kVK_Space))
        #expect(try keyCode("a") == UInt32(kVK_ANSI_A))
        #expect(try keyCode("k") == UInt32(kVK_ANSI_K))
        #expect(try keyCode("z") == UInt32(kVK_ANSI_Z))
        #expect(try keyCode("A") == UInt32(kVK_ANSI_A))
        #expect(try keyCode("0") == UInt32(kVK_ANSI_0))
        #expect(try keyCode("9") == UInt32(kVK_ANSI_9))
    }

    @Test("each modifier flag maps to its Carbon mask")
    func modifiers() throws {
        let none = try launcherHotkeyBinding(for: LauncherHotkey(key: "space", option: false))
        #expect(none.modifiers == 0)

        let all = try launcherHotkeyBinding(
            for: LauncherHotkey(key: "space", option: true, command: true, control: true, shift: true)
        )
        #expect(all.modifiers == UInt32(optionKey | cmdKey | controlKey | shiftKey))
    }

    @Test("an unsupported key throws a typed error")
    func unsupported() {
        #expect(throws: LauncherHotkeyError.unsupportedKey("f1")) {
            try launcherHotkeyBinding(for: LauncherHotkey(key: "f1", option: false))
        }
        #expect(throws: LauncherHotkeyError.unsupportedKey("Spacebar")) {
            try launcherHotkeyBinding(for: LauncherHotkey(key: "Spacebar", option: false))
        }
    }
}
