// Development mode only (definition.development applies): a small notice
// that something was logged to the developer console. Every console.warn and
// console.error while an instance is mounted counts, and so do uncaught
// errors: the engine reports a band or arrow it leaves out there, and a
// definition's own mistakes land there too. Always the same text; dismissed,
// it stays away until something new is logged. A reload starts clean.
const NOTICE_CLASS = "dwk-dev-notice";
const SVG_NS = "http://www.w3.org/2000/svg";
// A warning triangle with "!", 16 x 16.
const ICON = [
  ["path", { d: "M8 1.5 15 14H1z", class: "dwk-dev-notice-sign" }],
  ["path", { d: "M8 6v4", class: "dwk-dev-notice-mark" }],
  ["circle", { cx: "8", cy: "12", r: "0.9", class: "dwk-dev-notice-dot" }],
];
const LEVELS = ["warn", "error"];

// One console hook per window, shared by its instances; the console is put
// back when the last one goes (unless something wrapped it after us).
/** @type {WeakMap<Window, { listeners: Set<() => void>, restore: () => void }>} */
const hooks = new WeakMap();

function listen(win, listener) {
  let hook = hooks.get(win);
  if (!hook) {
    const listeners = new Set();
    const notify = () => listeners.forEach((each) => each());
    const originals = Object.fromEntries(LEVELS.map((level) => [level, win.console[level]]));
    const wrappers = Object.fromEntries(
      LEVELS.map((level) => [
        level,
        function logged(...args) {
          notify();
          return originals[level].apply(win.console, args);
        },
      ]),
    );
    LEVELS.forEach((level) => (win.console[level] = wrappers[level]));
    win.addEventListener("error", notify);
    win.addEventListener("unhandledrejection", notify);
    const restore = () => {
      LEVELS.forEach((level) => {
        if (win.console[level] === wrappers[level]) win.console[level] = originals[level];
      });
      win.removeEventListener("error", notify);
      win.removeEventListener("unhandledrejection", notify);
    };
    hook = { listeners, restore };
    hooks.set(win, hook);
  }
  hook.listeners.add(listener);
  return () => {
    hook.listeners.delete(listener);
    if (hook.listeners.size > 0) return;
    hook.restore();
    hooks.delete(win);
  };
}

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createDevNotice(ctx) {
  let notice = null;

  function show() {
    if (ctx.destroyed) return;
    if (!notice) {
      notice = ctx.doc.createElement("div");
      notice.className = NOTICE_CLASS;
      notice.setAttribute("role", "status");
      const icon = ctx.doc.createElementNS(SVG_NS, "svg");
      icon.setAttribute("viewBox", "0 0 16 16");
      icon.setAttribute("aria-hidden", "true");
      ICON.forEach(([name, attrs]) => {
        const part = ctx.doc.createElementNS(SVG_NS, name);
        Object.entries(attrs).forEach(([key, value]) => part.setAttribute(key, value));
        icon.appendChild(part);
      });
      const text = ctx.doc.createElement("span");
      text.textContent = ctx.texts.devWarnings;
      const dismiss = ctx.doc.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "×";
      dismiss.title = ctx.texts.devWarningsDismiss;
      dismiss.setAttribute("aria-label", ctx.texts.devWarningsDismiss);
      dismiss.addEventListener("click", () => (notice.hidden = true), { signal: ctx.signal });
      notice.append(icon, text, dismiss);
      ctx.root.appendChild(notice);
    }
    notice.hidden = false;
  }

  // A warning may be logged from inside a render: show it after.
  const stop = listen(ctx.win, () => queueMicrotask(show));
  ctx.signal.addEventListener("abort", stop, { once: true });
  return { show };
}
