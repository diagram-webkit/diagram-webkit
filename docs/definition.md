# Definition

`defineDiagram(input)` validates (unknown keys throw), resolves features, freezes, and adds `.extend()`.

```js
import { defineDiagram } from "diagram-webkit";

export default defineDiagram({
  id: "my-diagram",                     // required
  requires: "^0.1.0",                   // semver range for the engine

  source: {
    production: new URL("./d.svg", import.meta.url).href,
    debug: "http://localhost:8000/d.svg", // used with ?debug (app) or { debug: true }
    svgText: "<svg>...</svg>",           // inline alternative to a URL
  },

  metadata: {                           // SVG attribute names (defaults shown)
    idAttr: "data-cell-id",
    tagsAttr: "data-tags",
    helpAttr: "data-help",
    slugAttr: "data-slug",
    overlayAttr: "data-overlay",                      // line overlays: names on a line
    overlayDefinitionAttr: "data-overlay-definition", // line overlays: the line that defines one
    overlayTagsAttr: "data-overlay-tags",             // line overlays: on the definition line, tags its bands carry
    arrowAtEachBoxAttr: "data-arrow-at-each-box",     // box arrows: on a line, and per box
    overlayDestinationAttr: "data-overlay-destination", // line overlays: a box bands end at, never pass
  },

  tags: {
    separator: ".",                     // Parent.Child hierarchy
    deriveAncestors: false,             // true: a cell tagged "A.B.C" also counts as tagged A and A.B
    defaultGroup: "general",            // group for tags without meta.group
    roles: {                            // regexes, one capture group, case-insensitive
      level: "^level-(\\d+)$",
      cssClass: "^css-([a-z0-9-]+)$",   // -> class custom-<name>
      priority: "^pri-(\\d+)$",
      internal: "^(_)(?:\\.|$)",      // topics shown only in tag picker mode, untouched by onlyTags
      severityFallback: ["info"],
    },
    groups: [
      { id: "priority", label: "Priority", order: 1 },
      { id: "general", label: "Tags", order: 10,
        layout: "tree",                 // "tree" | "flat"
        disableHelpIfHidden: true },    // hidden tag also disables the cell's tooltip
    ],
    meta: {
      "pri-1": {
        label: "Priority 1", group: "priority", order: 1,
        description: "Fix first",
        style: { background: "#FF7A7A", color: "#5B1010", borderColor: "#7A1414",
                 borderWidth: "3px", borderStyle: "solid", fontWeight: "700" }, // tooltip badge
        panelStyle: { borderColor: "#7A1414", borderWidth: "3px", boxShadow: "..." }, // tag tree row
      },
    },
    descriptions: { Network: "traffic" }, // tag -> text; see tools.md for generating from markdown
  },

  annotations: {
    max: 10,                            // user annotations kept (URL/state). Default 10
    markerScale: 0.01,                  // point marker size relative to the diagram width. Default 0.01
    htmlWhitelist: { br: [], b: [], a: ["href"] }, // tag -> allowed attributes. Always enforced: URLs only
                                        // http(s)/mailto/tel/relative, links get rel=noopener; on*, style,
                                        // srcdoc and script/iframe/svg/... are never emitted (defineDiagram throws)
    area: { minHoverDistance: 5, borderWidth: 3, hoverBorderWidth: 4, resizeHandleSize: 8 }, // defaults
    types: {                            // default: user-/area-/arrow- × info, important, success
      "user-info": { annotationType: "point", label: "Blue", bg: "#2196f3", color: "#fff",
                     border: "#1976d2", borderWidth: "3px", scale: 2 },
      "area-info": { annotationType: "area", label: "Blue", border: "#2196f3",
                     defaultSize: { width: 150, height: 100 }, minSize: { width: 50, height: 50 },
                     maxSize: { width: 1200, height: 800 } },
      "arrow-info": { annotationType: "arrow", label: "Blue", border: "#2196f3", strokeWidth: 3 },
    },                                  // the "info" set must exist: the editor starts on it
  },

  camera: {
    defaultAlign: ["left", "bottom"],   // initial alignment: [left|center|right, top|center|bottom]. Default shown
    maxZoom: 4,                         // default
  },

  ui: { tooltipMinWidth: 380, tooltipHideDelay: 100 }, // px, ms. Defaults

  content: {
    page: {                             // used by the Vite plugin / renderPage
      title: "My diagram",
      description: "...", author: "...", favicon: "./favicon.svg", lang: "en",
      noscript: "<p>Needs JavaScript.</p>",
    },
    about: "<p>...</p>",                // About tab HTML, under a header (name, page.description)
    license: "MIT",                     // About facts, with footer.version, page.author and diagram-webkit's version
    repository: "https://github.com/org/repo", // About facts: source link and <repository>/issues
    footer: {
      links: [{ label: "Issues", href: "https://...", title: "Report", paren: true }], // paren: "(Issues)"
      version: "v2026.09.4",
    },
    texts: { diagramLabel: "My diagram" }, // override UI strings; unknown keys throw
    css: ".custom-edge { stroke-dasharray: 4 2; }",         // adopted with the engine CSS
    downloads: {                        // About tab: a download table, one row per key (texts: download*)
      drawio: { url: new URL("./d.drawio.svg", import.meta.url).href, name: "d.drawio.svg" }, // the draw.io source
      full: { url: new URL("./d.svg", import.meta.url).href, name: "d.svg" },  // rendered (tools.md#render)
      view: { name: "d-view.svg" },     // "This view": built in the browser from what is on screen
    },                                  // name: file name to save as (Vite hashes asset names); url required
  },

  storage: { namespace: "my-diagram" }, // localStorage key prefix; default: id

  features: "app",                      // or "embed", or { preset: "embed", tooltips: false }; see features.md

  baseState: { level: 2 },              // starting view; see state.md

  views: {                              // named views for reveal and setState
    overview: { title: "Overview", state: { camera: { fit: true } } },
  },

  hooks: {
    parseHelp: (raw) => ({ title, bodyHtml, searchText }), // replace data-help parsing
    renderAbout: (html) => html,
    renderFooter: ({ links, version }) => "<footer>...</footer>",
    tagLabel: (tag, meta) => meta.label,
  },

  development: {                        // merged over the rest in development mode (below)
    source: { production: new URL("./my-diagram.drawio.svg", import.meta.url).href },
    features: { lineOverlays: true },
  },
});
```

UI text keys: `DEFAULT_TEXTS` in `packages/diagram-webkit/src/core/texts.ts`.

```js
import { DEFAULT_TEXTS } from "diagram-webkit";
Object.keys(DEFAULT_TEXTS); // loading, loadError, searchPlaceholder, levelTitle, aboutTitle, ...
```

## development

Fields merged over the definition, like `extend`, when the page runs in development mode:

- served by the Vite plugin's dev server (`vite` / `npm run dev`): the plugin writes `<meta name="diagram-webkit-mode" content="development">`, which `mountDiagram` reads;
- or `mountDiagram(el, definition, { mode: "development" })` (`"production"` forces the other way).

A build (`vite build`) and every other page is production. In development mode, anything logged with `console.warn`/`console.error` while the diagram is mounted (the engine reports a band or arrow it leaves out there), and any uncaught error, shows a small notice in the top left corner: "Warnings in the developer console". It can be dismissed, comes back on the next new message, and is gone after a reload that logs nothing (texts `devWarnings`, `devWarningsDismiss`). Any definition field except `id` and `development` itself; no `null` removals. `extend` keeps and merges `development` like any other object. `definitionForMode(definition, mode)` returns the definition as it applies in a mode.

Typical use, a diagram that publishes a rendered SVG ([tools.md](tools.md#render)) and edits a draw.io source:

```js
const rendered = new URL("./my-diagram.svg", import.meta.url).href;        // bands drawn in, no draw.io model
const source = new URL("./my-diagram.drawio.svg", import.meta.url).href;   // what draw.io opens

defineDiagram({
  source: { production: rendered, debug: rendered },
  features: { preset: "app", lineOverlays: false },          // the rendered SVG has the bands
  development: {
    source: { production: source, debug: source },           // edits show on reload, no render step
    features: { lineOverlays: true },
  },
});
```

## extend

```js
const deck = base.extend({
  features: "embed",                // features: resolved against the base's features
  baseState: { camera: { fit: true } }, // merged into base.baseState
  views: { extra: { state: {} }, old: null }, // per-key merge; null removes
  tags: { descriptions: { New: "x" } },       // objects: deep merge
  annotations: { types: {...} },              // arrays/functions: replace
  hooks: { renderAbout: null },               // null removes
});
```
