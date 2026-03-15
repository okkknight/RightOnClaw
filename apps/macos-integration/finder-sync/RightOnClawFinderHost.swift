import AppKit
import Foundation

enum ROCFinderHostError: Error {
    case missingPayload
    case invalidPayload
}

enum ROCFinderHostConfig {
    static let payloadArgument = "--ask-claw-paths-base64"
}

final class ROCFinderHostAppDelegate: NSObject, NSApplicationDelegate {
    private var pendingPaths: [String]?
    private var didHandleLaunch = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            self.handleLaunchIfNeeded()
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first else {
            return
        }

        rocFinderLog("Finder host received URL: \(url.absoluteString)")
        if let paths = try? decodePaths(from: url), !paths.isEmpty {
            pendingPaths = paths
        }
        handleLaunchIfNeeded()
    }

    private func handleLaunchIfNeeded() {
        guard !didHandleLaunch else {
            return
        }

        rocFinderLog("Finder host launch arguments: \(CommandLine.arguments.joined(separator: " "))")
        do {
            let paths = pendingPaths ?? (try? decodePaths()) ?? []
            guard !paths.isEmpty else {
                throw ROCFinderHostError.missingPayload
            }

            didHandleLaunch = true
            try launchWorkflowCli(with: paths)
        } catch {
            if case ROCFinderHostError.missingPayload = error {
                // Finder Sync registration warm-up launches the containing app once with no payload.
            } else {
                rocFinderLog("Finder host failed: \(error)")
            }
        }

        NSApp.terminate(nil)
    }

    private func decodePaths() throws -> [String] {
        let arguments = CommandLine.arguments
        guard let flagIndex = arguments.firstIndex(of: ROCFinderHostConfig.payloadArgument),
              arguments.indices.contains(flagIndex + 1)
        else {
            throw ROCFinderHostError.missingPayload
        }

        let encodedPayload = arguments[flagIndex + 1]
        guard let payloadData = Data(base64Encoded: encodedPayload),
              let decodedPaths = try? JSONDecoder().decode([String].self, from: payloadData)
        else {
            throw ROCFinderHostError.invalidPayload
        }

        return decodedPaths.filter { !$0.isEmpty }
    }

    private func decodePaths(from url: URL) throws -> [String] {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let payload = components.queryItems?.first(where: { $0.name == "payload" })?.value,
              let payloadData = Data(base64Encoded: payload),
              let decodedPaths = try? JSONDecoder().decode([String].self, from: payloadData)
        else {
            throw ROCFinderHostError.invalidPayload
        }

        return decodedPaths.filter { !$0.isEmpty }
    }

    private func launchWorkflowCli(with paths: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = ["-lc", buildShellCommand(), "--"] + paths
        process.standardInput = nil
        process.standardOutput = nil
        process.standardError = nil
        try process.run()
        rocFinderLog("Finder host launched workflow-cli for \(paths.count) paths.")
    }

    private func buildShellCommand() -> String {
        let cliPath = ROCFinderBuildConfig.workflowCliPath.replacingOccurrences(of: "'", with: "'\\''")
        let preferredNodeBinary = ROCFinderBuildConfig.preferredNodeBinary.replacingOccurrences(of: "'", with: "'\\''")
        let logFilePath = ROCFinderBuildConfig.logFilePath.replacingOccurrences(of: "'", with: "'\\''")

        return [
            "set -euo pipefail",
            "export PATH=\"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH\"",
            "NODE_BIN='\(preferredNodeBinary)'",
            "if [ ! -x \"$NODE_BIN\" ]; then NODE_BIN=\"$(command -v node)\"; fi",
            "LOG_FILE='\(logFilePath)'",
            "mkdir -p \"$(dirname \"$LOG_FILE\")\"",
            "nohup \"$NODE_BIN\" '\(cliPath)' run ask_claw paths \"$@\" >> \"$LOG_FILE\" 2>&1 < /dev/null &"
        ].joined(separator: "\n")
    }
}

private func rocFinderLog(_ message: String) {
    let logLine = "[FinderHost] \(message)\n"
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
struct RightOnClawFinderHostMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = ROCFinderHostAppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        _ = NSApplicationMain(CommandLine.argc, CommandLine.unsafeArgv)
    }
}
