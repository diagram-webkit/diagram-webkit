// The one ownerDocument keydown listener. Handlers run in a fixed order:
// panel, help dialog, shortcuts, annotation editor. One Escape closes both
// an open dialog and the panel.

export function createKeys(ctx) {
  const sv = ctx.services;

  function handleKeyDown(event) {
    if (ctx.destroyed || ctx.suspended) return;
    if (event.key === "Escape" && sv.panel) sv.panel.handleEscape();
    if (event.key === "Escape" && sv.helpDialog) sv.helpDialog.handleEscape(event);
    if (sv.shortcuts) sv.shortcuts.handleKeyDown(event);
    if (event.key === "Escape" && sv.annotationEditor) sv.annotationEditor.handleEscape();
  }

  ctx.doc.addEventListener("keydown", handleKeyDown, { signal: ctx.signal });
}
