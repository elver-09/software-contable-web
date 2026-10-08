// Renderer security helpers.
// Dynamic values coming from SQLite, SUNAT/APIs, imported files or user input
// must never be interpolated into HTML without escaping first.

const HTML_ESCAPE = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
});

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPE[ch]);
}

// Kept as a separate name so call sites communicate intent when the value is
// written inside a quoted HTML attribute (data-*, title, value, etc.).
export const escapeAttr = escapeHTML;

export function text(value) {
  return String(value ?? '');
}

const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

export function isAllowedImageFile(file) {
  return !!file && ALLOWED_IMAGE_MIME.has(String(file.type || '').toLowerCase());
}

export function isSafeImageSrc(value) {
  if (!value) return false;
  const src = String(value).trim();
  // Company logos are stored as FileReader data URLs. SVG is deliberately
  // excluded because it can contain active/external content.
  return /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(src)
    || /^blob:/i.test(src);
}

export function setSafeImageSrc(img, value) {
  if (!img) return false;
  if (!isSafeImageSrc(value)) {
    img.removeAttribute('src');
    return false;
  }
  img.src = String(value);
  return true;
}

// For places where a human-readable error/status is rendered inside a small
// HTML shell. This makes the safe operation obvious at the call site.
export function escapedMessage(value) {
  return escapeHTML(value instanceof Error ? value.message : value);
}
