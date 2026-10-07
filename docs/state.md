# State

```ts
interface DiagramState {
  version: 1;
  view: DiagramView; // what the diagram shows; used by baseState, views, slides, setState
  ui: { panelOpen?: boolean; tagTreeExpanded?: boolean; tagTreeAllExpanded?: boolean }; // all = every branch open (with tagTreeExpanded)
}
```

## View keys

```js
{
  // One of three camera forms:
  camera: { fit: true },                                   // whole diagram
  camera: { rect: [0.5, 0.4, 0.3, 0.25] },                 // [cx, cy, w, h], 0..1 of the viewBox
  camera: { focus: { slugs: ["Cache"], tags: ["Data"], ids: ["cell-7"] }, padding: 0.2 }, // fit these; padding 0..1

  level: 1,                           // detail level: cells tagged level-N with N > level are hidden

  hiddenTags: ["Observability"],      // hide these (and descendants)
  onlyTags: ["Network"],              // show only these (plus ancestors/descendants); wins over hiddenTags
  examplesOnly: ["info", "pri-3"],    // markers of these priorities only where they have help examples

  query: "tls",                       // search text (title, body, links)

  pins: ["LoadBalancer"],             // pinned slugs

  highlight: {                        // any of slugs/tags/ids
    slugs: ["WebApp"], tags: ["Data"], ids: ["cell-3"],
    mode: "outline",                  // "outline" | "pulse" | "dim-others"
  },

  focus: {                            // topics in focus (menu > Focus)
    tags: ["Api.Rbac"],               // highlighted with mode, drawn together with highlight
    mode: "dim-others",               // "outline" (default) | "dim-others"
  },                                  // hiding a focused tag (or a parent) drops it

  tooltip: {                          // an open help popup, held until changed or clicked away; fades in/out (200 ms)
    slug: "ImageBuilder",
    tab: "some_container_name",       // an example (help.<formatter>.<name>, any case); left out = the help
    // Each of these defaults to definition.ui.tooltipDefaults:
    mode: "simple",                   // "full" | "simple": title (with the example's name) and content only
    marker: false,                    // the cell's own marker while open: true shown, false hidden, left out = the filter
    width: 0.5,                       // share of the diagram's width inside equal margins (1 = edge to edge minus 10px each side)
    scale: 2.2,                       // text size, 1 = a hover popup
    position: "center",               // "anchor" (next to its cell) | "center" | "top" | "bottom" (centred across)
    connector: true,                  // placed away from its cell: a thin line to it (default true)
  },                                  // also over a cell the filter hides; closing it by hand removes it

  annotations: [                      // user annotations; x/y 0..1
    { x: 0.4, y: 0.3, type: "user-info", title: "Here", description: "..." },
    { x: 0.2, y: 0.2, type: "area-important", title: "Zone", description: "",
      shape: "rectangle", widthRel: 0.1, heightRel: 0.08 },   // shape: rectangle | circle
    { x: 0.1, y: 0.1, x2: 0.3, y2: 0.2, type: "arrow-success", title: "", description: "" },
  ],

  theme: "dark",                      // "light" | "dark"
}
```

Highlight CSS hooks (`content.css` or page CSS):

```css
/* The outline is drawn on copies, each right after its cell, so it fades cheaply and keeps the diagram's stacking. */
.dwk-root .dwk-main-image .dwk-highlighted { filter: drop-shadow(0 0 4px orange); }
/* The real cells; dim-others leaves these alone. */
.dwk-root .dwk-main-image .dwk-highlight-target { }
```

Unknown keys and wrong shapes throw `DiagramStateError` with the path (`definition.views.x.state.camera.rect: ...`).

## Merging

A patch replaces whole keys; `null` removes a key (only valid in deltas: slide state, fragments, `extend`).

```js
base   = { camera: { fit: true }, level: 1, highlight: { slugs: ["A"] } }
patch  = { level: 2, highlight: null, pins: ["B"] }
result = { camera: { fit: true }, level: 2, pins: ["B"] }   // highlight removed, not merged
```

## setState

```js
await diagram.setState({ view: { level: 0 } });                         // merge into current view
await diagram.setState({ view: { level: 0 } }, { replace: true });      // the patch is the whole view; nothing else kept
await diagram.setState({ view: { camera: { fit: true } } }, { transition: 800 }); // animate camera, ms
await diagram.setState({ view: definition.views.overview.state }, { replace: true, transition: 600 });
await diagram.setState({ ui: { panelOpen: true } });

diagram.getState();              // { version: 1, view, ui }; camera is the user's view once they move it
diagram.serialize("url");        // "?v=...&only-tags=..."
diagram.serialize("json");       // JSON of the state
diagram.serialize("slide", { base: deckBase, title: "Data", viewName: "data" }); // <section ...> snippet
```

## Pure helpers (`diagram-webkit/core`, no DOM)

```js
import { mergeView, diffView, canonicalView, viewsEqual, normalizeView,
         urlToState, stateToSearch, serializeSlide, parseSlideSnippet } from "diagram-webkit/core";

diffView(view, base);          // delta with null for dropped keys
viewsEqual(a, b);              // after canonicalView (sorted, rounded, empties dropped)
urlToState("?v=fit&filter-level=1", 10); // { version: 1, view: { camera: { fit: true }, level: 1 }, ui: {} }
```
