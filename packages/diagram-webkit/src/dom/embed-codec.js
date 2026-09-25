// An SVG carried in a link: raw-deflate, then base64url. Decoding also takes
// plain base64 of the SVG text (hand-made links). Only browser APIs; nothing
// leaves the page.

// Whole-link lengths (characters) for the "copy with embedded diagram" link.
export const EMBED_WARN_CHARS = 32_000; // some chat tools cut links around here
export const EMBED_STRONG_WARN_CHARS = 100_000; // many tools will cut or reject it
export const EMBED_MAX_CHARS = 2 * 1024 * 1024; // refused: past what browsers handle well

export class EmbedDecodeError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "EmbedDecodeError";
  }
}

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch (error) {
    if (error instanceof DOMException) throw new EmbedDecodeError("the embedded diagram is not valid base64", { cause: error });
    throw error;
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** @param {string} svgText */
export async function encodeEmbeddedSvg(svgText) {
  return toBase64Url(await pipe(new TextEncoder().encode(svgText), new CompressionStream("deflate-raw")));
}

/** @param {string} value */
export async function decodeEmbeddedSvg(value) {
  const bytes = fromBase64Url(value.trim());
  // Plain base64 of SVG text starts with "<" (or a BOM / whitespace before it).
  const text = (data) => new TextDecoder("utf-8", { fatal: false }).decode(data).replace(/^\uFEFF/, "");
  if (/^\s*</.test(text(bytes.subarray(0, 64)))) return text(bytes);
  try {
    return text(await pipe(bytes, new DecompressionStream("deflate-raw")));
  } catch (error) {
    if (error instanceof TypeError) throw new EmbedDecodeError("the embedded diagram is neither compressed nor plain SVG", { cause: error });
    throw error;
  }
}

// "ok" | "long" (> EMBED_WARN_CHARS) | "very-long" (> EMBED_STRONG_WARN_CHARS) | "too-large"
/** @param {number} length */
export function embedLinkLevel(length) {
  if (length > EMBED_MAX_CHARS) return "too-large";
  if (length > EMBED_STRONG_WARN_CHARS) return "very-long";
  if (length > EMBED_WARN_CHARS) return "long";
  return "ok";
}
