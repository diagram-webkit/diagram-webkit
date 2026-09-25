// Composition root for one diagram instance. All
// state lives in ctx.s instead of module-level variables, so any number of
// instances can share a page, and destroy() removes every trace.
import { DEFAULT_ANNOTATION_TYPES, DEFAULT_MAX_ANNOTATIONS } from "../core/annotations";
import { serializeSlide } from "../core/codec/slide";
import { stateToJson } from "../core/codec/json";
import { urlToState } from "../core/codec/url";
import { isDiagramDefinition } from "../core/definition";
import { parseHelpContent } from "../core/help";
import { DEFAULT_HTML_WHITELIST, processUserDescription } from "../core/html";
import { resolveFeatures } from "../core/presets";
import { mergeView, normalizeState, normalizeUi, normalizeViewPatch, VIEW_KEYS } from "../core/state";
import { createTagModel, DEFAULT_TAGS_CONFIG } from "../core/tags";
import { resolveTexts } from "../core/texts";
import { DEFAULT_METADATA_ATTRS } from "../core/validate";
import { createStorage } from "../adapters/storage.js";
import { createUrlSync } from "../adapters/url-sync.js";
import { createAnnotationHover } from "./annotations/hover.js";
import { createAnnotationPositioning } from "./annotations/positioning.js";
import { createAnnotationRender } from "./annotations/render.js";
import { COVER_ZOOM, createCamera } from "./camera.js";
import { createCameraControl } from "./camera-control.js";
import { createCameraGeometry } from "./camera-geometry.js";
import { createCameraUrl } from "./camera-url.js";
import { createTimers, scopedClass } from "./context.js";
import { createFilter } from "./filter.js";
import { createHelpIndex, VISIBILITY_FADE_MS } from "./help-index.js";
import { createInput } from "./input.js";
import { createLifecycle } from "./lifecycle.js";
import { createLoader } from "./loader.js";
import { createHighlight } from "./overlays/highlight.js";
import { createFocus } from "./focus.js";
import { createPhases } from "./phases.js";
import { createLocalSource } from "./local-source.js";
import { STANDALONE_ID, standaloneDefinition } from "./standalone.js";
import { renderErrorBox } from "./error-box.js";
import { STARTING_CLASS } from "./lifecycle.js";
import { createHighlightLine } from "./overlays/highlight-line.js";
import { createPinRings } from "./overlays/pins.js";
import { createPulse } from "./overlays/pulse.js";
import { createPins } from "./pins.js";
import { adoptStyles } from "./styles.js";
import { createTooltip } from "../ui/tooltip.js";
import { createUi } from "../ui/app.js";
import { createTheme } from "../ui/theme.js";

const EVENTS = new Set(["ready", "error", "statechange", "camerachange", "elementactivate"]);
const DEFAULT_CAMERA = Object.freeze({ defaultAlign: ["left", "bottom"], maxZoom: 4 });
const DEFAULT_UI = Object.freeze({ tooltipMinWidth: 380, tooltipHideDelay: 100 });
const DEFAULT_AREA = Object.freeze({ minHoverDistance: 5, borderWidth: 3, hoverBorderWidth: 4, resizeHandleSize: 8 });
let instanceCounter = 0;

function resolveConfig(definition) {
  const tags = definition.tags || {};
  const annotations = definition.annotations || {};
  const hooks = definition.hooks || {};
  const content = definition.content || {};
  return {
    id: definition.id,
    source: definition.source || {},
    metadata: { ...DEFAULT_METADATA_ATTRS, ...(definition.metadata || {}) },
    tags: {
      ...DEFAULT_TAGS_CONFIG,
      ...tags,
      roles: { ...DEFAULT_TAGS_CONFIG.roles, ...(tags.roles || {}) },
    },
    annotations: {
      types: annotations.types || DEFAULT_ANNOTATION_TYPES,
      max: annotations.max ?? DEFAULT_MAX_ANNOTATIONS,
      htmlWhitelist: annotations.htmlWhitelist || DEFAULT_HTML_WHITELIST,
      area: { ...DEFAULT_AREA, ...(annotations.area || {}) },
      markerScale: annotations.markerScale ?? 0.01,
    },
    camera: { ...DEFAULT_CAMERA, ...(definition.camera || {}) },
    ui: { ...DEFAULT_UI, ...(definition.ui || {}) },
    content: {
      page: content.page || {},
      about: content.about || "",
      license: content.license || "",
      repository: content.repository || "",
      footer: { links: [], version: "", ...(content.footer || {}) },
    },
    storage: { namespace: (definition.storage && definition.storage.namespace) || definition.id },
    parseHelp: hooks.parseHelp || parseHelpContent,
    tagLabel: hooks.tagLabel ? (tag, meta) => hooks.tagLabel(tag, meta) : undefined,
    hooks,
    views: definition.views || {},
    baseState: definition.baseState || {},
  };
}

function resolveSource(config, opts, debug) {
  if (opts.source) {
    if (typeof opts.source !== "object" || !("url" in opts.source || "svgText" in opts.source || "svg" in opts.source)) {
      throw new TypeError("mountDiagram: opts.source must be { url } | { svgText } | { svg }");
    }
    return opts.source;
  }
  if (config.source.svgText) return { svgText: config.source.svgText };
  const url = debug ? config.source.debug || config.source.production : config.source.production || config.source.debug;
  // No diagram anywhere: local mode, the reader brings one (local-source.js).
  return url ? { url } : null;
}

function buildSkeleton(doc, root, texts, idPrefix) {
  const el = (tag, name) => {
    const node = doc.createElement(tag);
    node.className = scopedClass(name);
    node.id = `${idPrefix}-${name}`;
    return node;
  };
  const container = el("div", "container");
  const wrapper = el("div", "image-wrapper");
  const image = el("div", "main-image");
  image.setAttribute("role", "img");
  image.setAttribute("aria-label", texts.diagramLabel);
  const tooltipLayer = el("div", "tooltip-layer");
  wrapper.append(image, tooltipLayer);
  container.appendChild(wrapper);
  root.appendChild(container);
  return { container, wrapper, image, tooltipLayer };
}

/**
 * @param {HTMLElement} container
 * @param {any} [definitionOrNone] omitted: the standalone app (the reader opens a diagram)
 * @param {{ features?: any, initialState?: any, ownerDocument?: Document, source?: any, debug?: boolean, fade?: number, app?: boolean }} [opts]
 */
export function createInstance(container, definitionOrNone, opts = {}) {
  // No definition at all is the standalone app: no diagram, the reader brings one.
  const definition = definitionOrNone === undefined || definitionOrNone === null ? standaloneDefinition() : definitionOrNone;
  if (!isDiagramDefinition(definition)) {
    throw new TypeError("mountDiagram: definition must be created with defineDiagram()");
  }
  if (!container || container.nodeType !== 1) throw new TypeError("mountDiagram: container must be an element");

  const doc = opts.ownerDocument || container.ownerDocument;
  const win = /** @type {Window & typeof globalThis} */ (doc.defaultView);
  if (!win) throw new Error("mountDiagram: the container's document has no window");

  const config = resolveConfig(definition);
  const features = resolveFeatures(opts.features, /** @type {any} */ (definition.features), "opts.features");
  const texts = resolveTexts(definition.content && definition.content.texts);
  const model = createTagModel(config.tags);
  const idPrefix = `dwk${(instanceCounter += 1)}`;
  const controller = new AbortController();
  const timers = createTimers(win);
  const listeners = new Map();

  const urlState = features.urlSync ? urlToState(win.location.search, config.annotations.max) : null;
  const debug = opts.debug ?? (features.urlSync && new URLSearchParams(win.location.search).has("debug"));
  const initial = normalizeState(/** @type {any} */ ({ version: 1, view: {}, ui: {}, ...(opts.initialState || {}) }), "opts.initialState");
  const view = mergeView(mergeView(config.baseState, urlState ? urlState.view : {}), initial.view);
  const ui = { ...(urlState ? urlState.ui : {}), ...initial.ui };

  const root = doc.createElement("div");
  root.className = `dwk-root ${STARTING_CLASS}`;
  if (opts.app) root.classList.add("dwk-app");
  root.dataset.dwkInstance = idPrefix;
  if (opts.fade !== undefined) {
    if (!Number.isFinite(opts.fade) || opts.fade < 0) throw new TypeError(`opts.fade must be a non-negative number of ms, got ${opts.fade}`);
    root.style.setProperty("--dwk-fade", `${opts.fade}ms`);
  }
  const releaseStyles = adoptStyles(doc);
  const releaseDiagramStyles = definition.content && definition.content.css ? adoptStyles(doc, definition.content.css) : () => {};
  container.appendChild(root);
  const els = buildSkeleton(doc, root, texts, idPrefix);

  /** @type {Record<string, any>} */
  const s = {
    debug,
    source: resolveSource(config, opts, debug),
    coverZoom: COVER_ZOOM,
    cachedBounds: null,
    currentZoom: COVER_ZOOM,
    maxZoom: config.camera.maxZoom,
    minZoom: COVER_ZOOM,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panScale: 1,
    imageTranslateX: 0,
    imageTranslateY: 0,
    isTouchActive: false,
    hoverPanAnimationFrame: 0,
    fitAllRestoreState: null,
    goToNavigationToken: 0,
    userAnnotations: view.annotations ? view.annotations.map((ann) => ({ ...ann })) : [],
    editModeEnabled: false,
    currentMode: "area",
    selectedType: "info",
    diagramAspectRatio: null,
    diagramTagElements: new Map(),
    svgHelpRecords: [],
    svgHelpRecordByElement: new Map(),
    annotationSearchQuery: view.query || "",
    filterPanelOpen: Boolean(ui.panelOpen),
    filterPanelOverlayMode: true,
    pinnedHelpSlugs: new Set(view.pins || []),
    initialPins: view.pins || [],
    selectedLevel: view.level ?? 0,
    hasInitialSelectedLevel: view.level !== undefined,
    maxDiagramLevel: 0,
    initialHiddenTags: view.hiddenTags ? new Set(view.hiddenTags) : null,
    initialOnlyTags: view.onlyTags && view.onlyTags.length ? view.onlyTags : null,
    onlyTags: null,
    highlight: view.highlight || null,
    focus: view.focus && view.focus.tags.length ? view.focus : null,
    fitAllMode: false,
    fitGeometryMode: "cover",
    viewportUrlSyncReady: false,
    pendingCoverSyncAfterFitExit: false,
    tagVisibility: new Map(),
    tagTreeExpanded: Boolean(ui.tagTreeExpanded),
    initialCamera: view.camera,
    instantVisibility: false,
    fadeMs: opts.fade ?? VISIBILITY_FADE_MS,
    // With an explicit fade, changes run out-then-in (phases.js).
    sequenced: opts.fade !== undefined,
    theme: view.theme,
  };
  s.sourceLabel = s.source ? s.source.url || "(inline svg)" : "(local svg)";

  let cameraFrame = 0;
  let stateChangeQueued = false;

  /** @type {any} */
  const ctx = {
    doc,
    win,
    root,
    els,
    s,
    config,
    features,
    texts,
    model,
    idPrefix,
    // The standalone app (dom/standalone.js), or a site built on it with extend().
    standalone: definition.id === STANDALONE_ID,
    signal: controller.signal,
    timers,
    services: {},
    loaded: false,
    destroyed: false,
    storage: createStorage(win, { namespace: config.storage.namespace, persistent: features.persistence }),
    el(name) {
      const node = root.querySelector(`.${scopedClass(name)}`);
      if (!node) throw new Error(`diagram-webkit: element .${scopedClass(name)} missing`);
      return node;
    },
    maybeEl(name) {
      return root.querySelector(`.${scopedClass(name)}`);
    },
    isInsideModal(target) {
      return Boolean(target.closest(".dwk-user-annotations-modal, .dwk-edit-annotation-modal, .dwk-help-dialog"));
    },
    annotationStyle(type) {
      return config.annotations.types[type] || null;
    },
    parseHtml(html) {
      const parsed = new win.DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");
      const toNode = (node) => {
        if (node.nodeType === 3) return { type: "text", text: node.textContent || "" };
        if (node.nodeType !== 1) return { type: "other" };
        const attrs = {};
        Array.from(node.attributes).forEach((attr) => {
          attrs[attr.name] = attr.value;
        });
        return { type: "element", tag: node.tagName.toLowerCase(), attrs, children: Array.from(node.childNodes).map(toNode) };
      };
      return Array.from(parsed.body.childNodes).map(toNode);
    },
    processUserDescription(text) {
      return processUserDescription(text, ctx.parseHtml, config.annotations.htmlWhitelist);
    },
    cellId(element) {
      const cell = element.closest(`[${config.metadata.idAttr}]`);
      return cell ? cell.getAttribute(config.metadata.idAttr) : null;
    },
    queryElements(query) {
      const out = new Set();
      (query.ids || []).forEach((id) => {
        ctx.els.image.querySelectorAll(`[${config.metadata.idAttr}="${win.CSS.escape(id)}"]`).forEach((cell) => {
          const inner = cell.querySelector(`[${config.metadata.tagsAttr}], [${config.metadata.helpAttr}]`);
          out.add(inner || cell);
        });
      });
      (query.slugs || []).forEach((slug) => {
        s.svgHelpRecords.filter((record) => record.slug === slug).forEach((record) => out.add(record.element));
      });
      (query.tags || []).forEach((tag) => (s.diagramTagElements.get(tag) || []).forEach((element) => out.add(element)));
      return Array.from(out);
    },
    emit(event, payload) {
      (listeners.get(event) || []).forEach((listener) => listener(payload));
    },
    notifyCameraChange() {
      if (cameraFrame || !listeners.get("camerachange")?.size) return;
      cameraFrame = timers.requestAnimationFrame(() => {
        cameraFrame = 0;
        ctx.emit("camerachange", ctx.services.cameraControl.get());
      });
    },
    notifyStateChange() {
      if (stateChangeQueued || !listeners.get("statechange")?.size) return;
      stateChangeQueued = true;
      queueMicrotask(() => {
        stateChangeQueued = false;
        if (!ctx.destroyed && ctx.loaded) ctx.emit("statechange", api.getState());
      });
    },
  };

  const sv = ctx.services;
  sv.theme = createTheme(ctx);
  sv.geometry = createCameraGeometry(ctx);
  sv.camera = createCamera(ctx);
  sv.cameraUrl = createCameraUrl(ctx);
  sv.cameraControl = createCameraControl(ctx);
  sv.urlSync = createUrlSync(ctx);
  sv.tooltip = createTooltip(ctx);
  sv.phases = createPhases(ctx);
  sv.helpIndex = createHelpIndex(ctx);
  sv.filter = createFilter(ctx);
  sv.pins = createPins(ctx);
  sv.pinRings = createPinRings(ctx);
  sv.pulse = createPulse(ctx);
  sv.highlight = createHighlight(ctx);
  sv.focus = createFocus(ctx);
  sv.highlightLine = createHighlightLine(ctx);
  sv.annotationPositioning = createAnnotationPositioning(ctx);
  sv.annotationHover = createAnnotationHover(ctx);
  sv.annotations = createAnnotationRender(ctx);
  sv.input = createInput(ctx);
  sv.loader = createLoader(ctx);
  sv.overlays = {
    scheduleMarkerPositioning(immediate = false) {
      sv.annotationPositioning.scheduleMarkerPositioning(immediate);
      if (immediate) sv.pinRings.reposition();
      else sv.pinRings.scheduleReposition();
      sv.highlight.reposition();
    },
  };
  createUi(ctx);
  if (!s.source) sv.localSource = createLocalSource(ctx);
  sv.lifecycle = createLifecycle(ctx);
  sv.cameraUrl.setIntent(view.camera);

  sv.input.initialize();
  // Layout size the view was last fitted to. A resize at the same size would
  // re-align a cover view and throw away where the camera put it. Compared
  // instead of skipping the observer's first call: the container may already
  // have changed size between the load and that call.
  let fittedSize = "";
  const layoutSize = () => `${root.offsetWidth}x${root.offsetHeight}`;
  const resizeObserver = new win.ResizeObserver(() => {
    if (!ctx.loaded || ctx.suspended) return;
    const size = layoutSize();
    if (size === fittedSize) return;
    fittedSize = size;
    sv.input.handleResize();
    sv.overlays.scheduleMarkerPositioning();
    sv.ui.onResize();
  });
  resizeObserver.observe(root);
  ctx.suspended = false;

  const api = {
    root,
    definition,
    features,
    ready: /** @type {Promise<void>} */ (Promise.resolve()),

    getState() {
      const camera = sv.cameraUrl.getCameraState();
      /** @type {import("../core/state").DiagramState} */
      const out = { version: 1, view: {}, ui: {} };
      if (camera) out.view.camera = camera;
      if (s.selectedLevel !== s.maxDiagramLevel) out.view.level = s.selectedLevel;
      if (s.onlyTags) out.view.onlyTags = [...s.onlyTags];
      else {
        const hidden = sv.filter.getExplicitHiddenTags();
        if (hidden.length) out.view.hiddenTags = hidden;
      }
      const query = (s.annotationSearchQuery || "").trim();
      if (query) out.view.query = query;
      if (s.pinnedHelpSlugs.size) out.view.pins = Array.from(s.pinnedHelpSlugs).sort((a, b) => a.localeCompare(b));
      if (s.highlight) out.view.highlight = JSON.parse(JSON.stringify(s.highlight));
      if (s.focus) out.view.focus = JSON.parse(JSON.stringify(s.focus));
      if (s.userAnnotations.length) out.view.annotations = JSON.parse(JSON.stringify(s.userAnnotations, (key, value) => (key.startsWith("_") ? undefined : value)));
      if (sv.theme.getCurrentTheme() === "dark") out.view.theme = "dark";
      if (s.filterPanelOpen) out.ui.panelOpen = true;
      if (s.tagTreeExpanded) out.ui.tagTreeExpanded = true;
      return out;
    },

    setState(patch, options = {}) {
      assertAlive();
      const replace = Boolean(options.replace);
      const viewPatch = normalizeViewPatch(patch && patch.view, "setState.view");
      const uiPatch = normalizeUi(patch && patch.ui, "setState.ui");
      const touched = new Set(replace ? VIEW_KEYS : Object.keys(viewPatch));
      const next = mergeView(replace ? {} : api.getState().view, viewPatch);
      return applyState(next, uiPatch, touched, options.transition ?? false);
    },

    camera: {
      fit: (options = {}) => api.setState({ view: { camera: { fit: true } } }, options),
      showRect: (rect, options = {}) => api.setState({ view: { camera: { rect } } }, options),
      focus: (target, options = {}) =>
        api.setState({ view: { camera: { focus: target, ...(options.padding !== undefined ? { padding: options.padding } : {}) } } }, options),
      zoomBy: (factor, at) => sv.cameraControl.zoomBy(factor, at),
      get: () => sv.cameraControl.get(),
    },

    query(query) {
      return ctx.queryElements(query || {});
    },

    tags() {
      return sv.filter.getAllTags().map((tag) => {
        const meta = model.getTagMeta(tag);
        return {
          tag,
          parent: model.getTagParent(tag),
          label: meta.label,
          group: meta.group,
          description: model.getTagDescription(tag, { inherit: true }),
          count: (s.diagramTagElements.get(tag) || []).length,
          hidden: s.tagVisibility.get(tag) === false,
        };
      });
    },

    levels() {
      return { max: s.maxDiagramLevel };
    },

    // Wheel, drag and pinch can change after mount (a "live" deck slide).
    setInput(input) {
      sv.input.setInput(input || {});
    },

    on(event, listener) {
      if (!EVENTS.has(event)) throw new Error(`diagram-webkit: unknown event "${event}"; known: ${Array.from(EVENTS).join(", ")}`);
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
      return () => listeners.get(event).delete(listener);
    },

    serialize(format, options = {}) {
      const state = api.getState();
      if (format === "json") return stateToJson(state);
      if (format === "url") return sv.urlSync.buildSearch("");
      if (format === "slide") return serializeSlide(state.view, options.base ?? config.baseState, options);
      throw new Error(`serialize: unknown format "${format}"; expected url, json or slide`);
    },

    suspend() {
      if (ctx.suspended) return;
      ctx.suspended = true;
      sv.input.suspend();
      sv.cameraControl.stopAnimation();
      sv.camera.stopHoverPanAnimation();
      if (sv.tooltip) sv.tooltip.hideAll();
    },

    resume() {
      if (!ctx.suspended) return;
      ctx.suspended = false;
      sv.input.resume();
      api.resize();
    },

    resize() {
      if (!ctx.loaded || ctx.destroyed) return;
      const size = layoutSize();
      if (size === fittedSize) return;
      fittedSize = size;
      sv.input.handleResize();
      sv.geometry.updateImageTransform();
    },

    destroy() {
      if (ctx.destroyed) return;
      ctx.destroyed = true;
      controller.abort();
      timers.stop();
      resizeObserver.disconnect();
      listeners.clear();
      root.remove();
      releaseDiagramStyles();
      releaseStyles();
    },
  };

  ctx.api = api;

  function assertAlive() {
    if (ctx.destroyed) throw new Error("diagram-webkit: instance is destroyed");
  }

  // Applies only the keys a setState touched; `view` already holds the
  // current values for the rest.
  async function applyState(view, uiPatch, touched, transition) {
    const has = (key) => touched.has(key);
    if (has("theme")) sv.theme.applyTheme(view.theme || "light", { persist: false });
    if (has("annotations")) s.userAnnotations = (view.annotations || []).map((ann) => ({ ...ann }));
    if (has("query")) s.annotationSearchQuery = view.query || "";
    if (has("pins")) s.pinnedHelpSlugs = new Set(view.pins || []);
    if (has("highlight")) s.highlight = view.highlight || null;
    if (has("focus")) s.focus = view.focus && view.focus.tags.length ? view.focus : null;
    if (uiPatch.tagTreeExpanded !== undefined) s.tagTreeExpanded = uiPatch.tagTreeExpanded;

    if (!ctx.loaded) {
      if (has("level")) {
        s.selectedLevel = view.level ?? 0;
        s.hasInitialSelectedLevel = view.level !== undefined;
      }
      if (has("hiddenTags") || has("onlyTags")) {
        s.initialHiddenTags = view.hiddenTags ? new Set(view.hiddenTags) : null;
        s.initialOnlyTags = view.onlyTags && view.onlyTags.length ? view.onlyTags : null;
      }
      if (has("pins")) s.initialPins = view.pins || [];
      if (uiPatch.panelOpen !== undefined) s.filterPanelOpen = uiPatch.panelOpen;
      if (has("camera")) await sv.cameraControl.apply(view.camera);
      return;
    }

    if (has("level")) s.selectedLevel = Math.max(0, Math.min(s.maxDiagramLevel, view.level ?? s.maxDiagramLevel));
    if (has("hiddenTags") || has("onlyTags")) {
      if (view.onlyTags && view.onlyTags.length) sv.filter.setOnlyTags(view.onlyTags);
      else {
        sv.filter.setOnlyTags(null);
        sv.filter.setHiddenTags(view.hiddenTags || []);
      }
    }
    if (has("pins")) {
      sv.pins.normalizePinnedHelpSlugs();
      sv.pinRings.render();
    }
    sv.helpIndex.refreshPinnedStates();
    if (sv.ui) sv.ui.syncFromState();
    sv.annotations.renderAllMarkers();
    if (uiPatch.panelOpen !== undefined) {
      if (sv.panel) sv.panel.setFilterPanelOpen(uiPatch.panelOpen);
      else s.filterPanelOpen = uiPatch.panelOpen;
    }
    if (has("camera")) await sv.cameraControl.apply(view.camera, { transition });
    sv.urlSync.updateURLState();
  }

  api.ready = sv.lifecycle.start().then(
    () => {
      if (ctx.destroyed) return;
      ctx.loaded = true;
      fittedSize = layoutSize();
      // After the first painted frame, so the initial render does not fade in.
      timers.requestAnimationFrame(() => timers.requestAnimationFrame(() => root.classList.add("dwk-loaded")));
      ctx.emit("ready", undefined);
    },
    (error) => {
      ctx.emit("error", error);
      throw error;
    },
  );
  return api;
}

/**
 * @param {HTMLElement} container
 * @param {any} [definition] omitted: the standalone app (the reader opens a diagram)
 * @param {Parameters<typeof createInstance>[2]} [opts]
 */
export async function mountDiagram(container, definition, opts = {}) {
  let instance;
  // A bad definition or bad options would otherwise leave a blank page: show
  // the details, then fail as before. Load errors show inside the instance.
  try {
    instance = createInstance(container, definition, opts);
  } catch (error) {
    renderErrorBox(container, "diagram-webkit: the diagram could not start", error);
    throw error;
  }
  await instance.ready;
  return instance;
}
