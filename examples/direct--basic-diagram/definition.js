import { defineDiagram } from "diagram-webkit";
import views from "./views.json" with { type: "json" };

export default defineDiagram({
  id: "basic-diagram",
  requires: "^0.1.0",
  source: { production: new URL("./example.svg", import.meta.url).href },
  tags: {
    groups: [
      { id: "priority", label: "Priority", order: 1 },
      { id: "general", label: "Tags", order: 10, disableHelpIfHidden: true, layout: "tree" },
    ],
    meta: {
      "pri-1": {
        label: "Priority 1",
        group: "priority",
        order: 1,
        style: { background: "#FF7A7A", color: "#5B1010", borderColor: "#7A1414", borderWidth: "3px", fontWeight: "700" },
        panelStyle: { borderColor: "#7A1414", borderWidth: "3px", boxShadow: "inset 0 0 0 1px rgba(122, 20, 20, 0.40)" },
      },
      info: {
        label: "Info",
        group: "priority",
        order: 4,
        style: { background: "#DFF4FF", color: "#0A3D5A", borderColor: "#0B6FA4", borderWidth: "3px", fontWeight: "700" },
        panelStyle: { borderColor: "#0B6FA4", borderWidth: "3px", boxShadow: "inset 0 0 0 1px rgba(11, 111, 164, 0.42)" },
      },
    },
    descriptions: {
      Network: "traffic into the web app",
      "Network.Ingress": "requests from users through the load balancer",
      Data: "stored state",
      "Data.Cache": "read-through cache",
      Observability: "logs",
    },
  },
  content: {
    page: { title: "Basic diagram", description: "Example diagram for diagram-webkit." },
    about: "<p>A small web service: a load balancer, a web app, a database and a cache.</p>",
    footer: { links: [{ label: "diagram-webkit", href: "https://github.com/diagram-webkit/diagram-webkit" }], version: "v0.1.0" },
    texts: { diagramLabel: "Basic web service diagram", aboutTitle: "Basic diagram" },
  },
  views: views.views,
});
