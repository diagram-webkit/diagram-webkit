import { SLIDE_ATTRS } from "../core/codec/slide";
import type { DiagramDefinition } from "../core/definition";
import { mountDiagram } from "../dom/instance.js";
import type { DiagramInstance } from "../types";
import type { RevealDeck } from "./plugin";
import type { DiagramView } from "../core/state";
import type { SlideContext } from "./slots";

export const PRINT_READY_ATTR = "data-diagram-print-ready";

// Print view: Reveal lays out one page per slide (and per fragment step, as
// clones), so every slot gets its own static instance once that layout exists.
export interface PrintErrors {
  // Never throws: an unreadable slide starts from the deck base, with its error shown in the slot.
  initialView(slide: Element, container: HTMLElement): DiagramView;
  showMountError(container: HTMLElement, error: unknown): void;
}

export function mountPrintInstances(
  deck: RevealDeck,
  definition: DiagramDefinition,
  context: SlideContext,
  instances: Map<HTMLElement, DiagramInstance>,
  errors: PrintErrors,
  listen: (deck: RevealDeck, event: string, listener: (event: Event) => void) => void,
): void {
  listen(deck, "pdf-ready", () => {
    const root = deck.getRevealElement();
    if (!root) return;
    const slots = Array.from(root.querySelectorAll<HTMLElement>(`[${SLIDE_ATTRS.slot}]`));
    // Settled, not all-or-nothing: one broken slide must not hold up the print.
    Promise.allSettled(
      slots.map(async (slot) => {
        const slide = slot.closest("section") as HTMLElement;
        try {
          const instance = await mountDiagram(slot, definition, {
            features: { preset: "embed", tooltips: false },
            initialState: { view: errors.initialView(slide, slot) },
          });
          instances.set(slot, instance);
        } catch (error) {
          errors.showMountError(slot, error);
        }
      }),
    ).then(() => root.setAttribute(PRINT_READY_ATTR, "true"));
  });
}
