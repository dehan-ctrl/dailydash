// TR→EN bridge for USDA queries: dictionary first (instant, offline), then
// the free MyMemory API, cached per session. Returns null when no usable
// translation exists — caller should then skip USDA rather than fail search.
import { trFoodToEn } from './tr-foods.js';

const cache = new Map();

export async function turkishQueryToEnglish(query) {
  const local = trFoodToEn(query);
  if (local) return local;
  const q = String(query || '').trim();
  if (!q) return null;
  if (cache.has(q)) return cache.get(q);
  let out = null;
  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=tr|en`,
      { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      const text = d?.responseData?.translatedText;
      // MyMemory sometimes echoes the input or returns error text in the field
      if (text && typeof text === 'string' && !/^invalid|^query length/i.test(text)) {
        out = text.toLocaleLowerCase('en');
      }
    }
  } catch { /* offline or slow — treat as untranslatable */ }
  cache.set(q, out);
  return out;
}
