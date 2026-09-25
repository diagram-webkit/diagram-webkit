# Features

## Structure and presets

Every key, with both presets written out. Source: `PRESETS` in `src/core/presets.ts`.

```js
// preset "app": full page
{
  panel: true,              // filter/search/tag-tree panel
  urlSync: true,            // read URL params on load, write them back (url.md)
  persistence: true,        // localStorage under definition.storage.namespace (default: id)
  shortcuts: true,          // "?" key and the help dialog's Controls tab, "/" focus search
  about: true,              // the help dialog's About tab (content.about); opens on a bare first visit
  footer: true,             // footer (content.footer)
  linkInfo: true,           // the help dialog's Share and URL parameters tabs
  annotations: "edit",      // "edit" | "render" | false
  tooltips: true,           // data-help tooltips
  copySlide: true,          // "copy as slide" on the Share tab (reveal <section> snippet); shown only with ?debug
  feedback: "page",         // error/toast placement: "page" | "container" | false
  input: {
    wheel: true,            // wheel / trackpad zoom
    drag: true,             // mouse drag pan
    pinch: true,            // touch pan and pinch zoom
    keyboard: true,         // arrows pan (shift: larger), + / - zoom, 0 fit
  },
}

// preset "embed": in a page or a slide
{
  panel: false,
  urlSync: false,
  persistence: false,
  shortcuts: false,
  about: false,
  footer: false,
  linkInfo: false,
  annotations: "render",
  tooltips: true,
  copySlide: false,
  feedback: "container",
  input: { wheel: false, drag: false, pinch: false, keyboard: false },
}
```

```js
import { PRESETS, resolveFeatures } from "diagram-webkit";
PRESETS.embed;                                   // the object above, frozen
resolveFeatures({ preset: "embed", input: { wheel: true } }); // the resolved result
definition.features;                             // what a definition resolved to
```

## Writing a spec

```js
features: "embed"                                        // a preset as is
features: { preset: "embed", input: { wheel: true } }    // preset + overrides
features: { input: { wheel: false } }                    // overrides on what is inherited (below)
```

- Only the keys you write change. `input` merges per key, so `input: { wheel: false }` keeps `drag`, `pinch` and `keyboard`.
- Without `preset`, the base is whatever is inherited: `app` in `defineDiagram`, the base definition's features in `extend`, the definition's features in `mountDiagram`/`mountApp`/`revealPlugin`.
- With `preset`, the inherited value is ignored and the preset is the base.
- Unknown keys and wrong values throw: `definition.features.input.whel: unknown input; known: wheel, drag, pinch, keyboard`.

## Where to override

Later wins. Example: turn off wheel zoom and keep everything else.

```js
// 1. The definition (every consumer gets it)
export default defineDiagram({
  id: "my-diagram",
  features: { input: { wheel: false } },          // app, without wheel zoom
});
```

```js
// 2. A variant of it (a deck, an embed build)
export default base.extend({
  features: { input: { wheel: false } },          // base's features, without wheel zoom
});
export default base.extend({
  features: { preset: "embed", input: { drag: true } }, // embed, but draggable
});
```

```js
// 3. One mount
await mountApp(document.body, definition, { features: { input: { wheel: false } } });
await mountDiagram(element, definition, { features: { preset: "embed", tooltips: false } });
```

```js
// 4. A reveal deck (every slide)
revealPlugin(definition, { features: { input: { wheel: false } } });
```

```html
<!-- 5. One slide (input.wheel / drag / pinch only; back to the deck's value on the next slide) -->
<section data-diagram-features='{"input":{"wheel":true,"drag":true}}'>
  <div data-diagram-slot data-prevent-swipe></div>
</section>
```

```js
// 6. At runtime (wheel / drag / pinch only)
diagram.setInput({ wheel: false });
```

Keys other than `wheel`, `drag`, `pinch` are set up once at mount. Changing them per slide or with `setInput` throws. Mount again with other features instead.
