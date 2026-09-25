// The annotation forms: new and edit, type picker and description preview.
import { ANNOTATION_DESCRIPTION_MAX, ANNOTATION_TITLE_MAX } from "../../core/annotations";
import { escapeHTML } from "../../core/html";

export function createForms(ctx, editor) {
  const s = ctx.s;
  const sv = ctx.services;
  const el = (name) => ctx.el(name);
  const emptyPreview = () => `<em>${escapeHTML(ctx.texts.noDescription)}</em>`;

  function updateInlineFormValidation() {
    // Title is optional - an arrow pointing at something often needs no words.
    const hasShapeSelected = el("shape-rectangle").classList.contains("active") || el("shape-circle").classList.contains("active");
    el("place-annotation-btn").disabled = !(Boolean(s.selectedType) && Boolean(s.currentMode) && hasShapeSelected);
  }

  function updateInlineDescriptionPreview() {
    el("inline-description-preview").innerHTML = ctx.processUserDescription(el("inline-description").value) || emptyPreview();
  }

  function updateEditDescriptionPreview() {
    el("edit-description-preview").innerHTML = ctx.processUserDescription(el("edit-description").value) || emptyPreview();
  }

  function initialize() {
    const signal = ctx.signal;
    const titleInput = el("inline-title");
    const descriptionInput = el("inline-description");
    titleInput.addEventListener(
      "input",
      () => {
        el("inline-title-count").textContent = `${titleInput.value.length}`;
        updateInlineFormValidation();
      },
      { signal },
    );
    descriptionInput.addEventListener(
      "input",
      () => {
        el("inline-desc-count").textContent = `${descriptionInput.value.length}`;
        updateInlineDescriptionPreview();
      },
      { signal },
    );
    updateInlineDescriptionPreview();

    const form = el("edit-annotation-form");
    const editTitle = el("edit-title");
    const editDescription = el("edit-description");
    editTitle.addEventListener("input", () => (el("edit-title-count").textContent = `${editTitle.value.length}`), { signal });
    editDescription.addEventListener(
      "input",
      () => {
        el("edit-desc-count").textContent = `${editDescription.value.length}`;
        updateEditDescriptionPreview();
      },
      { signal },
    );
    form.addEventListener(
      "submit",
      (event) => {
        if (event.cancelable) event.preventDefault();
        const type = el("edit-type").value;
        const index = Number.parseInt(form.dataset.editIndex, 10);
        if (!type || Number.isNaN(index)) return;
        s.userAnnotations[index] = {
          ...s.userAnnotations[index],
          title: editTitle.value.trim().substring(0, ANNOTATION_TITLE_MAX),
          description: editDescription.value.substring(0, ANNOTATION_DESCRIPTION_MAX),
          type,
        };
        sv.urlSync.updateURLState();
        sv.annotations.renderAllMarkers();
        editor.list.updateUserAnnotationsList();
        el("edit-annotation-modal").style.display = "none";
      },
      { signal },
    );
    el("cancel-edit").addEventListener("click", () => (el("edit-annotation-modal").style.display = "none"), { signal });
  }

  function clearInlineForm() {
    el("inline-title").value = "";
    el("inline-description").value = "";
    s.selectedType = "info";
    const typeSelector = el("type-selector");
    const infoButton = typeSelector.querySelector('[data-type="info"]');
    if (infoButton) {
      typeSelector.querySelectorAll(".type-btn").forEach((button) => button.classList.remove("active"));
      infoButton.classList.add("active");
    }
    el("inline-title-count").textContent = "0";
    el("inline-desc-count").textContent = "0";
    updateInlineDescriptionPreview();
    updateInlineFormValidation();
  }

  return { initialize, updateInlineFormValidation, updateInlineDescriptionPreview, updateEditDescriptionPreview, clearInlineForm };
}
