# URL parameters

Read on load and written back when `features.urlSync` is on (the `app` preset). Other parameters are left untouched. Commas are written unescaped.

| Param | Example | State |
| --- | --- | --- |
| `v` | `v=0.5,0.4,0.3,0.25` / `v=fit` (or `0`) | `camera.rect` [cx, cy, w, h] / `camera: { fit: true }` |
| `filter-level` | `filter-level=1` | `level`; left out at max |
| `filter-hide-tags` | `filter-hide-tags=Observability,Data.Cache` | `hiddenTags`; a parent hides its whole branch |
| `only-tags` | `only-tags=Network` | `onlyTags`; wins over `filter-hide-tags` |
| `filter-query` | `filter-query=tls` | `query` |
| `pins` | `pins=LoadBalancer,WebApp` | `pins` (slugs) |
| `highlight` | `highlight=WebApp,tag:Data,id:cell-3,mode:pulse` | `highlight`; bare = slug; mode `outline`\|`pulse`\|`dim-others` |
| `focus` | `focus=Network.Ingress,Api` | `focus.tags`; without `v`, also `camera: { focus: { tags } }` |
| `focus-mode` | `focus-mode=dim-others` | `focus.mode`; left out = `outline` |
| `annotations` | `annotations=<base64 JSON>` | `annotations` (max `definition.annotations.max`) |
| `menu` | `menu=true` | `ui.panelOpen` |
| `tags` | `tags=open` | `ui.tagTreeExpanded` |
| `debug` | `debug` | load `source.debug`, debug logs |
| `svg` | `#svg=https://example.org/k8s.svg`, `#svg=zZnr…` (or `?svg=`) | local mode only: a link to the SVG, or the SVG itself, deflate + base64url ([standalone.md](standalone.md)) |

reveal.js decks: `?diagram-debug` shows the state overlay, and a copied page URL can be a slide as `data-diagram-state-url` ([reveal.md](reveal.md)).

## Examples

```
/                                            # defaults
/?v=fit                                      # whole diagram
/?v=0.25,0.3,0.4,0.4&pins=LoadBalancer       # zoomed in, one pin
/?only-tags=Network&filter-level=0           # network cells, essentials only
/?highlight=tag:Data,mode:dim-others         # dim everything but the data layer
/?menu=true&filter-query=tls&tags=open       # panel open with a search
/?focus=Api.Rbac&focus-mode=dim-others       # zoom to RBAC, dim the rest
```

A `camera.focus` is written as the `v` on screen. `focus=` without `v` fits the focused topics on load; the app then writes their `v`.

```js
import { urlToState, stateToSearch, paramDocs } from "diagram-webkit/core";

urlToState("?v=fit&only-tags=Network", 10);
// { version: 1, view: { camera: { fit: true }, onlyTags: ["Network"] }, ui: {} }

stateToSearch({ version: 1, view: { level: 0 }, ui: {} }, { defaultLevel: 2 }); // "?filter-level=0"

paramDocs(3); // [{ name, kind, values?, description }] (drives the link-info dialog)
```
