import { resolveSelectionContext } from "@rightonclaw/core";
import type { ActionRequest, SelectionContext, SelectionContextItem } from "@rightonclaw/types";

export function getRequestSelectionContext(
  request: Pick<ActionRequest, "selection" | "selection_context" | "source">
): SelectionContext {
  return resolveSelectionContext(request);
}

export function buildSelectionContextPromptBlock(context: SelectionContext): string {
  const lines = [
    "Selection context:",
    `- Kind: ${context.kind}`,
    `- Summary: ${context.summary ?? "No summary available."}`
  ];

  if (context.source_app) {
    lines.push(`- Source app: ${context.source_app}`);
  }

  if (context.capture?.mode) {
    lines.push(`- Capture mode: ${context.capture.mode}`);
  }

  if (context.text?.value) {
    lines.push("BEGIN_SELECTED_TEXT");
    lines.push(truncateText(context.text.value));
    lines.push("END_SELECTED_TEXT");
  }

  const items = context.items ?? [];
  if (items.length > 0) {
    lines.push("Selected items:");
    for (const item of items) {
      lines.push(`- ${formatSelectionItem(item)}`);
    }
  }

  return lines.join("\n");
}

function formatSelectionItem(item: SelectionContextItem): string {
  const details = [
    `${capitalize(item.item_kind)}${item.name ? `: ${item.name}` : ""}`,
    item.mime_type ? `mime=${item.mime_type}` : null,
    item.extension ? `ext=${item.extension}` : null,
    typeof item.size_bytes === "number" ? `size=${item.size_bytes}` : null,
    item.path ? `path=${item.path}` : null
  ].filter(Boolean);

  return details.join(", ");
}

function truncateText(input: string, maxChars = 12_000): string {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars)}\n[truncated by RightOnClaw for prompt safety]`;
}

function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}
