import AppKit
import Foundation

struct AskPanelSuggestion: Codable {
    let title: String
    let prompt: String
    let preset: String
}

struct AskPanelPayload: Codable {
    let title: String
    let summary: String
    let detail: String
    let initialPrompt: String
    let previewImagePath: String?
    let suggestions: [AskPanelSuggestion]
}

struct AskPanelInboundCommand: Codable {
    let type: String
    let state: String?
    let body: String?
    let copyText: String?
    let openUrl: String?
    let tone: String?
}

struct AskPanelOutboundEvent: Codable {
    let type: String
    let prompt: String?
    let preset: String?
}

enum AskPanelError: Error {
    case invalidArguments
}

enum AskPanelStatusState: String {
    case ready
    case running
    case error
}

final class AskPanelStatusView: NSView {
    private let surface = ROCSurfaceView(style: .secondary, cornerRadius: ROCRadius.pill)
    private let label = ROCUIFactory.makeLabel("Ready", style: .meta)
    private let dotView = NSView()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        translatesAutoresizingMaskIntoConstraints = false

        addSubview(surface)
        surface.rocPinEdges(to: self)

        let row = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.small)
        surface.addSubview(row)
        row.rocPinEdges(
            to: surface,
            insets: NSEdgeInsets(top: 4, left: 10, bottom: 4, right: 10)
        )

        dotView.translatesAutoresizingMaskIntoConstraints = false
        dotView.wantsLayer = true
        dotView.layer?.cornerRadius = 3.5
        row.addArrangedSubview(dotView)
        dotView.widthAnchor.constraint(equalToConstant: 7).isActive = true
        dotView.heightAnchor.constraint(equalToConstant: 7).isActive = true

        row.addArrangedSubview(label)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    func setState(_ state: AskPanelStatusState) {
        let text: String
        let tone: ROCBadgeTone

        switch state {
        case .ready:
            text = "Ready"
            tone = .neutral
        case .running:
            text = "Running"
            tone = .accent
        case .error:
            text = "Error"
            tone = .error
        }

        label.attributedStringValue = ROCUIFactory.makeAttributedText(
            text,
            style: .meta,
            color: tone == .accent ? ROCTheme.accentText : tone == .error ? ROCTheme.errorText : ROCTheme.textSecondary,
            wrapping: false
        )

        switch tone {
        case .accent:
            surface.surfaceStyle = .accent
            dotView.layer?.backgroundColor = ROCTheme.accentText.withAlphaComponent(0.88).rocCGColor(with: effectiveAppearance)
        case .neutral:
            surface.surfaceStyle = .secondary
            dotView.layer?.backgroundColor = ROCTheme.textMuted.withAlphaComponent(0.72).rocCGColor(with: effectiveAppearance)
        case .error:
            surface.surfaceStyle = .error
            dotView.layer?.backgroundColor = ROCTheme.errorText.withAlphaComponent(0.84).rocCGColor(with: effectiveAppearance)
        }
    }
}

@main
struct RightOnClawAskPanel {
    static func main() {
        do {
            let payload = try loadPayload()
            let app = NSApplication.shared
            app.setActivationPolicy(.accessory)

            let controller = AskPanelController(payload: payload)
            controller.show()
            app.run()
        } catch {
            fputs("RightOnClawAskPanel error: \(error)\n", stderr)
            exit(1)
        }
    }

    static func loadPayload() throws -> AskPanelPayload {
        let arguments = CommandLine.arguments
        guard arguments.count >= 3, arguments[1] == "--payload" else {
            throw AskPanelError.invalidArguments
        }

        let payloadPath = arguments[2]
        let payloadData = try Data(contentsOf: URL(fileURLWithPath: payloadPath))
        return try JSONDecoder().decode(AskPanelPayload.self, from: payloadData)
    }
}

final class AskPanelController: NSObject, NSWindowDelegate, ROCComposerViewDelegate {
    private let payload: AskPanelPayload
    private let window: NSWindow
    private let contextLineView = ROCContextLineView()
    private let suggestionsView: ROCSuggestionListView
    private let resultView = ROCResultView()
    private let composerView = ROCComposerView()
    private let windowWidth: CGFloat = 640
    private let collapsedWindowHeight: CGFloat = 212
    private let expandedWindowHeight: CGFloat = 356
    private var keyMonitor: Any?
    private var closeRequested = false

    private var commandBuffer = ""
    private var pendingPreset = "freeform"
    private var pendingSuggestedPrompt: String?

    init(payload: AskPanelPayload) {
        self.payload = payload
        self.suggestionsView = ROCSuggestionListView(
            suggestions: payload.suggestions.map { ($0.title, $0.prompt, $0.preset) },
            target: nil,
            action: nil
        )
        self.window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: windowWidth, height: collapsedWindowHeight),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        super.init()
        self.suggestionsView.suggestionRows.forEach { row in
            row.button.target = self
            row.button.action = #selector(suggestionPressed)
        }
        configureWindow()
        startReadingCommands()
    }

    func show() {
        NSApp.activate(ignoringOtherApps: true)
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        window.initialFirstResponder = composerView.textView
        DispatchQueue.main.async { [weak self] in
            self?.composerView.focus()
        }
    }

    func windowDidBecomeKey(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            self?.composerView.focus()
        }
    }

    func windowDidBecomeMain(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            self?.composerView.focus()
        }
    }

    func windowDidResignKey(_ notification: Notification) {
        requestClose()
    }

    func windowWillClose(_ notification: Notification) {
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
            self.keyMonitor = nil
        }
        sendEvent(type: "closed")
        FileHandle.standardInput.readabilityHandler = nil
        NSApp.terminate(nil)
    }

    func composerViewDidSubmit(_ composerView: ROCComposerView) {
        let prompt = composerView.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, !composerView.isRunning else {
            NSSound.beep()
            return
        }

        let submitPreset = pendingPreset
        pendingPreset = "freeform"
        pendingSuggestedPrompt = nil
        suggestionsView.isHidden = true
        resultView.isHidden = true
        composerView.text = ""
        composerView.placeholder = "Ask a follow-up..."
        composerView.isRunning = true

        sendEvent(
            type: "submit",
            prompt: prompt,
            preset: submitPreset
        )
    }

    func composerViewTextDidChange(_ composerView: ROCComposerView) {
        let currentText = composerView.text
        if let pendingSuggestedPrompt, currentText != pendingSuggestedPrompt {
            self.pendingSuggestedPrompt = nil
            pendingPreset = "freeform"
        }
    }

    @objc private func suggestionPressed(_ sender: NSButton) {
        guard let rawValue = sender.identifier?.rawValue else {
            return
        }

        let parts = rawValue.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2 else {
            return
        }

        let preset = String(parts[0])
        let prompt = String(parts[1])
        pendingPreset = preset
        pendingSuggestedPrompt = prompt
        composerView.text = prompt
        composerView.focus()
    }

    private func configureWindow() {
        window.delegate = self
        window.contentMinSize = NSSize(width: windowWidth, height: 140)
        window.contentMaxSize = NSSize(width: windowWidth, height: 420)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.isMovableByWindowBackground = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.standardWindowButton(.closeButton)?.isHidden = true
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true

        let contentView = NSView()
        contentView.translatesAutoresizingMaskIntoConstraints = false
        contentView.wantsLayer = true
        contentView.layer?.backgroundColor = NSColor.clear.cgColor
        window.contentView = contentView

        let root = ROCUIFactory.stack(orientation: .vertical, alignment: .leading, spacing: 0)
        contentView.addSubview(root)
        root.rocPinEdges(to: contentView, insets: NSEdgeInsets(top: 10, left: 24, bottom: 16, right: 24))
        root.detachesHiddenViews = true
        root.alignment = .leading
        root.spacing = 0

        contextLineView.configure(summary: payload.summary, detail: payload.detail, previewImagePath: payload.previewImagePath)
        root.addArrangedSubview(contextLineView)
        contextLineView.widthAnchor.constraint(lessThanOrEqualTo: root.widthAnchor).isActive = true
        contextLineView.widthAnchor.constraint(lessThanOrEqualToConstant: 520).isActive = true
        root.setCustomSpacing(8, after: contextLineView)

        composerView.delegate = self
        composerView.text = payload.initialPrompt
        composerView.placeholder = payload.initialPrompt.isEmpty ? placeholderText() : "Ask a follow-up..."
        root.addArrangedSubview(composerView)
        composerView.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true
        root.setCustomSpacing(12, after: composerView)

        root.addArrangedSubview(suggestionsView)
        suggestionsView.widthAnchor.constraint(lessThanOrEqualTo: root.widthAnchor).isActive = true
        root.setCustomSpacing(16, after: suggestionsView)

        root.addArrangedSubview(resultView)
        resultView.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true
        resultView.isHidden = true

        installKeyboardSubmitMonitor()
    }

    private func startReadingCommands() {
        let inputHandle = FileHandle.standardInput
        inputHandle.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty {
                return
            }

            let chunk = String(decoding: data, as: UTF8.self)
            DispatchQueue.main.async {
                self?.appendCommandChunk(chunk)
            }
        }
    }

    private func appendCommandChunk(_ chunk: String) {
        commandBuffer.append(chunk)

        while let newlineRange = commandBuffer.range(of: "\n") {
            let line = String(commandBuffer[..<newlineRange.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
            commandBuffer.removeSubrange(..<newlineRange.upperBound)

            guard !line.isEmpty else {
                continue
            }

            handleCommandLine(line)
        }
    }

    private func handleCommandLine(_ line: String) {
        guard let data = line.data(using: .utf8),
              let command = try? JSONDecoder().decode(AskPanelInboundCommand.self, from: data)
        else {
            return
        }

        switch command.type {
        case "status":
            if let state = command.state.flatMap(AskPanelStatusState.init(rawValue:)) {
                composerView.isRunning = state == .running
                if state == .running && resultView.isHidden {
                    showResultView()
                    resultView.setBody("", tone: .assistant)
                }
            }
        case "assistant_update":
            showResultView()
            resultView.setBody(command.body ?? "", tone: command.tone == "error" ? .error : .assistant)
        case "assistant_complete":
            showResultView()
            resultView.setBody(
                command.body ?? "Done.",
                tone: command.tone == "error" ? .error : .assistant,
                copyText: command.copyText,
                openURL: command.openUrl
            )
            composerView.isRunning = false
        default:
            break
        }
    }

    private func sendEvent(type: String, prompt: String? = nil, preset: String? = nil) {
        let event = AskPanelOutboundEvent(type: type, prompt: prompt, preset: preset)
        guard let data = try? JSONEncoder().encode(event),
              let output = String(data: data, encoding: .utf8)
        else {
            return
        }

        print(output)
        fflush(stdout)
    }

    private func installKeyboardSubmitMonitor() {
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else {
                return event
            }

            if event.keyCode == 53 {
                self.requestClose()
                return nil
            }

            let isReturnKey = event.keyCode == 36 || event.keyCode == 76
            let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            let isShiftReturn = modifiers.contains(.shift)

            guard isReturnKey,
                  !isShiftReturn,
                  self.window.firstResponder === self.composerView.textView
            else {
                return event
            }

            return self.composerView.submitCurrentPromptIfPossible() ? nil : event
        }
    }

    private func showResultView() {
        guard resultView.isHidden else {
            return
        }

        resultView.isHidden = false
        window.setContentSize(NSSize(width: windowWidth, height: expandedWindowHeight))
    }

    private func requestClose() {
        guard !closeRequested else {
            return
        }

        closeRequested = true
        window.performClose(nil)
    }

    private func placeholderText() -> String {
        if payload.previewImagePath != nil {
            return "Ask anything about this screenshot…"
        }

        let summary = payload.summary.lowercased()
        if summary.contains("folder") {
            return "Ask anything about this folder…"
        }

        if summary.contains("file") || payload.detail.contains(".") {
            return "Ask anything about this file…"
        }

        if summary.contains("text") || summary.contains("selection") {
            return "Ask anything about this selection…"
        }

        return "Ask anything…"
    }

}
