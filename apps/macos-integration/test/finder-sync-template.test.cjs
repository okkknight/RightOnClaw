const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  FINDER_SYNC_PAYLOAD_ARGUMENT,
  FINDER_SYNC_HOST_BUNDLE_IDENTIFIER,
  FINDER_SYNC_HOST_URL_SCHEME,
  FINDER_SYNC_EXTENSION_BUNDLE_IDENTIFIER,
  FINDER_SYNC_EXTENSION_PRINCIPAL_CLASS,
  buildFinderHostInfoPlist,
  buildFinderSyncExtensionEntitlements,
  buildFinderSyncExtensionInfoPlist,
  buildFinderSyncGeneratedSwift,
  getFinderSyncBuildDefinition
} = require("../dist/finder-sync-template.js");

test("Finder Sync template targets a containing app plus FinderSync appex", () => {
  const definition = getFinderSyncBuildDefinition("/repo/apps/macos-integration", "/repo", "/usr/local/bin/node");

  assert.equal(definition.hostAppBundlePath, path.join("/repo/apps/macos-integration", "dist", "finder-sync", "RightOnClawFinderHost.app"));
  assert.equal(definition.extensionBundlePath, path.join("/repo/apps/macos-integration", "dist", "finder-sync", "RightOnClawFinderHost.app", "Contents", "PlugIns", "RightOnClawFinderExtension.appex"));
  assert.equal(definition.workflowCliPath, path.join("/repo/apps/macos-integration", "dist", "workflow-cli.js"));
});

test("Finder Sync extension metadata uses the FinderSync extension point", () => {
  const info = buildFinderSyncExtensionInfoPlist();
  assert.equal(info.CFBundleIdentifier, FINDER_SYNC_EXTENSION_BUNDLE_IDENTIFIER);
  assert.equal(info.CFBundlePackageType, "XPC!");
  assert.equal(info.NSExtension.NSExtensionPointIdentifier, "com.apple.FinderSync");
  assert.equal(info.NSExtension.NSExtensionPrincipalClass, FINDER_SYNC_EXTENSION_PRINCIPAL_CLASS);
});

test("Finder host metadata registers a custom URL scheme for payload handoff", () => {
  const info = buildFinderHostInfoPlist();
  assert.equal(info.CFBundleIdentifier, FINDER_SYNC_HOST_BUNDLE_IDENTIFIER);
  assert.deepEqual(info.CFBundleURLTypes, [
    {
      CFBundleTypeRole: "Editor",
      CFBundleURLName: FINDER_SYNC_HOST_BUNDLE_IDENTIFIER,
      CFBundleURLSchemes: [FINDER_SYNC_HOST_URL_SCHEME]
    }
  ]);
});

test("Finder Sync extension entitlements stay minimal for the PoC", () => {
  const entitlements = buildFinderSyncExtensionEntitlements();
  assert.deepEqual(entitlements, {
    "com.apple.security.app-sandbox": true,
    "com.apple.security.files.user-selected.read-only": true
  });
});

test("Generated Finder Sync Swift config points at the existing ask_claw paths chain", () => {
  const definition = getFinderSyncBuildDefinition("/repo/apps/macos-integration", "/repo", "/usr/local/bin/node");
  const generated = buildFinderSyncGeneratedSwift(definition);

  assert.match(generated, /workflow-cli\.js/);
  assert.match(generated, new RegExp(FINDER_SYNC_PAYLOAD_ARGUMENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(generated, new RegExp(FINDER_SYNC_HOST_URL_SCHEME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
