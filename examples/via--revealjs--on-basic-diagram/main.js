import Reveal from "reveal.js";
import RevealNotes from "reveal.js/plugin/notes";
import "reveal.js/reveal.css";
import "reveal.js/theme/white.css";
import { revealPlugin } from "example-direct--basic-diagram";
import deck from "./diagram.js";

const plugin = revealPlugin(deck, { transition: 600 });
const reveal = new Reveal({ hash: true, width: 1280, height: 720, plugins: [plugin, RevealNotes] });
window.diagramPlugin = plugin;
window.deck = reveal;
reveal.initialize().then(() => {
  document.body.dataset.ready = "true";
});
