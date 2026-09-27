// The dark theme of a diagram: each colour through invert(1),
// hue-rotate(175deg), saturate(1.5) and brightness(1.4), the steps of the
// CSS filter it replaces (Filter Effects matrices, sRGB, clamped after each
// step). Recolouring once per theme switch costs nothing while cells
// animate; a filter over the diagram cut frame rates by about 5x.
export const DARK_STEPS = Object.freeze({ hueRotate: 175, saturate: 1.5, brightness: 1.4 });

// For what has no colour to rewrite (raster images).
export const DARK_FILTER_CSS = `invert(1) hue-rotate(${DARK_STEPS.hueRotate}deg) saturate(${DARK_STEPS.saturate}) brightness(${DARK_STEPS.brightness})`;

type Rgb = [number, number, number];
type Matrix = [Rgb, Rgb, Rgb];

function hueRotateMatrix(degrees: number): Matrix {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928],
    [0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283],
    [0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072],
  ];
}

function saturateMatrix(amount: number): Matrix {
  return [
    [0.213 + 0.787 * amount, 0.715 - 0.715 * amount, 0.072 - 0.072 * amount],
    [0.213 - 0.213 * amount, 0.715 + 0.285 * amount, 0.072 - 0.072 * amount],
    [0.213 - 0.213 * amount, 0.715 - 0.715 * amount, 0.072 + 0.928 * amount],
  ];
}

const HUE_ROTATE = hueRotateMatrix(DARK_STEPS.hueRotate);
const SATURATE = saturateMatrix(DARK_STEPS.saturate);

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function apply(matrix: Matrix, color: Rgb): Rgb {
  return matrix.map((row) => clamp(row[0] * color[0] + row[1] * color[1] + row[2] * color[2])) as Rgb;
}

// 0-255 channels in and out.
export function darkRgb(rgb: Rgb): Rgb {
  const inverted = rgb.map((channel) => 1 - channel / 255) as Rgb;
  const saturated = apply(SATURATE, apply(HUE_ROTATE, inverted));
  return saturated.map((channel) => Math.round(clamp(channel * DARK_STEPS.brightness) * 255)) as Rgb;
}

const RGB_VALUE = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/;

// A computed colour ("rgb(r, g, b)" / "rgba(r, g, b, a)") in its dark form,
// or null: not an rgb colour (none, url(...), other colour spaces) or fully
// transparent, so nothing to rewrite.
export function darkCssColor(value: string): string | null {
  const match = RGB_VALUE.exec(value.trim());
  if (!match) return null;
  const alphaRaw = match[4];
  const alpha = alphaRaw === undefined ? 1 : alphaRaw.endsWith("%") ? Number.parseFloat(alphaRaw) / 100 : Number.parseFloat(alphaRaw);
  if (!(alpha > 0)) return null;
  const [r, g, b] = darkRgb([Number(match[1]), Number(match[2]), Number(match[3])]);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
