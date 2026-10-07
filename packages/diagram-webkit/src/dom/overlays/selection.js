// The tag picker's selection: a magenta glow (CSS drop-shadow) on the
// selected cells themselves. Highlight copies drop the class: they outlive
// the selection. Toggled, never animated: animating a filter on cells drops
// frames.

export const SELECTED_CLASS = "dwk-selected";

export function createSelectionGlow() {
  let current = new Set();

  function render(elements) {
    const next = new Set(elements);
    current.forEach((element) => {
      if (!next.has(element)) element.classList.remove(SELECTED_CLASS);
    });
    next.forEach((element) => element.classList.add(SELECTED_CLASS));
    current = next;
  }

  return { render, count: () => current.size };
}
