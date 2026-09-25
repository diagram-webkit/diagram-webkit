// The user annotations modal:
// type picker, mode/shape selectors, edit mode, share and clear.
import { ANNOTATION_DESCRIPTION_MAX, ANNOTATION_TITLE_MAX, MODE_TYPE_PREFIX, baseAnnotationType } from "../../core/annotations";
import { createAnnotationDrag } from "./drag.js";
import { createForms } from "./forms.js";
import { createList } from "./list.js";
import { createPlacement } from "./placement.js";

const KINDS = ["point", "area", "arrow"];
const SHARE_RESET_MS = 2000;

export function createAnnotationEditor(ctx) {
  const s = ctx.s;
  const sv = ctx.services;
  const texts = ctx.texts;
  const el = (name) => ctx.el(name);
  const editor = {};
  const drag = createAnnotationDrag(ctx);
  sv.annotationDrag = drag;
  editor.forms = createForms(ctx, editor);
  editor.list = createList(ctx, editor);
  editor.placement = createPlacement(ctx, editor);
  let typeController = null;

  const modal = el("user-annotations-modal");
  const editModal = el("edit-annotation-modal");
  const typeSelector = el("type-selector");
  const kindLabel = { point: texts.kindPoint, area: texts.kindArea, arrow: texts.kindArrow };

  function prefixForMode(mode) {
    return MODE_TYPE_PREFIX[mode] || MODE_TYPE_PREFIX.point;
  }

  function updateEditModeButtonVisibility() {
    el("exit-edit-mode").style.display = s.editModeEnabled ? "inline-block" : "none";
  }

  function setEditMode(enabled) {
    s.editModeEnabled = enabled;
    el("edit-mode-checkbox").checked = enabled;
    drag.updateUserAnnotationDragState();
    updateEditModeButtonVisibility();
  }
  editor.setEditMode = setEditMode;

  // Shape only means something for a box or a marker; an arrow has no shape.
  function updateShapeSelectorVisibility() {
    const shapeGroup = modal.querySelector(".shape-selector-group");
    if (shapeGroup) shapeGroup.hidden = s.currentMode === "arrow";
  }

  function updateUserAnnotationTypeOptions() {
    if (typeController) typeController.abort();
    typeController = new AbortController();
    const signal = AbortSignal.any([ctx.signal, typeController.signal]);
    typeSelector.innerHTML = "";
    updateShapeSelectorVisibility();
    const types = ctx.config.annotations.types;
    const isCircle = el("shape-circle").classList.contains("active");
    const baseTypes = new Set(Object.keys(types).map(baseAnnotationType));

    baseTypes.forEach((baseType) => {
      const style = types[prefixForMode(s.currentMode) + baseType];
      if (!style) return;
      const button = ctx.doc.createElement("button");
      button.type = "button";
      button.className = `type-btn ${baseType === s.selectedType ? "active" : ""}`;
      button.title = style.label;
      button.dataset.type = baseType;
      if (s.currentMode === "arrow") {
        button.classList.add("type-btn-arrow");
        button.appendChild(sv.annotations.createArrowSwatch(style));
      } else if (s.currentMode === "area") {
        Object.assign(button.style, { background: "transparent", borderColor: style.border, borderWidth: style.borderWidth || "3px", borderStyle: style.borderStyle || "solid" });
      } else {
        Object.assign(button.style, { background: style.bg, borderColor: style.border, borderWidth: style.borderWidth || "2px", borderStyle: style.borderStyle || "solid" });
      }
      button.style.borderRadius = isCircle ? "50%" : "6px";
      button.addEventListener(
        "click",
        () => {
          typeSelector.querySelectorAll(".type-btn").forEach((other) => other.classList.remove("active"));
          button.classList.add("active");
          s.selectedType = baseType;
          editor.forms.updateInlineFormValidation();
        },
        { signal },
      );
      typeSelector.appendChild(button);
    });

    if (!s.selectedType) s.selectedType = "info";
    typeSelector.querySelectorAll(".type-btn").forEach((button) => button.classList.remove("active"));
    const current = typeSelector.querySelector(`[data-type="${ctx.win.CSS.escape(s.selectedType)}"]`);
    if (current) current.classList.add("active");
    editor.forms.updateInlineFormValidation();
  }

  // The same colour name exists for a point, an area and an arrow, so a list
  // of bare labels held three identical entries. Group by kind.
  function populateEditTypeOptions() {
    const select = el("edit-type");
    const groups = new Map();
    Object.entries(ctx.config.annotations.types).forEach(([type, style]) => {
      const kind = style.annotationType || "point";
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind).push([type, style]);
    });
    KINDS.forEach((kind) => {
      const entries = groups.get(kind);
      if (!entries || entries.length === 0) return;
      const group = ctx.doc.createElement("optgroup");
      group.label = kindLabel[kind];
      entries.forEach(([type, style]) => {
        const option = ctx.doc.createElement("option");
        option.value = type;
        option.textContent = `${kindLabel[kind]} · ${style.label}`;
        group.appendChild(option);
      });
      select.appendChild(group);
    });
  }

  function isAnyModalOpen() {
    return modal.style.display !== "none" || editModal.style.display !== "none";
  }

  function handleEscape() {
    if (editor.placement.isPlacementModeActive()) editor.placement.cleanupPlacementMode();
    if (modal.style.display !== "none") modal.style.display = "none";
    if (editModal.style.display !== "none") editModal.style.display = "none";
  }

  function openModal() {
    const isVisible = modal.style.display !== "none";
    modal.style.display = isVisible ? "none" : "block";
    if (isVisible) return;
    editor.forms.clearInlineForm();
    s.currentMode = "area";
    modal.querySelectorAll(".mode-selector .mode-btn").forEach((button) => button.classList.toggle("active", button.classList.contains("dwk-mode-area")));
    el("shape-rectangle").classList.add("active");
    el("shape-circle").classList.remove("active");
    updateUserAnnotationTypeOptions();
    editor.list.updateUserAnnotationsList();
    editor.forms.updateInlineFormValidation();
  }

  function initialize() {
    const signal = ctx.signal;
    populateEditTypeOptions();

    KINDS.forEach((mode) => {
      el(`mode-${mode}`).addEventListener(
        "click",
        () => {
          s.currentMode = mode;
          KINDS.forEach((other) => el(`mode-${other}`).classList.toggle("active", other === mode));
          updateUserAnnotationTypeOptions();
          editor.forms.updateInlineFormValidation();
        },
        { signal },
      );
    });
    ["rectangle", "circle"].forEach((shape) => {
      el(`shape-${shape}`).addEventListener(
        "click",
        () => {
          el("shape-rectangle").classList.toggle("active", shape === "rectangle");
          el("shape-circle").classList.toggle("active", shape === "circle");
          updateUserAnnotationTypeOptions();
          editor.forms.updateInlineFormValidation();
        },
        { signal },
      );
    });

    el("toggle-user-annotations").addEventListener("click", openModal, { signal });
    el("close-user-modal").addEventListener(
      "click",
      () => {
        modal.style.display = "none";
        editor.placement.cleanupPlacementMode();
      },
      { signal },
    );
    el("close-edit-modal").addEventListener("click", () => (editModal.style.display = "none"), { signal });
    modal.addEventListener(
      "click",
      (event) => {
        if (event.target !== modal) return;
        modal.style.display = "none";
        editor.placement.cleanupPlacementMode();
      },
      { signal },
    );
    editModal.addEventListener(
      "click",
      (event) => {
        if (event.target === editModal) editModal.style.display = "none";
      },
      { signal },
    );

    el("edit-mode-checkbox").addEventListener("change", () => setEditMode(el("edit-mode-checkbox").checked), { signal });
    el("exit-edit-mode").addEventListener("click", () => setEditMode(false), { signal });

    el("place-annotation-btn").addEventListener(
      "click",
      () => {
        const type = s.selectedType;
        const mode = s.currentMode;
        if (!type || !mode) return;
        editor.placement.startAddAnnotationModeWithData({
          title: el("inline-title").value.trim().substring(0, ANNOTATION_TITLE_MAX),
          type: prefixForMode(mode) + type,
          description: el("inline-description").value.substring(0, ANNOTATION_DESCRIPTION_MAX),
          shape: el("shape-circle").classList.contains("active") ? "circle" : "rectangle",
        });
        modal.style.display = "none";
      },
      { signal },
    );

    const shareButton = el("share-url-btn");
    shareButton.addEventListener(
      "click",
      () => {
        const reset = () => ctx.timers.setTimeout(() => (shareButton.textContent = texts.shareUrl), SHARE_RESET_MS);
        const clipboard = ctx.win.navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== "function") {
          console.error("User annotations: clipboard API unavailable (needs a secure context)");
          shareButton.textContent = texts.shareFailed;
          reset();
          return;
        }
        clipboard.writeText(ctx.win.location.href).then(
          () => {
            shareButton.textContent = texts.shareCopied;
            reset();
          },
          (error) => {
            console.error("Failed to copy URL:", error);
            shareButton.textContent = texts.shareFailed;
            reset();
          },
        );
      },
      { signal },
    );
    el("clear-all-annotations").addEventListener(
      "click",
      () => {
        if (!ctx.win.confirm(texts.confirmClearAll)) return;
        s.userAnnotations = [];
        sv.urlSync.updateURLState();
        sv.annotations.renderAllMarkers();
        editor.list.updateUserAnnotationsList();
      },
      { signal },
    );

    updateUserAnnotationTypeOptions();
    updateEditModeButtonVisibility();
    editor.forms.initialize();
  }

  return { initialize, isAnyModalOpen, handleEscape, updateUserAnnotationsList: () => editor.list.updateUserAnnotationsList() };
}
