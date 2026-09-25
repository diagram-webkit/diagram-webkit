// Keyboard shortcuts: pan, zoom, fit, search and the help dialog.

// A press moves the view by a fraction of what is on screen, so the step
// stays meaningful at every zoom level.
export const PAN_STEP = 0.15;
export const PAN_STEP_LARGE = 0.5;
const PAN_KEYS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function isTypingTarget(target) {
  if (!target || target.nodeType !== 1) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function createShortcuts(ctx) {
  const sv = ctx.services;
  const features = ctx.features;

  const dialog = () => sv.helpDialog;

  function isAnyModalOpen() {
    return Boolean(sv.annotationEditor && sv.annotationEditor.isAnyModalOpen());
  }

  // Escape is the help dialog's own (keys.js).
  function handleKeyDown(event) {
    if (event.key === "Escape") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (isAnyModalOpen()) return;

    if (event.key === "?" && features.shortcuts && dialog() && dialog().available("shortcuts")) {
      event.preventDefault();
      dialog().toggle("shortcuts");
      return;
    }
    // Pan and zoom stay put behind the dialog; the arrows switch its tabs.
    if (dialog() && dialog().isOpen()) {
      dialog().handleTabKey(event);
      return;
    }

    const panDirection = PAN_KEYS[event.key];
    if (panDirection && features.input.keyboard) {
      event.preventDefault();
      const step = event.shiftKey ? PAN_STEP_LARGE : PAN_STEP;
      sv.input.panByViewportFraction(panDirection[0] * step, panDirection[1] * step);
      return;
    }

    switch (event.key) {
      case "/":
        if (!features.shortcuts || !sv.panel) return;
        event.preventDefault();
        sv.panel.focusSearch();
        return;
      case "+":
      case "=":
        if (!features.input.keyboard) return;
        event.preventDefault();
        sv.input.zoomByKeyboardStep(true);
        return;
      case "-":
      case "_":
        if (!features.input.keyboard) return;
        event.preventDefault();
        sv.input.zoomByKeyboardStep(false);
        return;
      case "0":
        if (!features.input.keyboard) return;
        event.preventDefault();
        sv.camera.setFitAllMode(true);
        return;
      default:
    }
  }

  return { handleKeyDown };
}
