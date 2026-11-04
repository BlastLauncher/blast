import Carbon.HIToolbox
import BlastPresenter

/// A Carbon virtual key code and modifier mask, produced without registering
/// anything. The adapter passes these straight to `RegisterEventHotKey`.
struct LauncherHotkeyBinding: Equatable, Sendable {
    let keyCode: UInt32
    let modifiers: UInt32
}

enum LauncherHotkeyError: Error, Equatable, CustomStringConvertible {
    case unsupportedKey(String)
    case registrationFailed(Int32)

    var description: String {
        switch self {
        case .unsupportedKey(let key): "unsupported launcher hotkey key: \(key)"
        case .registrationFailed(let status): "could not register the launcher hotkey (OSStatus \(status))"
        }
    }
}

/// Carbon key codes are physical-layout independent, so a table is the only
/// portable translation; `LauncherHotkey.key` is a key name (`space`, `a`…).
private let keyCodes: [String: Int] = [
    "space": kVK_Space,
    "a": kVK_ANSI_A,
    "b": kVK_ANSI_B,
    "c": kVK_ANSI_C,
    "d": kVK_ANSI_D,
    "e": kVK_ANSI_E,
    "f": kVK_ANSI_F,
    "g": kVK_ANSI_G,
    "h": kVK_ANSI_H,
    "i": kVK_ANSI_I,
    "j": kVK_ANSI_J,
    "k": kVK_ANSI_K,
    "l": kVK_ANSI_L,
    "m": kVK_ANSI_M,
    "n": kVK_ANSI_N,
    "o": kVK_ANSI_O,
    "p": kVK_ANSI_P,
    "q": kVK_ANSI_Q,
    "r": kVK_ANSI_R,
    "s": kVK_ANSI_S,
    "t": kVK_ANSI_T,
    "u": kVK_ANSI_U,
    "v": kVK_ANSI_V,
    "w": kVK_ANSI_W,
    "x": kVK_ANSI_X,
    "y": kVK_ANSI_Y,
    "z": kVK_ANSI_Z,
    "0": kVK_ANSI_0,
    "1": kVK_ANSI_1,
    "2": kVK_ANSI_2,
    "3": kVK_ANSI_3,
    "4": kVK_ANSI_4,
    "5": kVK_ANSI_5,
    "6": kVK_ANSI_6,
    "7": kVK_ANSI_7,
    "8": kVK_ANSI_8,
    "9": kVK_ANSI_9,
]

/// Pure translation, unit-tested; nothing here touches the event system.
func launcherHotkeyBinding(for hotkey: LauncherHotkey) throws -> LauncherHotkeyBinding {
    guard let keyCode = keyCodes[hotkey.key.lowercased()] else {
        throw LauncherHotkeyError.unsupportedKey(hotkey.key)
    }
    var modifiers = 0
    if hotkey.option { modifiers |= optionKey }
    if hotkey.command { modifiers |= cmdKey }
    if hotkey.control { modifiers |= controlKey }
    if hotkey.shift { modifiers |= shiftKey }
    return LauncherHotkeyBinding(keyCode: UInt32(keyCode), modifiers: UInt32(modifiers))
}
