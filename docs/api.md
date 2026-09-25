# API

```js
import { mountApp, mountDiagram, defineDiagram, standaloneDefinition } from "diagram-webkit"; // browser
import { ... } from "diagram-webkit/core";      // pure TS: codecs, state, tags, validate
import { revealPlugin } from "diagram-webkit/reveal";
import { diagramWebkit } from "diagram-webkit/tools/vite"; // Node
```

## Mount

```js
const diagram = await mountDiagram(container, definition, {
  features: "embed",            // overrides definition.features; preset or { preset, ...overrides }
  initialState: { view: { level: 1 }, ui: { panelOpen: false } }, // over definition.baseState (and URL, with urlSync)
  source: { url: "./other.svg" },  // or { svgText } or { svg: SVGSVGElement }; default: definition.source
  debug: false,                 // use source.debug; app default: ?debug in the URL
  fade: 400,                    // ms per phase: leaving cells and highlight fade out, then new cells
                                //   and the new highlight fade in. Default: 120 ms show/hide, no phases
  ownerDocument: iframe.contentDocument,
});

const app = await mountApp(document.body, definition); // same options; full page, app chrome
const standalone = await mountApp(document.body);      // no definition: the reader opens a diagram (standalone.md)
```

The container needs a size. Styles are scoped to `.dwk-root`, use container queries, and are adopted into the document once.

Errors are shown, not just thrown: bad options or state put a red box with the details in the container before `mountDiagram` rejects; a load error shows inside the instance and rejects `ready`.

Mounts that load the same SVG URL at the same time (Reveal print, per-slide mode) share one fetch and parse; each gets its own copy. Nothing is kept after loading.

## Features

Full structure, both presets and every override point: [features.md](features.md).

```js
features: "embed"                                       // preset
features: { preset: "embed", input: { wheel: true } }   // preset + overrides
features: { input: { wheel: false } }                   // overrides on the definition's features
```

## Instance

```js
diagram.root;                        // .dwk-root element
await diagram.ready;                 // resolved when loaded and shown: layout final, loading box gone

diagram.getState();                  // see state.md
await diagram.setState(patch, { transition: 600, replace: false });

await diagram.camera.fit({ transition: 600 });
await diagram.camera.showRect([0.5, 0.5, 0.4, 0.4], { transition: 600 });
await diagram.camera.focus({ tags: ["Data"] }, { padding: 0.2, transition: 600 });
diagram.camera.zoomBy(1.5);          // around the center; or zoomBy(0.5, { x, y }) at client coords
diagram.camera.get();                // current [cx, cy, w, h] or null

diagram.query({ tags: ["Data"] });   // Element[]
diagram.tags();                      // [{ tag, parent, label, group, description, count, hidden }]
diagram.levels();                    // { max }

diagram.setInput({ wheel: true, drag: true, pinch: false }); // pointer input only; other keys throw
diagram.serialize("url" | "json" | "slide", { base, title, viewName });

diagram.suspend();                   // offscreen: input off, camera and hover animations stopped, tooltips hidden
diagram.resume();                    // input back on, re-fit if the container size changed
diagram.resize();                    // re-fit after a container size change; no-op at the same size
diagram.destroy();                   // removes DOM, listeners, adopted styles (ref-counted)
```

## Events

```js
const off = diagram.on("statechange", (state) => {});
diagram.on("ready", () => {});
diagram.on("error", (error) => {});                          // load/runtime errors
diagram.on("camerachange", (rect) => {});                    // [cx, cy, w, h] | null
diagram.on("elementactivate", ({ element, slug, id }) => {}); // click/tap on a cell
off();
```
