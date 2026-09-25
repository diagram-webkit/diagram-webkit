export type PresetName = "app" | "embed";

export interface InputFeatures {
  wheel: boolean;
  drag: boolean;
  pinch: boolean;
  keyboard: boolean;
}

export interface Features {
  panel: boolean;
  urlSync: boolean;
  persistence: boolean;
  shortcuts: boolean;
  about: boolean;
  footer: boolean;
  linkInfo: boolean;
  annotations: "edit" | "render" | false;
  tooltips: boolean;
  input: InputFeatures;
  copySlide: boolean;
  feedback: "page" | "container" | false;
  // How a search result shows where its element is: on click/tap/Enter, or
  // already on hover and keyboard focus (which moves the camera).
  resultLocate: "click" | "hover";
}

export type FeaturesOverride = Partial<Omit<Features, "input">> & { input?: Partial<InputFeatures> };

// A feature spec as written in a definition: a preset name, or overrides on
// top of an optional preset (default "app").
export type FeaturesSpec = PresetName | (FeaturesOverride & { preset?: PresetName });

export const PRESETS: Readonly<Record<PresetName, Readonly<Features>>> = Object.freeze({
  app: Object.freeze({
    panel: true,
    urlSync: true,
    persistence: true,
    shortcuts: true,
    about: true,
    footer: true,
    linkInfo: true,
    annotations: "edit",
    tooltips: true,
    input: Object.freeze({ wheel: true, drag: true, pinch: true, keyboard: true }),
    copySlide: true,
    feedback: "page",
    resultLocate: "click",
  }),
  embed: Object.freeze({
    panel: false,
    urlSync: false,
    persistence: false,
    shortcuts: false,
    about: false,
    footer: false,
    linkInfo: false,
    annotations: "render",
    tooltips: true,
    input: Object.freeze({ wheel: false, drag: false, pinch: false, keyboard: false }),
    copySlide: false,
    feedback: "container",
    resultLocate: "click",
  }),
});

const FEATURE_KEYS = Object.keys(PRESETS.app) as (keyof Features)[];
const INPUT_KEYS = Object.keys(PRESETS.app.input) as (keyof InputFeatures)[];

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function checkOverride(spec: Record<string, unknown>, path: string): void {
  Object.entries(spec).forEach(([key, value]) => {
    if (key === "preset") {
      if (value !== "app" && value !== "embed") fail(`${path}.preset`, `expected "app" or "embed", got ${JSON.stringify(value)}`);
      return;
    }
    if (!(FEATURE_KEYS as string[]).includes(key)) fail(`${path}.${key}`, `unknown feature; known: ${FEATURE_KEYS.join(", ")}`);
    if (value === undefined) return;
    if (key === "input") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${path}.input`, "expected an object");
      Object.entries(value).forEach(([inputKey, inputValue]) => {
        if (!(INPUT_KEYS as string[]).includes(inputKey)) fail(`${path}.input.${inputKey}`, `unknown input; known: ${INPUT_KEYS.join(", ")}`);
        if (typeof inputValue !== "boolean") fail(`${path}.input.${inputKey}`, "expected a boolean");
      });
    } else if (key === "annotations") {
      if (value !== "edit" && value !== "render" && value !== false) fail(`${path}.annotations`, 'expected "edit", "render" or false');
    } else if (key === "feedback") {
      if (value !== "page" && value !== "container" && value !== false) fail(`${path}.feedback`, 'expected "page", "container" or false');
    } else if (key === "resultLocate") {
      if (value !== "click" && value !== "hover") fail(`${path}.resultLocate`, 'expected "click" or "hover"');
    } else if (typeof value !== "boolean") {
      fail(`${path}.${key}`, "expected a boolean");
    }
  });
}

export function resolveFeatures(spec: FeaturesSpec | undefined, base?: Features, path = "features"): Features {
  if (spec === undefined) return base ? { ...base, input: { ...base.input } } : resolveFeatures("app");
  if (typeof spec === "string") {
    if (!(spec in PRESETS)) fail(path, `unknown preset ${JSON.stringify(spec)}; known: app, embed`);
    const preset = PRESETS[spec];
    return { ...preset, input: { ...preset.input } };
  }
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) fail(path, "expected a preset name or an object");
  checkOverride(spec as Record<string, unknown>, path);
  const { preset, input, ...rest } = spec;
  const start = preset ? resolveFeatures(preset) : base ? resolveFeatures(undefined, base) : resolveFeatures("app");
  return { ...start, ...(rest as Partial<Features>), input: { ...start.input, ...(input || {}) } };
}
