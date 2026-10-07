# diagram-webkit: agent guide

Engine for interactive draw.io SVG diagrams. It can run as a full-page app, an embed, a reveal.js deck or a standalone "open any SVG" app. It is published on npm as `diagram-webkit` (`packages/diagram-webkit`), and the repo is `https://github.com/diagram-webkit/diagram-webkit`.

Read `docs/` before changing behaviour. `docs/README.md` is the index. `docs/user-guide.md` is written for readers and diagram authors. The other files are for developers.

## How the pieces fit

```
diagram-webkit              engine: every piece of logic, UI and CSS (this repo)
  └─ <diagram package>      data only: SVG + defineDiagram({...}), re-exports the engine
       └─ <consumer>        full-page site, embed, or reveal.js deck; extends the definition
```

- diagram-webkit knows no diagram package. Packages depend on it, never the other way. The only mentions of users (for example the Kubernetes security diagram) are links in README and About texts. No script, path, variable or test setup in this repo depends on a particular diagram.
- A diagram package holds only data: the SVG, tag metadata, texts, links, named views, feature choices and `content.css`. It has no DOM code, no listeners and no behaviour. If a diagram needs something new, add it to the engine behind a definition field, a hook or a feature flag, and document it.
- Inheritance works for any chain. A consumer defines only what differs, and the base knows nothing about the consumer.
- There are two dependency paths, and both are supported:
  - **re-export (default):** the consumer depends only on the diagram package, whose `index.js` does `export * from "diagram-webkit"` and `export * from "diagram-webkit/reveal"`.
  - **direct:** the consumer imports `diagram-webkit` plus `<diagram>/definition`.
- Config layers, where later wins: engine defaults, then definition, then `extend()` overrides, then initial state (URL in the app, deck base or slide in Reveal), then runtime `setState`. The first three are merged once at mount.

## Repo layout

```
packages/diagram-webkit/
  src/index.ts        mountDiagram, mountApp, defineDiagramElement, standaloneDefinition, defineDiagram, PRESETS, DEFAULT_TEXTS, VERSION
  src/types.ts        public instance types (DiagramInstance, MountOptions, DiagramEvents, ...)
  src/core/           pure TS, no DOM (lib ES2024): definition, presets, state, tags, help, html, dark
                      sanitizer, annotations, validate, texts, version, semver, tag-tree-markdown, line-overlays,
                      codec/{url,camera,slide,json,params}
  src/dom/            instance runtime (JS, checkJs): instance, element, context, lifecycle, loader, styles, view-export,
                      camera*, input, filter, focus, pins, phases, help-index, tag-style, dark-canvas,
                      overlays/*, annotations/*, local-source, embed-codec, svg-sanitize,
                      standalone, error-box
  src/ui/             app chrome (JS, checkJs): mount-app, app, panel, tag-tree, tag-picker, level-slider, help-examples,
                      results, tooltip, theme, help-dialog, settings, keys, shortcuts, link-info,
                      feedback, layout, markup, annotation-editor/*, styles/*.css
  src/adapters/       storage.js (localStorage), url-sync.js (history/location)
  src/reveal/         reveal.js plugin (TS): plugin, stage, slots, print, debug-overlay
  src/tools/          Node, shipped as source: cli.js, vite-plugin.js (entry) + vite-plugin-core.js, render, load-definition + definition-loader, local-engine, page-template, tag-tree-markdown
  test/               vitest (node; happy-dom where a DOM is needed); golden/ = reference outputs
examples/             independent projects (see Examples)
e2e/                  Playwright: embed/, features/ (F1-F33 on the app), reveal/, examples/; pages/ = test pages
scripts/              check-examples.mjs, next-version.mjs (release)
docs/                 usage, definition, state, features, api, url, reveal, standalone, tools, development, user-guide
```

Package exports: `.`, `./core`, `./reveal`, `./tools`, `./tools/vite`, `./styles.css`. Bin: `diagram-webkit` (`validate`, `url-to-slide`, `tag-tree`, `render`; `render` needs Playwright + Chromium in the calling project and a built `dist/`).

## Commands

```sh
npm ci
npm run build              # required before examples/e2e: they use packages/diagram-webkit/dist
npm run lint               # ESLint on JS only (typescript-eslint does not support TS 7)
npm run typecheck          # tsconfig.json + tsconfig.core.json (no DOM lib) + tsconfig.js.json (checkJs)
npm test                   # vitest
npm run examples:install && npm run check-examples
npx playwright install chromium
npm run e2e                # embed, features, reveal, examples
npm run standalone         # standalone app, dev server
npm run standalone:build   # single offline file: examples/direct--standalone-app/dist/index.html
```

```sh
npx vitest run test/codec.test.ts                                   # in packages/diagram-webkit
npx playwright test e2e/reveal/deck.spec.ts -g "fragment"
E2E_EMBED_ONLY=1 npx playwright test --project=embed                # no example servers
```

e2e ports are 4100 (test pages), 4101 (app), 4102 (via deck), 4103 (split deck) and 4104-4106 (embed-minimal, custom-hooks, multi-instance). They are defined in `PORTS` in `playwright.config.ts`.

CI (`.github/workflows/ci.yml`, Node LTS) runs lint, typecheck, unit, build, check-examples and e2e. Every step must stay green.

No path may point outside the repo. The only link to other checkouts is the other direction: a diagram project sets `DIAGRAM_WEBKIT_DIR` to use this checkout (below).

## Language and code style

- English everywhere: code, comments, docs, commit messages and UI texts.
- Use the latest stable versions of Node (LTS in CI), TypeScript, Vite, Vitest, Playwright, ESLint and reveal.js. Use npm and commit the lockfiles.
- ESM only (`"type": "module"`). Use named exports. Default exports are only for definitions and config files.
- Formatting follows the existing code, since there is no formatter: 2 spaces, double quotes, semicolons, trailing commas in multi-line literals. Long lines are fine when they read better than wrapped ones.
- TS is `strict` with `verbatimModuleSyntax` (write `import type` for types). JS modules have JSDoc types where checkJs needs them, for example `/** @param {import("./context").Context} ctx */`.
- Naming:
  - `camelCase` for functions and variables, and `PascalCase` for types and classes.
  - `UPPER_SNAKE` for module-level constants.
  - Runtime modules are `createX(ctx)` factories.
  - CSS classes are `dwk-<name>`, custom properties are `--dwk-<name>`, and the root state classes are `dwk-<state>`.
- Readability comes before cleverness. Keep functions small and focused, and give them names that say what they do.
- Comments: only where the code can't say it, such as a reason, a browser quirk or a measured number. Don't add comments that repeat the code, and don't use emojis.
- No new dependencies in the package without a strong reason. At runtime the package has none, and it should stay that way.
- Don't create files unless they're needed. Prefer extending an existing module, and keep to the existing directory structure.

## Robustness and error handling

- Fail fast. Validate at boundaries (`defineDiagram`, `normalizeView`, mount options, URL parsing, CLI arguments), then work on normalized data inside. Unknown keys and wrong shapes throw an error that includes the path.
- Catch only the concrete error types expected at that call site, and keep `try` blocks narrow. Never use a broad `catch` that swallows the error. The one deliberate exception is `decodeAnnotations` (see Reference behaviour).
- Use typed errors (`DiagramStateError`, `DiagramLoadError`, `EmbedDecodeError`) and not bare strings.
- Never swallow a failure silently. Show it in the UI with the operation and the technical details, and emit it as an `error` event or reject. When a fallback exists, it must be explicit, deterministic and visible, for example as a `console.warn` naming the dropped tag or slug.
- Don't mask programming errors with defensive defaults.
- Don't duplicate logic. Shared rules live in one place, for example:
  - `PRESETS`, `DEFAULT_TEXTS` and `paramDocs`/`PARAM_GROUPS`.
  - `HIGHLIGHT_MODES`, `PROJECT_URL` and the camera constants.
  - The same codec serves the URL, slides, the CLI and the debug overlay.
- Keep constraints (paths, storage keys, limits, feature flags) centralized as named constants instead of scattering literals.
- Treat every external input as untrusted: URL parameters, `annotations=`, `#svg=`, dropped files, and help HTML. Sanitize it in an inert document. Never use `innerHTML` with unsanitized input.

## Git and security

- Commit and push only when asked. Follow the existing commit message style. Never force-push to `main`.
- Never commit secrets, `.env` files or build output (`dist`, `test-results`).
- Don't run destructive commands (`rm -rf`, history rewrites) without confirmation.
- When unsure about a behaviour change, especially one that touches a public contract below, ask instead of guessing.

## Architecture rules

- `core/` has no DOM. `tsconfig.core.json` enforces this. `core/platform.d.ts` declares the few web APIs that core may use.
- Many instances can run on one page and they are independent. All instance state is in `ctx.s` (`dom/instance.js`), and modules are `createX(ctx)`.
- Listeners are bound with the instance's `AbortController` signal, and timers and rAF go through `ctx.timers`. After `destroy()`, no listeners are left on `document`/`window` and no nodes are left outside the container (e2e checks this with CDP). The only global listener allowed is the `ownerDocument` keydown for shortcuts, and only when that feature is on.
- In `dom/`, `ui/` and `adapters/`, ESLint forbids `document`, `localStorage`, `history` and `location`. Use `ctx.ownerDocument`/root, `adapters/storage.js` and `adapters/url-sync.js`.
- Geometry is in container layout px. Convert client coordinates with `getScale()` (`rect.width / offsetWidth`), because the root can be CSS-scaled (Reveal `transform: scale`, `zoom`).
- CSS:
  - Every selector goes under `:where(.dwk-root)`, and ids become `.dwk-<id>`.
  - Use `@container dwk (...)` and not media queries, and `cqw`/`cqh` and not `vw`/`vh`.
  - State goes in classes or attributes on the root, never on `body`. The theme is `data-theme` on the root.
  - The root has `contain: layout`, which keeps fixed overlays inside it.
  - Styles are adopted with `adoptedStyleSheets`, ref-counted per root node (the document, or the shadow root of `defineDiagramElement`). Definition CSS is `content.css`, a string.
  - Shadow DOM only through the custom element (`dom/element.js`); plain mounts stay in the light DOM. Read focus from `ctx.scope.activeElement`, not the document's; `isTypingTarget` looks through open shadow roots.
- Performance: animate `opacity` and `transform`, never `filter`, on cells. Filter animations cut frame rates by about 5x. Set `will-change` only while a tween runs, through `geometry.holdLayer(key)`, because leaving it on blurs a zoomed diagram. Line overlays (`dom/overlays/line-overlays.js`, geometry in `core/line-overlays.ts`) are one `g.dwk-line-overlays` appended to the diagram SVG, built once per load before the filter and the dark theme run; geometry comes from attributes, not layout, and each band mirrors its lines' inline `display`/`opacity` and highlight target through a `MutationObserver`. Outline highlights are drawn on copies (`g.dwk-highlight-copy`, ids and metadata removed) inserted right after each highlighted cell, so they keep draw.io's stacking (dark theme and view export skip them); the tag picker's selection glow is a static class on the cells themselves (`dom/overlays/selection.js`), so they keep their stacking, and pin rings are drawn in an SVG layer inside the transformed image.
- With the `fade` mount option (the Reveal default is 400), changes run in two phases through `dom/phases.js`: out first, then in. Without it, changes apply at once, as the app does.
- There is no frontend framework. The runtime is imperative SVG/DOM. `core/` and `reveal/` are TS, while `dom/` and `ui/` are JS checked by `tsconfig.js.json`.
- Errors must be visible:
  - `mountDiagram` puts a red box (`dom/error-box.js`) in the container before it rejects.
  - The Reveal plugin shows errors over the slot and carries on.
  - The Vite plugin injects `STARTUP_ERROR_SCRIPT` to catch errors at import time.
  - `defineDiagram`, `setState` and features throw on unknown keys and wrong shapes, and the message includes the path.

## Public contracts

Keep these stable. Changing any of them breaks links and embeds that already exist.

- **SVG contract** (draw.io File → Save as → SVG, or Export as SVG; properties from Edit Data / `Ctrl+M`): the cell properties become `data-cell-id`, `data-tags`, `data-help`, `data-slug`, `data-overlay`, `data-overlay-definition` and `data-overlay-tags` on the cell `<g>`, next to draw.io's own `type="edge"|"vertex"`. The attribute names can be changed in `definition.metadata`. The draw.io CLI export (`draw.io -x -f svg`) does **not** write these attributes.
- **Labels:** draw.io writes them as `<switch><foreignObject width="100%" height="100%">…</foreignObject><text>fallback</text></switch>`. A cell's `getBBox()` therefore spans the whole diagram, and the fallback `<text>` is not rendered (0x0). Measure what a cell draws (its shapes, and the text inside the `foreignObject`; see `drawnClientRects` in `dom/camera-control.js`), never the cell's own box.
- **Canvas:** the loader forces `color-scheme: light` on the SVG and gives it a white background when its own is transparent (draw.io saves `light-dark()` colours and a transparent background). The dark theme rewrites the colours inline (`dom/dark-canvas.js`, the matrix in `core/dark.ts` gives the look of `invert(1) hue-rotate(175deg) saturate(1.5) brightness(1.4)`); only raster images get that filter. Never put a filter on the diagram: it costs a filter pass on every frame a cell animates.
- **Tags:**
  - Tags are split on whitespace and commas.
  - The roles are regexes in `tags.roles`: `level-N` (the level is the max N, 0 if none), `css-X` (adds the class `custom-X`), `pri-N` (the lowest wins, then `info`).
  - Every other tag is a topic tag. Topic tags form a hierarchy on `.` with a max depth of 3. Ancestors are not derived unless `deriveAncestors` is set.
  - Internal topics (`tags.roles.internal`, default `_` and its branch) hide like any topic but are shown only in tag picker mode (tree, tooltip topic line), never as badges, and `onlyTags`/"hide others" leave them as they are.
  - Badges (topic chips in tooltips and results) of tree-group topics show only while the tree shows their row (a closed tree: its top level) (`applyChipVisibility` in `ui/tag-tree.js`, badges marked by `markTagBadges`); other groups' tags always show. Expand all (`tags=all`, `ui.tagTreeAllExpanded`) shows them all.
- **Dev notice** (`dom/dev-notice.js`): development mode only; one `console.warn`/`console.error` wrapper and `error`/`unhandledrejection` listener per window, shared by its instances, removed with the last one (`destroy()` leaves nothing behind). Shows `.dwk-dev-notice` (texts `devWarnings`, `devWarningsDismiss`).
- **Modes:** `definition.development` is merged over the definition (like `extend`, no `null`) in development mode: `opts.mode`, else `<meta name="diagram-webkit-mode" content="development">`, which the Vite plugin writes in `serve` only (`MODE_META_NAME`, `definitionForMode` in `core/definition.ts`).
- **Downloads** (`content.downloads`, About tab): rows `drawio`/`full` link to files (`url` required, `name` = save-as name), `view` saves the view from the page (`dom/view-export.js`): hidden cells (inline `display:none`/`opacity:0`) left out, dark colours reverted (`darkCanvas.lightenCopy`), root `style`/`preserveAspectRatio` as loaded (`s.svgRootAttrs`), `content` removed, pins (`pinRings.drawnRings()`) and notes (`s.userAnnotations`, drawn in viewBox units as `annotations/positioning.js` sizes them) appended as `g.dwk-view-pins` / `g.dwk-view-annotations`.
- **Rendered SVG** (`diagram-webkit render`, `src/tools/render.js`; `renderLineOverlays`): root `<svg data-dwk-rendered>`; bands drawn into `g.dwk-line-overlays` (after the diagram, followed only by `g.dwk-above-overlays` with the slugged cells), groups `g.dwk-line-overlay[data-overlay]`, bands `path.dwk-line-overlay-band[data-lines="<line ids>"]`; box arrows `g.dwk-box-arrow[data-lines="<line id> <box id>"]` right after their line; `content` removed from the `<svg>` and every `g`. An instance that loads an SVG with `data-dwk-rendered` uses what is there and never draws again (whatever `features.lineOverlays` says); `lineOverlays: false` only skips drawing.
- **Box arrows** (`data-arrow-at-each-box`, `dom/overlays/box-arrows.js`, `boxEntries` in `core/line-overlays.ts`): on a line (`true`), a copy of its end arrowhead (else its start one, reversed) where it enters each box after it in document order that is filled and not a marker (`getPrimarySeverityTag` non-null: priority or info tag); on a box, `true`/`false` overrides that. Not the boxes the line starts or ends at, not boxes that contain it. Rectangles and single-ellipse boxes exact. Each arrow follows the line and its box (shown while both are).
- **Line overlays** (`docs/user-guide.md#lines-overlays`): `data-overlay-definition` is one name, and that line's first `<path>` is the band's look (all attributes copied; `opacity`/`stroke-opacity` move to the overlay's group). `data-overlay` is a comma/space list; the bands lie across the line in that order, centred on it, the first on the left looking along the arrow (both or no arrows: drawn start to end). Band ends reach the drawn arrow tip and snap onto the box edge they touch. Flow direction is per overlay (one arrow: towards it; both or none: from the lines met, arriving flows first), so a two-way line can carry opposite flows; joins only from an arriving to a leaving line at the same box or point, per overlay, never through a box with `data-overlay-destination="true"`. Joins start at each band's own offset: bands with the same offset on both lines turn concentrically (arcs, `JOIN_RADIUS` ± offset), parting bands turn on the box's centre line. Cells with a slug (`slugAttr`, closest `idAttr` cell) are moved, in order, into `g.dwk-above-overlays` right after the band layer (wrapped in their old parent's root transform when it is not the identity), only when bands are drawn; a rendered SVG already has that order. Corners are circular arcs (`A`) so neighbouring strokes are concentric; bands are `SEAM_OVERLAP` (0.5) wider than the definition so curved seams do not show. Only `type="edge"` cells. `data-overlay-tags` on the definition line is copied as `data-tags` onto that overlay's `g.dwk-line-overlay` (also in a rendered SVG), so the filter treats the group as a cell: hidden or focused by those tags; the generic dim skips the group, and bands inside a focused group are not dimmed.
- **Help:** in `data-help`, the first non-empty line is the title and the rest is the body. `data-slug` is PascalCase, at most 20 characters, unique, and required on cells that have help. Examples are `data-help.<formatter>.<name>` on the same cell (`EXAMPLE_FORMATTERS`, `highlightExample` in `core/help.ts`; tabs, code panels and the corner dot `circle.dwk-example-marker` in `ui/help-examples.js`). The browser lowercases attribute names, so the tab title is `<name>` in lowercase with `_` as a space. The selected tab is `record.exampleTab` (`HELP_TAB` = the help text), shared by the tooltip and the result entry; a new search sets it to `searchTab()`. A click on a tab holds a desktop tooltip open (`tooltip.hold`) until a click outside it, Escape or another tooltip. A tooltip with examples is a flex column (shown as `display: flex`) never taller than the diagram; after a tab change it keeps its place unless its bottom left the diagram, then moves up just enough (`tooltip.keepInView`). Every measurement of a cell's shapes (camera focus, pin rings, tooltip anchor, highlight line, `svg-geometry`) skips the dot via `excludingExampleMarkers`. `examplesOnly` on a hidden priority shows it again; hiding a priority with its button clears its `examplesOnly`. `view.tooltip` (`{ slug, tab?, mode?, marker?, width?, scale?, position? }` over `definition.ui.tooltipDefaults`, one validator `normalizeTooltipOptions`; `tooltip=Slug:tab`, `tooltip-mode=simple`) opens that popup held (`helpIndex.syncStateTooltip`, after the camera and, with a fade, in the in-phase), faded in and out over `STATE_TOOLTIP_FADE_MS`; it is anchored at its cell also when the filter hides it (laid out at opacity 0 to measure), and closing it by hand clears it from the state. `simple` shows the title with the example's name (`.dwk-example-current`) and the content only; `marker` overrides the filter for that cell while open (`stateMarker` in `updateSvgElementVisibility`); `width` (share of the container inside `EDGE_MARGIN` on both sides) and `scale` (`--dwk-tooltip-scale`) size it, `position` places it (`positionInView` for center/top/bottom); away from its cell a line joins them unless `connector: false` (`createConnector` in `ui/tooltip.js`: an SVG under the popups, target kept in diagram coordinates, redrawn per frame while shown, faded with the popup, hidden while the popup covers the target). It is never taller than the diagram (a flex column: the title stays, the content scrolls); its text scale is capped relative to the container width, so a phone gets readable sizes; its code wraps, as in the mobile sheet. The wheel over any popup scrolls it instead of zooming. A change that closes or replaces it waits for its fade-out first (`closeHeldTooltip`), so it is gone before the camera moves. A camera tween to where the camera already is resolves at once (`samePlace`). Camera focus measures cells waiting for the in-phase too (`phases.incoming()`).
- **Visibility:**
  - A cell is hidden if its level is above the selected level, or if one of its topic tags is hidden. Hiding a parent hides the whole branch.
  - A tag in a group with `disableHelpIfHidden` also hides the cell's help.
  - A pin overrides tag and search filtering, but not a hide caused by level or by a group.
- **URL parameters** (`core/codec/url.ts`, `docs/url.md`): `v`, `filter-level`, `filter-hide-tags`, `only-tags`, `examples-only`, `filter-query`, `pins`, `highlight`, `focus`, `focus-mode`, `tooltip`, `annotations`, `menu`, `tags`, `debug`, `tag-picker-mode`, `svg`.
  - Commas are written unescaped with `history.replaceState`, and flags without `=`.
  - `tag-picker-mode` (Settings tab, `ui/tag-picker.js`) is not in `DiagramState`: bare = on, a list = the selection. Its actions change only tree-group topics, never levels or priorities.
  - `v` is written only after the user has moved the view, and is left out in the default view.
  - Unknown parameters are kept. The removed `constraint` and `runtime` parameters are treated as unknown.
  - `paramDocs()` feeds the URL tab. Add every new parameter there, with its `group`.
- **Storage keys:** `${storage.namespace}-theme` and `${storage.namespace}-about`. The namespace defaults to `id`; changing a diagram's `id` or namespace resets its readers' saved theme.
- **State** (`docs/state.md`): `DiagramState` has `version: 1`. `null` removes a key in deltas. The merge rules for `extend` are: objects merge deep, arrays and functions replace, `views` merge per key, and `null` removes. `definition.test.ts` covers these rules.
- **Slides:** `serialize("slide", { base })` and the `url-to-slide` CLI produce a `<section>` that holds only what differs from `base`. Round trips must be exact: `resolve(serialize(s, b), b) == s`, and url -> state -> slide -> state.
- **Camera constants** are named: `COVER_ZOOM` (`dom/camera.js`), `FIT_ALL_INSET` 20 and `OVERHANG_*` (`dom/camera-geometry.js`), `RESTORE_PADDING` (`dom/camera-url.js`), `PAN_STEP`/`PAN_STEP_LARGE` 0.15/0.5 (`ui/shortcuts.js`). The default `maxZoom` 4 is `DEFAULT_CAMERA` in `dom/instance.js`, overridable with `camera.maxZoom`. Read the design notes on the pan clamp in `dom/camera-geometry.js` before changing the clamp.
- **UI texts:** `DEFAULT_TEXTS` in `core/texts.ts`. Definitions override them through `content.texts`, and an unknown key throws.

## Reference behaviour

- `packages/diagram-webkit/test/golden/*.json` holds outputs of the original implementation for the inputs in `golden/inputs.mjs` (tags, help, HTML, URL codec). `golden.test.ts` replays them against `core/`. A deliberate change updates the JSON and says why next to the case (see the sanitizer samples: the original emitted text unescaped).
- Quirks kept on purpose:
  - A single Escape closes both a dialog and the panel.
  - Contain geometry is not clamped after a drag in fit-all.
  - A pin hidden by level alone reads "one or more required tags are filtered out".
- Leave the broad catch in `decodeAnnotations` (`core/annotations.ts`) as it is. A bad `annotations=` value from a shared link must not stop the page from loading.

## Presets and features

`core/presets.ts` defines two presets: `app` (full page: panel, URL sync, persistence, shortcuts, about, footer, link info, copy as slide, `annotations: "edit"`, `feedback: "page"`, all input incl. keyboard) and `embed` (tooltips, `annotations: "render"`, `feedback: "container"`, no input). Both have `resultLocate: "click"` (`"hover"` locates on hover/focus). `docs/features.md` lists every key and the six places where features can be overridden.

- Only `input.wheel`, `input.drag` and `input.pinch` can change after mount, through `setInput` or per-slide `data-diagram-features`. Any other key throws.

## Reveal (`src/reveal/`)

- `revealPlugin(definition, { transition: 600, fade: 400, instance: "shared" | "per-slide", baseState, features })`. It does not import reveal.js (it supports `^6` and 4.x).
- Slide attributes: `data-diagram-slot`, `data-diagram-view`, `data-diagram-state` (JSON), `data-diagram-state-url` (a pasted app URL where only the query is read), and `data-diagram-features`. A fragment carries a delta.
- State resolves as `definition.baseState` ⊕ deck base ⊕ view ⊕ URL ⊕ JSON. Each slide stands alone, and when going backwards the fragment stack is rebuilt.
- In shared mode, the instance lives on `.dwk-reveal-stage`, which is laid over the current slot so that it does not follow slide transitions. Slides without a slot fade the stage out. Print mode mounts one static instance per slot after `pdf-ready`.
- reveal.js 6 exposes `isPrintView()`, while its d.ts still says `isPrintingPDF()`. The plugin handles both.
- `?diagram-debug` shows the state overlay. Copy as slide in the app appears only with `?debug`.

## Standalone / local mode

- Local mode is on when neither `definition.source` nor `opts.source` names an SVG, for example with `mountApp(document.body)` and no definition.
- The reader opens a file, drops one, pastes a link, or uses `#svg=`: a link, or the SVG itself as raw-deflate + base64url.
- Every SVG in local mode is untrusted. `dom/svg-sanitize.js` removes scripts, handlers, `javascript:`, external references and CSS `url()`/`@import`.
- Nothing is sent anywhere except to a link the reader asks for, which is fetched with `credentials: omit` and `no-referrer`.
- `#svg=` link length (`EMBED_*` in `dom/embed-codec.js`): warnings at 32k and 100k chars, refusal above 2 MiB.
- `dom/standalone.js` holds the built-in definition. `PROJECT_URL` and `USER_GUIDE_URL` are in `core/version.ts`.

## Examples (`examples/`)

Each example is a separate project with its own `package.json`, `node_modules` and Vite config. Examples are not workspaces, never import `packages/*/src`, and depend on `file:../../packages/diagram-webkit`. The folder name encodes the dependency pattern, and `scripts/check-examples.mjs` enforces it:

| Folder | Depends on | Imports |
| --- | --- | --- |
| `direct--<name>` | `diagram-webkit` | `diagram-webkit` |
| `via--<name>--on-<base>` | the base example only | the base example (re-export) |
| `split--<name>--on-<base>` | `diagram-webkit` + the base example | `diagram-webkit` + `<base>/definition` |

- `direct--basic-diagram`: a small definition package with a full page. e2e uses it for app features. `example.svg` is saved from draw.io (File → Save as → SVG) and opens in draw.io for editing; there is no separate `.drawio` file.
- `via--revealjs--on-basic-diagram` / `split--revealjs--on-basic-diagram`: the same deck through the two dependency paths. They must give identical states.
- `direct--standalone-app`: no definition, built as a single offline `index.html` (Vite plugin `singleFile`).
- `direct--embed-minimal`: a hand-written SVG (no draw.io) embedded in a page with the `embed` preset.
- `via--custom-hooks--on-basic-diagram`: every definition hook (`parseHelp`, `tagLabel`, `renderAbout`, `renderFooter`).
- `via--multi-instance--on-basic-diagram`: three instances of one definition, one view each.

## Writing a diagram package

```js
// definition.js
import { defineDiagram } from "diagram-webkit";
import descriptions from "./config/tag-descriptions.generated.js";

export default defineDiagram({
  id: "my-diagram",
  requires: "^0.1.0",
  source: { production: new URL("./my-diagram.svg", import.meta.url).href },
  tags: { groups: [{ id: "general", label: "Tags", layout: "tree" }], descriptions },
  views: { overview: { title: "Overview", state: { camera: { fit: true } } } },
});
```

```sh
npx diagram-webkit validate my-diagram.svg --definition definition.js
npx diagram-webkit tag-tree METADATA.md --heading "Tag tree" --out config/tag-descriptions.generated.js
```

- Import only JS from a definition. `?raw` and CSS imports break when a consumer's Vite pre-bundles the package. Put CSS in `content.css` as a string, and generate a module for tag descriptions.
- Develop a diagram package against a local engine with `DIAGRAM_WEBKIT_DIR=<checkout>` (e.g. in the diagram project's `.envrc`). The Vite plugin (`diagramWebkit()` in its `vite.config.js`) then resolves `diagram-webkit` to the checkout's `src/`, so engine edits hot-reload, and runs the checkout's plugin hooks (`vite-plugin-core.js`, handed the project's Vite; never import `vite` there or in `definition-loader.js`); the CLI, the plugin and the definition load in Node use the checkout's `dist/` (`npm run build` there). Code: `src/tools/local-engine.js`; docs: `docs/development.md`.
- The SVG is fetched at runtime. A deck that uses a `link:`/`file:` package must add the package's real path to `server.fs.allow` (see `docs/tools.md`).
- Decks must pin a version of the diagram package and never load a mutable SVG URL such as `raw…/main`.

## Workflow

- When you change behaviour, update the matching `docs/*.md` in the same change. Keep docs short and code-first.
- Add or adjust tests at the right level: unit for `core/`, e2e `features`/`embed`/`reveal` for the runtime. Behaviour a reader can see belongs in `e2e/features` on `direct--basic-diagram`.
- Keep versions current. `requires` in definitions is checked against `VERSION`, which comes from `package.json`.
- Release:

  Automatic on push to `main` (`.github/workflows/release.yml`, `scripts/next-version.mjs`): when the package changed since the published version, CI runs, the next patch version is committed back (`[skip ci]`), published and tagged `v<x.y.z>`. Don't bump versions by hand; write `[minor]` or `[major]` in a commit message for a bigger bump. Never publish by hand. Keep `bin` paths without `./` (newer npm drops them). `repository` in the package's `package.json` must stay `github.com/diagram-webkit/diagram-webkit`, or the provenance check fails. Links in the root README are absolute: it is also the npm page.

- Open work:
  - Strip draw.io's `content` attributes (the embedded model, on the root and every cell; about half of a large SVG) in the Vite plugin build and before `#svg=` encoding. `diagram-webkit render` already does it for a published SVG.
  - Convert `dom/`, `ui/` and `adapters/` to strict TS once typescript-eslint supports TS 7, then switch ESLint to it and keep the restricted-globals rule for those folders. Type `ctx`, its state `s` and the services first (strict today: about 1,000 errors in the JS).
