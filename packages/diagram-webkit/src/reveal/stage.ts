import type { RevealDeck } from "./plugin";

// The shared diagram lives on a stage above the slides, laid over the
// current slot, so Reveal's slide transitions never hide or re-fade it:
// between two diagram slides it stays on screen and only its state moves.
// It fades in and out with the slide transition when a slide without a
// slot comes or goes.

export const STAGE_CLASS = "dwk-reveal-stage";

const SPEED_MS: Readonly<Record<string, number>> = Object.freeze({ default: 800, fast: 400, slow: 1200 });

// Reveal's own duration for a slide going in or out: data-transition /
// data-transition-speed on the slide, else the deck config. "fade-in
// slide-out" style values are split per direction.
export function transitionMs(deck: RevealDeck, slide: Element | null | undefined, direction: "in" | "out"): number {
  const config = deck.getConfig ? deck.getConfig() : {};
  const raw = (slide && slide.getAttribute("data-transition")) || config.transition || "slide";
  const tokens = raw.trim().split(/\s+/);
  const suffix = `-${direction}`;
  const directed = tokens.find((token) => token.endsWith(suffix));
  const style = directed ? directed.slice(0, -suffix.length) : tokens[0];
  if (style === "none") return 0;
  const speed = (slide && slide.getAttribute("data-transition-speed")) || config.transitionSpeed || "default";
  return SPEED_MS[speed] ?? SPEED_MS.default;
}

// Layout position of `element` inside `container`, unaffected by the
// transforms Reveal uses for scaling and slide transitions.
function offsetWithin(element: HTMLElement, container: HTMLElement): { left: number; top: number } {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = element;
  while (current && current !== container) {
    left += current.offsetLeft;
    top += current.offsetTop;
    const parent = current.offsetParent as HTMLElement | null;
    if (parent !== container && parent && !container.contains(parent)) {
      throw new Error("diagram-webkit reveal: slot is not laid out inside the slides element");
    }
    current = parent;
  }
  if (!current) throw new Error("diagram-webkit reveal: slot has no layout (hidden slide?)");
  return { left, top };
}

export interface Stage {
  readonly element: HTMLElement;
  visible(): boolean;
  place(slot: HTMLElement): void;
  show(ms: number): void;
  hide(ms: number, onHidden: () => void): void;
  destroy(): void;
}

export function createStage(slides: HTMLElement): Stage {
  const doc = slides.ownerDocument;
  const element = doc.createElement("div");
  element.className = STAGE_CLASS;
  // Reveal ignores swipes that start inside this attribute.
  element.setAttribute("data-prevent-swipe", "");
  Object.assign(element.style, {
    position: "absolute",
    zIndex: "12",
    opacity: "0",
    pointerEvents: "none",
    visibility: "hidden",
  });
  slides.appendChild(element);

  let shown = false;
  let hideTimer = 0;
  let observed: HTMLElement | null = null;
  const win = doc.defaultView!;

  function fit(slot: HTMLElement): void {
    const { left, top } = offsetWithin(slot, slides);
    Object.assign(element.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${slot.offsetWidth}px`,
      height: `${slot.offsetHeight}px`,
    });
  }

  // The slot can change size without a Reveal resize (fonts, fragments). It
  // also fires when the slot's slide is hidden; the stage stays put then.
  const observer = new win.ResizeObserver(() => {
    if (observed && observed.offsetParent) fit(observed);
  });

  function fade(ms: number, opacity: "0" | "1"): void {
    element.style.transition = ms > 0 ? `opacity ${ms}ms ease` : "none";
    element.style.opacity = opacity;
  }

  return {
    element,
    visible: () => shown,
    place(slot) {
      if (observed !== slot) {
        if (observed) observer.unobserve(observed);
        observer.observe(slot);
        observed = slot;
      }
      fit(slot);
    },
    show(ms) {
      win.clearTimeout(hideTimer);
      hideTimer = 0;
      shown = true;
      element.style.visibility = "visible";
      element.style.pointerEvents = "auto";
      if (ms > 0 && element.style.opacity !== "1") {
        // Start from the current opacity, which may be mid fade-out.
        element.style.transition = "none";
        element.style.opacity = win.getComputedStyle(element).opacity;
        void element.offsetWidth;
      }
      fade(ms, "1");
    },
    hide(ms, onHidden) {
      if (!shown) return;
      shown = false;
      element.style.pointerEvents = "none";
      fade(ms, "0");
      win.clearTimeout(hideTimer);
      hideTimer = win.setTimeout(() => {
        hideTimer = 0;
        element.style.visibility = "hidden";
        onHidden();
      }, ms);
    },
    destroy() {
      win.clearTimeout(hideTimer);
      observer.disconnect();
      element.remove();
    },
  };
}
