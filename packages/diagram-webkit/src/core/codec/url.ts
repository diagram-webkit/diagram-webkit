import { decodeAnnotations, encodeAnnotations, type UserAnnotation } from "../annotations";
import { FIT_VALUE, parseViewportValue, rectFromObject, rectToObject, serializeRect, type ViewportParam } from "./camera";
import { FILTER_PARAMS, PARAMS } from "./params";
import { HIGHLIGHT_MODES, type DiagramState, type FocusSpec, type HighlightMode, type HighlightSpec, type TooltipSpec } from "../state";

const FOCUS_MODE_PARAM = "dim-others";
// tags=: the tag tree open, or open with every branch.
const TAGS_OPEN = "open";
const TAGS_ALL = "all";

export interface FilterParams {
  open: boolean;
  query: string;
  hiddenTags: string[];
  pinnedSlugs: string[];
  level: number;
  hasLevel: boolean;
  hasHiddenTags: boolean;
  tagsExpanded: boolean;
  tagsAllExpanded: boolean;
  onlyTags: string[];
  hasOnlyTags: boolean;
  examplesOnly: string[];
  highlight: HighlightSpec | null;
  focus: FocusSpec | null;
  tooltip: TooltipSpec | null;
}

export interface ParsedUrl {
  filter: FilterParams;
  viewport: ViewportParam;
  annotations: UserAnnotation[];
  debug: boolean;
}

function splitList(raw: string | null): string[] {
  return raw
    ? raw
        .split(",")
        .map((part) => `${part || ""}`.trim())
        .filter(Boolean)
    : [];
}

export function parseHighlightParam(raw: string | null): HighlightSpec | null {
  const items = splitList(raw);
  if (items.length === 0) return null;
  const spec: HighlightSpec = {};
  const push = (key: "ids" | "slugs" | "tags", value: string) => {
    spec[key] = [...(spec[key] || []), value];
  };
  items.forEach((item) => {
    const index = item.indexOf(":");
    const prefix = index > 0 ? item.slice(0, index) : "";
    const value = index > 0 ? item.slice(index + 1) : item;
    if (prefix === "tag") push("tags", value);
    else if (prefix === "id") push("ids", value);
    else if (prefix === "mode" && (HIGHLIGHT_MODES as readonly string[]).includes(value)) spec.mode = value as HighlightMode;
    else push("slugs", item);
  });
  return spec;
}

// focus=A,B plus focus-mode=dim-others; anything else is the outline.
export function parseFocusParams(params: URLSearchParams): FocusSpec | null {
  const tags = splitList(params.get(PARAMS.focus));
  if (tags.length === 0) return null;
  return params.get(PARAMS.focusMode) === FOCUS_MODE_PARAM ? { tags, mode: FOCUS_MODE_PARAM } : { tags };
}

// tooltip=Slug or tooltip=Slug:example.
// tooltip-mode=simple goes with it.
export function parseTooltipParam(raw: string | null, modeRaw: string | null = null): TooltipSpec | null {
  const value = (raw || "").trim();
  if (!value) return null;
  const index = value.indexOf(":");
  const slug = (index === -1 ? value : value.slice(0, index)).trim();
  const tab = index === -1 ? "" : value.slice(index + 1).trim().toLowerCase();
  if (!slug) return null;
  const spec: TooltipSpec = { slug };
  if (tab) spec.tab = tab;
  if (modeRaw === "simple" || modeRaw === "full") spec.mode = modeRaw;
  return spec;
}

export function formatTooltipParam(spec: TooltipSpec | null | undefined): string {
  if (!spec) return "";
  return spec.tab ? `${spec.slug}:${spec.tab}` : spec.slug;
}

export function formatHighlightParam(spec: HighlightSpec | null | undefined): string {
  if (!spec) return "";
  return [
    ...(spec.slugs || []),
    ...(spec.tags || []).map((tag) => `tag:${tag}`),
    ...(spec.ids || []).map((id) => `id:${id}`),
    ...(spec.mode ? [`mode:${spec.mode}`] : []),
  ].join(",");
}

export function parseFilterParams(search: string): FilterParams {
  const params = new URLSearchParams(search);
  const levelRaw = params.get(PARAMS.level);
  const hideTagsRaw = params.get(PARAMS.hideTags);
  const onlyTagsRaw = params.get(PARAMS.onlyTags);
  const queryRaw = params.get(PARAMS.query);
  return {
    open: params.get(PARAMS.menu) === "true",
    query: typeof queryRaw === "string" ? queryRaw : "",
    hiddenTags: splitList(hideTagsRaw),
    pinnedSlugs: splitList(params.get(PARAMS.pins)),
    level: Math.max(0, Number.parseInt(`${levelRaw}`, 10) || 0),
    hasLevel: levelRaw !== null,
    hasHiddenTags: hideTagsRaw !== null,
    tagsExpanded: params.get(PARAMS.tags) === TAGS_OPEN || params.get(PARAMS.tags) === TAGS_ALL,
    tagsAllExpanded: params.get(PARAMS.tags) === TAGS_ALL,
    onlyTags: splitList(onlyTagsRaw),
    hasOnlyTags: onlyTagsRaw !== null,
    examplesOnly: splitList(params.get(PARAMS.examplesOnly)),
    highlight: parseHighlightParam(params.get(PARAMS.highlight)),
    focus: parseFocusParams(params),
    tooltip: parseTooltipParam(params.get(PARAMS.tooltip), params.get(PARAMS.tooltipMode)),
  };
}

export function parseUrl(search: string, maxAnnotations: number): ParsedUrl {
  const params = new URLSearchParams(search);
  return {
    filter: parseFilterParams(search),
    viewport: parseViewportValue(params.get(PARAMS.viewport)),
    annotations: decodeAnnotations(params.get(PARAMS.annotations), maxAnnotations),
    debug: params.has(PARAMS.debug),
  };
}

// The state a URL describes, before it is checked against a loaded diagram.
export function urlToState(search: string, maxAnnotations: number): DiagramState {
  const parsed = parseUrl(search, maxAnnotations);
  const { filter } = parsed;
  const view: DiagramState["view"] = {};
  if (parsed.viewport.fit) view.camera = { fit: true };
  else if (parsed.viewport.rect) view.camera = { rect: rectFromObject(parsed.viewport.rect) };
  if (filter.hasLevel) view.level = filter.level;
  if (filter.hasOnlyTags && filter.onlyTags.length > 0) view.onlyTags = filter.onlyTags;
  else if (filter.hasHiddenTags && filter.hiddenTags.length > 0) view.hiddenTags = filter.hiddenTags;
  if (filter.examplesOnly.length > 0) view.examplesOnly = filter.examplesOnly;
  if (filter.query) view.query = filter.query;
  if (filter.pinnedSlugs.length > 0) view.pins = filter.pinnedSlugs;
  if (filter.highlight) view.highlight = filter.highlight;
  if (filter.focus) {
    view.focus = filter.focus;
    if (!view.camera) view.camera = { focus: { tags: filter.focus.tags } };
  }
  if (filter.tooltip) view.tooltip = filter.tooltip;
  if (parsed.annotations.length > 0) view.annotations = parsed.annotations;
  const ui: DiagramState["ui"] = {};
  if (filter.open) ui.panelOpen = true;
  if (filter.tagsExpanded) ui.tagTreeExpanded = true;
  if (filter.tagsAllExpanded) ui.tagTreeAllExpanded = true;
  return { version: 1, view, ui };
}

export interface UrlWriteInput {
  annotations: readonly object[];
  viewport: string | null;
  panelOpen: boolean;
  query: string;
  // Explicitly hidden tags without those covered by a hidden ancestor, in
  // filter order.
  hiddenTags: readonly string[];
  onlyTags?: readonly string[] | null;
  examplesOnly?: readonly string[];
  pins: readonly string[];
  level: number;
  defaultLevel: number;
  tagsExpanded: boolean;
  tagsAllExpanded?: boolean;
  highlight?: HighlightSpec | null;
  focus?: FocusSpec | null;
  tooltip?: TooltipSpec | null;
}

// Commas are legal in a query string but URLSearchParams escapes them anyway.
// Shared links are read by people, so put them back, and write flags
// (`debug`, a bare `tag-picker-mode`) without a trailing "=".
export function toReadableSearch(params: URLSearchParams): string {
  const search = params.toString().replace(/%2C/g, ",").replace(/=(?=&|$)/g, "");
  return search ? `?${search}` : "";
}

// tag-picker-mode: null when off, else the selected tags (possibly none).
// Not part of DiagramState: an authoring tool that never goes into a slide.
export function parseTagPickerParam(search: string): string[] | null {
  const params = new URLSearchParams(search);
  return params.has(PARAMS.tagPickerMode) ? splitList(params.get(PARAMS.tagPickerMode)) : null;
}

export function writeTagPickerParam(search: string, selected: readonly string[] | null): string {
  const params = new URLSearchParams(search);
  if (selected === null) params.delete(PARAMS.tagPickerMode);
  else params.set(PARAMS.tagPickerMode, selected.join(","));
  return toReadableSearch(params);
}

export interface StateToSearchOptions {
  defaultLevel: number;
  // Filters out tags covered by a hidden ancestor and sorts in filter order.
  explicitHiddenTags?: (hiddenTags: readonly string[]) => string[];
  search?: string;
}

// A state as URL parameters. A focus camera has no URL form and is left out.
export function stateToSearch(state: DiagramState, options: StateToSearchOptions): string {
  const { view, ui } = state;
  const camera = view.camera;
  let viewport: string | null = null;
  if (camera && "fit" in camera) viewport = FIT_VALUE;
  else if (camera && "rect" in camera) viewport = serializeRect(rectToObject(camera.rect));
  const hidden = view.hiddenTags || [];
  return writeUrlSearch(options.search || "", {
    annotations: view.annotations || [],
    viewport,
    panelOpen: Boolean(ui.panelOpen),
    query: view.query || "",
    hiddenTags: options.explicitHiddenTags ? options.explicitHiddenTags(hidden) : hidden,
    onlyTags: view.onlyTags,
    examplesOnly: view.examplesOnly,
    pins: [...(view.pins || [])].sort((a, b) => a.localeCompare(b)),
    level: view.level ?? options.defaultLevel,
    defaultLevel: options.defaultLevel,
    tagsExpanded: Boolean(ui.tagTreeExpanded || ui.tagTreeAllExpanded),
    tagsAllExpanded: Boolean(ui.tagTreeAllExpanded),
    highlight: view.highlight,
    focus: view.focus,
    tooltip: view.tooltip,
  });
}

// Rewrites the diagram's parameters in place, leaving any others (and their
// order) untouched.
export function writeUrlSearch(search: string, input: UrlWriteInput): string {
  const params = new URLSearchParams(search);
  const setOrDelete = (name: string, value: string | null) => {
    if (value) params.set(name, value);
    else params.delete(name);
  };

  setOrDelete(PARAMS.annotations, input.annotations.length > 0 ? encodeAnnotations(input.annotations) : null);
  setOrDelete(PARAMS.viewport, input.viewport);

  const query = input.query.trim();
  const onlyTags = input.onlyTags && input.onlyTags.length > 0 ? input.onlyTags : null;
  const hiddenTags = onlyTags ? [] : input.hiddenTags;
  const pins = input.pins.filter(Boolean);
  const examplesOnly = [...(input.examplesOnly || [])].sort((a, b) => a.localeCompare(b));
  const level = Math.max(0, Number.parseInt(`${input.level}`, 10) || 0);
  const defaultLevel = Math.max(0, Number.parseInt(`${input.defaultLevel}`, 10) || 0);
  const hasNonDefaultLevel = level !== defaultLevel;
  const highlight = formatHighlightParam(input.highlight);
  const focus = input.focus && input.focus.tags.length > 0 ? input.focus : null;
  const tooltip = formatTooltipParam(input.tooltip);
  const hasFilterCriteria =
    query.length > 0 || hiddenTags.length > 0 || hasNonDefaultLevel || input.tagsExpanded || Boolean(onlyTags) || examplesOnly.length > 0 || Boolean(highlight) || Boolean(focus) || Boolean(tooltip);

  if (!input.panelOpen && !hasFilterCriteria && pins.length === 0) {
    FILTER_PARAMS.forEach((name) => params.delete(name));
  } else {
    setOrDelete(PARAMS.menu, input.panelOpen ? "true" : null);
    setOrDelete(PARAMS.query, query || null);
    setOrDelete(PARAMS.hideTags, hiddenTags.length > 0 ? hiddenTags.join(",") : null);
    setOrDelete(PARAMS.pins, pins.length > 0 ? pins.join(",") : null);
    setOrDelete(PARAMS.level, hasNonDefaultLevel ? `${level}` : null);
    setOrDelete(PARAMS.tags, input.tagsAllExpanded ? TAGS_ALL : input.tagsExpanded ? TAGS_OPEN : null);
    setOrDelete(PARAMS.onlyTags, onlyTags ? onlyTags.join(",") : null);
    setOrDelete(PARAMS.examplesOnly, examplesOnly.length > 0 ? examplesOnly.join(",") : null);
    setOrDelete(PARAMS.highlight, highlight || null);
    setOrDelete(PARAMS.focus, focus ? focus.tags.join(",") : null);
    setOrDelete(PARAMS.focusMode, focus && focus.mode && focus.mode !== "outline" ? focus.mode : null);
    setOrDelete(PARAMS.tooltip, tooltip || null);
    setOrDelete(PARAMS.tooltipMode, input.tooltip && input.tooltip.mode ? input.tooltip.mode : null);
  }

  return toReadableSearch(params);
}
