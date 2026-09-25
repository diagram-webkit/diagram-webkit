// view.focus: topics the reader zooms to and highlights (menu > Focus).
// The highlight overlay draws them together with view.highlight.

const FOCUS_TRANSITION_MS = 600;

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createFocus(ctx) {
  const s = ctx.s;
  const sv = ctx.services;

  const tags = () => (s.focus ? s.focus.tags : []);
  const mode = () => (s.focus && s.focus.mode) || "outline";
  const has = (tag) => tags().includes(tag);

  // A focused tag must be in the diagram and shown; hiding it (or a parent)
  // drops the focus.
  function isFocusable(tag) {
    return s.diagramTagElements.has(tag) && s.tagVisibility.get(tag) !== false && !ctx.model.getHiddenAncestor(tag, s.tagVisibility);
  }

  function store(next, nextMode) {
    s.focus = next.length > 0 ? { tags: next, ...(nextMode && nextMode !== "outline" ? { mode: nextMode } : {}) } : null;
  }

  // Returns true when something was dropped. The caller re-applies the
  // highlight and writes the URL.
  function prune() {
    const kept = tags().filter(isFocusable);
    if (kept.length === tags().length) return false;
    store(kept, mode());
    return true;
  }

  function changed({ moveCamera }) {
    sv.highlight.apply();
    if (sv.tagTree) sv.tagTree.refresh();
    sv.urlSync.updateURLState();
    // v= is what is on screen, so write it again once the camera has arrived.
    if (moveCamera && tags().length > 0) {
      sv.cameraControl.apply({ focus: { tags: tags() } }, { transition: FOCUS_TRANSITION_MS }).then(() => sv.urlSync.updateURLState());
    }
  }

  function toggle(tag) {
    if (!has(tag) && !isFocusable(tag)) return;
    store(has(tag) ? tags().filter((item) => item !== tag) : [...tags(), tag], mode());
    changed({ moveCamera: true });
  }

  function setMode(next) {
    if (!s.focus) return;
    store(tags(), next);
    changed({ moveCamera: false });
  }

  function clear() {
    store([], mode());
    changed({ moveCamera: false });
  }

  return { tags, mode, has, isFocusable, prune, toggle, setMode, clear };
}
