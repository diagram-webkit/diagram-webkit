import { parseStateAttribute, parseStateUrlAttribute, resolveSlideView, SLIDE_ATTRS, type NamedView } from "../core/codec/slide";
import { mergeView, normalizeView, type DiagramView } from "../core/state";
import { resolveFeatures, type FeaturesOverride } from "../core/presets";

export interface SlideContext {
  base: DiagramView;
  views: Readonly<Record<string, NamedView>>;
  maxAnnotations?: number;
}

export function slotOf(slide: Element | null | undefined): HTMLElement | null {
  return slide ? slide.querySelector<HTMLElement>(`[${SLIDE_ATTRS.slot}]`) : null;
}

// Fragments that carry state, in the order Reveal shows them.
export function stateFragments(slide: Element): HTMLElement[] {
  const fragments = Array.from(slide.querySelectorAll<HTMLElement>(`.fragment[${SLIDE_ATTRS.state}], .fragment[${SLIDE_ATTRS.stateUrl}]`));
  return fragments
    .map((element, domIndex) => ({ element, domIndex, index: Number(element.dataset.fragmentIndex ?? domIndex) }))
    .sort((a, b) => a.index - b.index || a.domIndex - b.domIndex)
    .map((entry) => entry.element);
}

// base ⊕ views[data-diagram-view] ⊕ data-diagram-state-url ⊕
// data-diagram-state ⊕ every visible fragment's deltas (URL, then JSON), in
// order. Rebuilt from scratch on every call, so going
// backwards needs no undo stack.
export function resolveSlide(slide: Element, context: SlideContext): DiagramView {
  const where = slide.id ? `#${slide.id}` : `slide ${slide.getAttribute("data-index-h") ?? ""}`;
  let view: DiagramView;
  try {
    view = resolveSlideView(context.base, context.views, slide.getAttribute(SLIDE_ATTRS.view), slide.getAttribute(SLIDE_ATTRS.state), {
      stateUrl: slide.getAttribute(SLIDE_ATTRS.stateUrl),
      maxAnnotations: context.maxAnnotations,
    });
    stateFragments(slide)
      .filter((fragment) => fragment.classList.contains("visible"))
      .forEach((fragment) => {
        const url = fragment.getAttribute(SLIDE_ATTRS.stateUrl);
        view = mergeView(view, parseStateUrlAttribute(url, `fragment ${SLIDE_ATTRS.stateUrl}`, context.maxAnnotations));
        view = mergeView(view, parseStateAttribute(fragment.getAttribute(SLIDE_ATTRS.state), `fragment ${SLIDE_ATTRS.state}`));
      });
  } catch (error) {
    throw new Error(`diagram-webkit reveal: ${where}: ${(error as Error).message}`, { cause: error });
  }
  return normalizeView(view);
}

export function slideFeatures(slide: Element): FeaturesOverride | null {
  const raw = slide.getAttribute(SLIDE_ATTRS.features);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${SLIDE_ATTRS.features}: invalid JSON (${(error as Error).message}): ${raw}`);
  }
  resolveFeatures(parsed as FeaturesOverride, undefined, SLIDE_ATTRS.features);
  // Only input can change per slide; the rest is fixed when the instance mounts.
  const other = Object.keys(parsed as object).filter((key) => key !== "input");
  if (other.length > 0) throw new Error(`${SLIDE_ATTRS.features}: only "input" can be set per slide, got ${other.join(", ")}`);
  if (parsed && typeof parsed === "object" && "input" in parsed && "keyboard" in (parsed as FeaturesOverride).input!) {
    throw new Error(`${SLIDE_ATTRS.features}: input.keyboard is fixed at mount; per slide: wheel, drag, pinch`);
  }
  return parsed as FeaturesOverride;
}
