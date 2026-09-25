export type HtmlNode =
  | { type: "text"; text: string }
  | { type: "element"; tag: string; attrs: Record<string, string>; children: HtmlNode[] }
  | { type: "other" };

// Parses an HTML fragment without executing anything (the DOM layer uses an
// inert DOMParser document; tests use happy-dom).
export type HtmlParser = (html: string) => HtmlNode[];

export type HtmlWhitelist = Readonly<Record<string, readonly string[]>>;

export const DEFAULT_HTML_WHITELIST: HtmlWhitelist = Object.freeze({
  br: [],
  b: [],
  strong: [],
  i: [],
  em: [],
});

// Help text (data-help) of a diagram that did not come with the definition:
// formatting, lists, tables and links; no images (a request) or anything
// that could run.
export const HELP_HTML_WHITELIST: HtmlWhitelist = Object.freeze({
  a: ["href", "title", "target"],
  b: [], strong: [], i: [], em: [], u: [], s: [], small: [], sub: [], sup: [], mark: [],
  code: [], pre: [], kbd: [], br: [], hr: [], p: [], div: [], span: [], blockquote: [],
  ul: [], ol: [], li: [], dl: [], dt: [], dd: [],
  h3: [], h4: [], h5: [], h6: [],
  table: [], thead: [], tbody: [], tr: [], th: [], td: [],
});

const VOID_TAGS = new Set(["br", "hr"]);

// Never emitted, whatever a whitelist says. Like any tag that is not
// allowed they are unwrapped: their text stays, escaped.
export const UNSAFE_TAGS: ReadonlySet<string> = new Set([
  "script", "style", "template", "noscript", "textarea", "title",
  "iframe", "frame", "frameset", "object", "embed", "applet", "svg", "math", "link", "meta", "base", "form", "input", "button", "select",
]);
// Attribute values that are URLs: only these schemes, or relative.
const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href", "action", "formaction", "poster", "cite", "background", "srcset"]);
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

export function isUnsafeAttribute(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("on") || lower === "style" || lower === "srcdoc";
}

// Browsers ignore control characters and whitespace inside a scheme
// ("java\tscript:"), so they are removed before looking at it.
export function isSafeUrl(value: string): boolean {
  const compact = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/i);
  return !scheme || SAFE_SCHEMES.has(`${scheme[1].toLowerCase()}:`);
}

// Throws on a whitelist that would let script in (fail fast at definition
// time; sanitizeUserHtml enforces the same at runtime).
export function assertSafeWhitelist(whitelist: HtmlWhitelist, path: string): void {
  Object.entries(whitelist).forEach(([tag, attributes]) => {
    if (UNSAFE_TAGS.has(tag.toLowerCase())) throw new Error(`${path}.${tag}: tag is never allowed`);
    attributes.filter(isUnsafeAttribute).forEach((name) => {
      throw new Error(`${path}.${tag}: attribute "${name}" is never allowed`);
    });
  });
}

// Same output as `div.innerText = value; div.innerHTML` in a browser.
export function escapeHTML(value: unknown): string {
  const text = value === null ? "" : String(value);
  return escapeText(text)
    .replace(/ /g, "&nbsp;")
    .replace(/\r\n|\r|\n/g, "<br>");
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(text: string): string {
  return escapeText(text).replace(/"/g, "&quot;");
}

export function cleanMultiline(value: string | null | undefined): string {
  if (!value) return "";

  const raw = value.replace(/^\s*\n/, "").trimEnd();
  const lines = raw.split("\n");

  const indent = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^(\s*)/)?.[1].length || 0)
    .reduce((a, b) => Math.min(a, b), Infinity);

  return lines.map((line) => line.slice(indent)).join("<br>");
}

// Keeps whitelisted tags and attributes and unwraps everything else. Text and
// attribute values are escaped, so "&lt;img onerror=..&gt;" stays text. Input is never
// rejected: what is not allowed is dropped and the text stays.
export function sanitizeUserHtml(html: string | null | undefined, parse: HtmlParser, whitelist: HtmlWhitelist): string {
  if (!html) return "";

  const allowedAttribute = (name: string, value: string) =>
    !isUnsafeAttribute(name) && (!URL_ATTRIBUTES.has(name.toLowerCase()) || isSafeUrl(value));

  const clean = (node: HtmlNode): string => {
    if (node.type === "text") return escapeText(node.text);
    if (node.type !== "element") return "";

    const tag = node.tag.toLowerCase();
    const children = node.children.map(clean).join("");
    if (UNSAFE_TAGS.has(tag) || !Object.prototype.hasOwnProperty.call(whitelist, tag)) return children;

    const names = (whitelist[tag] || []).filter((name) => Object.prototype.hasOwnProperty.call(node.attrs, name) && allowedAttribute(name, node.attrs[name]));
    let attrs = names.map((name) => ` ${name}="${escapeAttribute(node.attrs[name])}"`).join("");
    if (tag === "a" && names.includes("href")) attrs += ' rel="noopener noreferrer"';
    return VOID_TAGS.has(tag) ? `<${tag}${attrs}>${children}` : `<${tag}${attrs}>${children}</${tag}>`;
  };

  return parse(html).map(clean).join("");
}

export function processUserDescription(text: string | null | undefined, parse: HtmlParser, whitelist: HtmlWhitelist): string {
  if (!text) return "";
  return sanitizeUserHtml(text.replace(/\n/g, "<br>"), parse, whitelist);
}
