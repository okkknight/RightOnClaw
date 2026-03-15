import fs from "node:fs/promises";
import path from "node:path";

import type { ActionSelection, SelectionCaptureMode, SelectionContext, SelectionContextItem } from "@rightonclaw/types";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".svg"
]);

export async function buildSelectionContext(
  selection: ActionSelection,
  input: {
    sourceApp?: string;
    captureMode?: SelectionCaptureMode;
    createdAt?: string;
  } = {}
): Promise<SelectionContext> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const captureMode = input.captureMode ?? defaultCaptureMode(selection);

  if (selection.kind === "text") {
    return {
      kind: "text",
      text: {
        value: selection.text,
        char_count: selection.char_count ?? selection.text.length
      },
      items: [
        {
          item_kind: "text",
          name: "Selected Text",
          mime_type: selection.mime ?? "text/plain",
          inline_text_preview: truncateText(selection.text, 180)
        }
      ],
      source_app: input.sourceApp,
      capture: {
        mode: captureMode,
        created_at: createdAt
      },
      summary: `Selected text (${selection.char_count ?? selection.text.length} chars)`
    };
  }

  if (selection.kind === "manual") {
    return {
      kind: "mixed",
      items: [],
      source_app: input.sourceApp,
      capture: {
        mode: "manual",
        created_at: createdAt
      },
      summary: "No selection captured"
    };
  }

  const items = await Promise.all(selection.paths.map(async (entry) => buildSelectionItem(entry, selection.mime ?? null)));
  const context = {
    kind: deriveContextKind(items, captureMode),
    items,
    source_app: input.sourceApp,
    capture: {
      mode: captureMode,
      created_at: createdAt
    }
  } satisfies SelectionContext;

  return {
    ...context,
    summary: buildDisplaySummary(context)
  };
}

export function buildSelectionDisplay(context: SelectionContext): {
  summary: string;
  detail: string;
} {
  const items = context.items ?? [];
  const detail = items
    .map((item) => item.name)
    .filter((value): value is string => Boolean(value))
    .slice(0, 4)
    .join(", ");

  return {
    summary: context.summary ?? buildDisplaySummary(context),
    detail
  };
}

async function buildSelectionItem(entry: string, mimeHint: string | null): Promise<SelectionContextItem> {
  const resolvedPath = path.resolve(entry);
  const stats = await fs.stat(resolvedPath);
  const extension = path.extname(resolvedPath) || null;
  const mimeType = normalizeMimeType(mimeHint, extension);
  const itemKind = stats.isDirectory() ? "folder" : inferItemKind(resolvedPath, mimeType);

  return {
    item_kind: itemKind,
    path: resolvedPath,
    name: path.basename(resolvedPath),
    mime_type: stats.isDirectory() ? "inode/directory" : mimeType,
    size_bytes: stats.isDirectory() ? null : stats.size,
    extension
  };
}

function inferItemKind(entry: string, mimeType: string | null): SelectionContextItem["item_kind"] {
  if (mimeType?.startsWith("image/")) {
    return "image";
  }

  if (IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
    return "image";
  }

  return "file";
}

function deriveContextKind(items: SelectionContextItem[], captureMode: SelectionCaptureMode): SelectionContext["kind"] {
  if (captureMode === "screenshot") {
    return "screenshot";
  }

  const kinds = new Set(items.map((item) => item.item_kind));
  if (kinds.size > 1) {
    return "mixed";
  }

  switch (items[0]?.item_kind) {
    case "folder":
      return "folder";
    case "image":
      return "image";
    case "text":
      return "text";
    case "file":
    default:
      return "file";
  }
}

function buildDisplaySummary(context: SelectionContext): string {
  if (context.kind === "screenshot") {
    return "Screenshot captured";
  }

  if (context.kind === "text" && context.text) {
    return `Selected text (${context.text.char_count} chars)`;
  }

  const items = context.items ?? [];
  if (items.length === 0) {
    return "No selection captured";
  }

  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.item_kind, (counts.get(item.item_kind) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([kind, count]) => `${count} ${count === 1 ? kind : `${kind}s`}`)
    .join(", ");
}

function normalizeMimeType(mimeHint: string | null, extension: string | null): string | null {
  if (mimeHint && mimeHint !== "application/octet-stream") {
    return mimeHint;
  }

  switch ((extension ?? "").toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return mimeHint;
  }
}

function truncateText(input: string, maxChars: number): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
}

function defaultCaptureMode(selection: ActionSelection): SelectionCaptureMode {
  if (selection.kind === "manual") {
    return "manual";
  }

  if (selection.kind === "directory" || selection.kind === "file") {
    return "finder";
  }

  return "selection";
}
