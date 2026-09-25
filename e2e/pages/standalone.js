// No definition: the standalone app, where the reader brings the diagram.
import { mountApp, mountDiagram } from "diagram-webkit";

window.mountDiagram = mountDiagram;
if (!new URLSearchParams(location.search).has("manual")) {
  mountApp(document.body).then(
    (instance) => {
      window.diagram = instance;
      document.body.dataset.ready = "true";
    },
    (error) => {
      document.body.dataset.error = String(error && error.stack ? error.stack : error);
    },
  );
}
