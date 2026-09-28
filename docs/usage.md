# Usage

## Definition package

Data only: no DOM code. Behaviour belongs in the engine, behind a definition field or feature.

```
my-diagram/
  package.json
  index.js           # re-exports the definition and the engine
  definition.js      # defineDiagram({...})
  my-diagram.svg     # draw.io, saved as SVG (editable in draw.io)
  index.html         # optional: full-page app
  vite.config.js     # optional: full-page app build
```

```json
{
  "name": "my-diagram",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./definition": "./definition.js",
    "./my-diagram.svg": "./my-diagram.svg"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "validate": "diagram-webkit validate my-diagram.svg --definition definition.js"
  },
  "dependencies": { "diagram-webkit": "^0.1.0" },
  "devDependencies": { "vite": "^8.3.0" }
}
```

```js
// index.js: consumers import only this package.
export { default } from "./definition.js";
export * from "diagram-webkit";        // mountApp, mountDiagram, defineDiagram, ...
export * from "diagram-webkit/reveal"; // revealPlugin
```

```js
// definition.js
import { defineDiagram } from "diagram-webkit";

const svg = new URL("./my-diagram.svg", import.meta.url).href;

export default defineDiagram({
  id: "my-diagram",                   // required; also the default storage namespace
  requires: "^0.1.0",                 // engine semver range; fails fast on mismatch
  source: { production: svg },
  tags: {
    groups: [{ id: "general", label: "Tags", layout: "tree" }],
    descriptions: { Network: "traffic", "Network.Ingress": "from users" },
  },
  content: {
    page: { title: "My diagram" },
    about: "<p>Shown in the About dialog.</p>",
  },
  views: {
    overview: { title: "Overview", state: { camera: { fit: true }, level: 0 } },
  },
});
```

All fields: [definition.md](definition.md).

## SVG authoring (draw.io)

Cell properties `tags`, `slug`, `help`, `overlay`, `overlay-definition`, `arrow-at-each-box` (draw.io Edit Data, `Ctrl+M`) end up in the SVG as `data-*` attributes (names configurable in `metadata`). Save with draw.io File → Save as → SVG; the draw.io CLI export (`drawio -x -f svg`) does not write them.

```xml
<g data-cell-id="lb"
   data-tags="level-1 pri-2 css-edge Network Network.Ingress"
   data-slug="LoadBalancer"
   data-help="Load balancer&#10;Terminates TLS and forwards requests.">
<!--
  data-tags  space-separated. Special roles (patterns in tags.roles):
               level-N   shown at detail level >= N
               pri-N     priority, styled via tags.meta["pri-N"]
               css-X     adds class custom-X (style it in content.css)
             Hierarchy uses tags.separator ("."): Network.Ingress is a child of Network.
  data-slug  stable name for pins, highlight and links
  data-help  first line = title, rest = body (tooltip and search)
-->

<!-- line overlays: translucent bands along lines (user-guide.md#lines-overlays) -->
<g data-cell-id="legend-egress" data-tags="legend" data-overlay-definition="egress" type="edge">
<g data-cell-id="pod-to-gw" data-tags="Network Network.Egress" data-overlay="egress,ingress" type="edge">
<!--
  data-overlay-definition  one name; the line's first <path> is the look of that overlay
  data-overlay             names, comma- or space-separated; order across the line: the first on the
                           left looking along the arrow (both or no arrows: as drawn, start to end)
  data-overlay-destination on a box: "true" = bands end or start there, none is joined through it
  Bands run arrow tip to arrow tip, are joined inside a box where one line arrives and
  another leaves (arrows = direction), and are drawn on top in g.dwk-line-overlays;
  cells with a data-slug are moved above them (g.dwk-above-overlays).
-->

<!-- box arrows: the line's arrowhead repeated where it enters each box drawn over it -->
<g data-cell-id="chain" data-tags="Api" data-arrow-at-each-box="true" type="edge">
<!--
  On a line: true = an arrow at each filled, non-marker box after it in the SVG.
  On a box: true = always an arrow here, false = never. Markers: priority or info tag.
  Each arrow (g.dwk-box-arrow, right after the line) shows while the line and its box show.
-->
```

```sh
npx diagram-webkit validate my-diagram.svg --definition definition.js
# codes: unknown-tag, missing-ancestor, tag-depth, duplicate-slug, missing-slug,
#        slug-format (PascalCase, max 20), slug-without-help, unknown-slug/-id (in views),
#        unknown-overlay, duplicate-overlay-definition, overlay-definition-format,
#        arrow-at-each-box-format
```

### Source and rendered SVG

With line overlays, the draw.io file alone lacks the bands. Keep the draw.io file as the source and publish a rendered one:

```
my-diagram.drawio.svg   edited in draw.io
my-diagram.svg          npx diagram-webkit render my-diagram.drawio.svg --out my-diagram.svg (bands in, draw.io model out)
```

The definition loads the rendered file, and the source in development mode: [definition.md](definition.md#development).

## Full page

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My diagram</title> <!-- replaced by content.page.title -->
  </head>
  <body>
    <script type="module">
      import definition, { mountApp } from "./index.js";
      window.diagram = await mountApp(document.body, definition);
    </script>
  </body>
</html>
```

```js
// vite.config.js
import { defineConfig } from "vite";
import { diagramWebkit } from "diagram-webkit/tools/vite";

export default defineConfig({
  base: "./", // relative asset paths (GitHub Pages)
  plugins: [diagramWebkit({ definition: "./definition.js" })], // <head> tags from content.page
});
```

## Embed

```js
import definition, { mountDiagram } from "my-diagram";

const diagram = await mountDiagram(document.querySelector("#diagram"), definition, {
  features: "embed",                                  // no panel, no URL sync, no input
  initialState: { view: { camera: { focus: { slugs: ["LoadBalancer"] }, padding: 0.2 } } },
});

await diagram.setState({ view: { highlight: { tags: ["Network"], mode: "pulse" } } }, { transition: 600 });
diagram.on("elementactivate", ({ slug }) => console.log("clicked", slug));
```

```css
#diagram { width: 800px; height: 450px; } /* the container must have a size */
```

As an element, isolated from the page CSS in a shadow root ([api.md](api.md#custom-element)):

```js
defineDiagramElement("my-diagram", definition, { features: "embed" });
```

```html
<my-diagram view="overview" style="height: 450px"></my-diagram>
```

## Extending a definition

```js
import base from "my-diagram/definition";

export default base.extend({
  features: { preset: "embed", tooltips: false },   // preset + overrides
  baseState: { camera: { fit: true } },             // merged into the base view
  views: {
    "cache-path": { title: "Cache", state: { onlyTags: ["Data"] } }, // added
    overview: null,                                                  // removed
  },
  content: { about: null },                         // null removes an inherited value
});
```

Merge rules: objects merge deeply, arrays and functions replace, `null` removes.
