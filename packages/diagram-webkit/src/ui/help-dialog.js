// One dialog for everything around the diagram: open a diagram (local
// mode), about, share links, the URL parameters and the keyboard
// shortcuts, as tabs. Only tabs that apply are shown. The footer "?" opens
// it on the first tab; the ? key on Shortcuts. Seen-state of the first-visit
// About: `${namespace}-about`.
import { HELP_TABS } from "./markup.js";

const ABOUT_SEEN_KEY = "about";

/** @param {import("../dom/context").Context & Record<string, any>} ctx */
export function createHelpDialog(ctx) {
  const sv = ctx.services;
  const dialog = ctx.el("help-dialog");
  const closeButton = ctx.el("close-help-dialog");
  const tabs = new Map(
    Array.from(/** @type {NodeListOf<HTMLButtonElement>} */ (dialog.querySelectorAll("button.help-tab"))).map((button) => [button.dataset.tab, button]),
  );
  const panels = new Map(Array.from(/** @type {NodeListOf<HTMLElement>} */ (dialog.querySelectorAll("section.help-panel"))).map((panel) => [panel.dataset.tab, panel]));
  const unavailable = new Set();
  let current = null;
  let closable = true;
  let returnFocus = null;

  function available(tab) {
    return tabs.has(tab) && !unavailable.has(tab);
  }

  function availableTabs() {
    return HELP_TABS.filter(available);
  }

  function isOpen() {
    return dialog.style.display !== "none";
  }

  function select(tab, { focus = false } = {}) {
    if (!available(tab)) return;
    current = tab;
    tabs.forEach((button, name) => {
      const on = name === tab;
      button.hidden = !available(name);
      button.setAttribute("aria-selected", on ? "true" : "false");
      button.tabIndex = on ? 0 : -1;
      button.classList.toggle("active", on);
    });
    panels.forEach((panel, name) => (panel.hidden = name !== tab));
    if (focus) tabs.get(tab).focus();
  }

  // tab: which one to show; else the one last shown, else the first.
  function open(tab) {
    const choices = availableTabs();
    if (choices.length === 0) return false;
    const wanted = tab && available(tab) ? tab : current && available(current) ? current : choices[0];
    if (!isOpen()) returnFocus = ctx.doc.activeElement;
    // The links follow the view, so they are fresh on every open.
    if (sv.linkInfo) sv.linkInfo.render();
    dialog.style.display = "flex";
    ctx.root.classList.add("modal-locks-diagram");
    select(wanted);
    if (tab === "about") ctx.storage.set(ABOUT_SEEN_KEY, "seen");
    return true;
  }

  function close() {
    if (!isOpen() || !closable) return;
    dialog.style.display = "none";
    ctx.root.classList.remove("modal-locks-diagram");
    // Keyboard users get focus back where it was. Opened with the mouse, it
    // is not moved back: the button would keep a focus ring after Esc.
    if (returnFocus && typeof returnFocus.focus === "function" && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    else if (dialog.contains(ctx.doc.activeElement)) /** @type {HTMLElement} */ (ctx.doc.activeElement).blur();
    returnFocus = null;
  }

  function toggle(tab) {
    if (isOpen() && (!tab || current === tab)) close();
    else open(tab);
  }

  // While nothing is loaded in local mode the dialog is the page: it cannot
  // be closed, only switched to another tab.
  function setClosable(on) {
    closable = on;
    closeButton.hidden = !on;
  }

  function setAvailable(tab, on) {
    if (on) unavailable.delete(tab);
    else unavailable.add(tab);
    if (!isOpen()) return;
    if (current === tab && !on) {
      const next = availableTabs()[0];
      if (next) select(next);
      else close();
    } else if (current) select(current);
  }

  // A link with parameters was sent to show something specific; opening a
  // welcome over it would be in the way. Only greet a bare visit, and only
  // with something to say.
  function showAboutOnFirstVisit() {
    if (!available("about") || sv.localSource) return;
    if (!ctx.features.urlSync || ctx.win.location.search.length > 0) return;
    if (ctx.storage.get(ABOUT_SEEN_KEY) === "seen") return;
    open("about");
  }

  function handleEscape(event) {
    if (!isOpen()) return;
    event.preventDefault();
    close();
  }

  // Left/right (and Home/End) switch tabs anywhere in the dialog; up/down
  // are left to scroll the content. Called for the document's keydown.
  function handleTabKey(event) {
    const order = availableTabs();
    const index = order.indexOf(current);
    const move = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    let next = null;
    if (move) next = order[(index + move + order.length) % order.length];
    else if (event.key === "Home") next = order[0];
    else if (event.key === "End") next = order[order.length - 1];
    if (!next) return false;
    event.preventDefault();
    const onTab = ctx.doc.activeElement && ctx.doc.activeElement.classList.contains("help-tab");
    select(next, { focus: onTab });
    return true;
  }

  function initialize() {
    const signal = ctx.signal;
    tabs.forEach((button, tab) => button.addEventListener("click", () => select(tab), { signal }));
    closeButton.addEventListener("click", close, { signal });
    dialog.addEventListener(
      "click",
      (event) => {
        if (event.target === dialog) close();
      },
      { signal },
    );
    const footerButton = ctx.maybeEl("help-toggle");
    if (footerButton) {
      footerButton.addEventListener(
        "click",
        (event) => {
          const wasOpen = isOpen();
          toggle();
          // detail is the click count: 0 for Enter or Space.
          if (!wasOpen && event.detail > 0) returnFocus = null;
          if (event.detail > 0) footerButton.blur();
        },
        { signal },
      );
    }
  }

  return {
    initialize,
    isOpen,
    open,
    close,
    toggle,
    select,
    setClosable,
    setAvailable,
    available,
    panel: (tab) => panels.get(tab) || null,
    currentTab: () => current,
    showAboutOnFirstVisit,
    handleEscape,
    handleTabKey,
  };
}
