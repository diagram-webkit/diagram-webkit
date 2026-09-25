// No definition: the standalone app, where the reader brings the diagram.
// ?extended: a site built on it with standaloneDefinition().extend().
import { mountApp, mountDiagram, standaloneDefinition } from "diagram-webkit";

window.mountDiagram = mountDiagram;
const params = new URLSearchParams(location.search);
const definition = params.has("extended")
  ? standaloneDefinition().extend({ tags: { meta: { "pri-1": { label: "Critical", group: "priority", order: 1 } } } })
  : undefined;
if (!params.has("manual")) {
  mountApp(document.body, definition).then(
    (instance) => {
      window.diagram = instance;
      document.body.dataset.ready = "true";
    },
    (error) => {
      document.body.dataset.error = String(error && error.stack ? error.stack : error);
    },
  );
}
