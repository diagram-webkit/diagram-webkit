# Standalone app (local mode)

For readers: [user-guide.md](user-guide.md), linked from the app's first page and About box (`USER_GUIDE_URL`).

With no diagram in the definition, or no definition at all, the reader brings the SVG. The diagram stays in the browser: nothing is uploaded and the page makes no requests, except to a link the reader asks for.

```js
import { mountApp, mountDiagram } from "diagram-webkit";

await mountApp(document.body);                          // the standalone app
await mountDiagram(element, undefined, { features: "embed" }); // an embed that asks for its SVG
await mountDiagram(element, defineDiagram({ id: "x" }));        // same: a definition without source
```

Local mode is on only when neither `definition.source` nor `opts.source` names a diagram. A defined diagram never shows the picker, never reads `svg` from the URL, and accepts no drops.

## Opening a diagram

| How | Notes |
| --- | --- |
| "Choose SVG file…" | file picker, `.svg` / `image/svg+xml` |
| drop an SVG on the page | also replaces a loaded diagram (full-page app) |
| link field, or `#svg=https://…/diagram.svg` | **link mode**: fetched without cookies or referrer, never turned into data; the server must allow cross-origin reads |
| `#svg=<data>` | **embedded mode**: the SVG inside the link, raw-deflate + base64url; plain base64 of the SVG text also works |

One parameter, `svg`, two modes: a value that starts with `http(s)://`, `//`, `/`, `./`, `../` or ends in `.svg` is a link; anything else is data. `?svg=` is read as well; the app writes `#svg=`, so not even a link reaches the server hosting the app.

```
https://example.org/diagram/#svg=https://example.org/k8s.svg
https://example.org/diagram/#svg=zZnrj9u4EcC_56-...
https://example.org/diagram/?v=0.4,0.5,0.3,0.3&pins=WebApp#svg=zZnrj9u4...   # view params work as usual
```

Full-page app (`urlSync`):

- The address bar always names the diagram, so reload and every copied link keep it: `#svg=<link>` for one opened from a link, `#svg=<data>` for a file or a drop (up to 2 MiB).
- Opening another one restarts the page with it; the previous view parameters are dropped. Past 2 MiB it goes through `sessionStorage` for that one reload, and a later reload asks again.
- Errors (not an SVG, bad link, unreadable `#svg=`) show in the picker; pick again.

Embeds (`urlSync` off) only get the picker and a drop onto their container; they never read or write the page URL.

## The help dialog

One dialog with tabs, opened by the footer "?" (bottom left; first tab) or the `?` key (Controls). A fixed size, a little above the middle, content scrolling inside, so it never moves between tabs. Only tabs that apply are shown:

| Tab | Shown when | Contents |
| --- | --- | --- |
| Open diagram | local mode: before the first diagram, and in the full-page app after it | the picker |
| About | `features.about` and `content.about` | name and `page.description`, the About text, facts (version, `content.license`, `page.author`, `content.repository` and its issues, built with) |
| Share | `features.linkInfo` | Link to this view (the variants), The diagram (how it travels, Download SVG; local mode), For presentations (Copy as slide, `?debug`) |
| URL parameters | `features.linkInfo` | the parameters in this address, grouped (`PARAM_GROUPS`), then all parameters (collapsed) |
| Controls | `features.shortcuts` | mouse and touch; the keys (hidden on touch-only devices) |

The page footer is one line, `GitHub (issues) ⭐ ?` (the definition's `content.footer.links`, then the dialog button). The dialog's bottom bar has the versions: `<diagram label> <content.footer.version> · Built with diagram-webkit vX · User guide` (standalone: `diagram-webkit vX · User guide · GitHub`). The page footer no longer shows a version.

While nothing is loaded in local mode it is the page itself: no close button, `Esc` does nothing, the other tabs can still be read. `←` `→`, `Home` and `End` switch tabs from anywhere in the dialog (not while typing in a field); `↑` `↓` scroll.

## Sharing: the Share tab

In local mode the diagram is in the address bar (`#svg=`), so the normal links carry it: "Current" reads "diagram included". The Diagram section says how:

| Whole link | The Diagram section |
| --- | --- |
| ≤ 32 000 characters | muted: the diagram is inside these links (size) |
| > 32 000 | yellow: some chat tools cut links this long |
| > 100 000 | orange, bold: many tools cut or reject them |
| > 2 MiB | red: too large for a link; the links open without it, share the SVG file |
| link mode | the links open it from that URL; the diagram itself is not in them |

**Download SVG** there saves the loaded diagram as a file again (useful when it only lived in `#svg=`): the cleaned version, so a shared file cannot run script when opened from disk; tags, help and draw.io's embedded copy stay. Named after the original file or link, else `diagram.svg`.

Another diagram: the Open tab (full-page app), or drop it on the page. The About tab says what diagram-webkit is, that nothing leaves the browser, links to the user guide, lists sites that use it, and has the version, license and GitHub facts (`USED_BY` in `dom/standalone.js`); it does not open by itself in local mode.

## Untrusted SVGs

Everything opened in local mode is cleaned before it is inserted (`dom/svg-sanitize.js`), while still in an inert document:

- removed: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<foreignObject>` form controls, `on*` handlers, animations of `href`/`on*`
- links: `<a>` keeps `http(s)`, `mailto`, `tel`, `#…` (gets `rel="noopener noreferrer"`); everything else (`<image>`, `<use>`, …) keeps only `#…` and `data:image/…`, so nothing loads from elsewhere
- CSS: `@import` and `url(…)` to anywhere but `#…`/`data:image/…` go
- help text (`data-help`) is sanitized with `HELP_HTML_WHITELIST`: formatting, lists, tables, links; no images

A draw.io SVG that points to external images shows without them.

## Offline, single file

`examples/direct--standalone-app` builds to one `dist/index.html` (about 250 KB, 72 KB gzipped) with everything inlined. Host it anywhere, or open it from disk.

```js
// vite.config.js
diagramWebkit({ page: { title: "diagram-webkit" }, singleFile: true })
```

From the repo root:

```sh
npm run standalone          # build the package, start the app (vite dev server, prints the URL)
npm run standalone:build    # one file: examples/direct--standalone-app/dist/index.html
```

## Texts

All strings are in `DEFAULT_TEXTS` (`local*`, `embed*`) and can be changed with `content.texts`.
