# diagram-webkit docs

Interactive draw.io SVG diagrams: a full-page app, an embed, or a reveal.js deck.

Using it, or making a diagram for it: [user-guide.md](user-guide.md). The rest is for developers.

| File | What |
| --- | --- |
| [usage.md](usage.md) | Definition package, SVG authoring, full page, embed |
| [standalone.md](standalone.md) | No diagram defined: open a file, drop, link or `#svg=`; share links with the SVG inside; offline single file |
| [reveal.md](reveal.md) | reveal.js plugin: slots, views, fragments, state from a pasted URL, print |
| [definition.md](definition.md) | Every `defineDiagram()` field |
| [state.md](state.md) | View state: camera, filters, highlight, merge rules |
| [features.md](features.md) | Feature structure, `app`/`embed` presets, where to override |
| [api.md](api.md) | `mountDiagram` / `mountApp` options, instance API, events |
| [url.md](url.md) | URL parameters |
| [tools.md](tools.md) | CLI and Vite plugin |
| [development.md](development.md) | Repo layout, commands, tests, local development |

```
diagram-webkit              # engine (this repo, packages/diagram-webkit)
  └─ <diagram>              # definition package: data only (SVG + definition.js)
       └─ <site or deck>    # full-page app, embed, or reveal.js deck
```
