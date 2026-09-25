import { normalizeAnnotations, DEFAULT_MAX_ANNOTATIONS, type UserAnnotation } from "./annotations";
import { isValidRect, roundCoord, type Rect } from "./codec/camera";

export interface ElementQuery {
  ids?: string[];
  slugs?: string[];
  tags?: string[];
}

export type HighlightMode = "outline" | "pulse" | "dim-others";
export const HIGHLIGHT_MODES: readonly HighlightMode[] = Object.freeze(["outline", "pulse", "dim-others"]);

export interface HighlightSpec extends ElementQuery {
  mode?: HighlightMode;
}

// Topics in focus: highlighted with mode (default outline); the camera fits
// them when they change, or on load when there is no other camera.
export type FocusMode = "outline" | "dim-others";
export const FOCUS_MODES: readonly FocusMode[] = Object.freeze(["outline", "dim-others"]);

export interface FocusSpec {
  tags: string[];
  mode?: FocusMode;
}

export type CameraSpec = { fit: true } | { rect: Rect } | { focus: ElementQuery; padding?: number };

export interface DiagramView {
  camera?: CameraSpec;
  level?: number;
  hiddenTags?: string[];
  onlyTags?: string[];
  query?: string;
  pins?: string[];
  highlight?: HighlightSpec;
  focus?: FocusSpec;
  annotations?: UserAnnotation[];
  theme?: "light" | "dark";
}

export interface DiagramUi {
  panelOpen?: boolean;
  tagTreeExpanded?: boolean;
}

export interface DiagramState {
  version: 1;
  view: DiagramView;
  ui: DiagramUi;
}

// A view delta: null removes an inherited key.
export type ViewPatch = { [K in keyof DiagramView]?: DiagramView[K] | null };

export const VIEW_KEYS = Object.freeze([
  "camera",
  "level",
  "hiddenTags",
  "onlyTags",
  "query",
  "pins",
  "highlight",
  "focus",
  "annotations",
  "theme",
] as const);

const UI_KEYS = Object.freeze(["panelOpen", "tagTreeExpanded"] as const);
const QUERY_KEYS = Object.freeze(["ids", "slugs", "tags"] as const);

export class DiagramStateError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "DiagramStateError";
  }
}

function normalizeMode(mode: unknown, path: string): HighlightMode | undefined {
  if (mode === undefined) return undefined;
  if (!(HIGHLIGHT_MODES as readonly unknown[]).includes(mode)) throw new DiagramStateError(path, "expected outline, pulse or dim-others");
  return mode as HighlightMode;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownKeys(value: Record<string, unknown>, known: readonly string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    throw new DiagramStateError(path, `unknown key(s) ${unknown.join(", ")}; expected ${known.join(", ")}`);
  }
}

function stringList(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new DiagramStateError(path, "expected an array of strings");
  }
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

function normalizeQuery(value: unknown, path: string, extra: readonly string[] = []): ElementQuery {
  if (!isPlainObject(value)) throw new DiagramStateError(path, "expected an object");
  assertKnownKeys(value, [...QUERY_KEYS, ...extra], path);
  const out: ElementQuery = {};
  QUERY_KEYS.forEach((key) => {
    if (value[key] !== undefined) out[key] = stringList(value[key], `${path}.${key}`);
  });
  return out;
}

function normalizeCamera(value: unknown, path: string): CameraSpec {
  if (!isPlainObject(value)) throw new DiagramStateError(path, "expected an object");
  if ("fit" in value) {
    assertKnownKeys(value, ["fit"], path);
    if (value.fit !== true) throw new DiagramStateError(`${path}.fit`, "must be true");
    return { fit: true };
  }
  if ("rect" in value) {
    assertKnownKeys(value, ["rect"], path);
    if (!isValidRect(value.rect)) {
      throw new DiagramStateError(`${path}.rect`, "expected [cx, cy, w, h] with cx,cy in [0,1] and w,h in (0,1]");
    }
    return { rect: [...value.rect] as Rect };
  }
  if ("focus" in value) {
    assertKnownKeys(value, ["focus", "padding"], path);
    const camera: CameraSpec = { focus: normalizeQuery(value.focus, `${path}.focus`) };
    if (value.padding !== undefined) {
      if (typeof value.padding !== "number" || !(value.padding >= 0) || value.padding > 1) {
        throw new DiagramStateError(`${path}.padding`, "expected a number in [0, 1]");
      }
      camera.padding = value.padding;
    }
    return camera;
  }
  throw new DiagramStateError(path, "expected one of {fit: true}, {rect: [...]}, {focus: {...}}");
}

function normalizeViewValue(key: keyof DiagramView, value: unknown, path: string): unknown {
  switch (key) {
    case "camera":
      return normalizeCamera(value, path);
    case "level":
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        throw new DiagramStateError(path, "expected a non-negative integer");
      }
      return value;
    case "hiddenTags":
    case "onlyTags":
    case "pins":
      return stringList(value, path);
    case "query":
      if (typeof value !== "string") throw new DiagramStateError(path, "expected a string");
      return value;
    case "highlight": {
      const spec = normalizeQuery(value, path, ["mode"]) as HighlightSpec;
      const mode = normalizeMode((value as Record<string, unknown>).mode, `${path}.mode`);
      if (mode) spec.mode = mode;
      return spec;
    }
    case "focus": {
      if (!isPlainObject(value)) throw new DiagramStateError(path, "expected { tags, mode? }");
      assertKnownKeys(value, ["tags", "mode"], path);
      const spec: FocusSpec = { tags: value.tags === undefined ? [] : stringList(value.tags, `${path}.tags`) };
      if (value.mode !== undefined) {
        if (!(FOCUS_MODES as readonly unknown[]).includes(value.mode)) throw new DiagramStateError(`${path}.mode`, "expected outline or dim-others");
        spec.mode = value.mode as FocusMode;
      }
      return spec;
    }
    case "annotations":
      if (!Array.isArray(value)) throw new DiagramStateError(path, "expected an array");
      return normalizeAnnotations(value, Number.MAX_SAFE_INTEGER);
    case "theme":
      if (value !== "light" && value !== "dark") throw new DiagramStateError(path, "expected light or dark");
      return value;
  }
}

// Validates at the boundary: throws on wrong shapes, keeps null (a delta that
// removes an inherited key) when allowNull is set.
export function normalizeViewPatch(input: unknown, path = "view", { allowNull = true } = {}): ViewPatch {
  if (input === undefined) return {};
  if (!isPlainObject(input)) throw new DiagramStateError(path, "expected an object");
  assertKnownKeys(input, VIEW_KEYS, path);
  const out: Record<string, unknown> = {};
  VIEW_KEYS.forEach((key) => {
    const value = input[key];
    if (value === undefined) return;
    if (value === null) {
      if (!allowNull) throw new DiagramStateError(`${path}.${key}`, "null is only valid in a delta");
      out[key] = null;
      return;
    }
    out[key] = normalizeViewValue(key, value, `${path}.${key}`);
  });
  return out as ViewPatch;
}

export function normalizeView(input: unknown, path = "view"): DiagramView {
  return normalizeViewPatch(input, path, { allowNull: false }) as DiagramView;
}

export function normalizeUi(input: unknown, path = "ui"): DiagramUi {
  if (input === undefined) return {};
  if (!isPlainObject(input)) throw new DiagramStateError(path, "expected an object");
  assertKnownKeys(input, UI_KEYS, path);
  const out: DiagramUi = {};
  UI_KEYS.forEach((key) => {
    const value = input[key];
    if (value === undefined) return;
    if (typeof value !== "boolean") throw new DiagramStateError(`${path}.${key}`, "expected a boolean");
    out[key] = value;
  });
  return out;
}

export function normalizeState(input: unknown, path = "state"): DiagramState {
  if (!isPlainObject(input)) throw new DiagramStateError(path, "expected an object");
  assertKnownKeys(input, ["version", "view", "ui"], path);
  if (input.version !== undefined && input.version !== 1) {
    throw new DiagramStateError(`${path}.version`, "only version 1 is supported");
  }
  return { version: 1, view: normalizeView(input.view, `${path}.view`), ui: normalizeUi(input.ui, `${path}.ui`) };
}

// Applies a delta: keys replace whole values, null removes a key.
export function mergeView(base: DiagramView, patch: ViewPatch | DiagramView): DiagramView {
  const out: Record<string, unknown> = { ...base };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null) delete out[key];
    else out[key] = value;
  });
  return out as DiagramView;
}

function sortStrings(list: readonly string[] | undefined): string[] | undefined {
  return list ? [...list].sort((a, b) => a.localeCompare(b)) : undefined;
}

function canonicalQuery<T extends ElementQuery>(query: T): T {
  const out: Record<string, unknown> = {};
  Object.keys(query)
    .sort()
    .forEach((key) => {
      const value = (query as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        if (value.length > 0) out[key] = sortStrings(value);
      } else if (value !== undefined) {
        out[key] = value;
      }
    });
  return out as T;
}

function isEmptyQuery(query: ElementQuery): boolean {
  return !query.ids?.length && !query.slugs?.length && !query.tags?.length;
}

function canonicalCamera(camera: CameraSpec): CameraSpec {
  if ("rect" in camera) return { rect: camera.rect.map(roundCoord) as Rect };
  if ("focus" in camera) {
    return camera.padding === undefined
      ? { focus: canonicalQuery(camera.focus) }
      : { focus: canonicalQuery(camera.focus), padding: camera.padding };
  }
  return camera;
}

// Sorted keys, sorted lists, rects at URL precision, empty values dropped.
// Two views that mean the same thing compare equal after this.
export function canonicalView(view: DiagramView): DiagramView {
  const out: Record<string, unknown> = {};
  VIEW_KEYS.slice()
    .sort()
    .forEach((key) => {
      const value = view[key];
      if (value === undefined) return;
      if (Array.isArray(value) && value.length === 0) return;
      if (key === "query" && value === "") return;
      if (key === "camera") out[key] = canonicalCamera(value as CameraSpec);
      else if (key === "highlight") {
        if (!isEmptyQuery(value as HighlightSpec)) out[key] = canonicalQuery(value as HighlightSpec);
      }
      else if (key === "focus") {
        const focus = value as FocusSpec;
        if (focus.tags.length > 0) out[key] = { tags: sortStrings(focus.tags), ...(focus.mode && focus.mode !== "outline" ? { mode: focus.mode } : {}) };
      }
      else if (key === "hiddenTags" || key === "onlyTags" || key === "pins") out[key] = sortStrings(value as string[]);
      else out[key] = value;
    });
  return out as DiagramView;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    isPlainObject(inner)
      ? Object.keys(inner)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = inner[key];
            return acc;
          }, {})
      : inner,
  );
}

export function viewsEqual(a: DiagramView, b: DiagramView): boolean {
  return stableStringify(canonicalView(a)) === stableStringify(canonicalView(b));
}

// The delta that turns base into view: changed keys, and null for keys the
// view drops.
export function diffView(view: DiagramView, base: DiagramView): ViewPatch {
  const a = canonicalView(view);
  const b = canonicalView(base);
  const out: Record<string, unknown> = {};
  VIEW_KEYS.forEach((key) => {
    const inView = a[key] !== undefined;
    const inBase = b[key] !== undefined;
    if (inView && (!inBase || stableStringify(a[key]) !== stableStringify(b[key]))) out[key] = a[key];
    else if (!inView && inBase) out[key] = null;
  });
  return out as ViewPatch;
}

export { DEFAULT_MAX_ANNOTATIONS };
