import { runAppleScript } from "./apple-script";

export interface FrontmostAppContext {
  appName?: string;
  bundleId?: string;
}

export async function getFrontmostAppContext(): Promise<FrontmostAppContext> {
  try {
    const output = await runAppleScript(`
tell application "System Events"
  tell first application process whose frontmost is true
    set appName to name
    set bundleId to bundle identifier
    return appName & linefeed & bundleId
  end tell
end tell
`);

    const [appName, bundleId] = output.split("\n");
    return {
      appName: appName || undefined,
      bundleId: bundleId || undefined
    };
  } catch {
    return {};
  }
}

