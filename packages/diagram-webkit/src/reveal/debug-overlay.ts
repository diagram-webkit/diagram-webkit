import { stableStringify } from "../core/state";
import type { DiagramInstance } from "../types";
import type { RevealDeck } from "./plugin";
import type { SlideContext } from "./slots";

export const DEBUG_PARAM = "diagram-debug";

// ?diagram-debug: shows the live state and copies the current view as a
// slide, relative to the deck base.
export function createDebugOverlay(deck: RevealDeck, getInstance: () => DiagramInstance | null, context: SlideContext): (() => void) | null {
  const root = deck.getRevealElement();
  if (!root || !new URLSearchParams(root.ownerDocument.defaultView!.location.search).has(DEBUG_PARAM)) return null;
  const doc = root.ownerDocument;
  const box = doc.createElement("div");
  box.className = "dwk-reveal-debug";
  Object.assign(box.style, {
    position: "fixed",
    right: "8px",
    bottom: "8px",
    zIndex: "100",
    maxWidth: "40vw",
    maxHeight: "40vh",
    overflow: "auto",
    padding: "8px",
    background: "rgba(0,0,0,0.8)",
    color: "#fff",
    font: "12px ui-monospace, monospace",
    borderRadius: "6px",
  });
  const state = doc.createElement("pre");
  state.style.margin = "0 0 6px";
  state.style.whiteSpace = "pre-wrap";
  const copy = doc.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy as slide";
  copy.dataset.role = "copy-slide";
  box.append(state, copy);
  // Outside .slides, so Reveal's scaling does not apply to it.
  root.appendChild(box);

  const render = () => {
    const instance = getInstance();
    state.textContent = instance ? stableStringify(instance.getState().view) : "(no diagram on this slide)";
  };
  const onCopy = () => {
    const instance = getInstance();
    if (!instance) return;
    const snippet = instance.serialize("slide", { base: context.base });
    doc.defaultView!.navigator.clipboard.writeText(snippet).then(
      () => (copy.textContent = "Copied"),
      (error) => {
        console.error("diagram-webkit: clipboard write failed:", error);
        copy.textContent = "Copy failed";
      },
    );
  };
  copy.addEventListener("click", onCopy);
  const timer = doc.defaultView!.setInterval(render, 500);
  render();
  return () => {
    doc.defaultView!.clearInterval(timer);
    copy.removeEventListener("click", onCopy);
    box.remove();
  };
}
