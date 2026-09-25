// <head> tags and the <noscript> fallback for a full-page diagram, built
// from definition.content.page.
import { escapeHTML } from "diagram-webkit/core";

function attr(value) {
  return escapeHTML(value).replace(/"/g, "&quot;");
}

// Until a diagram has mounted, an uncaught error (a definition that throws
// on import, a rejected mountApp) would leave a blank page: show it instead.
export const STARTUP_ERROR_SCRIPT = `(() => {
  const describe = (error) => {
    const lines = [];
    for (let current = error; current; current = current instanceof Error ? current.cause : null) {
      lines.push(current instanceof Error ? current.name + ": " + current.message : String(current));
    }
    return lines.join("\\ncaused by ");
  };
  const show = (error) => {
    if (document.querySelector(".dwk-root, .dwk-error-box-standalone, .dwk-startup-error")) return;
    const box = document.createElement("div");
    box.className = "dwk-startup-error";
    box.setAttribute("role", "alert");
    box.style.cssText = "position:fixed;top:12px;left:12px;right:12px;z-index:2147483647;padding:12px 14px;border:2px solid #ef4444;border-radius:6px;background:#180606;color:#fee2e2;font:14px/1.4 system-ui,sans-serif";
    const title = document.createElement("strong");
    title.textContent = "The diagram could not start";
    const details = document.createElement("pre");
    details.style.cssText = "margin:6px 0 0;white-space:pre-wrap;font:12px/1.45 ui-monospace,monospace";
    details.textContent = describe(error);
    box.append(title, details);
    (document.body || document.documentElement).appendChild(box);
  };
  addEventListener("error", (event) => show(event.error || event.message));
  addEventListener("unhandledrejection", (event) => show(event.reason));
})();`;

/** @returns {import("vite").HtmlTagDescriptor[]} */
export function pageTags(page = {}) {
  const tags = [{ tag: "script", children: STARTUP_ERROR_SCRIPT, injectTo: "head-prepend" }];
  if (page.description) tags.push({ tag: "meta", attrs: { name: "description", content: page.description }, injectTo: "head" });
  if (page.author) tags.push({ tag: "meta", attrs: { name: "author", content: page.author }, injectTo: "head" });
  if (page.favicon) tags.push({ tag: "link", attrs: { rel: "icon", type: "image/svg+xml", href: page.favicon }, injectTo: "head" });
  if (page.noscript) {
    tags.push({
      tag: "noscript",
      children: `<style>body > *:not(noscript) { display: none !important; }</style>${page.noscript}`,
      injectTo: "body-prepend",
    });
  }
  return tags;
}

// Replaces or adds <title> and sets <html lang>.
export function applyPageDocument(html, page = {}) {
  let out = html;
  if (page.title) {
    const title = `<title>${escapeHTML(page.title)}</title>`;
    out = /<title>[\s\S]*?<\/title>/i.test(out) ? out.replace(/<title>[\s\S]*?<\/title>/i, title) : out.replace(/<\/head>/i, `  ${title}\n  </head>`);
  }
  if (page.lang) out = out.replace(/<html(\s[^>]*)?>/i, (match, attrs = "") => `<html${attrs.replace(/\slang="[^"]*"/i, "")} lang="${attr(page.lang)}">`);
  return out;
}

// A standalone page, for hosting without a build step.
export function renderPage(page = {}, { script = "./index.js" } = {}) {
  const head = pageTags(page)
    .filter((tag) => tag.injectTo === "head" && tag.attrs)
    .map((tag) => `<${tag.tag} ${Object.entries(tag.attrs).map(([key, value]) => `${key}="${attr(value)}"`).join(" ")} />`)
    .join("\n    ");
  const noscript = page.noscript ? `<noscript><style>body > *:not(noscript) { display: none !important; }</style>${page.noscript}</noscript>` : "";
  return `<!doctype html>
<html lang="${attr(page.lang || "en")}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>${STARTUP_ERROR_SCRIPT}</script>
    ${head}
    <title>${escapeHTML(page.title || "")}</title>
  </head>
  <body>
    ${noscript}
    <script type="module" src="${attr(script)}"></script>
  </body>
</html>
`;
}
