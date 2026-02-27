import { resolveLanguageConfig } from "./languages";
import type { CodeBlockLanguages } from "./languages";

export interface CodeblockLineNumbers {
  enabled: boolean | null;
  offset: number;
}

export interface CodeblockParameters {
  language: string;
  title: string;
  langColor: string;
  titleColor: string;
  lineNumbers: CodeblockLineNumbers;
  highlights: number[];
}

export interface CalloutFenceEntry {
  fenceLine: string;
  content: string;
}

export function parseCodeblockParameters(
  fenceLine?: string | null,
): CodeblockParameters {
  const params: CodeblockParameters = {
    language: "",
    title: "",
    langColor: "",
    titleColor: "",
    lineNumbers: {
      enabled: null,
      offset: 1,
    },
    highlights: [],
  };

  if (!fenceLine) {
    return params;
  }

  const trimmed = fenceLine.replace(/^[`~]{3,}\s*/, "").trim();
  if (!trimmed) {
    return params;
  }

  const langMatch = trimmed.match(/^([a-zA-Z0-9+#-]+)/);
  if (langMatch) {
    const lang = langMatch[1];
    if (lang) {
      params.language = lang.toLowerCase();
    }
  }

  const titleMatch = trimmed.match(
    /title[:=]\s*["']([^"']+)["']|title[:=]\s*(\S+)/i,
  );
  if (titleMatch) {
    const titleValue = titleMatch[1] || titleMatch[2];
    if (titleValue) {
      params.title = titleValue;
    }
  }

  const langColorMatch = trimmed.match(/lang-color[:=]\s*#?([0-9a-fA-F]{6})/i);
  if (langColorMatch) {
    params.langColor = `#${langColorMatch[1]}`;
  }

  const titleColorMatch = trimmed.match(/title-color[:=]\s*#?([0-9a-fA-F]{6})/i);
  if (titleColorMatch) {
    params.titleColor = `#${titleColorMatch[1]}`;
  }

  const lnMatch = trimmed.match(/ln[:=]\s*(true|false|\d+)/i);
  if (lnMatch) {
    const lnValue = lnMatch[1];
    if (lnValue) {
      const val = lnValue.toLowerCase();
      if (val === "true") {
        params.lineNumbers.enabled = true;
      } else if (val === "false") {
        params.lineNumbers.enabled = false;
      } else {
        params.lineNumbers.enabled = true;
        params.lineNumbers.offset = parseInt(val, 10);
      }
    }
  }

  const hlMatch = trimmed.match(/hl[:=]\s*([0-9,\-\s]+)/i);
  if (hlMatch) {
    const hlStr = hlMatch[1] || "";
    if (hlStr) {
      const parts = hlStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const part of parts) {
        if (part.includes("-")) {
          const [start = NaN, end = NaN] = part
            .split("-")
            .map((n) => parseInt(n.trim(), 10));
          if (!Number.isNaN(start) && !Number.isNaN(end)) {
            for (let i = start; i <= end; i++) {
              params.highlights.push(i);
            }
          }
        } else {
          const num = parseInt(part, 10);
          if (!Number.isNaN(num)) {
            params.highlights.push(num);
          }
        }
      }
    }
  }

  return params;
}

export function normalizeCodeContent(text?: string | null): string {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.map((line) => line.replace(/\s+$/g, "")).join("\n");
}

export function normalizeCodeContentLoose(text?: string | null): string {
  const normalized = normalizeCodeContent(text);
  const lines = normalized.split("\n");
  const trimmedLines = lines.map((line) => line.replace(/^\s+/, ""));
  return trimmedLines.join("\n");
}

export function isFrontmatterCodeBlock(
  preEl?: Element | null,
  codeEl?: Element | null,
): boolean {
  if (!preEl || !codeEl) {
    return false;
  }
  if (
    preEl.closest(
      ".metadata-container, .metadata-properties, .metadata-section, .frontmatter, .frontmatter-container",
    )
  ) {
    return true;
  }
  const langClass = Array.from(codeEl.classList).find((c) =>
    c.startsWith("language-"),
  );
  if (langClass === "language-yaml") {
    const content = (codeEl.textContent || "").trim();
    if (!content) {
      return true;
    }
  }
  return false;
}

export function stripCalloutPrefix(line: string): string {
  return line.replace(/^\s*(?:>\s*)+/, "");
}

export function extractCalloutFenceEntries(
  text?: string | null,
): CalloutFenceEntry[] {
  if (!text) {
    return [];
  }
  const lines = text.split("\n");
  const entries: CalloutFenceEntry[] = [];
  let inBlock = false;
  let fenceChar = "";
  let fenceLine = "";
  let contentLines: string[] = [];

  for (const line of lines) {
    const isCalloutLine = /^\s*>/.test(line);
    if (!isCalloutLine) {
      if (inBlock) {
        inBlock = false;
        fenceChar = "";
        fenceLine = "";
        contentLines = [];
      }
      continue;
    }

    const strippedLine = stripCalloutPrefix(line);

    if (!inBlock) {
    const fenceMatch = strippedLine.match(/^([`~]{3,})(.*)$/);
      if (fenceMatch) {
        inBlock = true;
        const fenceChars = fenceMatch[1] || "";
        fenceChar = fenceChars[0] || "";
        fenceLine = strippedLine;
        contentLines = [];
      }
      continue;
    }

    const closingFence = new RegExp(`^${fenceChar}{3,}\\s*$`);
    if (closingFence.test(strippedLine)) {
      const content = normalizeCodeContent(contentLines.join("\n"));
      entries.push({ fenceLine, content });
      inBlock = false;
      fenceChar = "";
      fenceLine = "";
      contentLines = [];
      continue;
    }

    contentLines.push(strippedLine);
  }

  return entries;
}

export function findFenceLineByLine(
  sectionText?: string | null,
  startLine?: number | null,
): string | null {
  if (!sectionText || !startLine) {
    return null;
  }
  const lines = sectionText.split("\n");
  let index = Math.min(startLine - 1, lines.length - 1);
  if (index < 0) {
    return null;
  }

  for (let i = index; i >= 0; i--) {
    const rawLine = lines[i];
    if (!rawLine) {
      continue;
    }
    const strippedLine = stripCalloutPrefix(rawLine);
    const fenceMatch = strippedLine.match(/^([`~]{3,})(.*)$/);
    if (fenceMatch) {
      return strippedLine;
    }
  }

  return null;
}

export function findFenceLineForCodeBlock(
  sectionText?: string | null,
  codeText?: string | null,
  language?: string | null,
  codeBlockLanguages?: CodeBlockLanguages,
): string | null {
  if (!sectionText) {
    return null;
  }
  const target = normalizeCodeContent(codeText);
  const targetLoose = normalizeCodeContentLoose(codeText);
  if (!target) {
    return null;
  }

  const targetLines = target.split("\n").map((line) => line.trim());
  const targetSignature = targetLines.filter(Boolean).slice(0, 2).join("\n");

  const lines = sectionText.split("\n");
  let inBlock = false;
  let fenceChar = "";
  let fenceLine = "";
  let contentLines: string[] = [];
  const candidates: string[] = [];

  const languageMatches = (fenceLineText: string) => {
    const fenceLang = parseCodeblockParameters(fenceLineText).language;
    if (!language) {
      return true;
    }
    if (fenceLang === language) {
      return true;
    }
    if (codeBlockLanguages) {
      const targetConfig = resolveLanguageConfig(language, codeBlockLanguages);
      const fenceConfig = resolveLanguageConfig(fenceLang, codeBlockLanguages);
      if (
        targetConfig &&
        fenceConfig &&
        targetConfig.name === fenceConfig.name
      ) {
        return true;
      }
    }
    return false;
  };

  for (const line of lines) {
    const strippedLine = stripCalloutPrefix(line);

    if (!inBlock) {
      const fenceMatch = strippedLine.match(/^([`~]{3,})(.*)$/);
      if (fenceMatch) {
        inBlock = true;
        const fenceChars = fenceMatch[1] || "";
        fenceChar = fenceChars[0] || "";
        fenceLine = strippedLine;
        contentLines = [];
      }
      continue;
    }

    const closingFence = new RegExp(`^${fenceChar}{3,}\\s*$`);
    if (closingFence.test(strippedLine)) {
      const blockContent = normalizeCodeContent(contentLines.join("\n"));
      const blockLoose = normalizeCodeContentLoose(contentLines.join("\n"));
      if (blockContent === target || blockLoose === targetLoose) {
        if (languageMatches(fenceLine)) {
          return fenceLine;
        }
      }

      if (targetSignature) {
        const blockLines = blockContent.split("\n").map((line) => line.trim());
        const blockSignature = blockLines
          .filter(Boolean)
          .slice(0, 2)
          .join("\n");
        if (blockSignature && blockSignature === targetSignature) {
          if (languageMatches(fenceLine)) {
            candidates.push(fenceLine);
          }
        }
      }

      inBlock = false;
      fenceChar = "";
      fenceLine = "";
      contentLines = [];
      continue;
    }

    contentLines.push(strippedLine);
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return null;
}
