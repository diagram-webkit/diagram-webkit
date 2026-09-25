import {
  canonicalView,
  diffView,
  mergeView,
  normalizeView,
  normalizeViewPatch,
  stableStringify,
  type DiagramView,
  type ViewPatch,
} from "../state";
import { DEFAULT_MAX_ANNOTATIONS } from "../annotations";
import { urlToState } from "./url";

export const SLIDE_ATTRS = Object.freeze({
  view: "data-diagram-view",
  state: "data-diagram-state",
  stateUrl: "data-diagram-state-url",
  slot: "data-diagram-slot",
  features: "data-diagram-features",
  base: "data-diagram-base",
});

export interface NamedView {
  title?: string;
  state: DiagramView;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeAttribute(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// What goes into data-diagram-state: only what differs from base, sorted
// keys, and always an explicit camera so the slide shows what was on screen.
export function slideDelta(view: DiagramView, base: DiagramView): ViewPatch {
  const delta = diffView(view, base);
  const canonical = canonicalView(view);
  if (canonical.camera) delta.camera = canonical.camera;
  return delta;
}

export function serializeSlide(
  view: DiagramView,
  base: DiagramView = {},
  { title, viewName }: { title?: string; viewName?: string } = {},
): string {
  const delta = slideDelta(view, base);
  const attrs = [
    viewName ? ` ${SLIDE_ATTRS.view}="${escapeAttribute(viewName)}"` : "",
    Object.keys(delta).length > 0 ? ` ${SLIDE_ATTRS.state}='${escapeAttribute(stableStringify(delta))}'` : "",
  ].join("");
  const heading = title ? `\n  <h2>${escapeAttribute(title)}</h2>` : "";
  return `<section${attrs}>${heading}\n  <div ${SLIDE_ATTRS.slot} data-prevent-swipe></div>\n</section>`;
}

export function parseStateAttribute(raw: string | null | undefined, path: string = SLIDE_ATTRS.state): ViewPatch {
  if (raw === null || raw === undefined || raw.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path}: invalid JSON (${(error as Error).message}): ${raw}`);
  }
  return normalizeViewPatch(parsed, path);
}

// A page URL pasted into data-diagram-state-url, as a slide delta. Only the
// query counts (after "?", before "#"): host, path, hash, parameters the
// diagram does not know and UI-only ones (menu, tags) are ignored. A bare
// query ("v=...&pins=...") works too.
export function parseStateUrlAttribute(
  raw: string | null | undefined,
  path: string = SLIDE_ATTRS.stateUrl,
  maxAnnotations: number = DEFAULT_MAX_ANNOTATIONS,
): ViewPatch {
  if (raw === null || raw === undefined || raw.trim() === "") return {};
  const value = raw.trim();
  const query = value.includes("?") ? value.slice(value.indexOf("?") + 1) : value;
  const search = query.split("#")[0];
  return normalizeViewPatch(urlToState(`?${search}`, maxAnnotations).view, path);
}

export interface SlideStateSources {
  stateUrl?: string | null;
  maxAnnotations?: number;
}

// base ⊕ views[name] ⊕ state URL ⊕ state JSON, as a complete view.
export function resolveSlideView(
  base: DiagramView,
  views: Readonly<Record<string, NamedView>>,
  viewName: string | null | undefined,
  stateAttr: string | null | undefined,
  { stateUrl, maxAnnotations }: SlideStateSources = {},
): DiagramView {
  let view = base;
  if (viewName) {
    const named = views[viewName];
    if (!named) {
      throw new Error(`${SLIDE_ATTRS.view}="${viewName}": unknown view; known: ${Object.keys(views).join(", ") || "(none)"}`);
    }
    view = mergeView(view, named.state);
  }
  view = mergeView(view, parseStateUrlAttribute(stateUrl, SLIDE_ATTRS.stateUrl, maxAnnotations));
  return normalizeView(mergeView(view, parseStateAttribute(stateAttr)));
}

// Reads a snippet produced by serializeSlide back into its view.
export function parseSlideSnippet(
  html: string,
  base: DiagramView = {},
  views: Readonly<Record<string, NamedView>> = {},
): DiagramView {
  const section = html.match(/<section\b([^>]*)>/i);
  if (!section) throw new Error("No <section> element in slide snippet");
  const attr = (name: string) => {
    const match = section[1].match(new RegExp(`${name}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`, "i"));
    return match ? unescapeAttribute(match[1] ?? match[2]) : null;
  };
  return resolveSlideView(base, views, attr(SLIDE_ATTRS.view), attr(SLIDE_ATTRS.state), { stateUrl: attr(SLIDE_ATTRS.stateUrl) });
}
