// A visible error with its details, for failures outside a running instance:
// bad mount options, a broken slide, a diagram that did not load. Plain DOM
// and inline styles, so it works without the adopted package CSS.

export const ERROR_BOX_CLASS = "dwk-error-box-standalone";

/** @param {unknown} error */
export function describeError(error) {
  const lines = [];
  let current = error;
  while (current) {
    lines.push(current instanceof Error ? `${current.name}: ${current.message}` : String(current));
    current = current instanceof Error ? current.cause : null;
  }
  return lines.join("\ncaused by ");
}

/**
 * @param {HTMLElement} container
 * @param {string} title
 * @param {unknown} error
 */
export function renderErrorBox(container, title, error) {
  const doc = container.ownerDocument;
  const box = doc.createElement("div");
  box.className = ERROR_BOX_CLASS;
  box.setAttribute("role", "alert");
  Object.assign(box.style, {
    position: "absolute",
    top: "12px",
    left: "12px",
    right: "12px",
    zIndex: "20",
    maxHeight: "calc(100% - 24px)",
    overflow: "auto",
    boxSizing: "border-box",
    padding: "12px 14px",
    border: "2px solid #ef4444",
    borderRadius: "6px",
    background: "rgba(24, 6, 6, 0.94)",
    color: "#fee2e2",
    font: "14px/1.4 ui-sans-serif, system-ui, sans-serif",
    textAlign: "left",
    pointerEvents: "auto",
  });
  const heading = doc.createElement("strong");
  heading.textContent = title;
  const details = doc.createElement("pre");
  details.textContent = describeError(error);
  Object.assign(details.style, { margin: "6px 0 0", whiteSpace: "pre-wrap", font: "12px/1.45 ui-monospace, monospace" });
  box.append(heading, details);
  container.appendChild(box);
  return box;
}
