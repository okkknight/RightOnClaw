import AppKit
import Foundation

struct HudArguments {
    let message: String
    let parentPid: Int32?
}

@main
struct RightOnClawHud {
    static func main() {
        do {
            let arguments = try parseArguments()
            let app = NSApplication.shared
            let delegate = HudAppDelegate(arguments: arguments)
            app.setActivationPolicy(.accessory)
            app.delegate = delegate
            app.run()
        } catch {
            fputs("RightOnClawHud error: \(error)\n", stderr)
            exit(1)
        }
    }

    static func parseArguments() throws -> HudArguments {
        let arguments = CommandLine.arguments
        var message: String?
        var parentPid: Int32?
        var index = 1

        while index < arguments.count {
            switch arguments[index] {
            case "--message":
                index += 1
                guard index < arguments.count else {
                    throw HudError.invalidArguments
                }
                message = arguments[index]
            case "--parent-pid":
                index += 1
                guard index < arguments.count, let parsed = Int32(arguments[index]) else {
                    throw HudError.invalidArguments
                }
                parentPid = parsed
            default:
                throw HudError.invalidArguments
            }

            index += 1
        }

        guard let resolvedMessage = message?.trimmingCharacters(in: .whitespacesAndNewlines), !resolvedMessage.isEmpty else {
            throw HudError.invalidArguments
        }

        return HudArguments(message: resolvedMessage, parentPid: parentPid)
    }
}

final class HudAppDelegate: NSObject, NSApplicationDelegate {
    private static let panelWidth: CGFloat = 286
    private static let panelHeight: CGFloat = 74

    private let arguments: HudArguments
    private var window: NSPanel?
    private var parentMonitorTimer: Timer?

    init(arguments: HudArguments) {
        self.arguments = arguments
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let window = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: Self.panelWidth, height: Self.panelHeight),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        window.isFloatingPanel = true
        window.level = .statusBar
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle, .transient]
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.hidesOnDeactivate = false
        window.ignoresMouseEvents = true

        let backdrop = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: Self.panelWidth, height: Self.panelHeight))
        backdrop.material = .hudWindow
        backdrop.blendingMode = .withinWindow
        backdrop.state = .active
        backdrop.wantsLayer = true

        let containerView = ROCSurfaceView(style: .hud, cornerRadius: ROCRadius.window)
        backdrop.addSubview(containerView)
        containerView.rocPinEdges(to: backdrop)

        let row = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.medium)
        containerView.addSubview(row)
        row.rocPinEdges(to: containerView, insets: NSEdgeInsets(top: 0, left: ROCSpacing.medium, bottom: 0, right: ROCSpacing.medium))
        row.centerYAnchor.constraint(equalTo: containerView.centerYAnchor).isActive = true

        let iconView = ROCUIFactory.makeSymbolImageView(
            symbolName: "sparkles",
            pointSize: 14,
            tintColor: ROCTheme.accentText,
            backgroundStyle: .accent
        )
        row.addArrangedSubview(iconView)

        let label = ROCUIFactory.makeLabel(arguments.message, style: .body)
        label.alignment = .left
        label.lineBreakMode = .byTruncatingTail
        row.addArrangedSubview(label)

        let spacer = NSView(frame: .zero)
        row.addArrangedSubview(spacer)
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        spacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        let spinner = NSProgressIndicator(frame: NSRect(x: 0, y: 0, width: 16, height: 16))
        spinner.style = .spinning
        spinner.controlSize = .small
        spinner.startAnimation(nil)
        row.addArrangedSubview(spinner)

        window.contentView = backdrop
        center(window: window)
        window.orderFrontRegardless()
        self.window = window

        if let parentPid = arguments.parentPid {
            startParentMonitor(parentPid: parentPid)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func center(window: NSWindow) {
        guard let screen = NSScreen.main ?? NSScreen.screens.first else {
            return
        }

        let frame = screen.visibleFrame
        let x = frame.midX - (window.frame.width / 2)
        let y = frame.maxY - 140
        window.setFrameOrigin(NSPoint(x: x, y: y))
    }

    private func startParentMonitor(parentPid: Int32) {
        parentMonitorTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard kill(parentPid, 0) == 0 else {
                self?.terminate()
                return
            }
        }
    }

    private func terminate() {
        parentMonitorTimer?.invalidate()
        parentMonitorTimer = nil
        NSApplication.shared.terminate(nil)
    }
}

enum HudError: Error {
    case invalidArguments
}
