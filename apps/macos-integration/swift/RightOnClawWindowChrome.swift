import AppKit
import Foundation

enum ROCWindowShellStyle {
    case standard
    case compact
}

struct ROCWindowShell {
    let backgroundView: NSVisualEffectView
    let canvasView: ROCSurfaceView
    let rootStack: NSStackView
}

enum ROCWindowChrome {
    static func install(
        on window: NSWindow,
        rootSpacing: CGFloat = ROCSpacing.large,
        rootInsets: NSEdgeInsets = ROCLayout.windowInset,
        shellStyle: ROCWindowShellStyle = .standard,
        hideTrafficLights: Bool = false
    ) -> ROCWindowShell {
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.isMovableByWindowBackground = true
        window.isOpaque = false
        window.backgroundColor = .clear

        if hideTrafficLights {
            window.standardWindowButton(.closeButton)?.isHidden = true
            window.standardWindowButton(.miniaturizeButton)?.isHidden = true
            window.standardWindowButton(.zoomButton)?.isHidden = true
        }

        let backgroundView = NSVisualEffectView(frame: window.contentRect(forFrameRect: window.frame))
        backgroundView.material = shellStyle == .compact ? .popover : .windowBackground
        backgroundView.blendingMode = .behindWindow
        backgroundView.state = .active
        backgroundView.wantsLayer = true
        backgroundView.layer?.backgroundColor = ROCTheme.windowBackground.rocCGColor(with: window.effectiveAppearance)
        window.contentView = backgroundView

        let canvasView = ROCSurfaceView(style: .panel, cornerRadius: ROCRadius.window)
        backgroundView.addSubview(canvasView)
        canvasView.rocPinEdges(to: backgroundView)

        let rootStack = ROCUIFactory.stack(orientation: .vertical, alignment: .leading, spacing: rootSpacing)
        canvasView.addSubview(rootStack)
        rootStack.rocPinEdges(to: canvasView, insets: rootInsets)

        return ROCWindowShell(backgroundView: backgroundView, canvasView: canvasView, rootStack: rootStack)
    }
}
