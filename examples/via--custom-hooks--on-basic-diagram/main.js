import { mountApp } from "example-direct--basic-diagram";
import definition from "./diagram.js";

window.diagram = await mountApp(document.body, definition);
document.body.dataset.ready = "true";
