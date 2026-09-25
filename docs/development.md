# Development

## Layout

```
packages/diagram-webkit/
  src/core/       pure TS, no DOM (lib ES2024): definition, state, codecs, tags, validate
  src/dom/        instance, camera, loader, filter, overlays (JS, checkJs)
  src/ui/         app chrome: panel, tag tree, modals, styles/*.css (JS, checkJs)
  src/adapters/   storage, URL sync
  src/reveal/     reveal.js plugin (TS)
  src/tools/      CLI, Vite plugin, Node helpers (JS, shipped as source)
  test/           vitest (node; happy-dom where a DOM is needed); golden/ = reference outputs
examples/
  direct--basic-diagram/               definition package + full page (e2e: 4101)
  via--revealjs--on-basic-diagram/     deck importing the definition package; every slide attribute,
                                       incl. data-diagram-state-url (#/from-url)
  split--revealjs--on-basic-diagram/   same deck, importing diagram-webkit/reveal directly
  direct--standalone-app/              no definition: local mode, built as one offline index.html
e2e/{embed,features,reveal}/           Playwright against the examples
scripts/                               check-examples
```

## Commands

```sh
npm ci
npm run build              # dist/ (vite lib build + d.ts)
npm run lint               # eslint (JS only; typescript-eslint does not support TS 7)
npm run typecheck          # tsconfig.json + tsconfig.core.json (no DOM) + tsconfig.js.json (checkJs)
npm test                   # vitest unit
npm run examples:install
npm run check-examples     # examples build and validate
npx playwright install chromium
npm run e2e                # features, embed, reveal projects
npm run standalone         # the standalone app (no diagram defined) on a dev server
npm run standalone:build   # it as one offline file: examples/direct--standalone-app/dist/index.html
```

Single runs:

```sh
npx vitest run test/codec.test.ts                        # in packages/diagram-webkit
npx playwright test e2e/reveal/deck.spec.ts -g "fragment"
```

e2e ports: 4100 pages, 4101 app, 4102 via deck, 4103 split deck (`PORTS` in `playwright.config.ts`).

## Rules

- `core/` must not touch the DOM; `tsconfig.core.json` has no DOM lib.
- All instance state in `ctx.s`; all listeners on the instance `AbortController` signal; timers through `ctx.timers` (cleared on destroy).
- Client px -> layout px through `getScale()` (the root may be CSS-scaled, e.g. in Reveal).
- CSS: wrap selectors in `:where(.dwk-root)`, use `@container dwk (...)`, not media queries. The root has `contain: layout` so fixed overlays stay inside.
- Definitions are data. Behaviour goes in the engine behind a definition field or feature flag.
- `test/golden/`: outputs of the original implementation for fixed inputs. A deliberate change of behaviour updates the JSON and says why in the test.

## Developing a diagram against a local checkout

Set `DIAGRAM_WEBKIT_DIR` (repo root or `packages/diagram-webkit`) in the diagram project, e.g. in its `.envrc`:

```sh
export DIAGRAM_WEBKIT_DIR=../diagram-webkit
npm run dev        # "diagram-webkit: local engine …"; engine edits hot-reload
npm run build      # built against the checkout
npm run validate   # the checkout's CLI
```

- The Vite plugin (`diagramWebkit()` in the project's `vite.config.js`) resolves `diagram-webkit`, `/core` and `/reveal` to the checkout's `src/`. No build needed for browser code.
- Node code uses the checkout's `dist/`: the CLI and the definition load for `<head>`. Run `npm run build` here after changing `core/` or `tools/`.
- The installed package stays in the project's `package.json`; unset the variable to go back to it.
- A deck that depends on a diagram package works the same way when its `vite.config.js` has `diagramWebkit()`: the alias covers every import of `diagram-webkit`, including the ones inside the diagram package.

## Release

```sh
npm version <x.y.z> -w diagram-webkit
npm run build && npm publish -w diagram-webkit
```

`VERSION` comes from `package.json`; `requires` in definitions is checked against it.
