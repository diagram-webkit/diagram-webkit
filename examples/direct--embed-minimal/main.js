import { defineDiagram, mountDiagram } from "diagram-webkit";

const definition = defineDiagram({
  id: "embed-minimal",
  source: { production: new URL("./diagram.svg", import.meta.url).href },
  features: "embed",
});

window.diagram = await mountDiagram(document.getElementById("diagram"), definition, { initialState: { view: { camera: { fit: true } } } });
document.body.dataset.ready = "true";
