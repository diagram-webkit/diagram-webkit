import basic, { escapeHTML } from "example-direct--basic-diagram";

// The body of each help text as a list, one item per line.
function parseHelp(raw) {
  const [title, ...lines] = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!title) return null;
  const items = lines.map((line) => `<li>${escapeHTML(line)}</li>`).join("");
  return { title, bodyHtml: items ? `<ul>${items}</ul>` : "", searchText: [title, ...lines].join("\n").toLowerCase() };
}

export default basic.extend({
  id: "custom-hooks",
  hooks: {
    parseHelp,
    tagLabel: (tag, meta) => (meta.label !== tag ? meta.label : tag.split(".").at(-1)),
    renderAbout: (html) => `${html}<p class="custom-about-note">Rendered by the renderAbout hook.</p>`,
    renderFooter: ({ links, version }) =>
      `<span class="custom-footer">${links.map((link) => `<a href="${escapeHTML(link.href)}">${escapeHTML(link.label)}</a>`).join(" · ")} · ${escapeHTML(version)}</span>`,
  },
});
