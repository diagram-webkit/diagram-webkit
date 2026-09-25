// Builds the UI a feature set asks for and registers its services on ctx.
import { createAnnotationEditor } from "./annotation-editor/index.js";
import { DEFAULT_TEXTS } from "../core/texts";
import { VERSION } from "../core/version";
import { createFeedback } from "./feedback.js";
import { createHelpDialog } from "./help-dialog.js";
import { createKeys } from "./keys.js";
import { createLayout } from "./layout.js";
import { createLinkInfo } from "./link-info.js";
import { aboutMarkup, annotationModalsMarkup, footerMarkup, HELP_TABS, helpDialogMarkup, panelMarkup } from "./markup.js";
import { createPanel } from "./panel.js";
import { createResults } from "./results.js";
import { createShortcuts } from "./shortcuts.js";
import { createTagTree } from "./tag-tree.js";

function append(root, html) {
  root.insertAdjacentHTML("beforeend", html);
}

export function createUi(ctx) {
  const sv = ctx.services;
  const features = ctx.features;
  const texts = ctx.texts;
  const prefix = ctx.idPrefix;
  const content = ctx.config.content;
  const hooks = ctx.config.hooks;
  const editor = features.annotations === "edit" && features.panel;

  sv.layout = createLayout(ctx);
  if (features.feedback) sv.feedback = createFeedback(ctx, features.feedback);

  // The diagram's own name: its label if the definition set one, else the page title.
  const siteName = () =>
    texts.diagramLabel !== DEFAULT_TEXTS.diagramLabel ? texts.diagramLabel : (content.page && content.page.title) || texts.diagramLabel;
  const aboutHtml =
    features.about && content.about
      ? aboutMarkup(texts, {
          name: texts.aboutTitle !== DEFAULT_TEXTS.aboutTitle ? texts.aboutTitle : siteName(),
          description: content.page.description,
          html: hooks.renderAbout ? hooks.renderAbout(content.about) : content.about,
          version: content.footer.version,
          license: content.license,
          maintainer: content.page.author,
          repository: content.repository,
          builtWith: ctx.standalone ? "" : VERSION,
        })
      : "";
  // The help dialog's tabs that apply here (help-dialog.js).
  const wanted = { open: !ctx.s.source, about: Boolean(aboutHtml), links: features.linkInfo, url: features.linkInfo, shortcuts: features.shortcuts };
  const helpTabs = HELP_TABS.filter((tab) => wanted[tab]);

  if (features.panel) append(ctx.root, panelMarkup(prefix, texts, { annotationsEditor: editor }));
  if (features.footer) {
    append(ctx.root, footerMarkup(prefix, texts, content.footer, { help: helpTabs.length > 0, renderFooter: hooks.renderFooter }));
  }
  if (editor) {
    const whitelist = Object.keys(ctx.config.annotations.htmlWhitelist);
    append(ctx.root, annotationModalsMarkup(prefix, texts, ctx.config.annotations.max, whitelist));
  }
  const meta = {
    standalone: Boolean(ctx.standalone),
    version: VERSION,
    site: !ctx.standalone && content.footer.version ? `${siteName()} ${content.footer.version}` : "",
  };
  if (helpTabs.length > 0) append(ctx.root, helpDialogMarkup(prefix, texts, { tabs: helpTabs, aboutHtml, meta }));

  if (features.panel) {
    sv.panel = createPanel(ctx);
    sv.tagTree = createTagTree(ctx);
    sv.results = createResults(ctx);
    sv.panel.initialize();
    sv.theme.bindToggleButton(ctx.el("floating-theme-toggle"));
  }
  if (editor) {
    sv.annotationEditor = createAnnotationEditor(ctx);
    sv.annotationEditor.initialize();
  }
  if (helpTabs.length > 0) {
    sv.helpDialog = createHelpDialog(ctx);
    sv.helpDialog.initialize();
  }
  if (features.linkInfo) sv.linkInfo = createLinkInfo(ctx);
  if (features.shortcuts || features.input.keyboard) {
    sv.shortcuts = createShortcuts(ctx);
  }
  if (features.panel || sv.helpDialog || features.shortcuts || features.input.keyboard || editor) createKeys(ctx);

  sv.ui = {
    // After a setState: bring controls in line with the new state.
    syncFromState() {
      if (sv.panel) sv.panel.syncSearchInput();
      if (sv.tagTree) sv.tagTree.refresh();
    },
    onResize() {
      sv.layout.onResize();
      if (sv.tagTree) sv.tagTree.onResize();
    },
  };
}
