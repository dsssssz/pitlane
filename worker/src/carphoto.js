/**
 * v132: фото своей машины (как баннер v89).
 *   pilot:<uuid>.carPhoto = '<ver>' · pilot:<uuid>.carPhotoShare = true|false (показывать на карточке заезда)
 *   pcarphoto:<uuid> → { mime, b64, v, at }  — 16:10, клиент обрезал и пережал через canvas (EXIF/гео уже нет)
 * Сервер дополнительно: только webp/jpeg/avif, сверка magic bytes, ≤ PCAR_MAX, отказ, если внутри остались EXIF/XMP/GPS.
 * GET /car-photo/:pilotId — публично (как баннер), кэшируемо, ?v= меняется при замене.
 */
export const PCAR_MAX = 240 * 1024;
export const PCAR_BODY = Math.ceil(PCAR_MAX * 4 / 3) + 4096;
export const carPhotoKey = (pid) => 'pcarphoto:' + pid;

function bytesOf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const str = (u, i, n) => { let o = ''; const e = Math.min(u.length, i + n); for (let k = i; k < e; k += 4096) o += String.fromCharCode.apply(null, u.subarray(k, Math.min(e, k + 4096))); return o; };

/** Метаданные внутри файла: JPEG APP1 (Exif/XMP), WebP чанки EXIF/XMP, AVIF/HEIF «Exif» item. */
export function hasMeta(u, mime) {
  if (mime === 'image/jpeg') {
    let i = 2;
    while (i + 4 <= u.length && u[i] === 0xff) {
      const mk = u[i + 1];
      if (mk === 0xda || mk === 0xd9) break; // начало данных
      const len = (u[i + 2] << 8) | u[i + 3];
      if (mk === 0xe1) return true; // APP1: Exif или XMP
      if (len < 2) return true;
      i += 2 + len;
    }
    return false;
  }
  if (mime === 'image/webp') {
    let i = 12;
    while (i + 8 <= u.length) {
      const id = str(u, i, 4); const len = u[i + 4] | (u[i + 5] << 8) | (u[i + 6] << 16) | (u[i + 7] << 24);
      if (id === 'EXIF' || id === 'XMP ') return true;
      i += 8 + len + (len & 1);
    }
    return false;
  }
  // AVIF: грубо — искать маркеры Exif/XMP в первых 64 КБ (ISO-BMFF item type 'Exif' / mime 'application/rdf+xml')
  const head = str(u, 0, Math.min(u.length, 65536));
  return /Exif\0\0|<x:xmpmeta|application\/rdf\+xml/.test(head);
}

/** data:image/(webp|jpeg|avif);base64,… → { mime, b64, bytes } | { error, code } */
export function sanitizeCarPhoto(v) {
  const s = String(v || '');
  const m = s.match(/^data:image\/(webp|jpeg|jpg|avif);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m) return { error: 'only webp, avif or jpeg data URL', code: 'bad_format' };
  const b64 = m[2];
  const bytes = Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > PCAR_MAX) return { error: 'photo too large', code: 'too_large', max: PCAR_MAX };
  if (bytes < 1000) return { error: 'photo too small', code: 'too_small' };
  let u; try { u = bytesOf(b64); } catch { return { error: 'bad base64', code: 'bad_format' }; }
  const mime = m[1] === 'webp' ? 'image/webp' : m[1] === 'avif' ? 'image/avif' : 'image/jpeg';
  const isJpeg = u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff;
  const isWebp = str(u, 0, 4) === 'RIFF' && str(u, 8, 4) === 'WEBP';
  const isAvif = str(u, 4, 4) === 'ftyp' && /avif|avis|mif1/.test(str(u, 8, 16));
  if ((mime === 'image/webp' && !isWebp) || (mime === 'image/jpeg' && !isJpeg) || (mime === 'image/avif' && !isAvif)) return { error: 'content does not match MIME', code: 'bad_format' };
  if (hasMeta(u, mime)) return { error: 'metadata (EXIF/XMP) must be stripped', code: 'has_meta' };
  return { mime, b64, bytes };
}

/** Публичное: { v } или null. Владельцу ещё share. */
export function publicCarPhoto(rec, owner = false) {
  const v = rec && typeof rec.carPhoto === 'string' ? rec.carPhoto.slice(0, 24) : '';
  if (!v) return null;
  return owner ? { v, share: rec.carPhotoShare !== false } : { v, share: rec.carPhotoShare !== false };
}
