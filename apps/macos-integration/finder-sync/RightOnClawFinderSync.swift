import AppKit
import FinderSync
import Foundation
import OSLog

private let rocFinderSyncLogger = Logger(subsystem: "com.rightonclaw.findersync", category: "extension")

final class RightOnClawFinderSync: FIFinderSync {
    override init() {
        super.init()
        FIFinderSyncController.default().directoryURLs = Set(monitoredDirectories())
        rocFinderSyncLog("Finder Sync initialized with \(monitoredDirectories().count) monitored directories.")
    }

    override func beginObservingDirectory(at url: URL) {
        rocFinderSyncLog("beginObservingDirectory: \(url.path)")
    }

    override func endObservingDirectory(at url: URL) {
        rocFinderSyncLog("endObservingDirectory: \(url.path)")
    }

    override var toolbarItemName: String {
        "Ask Claw"
    }

    override var toolbarItemToolTip: String {
        "Ask Claw about selected Finder items"
    }

    override var toolbarItemImage: NSImage {
        if let image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Ask Claw") {
            image.isTemplate = true
            return image
        }

        return NSImage(named: NSImage.actionTemplateName) ?? NSImage(size: NSSize(width: 18, height: 18))
    }

    override func menu(for menuKind: FIMenuKind) -> NSMenu? {
        rocFinderSyncLog("menu(for:) requested for \(menuKind.rawValue)")
        switch menuKind {
        case .contextualMenuForItems, .contextualMenuForContainer, .contextualMenuForSidebar, .toolbarItemMenu:
            let menu = NSMenu(title: "Ask Claw")
            let item = NSMenuItem(title: "Ask Claw", action: #selector(handleAskClawAction(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = currentSelectedPaths()
            menu.addItem(item)
            return menu
        default:
            return nil
        }
    }

    @objc private func handleAskClawAction(_ sender: Any?) {
        let representedPaths = (sender as? NSMenuItem)?.representedObject as? [String]
        let paths = (representedPaths?.isEmpty == false ? representedPaths : nil) ?? currentSelectedPaths()
        guard !paths.isEmpty else {
            NSSound.beep()
            rocFinderSyncLog("No selected paths available for Ask Claw.")
            return
        }

        do {
            try launchFinderHost(with: paths)
            rocFinderSyncLog("Launched Ask Claw for \(paths.count) selected paths.")
        } catch {
            NSSound.beep()
            rocFinderSyncLog("Failed to launch Ask Claw: \(error)")
        }
    }

    private func currentSelectedPaths() -> [String] {
        let controller = FIFinderSyncController.default()
        let selectedURLs = controller.selectedItemURLs() ?? []
        let targetedURL = controller.targetedURL()

        let urls = selectedURLs.isEmpty
            ? (targetedURL.map { [$0] } ?? [])
            : selectedURLs

        let paths = Array(Set(urls
            .filter { $0.isFileURL }
            .map(\.path)))
            .sorted()

        rocFinderSyncLog("Resolved \(paths.count) current selected paths.")
        if let targetedURL {
            rocFinderSyncLog("Targeted URL: \(targetedURL.path)")
        }
        if !selectedURLs.isEmpty {
            rocFinderSyncLog("selectedItemURLs count: \(selectedURLs.count)")
        }

        return paths
    }

    private func monitoredDirectories() -> [URL] {
        var directories = [URL(fileURLWithPath: "/", isDirectory: true)]
        let volumesURL = URL(fileURLWithPath: "/Volumes", isDirectory: true)
        if FileManager.default.fileExists(atPath: volumesURL.path) {
            directories.append(volumesURL)
        }
        return Array(Set(directories))
    }

    private func launchFinderHost(with paths: [String]) throws {
        let payloadData = try JSONEncoder().encode(paths)
        let encodedPayload = payloadData.base64EncodedString()
        var components = URLComponents()
        components.scheme = ROCFinderBuildConfig.urlScheme
        components.host = "ask-claw"
        components.queryItems = [
            URLQueryItem(name: "payload", value: encodedPayload)
        ]

        guard let url = components.url else {
            throw NSError(domain: "RightOnClawFinderSync", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Failed to build Ask Claw launch URL."
            ])
        }

        NSWorkspace.shared.open(url)
    }
}

private func rocFinderSyncLog(_ message: String) {
    rocFinderSyncLogger.log("\(message, privacy: .public)")
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let logLine = "[FinderSync][\(timestamp)][pid:\(ProcessInfo.processInfo.processIdentifier)] \(message)\n"

    guard let data = logLine.data(using: .utf8) else {
        return
    }

    let logURL = URL(fileURLWithPath: ROCFinderBuildConfig.logFilePath)
    let directoryURL = logURL.deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)

    if FileManager.default.fileExists(atPath: logURL.path) == false {
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
    }

    guard let handle = try? FileHandle(forWritingTo: logURL) else {
        return
    }

    defer {
        try? handle.close()
    }

    try? handle.seekToEnd()
    try? handle.write(contentsOf: data)
}

@main
struct RightOnClawFinderExtensionMain {
    static func main() {
        _ = rocFinderSyncExtensionMain(CommandLine.argc, CommandLine.unsafeArgv)
    }
}

@_silgen_name("NSExtensionMain")
private func rocFinderSyncExtensionMain(
    _ argc: Int32,
    _ argv: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int32
