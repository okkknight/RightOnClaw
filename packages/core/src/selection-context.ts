import fs from "node:fs/promises";
import path from "node:path";

import type {
  ActionRequest,
  ActionSelection,
  SelectionContext,
  SelectionContextItem,
  SelectionContextKind
} from "@rightonclaw/types";

import { AppError } from "./errors/app-error";
import { ERROR_CODES } from "./errors/error-codes";

type SelectionContextInput = Pick<ActionRequest, "selection" | "source"> & {
  selection_context?: SelectionContext;
};

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

export function resolveSelectionContext(input: SelectionContextInput): SelectionContext {
  const derived = deriveContextFromSelection(input.selection, {
    sourceApp: input.source.app_name,
    capture: input.selection_context?.capture ?? null
  });
  return finalizeSelectionContext(mergeSelectionContexts(derived, input.selection_context, input.source.app_name));
}

export async function normalizeSelectionContext(input: SelectionContextInput): Promise<SelectionContext> {
  if (input.selection.kind === "text") {
    return resolveSelectionContext(input);
  }

  const items = await Promise.all(
    input.selection.paths.map(async (entry) => buildSelectionItemFromPath(entry, input.selection.mime ?? null))
  );

  const baseContext = mergeSelectionContexts(
    {
      kind: deriveContextKindFromItems(items, input.selection_context?.capture?.mode === "screenshot"),
      items,
      source_app: input.source.app_name,
      capture: input.selection_context?.capture ?? defaultCaptureForSelection(input.selection)
    },
    input.selection_context,
    input.source.app_name
  );

  return finalizeSelectionContext(baseContext);
}

export function buildSelectionSummary(context: SelectionContext): string {
  if (context.kind === "screenshot") {
    return "Screenshot captured";
  }

  if (context.kind === "text" && context.text) {
    return `Selected text (${context.text.char_count} chars)`;
  }

  const items = context.items ?? [];
  if (items.length === 0) {
    return "No selection context available";
  }

  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.item_kind, (counts.get(item.item_kind) ?? 0) + 1);
  }

  const countSummary = [...counts.entries()]
    .map(([kind, count]) => `${count} ${pluralizeSelectionKind(kind, count)}`)
    .join(", ");
  const names = items
    .map((item) => item.name)
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)
    .join(", ");

  return names ? `${countSummary}: ${names}` : countSummary;
}

export function getSelectionItemCount(context: SelectionContext): number {
  const itemCount = context.items?.length ?? 0;
  if (itemCount > 0) {
    return itemCount;
  }

  return context.text ? 1 : 0;
}

export function isPureTextSelectionContext(context: SelectionContext): boolean {
  const items = context.items ?? [];
  return context.kind === "text" && Boolean(context.text?.value) && (items.length === 0 || items.every((item) => item.item_kind === "text"));
}

function deriveContextFromSelection(
  selection: ActionSelection,
  input: {
    sourceApp?: string;
    capture?: SelectionContext["capture"];
  }
): SelectionContext {
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
          inline_text_preview: truncateInlineText(selection.text, 180)
        }
      ],
      source_app: input.sourceApp,
      capture: input.capture ?? defaultCaptureForSelection(selection)
    };
  }

  if (selection.kind === "manual") {
    return {
      kind: "mixed",
      items: [],
      source_app: input.sourceApp,
      capture: input.capture ?? defaultCaptureForSelection(selection),
      summary: "No selection captured"
    };
  }

  const items = selection.paths.map((entry) =>
    deriveSelectionItemFromPath(entry, selection.mime ?? null, selection.kind === "directory")
  );

  return {
    kind: deriveContextKindFromItems(items, input.capture?.mode === "screenshot"),
    items,
    source_app: input.sourceApp,
    capture: input.capture ?? defaultCaptureForSelection(selection)
  };
}

async function buildSelectionItemFromPath(entry: string, mimeHint: string | null): Promise<SelectionContextItem> {
  try {
    const stats = await fs.stat(entry);
    const base = deriveSelectionItemFromPath(entry, mimeHint, stats.isDirectory());
    return {
      ...base,
      size_bytes: stats.isDirectory() ? null : stats.size
    };
  } catch (error) {
    throw new AppError({
      code: ERROR_CODES.FILE_ACCESS_FAILED,
      message: "The selected file could not be accessed.",
      phase: "validation",
      retryable: false,
      statusCode: 400,
      details: {
        path: entry,
        reason: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

function deriveSelectionItemFromPath(entry: string, mimeHint: string | null, directoryHint: boolean): SelectionContextItem {
  const extension = path.extname(entry) || null;
  const normalizedMime = normalizeMimeType(mimeHint, extension);
  const itemKind = directoryHint ? "folder" : inferSelectionItemKind(entry, normalizedMime);

  return {
    item_kind: itemKind,
    path: entry,
    name: path.basename(entry),
    mime_type: directoryHint ? "inode/directory" : normalizedMime,
    size_bytes: null,
    extension
  };
}

function inferSelectionItemKind(entry: string, mimeType: string | null): SelectionContextItem["item_kind"] {
  if (mimeType?.startsWith("image/")) {
    return "image";
  }

  const extension = path.extname(entry).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  return "file";
}

function normalizeMimeType(mimeType: string | null, extension: string | null): string | null {
  if (mimeType && mimeType !== "application/octet-stream") {
    return mimeType;
  }

  if (!extension) {
    return mimeType;
  }

  switch (extension.toLowerCase()) {
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
    case ".txt":
    case ".md":
    case ".json":
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
    case ".py":
    case ".sh":
      return "text/plain";
    default:
      return mimeType;
  }
}

function deriveContextKindFromItems(items: SelectionContextItem[], screenshotMode: boolean): SelectionContextKind {
  if (screenshotMode) {
    return "screenshot";
  }

  if (items.length === 0) {
    return "mixed";
  }

  const kinds = new Set(items.map((item) => item.item_kind));
  if (kinds.size > 1) {
    return "mixed";
  }

  const firstKind = items[0]?.item_kind;
  switch (firstKind) {
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

function mergeSelectionContexts(
  base: SelectionContext,
  override: SelectionContext | undefined,
  sourceAppFallback?: string
): SelectionContext {
  if (!override) {
    return {
      ...base,
      source_app: base.source_app ?? sourceAppFallback
    };
  }

  return {
    kind: override.kind ?? base.kind,
    text: override.text ?? base.text,
    items: override.items ?? base.items,
    source_app: override.source_app ?? base.source_app ?? sourceAppFallback,
    capture: override.capture ?? base.capture,
    summary: override.summary ?? base.summary
  };
}

function finalizeSelectionContext(context: SelectionContext): SelectionContext {
  return {
    ...context,
    summary: context.summary ?? buildSelectionSummary(context)
  };
}

function defaultCaptureForSelection(selection: ActionSelection): SelectionContext["capture"] {
  return {
    mode: selection.kind === "manual" ? "manual" : selection.kind === "directory" ? "finder" : "selection",
    created_at: new Date().toISOString()
  };
}

function truncateInlineText(input: string, maxChars: number): string {
  const trimmed = input.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxChars - 3).trimEnd()}...`;
}

function pluralizeSelectionKind(kind: string, count: number): string {
  if (count === 1) {
    return kind;
  }

  if (kind === "folder") {
    return "folders";
  }

  return `${kind}s`;
}
