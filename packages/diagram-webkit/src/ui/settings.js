// The Settings tab of the help dialog: tag picker mode, and a reload into
// or out of debug (?debug is read once, at load).
import { PARAMS } from "../core/codec/params";

/** @param {import("../dom/context").Context & Record<string, any>} ctx */
export function createSettings(ctx) {
  const sv = ctx.services;
  const signal = ctx.signal;
  const panel = sv.helpDialog.panel("settings");
  const tagPicker = /** @type {HTMLInputElement} */ (panel.querySelector('[data-setting="tag-picker"]'));
  tagPicker.checked = sv.tagPicker.isOn();
  if (!sv.tagPicker.available()) {
    tagPicker.disabled = true;
    const note = ctx.doc.createElement("span");
    note.className = "dwk-setting-unavailable";
    note.textContent = ctx.texts.tagPickerUnavailable;
    tagPicker.closest(".dwk-setting").querySelector(".dwk-setting-text").append(note);
  }
  tagPicker.addEventListener("change", () => sv.tagPicker.setMode(tagPicker.checked), { signal });
  sv.tagPicker.onModeChange((on) => {
    tagPicker.checked = on;
  });

  const debug = panel.querySelector('[data-role="debug-toggle"]');
  if (debug) {
    debug.addEventListener(
      "click",
      () => {
        const url = new URL(ctx.win.location.href);
        if (ctx.s.debug) url.searchParams.delete(PARAMS.debug);
        else url.searchParams.set(PARAMS.debug, "");
        ctx.win.location.assign(sv.urlSync.toAbsoluteReadableUrl(url));
      },
      { signal },
    );
  }
}
