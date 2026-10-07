import { cleanMultiline, escapeText } from "./html";
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

// Examples: extra cell properties `help.<formatter>.<name>`, saved by draw.io
// as `data-help.<formatter>.<name>`. The browser lowercases attribute names,
// so the name is shown as written there, with `_` as a space.
export const EXAMPLE_FORMATTERS = Object.freeze(["text", "shell", "yaml", "json", "log", "containerfile"] as const);
export type ExampleFormatter = (typeof EXAMPLE_FORMATTERS)[number];

// The dot the engine draws on a cell with examples. It is no part of the
// cell's drawing: every measurement of a cell's shapes leaves it out.
export const EXAMPLE_MARKER_CLASS = "dwk-example-marker";

export function excludingExampleMarkers(selectorList: string): string {
  return selectorList
    .split(",")
    .map((selector) => `${selector.trim()}:not(.${EXAMPLE_MARKER_CLASS})`)
    .join(", ");
}

// The help text's tab; examples are numbered from 0.
export const HELP_TAB = -1;

export interface HelpExample {
  formatter: string;
  name: string;
  title: string;
  code: string;
  searchText: string;
}

export function isKnownExampleFormatter(formatter: string): formatter is ExampleFormatter {
  return (EXAMPLE_FORMATTERS as readonly string[]).includes(formatter);
}

// `data-help.yaml.falco_rule` -> { formatter: "yaml", name: "falco_rule" };
// null for any other attribute. A missing part is an empty string.
export function parseExampleAttrName(attrName: string, helpAttr: string): { formatter: string; name: string } | null {
  const prefix = `${helpAttr.toLowerCase()}.`;
  const lower = attrName.toLowerCase();
  if (!lower.startsWith(prefix)) return null;
  const rest = attrName.slice(prefix.length);
  const dot = rest.indexOf(".");
  if (dot === -1) return { formatter: rest.toLowerCase(), name: "" };
  return { formatter: rest.slice(0, dot).toLowerCase(), name: rest.slice(dot + 1) };
}

export function buildHelpExample(formatter: string, name: string, rawCode: string): HelpExample {
  const title = name.replace(/_/g, " ").trim();
  const code = rawCode.replace(/\r\n?/g, "\n").replace(/^\n+|\s+$/g, "");
  return { formatter, name, title, code, searchText: `${title}\n${code}`.toLowerCase() };
}

export function helpMatchesSearch(record: { searchText: string; examples?: readonly HelpExample[] }, query: string): boolean {
  if (!query) return true;
  return record.searchText.includes(query) || (record.examples || []).some((example) => example.searchText.includes(query));
}

// The tab a search should show: the help text when it matches (or nothing is
// searched), else the first example that does.
export function searchTab(record: { searchText: string; examples?: readonly HelpExample[] }, query: string): number {
  if (!query || record.searchText.includes(query)) return HELP_TAB;
  const index = (record.examples || []).findIndex((example) => example.searchText.includes(query));
  return index === -1 ? HELP_TAB : index;
}

type TokenRule = readonly [className: string, pattern: string];

const STRING_RULE: TokenRule = ["string", String.raw`"(?:[^"\\]|\\.)*"|'[^']*'`];
const HASH_COMMENT_RULE: TokenRule = ["comment", String.raw`(?:^|(?<=\s))#.*$`];

const TOKEN_RULES: Record<ExampleFormatter, readonly TokenRule[]> = {
  text: [],
  shell: [
    HASH_COMMENT_RULE,
    ["prompt", String.raw`^\s*[$#](?=\s)`],
    STRING_RULE,
    ["variable", String.raw`\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*`],
    ["flag", String.raw`(?<=\s)--?[A-Za-z0-9][\w-]*`],
  ],
  yaml: [
    HASH_COMMENT_RULE,
    ["key", String.raw`(?<=^\s*(?:- )?)[\w.\-/]+(?=:(?:\s|$))`],
    STRING_RULE,
    ["literal", String.raw`(?<=[:\-\[,]\s*)(?:true|false|null|~|-?\d+(?:\.\d+)?)(?=\s*(?:[,\]#]|$))`],
  ],
  json: [
    ["key", String.raw`"(?:[^"\\]|\\.)*"(?=\s*:)`],
    STRING_RULE,
    ["literal", String.raw`\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`],
  ],
  log: [
    ["time", String.raw`\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b`],
    ["level-error", String.raw`\b(?:EMERGENCY|ALERT|CRITICAL|ERROR|FATAL|Emergency|Alert|Critical|Error|Fatal)\b`],
    ["level-warn", String.raw`\b(?:WARNING|WARN|NOTICE|Warning|Notice)\b`],
    ["level-info", String.raw`\b(?:INFO|DEBUG|TRACE|Informational|Info|Debug)\b`],
    STRING_RULE,
    ["key", String.raw`\b[\w.\-]+(?==)`],
  ],
  containerfile: [
    HASH_COMMENT_RULE,
    ["keyword", String.raw`^\s*(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b|\bAS\b`],
    STRING_RULE,
    ["variable", String.raw`\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*`],
    ["flag", String.raw`(?<=\s)--[\w-]+`],
  ],
};

const TOKEN_REGEXES = new Map(
  Object.entries(TOKEN_RULES).map(([formatter, rules]) => [
    formatter,
    rules.length ? { classes: rules.map(([className]) => className), regex: new RegExp(rules.map(([, pattern]) => `(${pattern})`).join("|"), "gm") } : null,
  ]),
);

// Escaped HTML with tokens in `<span class="dwk-code-<class>">`. Unknown
// formatters are plain text.
export function highlightExample(code: string, formatter: string): string {
  const compiled = TOKEN_REGEXES.get(formatter);
  if (!compiled) return escapeText(code);
  let html = "";
  let last = 0;
  compiled.regex.lastIndex = 0;
  for (const match of code.matchAll(compiled.regex)) {
    if (!match[0]) continue;
    const group = match.findIndex((value, index) => index > 0 && value !== undefined);
    html += escapeText(code.slice(last, match.index));
    html += `<span class="dwk-code-${compiled.classes[group - 1]}">${escapeText(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return html + escapeText(code.slice(last));
}
