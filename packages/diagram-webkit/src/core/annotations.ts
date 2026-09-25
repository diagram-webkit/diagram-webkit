export const ANNOTATION_TITLE_MAX = 50;
export const ANNOTATION_DESCRIPTION_MAX = 500;
export const DEFAULT_MAX_ANNOTATIONS = 10;

export type AnnotationKind = "point" | "area" | "arrow";
export type AnnotationShape = "rectangle" | "circle";

export interface UserAnnotation {
  x: number;
  y: number;
  type: string;
  title: string;
  description: string;
  shape?: AnnotationShape;
  widthRel?: number;
  heightRel?: number;
  x2?: number;
  y2?: number;
}

export interface AnnotationTypeStyle {
  annotationType?: AnnotationKind;
  label: string;
  bg?: string;
  color?: string;
  border: string;
  borderWidth?: string;
  borderStyle?: string;
  radius?: string;
  scale?: number;
  strokeWidth?: number;
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
}

const AREA_SIZES = { defaultSize: { width: 150, height: 100 }, minSize: { width: 50, height: 50 }, maxSize: { width: 1200, height: 800 } };

function typeSet(base: string, label: string, color: string, border: string): Record<string, AnnotationTypeStyle> {
  return {
    [`user-${base}`]: { annotationType: "point", label, bg: color, color: "#fff", border, borderWidth: "3px", borderStyle: "solid", scale: 2 },
    [`area-${base}`]: { annotationType: "area", label, bg: "transparent", color: "#fff", border: color, borderWidth: "3px", borderStyle: "solid", ...AREA_SIZES },
    [`arrow-${base}`]: { annotationType: "arrow", label, bg: "transparent", color: "#fff", border: color, borderWidth: "3px", borderStyle: "solid", strokeWidth: 3 },
  };
}

// Used when a definition declares no types. "info" must exist: the editor
// starts on it.
export const DEFAULT_ANNOTATION_TYPES: Readonly<Record<string, AnnotationTypeStyle>> = Object.freeze({
  ...typeSet("info", "Blue", "#2196f3", "#1976d2"),
  ...typeSet("important", "Red", "#ff1744", "#d50000"),
  ...typeSet("success", "Green", "#4caf50", "#2e7d32"),
});

export const MODE_TYPE_PREFIX: Readonly<Record<AnnotationKind, string>> = Object.freeze({
  point: "user-",
  area: "area-",
  arrow: "arrow-",
});

export function baseAnnotationType(type: string): string {
  return type.replace(/^(user-|area-|arrow-)/, "");
}

// Runtime DOM references on an annotation start with "_" and never belong in
// a link.
export function stripRuntimeKeys(annotations: readonly object[]): unknown[] {
  return JSON.parse(JSON.stringify(annotations, (key, value) => (key.startsWith("_") ? undefined : value)));
}

export function encodeAnnotations(annotations: readonly object[]): string {
  const json = JSON.stringify(annotations, (key, value) => (key.startsWith("_") ? undefined : value));
  return btoa(unescape(encodeURIComponent(json)));
}

function isUnit(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

// Drops anything malformed rather than rejecting the whole list: a link
// should still open with whatever part of it is valid.
export function normalizeAnnotations(parsed: unknown, maxAnnotations: number): UserAnnotation[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .slice(0, maxAnnotations)
    .filter(
      (ann) =>
        ann &&
        typeof ann === "object" &&
        typeof ann.x === "number" &&
        typeof ann.y === "number" &&
        typeof ann.type === "string" &&
        (ann.title === undefined || (typeof ann.title === "string" && ann.title.length <= ANNOTATION_TITLE_MAX)) &&
        isUnit(ann.x) &&
        isUnit(ann.y),
    )
    .map((ann) => {
      const clean: UserAnnotation = {
        x: ann.x,
        y: ann.y,
        type: ann.type,
        title: `${ann.title || ""}`.substring(0, ANNOTATION_TITLE_MAX),
        description: ann.description ? `${ann.description}`.substring(0, ANNOTATION_DESCRIPTION_MAX) : "",
      };
      clean.shape = ann.shape === "circle" || ann.shape === "rectangle" ? ann.shape : "rectangle";
      if (typeof ann.widthRel === "number" && ann.widthRel > 0) clean.widthRel = ann.widthRel;
      if (typeof ann.heightRel === "number" && ann.heightRel > 0) clean.heightRel = ann.heightRel;
      if (isUnit(ann.x2) && isUnit(ann.y2)) {
        clean.x2 = ann.x2;
        clean.y2 = ann.y2;
      }
      return clean;
    });
}

export function decodeAnnotations(blob: string | null, maxAnnotations: number): UserAnnotation[] {
  if (!blob) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(escape(atob(blob))));
  } catch (error) {
    console.error("Failed to parse user annotations from URL:", error);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn("Invalid user annotations format in URL");
    return [];
  }
  return normalizeAnnotations(parsed, maxAnnotations);
}
