// Local mode: the definition has no diagram, so the reader brings one - a
// file, a drop, a link, or a link that carries the SVG itself (#svg=...).
// Everything happens in this browser; the only request is the one to a link
// the reader asked for. Such SVGs are untrusted (loader.js cleans them).
//
// One parameter, two modes: svg=<link to an SVG> (fetched, never turned into
// data) or svg=<the SVG itself> (deflate + base64url, from a file or a drop).
// Written after "#", so not even the link reaches the host's server; ?svg=
// is read too. Start-up order: a one-time handoff from a replace too large
// for the URL, then svg=, else the picker. In the full-page app (urlSync) a
// new diagram restarts the page with it in the URL.
import { PARAMS } from "../core/codec/params";
import { formatText } from "../core/texts";
import { DiagramLoadError } from "./loader.js";
import { sanitizeSvg } from "./svg-sanitize.js";
import { decodeEmbeddedSvg, EmbedDecodeError, EMBED_MAX_CHARS, embedLinkLevel, encodeEmbeddedSvg } from "./embed-codec.js";
import { PROJECT_URL, USER_GUIDE_URL } from "./standalone.js";

const HANDOFF_KEY = "dwk-local-svg-handoff";
const PICKER_CLASS = "dwk-local-picker";
const DROP_CLASS = "dwk-local-dropping";

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createLocalSource(ctx) {
  const s = ctx.s;
  const sv = ctx.services;
  const texts = ctx.texts;
  const win = ctx.win;
  const replacesPage = Boolean(ctx.features.urlSync);
  let picker = null;
  let resolvePick = null;
  let current = null; // { svgText, kind, name?, url? }
  let embeddedLink = null; // Promise<string>

  const el = (tag, className, text) => {
    const node = ctx.doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // --- reading what the reader brings ---------------------------------------

  function isSvgFile(file) {
    return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  }

  async function readFile(file, kind) {
    if (!isSvgFile(file)) throw new DiagramLoadError(formatText(texts.localNotSvg, { name: file.name }));
    return { svgText: await file.text(), kind, name: file.name };
  }

  async function fetchLink(url) {
    let absolute;
    try {
      absolute = new URL(url, win.location.href).href;
    } catch (error) {
      if (error instanceof TypeError) throw new DiagramLoadError(formatText(texts.localLinkFailed, { url, reason: "not a valid URL" }), { cause: error });
      throw error;
    }
    let response;
    try {
      // Nothing about this page goes with the request.
      response = await win.fetch(absolute, { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-cache" });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new DiagramLoadError(formatText(texts.localLinkFailed, { url: absolute, reason: `${error.message} (offline, or the server does not allow cross-origin reads)` }), { cause: error });
      }
      throw error;
    }
    if (!response.ok) throw new DiagramLoadError(formatText(texts.localLinkFailed, { url: absolute, reason: `HTTP ${response.status}` }));
    return { svgText: await response.text(), kind: "link", url: absolute };
  }

  function svgParam() {
    const hash = new URLSearchParams(win.location.hash.replace(/^#/, ""));
    return hash.get(PARAMS.svg) || new URLSearchParams(win.location.search).get(PARAMS.svg);
  }

  // Base64 (either alphabet) never starts like a path or ends in ".svg".
  function isLink(value) {
    return /^(https?:\/\/|\/\/|\.{0,2}\/)/i.test(value) || /\.svg([?#].*)?$/i.test(value);
  }

  // svg=<value> for the hash, with a link kept readable (only what would
  // break the parameter is escaped).
  function svgHash(value) {
    const readable = encodeURIComponent(value).replace(/%(3A|2F|3F|3D|40|2C)/gi, (match) => decodeURIComponent(match));
    return `${PARAMS.svg}=${readable}`;
  }

  function takeHandoff() {
    let value = null;
    try {
      value = win.sessionStorage.getItem(HANDOFF_KEY);
      win.sessionStorage.removeItem(HANDOFF_KEY);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
    return value;
  }

  // The diagram the page was opened with, if the URL (or a handoff) names one.
  async function fromPage() {
    if (!replacesPage) return null;
    const handoff = takeHandoff();
    if (handoff) return { svgText: handoff, kind: "file" };
    const value = svgParam();
    if (!value) return null;
    if (isLink(value)) return fetchLink(value);
    try {
      return { svgText: await decodeEmbeddedSvg(value), kind: "embedded" };
    } catch (error) {
      if (error instanceof EmbedDecodeError) throw new DiagramLoadError(formatText(texts.localDecodeFailed, { reason: error.message }), { cause: error });
      throw error;
    }
  }

  // --- the picker ------------------------------------------------------------

  function buildPicker() {
    const box = el("div", PICKER_CLASS);
    const card = el("div", "dwk-local-picker-card");
    const intro = el("p", "dwk-local-picker-intro", texts.localIntro);
    const privacy = el("p", "dwk-local-picker-privacy", texts.localPrivacy);
    const outLink = (href, text) => {
      const anchor = el("a", "", text);
      anchor.href = href;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      return anchor;
    };
    const project = el("p", "dwk-local-picker-project");
    project.append(outLink(USER_GUIDE_URL, texts.localGuide), " · ", outLink(PROJECT_URL, texts.localProject));
    const input = el("input");
    input.type = "file";
    input.accept = ".svg,image/svg+xml";
    input.hidden = true;
    const choose = el("button", "dwk-local-picker-choose", texts.localChoose);
    choose.type = "button";
    const drop = el("p", "dwk-local-picker-muted", texts.localDrop);
    const form = el("form", "dwk-local-picker-link");
    const label = el("label", "dwk-local-picker-muted", texts.localUrlLabel);
    const url = el("input");
    url.type = "url";
    url.placeholder = texts.localUrlPlaceholder;
    url.setAttribute("aria-label", texts.localUrlLabel);
    const load = el("button", "", texts.localUrlLoad);
    load.type = "submit";
    const row = el("div", "dwk-local-picker-row");
    row.append(url, load);
    form.append(label, row);
    const error = el("p", "dwk-local-picker-error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    card.append(intro, privacy, choose, input, drop, form, error, project);
    box.append(card);
    sv.helpDialog.panel("open").replaceChildren(box);

    const signal = ctx.signal;
    choose.addEventListener("click", () => input.click(), { signal });
    input.addEventListener(
      "change",
      () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (file) pick(readFile(file, "file"));
      },
      { signal },
    );
    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        const value = url.value.trim();
        if (value) pick(replacesPage && current ? Promise.resolve({ kind: "link", url: value }) : fetchLink(value));
      },
      { signal },
    );
    return { box, error, url };
  }

  // The picker is the help dialog's "Open" tab. Until a diagram is loaded
  // the dialog cannot be closed (there is nothing behind it).
  function showPicker(message = "") {
    if (!picker) picker = buildPicker();
    picker.error.hidden = !message;
    picker.error.textContent = message;
    sv.helpDialog.setClosable(Boolean(current));
    sv.helpDialog.open("open");
  }

  function hidePicker() {
    sv.helpDialog.setClosable(true);
    sv.helpDialog.close();
  }

  function pick(pending) {
    pending.then(
      (source) => (current && replacesPage ? replaceWith(source) : resolvePick && resolvePick(source)),
      (error) => {
        if (!(error instanceof DiagramLoadError)) throw error;
        showPicker(error.message);
      },
    );
  }

  // --- drag and drop ---------------------------------------------------------

  function dragHasFile(event) {
    return Array.from((event.dataTransfer && event.dataTransfer.types) || []).includes("Files");
  }

  function bindDrop() {
    const signal = ctx.signal;
    ctx.root.dataset.dwkDropText = texts.localDropHere;
    let depth = 0;
    const accepting = () => !current || replacesPage;
    ctx.root.addEventListener(
      "dragenter",
      (event) => {
        if (!dragHasFile(event) || !accepting()) return;
        depth += 1;
        ctx.root.classList.add(DROP_CLASS);
      },
      { signal },
    );
    ctx.root.addEventListener(
      "dragleave",
      () => {
        depth = Math.max(0, depth - 1);
        if (depth === 0) ctx.root.classList.remove(DROP_CLASS);
      },
      { signal },
    );
    ctx.root.addEventListener(
      "dragover",
      (event) => {
        if (!dragHasFile(event) || !accepting()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      { signal },
    );
    ctx.root.addEventListener(
      "drop",
      (event) => {
        depth = 0;
        ctx.root.classList.remove(DROP_CLASS);
        if (!dragHasFile(event) || !accepting()) return;
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) pick(readFile(file, "drop"));
      },
      { signal },
    );
  }

  // --- replacing a loaded diagram (full-page app) ------------------------------

  // The page restarts with the new diagram: in the URL when it fits, else
  // through sessionStorage for the one reload. The old view parameters go.
  async function replaceWith(source) {
    const url = new URL(win.location.href);
    Object.values(PARAMS).forEach((name) => url.searchParams.delete(name));
    url.hash = "";
    if (source.kind === "link") {
      url.hash = svgHash(new URL(source.url, win.location.href).href);
    } else {
      const encoded = await encodeEmbeddedSvg(source.svgText);
      url.hash = `${PARAMS.svg}=${encoded}`;
      if (url.href.length > EMBED_MAX_CHARS) {
        url.hash = "";
        try {
          win.sessionStorage.setItem(HANDOFF_KEY, source.svgText);
        } catch (error) {
          if (!(error instanceof DOMException)) throw error;
          showPicker(formatText(texts.localTooLargeToKeep, { size: formatSize(source.svgText.length) }));
          return;
        }
      }
    }
    win.history.pushState(null, "", url.href);
    win.location.reload();
  }

  // After the first load: keep the diagram in the URL, so a reload shows it
  // again and every copied link carries it.
  async function rememberInUrl(source) {
    if (!replacesPage || source.kind === "embedded") return;
    const url = new URL(win.location.href);
    url.searchParams.delete(PARAMS.svg);
    if (source.kind === "link") {
      url.hash = svgHash(source.url);
    } else {
      url.hash = new URL(await linkWithEmbedded()).hash;
      if (url.href.length > EMBED_MAX_CHARS) return;
    }
    win.history.replaceState(win.history.state, "", sv.urlSync.toAbsoluteReadableUrl(url));
  }

  // --- the embedded link (link info) -------------------------------------------

  function linkWithEmbedded() {
    if (!current) return Promise.resolve("");
    if (!embeddedLink) {
      embeddedLink = encodeEmbeddedSvg(current.svgText).then((encoded) => {
        const url = new URL(win.location.href);
        url.searchParams.delete(PARAMS.svg);
        url.hash = `${PARAMS.svg}=${encoded}`;
        return sv.urlSync.toAbsoluteReadableUrl(url);
      });
    }
    return embeddedLink;
  }

  function formatSize(chars) {
    return chars >= 1024 * 1024 ? `${(chars / 1024 / 1024).toFixed(1)} MiB` : chars >= 1024 ? `${Math.round(chars / 1024)} KiB` : `${chars} B`;
  }

  // What the link-info dialog shows: the link, how long it is, and whether
  // it should (or can) be shared that way.
  async function shareInfo() {
    if (!current) return null;
    // The live URL may have moved on (view, filters): rebuild from it. A
    // link stays a link.
    const url = new URL(win.location.href);
    url.searchParams.delete(PARAMS.svg);
    url.hash = current.kind === "link" ? svgHash(current.url) : new URL(await linkWithEmbedded()).hash;
    const link = sv.urlSync.toAbsoluteReadableUrl(url);
    return {
      link,
      length: link.length,
      level: embedLinkLevel(link.length),
      size: formatSize(link.length),
      loadedFrom: current.kind === "link" ? current.url : null,
    };
  }

  // --- download ---------------------------------------------------------------

  function downloadName() {
    const fromUrl = current.url ? decodeURIComponent(new URL(current.url).pathname.split("/").pop() || "") : "";
    const name = current.name || fromUrl || "diagram.svg";
    return /\.svg$/i.test(name) ? name : `${name}.svg`;
  }

  // The loaded SVG as a file again, e.g. one that only lived in #svg=. The
  // cleaned version: a file from someone else must not run script when
  // opened from disk. Tags, help and draw.io's embedded copy stay.
  function downloadSvg() {
    if (!current) return;
    const parsed = new win.DOMParser().parseFromString(`<!doctype html><body>${current.svgText}`, "text/html");
    const svg = parsed.body.querySelector("svg");
    if (!svg) throw new DiagramLoadError("The loaded diagram is not a valid SVG");
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n${new win.XMLSerializer().serializeToString(sanitizeSvg(svg))}`;
    const url = win.URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    const anchor = el("a");
    anchor.href = url;
    anchor.download = downloadName();
    anchor.hidden = true;
    ctx.root.appendChild(anchor);
    anchor.click();
    anchor.remove();
    ctx.timers.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
  }

  // --- start-up ---------------------------------------------------------------

  // Resolves with the loaded diagram's aspect ratio. Failures (bad SVG, bad
  // link, bad embed) are shown in the picker and the reader tries again.
  async function loadFirst() {
    bindDrop();
    // Built now: the "Open" tab needs it even when the URL names the diagram.
    picker = buildPicker();
    let source = null;
    let message = "";
    try {
      source = await fromPage();
    } catch (error) {
      if (!(error instanceof DiagramLoadError)) throw error;
      message = error.message;
    }
    for (;;) {
      if (!source) {
        showPicker(message);
        ctx.root.classList.add("dwk-local-waiting");
        source = await new Promise((resolve) => (resolvePick = resolve));
        resolvePick = null;
      }
      hidePicker();
      ctx.root.classList.remove("dwk-local-waiting");
      if (sv.feedback) sv.feedback.showLoadingState();
      try {
        const aspectRatio = await sv.loader.loadDiagram({ svgText: source.svgText, untrusted: true });
        current = source;
        s.source = { svgText: source.svgText, untrusted: true };
        s.sourceLabel = source.name || source.url || "(local svg)";
        rememberInUrl(source).catch((error) => console.error("diagram-webkit: could not keep the diagram in the URL:", error));
        // Opening another one restarts the page, which only the full-page app does.
        sv.helpDialog.setAvailable("open", replacesPage);
        return aspectRatio;
      } catch (error) {
        if (!(error instanceof DiagramLoadError)) throw error;
        if (sv.feedback) sv.feedback.hideLoadingState();
        message = formatText(texts.localReadFailed, { name: source.name || source.url || "the diagram", reason: error.message });
        source = null;
      }
    }
  }

  return {
    loadFirst,
    shareInfo,
    isLoaded: () => Boolean(current),
    downloadSvg,
    replacesPage,
  };
}
