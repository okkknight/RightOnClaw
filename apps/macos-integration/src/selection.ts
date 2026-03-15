import fs from "node:fs/promises";
import path from "node:path";

import type { ActionSelection } from "@rightonclaw/types";

export async function buildTextSelection(text: string): Promise<ActionSelection> {
  return {
    kind: "text",
    text,
    paths: [],
    mime: "text/plain",
    encoding: "utf-8",
    char_count: text.length
  };
}

export async function buildPathSelection(inputPaths: string[]): Promise<ActionSelection> {
  const normalizedPaths = inputPaths.map((entry) => path.resolve(entry));
  const stats = await Promise.all(normalizedPaths.map(async (entry) => fs.stat(entry)));
  const allDirectories = stats.every((entry) => entry.isDirectory());

  return {
    kind: allDirectories ? "directory" : "file",
    text: null,
    paths: normalizedPaths,
    mime: allDirectories ? "inode/directory" : null,
    encoding: null,
    char_count: null
  };
}

export async function buildManualSelection(): Promise<ActionSelection> {
  return {
    kind: "manual",
    text: null,
    paths: [],
    mime: null,
    encoding: null,
    char_count: null
  };
}
