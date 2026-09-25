import { mountApp } from "diagram-webkit";
import definition from "../../examples/direct--basic-diagram/definition.js";

mountApp(document.body, definition).then(
  (instance) => {
    window.instance = instance;
    document.body.dataset.ready = "true";
  },
  (error) => {
    document.body.dataset.error = String(error && error.stack ? error.stack : error);
  },
);
