import { defineDiagramElement } from "diagram-webkit";
import definition from "../../examples/direct--basic-diagram/definition.js";

window.errors = [];
defineDiagramElement("basic-diagram", definition, { features: "embed" });
defineDiagramElement("basic-diagram-app", definition, { features: { preset: "app", urlSync: false, persistence: false, about: false } });
document.querySelectorAll("basic-diagram, basic-diagram-app").forEach((element) => {
  element.addEventListener("diagram-error", (event) => window.errors.push(String(event.detail)));
});

async function ready(element) {
  while (!element.instance) await new Promise((resolve) => setTimeout(resolve, 20));
  await element.instance.ready;
}

Promise.all([...document.querySelectorAll("basic-diagram, basic-diagram-app")].map(ready)).then(
  () => {
    document.body.dataset.ready = "true";
  },
  (error) => {
    document.body.dataset.error = String(error && error.stack ? error.stack : error);
  },
);
