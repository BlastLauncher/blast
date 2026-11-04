import Carbon.HIToolbox
import BlastPresenter

/// The only type that registers a system-wide shortcut. It stays untested on
/// purpose: a test must never install a real global hotkey.
final class CarbonHotkeySource: LauncherHotkeySource, @unchecked Sendable {
    private let hotkey: LauncherHotkey
    private var eventHandler: EventHandlerRef?
    private var hotKey: EventHotKeyRef?
    private var onPress: (@Sendable () -> Void)?

    init(hotkey: LauncherHotkey) {
        self.hotkey = hotkey
    }

    func start(_ handler: @escaping @Sendable () -> Void) throws {
        let binding = try launcherHotkeyBinding(for: hotkey)
        onPress = handler

        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        let handlerStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, _, userData in
                guard let userData else { return noErr }
                Unmanaged<CarbonHotkeySource>.fromOpaque(userData).takeUnretainedValue().fire()
                return noErr
            },
            1,
            &eventType,
            Unmanaged.passUnretained(self).toOpaque(),
            &eventHandler
        )
        guard handlerStatus == noErr else {
            stop()
            throw LauncherHotkeyError.registrationFailed(handlerStatus)
        }

        let hotKeyID = EventHotKeyID(signature: OSType(0x424C_4153), id: 1)
        let registerStatus = RegisterEventHotKey(
            binding.keyCode,
            binding.modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKey
        )
        guard registerStatus == noErr else {
            stop()
            throw LauncherHotkeyError.registrationFailed(registerStatus)
        }
    }

    func stop() {
        if let hotKey {
            UnregisterEventHotKey(hotKey)
            self.hotKey = nil
        }
        if let eventHandler {
            RemoveEventHandler(eventHandler)
            self.eventHandler = nil
        }
        onPress = nil
    }

    fileprivate func fire() {
        onPress?()
    }
}
