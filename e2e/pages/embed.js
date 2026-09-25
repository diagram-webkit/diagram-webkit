import { mountDiagram } from "diagram-webkit";
import definition from "../../examples/direct--basic-diagram/definition.js";

const params = new URLSearchParams(window.location.search);
const layout = params.get("layout") || "two";
const input = params.get("input") === "on";
const mount = document.getElementById("mount");

function slot(className = "slot") {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

async function start() {
  const features = input ? { preset: "embed", input: { wheel: true, drag: true, pinch: true } } : "embed";
  const containers = [];
  if (layout === "scaled" || layout === "zoomed") {
    const outer = document.createElement("div");
    outer.className = layout;
    const inner = slot();
    outer.appendChild(inner);
    mount.appendChild(outer);
    containers.push(inner);
  } else if (layout === "single") {
    containers.push(slot());
    containers.forEach((container) => mount.appendChild(container));
  } else if (layout !== "none") {
    containers.push(slot(), slot("slot small"));
    containers.forEach((container) => mount.appendChild(container));
  }
  window.instances = await Promise.all(containers.map((container) => mountDiagram(container, definition, { features })));
  window.mountDiagram = mountDiagram;
  window.definition = definition;
  document.body.dataset.ready = "true";
}

start().catch((error) => {
  document.body.dataset.error = String(error && error.stack ? error.stack : error);
  throw error;
});
