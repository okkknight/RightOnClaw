import AppKit
import Foundation

struct PopupPayload: Codable {
    let title: String
    let body: String
    let kind: String
    let copyText: String?
    let openUrl: String?
    let detail: String?
    let allowReplaceSelection: Bool?
}

enum PopupAction: String {
    case close
    case copy
    case open
    case replaceSelection = "replace_selection"
}

@main
struct RightOnClawPopup {
    static func main() {
        do {
            let payload = try loadPayload()
            let action = showWindow(payload: payload)
            print(action.rawValue)
        } catch {
            fputs("RightOnClawPopup error: \(error)\n", stderr)
            exit(1)
        }
    }

    static func loadPayload() throws -> PopupPayload {
        let arguments = CommandLine.arguments
        guard arguments.count >= 3, arguments[1] == "--payload" else {
            throw PopupError.invalidArguments
        }

        let payloadPath = arguments[2]
        let payloadData = try Data(contentsOf: URL(fileURLWithPath: payloadPath))
        return try JSONDecoder().decode(PopupPayload.self, from: payloadData)
    }

    static func showWindow(payload: PopupPayload) -> PopupAction {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        app.activate(ignoringOtherApps: true)

        let controller = PopupController(payload: payload)
        controller.show()
        return controller.run()
    }
}

final class PopupController: NSObject {
    private static let contentWidth: CGFloat = 572
    private static let bodyInset: CGFloat = 22
    private static let minimumBodyHeight: CGFloat = 88
    private static let maximumBodyHeight: CGFloat = 320
    private static let minimumWindowHeight: CGFloat = 236
    private static let maximumWindowHeight: CGFloat = 500

    private let payload: PopupPayload
    private let window: NSWindow
    private var result: PopupAction = .close

    init(payload: PopupPayload) {
        self.payload = payload
        self.window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: Self.contentWidth, height: 280),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        super.init()
        configureWindow()
    }

    func show() {
        window.center()
        window.makeKeyAndOrderFront(nil)
    }

    func run() -> PopupAction {
        NSApp.runModal(for: window)
        return result
    }

    private func configureWindow() {
        window.title = payload.title
        let shell = ROCWindowChrome.install(
            on: window,
            rootSpacing: ROCSpacing.large,
            rootInsets: NSEdgeInsets(top: ROCSpacing.xxLarge, left: ROCSpacing.xLarge, bottom: ROCSpacing.xLarge, right: ROCSpacing.xLarge),
            shellStyle: .compact,
            hideTrafficLights: true
        )
        shell.backgroundView.material = .popover
        let root = shell.rootStack

        let titleLabel = ROCUIFactory.makeLabel(payload.title, style: .title, alignment: .center)
        root.addArrangedSubview(titleLabel)
        titleLabel.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true

        if let detail = payload.detail, !detail.isEmpty {
            let detailLabel = ROCUIFactory.makeLabel(detail, style: .meta, wrapping: true, alignment: .center)
            root.addArrangedSubview(detailLabel)
            detailLabel.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true
        }

        let bodyWidth = Self.contentWidth - (ROCSpacing.xLarge * 2) - (Self.bodyInset * 2)
        let measuredBodyHeight = measureBodyHeight(for: payload.body, width: bodyWidth)
        let scrollHeight = min(max(measuredBodyHeight + (Self.bodyInset * 2), Self.minimumBodyHeight), Self.maximumBodyHeight)

        let readingSurface = ROCSurfaceView(style: .reading)
        root.addArrangedSubview(readingSurface)
        readingSurface.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true

        let scrollView = NSScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.scrollerStyle = .overlay
        readingSurface.addSubview(scrollView)
        scrollView.rocPinEdges(to: readingSurface)

        let bodyContainer = NSView(frame: NSRect(x: 0, y: 0, width: bodyWidth + (Self.bodyInset * 2), height: measuredBodyHeight + (Self.bodyInset * 2)))
        let bodyLabel = NSTextField(wrappingLabelWithString: payload.body)
        bodyLabel.frame = NSRect(x: Self.bodyInset, y: Self.bodyInset, width: bodyWidth, height: measuredBodyHeight)
        bodyLabel.font = ROCTheme.font(for: .body)
        bodyLabel.textColor = ROCTheme.textPrimary
        bodyLabel.maximumNumberOfLines = 0
        bodyLabel.lineBreakMode = .byWordWrapping
        bodyLabel.alignment = .left
        bodyLabel.preferredMaxLayoutWidth = bodyWidth
        bodyLabel.attributedStringValue = ROCUIFactory.makeAttributedText(payload.body, style: .body)
        bodyContainer.addSubview(bodyLabel)
        scrollView.documentView = bodyContainer

        NSLayoutConstraint.activate([
            readingSurface.heightAnchor.constraint(equalToConstant: scrollHeight)
        ])

        let separator = ROCUIFactory.makeSeparator()
        root.addArrangedSubview(separator)
        separator.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true

        let buttonRow = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.small)
        root.addArrangedSubview(buttonRow)

        let spacer = NSView(frame: .zero)
        spacer.translatesAutoresizingMaskIntoConstraints = false
        buttonRow.addArrangedSubview(spacer)

        if payload.copyText != nil {
            buttonRow.addArrangedSubview(ROCUIFactory.makeButton(title: "Copy", style: .ghost, target: self, action: #selector(copyPressed), controlSize: .small))
        }

        if payload.openUrl != nil {
            buttonRow.addArrangedSubview(ROCUIFactory.makeButton(title: "Open in Claw", style: .secondary, target: self, action: #selector(openPressed), controlSize: .small))
        }

        if payload.allowReplaceSelection == true {
            let replaceButton = ROCUIFactory.makeButton(title: "Replace Selection", style: .primary, target: self, action: #selector(replacePressed))
            replaceButton.keyEquivalent = "\r"
            buttonRow.addArrangedSubview(replaceButton)
        }

        let closeButton = ROCUIFactory.makeButton(
            title: payload.allowReplaceSelection == true ? "Cancel" : "Done",
            style: payload.allowReplaceSelection == true ? .secondary : .primary,
            target: self,
            action: #selector(closePressed)
        )
        if payload.allowReplaceSelection != true {
            closeButton.keyEquivalent = "\r"
        }
        buttonRow.addArrangedSubview(closeButton)

        shell.canvasView.layoutSubtreeIfNeeded()
        let targetHeight = min(max(root.fittingSize.height + (ROCSpacing.xLarge * 2), Self.minimumWindowHeight), Self.maximumWindowHeight)
        window.setContentSize(NSSize(width: Self.contentWidth, height: targetHeight))
    }

    private func finish(_ action: PopupAction) {
        result = action
        window.orderOut(nil)
        NSApp.stopModal()
    }

    @objc private func closePressed() {
        finish(.close)
    }

    @objc private func copyPressed() {
        if let copyText = payload.copyText {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(copyText, forType: .string)
        }

        finish(.copy)
    }

    @objc private func openPressed() {
        if let openUrl = payload.openUrl, let url = URL(string: openUrl) {
            NSWorkspace.shared.open(url)
        }

        finish(.open)
    }

    @objc private func replacePressed() {
        finish(.replaceSelection)
    }

    private func measureBodyHeight(for body: String, width: CGFloat) -> CGFloat {
        let attributes = ROCTheme.textAttributes(for: .body)
        let boundingRect = NSAttributedString(string: body, attributes: attributes).boundingRect(
            with: NSSize(width: width, height: CGFloat.greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading]
        )
        return ceil(max(72, boundingRect.height))
    }
}

enum PopupError: Error {
    case invalidArguments
}
