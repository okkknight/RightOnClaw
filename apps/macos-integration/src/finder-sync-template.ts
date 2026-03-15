import path from "node:path";

export const FINDER_SYNC_HOST_APP_NAME = "RightOnClawFinderHost.app";
export const FINDER_SYNC_HOST_EXECUTABLE = "RightOnClawFinderHost";
export const FINDER_SYNC_HOST_BUNDLE_IDENTIFIER = "com.rightonclaw.finder-host";
export const FINDER_SYNC_HOST_URL_SCHEME = "rightonclaw-finder-host";
export const FINDER_SYNC_EXTENSION_NAME = "RightOnClawFinderExtension.appex";
export const FINDER_SYNC_EXTENSION_EXECUTABLE = "RightOnClawFinderExtension";
export const FINDER_SYNC_EXTENSION_BUNDLE_IDENTIFIER = "com.rightonclaw.finder-extension";
export const FINDER_SYNC_EXTENSION_PRINCIPAL_CLASS = "RightOnClawFinderExtension.RightOnClawFinderSync";
export const FINDER_SYNC_PAYLOAD_ARGUMENT = "--ask-claw-paths-base64";

export interface FinderSyncBuildDefinition {
  buildRoot: string;
  projectRoot: string;
  hostAppBundlePath: string;
  hostExecutablePath: string;
  hostInfoPlistPath: string;
  extensionBundlePath: string;
  extensionExecutablePath: string;
  extensionInfoPlistPath: string;
  extensionEntitlementsPath: string;
  generatedSwiftPath: string;
  logFilePath: string;
  workflowCliPath: string;
  preferredNodeBinary: string;
}

export function getFinderSyncBuildDefinition(packageRoot: string, projectRoot: string, preferredNodeBinary: string): FinderSyncBuildDefinition {
  const buildRoot = path.join(packageRoot, "dist", "finder-sync");
  const hostAppBundlePath = path.join(buildRoot, FINDER_SYNC_HOST_APP_NAME);
  const hostContentsPath = path.join(hostAppBundlePath, "Contents");
  const extensionBundlePath = path.join(hostContentsPath, "PlugIns", FINDER_SYNC_EXTENSION_NAME);

  return {
    buildRoot,
    projectRoot,
    hostAppBundlePath,
    hostExecutablePath: path.join(hostContentsPath, "MacOS", FINDER_SYNC_HOST_EXECUTABLE),
    hostInfoPlistPath: path.join(hostContentsPath, "Info.plist"),
    extensionBundlePath,
    extensionExecutablePath: path.join(extensionBundlePath, "Contents", "MacOS", FINDER_SYNC_EXTENSION_EXECUTABLE),
    extensionInfoPlistPath: path.join(extensionBundlePath, "Contents", "Info.plist"),
    extensionEntitlementsPath: path.join(buildRoot, "RightOnClawFinderExtension.entitlements"),
    generatedSwiftPath: path.join(buildRoot, "RightOnClawFinderBuildConfig.generated.swift"),
    logFilePath: path.join(projectRoot, "..", "..", "runtime", "logs", "rightonclaw", "finder-sync.log"),
    workflowCliPath: path.join(packageRoot, "dist", "workflow-cli.js"),
    preferredNodeBinary
  };
}

export function buildFinderHostInfoPlist(): Record<string, unknown> {
  return {
    CFBundleDisplayName: "RightOnClaw Finder Host",
    CFBundleExecutable: FINDER_SYNC_HOST_EXECUTABLE,
    CFBundleIdentifier: FINDER_SYNC_HOST_BUNDLE_IDENTIFIER,
    CFBundleInfoDictionaryVersion: "6.0",
    CFBundleName: "RightOnClawFinderHost",
    CFBundlePackageType: "APPL",
    CFBundleShortVersionString: "0.1.0",
    CFBundleVersion: "1",
    CFBundleURLTypes: [
      {
        CFBundleTypeRole: "Editor",
        CFBundleURLName: FINDER_SYNC_HOST_BUNDLE_IDENTIFIER,
        CFBundleURLSchemes: [FINDER_SYNC_HOST_URL_SCHEME]
      }
    ],
    LSUIElement: true,
    NSPrincipalClass: "NSApplication"
  };
}

export function buildFinderSyncExtensionInfoPlist(): Record<string, unknown> {
  return {
    CFBundleDisplayName: "RightOnClaw Finder Extension",
    CFBundleExecutable: FINDER_SYNC_EXTENSION_EXECUTABLE,
    CFBundleIdentifier: FINDER_SYNC_EXTENSION_BUNDLE_IDENTIFIER,
    CFBundleInfoDictionaryVersion: "6.0",
    CFBundleName: "RightOnClawFinderExtension",
    CFBundlePackageType: "XPC!",
    CFBundleShortVersionString: "0.1.0",
    CFBundleVersion: "1",
    LSMinimumSystemVersion: "10.14",
    LSUIElement: true,
    NSExtension: {
      NSExtensionAttributes: {},
      NSExtensionPointIdentifier: "com.apple.FinderSync",
      NSExtensionPrincipalClass: FINDER_SYNC_EXTENSION_PRINCIPAL_CLASS
    },
    NSPrincipalClass: "NSApplication"
  };
}

export function buildFinderSyncExtensionEntitlements(): Record<string, unknown> {
  return {
    "com.apple.security.app-sandbox": true,
    "com.apple.security.files.user-selected.read-only": true
  };
}

export function buildFinderSyncGeneratedSwift(definition: FinderSyncBuildDefinition): string {
  const escapeSwift = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  return [
    "import Foundation",
    "",
    "enum ROCFinderBuildConfig {",
    `    static let workflowCliPath = \"${escapeSwift(definition.workflowCliPath)}\"`,
    `    static let preferredNodeBinary = \"${escapeSwift(definition.preferredNodeBinary)}\"`,
    `    static let logFilePath = \"${escapeSwift(definition.logFilePath)}\"`,
    `    static let projectRoot = \"${escapeSwift(definition.projectRoot)}\"`,
    `    static let payloadArgument = \"${escapeSwift(FINDER_SYNC_PAYLOAD_ARGUMENT)}\"`,
    `    static let urlScheme = \"${escapeSwift(FINDER_SYNC_HOST_URL_SCHEME)}\"`,
    "}"
  ].join("\n");
}
