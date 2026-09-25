// Visible region in diagram space: center and size, 0..1 of the viewBox.
export type Rect = [cx: number, cy: number, w: number, h: number];

export interface RectObject {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export const COORD_DECIMALS = 4;
export const FIT_VALUE = "fit";
const FIT_ALIASES = new Set([FIT_VALUE, "0"]);

export function formatCoord(value: number): string {
  const factor = 10 ** COORD_DECIMALS;
  return `${Math.round(value * factor) / factor}`;
}

export function roundCoord(value: number): number {
  return Number(formatCoord(value));
}

export function serializeRect(rect: RectObject): string {
  return [rect.cx, rect.cy, rect.w, rect.h].map(formatCoord).join(",");
}

export function parseRect(rawValue: unknown): RectObject | null {
  if (typeof rawValue !== "string") return null;

  const parts = rawValue.split(",").map((part) => Number.parseFloat(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;

  const [cx, cy, w, h] = parts;
  if (!(w > 0) || !(h > 0) || w > 1 || h > 1) return null;
  if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return null;
  return { cx, cy, w, h };
}

export function isValidRect(rect: unknown): rect is Rect {
  return (
    Array.isArray(rect) &&
    rect.length === 4 &&
    rect.every((part) => typeof part === "number" && Number.isFinite(part)) &&
    parseRect(rect.join(",")) !== null
  );
}

export function rectToObject(rect: Rect): RectObject {
  return { cx: rect[0], cy: rect[1], w: rect[2], h: rect[3] };
}

export function rectFromObject(rect: RectObject): Rect {
  return [rect.cx, rect.cy, rect.w, rect.h];
}

export interface ViewportParam {
  fit: boolean;
  rect: RectObject | null;
}

export function parseViewportValue(raw: string | null): ViewportParam {
  const fit = typeof raw === "string" && FIT_ALIASES.has(raw.trim().toLowerCase());
  return { fit, rect: fit ? null : parseRect(raw) };
}
