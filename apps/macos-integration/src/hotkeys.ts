export const DEFAULT_HOTKEYS = {
  ask_claw: "cmd+shift+c",
  screenshot: "cmd+shift+x"
} as const;

export function normalizeHotkeyLabel(input: string): string {
  return input.trim().toLowerCase();
}
