import AppKit
import Foundation

struct StreamPopupState: Codable {
    let title: String
    let body: String
    let kind: String
    let detail: String?
    let copyText: String?
    let openUrl: String?
    let status: String
}

enum StreamPopupError: Error {
    case invalidArguments
}

@main
struct RightOnClawStreamPopup {
    static func main() {
        do {
            let payloadPath = try loadPayloadPath()
            let app = NSApplication.shared
            app.setActivationPolicy(.accessory)
            app.activate(ignoringOtherApps: true)

            let controller = StreamPopupController(payloadPath: payloadPath)
            controller.show()
            controller.run()
        } catch {
            fputs("RightOnClawStreamPopup error: \(error)\n", stderr)
            exit(1)
        }
    }

    static func loadPayloadPath() throws -> String {
        let arguments = CommandLine.arguments
        guard arguments.count >= 3, arguments[1] == "--payload" else {
            throw StreamPopupError.invalidArguments
        }

        return arguments[2]
    }
}

final class StreamPopupController: NSObject, NSWindowDelegate {
    private let payloadPath: String
    private let window: NSWindow
    private let titleLabel = ROCUIFactory.makeLabel("RightOnClaw", style: .title)
    private let detailLabel = ROCUIFactory.makeLabel("Preparing request…", style: .meta, wrapping: true)
    private let bodyTextView = NSTextView(frame: .zero)
    private let statusBadgeLabel = NSTextField(labelWithString: "Working")
    private lazy var statusBadge = makeStatusBadge()
    private let copyButton = ROCUIFactory.makeButton(title: "Copy", style: .ghost, target: nil, action: nil, controlSize: .small)
    private let openButton = ROCUIFactory.makeButton(title: "Open in Claw", style: .secondary, target: nil, action: nil, controlSize: .small)
    private let doneButton = ROCUIFactory.makeButton(title: "Working…", style: .primary, target: nil, action: nil)
    private var timer: Timer?
    private var currentState: StreamPopupState?

    init(payloadPath: String) {
        self.payloadPath = payloadPath
        self.window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 360),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        super.init()
        configureWindow()
        loadState()
        startPolling()
    }

    func show() {
        window.center()
        window.makeKeyAndOrderFront(nil)
    }

    func run() {
        NSApp.runModal(for: window)
    }

    func windowWillClose(_ notification: Notification) {
        finish()
    }

    private func configureWindow() {
        window.delegate = self
        let shell = ROCWindowChrome.install(
            on: window,
            rootSpacing: ROCSpacing.xLarge,
            rootInsets: NSEdgeInsets(top: ROCSpacing.xxLarge, left: ROCSpacing.xLarge, bottom: ROCSpacing.xLarge, right: ROCSpacing.xLarge),
            shellStyle: .compact
        )
        shell.backgroundView.material = .popover
        let root = shell.rootStack

        let headerRow = ROCUIFactory.stack(orientation: .horizontal, alignment: .firstBaseline, spacing: ROCSpacing.medium)
        root.addArrangedSubview(headerRow)
        headerRow.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true
        headerRow.addArrangedSubview(titleLabel)

        let spacer = NSView(frame: .zero)
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        spacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        headerRow.addArrangedSubview(spacer)
        headerRow.addArrangedSubview(statusBadge)

        root.addArrangedSubview(detailLabel)
        detailLabel.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true

        let readingSurface = ROCSurfaceView(style: .reading)
        root.addArrangedSubview(readingSurface)
        readingSurface.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true

        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false
        scrollView.scrollerStyle = .overlay
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        readingSurface.addSubview(scrollView)
        scrollView.rocPinEdges(to: readingSurface)

        ROCUIFactory.configureStreamingTextView(bodyTextView)
        bodyTextView.string = ""
        scrollView.documentView = bodyTextView

        NSLayoutConstraint.activate([
            readingSurface.heightAnchor.constraint(equalToConstant: 268)
        ])

        let footer = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.small)
        root.addArrangedSubview(footer)

        let footerSpacer = NSView(frame: .zero)
        footer.addArrangedSubview(footerSpacer)
        footerSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        footerSpacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        copyButton.target = self
        copyButton.action = #selector(copyPressed)
        copyButton.isHidden = true
        footer.addArrangedSubview(copyButton)

        openButton.target = self
        openButton.action = #selector(openPressed)
        openButton.isHidden = true
        footer.addArrangedSubview(openButton)

        doneButton.target = self
        doneButton.action = #selector(donePressed)
        doneButton.isEnabled = false
        footer.addArrangedSubview(doneButton)
    }

    private func startPolling() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.loadState()
        }
    }

    private func loadState() {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: payloadPath)),
              let state = try? JSONDecoder().decode(StreamPopupState.self, from: data) else {
            return
        }

        currentState = state
        titleLabel.stringValue = state.title
        detailLabel.stringValue = state.detail ?? ""
        bodyTextView.textStorage?.setAttributedString(ROCUIFactory.makeAttributedText(state.body, style: .code))
        bodyTextView.scrollToEndOfDocument(nil)
        statusBadgeLabel.stringValue = state.status == "running" ? "Working" : "Ready"
        statusBadge.surfaceStyle = state.status == "running" ? .accent : .secondary
        statusBadgeLabel.textColor = state.status == "running" ? ROCTheme.accentText : ROCTheme.textSecondary

        copyButton.isHidden = (state.copyText ?? "").isEmpty
        openButton.isHidden = (state.openUrl ?? "").isEmpty

        if state.status == "running" {
            doneButton.isEnabled = false
            doneButton.title = "Working…"
        } else {
            doneButton.isEnabled = true
            doneButton.title = "Done"
        }
    }

    private func makeStatusBadge() -> ROCSurfaceView {
        let badge = ROCSurfaceView(style: .accent, cornerRadius: 11)
        statusBadgeLabel.font = ROCTheme.font(for: .section)
        statusBadgeLabel.textColor = ROCTheme.accentText
        badge.addSubview(statusBadgeLabel)
        statusBadgeLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            statusBadgeLabel.leadingAnchor.constraint(equalTo: badge.leadingAnchor, constant: 10),
            statusBadgeLabel.trailingAnchor.constraint(equalTo: badge.trailingAnchor, constant: -10),
            statusBadgeLabel.topAnchor.constraint(equalTo: badge.topAnchor, constant: 6),
            statusBadgeLabel.bottomAnchor.constraint(equalTo: badge.bottomAnchor, constant: -6)
        ])
        return badge
    }

    private func finish() {
        timer?.invalidate()
        timer = nil
        if window.isVisible {
            window.orderOut(nil)
        }
        NSApp.stopModal()
        NSApp.terminate(nil)
    }

    @objc private func copyPressed() {
        guard let text = currentState?.copyText, !text.isEmpty else {
            return
        }

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    @objc private func openPressed() {
        guard let openUrl = currentState?.openUrl,
              let url = URL(string: openUrl) else {
            return
        }

        NSWorkspace.shared.open(url)
    }

    @objc private func donePressed() {
        finish()
    }
}
