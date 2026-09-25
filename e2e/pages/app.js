import { mountApp } from "diagram-webkit";
import definition from "../../examples/direct--basic-diagram/definition.js";

// ?locate=hover: features.resultLocate "hover" (default "click").
const locate = new URLSearchParams(location.search).get("locate");
mountApp(document.body, definition, locate ? { features: { resultLocate: locate } } : undefined).then(
  (instance) => {
    window.instance = instance;
    document.body.dataset.ready = "true";
  },
  (error) => {
    document.body.dataset.error = String(error && error.stack ? error.stack : error);
  },
);
