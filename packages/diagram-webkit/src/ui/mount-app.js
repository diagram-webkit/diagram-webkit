// Full-page app: the diagram fills the viewport with every app feature.
import { mountDiagram } from "../dom/instance.js";

/**
 * @param {HTMLElement} root usually document.body
 * @param {any} [definition] omitted: the standalone app (the reader opens a diagram)
 * @param {Parameters<typeof mountDiagram>[2]} [opts]
 */
export function mountApp(root, definition, opts = {}) {
  return mountDiagram(root, definition, { ...opts, app: true });
}
