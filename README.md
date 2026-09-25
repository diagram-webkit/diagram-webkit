# diagram-webkit

Interactive draw.io SVG diagrams: pan and zoom, tag filters, detail levels, search, help tooltips, pins, highlights, user annotations and shareable view links. It runs as a full-page app, an embed, a reveal.js deck, or a standalone app that opens any SVG.

- npm: [`diagram-webkit`](https://www.npmjs.com/package/diagram-webkit)
- License: MIT
- Used by: [Kubernetes security diagram](https://github.com/kubesec-diagram/kubesec-diagram.github.io)

```
diagram-webkit          engine: all logic, UI and CSS
  └─ <diagram>          data only: draw.io SVG + defineDiagram({...})
       └─ <consumer>    full-page site, embed, or reveal.js deck
```

## Quick start

```sh
npm i diagram-webkit
```

```js
// definition.js
import { defineDiagram } from "diagram-webkit";

export default defineDiagram({
  id: "my-diagram",
  source: { production: new URL("./my-diagram.svg", import.meta.url).href },
});
```

```js
import { mountApp, mountDiagram } from "diagram-webkit";
import definition from "./definition.js";

await mountApp(document.body, definition);                              // full page
await mountDiagram(element, definition, { features: "embed" });         // embed
```

```js
import { revealPlugin } from "diagram-webkit/reveal";
Reveal.initialize({ plugins: [revealPlugin(definition.extend({ features: "embed" }))] });
```

```sh
npx diagram-webkit validate my-diagram.svg --definition definition.js
```

## Docs

- [docs/user-guide.md](docs/user-guide.md): using the app and making a diagram in draw.io
- [docs/README.md](docs/README.md): index for developers (definition, state, features, API, URL parameters, reveal.js, standalone, tools, development)
- [examples/](examples/): a definition package, two reveal.js decks, and the standalone app

## Repository

```
packages/diagram-webkit/   the npm package
examples/                  standalone example projects
docs/                      documentation
e2e/                       Playwright suites
```

```sh
npm ci && npm run build && npm test && npm run e2e
```

For more, see [docs/development.md](docs/development.md) and [AGENTS.md](AGENTS.md).
