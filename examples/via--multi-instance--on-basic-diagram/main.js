import basic, { mountDiagram } from "example-direct--basic-diagram";

// Independent instances of one definition: each has its own state, camera
// and theme. Drag and wheel are on; the page still scrolls outside them.
const definition = basic.extend({ features: { preset: "embed", input: { wheel: true, drag: true, pinch: true } } });
const slots = Array.from(document.querySelectorAll("[data-view]"));

window.instances = await Promise.all(
  slots.map((slot) => mountDiagram(slot, definition, { initialState: { view: definition.views[slot.dataset.view].state } })),
);
document.body.dataset.ready = "true";
