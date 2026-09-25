// The standalone app: what mountApp(document.body) gets with no definition.
import { defineDiagram } from "../core/definition";
import { escapeHTML } from "../core/html";
import { PROJECT_URL, USER_GUIDE_URL, VERSION } from "../core/version";

export { PROJECT_URL, USER_GUIDE_URL };

// The standalone app's id. A definition with this id is the project's own app
// (standaloneDefinition().extend(...)), and the help dialog says so.
export const STANDALONE_ID = "diagram-webkit";

// Sites built on diagram-webkit, for "Used by" in the standalone About.
export const USED_BY = Object.freeze([
  { label: "Kubernetes security diagram", href: "https://kubesec-diagram.github.io/", note: "where security happens in a Kubernetes cluster" },
]);

const link = (href, text) => `<a href="${escapeHTML(href)}" target="_blank" rel="noopener">${escapeHTML(text)}</a>`;

const ABOUT = `<p>Open a draw.io SVG and explore it: search its help text, filter by tags and detail level, pin and highlight parts, add notes, and share exactly what you see as a link.</p>
<h4>Privacy</h4>
<p>Nothing leaves this browser. The diagram is never uploaded or sent to a server. A link with the diagram inside carries it after <code>#</code>, the part of an address browsers never send. The only request this page makes is to a link you ask it to open.</p>
<h4>Documentation</h4>
<p>How to use it, and how to prepare your own draw.io diagram with tags, levels and help text: ${link(USER_GUIDE_URL, "the user guide")}.</p>
<h4>Used by</h4>
<ul class="about-list">${USED_BY.map((site) => `<li>${link(site.href, site.label)} - ${escapeHTML(site.note)}</li>`).join("")}</ul>`;

let definition = null;

export function standaloneDefinition() {
  definition ??= defineDiagram({
    id: STANDALONE_ID,
    content: {
      page: { title: "diagram-webkit", description: "Interactive draw.io diagrams in the browser." },
      about: ABOUT,
      license: "MIT",
      repository: PROJECT_URL,
      // The same shape as other sites' footers: GitHub (issues) star.
      footer: {
        links: [
          { label: "GitHub", href: PROJECT_URL, title: "diagram-webkit on GitHub" },
          { label: "issues", href: `${PROJECT_URL}/issues`, paren: true },
          { label: "⭐", href: `${PROJECT_URL}/stargazers`, title: "Star this project" },
        ],
        version: `v${VERSION}`,
      },
      texts: { diagramLabel: "Diagram" },
    },
  });
  return definition;
}
