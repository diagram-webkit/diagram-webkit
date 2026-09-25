// The list of user annotations in the annotations modal.
import { escapeHTML } from "../../core/html";

export function createList(ctx, editor) {
  const s = ctx.s;
  const sv = ctx.services;
  const texts = ctx.texts;
  const el = (name) => ctx.el(name);
  let renderController = null;

  function showEditAnnotationForm(index) {
    const ann = s.userAnnotations[index];
    if (!ann) return;
    el("edit-title").value = ann.title;
    el("edit-description").value = ann.description || "";
    el("edit-type").value = ann.type;
    el("edit-title-count").textContent = `${ann.title.length}`;
    el("edit-desc-count").textContent = `${(ann.description || "").length}`;
    el("edit-annotation-form").dataset.editIndex = `${index}`;
    el("edit-annotation-modal").style.display = "block";
    el("edit-title").focus();
    editor.forms.updateEditDescriptionPreview();
  }

  function deleteUserAnnotation(index) {
    if (!ctx.win.confirm(texts.confirmDelete)) return;
    s.userAnnotations.splice(index, 1);
    sv.urlSync.updateURLState();
    sv.annotations.renderAllMarkers();
    updateUserAnnotationsList();
  }

  function updateUserAnnotationsList() {
    if (renderController) renderController.abort();
    renderController = new AbortController();
    const signal = AbortSignal.any([ctx.signal, renderController.signal]);
    const container = el("user-annotation-items");
    el("annotation-count").textContent = `${s.userAnnotations.length}`;
    container.innerHTML = "";
    if (s.userAnnotations.length === 0) {
      container.innerHTML = `<p><em>${escapeHTML(texts.noUserAnnotations)}</em></p>`;
      return;
    }

    s.userAnnotations.forEach((ann, index) => {
      const item = ctx.doc.createElement("div");
      item.className = "user-annotation-item";
      const style = ctx.annotationStyle(ann.type) || {};
      const isArrow = style.annotationType === "arrow";
      // An arrow has no fill and no shape, so a colour swatch says nothing
      // about it. Draw the arrow itself, exactly as the type picker does.
      const indicatorHtml = isArrow
        ? '<div class="type-indicator type-indicator-arrow"></div>'
        : `<div class="type-indicator" style="background: ${escapeHTML(style.bg || "")}; border-color: ${escapeHTML(style.border || "")}; border-radius: ${ann.shape === "circle" ? "50%" : "4px"};"></div>`;
      const title = `${ann.title || ""}`.trim();
      const titleHtml = title ? escapeHTML(title) : `<em class="annotation-title-empty">${escapeHTML(texts.untitled)}</em>`;
      item.innerHTML = `
            <div class="annotation-item-row">
                ${indicatorHtml}
                <div class="annotation-info"><span class="annotation-title">${titleHtml}</span></div>
                <div class="annotation-actions">
                    <button class="action-btn edit-btn desktop-only" data-action="edit" title="${escapeHTML(texts.editAction)}">✏️</button>
                    <button class="action-btn delete-btn" data-action="delete" title="${escapeHTML(texts.deleteAction)}">🗑️</button>
                </div>
            </div>`;
      item.querySelector('[data-action="edit"]').addEventListener("click", () => showEditAnnotationForm(index), { signal });
      if (isArrow) item.querySelector(".type-indicator-arrow").appendChild(sv.annotations.createArrowSwatch(style));
      item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteUserAnnotation(index), { signal });
      container.appendChild(item);
    });
  }

  return { showEditAnnotationForm, updateUserAnnotationsList, deleteUserAnnotation };
}
