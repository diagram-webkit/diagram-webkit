import { defineDiagram, mountDiagram } from "diagram-webkit";

const definition = defineDiagram({ id: "line-overlays", source: { production: new URL("./line-overlays.svg", import.meta.url).href } });
mountDiagram(document.getElementById("mount"), definition, { features: "embed" }).then(
  (instance) => {
    window.instance = instance;
    window.mountDiagram = mountDiagram;
    window.definition = definition;
    document.body.dataset.ready = "true";
  },
  (error) => {
    document.body.dataset.error = String(error && error.stack ? error.stack : error);
  },
);
