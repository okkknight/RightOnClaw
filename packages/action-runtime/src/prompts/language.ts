import { execFileSync } from "node:child_process";

const LANGUAGE_MAP: Record<string, string> = {
  zh: "Simplified Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian"
};

let cachedRuntimeLocale: string | null | undefined;

export function buildPreferredOutputLanguageInstruction(): string {
  const explicit = normalizeExplicitLanguage(process.env.RIGHTONCLAW_OUTPUT_LANGUAGE);
  const preferredLanguage = explicit ?? resolvePreferredSystemLanguage();

  return [
    `Output language: ${preferredLanguage}.`,
    `Write the final answer in ${preferredLanguage} even when the source text is in English or another language.`,
    "Keep exact code, identifiers, commands, log lines, and short quoted snippets in the original language only when necessary."
  ].join(" ");
}

function normalizeExplicitLanguage(input: string | undefined): string | null {
  if (!input || input.trim().length === 0) {
    return null;
  }

  return input.trim();
}

function detectRuntimeLocale(): string | null {
  if (cachedRuntimeLocale !== undefined) {
    return cachedRuntimeLocale;
  }

  const macosLocale = detectMacOSPreferredLocale();
  if (macosLocale) {
    cachedRuntimeLocale = macosLocale;
    return macosLocale;
  }

  const envLocale =
    process.env.LC_ALL ??
    process.env.LC_MESSAGES ??
    process.env.LANG ??
    process.env.LANGUAGE;

  if (envLocale && envLocale.trim().length > 0) {
    cachedRuntimeLocale = envLocale.replace(/\.UTF-?8$/i, "").trim();
    return cachedRuntimeLocale;
  }

  const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  cachedRuntimeLocale = intlLocale && intlLocale.trim().length > 0 ? intlLocale : null;
  return cachedRuntimeLocale;
}

function resolvePreferredSystemLanguage(): string {
  const locale = detectRuntimeLocale();
  const mapped = locale ? LANGUAGE_MAP[locale.split(/[-_]/)[0].toLowerCase()] : undefined;
  return mapped ?? "Simplified Chinese";
}

function detectMacOSPreferredLocale(): string | null {
  if (process.platform !== "darwin") {
    return null;
  }

  const appleLanguages = readDefaultsValue("AppleLanguages");
  if (appleLanguages) {
    const matched = appleLanguages.match(/"([^"]+)"/) ?? appleLanguages.match(/[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*/);
    if (matched?.[1]) {
      return matched[1];
    }
    if (matched?.[0]) {
      return matched[0];
    }
  }

  return readDefaultsValue("AppleLocale");
}

function readDefaultsValue(key: string): string | null {
  try {
    const value = execFileSync("/usr/bin/defaults", ["read", "-g", key], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
