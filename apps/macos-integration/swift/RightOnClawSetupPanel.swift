import AppKit
import Foundation

struct SetupPanelPayload: Codable {
    let title: String
    let headline: String
    let detail: String
    let recommendation: String
    let alternative: String
    let openClawActionLabel: String?
    let cancelActionLabel: String
    let errorMessage: String?
    let initialApiKey: String
    let initialBaseUrl: String
    let initialModel: String
}

struct SetupPanelResult: Codable {
    let outcome: String
    let apiKey: String?
    let baseUrl: String?
    let model: String?

    enum CodingKeys: String, CodingKey {
        case outcome
        case apiKey = "api_key"
        case baseUrl = "base_url"
        case model
    }
}

enum SetupPanelError: Error {
    case invalidArguments
}

private enum SetupPanelMode {
    case choice
    case apiForm
}

@main
struct RightOnClawSetupPanel {
    static func main() {
        do {
            let payload = try loadPayload()
            let app = NSApplication.shared
            app.setActivationPolicy(.accessory)

            let controller = SetupPanelController(payload: payload)
            controller.show()
            let result = controller.run()
            let encoded = try JSONEncoder().encode(result)
            print(String(decoding: encoded, as: UTF8.self))
        } catch {
            fputs("RightOnClawSetupPanel error: \(error)\n", stderr)
            exit(1)
        }
    }

    static func loadPayload() throws -> SetupPanelPayload {
        let arguments = CommandLine.arguments
        guard arguments.count >= 3, arguments[1] == "--payload" else {
            throw SetupPanelError.invalidArguments
        }

        let payloadPath = arguments[2]
        let payloadData = try Data(contentsOf: URL(fileURLWithPath: payloadPath))
        return try JSONDecoder().decode(SetupPanelPayload.self, from: payloadData)
    }
}

final class SetupPanelController: NSObject, NSWindowDelegate {
    private let payload: SetupPanelPayload
    private let window: NSWindow

    private let apiKeyField = NSSecureTextField(string: "")
    private let baseUrlField = NSTextField(string: "")
    private let modelField = NSTextField(string: "")

    private let choiceStack = NSStackView()
    private let formStack = NSStackView()
    private var currentMode: SetupPanelMode = .choice
    private var result = SetupPanelResult(outcome: "cancel", apiKey: nil, baseUrl: nil, model: nil)

    init(payload: SetupPanelPayload) {
        self.payload = payload
        self.window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 420),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        super.init()
        configureWindow()
    }

    func show() {
        NSApp.activate(ignoringOtherApps: true)
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
    }

    func run() -> SetupPanelResult {
        NSApp.runModal(for: window)
        return result
    }

    func windowWillClose(_ notification: Notification) {
        finish(outcome: "cancel")
    }

    private func configureWindow() {
        window.delegate = self
        let shell = ROCWindowChrome.install(
            on: window,
            rootSpacing: ROCSpacing.xxLarge,
            rootInsets: ROCLayout.windowInset,
            shellStyle: .standard
        )
        shell.backgroundView.material = .underWindowBackground
        let root = shell.rootStack

        let titleLabel = ROCUIFactory.makeLabel(payload.title, style: .hero)
        root.addArrangedSubview(titleLabel)

        root.addArrangedSubview(ROCUIFactory.makeLabel(payload.headline, style: .bodyStrong, wrapping: true))
        root.addArrangedSubview(ROCUIFactory.makeLabel(payload.detail, style: .meta, wrapping: true))

        if let errorMessage = payload.errorMessage, !errorMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let errorBox = ROCSurfaceView(style: .error)
            let errorLabel = ROCUIFactory.makeLabel(errorMessage, style: .meta, wrapping: true)
            errorLabel.textColor = ROCTheme.errorText
            errorBox.addSubview(errorLabel)
            errorLabel.rocPinEdges(to: errorBox, insets: NSEdgeInsets(top: ROCSpacing.large, left: ROCSpacing.large, bottom: ROCSpacing.large, right: ROCSpacing.large))
            root.addArrangedSubview(errorBox)
            errorBox.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true
        }

        configureChoiceStack()
        configureFormStack()

        root.addArrangedSubview(choiceStack)
        root.addArrangedSubview(formStack)
        choiceStack.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true
        formStack.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true

        setMode(.choice)
    }

    private func configureChoiceStack() {
        choiceStack.orientation = .vertical
        choiceStack.alignment = .leading
        choiceStack.spacing = ROCSpacing.xLarge
        choiceStack.translatesAutoresizingMaskIntoConstraints = false

        let recommendationCard = ROCSurfaceView(style: .secondary)
        choiceStack.addArrangedSubview(recommendationCard)
        recommendationCard.widthAnchor.constraint(equalTo: choiceStack.widthAnchor).isActive = true

        let recommendationStack = ROCUIFactory.stack(orientation: .vertical, alignment: .leading, spacing: ROCSpacing.large)
        recommendationCard.addSubview(recommendationStack)
        recommendationStack.rocPinEdges(to: recommendationCard, insets: ROCLayout.cardInset)
        recommendationStack.addArrangedSubview(ROCUIFactory.makeLabel(payload.recommendation, style: .body, wrapping: true))
        if let openClawActionLabel = payload.openClawActionLabel?.trimmingCharacters(in: .whitespacesAndNewlines), !openClawActionLabel.isEmpty {
            recommendationStack.addArrangedSubview(
                ROCUIFactory.makeButton(title: openClawActionLabel, style: .primary, target: self, action: #selector(installOpenClawPressed))
            )
        }

        let alternativeCard = ROCSurfaceView(style: .reading)
        choiceStack.addArrangedSubview(alternativeCard)
        alternativeCard.widthAnchor.constraint(equalTo: choiceStack.widthAnchor).isActive = true

        let alternativeStack = ROCUIFactory.stack(orientation: .vertical, alignment: .leading, spacing: ROCSpacing.large)
        alternativeCard.addSubview(alternativeStack)
        alternativeStack.rocPinEdges(to: alternativeCard, insets: ROCLayout.cardInset)
        alternativeStack.addArrangedSubview(ROCUIFactory.makeLabel(payload.alternative, style: .meta, wrapping: true))
        alternativeStack.addArrangedSubview(ROCUIFactory.makeButton(title: "Use API Key", style: .secondary, target: self, action: #selector(useApiKeyPressed)))
        alternativeStack.addArrangedSubview(makeLinkButton(title: payload.cancelActionLabel, action: #selector(skipPressed)))
    }

    private func configureFormStack() {
        formStack.orientation = .vertical
        formStack.alignment = .leading
        formStack.spacing = ROCSpacing.xLarge
        formStack.translatesAutoresizingMaskIntoConstraints = false

        ROCUIFactory.configureTextField(apiKeyField, placeholder: "sk-…")
        ROCUIFactory.configureTextField(baseUrlField, placeholder: "https://api.openai.com/v1")
        ROCUIFactory.configureTextField(modelField, placeholder: "gpt-5-mini")

        apiKeyField.stringValue = payload.initialApiKey
        baseUrlField.stringValue = payload.initialBaseUrl
        modelField.stringValue = payload.initialModel

        let formCard = ROCSurfaceView(style: .secondary)
        formStack.addArrangedSubview(formCard)
        formCard.widthAnchor.constraint(equalTo: formStack.widthAnchor).isActive = true

        let formCardStack = ROCUIFactory.stack(orientation: .vertical, alignment: .leading, spacing: ROCSpacing.xLarge)
        formCard.addSubview(formCardStack)
        formCardStack.rocPinEdges(to: formCard, insets: ROCLayout.cardInset)
        formCardStack.addArrangedSubview(makeFieldBlock(title: "API Key", field: apiKeyField))
        formCardStack.addArrangedSubview(makeFieldBlock(title: "Base URL (optional)", field: baseUrlField))
        formCardStack.addArrangedSubview(makeFieldBlock(title: "Model (optional)", field: modelField))

        let footer = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.medium)
        formCardStack.addArrangedSubview(footer)

        footer.addArrangedSubview(ROCUIFactory.makeButton(title: "Back", style: .secondary, target: self, action: #selector(backPressed)))
        footer.addArrangedSubview(ROCUIFactory.makeButton(title: "Save", style: .primary, target: self, action: #selector(savePressed)))
    }

    private func setMode(_ mode: SetupPanelMode) {
        currentMode = mode
        choiceStack.isHidden = mode != .choice
        formStack.isHidden = mode != .apiForm

        if mode == .apiForm {
            window.makeFirstResponder(apiKeyField)
        }
    }

    private func makeFieldBlock(title: String, field: NSTextField) -> NSView {
        let stack = ROCUIFactory.stack(orientation: .vertical, alignment: .leading, spacing: ROCSpacing.medium)

        let label = ROCUIFactory.makeLabel(title, style: .section)
        stack.addArrangedSubview(label)
        let fieldContainer = ROCUIFactory.wrapInputField(field)
        stack.addArrangedSubview(fieldContainer)

        fieldContainer.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true

        return stack
    }

    private func makeLinkButton(title: String, action: Selector) -> NSButton {
        let button = ROCUIFactory.makeButton(title: title, style: .ghost, target: self, action: action, controlSize: .small)
        button.alignment = .left
        return button
    }

    private func finish(outcome: String, apiKey: String? = nil, baseUrl: String? = nil, model: String? = nil) {
        result = SetupPanelResult(outcome: outcome, apiKey: apiKey, baseUrl: baseUrl, model: model)
        if window.isVisible {
            window.orderOut(nil)
        }
        NSApp.stopModal()
    }

    @objc private func installOpenClawPressed() {
        finish(outcome: "install_openclaw")
    }

    @objc private func useApiKeyPressed() {
        setMode(.apiForm)
    }

    @objc private func skipPressed() {
        finish(outcome: "skip")
    }

    @objc private func backPressed() {
        setMode(.choice)
    }

    @objc private func savePressed() {
        finish(
            outcome: "configure_api_key",
            apiKey: normalizedValue(apiKeyField.stringValue),
            baseUrl: normalizedValue(baseUrlField.stringValue),
            model: normalizedValue(modelField.stringValue)
        )
    }

    private func normalizedValue(_ value: String) -> String? {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : normalized
    }
}
