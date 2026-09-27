// The tag picker's selection: a magenta glow (CSS drop-shadow) on the
// selected cells themselves, so they keep their place in the stacking; a
// copy above the diagram, as for the focus, would bring them to the front.
// Toggled, never animated: animating a filter on cells drops frames.

const SELECTED_CLASS = "dwk-selected";

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
