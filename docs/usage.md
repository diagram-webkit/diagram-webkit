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

Cell properties `tags`, `slug`, `help` (draw.io Edit Data, `Ctrl+M`) end up in the SVG as `data-*` attributes (names configurable in `metadata`). Save with draw.io File → Save as → SVG; the draw.io CLI export (`drawio -x -f svg`) does not write them.

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
```

```sh
npx diagram-webkit validate my-diagram.svg --definition definition.js
# codes: unknown-tag, missing-ancestor, tag-depth, duplicate-slug, missing-slug,
#        slug-format (PascalCase, max 20), slug-without-help, unknown-slug/-id (in views)
```

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
