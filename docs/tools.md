# Tools

## CLI

```sh
# Check SVG metadata against the definition: tags, slugs, views pointing at missing cells.
# Exit 1 on errors.
npx diagram-webkit validate my-diagram.svg --definition definition.js
# warning: missing-ancestor [lb]: Network.Ingress without its parent Network
# 58 cells, 51 with help, 0 errors, 1 warnings

# Full-page URL -> reveal <section>, relative to the definition's baseState.
npx diagram-webkit url-to-slide "https://x.org/?v=0.5,0.4,0.3,0.3&pins=A" --definition diagram.js --title "A"

# Tag descriptions from markdown: print as JSON, or write a JS module.
npx diagram-webkit tag-tree METADATA.md
npx diagram-webkit tag-tree METADATA.md --heading "Tag tree" --out config/tag-descriptions.generated.js
```

Markdown format:

```md
## Tag tree

- `Network` — traffic
  - `Network.Egress` — outbound
- `Data`
```

The separator is an em dash (`—`). Parsing stops at the next `## ` heading.

```js
// definition.js
import descriptions from "./config/tag-descriptions.generated.js";
export default defineDiagram({ tags: { descriptions }, ... });
```

Generate a module rather than importing `METADATA.md?raw`: `?raw` does not work inside a dependency that Vite pre-bundles.

## Vite plugin

```js
// vite.config.js
import { defineConfig } from "vite";
import { diagramWebkit } from "diagram-webkit/tools/vite";

export default defineConfig({
  plugins: [
    diagramWebkit({
      // Always: a small inline script that shows uncaught start-up errors (a definition that
      // throws on import, a rejected mountApp) instead of a blank page, until a diagram mounts.
      definition: "./definition.js",    // <title>, <html lang>, meta, favicon, noscript from content.page
      // page: { title: "..." },        // or pass the page fields directly
      tagTree: {
        file: "METADATA.md",
        heading: "Tag tree",
        out: "config/tag-descriptions.generated.js", // rewritten on start and when METADATA.md changes
      },                                // without out: only validates the markdown
      singleFile: true,                 // build: one index.html, JS/CSS inlined; works from disk (standalone.md)
    }),
  ],
});
```

`DIAGRAM_WEBKIT_DIR=<checkout>`: the plugin resolves `diagram-webkit` to that checkout's source, and the CLI runs that checkout's CLI ([development.md](development.md#developing-a-diagram-against-a-local-checkout)).

## Node helpers

```js
import { loadDefinition, renderPage, pageTags, applyPageDocument,
         parseTagTreeMarkdown, readTagTreeMarkdown, tagTreeModule, writeTagTreeModule } from "diagram-webkit/tools";

const definition = await loadDefinition("./definition.js"); // via Vite, so ?raw/JSON/asset imports work
renderPage(definition.content.page, { script: "./index.js" }); // standalone index.html string
```

## Using a linked definition in a deck

With `link:` (pnpm) or `file:` (npm), the definition's files live outside the deck's root. The SVG is fetched at runtime, so allow it for the dev server:

```js
// deck/vite.config.js
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const diagramDir = realpathSync(fileURLToPath(new URL("./node_modules/my-diagram", import.meta.url)));

export default defineConfig({
  base: "./",
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), diagramDir] } },
});
```
