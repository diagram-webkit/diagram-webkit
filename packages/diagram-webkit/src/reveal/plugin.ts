import { parseStateAttribute, SLIDE_ATTRS } from "../core/codec/slide";
import type { DiagramDefinition } from "../core/definition";
import { resolveFeatures, type FeaturesSpec } from "../core/presets";
import { mergeView, type DiagramView } from "../core/state";
import { mountDiagram } from "../dom/instance.js";
import { ERROR_BOX_CLASS, renderErrorBox } from "../dom/error-box.js";
import type { DiagramInstance } from "../types";
import { createDebugOverlay } from "./debug-overlay";
import { mountPrintInstances } from "./print";
import { resolveSlide, slideFeatures, slotOf, type SlideContext } from "./slots";
import { createStage, transitionMs, type Stage } from "./stage";

// The parts of the Reveal API the plugin uses.
export interface RevealDeck {
  on(event: string, listener: (event: Event & { currentSlide?: HTMLElement; previousSlide?: HTMLElement; fragment?: HTMLElement }) => void): void;
  off(event: string, listener: (event: Event) => void): void;
  getCurrentSlide(): HTMLElement | undefined;
  getRevealElement(): HTMLElement | null;
  getSlidesElement(): HTMLElement | null;
  getConfig?(): { transition?: string; transitionSpeed?: string };
  isOverview?(): boolean;
  isReady?(): boolean;
  // reveal.js 6 has isPrintView(); its bundled typings (and 4.x) still name
  // isPrintingPDF().
  isPrintView?(): boolean;
  isPrintingPDF?(): boolean;
  isSpeakerNotes?(): boolean;
}

function isPrint(deck: RevealDeck): boolean {
  if (typeof deck.isPrintView === "function") return deck.isPrintView();
  if (typeof deck.isPrintingPDF === "function") return deck.isPrintingPDF();
  throw new Error("diagram-webkit reveal: deck has neither isPrintView() nor isPrintingPDF()");
}

export interface RevealPluginOptions {
  // ms for camera moves between slides and fragments; false for none.
  transition?: number | false;
  // ms for cell show/hide, dim and highlight changes; false for the library default.
  fade?: number | false;
  // "shared": one instance on a stage laid over the current slot.
  // "per-slide": one instance inside each slot.
  instance?: "shared" | "per-slide";
  baseState?: DiagramView;
  features?: FeaturesSpec;
}

export interface DiagramRevealPlugin {
  id: "diagram-webkit";
  init(deck: RevealDeck): Promise<void>;
  destroy(): void;
  instances(): DiagramInstance[];
  lastError(): Error | null;
}

const DEFAULT_TRANSITION = 600;
const DEFAULT_FADE = 400;

export function revealPlugin(definition: DiagramDefinition, options: RevealPluginOptions = {}): DiagramRevealPlugin {
  const transition = options.transition ?? DEFAULT_TRANSITION;
  const fade = options.fade ?? DEFAULT_FADE;
  const mountOptions = (view: DiagramView) => ({ features: features(), initialState: { view }, ...(fade === false ? {} : { fade }) });
  const instances = new Map<HTMLElement, DiagramInstance>();
  const cleanups: (() => void)[] = [];
  let shared: DiagramInstance | null = null;
  let stage: Stage | null = null;
  let deckStarted = false;
  let lastError: Error | null = null;
  let context: SlideContext = { base: {}, views: {} };

  const features = (): FeaturesSpec => options.features ?? (definition.features as FeaturesSpec);
  // What a slide without data-diagram-features gets, so input set by one
  // slide never leaks into the next.
  const baseInput = () => {
    const { keyboard: _keyboard, ...pointer } = resolveFeatures(options.features, definition.features, "revealPlugin options.features").input;
    return pointer;
  };

  const errorBoxes = new Map<HTMLElement, HTMLElement>();
  let baseError: unknown = null;

  function report(error: unknown): void {
    lastError = error instanceof Error ? error : new Error(String(error));
    console.error(lastError);
  }

  // Errors are shown where the diagram would be, with their details, and
  // the deck keeps running; the box goes on the next slide that works.
  function showError(container: HTMLElement, title: string, error: unknown): void {
    report(error);
    clearError(container);
    errorBoxes.set(container, renderErrorBox(container, title, error));
  }

  function clearError(container: HTMLElement): void {
    const box = errorBoxes.get(container);
    if (box) box.remove();
    errorBoxes.delete(container);
  }

  // An instance shows its own load or start error; add one only if it did not.
  function showMountError(container: HTMLElement, error: unknown): void {
    if (container.querySelector(`.dwk-error-overlay, .${ERROR_BOX_CLASS}`)) report(error);
    else showError(container, "diagram-webkit: the diagram could not load", error);
  }

  function slideTitle(slide: Element): string {
    return `diagram-webkit: slide ${slide.id ? `#${slide.id} ` : ""}could not be shown`;
  }

  // An invalid data-diagram-base falls back to the definition's base and is
  // shown once there is somewhere to show it.
  function deckBase(deck: RevealDeck): DiagramView {
    const base = mergeView(definition.baseState || {}, options.baseState || {});
    const element = deck.getRevealElement();
    const attribute = element ? element.getAttribute(SLIDE_ATTRS.base) : null;
    if (!attribute) return base;
    try {
      return mergeView(base, parseStateAttribute(attribute, `.reveal ${SLIDE_ATTRS.base}`));
    } catch (error) {
      baseError = error;
      return base;
    }
  }

  // Never throws: a slide that cannot be read starts from the deck base.
  function initialView(slide: Element, container: HTMLElement): DiagramView {
    try {
      return resolveSlide(slide, context);
    } catch (error) {
      showError(container, slideTitle(slide), error);
      return context.base;
    }
  }

  // A slide is independent of the previous one: its view replaces the state.
  // Applied synchronously on the event, so a burst of events always ends on
  // what is on screen; only the camera tween runs on afterwards.
  function showSlide(deck: RevealDeck, previous: Element | null | undefined, eventAnimates: boolean): void {
    if (!shared || !stage) return;
    // Reveal's own start-up navigation (the URL hash) runs without
    // transitions, before its "ready" event; so does the diagram.
    const animate = eventAnimates && deckStarted;
    const instance = shared;
    const slide = deck.getCurrentSlide();
    const slot = slotOf(slide);
    const overview = Boolean(deck.isOverview && deck.isOverview());
    if (!slide || !slot || overview) {
      stage.hide(overview || !animate ? 0 : transitionMs(deck, previous, "out"), () => instance.suspend());
      return;
    }
    const wasVisible = stage.visible();
    const where = stage.element;
    let view: DiagramView;
    try {
      view = resolveSlide(slide, context);
      stage.place(slot);
      instance.setInput({ ...baseInput(), ...((slideFeatures(slide) || {}).input || {}) });
    } catch (error) {
      // Over this slide's slot, on top of the last good state.
      if (slot.offsetParent) stage.place(slot);
      instance.resume();
      if (!wasVisible) stage.show(0);
      showError(where, slideTitle(slide), error);
      return;
    }
    clearError(where);
    instance.resume();
    // Coming back from a slide without a diagram: jump to the new view while
    // hidden, then fade in with the slide.
    instance
      .setState({ view }, { replace: true, transition: animate && wasVisible ? transition : false })
      .catch((error) => showError(where, slideTitle(slide), error));
    if (!wasVisible) stage.show(animate ? transitionMs(deck, slide, "in") : 0);
  }

  function listen(deck: RevealDeck, event: string, listener: (event: Event) => void): void {
    deck.on(event, listener);
    cleanups.push(() => deck.off(event, listener));
  }

  async function initShared(deck: RevealDeck): Promise<void> {
    const slides = deck.getSlidesElement();
    if (!slides) return;
    const current = deck.getCurrentSlide();
    const slot = slotOf(current) || slides.querySelector<HTMLElement>(`[${SLIDE_ATTRS.slot}]`);
    if (!slot) return;
    const owner = current && slotOf(current) ? current : (slot.closest("section") as HTMLElement);
    stage = createStage(slides);
    cleanups.push(() => stage && stage.destroy());
    // A slot on a slide that is not shown has no layout yet; size the stage
    // from the first slot that has one, the slide change places it properly.
    if (slot.offsetParent) stage.place(slot);
    else Object.assign(stage.element.style, { left: "0px", top: "0px", width: `${slides.offsetWidth}px`, height: `${slides.offsetHeight}px` });
    const view = initialView(owner, stage.element);
    try {
      shared = await mountDiagram(stage.element, definition, mountOptions(view));
    } catch (error) {
      stage.show(0);
      showMountError(stage.element, error);
      return;
    }
    instances.set(stage.element, shared);
    if (baseError) showError(stage.element, "diagram-webkit: invalid data-diagram-base on .reveal", baseError);
    showSlide(deck, undefined, false);

    // A plugin added to a running deck never sees "ready".
    deckStarted = Boolean(deck.isReady && deck.isReady());
    listen(deck, "ready", () => {
      deckStarted = true;
    });
    listen(deck, "slidechanged", (event) => showSlide(deck, (event as Event & { previousSlide?: HTMLElement }).previousSlide, true));
    ["fragmentshown", "fragmenthidden"].forEach((name) => listen(deck, name, () => showSlide(deck, deck.getCurrentSlide(), true)));
    listen(deck, "overviewshown", () => showSlide(deck, deck.getCurrentSlide(), false));
    listen(deck, "overviewhidden", () => showSlide(deck, deck.getCurrentSlide(), false));
    listen(deck, "resize", () => {
      const current = slotOf(deck.getCurrentSlide());
      if (current && stage) stage.place(current);
    });
  }

  async function initPerSlide(deck: RevealDeck): Promise<void> {
    const slides = deck.getSlidesElement();
    if (!slides) return;
    const slots = Array.from(slides.querySelectorAll<HTMLElement>(`[${SLIDE_ATTRS.slot}]`));
    await Promise.all(
      slots.map(async (slot) => {
        const slide = slot.closest("section") as HTMLElement;
        try {
          instances.set(slot, await mountDiagram(slot, definition, mountOptions(initialView(slide, slot))));
        } catch (error) {
          showMountError(slot, error);
        }
      }),
    );
    if (baseError && slots[0]) showError(slots[0], "diagram-webkit: invalid data-diagram-base on .reveal", baseError);
    const refresh = () => {
      const slide = deck.getCurrentSlide();
      instances.forEach((instance, slot) => (slot.closest("section") === slide ? instance.resume() : instance.suspend()));
      const slot = slotOf(slide);
      const instance = slot ? instances.get(slot) : undefined;
      if (!slide || !slot || !instance) return;
      instance.resize();
      let view: DiagramView;
      try {
        view = resolveSlide(slide, context);
      } catch (error) {
        showError(slot, slideTitle(slide), error);
        return;
      }
      clearError(slot);
      instance.setState({ view }, { replace: true, transition }).catch((error) => showError(slot, slideTitle(slide), error));
    };
    refresh();
    ["slidechanged", "fragmentshown", "fragmenthidden"].forEach((event) => listen(deck, event, refresh));
    listen(deck, "resize", () => instances.forEach((instance) => instance.resize()));
  }

  return {
    id: "diagram-webkit",
    async init(deck) {
      context = {
        base: deckBase(deck),
        views: (definition.views || {}) as SlideContext["views"],
        maxAnnotations: definition.annotations && definition.annotations.max,
      };
      if (isPrint(deck)) {
        mountPrintInstances(deck, definition, context, instances, { initialView, showMountError }, listen);
        return;
      }
      if (options.instance === "per-slide") await initPerSlide(deck);
      else await initShared(deck);
      const overlay = createDebugOverlay(deck, () => shared || instances.values().next().value || null, context);
      if (overlay) cleanups.push(overlay);
    },
    destroy() {
      cleanups.splice(0).forEach((cleanup) => cleanup());
      errorBoxes.forEach((box) => box.remove());
      errorBoxes.clear();
      instances.forEach((instance) => instance.destroy());
      instances.clear();
      shared = null;
      stage = null;
    },
    instances: () => Array.from(new Set(instances.values())),
    lastError: () => lastError,
  };
}
