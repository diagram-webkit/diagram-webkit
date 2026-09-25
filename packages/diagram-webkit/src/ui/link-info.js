// The Share and URL parameters tabs: link variants, parameter docs and
// "Copy as slide" (feature copySlide).
import { PARAM_GROUPS, paramDocs, PARAMS } from "../core/codec/params";
import { formatText } from "../core/texts";

const COPIED_MS = 1200;
const PREVIEW_VALUE_MAX = 24;

export function createLinkInfo(ctx) {
  const texts = ctx.texts;
  const variantsEl = ctx.el("link-info-variants");
  const paramsEl = ctx.el("link-info-params");
  let renderController = null;

  function el(tag, className, text) {
    const node = ctx.doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function plural(count, word) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function splitList(value) {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  const location = () => ctx.win.location;
  const annotationCount = () => ctx.s.userAnnotations.length;

  function buildUrlWithout(removed) {
    const url = new URL(location().href);
    removed.forEach((name) => url.searchParams.delete(name));
    return ctx.services.urlSync.toAbsoluteReadableUrl(url);
  }

  function buildVariants() {
    const params = new URLSearchParams(location().search);
    const has = (name) => params.has(name);
    const candidates = [
      {
        title: texts.linkCurrent,
        description: new URLSearchParams(location().hash.replace(/^#/, "")).has(PARAMS.svg) ? texts.linkCurrentWithDiagram : texts.linkCurrentDescription,
        removed: [],
      },
      has(PARAMS.annotations) && {
        title: texts.linkNoAnnotations,
        description: formatText(texts.linkNoAnnotationsDescription, { annotations: plural(annotationCount(), "user annotation") }),
        removed: [PARAMS.annotations],
      },
      has(PARAMS.viewport) && { title: texts.linkNoPosition, description: texts.linkNoPositionDescription, removed: [PARAMS.viewport] },
      has(PARAMS.hideTags) && {
        title: texts.linkNoHiddenTags,
        description: formatText(texts.linkNoHiddenTagsDescription, { tags: plural(splitList(params.get(PARAMS.hideTags)).length, "hidden tag") }),
        removed: [PARAMS.hideTags],
      },
      params.size > 0 && { title: texts.linkClean, description: texts.linkCleanDescription, removed: Array.from(new Set(params.keys())) },
    ].filter(Boolean);
    const seen = new Set();
    return candidates
      .map((variant) => ({ ...variant, url: buildUrlWithout(variant.removed) }))
      .filter((variant) => {
        if (seen.has(variant.url)) return false;
        seen.add(variant.url);
        return true;
      });
  }

  function shorten(value) {
    return value.length > PREVIEW_VALUE_MAX ? `${value.slice(0, PREVIEW_VALUE_MAX - 1)}…` : value;
  }

  // Query string with long values cut short and the removed parameters struck
  // through and moved to the front, so the difference survives the ellipsis.
  function renderPreview(removed) {
    const preview = el("span", "link-info-preview");
    const entries = Array.from(new URLSearchParams(location().search).entries()).sort(
      ([a], [b]) => Number(removed.includes(b)) - Number(removed.includes(a)),
    );
    if (entries.length === 0 || removed.length === entries.length) {
      preview.textContent = location().pathname;
      return preview;
    }
    preview.append(location().pathname, "?");
    entries.forEach(([name, value], index) => {
      if (index > 0) preview.append("&");
      preview.append(el(removed.includes(name) ? "del" : "span", "", `${name}=${shorten(value)}`));
    });
    return preview;
  }

  function showFeedback(feedbackEl, label, isError) {
    const original = feedbackEl.dataset.label || feedbackEl.textContent;
    feedbackEl.dataset.label = original;
    feedbackEl.textContent = label;
    feedbackEl.classList.add(isError ? "is-error" : "is-done");
    ctx.timers.setTimeout(() => {
      feedbackEl.textContent = original;
      feedbackEl.classList.remove("is-error", "is-done");
    }, COPIED_MS);
  }

  function copyText(text, feedbackEl) {
    const clipboard = ctx.win.navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      console.error("Link info: clipboard API unavailable (needs a secure context)");
      showFeedback(feedbackEl, texts.linkCopyUnavailable, true);
      return;
    }
    clipboard.writeText(text).then(
      () => showFeedback(feedbackEl, texts.linkCopied, false),
      (error) => {
        console.error("Link info: clipboard write failed:", error);
        showFeedback(feedbackEl, texts.linkCopyFailed, true);
      },
    );
  }

  function actionButton(className, label, onClick, signal) {
    const button = el("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick, { signal });
    return button;
  }

  function renderVariant(variant, isCurrent, signal) {
    const row = el("div", "link-info-link");
    row.title = variant.url;
    const text = el("span", "link-info-link-text");
    const head = el("span", "link-info-link-head");
    head.append(el("strong", "", variant.title), el("span", "link-info-muted", variant.description));
    text.append(head, renderPreview(variant.removed));
    const actions = el("span", "link-info-actions");
    const copy = actionButton("link-info-action", texts.linkCopy, () => copyText(variant.url, copy), signal);
    actions.append(copy);
    if (!isCurrent) {
      const open = actionButton("link-info-action", texts.linkOpen, () => location().assign(variant.url), signal);
      open.title = texts.linkOpenTitle;
      actions.append(open);
    }
    row.append(text, actions);
    return row;
  }

  function renderCopySlide(signal) {
    const section = el("section", "help-section");
    section.append(el("h4", "help-section-title", texts.sharePresentationTitle));
    const row = el("div", "link-info-link dwk-copy-slide");
    const text = el("span", "link-info-link-text");
    const head = el("span", "link-info-link-head");
    head.append(el("strong", "", texts.copySlide), el("span", "link-info-muted", texts.copySlideDescription));
    text.append(head);
    const actions = el("span", "link-info-actions");
    const copy = actionButton("link-info-action", texts.linkCopy, () => copyText(ctx.api.serialize("slide"), copy), signal);
    copy.dataset.role = "copy-slide";
    actions.append(copy);
    row.append(text, actions);
    section.append(row);
    return section;
  }

  // Local mode only: one line under the links on how the diagram travels
  // with them - inside (with a warning when that gets long), too large for
  // that, or loaded from a URL (with a way to copy it inside instead).
  function renderEmbed(target, signal) {
    const local = ctx.services.localSource;
    if (!local || !local.isLoaded()) {
      target.replaceChildren();
      return;
    }
    local.shareInfo().then(
      (info) => {
        if (signal.aborted || !info) return;
        const vars = { size: info.size, count: info.length.toLocaleString("en"), url: info.loadedFrom || "" };
        const section = el("section", "help-section");
        section.append(el("h4", "help-section-title", texts.shareDiagramTitle));
        const status = el("div", `dwk-embed-status is-${info.loadedFrom ? "link" : info.level}`);
        status.dataset.level = info.level;
        const message = info.loadedFrom
          ? texts.embedLoadedFrom
          : { ok: texts.embedInside, long: texts.embedLong, "very-long": texts.embedVeryLong, "too-large": texts.embedTooLarge }[info.level];
        status.append(el("span", "dwk-embed-message", formatText(message, vars)));
        const download = actionButton("link-info-action", texts.embedDownload, () => local.downloadSvg(), signal);
        download.dataset.role = "download-svg";
        status.append(download);
        section.append(status);
        target.replaceChildren(section);
      },
      (error) => {
        console.error("Link info: could not build the embedded link:", error);
        target.replaceChildren(el("div", "dwk-embed-status is-too-large", error.message));
      },
    );
  }

  function renderPills(options, active) {
    const pills = el("span", "link-info-pills");
    options.concat(active.filter((value) => !options.includes(value))).forEach((value) => {
      const known = options.includes(value);
      const state = !known ? " is-invalid" : active.includes(value) ? " is-active" : "";
      const pill = el("span", `link-info-pill${state}${value === "" ? " is-none" : ""}`);
      pill.textContent = value === "" ? texts.paramNone : value;
      if (value === "") pill.title = texts.paramLeftOut;
      if (!known) pill.title = texts.paramInvalid;
      pills.append(pill);
    });
    return pills;
  }

  function renderValue(doc, value, signal) {
    const wrap = el("div", "link-info-value");
    let copyable = value;
    switch (doc.kind) {
      case "enum":
        wrap.append(el("span", "link-info-hint", texts.paramOneOf), renderPills(doc.values, [value]));
        copyable = null;
        break;
      case "enum-multi":
        wrap.append(el("span", "link-info-hint", texts.paramAnyOf), renderPills(doc.values, splitList(value)));
        copyable = null;
        break;
      case "flag":
        wrap.append(renderPills(["on"], ["on"]));
        copyable = null;
        break;
      case "list":
        copyable = splitList(value).join(",");
        wrap.append(el("code", "link-info-code", copyable.replace(/,/g, ", ")));
        break;
      case "blob":
        wrap.append(
          el(
            "span",
            "link-info-muted",
            formatText(texts.paramBlob, { annotations: plural(annotationCount(), "annotation"), chars: value.length }),
          ),
        );
        break;
      default:
        wrap.append(el("code", "link-info-code", value || texts.paramEmpty));
    }
    if (copyable) {
      const copy = actionButton("link-info-copy", texts.linkCopy, () => copyText(copyable, copy), signal);
      wrap.append(copy);
    }
    return wrap;
  }

  const GROUP_LABELS = {
    view: texts.paramGroupView,
    notes: texts.paramGroupNotes,
    interface: texts.paramGroupInterface,
    filters: texts.paramGroupFilters,
    focus: texts.paramGroupFocus,
    diagram: texts.paramGroupDiagram,
    development: texts.paramGroupDevelopment,
    other: texts.paramGroupOther,
  };
  const groupLabel = (group) => GROUP_LABELS[group];

  // The parameters in this address, grouped by what they do, each with its
  // meaning and value; then every parameter there is, for reference.
  function renderParams(signal) {
    const params = new URLSearchParams(location().search);
    const docs = paramDocs(ctx.s.maxDiagramLevel);
    const known = new Set(docs.map((doc) => doc.name));
    const present = docs.filter((doc) => params.has(doc.name)).map((doc) => ({ doc, value: params.get(doc.name) }));
    const unknown = [];
    params.forEach((value, name) => {
      if (known.has(name) || unknown.some((row) => row.doc.name === name)) return;
      unknown.push({ doc: { name, kind: "text", group: "other", description: texts.unknownParam }, value });
    });
    const groups = [...PARAM_GROUPS.map((group) => ({ group, rows: present.filter((row) => row.doc.group === group) })), { group: "other", rows: unknown }].filter(
      (entry) => entry.rows.length > 0,
    );
    const current = groups.length
      ? [el("h3", "help-heading", texts.paramCurrentTitle)].concat(groups.map(({ group, rows }) => {
          const section = el("section", "param-group");
          section.append(el("h4", "help-section-title", groupLabel(group)));
          rows.forEach(({ doc, value }) => {
            const item = el("div", "link-info-param");
            const body = el("div", "link-info-param-body");
            body.append(el("span", "link-info-param-meaning", doc.description), renderValue(doc, value, signal));
            item.append(el("code", "link-info-param-name", doc.name), body);
            section.append(item);
          });
          return section;
        }))
      : [el("p", "help-empty", texts.noParams)];
    const reference = el("details", "param-reference");
    reference.append(el("summary", "", texts.paramReference));
    PARAM_GROUPS.forEach((group) => {
      const rows = docs.filter((doc) => doc.group === group);
      if (rows.length === 0) return;
      const list = el("dl", "param-reference-list");
      rows.forEach((doc) => list.append(el("dt", "", doc.name), el("dd", "", doc.description)));
      reference.append(el("h4", "help-section-title", groupLabel(group)), list);
    });
    paramsEl.replaceChildren(...current, reference);
  }

  function render() {
    if (renderController) renderController.abort();
    renderController = new AbortController();
    const signal = AbortSignal.any([ctx.signal, renderController.signal]);
    variantsEl.replaceChildren(...buildVariants().map((variant) => renderVariant(variant, variant.removed.length === 0, signal)));
    const embedEl = ctx.maybeEl("link-info-embed");
    if (embedEl) renderEmbed(embedEl, signal);
    // An authoring tool: only with ?debug (or opts.debug).
    const slideEl = ctx.maybeEl("link-info-slide");
    if (slideEl) slideEl.replaceChildren(...(ctx.s.debug && ctx.features.copySlide ? [renderCopySlide(signal)] : []));
    renderParams(signal);
  }

  return { render };
}
