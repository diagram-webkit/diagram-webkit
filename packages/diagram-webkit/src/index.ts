export * from "./core/index";
export { mountDiagram } from "./dom/instance.js";
export { mountApp } from "./ui/mount-app.js";
export { standaloneDefinition } from "./dom/standalone.js";
export { defineDiagramElement, ELEMENT_ATTRS, ELEMENT_ERROR_EVENT } from "./dom/element.js";
export type { DiagramElement, DiagramInstance, MountOptions, SetStateOptions, TagInfo, DiagramEvents } from "./types";
