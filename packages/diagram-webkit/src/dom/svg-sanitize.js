// Cleans an SVG that came from outside the definition (a dropped file, a
// link, an embedded URL) before it is inserted: nothing in it may run script
// or make a request. Works on the inert parsed tree, in place. draw.io puts
// HTML labels in <foreignObject>; that HTML gets the same treatment.

const REMOVED_ELEMENTS = new Set([
  "script", "iframe", "frame", "frameset", "object", "embed", "applet", "audio", "video", "source", "track",
  "base", "link", "meta", "handler", "listener", "portal", "form", "input", "button", "textarea", "select",
]);
const ANIMATIONS = new Set(["set", "animate", "animatetransform", "animatemotion", "discard"]);
const LINK_ATTRIBUTES = new Set(["href", "xlink:href", "src", "action", "formaction", "poster", "srcset", "data", "background", "ping"]);
// Links a reader clicks may leave the page; everything else must stay local.
const NAVIGATION_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
const LOCAL_DATA = /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml)[;,]/i;

// Browsers skip these inside a URL scheme ("java\tscript:"); removing them is the point.
function compact(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
}

function scheme(value) {
  const match = compact(value).match(/^([a-z][a-z0-9+.-]*):/i);
  return match ? `${match[1].toLowerCase()}:` : null;
}

function allowedLink(element, value) {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return true;
  if (LOCAL_DATA.test(compact(trimmed))) return true;
  const isAnchor = element.localName.toLowerCase() === "a";
  const found = scheme(trimmed);
  // A relative link on an <a> is a navigation within the site; on anything
  // else (image, use, ...) it would be a request.
  if (!found) return isAnchor;
  return isAnchor && NAVIGATION_SCHEMES.has(found);
}

// @import and url(...) pointing anywhere but #fragment or an inline image.
export function sanitizeCss(css) {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, target) => (target.trim().startsWith("#") || LOCAL_DATA.test(compact(target)) ? match : "none"))
    .replace(/expression\s*\(/gi, "none(");
}

/** @param {Element} root */
export function sanitizeSvg(root) {
  const removed = [];
  const walk = (element) => {
    const name = element.localName.toLowerCase();
    if (REMOVED_ELEMENTS.has(name)) {
      removed.push(element);
      return;
    }
    const animatedAttribute = (element.getAttribute("attributeName") || "").toLowerCase();
    if (ANIMATIONS.has(name) && (animatedAttribute.startsWith("on") || LINK_ATTRIBUTES.has(animatedAttribute))) {
      removed.push(element);
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();
      if (attributeName.startsWith("on") || attributeName === "srcdoc") element.removeAttribute(attribute.name);
      else if (LINK_ATTRIBUTES.has(attributeName) && !allowedLink(element, attribute.value)) element.removeAttribute(attribute.name);
      else if (attributeName === "style") element.setAttribute(attribute.name, sanitizeCss(attribute.value));
    });
    if (name === "a" && element.hasAttribute("href")) element.setAttribute("rel", "noopener noreferrer");
    if (name === "style") element.textContent = sanitizeCss(element.textContent || "");
    Array.from(element.children).forEach(walk);
  };
  walk(root);
  removed.forEach((element) => element.remove());
  return root;
}
