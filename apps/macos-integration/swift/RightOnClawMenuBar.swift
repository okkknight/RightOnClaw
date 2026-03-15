import AppKit
import Carbon
import Foundation

struct MenuBarArguments {
    let nodeBin: String
    let cliPath: String
    let askHotkey: String
    let screenshotHotkey: String
}

enum MenuBarError: Error {
    case invalidArguments
}

struct HotkeySpec {
    let keyCode: UInt32
    let modifiers: UInt32
}

private let hotKeySignature: OSType = 0x524F434B

@main
struct RightOnClawMenuBar {
    static func main() {
        do {
            let arguments = try parseArguments()
            let app = NSApplication.shared
            app.setActivationPolicy(.accessory)
            let delegate = MenuBarAppDelegate(arguments: arguments)
            app.delegate = delegate
            app.run()
        } catch {
            fputs("RightOnClawMenuBar error: \(error)\n", stderr)
            exit(1)
        }
    }

    static func parseArguments() throws -> MenuBarArguments {
        let arguments = CommandLine.arguments
        var nodeBin: String?
        var cliPath: String?
        var askHotkey = "cmd+shift+c"
        var screenshotHotkey = "cmd+shift+x"
        var index = 1

        while index < arguments.count {
            switch arguments[index] {
            case "--node-bin":
                index += 1
                guard index < arguments.count else { throw MenuBarError.invalidArguments }
                nodeBin = arguments[index]
            case "--cli-path":
                index += 1
                guard index < arguments.count else { throw MenuBarError.invalidArguments }
                cliPath = arguments[index]
            case "--ask-hotkey":
                index += 1
                guard index < arguments.count else { throw MenuBarError.invalidArguments }
                askHotkey = arguments[index]
            case "--screenshot-hotkey":
                index += 1
                guard index < arguments.count else { throw MenuBarError.invalidArguments }
                screenshotHotkey = arguments[index]
            default:
                throw MenuBarError.invalidArguments
            }

            index += 1
        }

        guard let resolvedNodeBin = nodeBin, let resolvedCliPath = cliPath else {
            throw MenuBarError.invalidArguments
        }

        return MenuBarArguments(
            nodeBin: resolvedNodeBin,
            cliPath: resolvedCliPath,
            askHotkey: askHotkey,
            screenshotHotkey: screenshotHotkey
        )
    }
}

final class MenuBarAppDelegate: NSObject, NSApplicationDelegate {
    private static let productName = "RightOnClaw"
    private let arguments: MenuBarArguments
    private var statusItem: NSStatusItem?
    private var hotKeyRefs: [EventHotKeyRef?] = []
    private var eventHandler: EventHandlerRef?
    private var hotkeyFailures: [String] = []

    init(arguments: MenuBarArguments) {
        self.arguments = arguments
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureStatusItem()
        installHotkeyHandler()
        registerHotkey(arguments.askHotkey, hotKeyID: 1)
        registerHotkey(arguments.screenshotHotkey, hotKeyID: 2)

        if !hotkeyFailures.isEmpty {
            updateStatusItemForFailure()
            presentFailureAlert(
                title: "RightOnClaw Hotkeys Unavailable",
                message: "Failed to register: \(hotkeyFailures.joined(separator: ", ")). Check for shortcut conflicts, then relaunch RightOnClaw."
            )
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        hotKeyRefs.forEach { hotKeyRef in
            if let hotKeyRef {
                UnregisterEventHotKey(hotKeyRef)
            }
        }

        if let eventHandler {
            RemoveEventHandler(eventHandler)
        }
    }

    private func configureStatusItem() {
        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            if let image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "RightOnClaw") {
                let configuredImage = image.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 13, weight: .medium)) ?? image
                configuredImage.isTemplate = true
                button.image = configuredImage
            } else {
                button.title = "ROC"
            }
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Ask Claw", action: #selector(askClawSelected), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Capture Screenshot", action: #selector(screenshotSelected), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Settings", action: #selector(settingsSelected), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit RightOnClaw", action: #selector(quitSelected), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        statusItem.menu = menu
        self.statusItem = statusItem
    }

    private func registerHotkey(_ label: String, hotKeyID: UInt32) {
        guard let spec = parseHotkey(label) else {
            fputs("[RightOnClaw] Failed to parse hotkey \(label).\n", stderr)
            return
        }

        var hotKeyRef: EventHotKeyRef?
        let eventHotKeyID = EventHotKeyID(signature: hotKeySignature, id: hotKeyID)
        let status = RegisterEventHotKey(spec.keyCode, spec.modifiers, eventHotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)

        if status == noErr {
            hotKeyRefs.append(hotKeyRef)
            return
        }

        hotkeyFailures.append(label)
        fputs("[RightOnClaw] Failed to register hotkey \(label). Status=\(status)\n", stderr)
    }

    private func installHotkeyHandler() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let status = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, eventRef, userData in
                guard let eventRef, let userData else {
                    return OSStatus(eventNotHandledErr)
                }

                let delegate = Unmanaged<MenuBarAppDelegate>.fromOpaque(userData).takeUnretainedValue()
                return delegate.handleHotKey(eventRef)
            },
            1,
            &eventType,
            Unmanaged.passUnretained(self).toOpaque(),
            &eventHandler
        )

        if status != noErr {
            fputs("[RightOnClaw] Failed to install hotkey handler. Status=\(status)\n", stderr)
        }
    }

    private func handleHotKey(_ eventRef: EventRef) -> OSStatus {
        var hotKeyID = EventHotKeyID()
        let status = GetEventParameter(
            eventRef,
            EventParamName(kEventParamDirectObject),
            EventParamType(typeEventHotKeyID),
            nil,
            MemoryLayout<EventHotKeyID>.size,
            nil,
            &hotKeyID
        )

        guard status == noErr else {
            return status
        }

        switch hotKeyID.id {
        case 1:
            askClawSelected()
        case 2:
            screenshotSelected()
        default:
            break
        }

        return noErr
    }

    @objc private func askClawSelected() {
        launchNodeCommand(arguments: [arguments.cliPath, "run", "ask_claw", "auto"])
    }

    @objc private func screenshotSelected() {
        launchNodeCommand(arguments: [arguments.cliPath, "screenshot"])
    }

    @objc private func settingsSelected() {
        launchNodeCommand(arguments: [arguments.cliPath, "setup"])
    }

    @objc private func quitSelected() {
        NSApp.terminate(nil)
    }

    private func launchNodeCommand(arguments: [String]) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: self.arguments.nodeBin)
        process.arguments = arguments
        process.standardOutput = nil
        process.standardError = nil

        do {
            try process.run()
        } catch {
            fputs("[RightOnClaw] Failed to launch command: \(error)\n", stderr)
            presentFailureAlert(
                title: "RightOnClaw Launch Failed",
                message: "Could not launch the RightOnClaw helper. Check the menu bar logs and try relaunching RightOnClaw."
            )
        }
    }

    private func updateStatusItemForFailure() {
        if let button = statusItem?.button {
            button.title = "ROC!"
            button.image = nil
        }
    }

    private func presentFailureAlert(title: String, message: String) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}

private func parseHotkey(_ label: String) -> HotkeySpec? {
    let keyCodes: [String: UInt32] = [
        "a": 0, "b": 11, "c": 8, "d": 2, "e": 14, "f": 3, "g": 5, "h": 4,
        "i": 34, "j": 38, "k": 40, "l": 37, "m": 46, "n": 45, "o": 31, "p": 35,
        "q": 12, "r": 15, "s": 1, "t": 17, "u": 32, "v": 9, "w": 13, "x": 7,
        "y": 16, "z": 6
    ]

    var modifiers: UInt32 = 0
    var keyCode: UInt32?

    for token in label.lowercased().split(separator: "+").map(String.init) {
        switch token {
        case "cmd", "command":
            modifiers |= UInt32(cmdKey)
        case "shift":
            modifiers |= UInt32(shiftKey)
        case "option", "alt":
            modifiers |= UInt32(optionKey)
        case "ctrl", "control":
            modifiers |= UInt32(controlKey)
        default:
            keyCode = keyCodes[token]
        }
    }

    guard let resolvedKeyCode = keyCode else {
        return nil
    }

    return HotkeySpec(keyCode: resolvedKeyCode, modifiers: modifiers)
}
