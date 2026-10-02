//
// Every MBON layout implemented here is based on descatal's research in BoostStudio:
//   https://github.com/descatal/BoostStudio
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der VS2-Forschung dieses
//   Projekts.
// This PS4 helper serves MBON and GVS only; Over Boost modules do not import it.
// Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
// Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
//

/**
 * Bounded cache of object URLs for decoded previews, so revisiting a texture
 * is instant and old blobs are released instead of piling up.
 */

const LIMIT = 192;
const urls = new Map<string, string>();

export function cachedPreviewUrl(key: string): string | undefined {
  const url = urls.get(key);
  if (url !== undefined) {
    urls.delete(key);
    urls.set(key, url);
  }
  return url;
}

export function storePreviewUrl(key: string, bytes: Uint8Array, type = "image/png"): string {
  const existing = urls.get(key);
  if (existing !== undefined) return existing;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type }));
  urls.set(key, url);
  while (urls.size > LIMIT) {
    const oldest = urls.keys().next();
    if (oldest.done) break;
    const stale = urls.get(oldest.value);
    urls.delete(oldest.value);
    if (stale) URL.revokeObjectURL(stale);
  }
  return url;
}

/** Load (or reuse) a preview URL; concurrent callers share one request. */
const pending = new Map<string, Promise<string>>();

export function previewUrl(key: string, load: () => Promise<Uint8Array>, type = "image/png"): Promise<string> {
  const hit = cachedPreviewUrl(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const request = load()
    .then((bytes) => storePreviewUrl(key, bytes, type))
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
