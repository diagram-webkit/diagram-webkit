// Optional custom element: <my-diagram view="…" state='{…}' state-url="…">.
// The diagram lives in an open shadow root, so page CSS cannot reach it. The
// attributes work as on a Reveal slide: definition.baseState ⊕ views[view] ⊕
// state-url ⊕ state, and a change replaces the view.
import { resolveSlideView } from "../core/codec/slide";
import { isDiagramDefinition } from "../core/definition";
import { renderErrorBox } from "./error-box.js";
import { mountDiagram } from "./instance.js";

export const ELEMENT_ATTRS = Object.freeze({ view: "view", state: "state", stateUrl: "state-url" });
export const ELEMENT_ERROR_EVENT = "diagram-error";
// A custom element name: lowercase, starts with a letter, has a hyphen.
const ELEMENT_NAME = /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/;
// Page CSS on the element (height, width, display) wins over :host.
const HOST_CSS = ":host { display: block; position: relative; height: 400px; } .dwk-element-slot { position: relative; width: 100%; height: 100%; }";

/**
 * @param {string} name
 * @param {import("../core/definition").DiagramDefinition} definition
 * @param {{ features?: any, fade?: number, window?: Window & typeof globalThis }} [options]
 * @returns {{ new (): import("../types").DiagramElement }}
 */
export function defineDiagramElement(name, definition, options = {}) {
  if (typeof name !== "string" || !ELEMENT_NAME.test(name)) {
    throw new TypeError(`defineDiagramElement: ${JSON.stringify(name)} is not a valid custom element name (lowercase, with a hyphen)`);
  }
  if (!isDiagramDefinition(definition)) throw new TypeError("defineDiagramElement: definition must be created with defineDiagram()");
  const { features, fade, window: win = /** @type {Window & typeof globalThis} */ (globalThis) } = options;
  const views = definition.views || {};

  class DiagramElement extends win.HTMLElement {
    static observedAttributes = Object.values(ELEMENT_ATTRS);

    /** @type {import("../types").DiagramInstance | null} */
    #instance = null;
    /** @type {HTMLElement | null} */
    #slot = null;
    /** @type {HTMLElement | null} */
    #errorBox = null;
    // Bumped on every connect and disconnect: a mount that finishes after
    // its element was removed is destroyed at once.
    #generation = 0;
    #mounting = false;
    #changedWhileMounting = false;

    get instance() {
      return this.#instance;
    }

    connectedCallback() {
      if (!this.shadowRoot) this.#createShadow();
      this.#generation += 1;
      this.#mount();
    }

    disconnectedCallback() {
      this.#generation += 1;
      this.#mounting = false;
      if (this.#instance) this.#instance.destroy();
      this.#instance = null;
      if (this.#slot) this.#slot.replaceChildren();
      this.#errorBox = null;
    }

    attributeChangedCallback() {
      if (this.#instance) this.#apply();
      else if (this.#mounting) this.#changedWhileMounting = true;
      // Not mounted because the attributes were invalid: try again.
      else if (this.isConnected && this.#slot) this.#mount();
    }

    #mount() {
      const view = this.#resolve();
      if (!view) return;
      // Leftovers of a mount that failed.
      /** @type {HTMLElement} */ (this.#slot).replaceChildren();
      const generation = this.#generation;
      this.#mounting = true;
      this.#changedWhileMounting = false;
      mountDiagram(/** @type {HTMLElement} */ (this.#slot), definition, { features, fade, initialState: { view } }).then(
        (instance) => {
          if (generation !== this.#generation) {
            instance.destroy();
            return;
          }
          this.#mounting = false;
          this.#instance = instance;
          if (this.#changedWhileMounting) this.#apply();
        },
        (error) => {
          if (generation !== this.#generation) return;
          this.#mounting = false;
          this.#report(error);
        },
      );
    }

    #createShadow() {
      const shadow = this.attachShadow({ mode: "open" });
      const style = win.document.createElement("style");
      style.textContent = HOST_CSS;
      this.#slot = win.document.createElement("div");
      this.#slot.className = "dwk-element-slot";
      shadow.append(style, this.#slot);
      return shadow;
    }

    // The view from the attributes, or null (and a visible error) when one
    // of them cannot be read.
    #resolve() {
      try {
        const view = resolveSlideView(definition.baseState || {}, views, this.getAttribute(ELEMENT_ATTRS.view), this.getAttribute(ELEMENT_ATTRS.state), {
          stateUrl: this.getAttribute(ELEMENT_ATTRS.stateUrl),
          names: ELEMENT_ATTRS,
        });
        this.#clearError();
        return view;
      } catch (error) {
        this.#showError(`<${name}>: invalid attributes`, error);
        return null;
      }
    }

    #apply() {
      const view = this.#resolve();
      if (!view || !this.#instance) return;
      this.#instance.setState({ view }, { replace: true }).catch((error) => this.#showError(`<${name}>: the view could not be shown`, error));
    }

    #showError(title, error) {
      this.#clearError();
      if (this.#slot) this.#errorBox = renderErrorBox(this.#slot, title, error);
      this.#report(error);
    }

    #clearError() {
      if (this.#errorBox) this.#errorBox.remove();
      this.#errorBox = null;
    }

    // mountDiagram shows its own errors in the slot; this makes them
    // catchable on the element and visible in the console.
    #report(error) {
      console.error(`diagram-webkit: <${name}>:`, error);
      this.dispatchEvent(new win.CustomEvent(ELEMENT_ERROR_EVENT, { detail: error }));
    }
  }

  win.customElements.define(name, DiagramElement);
  return DiagramElement;
}
