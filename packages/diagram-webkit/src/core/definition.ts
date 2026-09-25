import type { AnnotationTypeStyle } from "./annotations";
import type { HelpParser } from "./help";
import { assertSafeWhitelist, type HtmlWhitelist } from "./html";
import { resolveFeatures, type Features, type FeaturesSpec } from "./presets";
import { satisfies } from "./semver";
import { mergeView, normalizeView, normalizeViewPatch, type DiagramView } from "./state";
import type { TagGroup, TagMeta, TagMetaInput, TagRoles } from "./tags";
import { DEFAULT_TEXTS, type TextKey } from "./texts";
import { VERSION } from "./version";

export interface FooterLink {
  label: string;
  href: string;
  title?: string;
  // Rendered as "(label)".
  paren?: boolean;
}

export interface DefinitionInput {
  id: string;
  requires?: string;
  source?: { production?: string; debug?: string; svgText?: string };
  metadata?: { idAttr?: string; tagsAttr?: string; helpAttr?: string; slugAttr?: string };
  tags?: {
    separator?: string;
    roles?: Partial<TagRoles>;
    deriveAncestors?: boolean;
    defaultGroup?: string;
    groups?: TagGroup[];
    meta?: Record<string, TagMetaInput>;
    descriptions?: Record<string, string>;
  };
  annotations?: {
    types?: Record<string, AnnotationTypeStyle>;
    max?: number;
    htmlWhitelist?: HtmlWhitelist;
    area?: { minHoverDistance?: number; borderWidth?: number; hoverBorderWidth?: number; resizeHandleSize?: number };
    markerScale?: number;
  };
  camera?: { defaultAlign?: [string, string]; maxZoom?: number };
  ui?: { tooltipMinWidth?: number; tooltipHideDelay?: number };
  content?: {
    page?: { title?: string; description?: string; author?: string; favicon?: string; lang?: string; noscript?: string };
    about?: string;
    // Facts under the About text.
    license?: string;
    repository?: string;
    footer?: { links?: FooterLink[]; version?: string };
    texts?: Partial<Record<TextKey, string>>;
    // The diagram's own CSS (custom-* classes, colours); adopted with the
    // package CSS.
    css?: string;
  };
  storage?: { namespace?: string };
  features?: FeaturesSpec;
  baseState?: DiagramView;
  views?: Record<string, { title?: string; state: DiagramView }>;
  hooks?: {
    parseHelp?: HelpParser;
    renderAbout?: (html: string) => string;
    renderFooter?: (footer: { links: FooterLink[]; version: string }) => string;
    tagLabel?: (tag: string, meta: TagMeta) => string;
  };
}

// Overrides may also use null to remove an inherited value.
export type DefinitionOverride = { [K in keyof DefinitionInput]?: DeepPartialNullable<DefinitionInput[K]> };
type DeepPartialNullable<T> = T extends (...args: never[]) => unknown
  ? T | null
  : T extends readonly unknown[]
    ? T | null
    : T extends object
      ? { [K in keyof T]?: DeepPartialNullable<T[K]> } | null
      : T | null;

export interface DiagramDefinition extends Readonly<Omit<DefinitionInput, "features">> {
  readonly features: Readonly<Features>;
  extend(overrides: DefinitionOverride): DiagramDefinition;
}

type Spec =
  | "string"
  | "number"
  | "boolean"
  | "function"
  | "array"
  | "stringArray"
  | "object"
  | "features"
  | "view"
  | "views"
  | { record: Spec }
  | { fields: Record<string, Spec> };

const SCHEMA: Spec = {
  fields: {
    id: "string",
    requires: "string",
    source: { fields: { production: "string", debug: "string", svgText: "string" } },
    metadata: { fields: { idAttr: "string", tagsAttr: "string", helpAttr: "string", slugAttr: "string" } },
    tags: {
      fields: {
        separator: "string",
        roles: { fields: { level: "string", cssClass: "string", priority: "string", severityFallback: "stringArray" } },
        deriveAncestors: "boolean",
        defaultGroup: "string",
        groups: "array",
        meta: { record: "object" },
        descriptions: { record: "string" },
      },
    },
    annotations: {
      fields: {
        types: { record: "object" },
        max: "number",
        htmlWhitelist: { record: "stringArray" },
        area: { fields: { minHoverDistance: "number", borderWidth: "number", hoverBorderWidth: "number", resizeHandleSize: "number" } },
        markerScale: "number",
      },
    },
    camera: { fields: { defaultAlign: "stringArray", maxZoom: "number" } },
    ui: { fields: { tooltipMinWidth: "number", tooltipHideDelay: "number" } },
    content: {
      fields: {
        page: { fields: { title: "string", description: "string", author: "string", favicon: "string", lang: "string", noscript: "string" } },
        about: "string",
        license: "string",
        repository: "string",
        footer: { fields: { links: "array", version: "string" } },
        texts: { record: "string" },
        css: "string",
      },
    },
    storage: { fields: { namespace: "string" } },
    features: "features",
    baseState: "view",
    views: "views",
    hooks: { fields: { parseHelp: "function", renderAbout: "function", renderFooter: "function", tagLabel: "function" } },
  },
};

const DEFINITION = Symbol.for("diagram-webkit.definition");

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function fail(path: string, message: string): never {
  throw new Error(`defineDiagram: ${path}: ${message}`);
}

function validate(value: unknown, spec: Spec, path: string): void {
  if (typeof spec === "object" && "fields" in spec) {
    if (!isPlainObject(value)) fail(path, "expected an object");
    Object.entries(value).forEach(([key, inner]) => {
      if (!(key in spec.fields)) fail(`${path}.${key}`, `unknown key; known: ${Object.keys(spec.fields).join(", ")}`);
      if (inner !== undefined) validate(inner, spec.fields[key], `${path}.${key}`);
    });
    return;
  }
  if (typeof spec === "object" && "record" in spec) {
    if (!isPlainObject(value)) fail(path, "expected an object");
    Object.entries(value).forEach(([key, inner]) => validate(inner, spec.record, `${path}.${key}`));
    return;
  }
  switch (spec) {
    case "string":
    case "number":
    case "boolean":
    case "function":
      if (typeof value !== spec || (spec === "number" && !Number.isFinite(value))) fail(path, `expected a ${spec}`);
      return;
    case "array":
      if (!Array.isArray(value)) fail(path, "expected an array");
      return;
    case "stringArray":
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) fail(path, "expected an array of strings");
      return;
    case "object":
      if (!isPlainObject(value)) fail(path, "expected an object");
      return;
    case "features":
      resolveFeatures(value as FeaturesSpec, undefined, path);
      return;
    case "view":
      normalizeView(value, path);
      return;
    case "views":
      if (!isPlainObject(value)) fail(path, "expected an object");
      Object.entries(value).forEach(([name, view]) => {
        if (!isPlainObject(view)) fail(`${path}.${name}`, "expected { title?, state }");
        Object.keys(view).forEach((key) => {
          if (key !== "title" && key !== "state") fail(`${path}.${name}.${key}`, "unknown key; known: title, state");
        });
        if (view.title !== undefined && typeof view.title !== "string") fail(`${path}.${name}.title`, "expected a string");
        normalizeView(view.state ?? {}, `${path}.${name}.state`);
      });
      return;
  }
}

function cloneDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneDeep) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, cloneDeep(inner)])) as T;
  }
  return value;
}

// Plain objects merge deeply, arrays and functions replace, null removes.
function mergeDeep(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null) {
      delete out[key];
      return;
    }
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeDeep(out[key] as Record<string, unknown>, value) : cloneDeep(value);
  });
  return out;
}

function mergeDefinitions(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const { features, views, baseState, ...rest } = override;
  const out = mergeDeep(base, rest);

  if (features === null) delete out.features;
  else if (features !== undefined) {
    out.features = resolveFeatures(features as FeaturesSpec, out.features as Features | undefined, "features");
  }

  if (views === null) delete out.views;
  else if (views !== undefined) {
    if (!isPlainObject(views)) fail("views", "expected an object");
    const merged: Record<string, unknown> = { ...((out.views as Record<string, unknown>) || {}) };
    Object.entries(views).forEach(([name, view]) => {
      if (view === null) delete merged[name];
      else if (view !== undefined) merged[name] = cloneDeep(view);
    });
    out.views = merged;
  }

  if (baseState === null) delete out.baseState;
  else if (baseState !== undefined) {
    out.baseState = mergeView((out.baseState as DiagramView) || {}, normalizeViewPatch(baseState, "baseState"));
  }
  return out;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value) || isPlainObject(value)) {
    Object.values(value as object).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function finalize(raw: Record<string, unknown>): DiagramDefinition {
  validate(raw, SCHEMA, "definition");
  if (typeof raw.id !== "string" || !raw.id) fail("definition.id", "required");
  if (typeof raw.requires === "string" && !satisfies(VERSION, raw.requires)) {
    fail("definition.requires", `diagram-webkit ${VERSION} does not satisfy ${JSON.stringify(raw.requires)}`);
  }
  const whitelist = (raw.annotations as { htmlWhitelist?: HtmlWhitelist } | undefined)?.htmlWhitelist;
  if (whitelist) assertSafeWhitelist(whitelist, "definition.annotations.htmlWhitelist");
  const texts = (raw.content as { texts?: Record<string, string> } | undefined)?.texts;
  const unknownTexts = Object.keys(texts || {}).filter((key) => !(key in DEFAULT_TEXTS));
  if (unknownTexts.length > 0) fail("definition.content.texts", `unknown keys ${unknownTexts.join(", ")}`);

  const definition: Record<string, unknown> = {
    ...raw,
    features: resolveFeatures(raw.features as FeaturesSpec | undefined, undefined, "definition.features"),
  };
  if (definition.baseState) definition.baseState = normalizeView(definition.baseState, "definition.baseState");

  Object.defineProperty(definition, "extend", {
    value: (overrides: DefinitionOverride) => {
      if (!isPlainObject(overrides)) fail("extend", "expected an object");
      return finalize(mergeDefinitions(cloneDeep({ ...definition }) as Record<string, unknown>, overrides as Record<string, unknown>));
    },
    enumerable: false,
  });
  Object.defineProperty(definition, DEFINITION, { value: true, enumerable: false });
  return deepFreeze(definition) as unknown as DiagramDefinition;
}

export function defineDiagram(input: DefinitionInput): DiagramDefinition {
  if (!isPlainObject(input)) fail("definition", "expected an object");
  return finalize(cloneDeep(input) as unknown as Record<string, unknown>);
}

export function isDiagramDefinition(value: unknown): value is DiagramDefinition {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[DEFINITION] === true;
}
