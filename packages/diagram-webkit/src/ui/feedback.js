// Loading and error overlays, inside the
// container ("page" covers the page-sized root, "container" is compact).
import { escapeHTML } from "../core/html";

/** @param {import("../dom/context").Context & Record<string, any>} ctx */
export function createFeedback(ctx, mode) {
  function showLoadingState() {
    hideLoadingState();
    const loading = ctx.doc.createElement("div");
    loading.className = `dwk-loading dwk-feedback-${mode}`;
    loading.setAttribute("role", "status");
    loading.innerHTML = `<div class="dwk-loading-message">${escapeHTML(ctx.texts.loading)}</div><div class="dwk-loading-spinner"></div>`;
    ctx.root.appendChild(loading);
  }

  function hideLoadingState() {
    ctx.root.querySelectorAll(":scope > .dwk-loading").forEach((node) => node.remove());
  }

  function showError(message, detail) {
    const overlay = ctx.doc.createElement("div");
    overlay.className = `dwk-error-overlay dwk-feedback-${mode}`;
    overlay.setAttribute("role", "alert");
    const detailHtml = detail ? `<div class="dwk-error-detail">${escapeHTML(detail)}</div>` : "";
    overlay.innerHTML = `<div class="dwk-error-box"><div class="dwk-error-title">⚠️ ${escapeHTML(ctx.texts.errorTitle)}</div><div>${escapeHTML(message)}</div>${detailHtml}<div class="dwk-error-actions"><button type="button" class="dwk-error-close">${escapeHTML(ctx.texts.close)}</button></div></div>`;
    overlay.querySelector(".dwk-error-close").addEventListener("click", () => overlay.remove(), { signal: ctx.signal });
    ctx.root.appendChild(overlay);
  }

  return { showLoadingState, hideLoadingState, showError };
}
