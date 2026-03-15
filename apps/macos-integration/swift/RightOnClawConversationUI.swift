import AppKit
import Foundation

protocol ROCComposerViewDelegate: AnyObject {
    func composerViewDidSubmit(_ composerView: ROCComposerView)
    func composerViewTextDidChange(_ composerView: ROCComposerView)
}

final class ROCClickThroughLabel: NSTextField {
    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }
}

final class ROCComposerTextView: NSTextView {
    weak var submitDelegate: ROCComposerViewDelegate?
    weak var owner: ROCComposerView?

    override var acceptsFirstResponder: Bool {
        true
    }

    override func becomeFirstResponder() -> Bool {
        let accepted = super.becomeFirstResponder()
        if accepted {
            setSelectedRange(NSRange(location: string.count, length: 0))
        }
        return accepted
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        super.mouseDown(with: event)
    }

    override func keyDown(with event: NSEvent) {
        let isReturnKey = event.keyCode == 36 || event.keyCode == 76
        let isShiftReturn = event.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.shift)

        if isReturnKey && !isShiftReturn && submitCurrentPromptIfPossible() {
            return
        }

        super.keyDown(with: event)
    }

    override func doCommand(by commandSelector: Selector) {
        let isSubmitCommand =
            commandSelector == #selector(insertNewline(_:)) ||
            commandSelector == #selector(insertNewlineIgnoringFieldEditor(_:))
        let isShiftReturn = NSApp.currentEvent?.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.shift) ?? false

        if isSubmitCommand && !isShiftReturn && submitCurrentPromptIfPossible() {
            return
        }

        super.doCommand(by: commandSelector)
    }

    private func submitCurrentPromptIfPossible() -> Bool {
        guard !hasMarkedText(), let owner else {
            return false
        }

        return owner.submitCurrentPromptIfPossible()
    }
}

final class ROCComposerView: NSView, NSTextViewDelegate {
    private static let minimumEditorHeight: CGFloat = 30
    private static let maximumEditorHeight: CGFloat = 30
    private static let thinkingFrames = ["Thinking", "Thinking.", "Thinking..", "Thinking..."]

    private let fieldSurface = ROCSurfaceView(style: .commandInput, cornerRadius: 16)
    private let fieldInnerStroke = NSView()
    private let fieldTopGlow = NSView()
    private let scrollView = NSScrollView()
    private let placeholderLabel = ROCClickThroughLabel(labelWithString: "")
    private let submitHintLabel = ROCClickThroughLabel(labelWithString: "")
    private var scrollHeightConstraint: NSLayoutConstraint?
    private var configuredPlaceholder = ""
    private var thinkingTimer: Timer?
    private var thinkingFrameIndex = 0
    let textView: ROCComposerTextView

    weak var delegate: ROCComposerViewDelegate? {
        didSet {
            textView.submitDelegate = delegate
        }
    }

    override init(frame frameRect: NSRect) {
        self.textView = ROCComposerView.makeTextView()
        super.init(frame: frameRect)
        translatesAutoresizingMaskIntoConstraints = false
        build()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    var text: String {
        get { textView.string }
        set {
            textView.string = newValue
            updatePlaceholderPresentation()
        }
    }

    var placeholder: String {
        get { configuredPlaceholder }
        set {
            configuredPlaceholder = newValue
            updatePlaceholderPresentation()
        }
    }

    var isRunning: Bool = false {
        didSet {
            textView.isEditable = !isRunning
            applyRunningState()
        }
    }

    func focus() {
        guard let window else {
            return
        }

        if window.firstResponder !== textView {
            _ = window.makeFirstResponder(nil)
            _ = window.makeFirstResponder(textView)
        }
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if fieldSurface.frame.contains(point) {
            focus()
            return
        }

        super.mouseDown(with: event)
    }

    override func layout() {
        super.layout()
        updateTextViewLayout()
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        updateInputChrome()
    }

    private func build() {
        addSubview(fieldSurface)
        fieldSurface.rocPinEdges(to: self)

        fieldInnerStroke.translatesAutoresizingMaskIntoConstraints = false
        fieldInnerStroke.wantsLayer = true
        fieldSurface.addSubview(fieldInnerStroke)
        NSLayoutConstraint.activate([
            fieldInnerStroke.leadingAnchor.constraint(equalTo: fieldSurface.leadingAnchor, constant: 1),
            fieldInnerStroke.trailingAnchor.constraint(equalTo: fieldSurface.trailingAnchor, constant: -1),
            fieldInnerStroke.topAnchor.constraint(equalTo: fieldSurface.topAnchor, constant: 1),
            fieldInnerStroke.bottomAnchor.constraint(equalTo: fieldSurface.bottomAnchor, constant: -1)
        ])

        fieldTopGlow.translatesAutoresizingMaskIntoConstraints = false
        fieldTopGlow.wantsLayer = true
        fieldSurface.addSubview(fieldTopGlow)
        NSLayoutConstraint.activate([
            fieldTopGlow.leadingAnchor.constraint(equalTo: fieldSurface.leadingAnchor, constant: 12),
            fieldTopGlow.trailingAnchor.constraint(equalTo: fieldSurface.trailingAnchor, constant: -12),
            fieldTopGlow.topAnchor.constraint(equalTo: fieldSurface.topAnchor, constant: 1),
            fieldTopGlow.heightAnchor.constraint(equalToConstant: 1)
        ])

        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        scrollView.borderType = .noBorder
        scrollView.autohidesScrollers = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.contentView.postsBoundsChangedNotifications = true
        fieldSurface.addSubview(scrollView)
        scrollView.rocPinEdges(to: fieldSurface, insets: NSEdgeInsets(top: 13, left: 16, bottom: 13, right: 88))

        textView.delegate = self
        textView.owner = self
        scrollView.documentView = textView
        scrollHeightConstraint = scrollView.heightAnchor.constraint(equalToConstant: Self.minimumEditorHeight)
        scrollHeightConstraint?.isActive = true

        placeholderLabel.attributedStringValue = ROCUIFactory.makeAttributedText(
            "Ask anything about this selection...",
            style: .body,
            color: ROCTheme.inputPlaceholder
        )
        placeholderLabel.textColor = ROCTheme.inputPlaceholder
        placeholderLabel.isSelectable = false
        placeholderLabel.isEditable = false
        placeholderLabel.isBordered = false
        placeholderLabel.drawsBackground = false
        placeholderLabel.backgroundColor = .clear
        fieldSurface.addSubview(placeholderLabel)
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            placeholderLabel.leadingAnchor.constraint(equalTo: fieldSurface.leadingAnchor, constant: 16),
            placeholderLabel.centerYAnchor.constraint(equalTo: fieldSurface.centerYAnchor)
        ])

        submitHintLabel.attributedStringValue = ROCUIFactory.makeAttributedText(
            "↵ Ask",
            style: .meta,
            color: ROCTheme.commandHintText,
            wrapping: false
        )
        submitHintLabel.textColor = ROCTheme.commandHintText
        submitHintLabel.isSelectable = false
        submitHintLabel.isEditable = false
        submitHintLabel.isBordered = false
        submitHintLabel.drawsBackground = false
        submitHintLabel.backgroundColor = .clear
        fieldSurface.addSubview(submitHintLabel)
        submitHintLabel.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            submitHintLabel.trailingAnchor.constraint(equalTo: fieldSurface.trailingAnchor, constant: -16),
            submitHintLabel.centerYAnchor.constraint(equalTo: fieldSurface.centerYAnchor)
        ])

        fieldSurface.heightAnchor.constraint(equalToConstant: 58).isActive = true
        updateInputChrome()
        applyRunningState()
        updateTextViewLayout()
    }

    func textDidChange(_ notification: Notification) {
        updateTextViewLayout()
        updatePlaceholderPresentation()
        delegate?.composerViewTextDidChange(self)
    }

    private func updatePlaceholderPresentation() {
        let hasText = !textView.string.isEmpty || !textView.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        placeholderLabel.isHidden = hasText
        guard !hasText else {
            return
        }

        let text = isRunning
            ? Self.thinkingFrames[thinkingFrameIndex % Self.thinkingFrames.count]
            : configuredPlaceholder
        placeholderLabel.attributedStringValue = ROCUIFactory.makeAttributedText(
            text,
            style: .body,
            color: ROCTheme.inputPlaceholder
        )
    }

    @discardableResult
    func submitCurrentPromptIfPossible() -> Bool {
        let prompt = textView.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, !isRunning else {
            NSSound.beep()
            return false
        }

        delegate?.composerViewDidSubmit(self)
        return true
    }

    private static func makeTextView() -> ROCComposerTextView {
        let textStorage = NSTextStorage()
        let layoutManager = NSLayoutManager()
        textStorage.addLayoutManager(layoutManager)

        let textContainer = NSTextContainer(containerSize: NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        textContainer.widthTracksTextView = true
        textContainer.lineFragmentPadding = 0
        layoutManager.addTextContainer(textContainer)

        let textView = ROCComposerTextView(frame: NSRect(x: 0, y: 0, width: 0, height: minimumEditorHeight), textContainer: textContainer)
        textView.autoresizingMask = [.width]
        textView.textContainerInset = NSSize(width: 0, height: 5)
        textView.drawsBackground = false
        textView.isEditable = true
        textView.isSelectable = true
        textView.isRichText = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDataDetectionEnabled = false
        textView.isGrammarCheckingEnabled = false
        textView.allowsUndo = true
        textView.focusRingType = .default
        textView.isHorizontallyResizable = false
        textView.isVerticallyResizable = true
        textView.minSize = NSSize(width: 0, height: minimumEditorHeight)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.font = ROCTheme.font(for: .body)
        textView.textColor = ROCTheme.textPrimary
        return textView
    }

    private func updateTextViewLayout() {
        guard let textContainer = textView.textContainer,
              let layoutManager = textView.layoutManager
        else {
            return
        }

        let contentWidth = max(scrollView.contentSize.width, 1)
        textContainer.containerSize = NSSize(width: contentWidth, height: CGFloat.greatestFiniteMagnitude)
        textView.minSize = NSSize(width: contentWidth, height: Self.minimumEditorHeight)
        layoutManager.ensureLayout(for: textContainer)

        let usedRect = layoutManager.usedRect(for: textContainer)
        let targetHeight = min(Self.maximumEditorHeight, max(Self.minimumEditorHeight, ceil(usedRect.height + (textView.textContainerInset.height * 2))))
        textView.frame = NSRect(x: 0, y: 0, width: contentWidth, height: targetHeight)
        scrollHeightConstraint?.constant = targetHeight
    }

    private func updateInputChrome() {
        fieldInnerStroke.layer?.cornerRadius = 15
        fieldInnerStroke.layer?.cornerCurve = .continuous
        fieldInnerStroke.layer?.borderWidth = 0.8
        fieldInnerStroke.layer?.borderColor = ROCTheme.commandInputInnerStroke.rocCGColor(with: effectiveAppearance)
        fieldInnerStroke.layer?.backgroundColor = NSColor.clear.cgColor

        fieldTopGlow.layer?.cornerRadius = 0.5
        fieldTopGlow.layer?.cornerCurve = .continuous
        fieldTopGlow.layer?.backgroundColor = ROCTheme.commandInputTopGlow.rocCGColor(with: effectiveAppearance)
        fieldTopGlow.alphaValue = 0.9
    }

    private func applyRunningState() {
        submitHintLabel.isHidden = isRunning
        if isRunning {
            startThinkingAnimation()
        } else {
            stopThinkingAnimation()
        }
        updatePlaceholderPresentation()
    }

    private func startThinkingAnimation() {
        thinkingFrameIndex = 0
        updatePlaceholderPresentation()
        if thinkingTimer == nil {
            thinkingTimer = Timer.scheduledTimer(withTimeInterval: 0.42, repeats: true) { [weak self] _ in
                guard let self else {
                    return
                }

                self.thinkingFrameIndex = (self.thinkingFrameIndex + 1) % Self.thinkingFrames.count
                self.updatePlaceholderPresentation()
            }
        }
    }

    private func stopThinkingAnimation() {
        thinkingTimer?.invalidate()
        thinkingTimer = nil
        thinkingFrameIndex = 0
    }
}

final class ROCSuggestionRowView: NSView {
    let button: NSButton
    let preset: String
    let prompt: String
    private let surface = NSView()
    private var trackingAreaReference: NSTrackingArea?
    private var isHovered = false

    init(title: String, prompt: String, preset: String, target: AnyObject?, action: Selector?) {
        self.button = ROCUIFactory.makeButton(title: title, style: .ghost, target: target, action: action)
        self.preset = preset
        self.prompt = prompt
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        wantsLayer = true
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)

        surface.translatesAutoresizingMaskIntoConstraints = false
        surface.wantsLayer = true
        addSubview(surface)
        surface.rocPinEdges(to: self)

        let row = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: 0)
        addSubview(row)
        row.rocPinEdges(to: self, insets: NSEdgeInsets(top: 6, left: 12, bottom: 6, right: 12))

        button.font = NSFont.systemFont(ofSize: 13, weight: .medium)
        button.contentTintColor = ROCTheme.textSecondary
        button.imagePosition = .noImage
        button.setContentHuggingPriority(.required, for: .horizontal)
        button.setContentCompressionResistancePriority(.required, for: .horizontal)
        row.addArrangedSubview(button)
        heightAnchor.constraint(equalToConstant: 34).isActive = true
        updateHighlight(isHovered: false)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()

        if let trackingAreaReference {
            removeTrackingArea(trackingAreaReference)
        }

        let trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeInActiveApp, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
        trackingAreaReference = trackingArea
    }

    override func mouseEntered(with event: NSEvent) {
        isHovered = true
        updateHighlight(isHovered: true)
    }

    override func mouseExited(with event: NSEvent) {
        isHovered = false
        updateHighlight(isHovered: false)
    }

    override func mouseDown(with event: NSEvent) {
        button.performClick(nil)
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        updateHighlight(isHovered: isHovered)
    }

    private func updateHighlight(isHovered: Bool) {
        surface.layer?.cornerRadius = 11
        surface.layer?.cornerCurve = .continuous
        surface.layer?.borderWidth = 0
        surface.layer?.borderColor = NSColor.clear.cgColor
        surface.layer?.backgroundColor = (isHovered ? ROCTheme.commandChipHover : ROCTheme.commandChipFill).rocCGColor(with: effectiveAppearance)
        button.contentTintColor = isHovered ? ROCTheme.textPrimary : ROCTheme.textSecondary
    }
}

final class ROCSuggestionListView: NSView {
    private let suggestionsStack = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.small)
    private(set) var suggestionRows: [ROCSuggestionRowView] = []

    init(suggestions: [(title: String, prompt: String, preset: String)], target: AnyObject?, action: Selector?) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false

        addSubview(suggestionsStack)
        suggestionsStack.rocPinEdges(to: self)
        suggestionsStack.alignment = .centerY
        suggestionsStack.setContentHuggingPriority(.required, for: .vertical)

        for suggestion in suggestions.prefix(3) {
            let row = ROCSuggestionRowView(
                title: suggestion.title,
                prompt: suggestion.prompt,
                preset: suggestion.preset,
                target: target,
                action: action
            )
            row.button.identifier = NSUserInterfaceItemIdentifier(rawValue: "\(suggestion.preset)|\(suggestion.prompt)")
            suggestionsStack.addArrangedSubview(row)
            suggestionRows.append(row)
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

}

enum ROCConversationMessageTone {
    case user
    case assistant
    case error
}

final class ROCContextLineView: NSView {
    private let surface = NSView()
    private let iconView = NSImageView()
    private let label = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        translatesAutoresizingMaskIntoConstraints = false

        surface.translatesAutoresizingMaskIntoConstraints = false
        surface.wantsLayer = true
        addSubview(surface)
        surface.rocPinEdges(to: self)

        let row = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.small)
        surface.addSubview(row)
        row.rocPinEdges(to: surface)

        iconView.translatesAutoresizingMaskIntoConstraints = false
        iconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 12.5, weight: .medium)
        iconView.contentTintColor = ROCTheme.textMuted
        row.addArrangedSubview(iconView)
        iconView.widthAnchor.constraint(equalToConstant: 13).isActive = true
        iconView.heightAnchor.constraint(equalToConstant: 13).isActive = true

        label.font = NSFont.systemFont(ofSize: 13, weight: .medium)
        label.textColor = ROCTheme.textSecondary
        label.maximumNumberOfLines = 1
        label.lineBreakMode = .byTruncatingTail
        row.addArrangedSubview(label)
        updateSurfaceStyle()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    func configure(summary: String, detail: String, previewImagePath: String?) {
        if let previewImagePath {
            iconView.image = NSImage(systemSymbolName: "photo", accessibilityDescription: nil)
            applyStyle(text: URL(fileURLWithPath: previewImagePath).lastPathComponent)
            return
        }

        if summary.lowercased().contains("no selection") {
            iconView.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: nil)
            applyStyle(text: "No selection · Ask anything")
            return
        }

        let primary = detail
            .split(separator: ",", maxSplits: 1, omittingEmptySubsequences: true)
            .first
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        let contextText = (primary?.isEmpty == false ? primary : summary).map { $0 } ?? summary

        let lowered = summary.lowercased()
        let symbolName: String
        if lowered.contains("folder") {
            symbolName = "folder"
        } else if lowered.contains("text") {
            symbolName = "scissors"
        } else if lowered.contains("selection") {
            symbolName = "scissors"
        } else {
            symbolName = "doc.text"
        }

        iconView.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)
        applyStyle(text: contextText)
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        updateSurfaceStyle()
    }

    private func applyStyle(text: String) {
        label.attributedStringValue = NSAttributedString(
            string: text,
            attributes: [
                .font: NSFont.systemFont(ofSize: 13, weight: .medium),
                .foregroundColor: ROCTheme.textSecondary,
                .paragraphStyle: ROCTheme.paragraphStyle(for: .meta, alignment: .left, wrapping: false)
            ]
        )
    }

    private func updateSurfaceStyle() {
        surface.layer?.cornerRadius = 0
        surface.layer?.borderWidth = 0
        surface.layer?.backgroundColor = NSColor.clear.rocCGColor(with: effectiveAppearance)
    }
}

final class ROCResultView: NSView {
    private let separator = ROCSeparatorView()
    private let surface = NSView()
    private let loadingIndicatorRow = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.small)
    private let loadingDotView = NSView()
    private let scrollView = NSScrollView()
    private let textView = NSTextView(frame: .zero)
    private let footerRow = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.medium)
    private var copyValue: String?
    private var openURLValue: String?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        translatesAutoresizingMaskIntoConstraints = false
        build()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    func setBody(_ body: String, tone: ROCConversationMessageTone, copyText: String? = nil, openURL: String? = nil) {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineBreakMode = .byWordWrapping
        paragraphStyle.minimumLineHeight = 20
        paragraphStyle.maximumLineHeight = 20
        paragraphStyle.paragraphSpacing = 8

        let color = tone == .error ? ROCTheme.errorText : ROCTheme.textPrimary
        let value = body
        textView.textStorage?.setAttributedString(
            NSAttributedString(
                string: value,
                attributes: [
                    .font: NSFont.systemFont(ofSize: 13, weight: .regular),
                    .foregroundColor: color,
                    .paragraphStyle: paragraphStyle
                ]
            )
        )
        textView.layoutManager?.ensureLayout(for: textView.textContainer!)
        if !value.isEmpty {
            textView.scrollToEndOfDocument(nil)
        }

        let isLoading = value.isEmpty && tone != .error
        loadingIndicatorRow.isHidden = !isLoading
        scrollView.isHidden = isLoading

        copyValue = copyText
        openURLValue = openURL
        configureFooter()
    }

    private func build() {
        let root = ROCUIFactory.stack(orientation: .vertical, alignment: .leading, spacing: ROCSpacing.medium)
        addSubview(root)
        root.rocPinEdges(to: self)

        separator.alphaValue = 0.42
        root.addArrangedSubview(separator)
        separator.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true

        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.scrollerStyle = .overlay
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        textView.frame = NSRect(x: 0, y: 0, width: 0, height: 164)
        textView.minSize = NSSize(width: 0, height: 164)
        scrollView.documentView = textView

        ROCUIFactory.configureReadingTextView(textView)
        textView.autoresizingMask = [.width]
        textView.isHorizontallyResizable = false
        textView.isVerticallyResizable = true
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.textContainer?.containerSize = NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
        textView.textContainer?.widthTracksTextView = true

        surface.translatesAutoresizingMaskIntoConstraints = false
        surface.wantsLayer = true
        root.addArrangedSubview(surface)
        surface.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true
        surface.heightAnchor.constraint(equalToConstant: 188).isActive = true

        loadingIndicatorRow.translatesAutoresizingMaskIntoConstraints = false
        loadingIndicatorRow.detachesHiddenViews = true
        surface.addSubview(loadingIndicatorRow)
        NSLayoutConstraint.activate([
            loadingIndicatorRow.leadingAnchor.constraint(equalTo: surface.leadingAnchor, constant: 14),
            loadingIndicatorRow.topAnchor.constraint(equalTo: surface.topAnchor, constant: 16)
        ])
        loadingIndicatorRow.isHidden = true

        loadingDotView.translatesAutoresizingMaskIntoConstraints = false
        loadingDotView.wantsLayer = true
        loadingDotView.layer?.cornerRadius = 4
        loadingIndicatorRow.addArrangedSubview(loadingDotView)
        loadingDotView.widthAnchor.constraint(equalToConstant: 8).isActive = true
        loadingDotView.heightAnchor.constraint(equalToConstant: 8).isActive = true

        surface.addSubview(scrollView)
        scrollView.rocPinEdges(to: surface, insets: NSEdgeInsets(top: 12, left: 14, bottom: 12, right: 14))
        updateSurfaceStyle()

        footerRow.isHidden = true
        root.addArrangedSubview(footerRow)
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        updateSurfaceStyle()
    }

    private func configureFooter() {
        footerRow.views.forEach { view in
            footerRow.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        if let copyValue, !copyValue.isEmpty {
            footerRow.addArrangedSubview(
                ROCUIFactory.makeButton(title: "Copy", style: .ghost, target: self, action: #selector(copyPressed), controlSize: .small)
            )
        }

        if let openURLValue, !openURLValue.isEmpty {
            footerRow.addArrangedSubview(
                ROCUIFactory.makeButton(title: "Open", style: .ghost, target: self, action: #selector(openPressed), controlSize: .small)
            )
        }

        footerRow.isHidden = footerRow.arrangedSubviews.isEmpty
    }

    @objc private func copyPressed() {
        guard let copyValue else {
            return
        }

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(copyValue, forType: .string)
    }

    @objc private func openPressed() {
        guard let openURLValue, let url = URL(string: openURLValue) else {
            return
        }

        NSWorkspace.shared.open(url)
    }

    private func updateSurfaceStyle() {
        surface.layer?.cornerRadius = 12
        surface.layer?.cornerCurve = .continuous
        surface.layer?.borderWidth = 0
        surface.layer?.borderColor = NSColor.clear.cgColor
        surface.layer?.backgroundColor = ROCTheme.commandChipFill.rocCGColor(with: effectiveAppearance)
        loadingDotView.layer?.backgroundColor = ROCTheme.accentFill.rocCGColor(with: effectiveAppearance)
        loadingDotView.layer?.removeAnimation(forKey: "roc-breathe")

        let animation = CABasicAnimation(keyPath: "opacity")
        animation.fromValue = 0.28
        animation.toValue = 1.0
        animation.duration = 0.85
        animation.autoreverses = true
        animation.repeatCount = .infinity
        animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        loadingDotView.layer?.add(animation, forKey: "roc-breathe")
    }
}

final class ROCResultPlaceholderView: NSView {
    init(text: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false

        let label = ROCUIFactory.makeLabel(text, style: .meta, wrapping: true, alignment: .left)
        label.textColor = ROCTheme.textMuted
        addSubview(label)
        label.rocPinEdges(to: self, insets: NSEdgeInsets(top: ROCSpacing.medium, left: 0, bottom: ROCSpacing.medium, right: 0))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }
}

final class ROCConversationMessageView: NSView {
    let tone: ROCConversationMessageTone
    private let roleLabel: NSTextField
    private let bodyLabel: NSTextField
    private let footerRow = ROCUIFactory.stack(orientation: .horizontal, alignment: .centerY, spacing: ROCSpacing.medium)
    private let contentStack = ROCUIFactory.stack(orientation: .vertical, alignment: .leading, spacing: ROCSpacing.small)
    private var copyButton: NSButton?
    private var openButton: NSButton?
    private var copyValue: String?
    private var openURLValue: String?

    var layoutSpacingAfter: CGFloat {
        switch tone {
        case .user:
            return ROCSpacing.large
        case .assistant, .error:
            return ROCSpacing.xLarge
        }
    }

    init(role: String, body: String, tone: ROCConversationMessageTone) {
        self.tone = tone
        self.roleLabel = ROCUIFactory.makeLabel(role, style: .meta)
        self.bodyLabel = ROCUIFactory.makeLabel(body, style: .body, wrapping: true)

        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        bodyLabel.isSelectable = true
        build(body: body, tone: tone)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    func setBody(_ body: String, tone: ROCConversationMessageTone, copyText: String? = nil, openURL: String? = nil) {
        let displayBody = body.isEmpty ? "Thinking…" : body
        let textStyle: ROCLabelStyle = .body
        bodyLabel.attributedStringValue = ROCUIFactory.makeAttributedText(
            displayBody,
            style: textStyle,
            color: tone == .error ? ROCTheme.errorText : ROCTheme.textPrimary
        )
        configureFooter(copyText: copyText, openURL: openURL)
    }

    private func build(body: String, tone: ROCConversationMessageTone) {
        let root = ROCUIFactory.stack(orientation: .vertical, alignment: .leading, spacing: ROCSpacing.xSmall + 2)
        addSubview(root)
        root.rocPinEdges(to: self)

        switch tone {
        case .assistant:
            roleLabel.textColor = ROCTheme.textSecondary
        case .user:
            roleLabel.textColor = ROCTheme.textMuted
        case .error:
            roleLabel.textColor = ROCTheme.errorText
        }
        root.addArrangedSubview(roleLabel)

        root.addArrangedSubview(contentStack)
        contentStack.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true
        contentStack.addArrangedSubview(bodyLabel)
        bodyLabel.widthAnchor.constraint(equalTo: contentStack.widthAnchor).isActive = true

        footerRow.isHidden = true
        contentStack.addArrangedSubview(footerRow)
        setBody(body, tone: tone)
    }

    private func configureFooter(copyText: String?, openURL: String?) {
        copyValue = copyText
        openURLValue = openURL
        footerRow.views.forEach { view in
            footerRow.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        if let copyText, !copyText.isEmpty {
            let button = ROCUIFactory.makeButton(title: "Copy", style: .ghost, target: self, action: #selector(copyPressed), controlSize: .small)
            copyButton = button
            footerRow.addArrangedSubview(button)
        }

        if let openURL, !openURL.isEmpty {
            let button = ROCUIFactory.makeButton(title: "Open", style: .ghost, target: self, action: #selector(openPressed), controlSize: .small)
            openButton = button
            footerRow.addArrangedSubview(button)
        }

        footerRow.isHidden = footerRow.arrangedSubviews.isEmpty
    }

    @objc private func copyPressed() {
        guard let copyValue else {
            return
        }

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(copyValue, forType: .string)
    }

    @objc private func openPressed() {
        guard let openURLValue, let url = URL(string: openURLValue) else {
            return
        }

        NSWorkspace.shared.open(url)
    }
}
