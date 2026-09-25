# reveal.js

`revealPlugin` does not import reveal.js; the deck brings its own (`^6`, 4.x also works).

## Setup

```sh
npm i reveal.js my-diagram vite
```

```js
// diagram.js: the deck's variant of the diagram
import base from "my-diagram";

export default base.extend({
  features: "embed",
  baseState: { camera: { fit: true } },       // deck-wide starting view
  views: {                                    // named views, used by data-diagram-view
    ingress: { state: { camera: { focus: { tags: ["Network.Ingress"] }, padding: 0.2 } } },
  },
});
```

```js
// main.js
import Reveal from "reveal.js";
import "reveal.js/reveal.css";
import "reveal.js/theme/white.css";
import { revealPlugin } from "my-diagram";
import diagram from "./diagram.js";

const plugin = revealPlugin(diagram, {
  transition: 600,        // ms camera move between slides/fragments; false = jump. Default 600
  fade: 400,              // ms per phase: out (leaving cells, old highlight), then in. false = engine default. Default 400
  instance: "shared",     // "shared": one instance on a stage laid over the current slot (default)
                          // "per-slide": one instance inside each slot (more memory; fades with its slide)
  baseState: {},          // merged over definition.baseState
  features: undefined,    // override definition.features, e.g. { input: { wheel: false } } (features.md)
});

new Reveal({ hash: true, width: 1280, height: 720, plugins: [plugin] }).initialize();
```

```css
.reveal [data-diagram-slot] { width: 100%; height: 520px; } /* the slot must have a size */
```

## Slides

A slide shows the diagram when it has a `[data-diagram-slot]`. Slides without one fade it out (with the slide's own `data-transition`/speed) and suspend it.

In shared mode the diagram is not inside the slot. It sits on `.reveal .slides > .dwk-reveal-stage`, positioned over the current slot, above the slides (z-index 12). Slide transitions therefore never hide it between two diagram slides. Only its state moves.

```css
/* Style the diagram through .reveal .dwk-root, not through the slide or slot. */
.reveal .dwk-root .dwk-main-image { background: #fff; }
/* Content meant to sit on top of the diagram must be above the stage. */
.reveal .my-overlay { position: relative; z-index: 13; }
```

```html
<!-- Deck-wide base, on .reveal. Merged over definition.baseState and options.baseState. -->
<div class="reveal" data-diagram-base='{"level":1}'>
  <div class="slides">

    <!-- Named view from definition.views -->
    <section data-diagram-view="overview">
      <div data-diagram-slot data-prevent-swipe></div>
    </section>

    <!-- Inline state (a delta over base + view) -->
    <section data-diagram-state='{"onlyTags":["Data"],"camera":{"focus":{"slugs":["Cache"]},"padding":0.3}}'>
      <div data-diagram-slot data-prevent-swipe></div>
    </section>

    <!-- A page URL pasted as is (see "State from a URL") -->
    <section data-diagram-state-url="https://example.org/diagram/?v=0.42,0.31,0.25,0.2&pins=LoadBalancer&filter-level=2">
      <div data-diagram-slot data-prevent-swipe></div>
    </section>

    <!-- View + delta; null removes a key inherited from base/view -->
    <section data-diagram-view="data" data-diagram-state='{"pins":["DbAccess"],"highlight":null}'>
      <div data-diagram-slot data-prevent-swipe></div>
    </section>

    <!-- Fragments: each visible fragment's delta is applied in fragment order -->
    <section data-diagram-state='{"camera":{"fit":true}}'>
      <div data-diagram-slot data-prevent-swipe></div>
      <p class="fragment" data-diagram-state='{"pins":["LoadBalancer"]}'>TLS at the LB</p>
      <p class="fragment" data-diagram-state='{"highlight":{"slugs":["WebApp"],"mode":"outline"}}'>Stateless</p>
      <p class="fragment" data-diagram-state='{"camera":{"focus":{"slugs":["Cache"]}}}'>Cache</p>
      <p class="fragment" data-diagram-state-url="?only-tags=Data&v=fit">Data only</p>
    </section>

    <!-- Per-slide input: wheel, drag, pinch only (features.md) -->
    <section data-diagram-view="overview" data-diagram-features='{"input":{"wheel":true,"drag":true,"pinch":true}}'>
      <div data-diagram-slot data-prevent-swipe></div>
    </section>

    <!-- No slot: diagram suspended -->
    <section><h2>Text only</h2></section>
  </div>
</div>
```

Resolution, rebuilt from scratch on every slide/fragment change, so backwards and jumps are exact:

```
definition.baseState ⊕ options.baseState ⊕ data-diagram-base
  ⊕ views[data-diagram-view].state
  ⊕ data-diagram-state-url
  ⊕ data-diagram-state
  ⊕ visible fragments' data-diagram-state-url, then data-diagram-state
    (by data-fragment-index, then DOM order)
```

A slide replaces the whole state; nothing leaks from the previous slide. State keys: [state.md](state.md).

## State from a URL

Set up the view in the full-page diagram, copy the address bar, paste it into `data-diagram-state-url`.

```html
<section data-diagram-state-url="https://example.org/diagram/?v=0.4,0.6,0.3,0.2&pins=LoadBalancer&menu=true#top">
<!--                              ignored ^^^^^^^^^^^^^^^^^^^^  read ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ignored -->
```

- Only the query is read: after `?`, before `#`. A bare `v=...&pins=...` works too.
- Parameters it does not know (`utm_*`, anything else) and UI-only ones (`menu`, `tags`) are ignored; so are malformed values.
- It is a delta like `data-diagram-state`: a parameter that is not in the URL keeps the value from the deck base or view. The app leaves defaults out of its URLs (`filter-level` at max, no `filter-hide-tags` when nothing is hidden), so clear an inherited value with JSON on the same slide:

```html
<!-- URL for the camera and pins; JSON drops the level and hidden tags the deck base sets -->
<section data-diagram-state-url="https://example.org/?v=fit&pins=WebApp" data-diagram-state='{"level":null,"hiddenTags":null}'>
```

Parameters: [url.md](url.md). `&` can stay as is in the attribute.

## Smooth steps

The diagram stays on screen between diagram slides whatever their transition. Only the slide's own content (titles, text) uses Reveal's transition, so `none` between diagram steps keeps the text crisp:

```html
<section data-diagram-view="a" data-transition="none" data-background-transition="none">...</section>
<section data-diagram-view="b" data-transition="none" data-background-transition="none">...</section>
```

```css
/* Fade in the slide's text, since the slide itself swaps instantly. */
@media (prefers-reduced-motion: no-preference) {
  .reveal .slides section.present h2 { animation: step-in 0.4s ease; }
}
@keyframes step-in { from { opacity: 0; } }
```

## Authoring a slide from the live diagram

```
http://localhost:5173/?diagram-debug#/my-slide
```

Shows the live state and a "Copy as slide" button: a `<section>` with `data-diagram-state` relative to the deck base.

From the full-page diagram: copy its URL into `data-diagram-state-url` (see "State from a URL"; example: `#/from-url` in `examples/via--revealjs--on-basic-diagram`), or convert it to JSON:

```sh
npx diagram-webkit url-to-slide "https://example.org/?v=0.5,0.4,0.3,0.3&only-tags=Data" \
  --definition diagram.js --title "Data layer"
```

## Print / PDF

`?print-pdf` works as usual: after Reveal's `pdf-ready`, every slot (and fragment step) gets its own static instance. `.reveal` gets `data-diagram-print-ready="true"` when all are loaded; wait for it before printing headless.

```js
await page.goto("http://localhost:5173/?print-pdf");
await page.waitForSelector('.reveal[data-diagram-print-ready="true"]');
await page.pdf({ path: "deck.pdf", width: "1280px", height: "720px" });
```

## Plugin API

```js
plugin.instances();  // DiagramInstance[] (one when shared)
plugin.lastError();  // last Error from a slide update, or null (also console.error'd)
plugin.destroy();    // Reveal calls this
```

Errors never blank the deck. They show as a red box over the slot with the details, are logged (`console.error`) and kept in `lastError()`; the deck keeps going and the box goes on the next slide that works:

- invalid slide JSON or an unknown view: `diagram-webkit reveal: #my-slide: data-diagram-view="x": unknown view; known: ...`, over the last good state
- invalid `data-diagram-base`: the definition/options base is used instead
- the diagram failing to load: the instance's own error, or the box
- print: a broken slide gets the box in its slot and does not hold up `data-diagram-print-ready`
