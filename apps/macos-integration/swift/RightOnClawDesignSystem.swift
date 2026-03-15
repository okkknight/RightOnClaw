import AppKit
import Foundation

enum ROCSpacing {
    static let xSmall: CGFloat = 4
    static let small: CGFloat = 8
    static let medium: CGFloat = 12
    static let large: CGFloat = 16
    static let xLarge: CGFloat = 20
    static let xxLarge: CGFloat = 24
    static let hero: CGFloat = 32
}

enum ROCRadius {
    static let control: CGFloat = 10
    static let card: CGFloat = 14
    static let window: CGFloat = 20
    static let pill: CGFloat = 999
}

enum ROCControlMetrics {
    static let smallButtonHeight: CGFloat = 30
    static let buttonHeight: CGFloat = 36
    static let inputHeight: CGFloat = 42
}

enum ROCLayout {
    static let windowInset = NSEdgeInsets(top: ROCSpacing.xxLarge, left: ROCSpacing.xxLarge, bottom: ROCSpacing.xxLarge, right: ROCSpacing.xxLarge)
    static let compactWindowInset = NSEdgeInsets(top: ROCSpacing.xLarge, left: ROCSpacing.xLarge, bottom: ROCSpacing.xLarge, right: ROCSpacing.xLarge)
    static let cardInset = NSEdgeInsets(top: ROCSpacing.xLarge, left: ROCSpacing.xLarge, bottom: ROCSpacing.xLarge, right: ROCSpacing.xLarge)
    static let readingInset = NSEdgeInsets(top: ROCSpacing.xxLarge, left: ROCSpacing.xxLarge, bottom: ROCSpacing.xxLarge, right: ROCSpacing.xxLarge)
    static let conversationInset = NSEdgeInsets(top: ROCSpacing.xxLarge, left: 0, bottom: ROCSpacing.hero + ROCSpacing.small, right: 0)
    static let contextInset = NSEdgeInsets(top: ROCSpacing.large, left: ROCSpacing.large, bottom: ROCSpacing.large, right: ROCSpacing.large)
    static let conversationReadingInset = NSEdgeInsets(top: ROCSpacing.xLarge + 2, left: ROCSpacing.xLarge + 2, bottom: ROCSpacing.xLarge + 2, right: ROCSpacing.xLarge + 2)
    static let promptMinWidth: CGFloat = 420
}

enum ROCLabelStyle {
    case hero
    case title
    case section
    case body
    case bodyStrong
    case meta
    case code
}

enum ROCButtonStyle {
    case primary
    case secondary
    case ghost
    case destructive
}

enum ROCSurfaceStyle {
    case panel
    case transparent
    case secondary
    case reading
    case input
    case commandInput
    case accent
    case error
    case hud
}

enum ROCBadgeTone {
    case accent
    case neutral
    case error
}

struct ROCSurfacePalette {
    let fill: NSColor
    let border: NSColor
    let borderWidth: CGFloat
}

enum ROCTheme {
    private static func dynamicColor(light: NSColor, dark: NSColor) -> NSColor {
        NSColor(name: nil, dynamicProvider: { appearance in
            let matched = appearance.bestMatch(from: [.darkAqua, .aqua])
            return matched == .darkAqua ? dark : light
        })
    }

    static let windowBackground = dynamicColor(
        light: NSColor(calibratedRed: 0.993, green: 0.989, blue: 0.982, alpha: 0.96),
        dark: NSColor(calibratedRed: 0.148, green: 0.145, blue: 0.14, alpha: 1.0)
    )

    static let panelBackground = dynamicColor(
        light: NSColor(calibratedRed: 0.998, green: 0.996, blue: 0.991, alpha: 0.95),
        dark: NSColor(calibratedRed: 0.188, green: 0.184, blue: 0.178, alpha: 0.95)
    )

    static let surfaceSecondary = dynamicColor(
        light: NSColor(calibratedRed: 0.992, green: 0.988, blue: 0.979, alpha: 0.98),
        dark: NSColor(calibratedRed: 0.218, green: 0.214, blue: 0.208, alpha: 0.98)
    )

    static let readingSurface = dynamicColor(
        light: NSColor(calibratedRed: 1.0, green: 0.999, blue: 0.996, alpha: 0.99),
        dark: NSColor(calibratedRed: 0.198, green: 0.194, blue: 0.19, alpha: 0.99)
    )

    static let hudSurface = dynamicColor(
        light: NSColor(calibratedRed: 0.992, green: 0.989, blue: 0.981, alpha: 0.9),
        dark: NSColor(calibratedRed: 0.176, green: 0.174, blue: 0.17, alpha: 0.88)
    )

    static let accentFill = dynamicColor(
        light: NSColor(calibratedRed: 0.95, green: 0.928, blue: 0.84, alpha: 1.0),
        dark: NSColor(calibratedRed: 0.45, green: 0.392, blue: 0.245, alpha: 1.0)
    )

    static let accentSurface = dynamicColor(
        light: NSColor(calibratedRed: 0.994, green: 0.985, blue: 0.944, alpha: 1.0),
        dark: NSColor(calibratedRed: 0.248, green: 0.228, blue: 0.182, alpha: 1.0)
    )

    static let accentText = dynamicColor(
        light: NSColor(calibratedRed: 0.392, green: 0.334, blue: 0.214, alpha: 1.0),
        dark: NSColor(calibratedWhite: 0.98, alpha: 1.0)
    )

    static let textPrimary = dynamicColor(
        light: NSColor(calibratedRed: 0.18, green: 0.176, blue: 0.166, alpha: 1.0),
        dark: NSColor(calibratedWhite: 0.95, alpha: 1.0)
    )

    static let textSecondary = dynamicColor(
        light: NSColor(calibratedRed: 0.43, green: 0.425, blue: 0.405, alpha: 1.0),
        dark: NSColor(calibratedWhite: 0.72, alpha: 1.0)
    )

    static let textMuted = dynamicColor(
        light: NSColor(calibratedRed: 0.57, green: 0.552, blue: 0.522, alpha: 1.0),
        dark: NSColor(calibratedWhite: 0.62, alpha: 1.0)
    )

    static let border = dynamicColor(
        light: NSColor(calibratedRed: 0.84, green: 0.824, blue: 0.79, alpha: 0.55),
        dark: NSColor(calibratedRed: 0.33, green: 0.318, blue: 0.298, alpha: 0.72)
    )

    static let borderSubtle = dynamicColor(
        light: NSColor(calibratedRed: 0.902, green: 0.888, blue: 0.856, alpha: 0.28),
        dark: NSColor(calibratedRed: 0.29, green: 0.28, blue: 0.26, alpha: 0.48)
    )

    static let separator = dynamicColor(
        light: NSColor(calibratedRed: 0.886, green: 0.872, blue: 0.84, alpha: 0.5),
        dark: NSColor(calibratedRed: 0.298, green: 0.29, blue: 0.27, alpha: 0.72)
    )

    static let inputBackground = dynamicColor(
        light: NSColor(calibratedRed: 0.999, green: 0.998, blue: 0.995, alpha: 0.99),
        dark: NSColor(calibratedRed: 0.208, green: 0.205, blue: 0.2, alpha: 0.99)
    )

    static let commandInputBackground = dynamicColor(
        light: NSColor(calibratedRed: 0.952, green: 0.959, blue: 0.969, alpha: 1.0),
        dark: NSColor(calibratedRed: 0.114, green: 0.134, blue: 0.164, alpha: 1.0)
    )

    static let inputBorder = dynamicColor(
        light: NSColor(calibratedRed: 0.856, green: 0.838, blue: 0.804, alpha: 0.48),
        dark: NSColor(calibratedRed: 0.36, green: 0.346, blue: 0.322, alpha: 0.72)
    )

    static let commandInputBorder = dynamicColor(
        light: NSColor(calibratedRed: 0.995, green: 0.998, blue: 1.0, alpha: 0.84),
        dark: NSColor(calibratedRed: 0.84, green: 0.89, blue: 0.96, alpha: 0.18)
    )

    static let commandPillFill = dynamicColor(
        light: .clear,
        dark: .clear
    )

    static let commandPillBorder = dynamicColor(
        light: .clear,
        dark: .clear
    )

    static let commandChipFill = dynamicColor(
        light: NSColor(calibratedRed: 0.954, green: 0.961, blue: 0.972, alpha: 0.62),
        dark: NSColor(calibratedRed: 0.148, green: 0.166, blue: 0.196, alpha: 0.68)
    )

    static let commandChipHover = dynamicColor(
        light: NSColor(calibratedRed: 0.971, green: 0.978, blue: 0.987, alpha: 0.78),
        dark: NSColor(calibratedRed: 0.174, green: 0.194, blue: 0.226, alpha: 0.82)
    )

    static let commandHintText = dynamicColor(
        light: NSColor(calibratedRed: 0.49, green: 0.47, blue: 0.442, alpha: 0.78),
        dark: NSColor(calibratedWhite: 0.72, alpha: 0.78)
    )

    static let commandInputInnerStroke = dynamicColor(
        light: NSColor(calibratedRed: 1.0, green: 1.0, blue: 1.0, alpha: 0.2),
        dark: NSColor(calibratedRed: 0.8, green: 0.86, blue: 0.96, alpha: 0.1)
    )

    static let commandInputTopGlow = dynamicColor(
        light: NSColor(calibratedRed: 1.0, green: 1.0, blue: 1.0, alpha: 0.4),
        dark: NSColor(calibratedRed: 0.86, green: 0.92, blue: 1.0, alpha: 0.14)
    )

    static let commandSelectionText = dynamicColor(
        light: NSColor(calibratedRed: 0.62, green: 0.6, blue: 0.57, alpha: 0.9),
        dark: NSColor(calibratedWhite: 0.68, alpha: 0.88)
    )

    static let inputPlaceholder = dynamicColor(
        light: NSColor(calibratedRed: 0.64, green: 0.62, blue: 0.588, alpha: 1.0),
        dark: NSColor(calibratedWhite: 0.56, alpha: 1.0)
    )

    static let buttonSecondaryHover = dynamicColor(
        light: NSColor(calibratedRed: 0.978, green: 0.971, blue: 0.952, alpha: 1.0),
        dark: NSColor(calibratedRed: 0.242, green: 0.236, blue: 0.228, alpha: 1.0)
    )

    static let buttonPrimaryHover = dynamicColor(
        light: NSColor(calibratedRed: 0.958, green: 0.936, blue: 0.85, alpha: 1.0),
        dark: NSColor(calibratedRed: 0.49, green: 0.428, blue: 0.268, alpha: 1.0)
    )

    static let buttonGhostHover = dynamicColor(
        light: NSColor(calibratedRed: 0.27, green: 0.258, blue: 0.238, alpha: 1.0),
        dark: NSColor(calibratedWhite: 0.92, alpha: 1.0)
    )

    static let windowShadow = dynamicColor(
        light: NSColor(calibratedWhite: 0.16, alpha: 0.12),
        dark: NSColor(calibratedWhite: 0.0, alpha: 0.34)
    )

    static let cardShadow = dynamicColor(
        light: NSColor(calibratedWhite: 0.22, alpha: 0.08),
        dark: NSColor(calibratedWhite: 0.0, alpha: 0.24)
    )

    static let commandInputShadow = dynamicColor(
        light: NSColor(calibratedRed: 0.08, green: 0.1, blue: 0.14, alpha: 0.2),
        dark: NSColor(calibratedWhite: 0.0, alpha: 0.34)
    )

    static let errorFill = dynamicColor(
        light: NSColor.systemRed.withAlphaComponent(0.08),
        dark: NSColor.systemRed.withAlphaComponent(0.16)
    )

    static let errorBorder = dynamicColor(
        light: NSColor.systemRed.withAlphaComponent(0.18),
        dark: NSColor.systemRed.withAlphaComponent(0.32)
    )

    static let errorText = dynamicColor(
        light: NSColor(calibratedRed: 0.69, green: 0.18, blue: 0.17, alpha: 1.0),
        dark: NSColor.systemRed
    )

    static func font(for style: ROCLabelStyle) -> NSFont {
        switch style {
        case .hero:
            return NSFont.systemFont(ofSize: 25, weight: .semibold)
        case .title:
            return NSFont.systemFont(ofSize: 19, weight: .semibold)
        case .section:
            return NSFont.systemFont(ofSize: 11.5, weight: .medium)
        case .body:
            return NSFont.systemFont(ofSize: 14.5, weight: .regular)
        case .bodyStrong:
            return NSFont.systemFont(ofSize: 14.5, weight: .medium)
        case .meta:
            return NSFont.systemFont(ofSize: 12.5, weight: .regular)
        case .code:
            return NSFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)
        }
    }

    static func textColor(for style: ROCLabelStyle) -> NSColor {
        switch style {
        case .hero, .title, .section, .bodyStrong:
            return textPrimary
        case .body, .code:
            return textPrimary
        case .meta:
            return textSecondary
        }
    }

    static func surfacePalette(for style: ROCSurfaceStyle) -> ROCSurfacePalette {
        switch style {
        case .panel:
            return ROCSurfacePalette(fill: panelBackground, border: borderSubtle, borderWidth: 0.8)
        case .transparent:
            return ROCSurfacePalette(fill: .clear, border: .clear, borderWidth: 0)
        case .secondary:
            return ROCSurfacePalette(fill: surfaceSecondary, border: borderSubtle, borderWidth: 0.7)
        case .reading:
            return ROCSurfacePalette(fill: readingSurface, border: borderSubtle, borderWidth: 0.6)
        case .input:
            return ROCSurfacePalette(fill: inputBackground, border: inputBorder, borderWidth: 0.9)
        case .commandInput:
            return ROCSurfacePalette(fill: commandInputBackground, border: commandInputBorder, borderWidth: 1.1)
        case .accent:
            return ROCSurfacePalette(fill: accentSurface, border: accentFill.withAlphaComponent(0.22), borderWidth: 0.8)
        case .error:
            return ROCSurfacePalette(fill: errorFill, border: errorBorder, borderWidth: 0.9)
        case .hud:
            return ROCSurfacePalette(fill: hudSurface, border: borderSubtle, borderWidth: 0.7)
        }
    }

    static func paragraphStyle(for style: ROCLabelStyle, alignment: NSTextAlignment, wrapping: Bool) -> NSMutableParagraphStyle {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = alignment
        paragraphStyle.lineBreakMode = wrapping ? .byWordWrapping : .byTruncatingTail

        switch style {
        case .hero:
            paragraphStyle.minimumLineHeight = 30
            paragraphStyle.maximumLineHeight = 30
        case .title:
            paragraphStyle.minimumLineHeight = 24
            paragraphStyle.maximumLineHeight = 24
        case .section:
            paragraphStyle.minimumLineHeight = 15
            paragraphStyle.maximumLineHeight = 15
        case .body, .bodyStrong:
            paragraphStyle.minimumLineHeight = 22
            paragraphStyle.maximumLineHeight = 22
            paragraphStyle.paragraphSpacing = 8
        case .meta:
            paragraphStyle.minimumLineHeight = 18
            paragraphStyle.maximumLineHeight = 18
            paragraphStyle.paragraphSpacing = 6
        case .code:
            paragraphStyle.minimumLineHeight = 20
            paragraphStyle.maximumLineHeight = 20
            paragraphStyle.paragraphSpacing = 6
        }

        return paragraphStyle
    }

    static func textAttributes(
        for style: ROCLabelStyle,
        color: NSColor? = nil,
        alignment: NSTextAlignment = .left,
        wrapping: Bool = true
    ) -> [NSAttributedString.Key: Any] {
        [
            .font: font(for: style),
            .foregroundColor: color ?? textColor(for: style),
            .paragraphStyle: paragraphStyle(for: style, alignment: alignment, wrapping: wrapping)
        ]
    }
}

final class ROCSurfaceView: NSView {
    var surfaceStyle: ROCSurfaceStyle {
        didSet { applySurfaceStyle() }
    }

    var cornerRadius: CGFloat {
        didSet { applySurfaceStyle() }
    }

    init(style: ROCSurfaceStyle, cornerRadius: CGFloat = ROCRadius.card) {
        self.surfaceStyle = style
        self.cornerRadius = cornerRadius
        super.init(frame: .zero)
        wantsLayer = true
        translatesAutoresizingMaskIntoConstraints = false
        applySurfaceStyle()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        applySurfaceStyle()
    }

    override func layout() {
        super.layout()
        updateShadowPath()
    }

    private func applySurfaceStyle() {
        wantsLayer = true
        guard let layer else {
            return
        }

        let palette = ROCTheme.surfacePalette(for: surfaceStyle)
        layer.cornerRadius = cornerRadius
        layer.cornerCurve = .continuous
        layer.borderWidth = palette.borderWidth
        layer.masksToBounds = surfaceStyle != .panel && surfaceStyle != .hud && surfaceStyle != .commandInput
        layer.backgroundColor = palette.fill.rocCGColor(with: effectiveAppearance)
        layer.borderColor = palette.border.rocCGColor(with: effectiveAppearance)
        applyShadow()
        updateShadowPath()
    }

    private func applyShadow() {
        guard let layer else {
            return
        }

        switch surfaceStyle {
        case .panel:
            layer.shadowColor = ROCTheme.windowShadow.rocCGColor(with: effectiveAppearance)
            layer.shadowOpacity = 0.5
            layer.shadowRadius = 24
            layer.shadowOffset = CGSize(width: 0, height: -1)
        case .transparent:
            layer.shadowOpacity = 0
            layer.shadowRadius = 0
            layer.shadowOffset = .zero
        case .commandInput:
            layer.shadowColor = ROCTheme.commandInputShadow.rocCGColor(with: effectiveAppearance)
            layer.shadowOpacity = 0.34
            layer.shadowRadius = 20
            layer.shadowOffset = CGSize(width: 0, height: -4)
        case .hud:
            layer.shadowColor = ROCTheme.cardShadow.rocCGColor(with: effectiveAppearance)
            layer.shadowOpacity = 0.55
            layer.shadowRadius = 16
            layer.shadowOffset = CGSize(width: 0, height: -1)
        default:
            layer.shadowOpacity = 0
            layer.shadowRadius = 0
            layer.shadowOffset = .zero
        }
    }

    private func updateShadowPath() {
        guard let layer else {
            return
        }

        layer.shadowPath = CGPath(
            roundedRect: bounds,
            cornerWidth: cornerRadius,
            cornerHeight: cornerRadius,
            transform: nil
        )
    }
}

final class ROCSeparatorView: NSView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 1).isActive = true
        applyColor()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        applyColor()
    }

    private func applyColor() {
        layer?.backgroundColor = ROCTheme.separator.rocCGColor(with: effectiveAppearance)
    }
}

final class ROCButton: NSButton {
    var rocButtonStyle: ROCButtonStyle = .secondary {
        didSet { applyStyle() }
    }

    private var trackingAreaReference: NSTrackingArea?
    private var isHovered = false {
        didSet { applyStyle() }
    }

    override var isEnabled: Bool {
        didSet { applyStyle() }
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonInit()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    private func commonInit() {
        setButtonType(.momentaryPushIn)
        bezelStyle = .rounded
        focusRingType = .default
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
    }

    override func mouseExited(with event: NSEvent) {
        isHovered = false
    }

    func applyStyle() {
        alphaValue = isEnabled ? 1.0 : 0.55

        switch rocButtonStyle {
        case .primary:
            isBordered = true
            bezelColor = isHovered ? ROCTheme.buttonPrimaryHover : ROCTheme.accentFill
            contentTintColor = ROCTheme.accentText
        case .secondary:
            isBordered = true
            bezelColor = isHovered ? ROCTheme.buttonSecondaryHover : ROCTheme.surfaceSecondary
            contentTintColor = ROCTheme.textPrimary
        case .ghost:
            isBordered = false
            bezelColor = .clear
            contentTintColor = isHovered ? ROCTheme.buttonGhostHover : ROCTheme.textSecondary
        case .destructive:
            isBordered = true
            bezelColor = ROCTheme.errorFill
            contentTintColor = ROCTheme.errorText
        }
    }
}

enum ROCUIFactory {
    static func stack(
        orientation: NSUserInterfaceLayoutOrientation,
        alignment: NSLayoutConstraint.Attribute = .leading,
        spacing: CGFloat = ROCSpacing.large
    ) -> NSStackView {
        let stack = NSStackView()
        stack.orientation = orientation
        stack.alignment = alignment
        stack.spacing = spacing
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }

    static func makeLabel(
        _ text: String,
        style: ROCLabelStyle,
        wrapping: Bool = false,
        alignment: NSTextAlignment = .left
    ) -> NSTextField {
        let label = wrapping ? NSTextField(wrappingLabelWithString: text) : NSTextField(labelWithString: text)
        let textColor = ROCTheme.textColor(for: style)
        label.font = ROCTheme.font(for: style)
        label.textColor = textColor
        label.alignment = alignment
        label.lineBreakMode = wrapping ? .byWordWrapping : .byTruncatingTail
        label.maximumNumberOfLines = wrapping ? 0 : 1
        label.allowsDefaultTighteningForTruncation = true
        label.attributedStringValue = NSAttributedString(
            string: text,
            attributes: ROCTheme.textAttributes(for: style, color: textColor, alignment: alignment, wrapping: wrapping)
        )
        return label
    }

    static func makeAttributedText(
        _ text: String,
        style: ROCLabelStyle,
        color: NSColor? = nil,
        alignment: NSTextAlignment = .left,
        wrapping: Bool = true
    ) -> NSAttributedString {
        NSAttributedString(
            string: text,
            attributes: ROCTheme.textAttributes(for: style, color: color, alignment: alignment, wrapping: wrapping)
        )
    }

    static func makeButton(
        title: String,
        style: ROCButtonStyle,
        target: AnyObject?,
        action: Selector?,
        controlSize: NSControl.ControlSize = .regular
    ) -> NSButton {
        let button = ROCButton(frame: .zero)
        button.title = title
        button.target = target
        button.action = action
        styleButton(button, style: style, controlSize: controlSize)
        return button
    }

    static func styleButton(
        _ button: NSButton,
        style: ROCButtonStyle,
        controlSize: NSControl.ControlSize = .regular
    ) {
        button.controlSize = controlSize
        button.font = controlSize == .small ? ROCTheme.font(for: .meta) : ROCTheme.font(for: .bodyStrong)
        button.setButtonType(.momentaryPushIn)
        button.focusRingType = .default
        button.translatesAutoresizingMaskIntoConstraints = false
        button.bezelStyle = .rounded
        button.heightAnchor.constraint(equalToConstant: controlSize == .small ? ROCControlMetrics.smallButtonHeight : ROCControlMetrics.buttonHeight).isActive = true
        button.imagePosition = .imageLeading

        if let rocButton = button as? ROCButton {
            rocButton.rocButtonStyle = style
            rocButton.applyStyle()
            return
        }

        switch style {
        case .primary:
            button.isBordered = true
            button.bezelColor = ROCTheme.accentFill
            button.contentTintColor = ROCTheme.accentText
        case .secondary:
            button.isBordered = true
            button.bezelColor = ROCTheme.surfaceSecondary
            button.contentTintColor = ROCTheme.textPrimary
        case .ghost:
            button.isBordered = false
            button.contentTintColor = ROCTheme.textSecondary
        case .destructive:
            button.isBordered = true
            button.bezelColor = ROCTheme.errorFill
            button.contentTintColor = ROCTheme.errorText
        }
    }

    static func configureTextField(
        _ field: NSTextField,
        placeholder: String? = nil,
        style: ROCLabelStyle = .body
    ) {
        field.placeholderString = placeholder
        if let placeholder {
            field.placeholderAttributedString = NSAttributedString(
                string: placeholder,
                attributes: [
                    .font: ROCTheme.font(for: style),
                    .foregroundColor: ROCTheme.inputPlaceholder
                ]
            )
        }
        field.isEditable = true
        field.isSelectable = true
        field.isBordered = false
        field.drawsBackground = false
        field.backgroundColor = .clear
        field.textColor = ROCTheme.textPrimary
        field.focusRingType = .default
        field.font = ROCTheme.font(for: style)
        field.translatesAutoresizingMaskIntoConstraints = false
    }

    static func wrapInputField(_ field: NSTextField) -> ROCSurfaceView {
        let container = ROCSurfaceView(style: .input, cornerRadius: ROCRadius.control)
        container.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(field)
        field.rocPinEdges(to: container, insets: NSEdgeInsets(top: 11, left: 14, bottom: 11, right: 14))
        container.heightAnchor.constraint(equalToConstant: ROCControlMetrics.inputHeight).isActive = true
        return container
    }

    static func makeBadge(text: String, tone: ROCBadgeTone = .accent) -> NSView {
        let style: ROCSurfaceStyle
        let textColor: NSColor

        switch tone {
        case .accent:
            style = .accent
            textColor = ROCTheme.accentText
        case .neutral:
            style = .secondary
            textColor = ROCTheme.textSecondary
        case .error:
            style = .error
            textColor = ROCTheme.errorText
        }

        let badge = ROCSurfaceView(style: style, cornerRadius: 11)
        let label = NSTextField(labelWithString: text)
        label.font = ROCTheme.font(for: .meta)
        label.textColor = textColor
        badge.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: badge.leadingAnchor, constant: 11),
            label.trailingAnchor.constraint(equalTo: badge.trailingAnchor, constant: -11),
            label.topAnchor.constraint(equalTo: badge.topAnchor, constant: 6),
            label.bottomAnchor.constraint(equalTo: badge.bottomAnchor, constant: -6)
        ])
        return badge
    }

    static func makeSeparator() -> NSView {
        ROCSeparatorView(frame: .zero)
    }

    static func makeSymbolImageView(
        symbolName: String,
        pointSize: CGFloat,
        weight: NSFont.Weight = .medium,
        tintColor: NSColor = ROCTheme.accentText,
        backgroundStyle: ROCSurfaceStyle? = nil
    ) -> NSView {
        let imageView = NSImageView(frame: NSRect(x: 0, y: 0, width: pointSize + 4, height: pointSize + 4))
        let symbolConfig = NSImage.SymbolConfiguration(pointSize: pointSize, weight: weight)
        imageView.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)?.withSymbolConfiguration(symbolConfig)
        imageView.contentTintColor = tintColor

        guard let backgroundStyle else {
            imageView.translatesAutoresizingMaskIntoConstraints = false
            return imageView
        }

        let container = ROCSurfaceView(style: backgroundStyle, cornerRadius: ROCRadius.control)
        container.addSubview(imageView)
        imageView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            imageView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 8),
            imageView.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -8),
            imageView.topAnchor.constraint(equalTo: container.topAnchor, constant: 8),
            imageView.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -8)
        ])
        return container
    }

    static func configureStreamingTextView(_ textView: NSTextView) {
        textView.isEditable = false
        textView.isRichText = false
        textView.drawsBackground = false
        textView.textColor = ROCTheme.textPrimary
        textView.insertionPointColor = ROCTheme.textPrimary
        textView.font = ROCTheme.font(for: .code)
        textView.textContainerInset = NSSize(width: ROCSpacing.xLarge, height: ROCSpacing.xLarge)
        textView.textContainer?.lineFragmentPadding = 0
        textView.typingAttributes = ROCTheme.textAttributes(for: .code)
    }

    static func configureReadingTextView(_ textView: NSTextView) {
        textView.isEditable = false
        textView.isSelectable = true
        textView.isRichText = false
        textView.drawsBackground = false
        textView.textColor = ROCTheme.textPrimary
        textView.insertionPointColor = ROCTheme.textPrimary
        textView.font = NSFont.systemFont(ofSize: 13, weight: .regular)
        textView.textContainerInset = NSSize(width: 0, height: 0)
        textView.textContainer?.lineFragmentPadding = 0
        textView.typingAttributes = ROCTheme.textAttributes(for: .body)
    }
}

extension NSColor {
    func rocCGColor(with appearance: NSAppearance?) -> CGColor {
        guard let appearance else {
            return self.cgColor
        }

        var resolvedColor = self.cgColor
        appearance.performAsCurrentDrawingAppearance {
            resolvedColor = self.cgColor
        }
        return resolvedColor
    }
}

extension NSView {
    func rocPinEdges(
        to other: NSView,
        insets: NSEdgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)
    ) {
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            leadingAnchor.constraint(equalTo: other.leadingAnchor, constant: insets.left),
            trailingAnchor.constraint(equalTo: other.trailingAnchor, constant: -insets.right),
            topAnchor.constraint(equalTo: other.topAnchor, constant: insets.top),
            bottomAnchor.constraint(equalTo: other.bottomAnchor, constant: -insets.bottom)
        ])
    }
}
