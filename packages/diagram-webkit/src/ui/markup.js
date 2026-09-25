// The app chrome: scoped classes instead of ids (and per-instance ids where
// a label needs one).
import { escapeHTML } from "../core/html";
import { PROJECT_URL, USER_GUIDE_URL } from "../core/version";

const RESET_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 7l5 5V9c3.31 0 6 2.69 6 6a6 6 0 0 1-6 6 6 6 0 0 1-5.65-4H4.26A8 8 0 0 0 12 23a8 8 0 0 0 0-16z"></path></svg>';
const SUN_OUTLINE =
  '<svg class="theme-icon theme-icon-sun-outline" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6zM11 1h2v3h-2V1zm0 19h2v3h-2v-3zM1 11h3v2H1v-2zm19 0h3v2h-3v-2zM4.22 5.64l1.42-1.42 2.12 2.12-1.42 1.42-2.12-2.12zm12.02 12.02 1.42-1.42 2.12 2.12-1.42 1.42-2.12-2.12zM16.24 6.34l2.12-2.12 1.42 1.42-2.12 2.12-1.42-1.42zM4.22 18.36l2.12-2.12 1.42 1.42-2.12 2.12-1.42-1.42z"></path></svg>';
const SUN_FILLED =
  '<svg class="theme-icon theme-icon-sun-filled" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a1 1 0 0 1 1 1v1.2a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1zm0 11.8a1 1 0 0 1 1 1V19a1 1 0 1 1-2 0v-1.2a1 1 0 0 1 1-1zM5 12a1 1 0 0 1 1-1h1.2a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1zm11.8 0a1 1 0 0 1 1-1H19a1 1 0 1 1 0 2h-1.2a1 1 0 0 1-1-1zM7.05 7.05a1 1 0 0 1 1.41 0l.85.85a1 1 0 1 1-1.41 1.41l-.85-.85a1 1 0 0 1 0-1.41zm7.79 7.79a1 1 0 0 1 1.41 0l.85.85a1 1 0 0 1-1.41 1.41l-.85-.85a1 1 0 0 1 0-1.41zM16.95 7.05a1 1 0 0 1 0 1.41l-.85.85a1 1 0 0 1-1.41-1.41l.85-.85a1 1 0 0 1 1.41 0zM9.16 14.84a1 1 0 0 1 0 1.41l-.85.85a1 1 0 1 1-1.41-1.41l.85-.85a1 1 0 0 1 1.41 0zM12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z"></path></svg>';
const MENU_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v2H4V7zm0 4h16v2H4v-2zm0 4h16v2H4v-2z"></path></svg>';

// class="dwk-<name> <extra>" id="<prefix>-<name>"
function named(prefix, name, extra = "") {
  return `class="dwk-${name}${extra ? ` ${extra}` : ""}" id="${prefix}-${name}"`;
}

export function panelMarkup(prefix, t, { annotationsEditor }) {
  const annotationsRow = annotationsEditor
    ? `<div class="user-annotations-row">
        <button type="button" ${named(prefix, "toggle-user-annotations", "user-annotations-btn")} title="${escapeHTML(t.userAnnotationsTitle)}">${escapeHTML(t.userAnnotations)}</button>
        <button type="button" ${named(prefix, "exit-edit-mode", "exit-edit-mode-btn")} title="${escapeHTML(t.exitEditTitle)}" style="display: none">${escapeHTML(t.exitEdit)}</button>
      </div>`
    : "";
  return `
<div ${named(prefix, "filter-panel-backdrop", "filter-panel-backdrop")}></div>
<aside ${named(prefix, "filter-panel", "filter-panel")} aria-hidden="true">
  <div class="filter-panel-header"></div>
  <div class="filter-panel-body">
    <div class="filter-section">
      <div class="filter-search-row">
        <input ${named(prefix, "filter-search-input")} type="search" placeholder="${escapeHTML(t.searchPlaceholder)}" autocomplete="off" aria-label="${escapeHTML(t.searchLabel)}" />
        <button ${named(prefix, "filter-reset-btn", "filter-icon-btn")} type="button" aria-label="${escapeHTML(t.resetFilters)}" title="${escapeHTML(t.resetFilters)}">${RESET_ICON}</button>
      </div>
      <small ${named(prefix, "filter-result-count")}>${escapeHTML(t.resultCountInitial)}</small>
    </div>
    <hr class="filter-divider" />
    <div class="filter-section"><div ${named(prefix, "filter-tag-controls", "tag-control-group")}></div></div>
    <hr class="filter-divider" />
    <div class="filter-section"><div ${named(prefix, "filter-results", "filter-results")}></div></div>
  </div>
  <div class="filter-panel-controls">
    <div class="filter-panel-controls-row">
      <button ${named(prefix, "floating-theme-toggle", "panel-control-btn")} type="button" aria-label="${escapeHTML(t.themeToggle)}" title="${escapeHTML(t.themeToggle)}">${SUN_OUTLINE}${SUN_FILLED}<span class="theme-label">${escapeHTML(t.themeDark)}</span></button>
      ${annotationsRow}
      <button ${named(prefix, "close-filter-panel", "close-button close-filter-panel-btn")} type="button" aria-label="${escapeHTML(t.closePanel)}">&times;</button>
    </div>
  </div>
</aside>
<button ${named(prefix, "floating-filter-toggle", "floating-filter-toggle")} type="button" aria-label="${escapeHTML(t.openPanel)}" title="${escapeHTML(t.openPanel)}">${MENU_ICON}</button>`;
}

export function footerMarkup(prefix, t, footer, { help, renderFooter }) {
  const links = renderFooter
    ? renderFooter(footer)
    : footer.links
        .map((link) => {
          const title = link.title ? ` title="${escapeHTML(link.title)}"` : "";
          // A symbol (the star) is an icon, not a text link: no underline.
          const icon = /[\p{L}\p{N}]/u.test(link.label) ? "" : ' class="footer-icon-link"';
          const anchor = `<a href="${escapeHTML(link.href)}" target="_blank"${icon}${title}>${escapeHTML(link.label)}</a>`;
          return link.paren ? `(${anchor})` : anchor;
        })
        .join(" ");
  const aboutButton = help
    ? `<button ${named(prefix, "help-toggle", "footer-help-btn")} type="button" aria-label="${escapeHTML(t.helpButton)}" title="${escapeHTML(t.helpButton)}">?</button>`
    : "";
  // One line: the links, then "?" (the version is in the help dialog).
  const row = `${links}${aboutButton}`;
  return `<div class="footer-link">${row ? `<div class="footer-github">${row}</div>` : ""}</div>`;
}

function modal(prefix, name, closeName, title, body, contentClass = "") {
  return `
<div ${named(prefix, name, "modal")} style="display: none">
  <div class="modal-content${contentClass ? ` ${contentClass}` : ""}">
    <div class="modal-header"><h3>${escapeHTML(title)}</h3><button type="button" ${named(prefix, closeName, "close-button")}>&times;</button></div>
    <div class="modal-body">${body}</div>
  </div>
</div>`;
}

// The one help dialog: a tab per topic, only the ones that apply.
// tabs: ordered subset of HELP_TABS.
export const HELP_TABS = Object.freeze(["open", "about", "links", "url", "shortcuts"]);

// The About tab: name and description, the definition's own text, then the
// facts that apply.
// about: { name, description, html, version, license, maintainer, repository, builtWith }
export function aboutMarkup(t, about) {
  const out = (href, text) => `<a href="${escapeHTML(href)}" target="_blank" rel="noopener">${escapeHTML(text)}</a>`;
  const repoLabel = (href) => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const facts = [
    about.version && [t.aboutVersion, escapeHTML(about.version)],
    about.license && [t.aboutLicense, escapeHTML(about.license)],
    about.maintainer && [t.aboutMaintainer, escapeHTML(about.maintainer)],
    about.repository && [t.aboutSource, `${out(about.repository, repoLabel(about.repository))}<br>${out(`${about.repository}/issues`, t.aboutIssues)}`],
    about.builtWith && [t.aboutBuiltWith, `${out(PROJECT_URL, "diagram-webkit")} v${escapeHTML(about.builtWith)}`],
  ].filter(Boolean);
  const header = `<header class="about-header"><h3 class="about-name">${escapeHTML(about.name)}</h3>${about.description ? `<p class="about-description">${escapeHTML(about.description)}</p>` : ""}</header>`;
  const factList = facts.length
    ? `<dl class="about-facts">${facts.map(([term, value]) => `<div><dt>${escapeHTML(term)}</dt><dd>${value}</dd></div>`).join("")}</dl>`
    : "";
  return `${header}<div class="about-text">${about.html}</div>${factList}`;
}

// meta: { site: "Name v1.2" | "", standalone: boolean, version: "0.1.0" }
export function helpDialogMarkup(prefix, t, { tabs, aboutHtml, meta }) {
  const labels = { open: t.helpTabOpen, about: t.helpTabAbout, links: t.helpTabLinks, url: t.helpTabUrl, shortcuts: t.helpTabShortcuts };
  const tabId = (tab) => `${prefix}-help-tab-${tab}`;
  const panelId = (tab) => `${prefix}-help-panel-${tab}`;
  const row = (keys, text) => `<tr><th scope="row">${keys}</th><td>${text}</td></tr>`;
  const out = (href, text) => `<a href="${escapeHTML(href)}" target="_blank" rel="noopener">${escapeHTML(text)}</a>`;
  const bodies = {
    open: "",
    about: aboutHtml || "",
    links: `<p class="help-intro">${escapeHTML(t.helpLinksIntro)}</p><section class="help-section"><h4 class="help-section-title">${escapeHTML(t.shareViewTitle)}</h4><div ${named(prefix, "link-info-variants")}></div></section><div ${named(prefix, "link-info-embed")}></div><div ${named(prefix, "link-info-slide")}></div>`,
    url: `<p class="help-intro">${escapeHTML(t.helpUrlIntro)}</p><div ${named(prefix, "link-info-params")}></div>`,
    // Pointer and touch for everyone; the keys only where there is a keyboard (CSS).
    shortcuts: `<h4 class="help-subtitle">${escapeHTML(t.controlsPointer)}</h4>
  <table class="shortcut-table"><tbody>
    ${row(escapeHTML(t.ctlZoomHow), escapeHTML(t.ctlZoom))}
    ${row(escapeHTML(t.ctlPanHow), escapeHTML(t.ctlPan))}
    ${row(escapeHTML(t.ctlHelpHow), escapeHTML(t.ctlHelp))}
    ${row(escapeHTML(t.ctlPinHow), escapeHTML(t.ctlPin))}
    ${row(escapeHTML(t.ctlMenuHow), escapeHTML(t.ctlMenu))}
  </tbody></table>
  <div class="help-keys"><h4 class="help-subtitle">${escapeHTML(t.controlsKeyboard)}</h4>
  <table class="shortcut-table"><tbody>
    ${row("<kbd>/</kbd>", escapeHTML(t.shortcutSearch))}
    ${row("<kbd>&larr;</kbd> <kbd>&rarr;</kbd> <kbd>&uarr;</kbd> <kbd>&darr;</kbd>", escapeHTML(t.shortcutPan).replace("{shift}", "<kbd>Shift</kbd>"))}
    ${row("<kbd>+</kbd> <kbd>-</kbd>", escapeHTML(t.shortcutZoom))}
    ${row("<kbd>0</kbd>", escapeHTML(t.shortcutFit))}
    ${row("<kbd>?</kbd>", escapeHTML(t.shortcutHelp))}
    ${row("<kbd>&larr;</kbd> <kbd>&rarr;</kbd>", escapeHTML(t.shortcutTabs))}
    ${row("<kbd>Esc</kbd>", escapeHTML(t.shortcutClose))}
  </tbody></table></div>`,
  };
  const tabButtons = tabs
    .map(
      (tab) =>
        `<button type="button" role="tab" class="help-tab" data-tab="${tab}" id="${tabId(tab)}" aria-controls="${panelId(tab)}" aria-selected="false" tabindex="-1">${escapeHTML(labels[tab])}</button>`,
    )
    .join("");
  const panels = tabs
    .map((tab) => `<section role="tabpanel" class="help-panel dwk-help-panel-${tab}" data-tab="${tab}" id="${panelId(tab)}" aria-labelledby="${tabId(tab)}" hidden>${bodies[tab]}</section>`)
    .join("");
  const webkit = meta.standalone
    ? `diagram-webkit v${escapeHTML(meta.version)}`
    : `${escapeHTML(t.metaBuiltWith)} ${out(PROJECT_URL, "diagram-webkit")} v${escapeHTML(meta.version)}`;
  const metaParts = [meta.site ? `<span class="help-meta-site">${escapeHTML(meta.site)}</span>` : "", `<span>${webkit}</span>`, out(USER_GUIDE_URL, t.metaUserGuide), meta.standalone ? out(PROJECT_URL, "GitHub") : ""].filter(Boolean);
  return `
<div ${named(prefix, "help-dialog", "modal")} style="display: none" role="dialog" aria-modal="true" aria-label="${escapeHTML(t.helpTitle)}">
  <div class="modal-content help-dialog-content">
    <div class="modal-header help-dialog-header">
      <div class="help-tabs" role="tablist">${tabButtons}</div>
      <button type="button" ${named(prefix, "close-help-dialog", "close-button")} aria-label="${escapeHTML(t.close)}">&times;</button>
    </div>
    <div class="modal-body help-dialog-body">${panels}</div>
    <div ${named(prefix, "help-meta", "help-dialog-meta")}>${metaParts.join('<span class="help-meta-sep" aria-hidden="true">·</span>')}</div>
  </div>
</div>`;
}

export function annotationModalsMarkup(prefix, t, max, allowedTags) {
  const id = (name) => `${prefix}-${name}`;
  const userBody = `
<div class="add-annotation-form desktop-only">
  <h4>${escapeHTML(t.addAnnotation)}</h4>
  <form ${named(prefix, "inline-annotation-form")}>
    <div class="form-row"><div class="form-group">
      <label for="${id("inline-title")}">${escapeHTML(t.titleOptional)}</label>
      <input type="text" ${named(prefix, "inline-title")} maxlength="50" />
      <small class="char-count"><span ${named(prefix, "inline-title-count")}>0</span>/50</small>
    </div></div>
    <div class="form-row selector-row">
      <div class="form-group mode-selector-group">
        <label>${escapeHTML(t.modeLabel)}</label>
        <div class="mode-selector">
          <button type="button" ${named(prefix, "mode-point", "mode-btn point-btn")} title="${escapeHTML(t.modePointTitle)}"><div class="mode-icon point-icon"></div><span>${escapeHTML(t.modePoint)}</span></button>
          <button type="button" ${named(prefix, "mode-area", "mode-btn area-btn active")} title="${escapeHTML(t.modeAreaTitle)}"><div class="mode-icon area-icon"></div><span>${escapeHTML(t.modeArea)}</span></button>
          <button type="button" ${named(prefix, "mode-arrow", "mode-btn arrow-btn")} title="${escapeHTML(t.modeArrowTitle)}"><div class="mode-icon arrow-icon"></div><span>${escapeHTML(t.modeArrow)}</span></button>
        </div>
      </div>
      <div class="form-group shape-selector-group">
        <label>${escapeHTML(t.shapeLabel)}</label>
        <div class="shape-selector">
          <button type="button" ${named(prefix, "shape-rectangle", "shape-btn rectangle-btn active")} title="${escapeHTML(t.shapeRectangle)}"><div class="shape-icon rectangle-icon"></div></button>
          <button type="button" ${named(prefix, "shape-circle", "shape-btn circle-btn")} title="${escapeHTML(t.shapeCircle)}"><div class="shape-icon circle-icon"></div></button>
        </div>
      </div>
      <div class="form-group type-selector-group">
        <label>${escapeHTML(t.typeLabel)}</label>
        <div ${named(prefix, "type-selector", "type-selector")}></div>
      </div>
    </div>
    <div class="form-group">
      <label for="${id("inline-description")}">${escapeHTML(t.descriptionLabel)}</label>
      <textarea ${named(prefix, "inline-description")} maxlength="500" rows="3"></textarea>
      <small class="char-count"><span ${named(prefix, "inline-desc-count")}>0</span>/500</small>
      <small class="annotation-help">${escapeHTML(t.allowedHtml.replace("{tags}", allowedTags.join(", ")))}</small>
    </div>
    <div class="form-group">
      <label>${escapeHTML(t.previewLabel)}</label>
      <div ${named(prefix, "inline-description-preview", "description-preview")}></div>
    </div>
    <button type="button" ${named(prefix, "place-annotation-btn")} disabled>${escapeHTML(t.placeAnnotation)}</button>
  </form>
</div>
<div class="user-annotations-list">
  <div class="list-header">
    <h4>${escapeHTML(t.currentAnnotations)}<span ${named(prefix, "annotation-count")}>0</span>/${max}):</h4>
    <div class="list-controls desktop-only">
      <label class="edit-mode-toggle"><input type="checkbox" ${named(prefix, "edit-mode-checkbox")} /><span class="checkmark"></span>${escapeHTML(t.editModeToggle)}</label>
    </div>
  </div>
  <div ${named(prefix, "user-annotation-items")}></div>
</div>
<div class="modal-actions">
  <button type="button" ${named(prefix, "share-url-btn")}>${escapeHTML(t.shareUrl)}</button>
  <button type="button" ${named(prefix, "clear-all-annotations", "danger-btn")}>${escapeHTML(t.clearAll)}</button>
</div>`;

  const editBody = `
<form ${named(prefix, "edit-annotation-form")}>
  <div class="form-group">
    <label for="${id("edit-title")}">${escapeHTML(t.titleOptional)}</label>
    <input type="text" ${named(prefix, "edit-title")} maxlength="50" />
    <small class="char-count"><span ${named(prefix, "edit-title-count")}>0</span>/50</small>
  </div>
  <div class="form-group">
    <label for="${id("edit-description")}">${escapeHTML(t.descriptionLabel)}</label>
    <textarea ${named(prefix, "edit-description")} maxlength="500" rows="4"></textarea>
    <small class="char-count"><span ${named(prefix, "edit-desc-count")}>0</span>/500</small>
  </div>
  <div class="form-group">
    <label for="${id("edit-type")}">${escapeHTML(t.typeLabel)}</label>
    <select ${named(prefix, "edit-type")} required></select>
  </div>
  <div class="form-group">
    <label>${escapeHTML(t.previewLabel)}</label>
    <div ${named(prefix, "edit-description-preview", "description-preview")}></div>
  </div>
  <div class="form-actions">
    <button type="submit">${escapeHTML(t.saveChanges)}</button>
    <button type="button" ${named(prefix, "cancel-edit")}>${escapeHTML(t.cancel)}</button>
  </div>
</form>`;

  return (
    modal(prefix, "user-annotations-modal", "close-user-modal", t.annotationsModalTitle, userBody) +
    modal(prefix, "edit-annotation-modal", "close-edit-modal", t.editAnnotationTitle, editBody)
  );
}
