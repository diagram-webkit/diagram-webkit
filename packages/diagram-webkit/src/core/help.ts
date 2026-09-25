import { cleanMultiline } from "./html";
import { DEFAULT_TEXTS, formatText, type Texts } from "./texts";

export interface ParsedHelp {
  title: string;
  bodyHtml: string;
  searchText: string;
}

export type HelpParser = (rawText: string) => ParsedHelp | null;

export function normalizeQuery(query: string | null | undefined): string {
  return (query || "").trim().toLowerCase();
}

export function helpMatchesSearch(record: { searchText: string }, query: string): boolean {
  if (!query) return true;
  return record.searchText.includes(query);
}

// First non-empty line is the title; the rest is the body with its common
// indentation removed.
export function parseHelpContent(rawText: unknown): ParsedHelp | null {
  if (!rawText || typeof rawText !== "string") return null;

  const normalized = rawText.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return null;

  const lines = normalized.split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) return null;

  const title = lines[firstContentIndex].trim();
  const bodyRaw = lines.slice(firstContentIndex + 1).join("\n");
  const bodyHtml = cleanMultiline(bodyRaw).trim();

  return {
    title,
    bodyHtml,
    searchText: `${title}\n${bodyRaw}`.toLowerCase(),
  };
}

export function getFilterResultSummary(
  helpVisible: number,
  helpTotal: number,
  query: string,
  texts: Pick<Texts, "summaryMatchOne" | "summaryMatchMany" | "summaryAll" | "summarySome"> = DEFAULT_TEXTS,
): string {
  if (query) {
    return formatText(helpVisible === 1 ? texts.summaryMatchOne : texts.summaryMatchMany, {
      count: helpVisible,
      query,
    });
  }
  if (helpVisible === helpTotal) {
    return formatText(texts.summaryAll, { total: helpTotal });
  }
  return formatText(texts.summarySome, { count: helpVisible, total: helpTotal });
}
