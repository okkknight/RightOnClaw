export interface AppSupportContext {
  appName?: string;
  bundleId?: string;
}

export interface DirectApplyPolicyDecision {
  allowed: boolean;
  reason: string;
  policy: "allowlisted" | "denylisted" | "unknown";
  acceptUnverifiedPaste: boolean;
}

const DIRECT_APPLY_ALLOWLIST = new Set([
  "com.todesktop.230313mzl4w4u92",
  "com.microsoft.VSCode",
  "com.microsoft.VSCodeInsiders",
  "com.apple.TextEdit",
  "com.barebones.bbedit",
  "com.coteditor.CotEditor",
  "com.sublimetext.4"
]);

const DIRECT_APPLY_DENYLIST = new Set([
  "com.apple.finder",
  "com.apple.Terminal",
  "com.googlecode.iterm2",
  "com.apple.Preview"
]);

export function evaluateDirectApplyPolicy(context: AppSupportContext): DirectApplyPolicyDecision {
  if (!context.bundleId && !context.appName) {
    return {
      allowed: false,
      reason: "the source application could not be identified",
      policy: "unknown",
      acceptUnverifiedPaste: false
    };
  }

  if (context.bundleId && DIRECT_APPLY_DENYLIST.has(context.bundleId)) {
    return {
      allowed: false,
      reason: `${context.appName ?? context.bundleId} is on the direct-apply denylist`,
      policy: "denylisted",
      acceptUnverifiedPaste: false
    };
  }

  if (context.bundleId && DIRECT_APPLY_ALLOWLIST.has(context.bundleId)) {
    return {
      allowed: true,
      reason: `${context.appName ?? context.bundleId} is on the direct-apply allowlist`,
      policy: "allowlisted",
      acceptUnverifiedPaste: true
    };
  }

  return {
    allowed: false,
    reason: `${context.appName ?? context.bundleId ?? "This app"} is not on the direct-apply allowlist`,
    policy: "unknown",
    acceptUnverifiedPaste: false
  };
}
