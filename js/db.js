// Thin promise wrapper over IndexedDB. All app data lives here, on-device only.
const NAME = 'macrocoach', VERSION = 1;
const STORES = {
  settings: undefined, planner: undefined,                       // out-of-line key 'main'
  targets: { keyPath: 'effectiveDate' },
  weighins: { keyPath: 'date' }, logs: { keyPath: 'date' }, checkins: { keyPath: 'date' },
  foods: { keyPath: 'id', autoIncrement: true },
  recipes: { keyPath: 'id', autoIncrement: true },
  foodcache: { keyPath: 'id' },
};

let _db = null;
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      for (const [n, opt] of Object.entries(STORES))
        if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, opt);
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = async (n, mode = 'readonly') => (await openDB()).transaction(n, mode).objectStore(n);

export const get = async (n, k) => req((await store(n)).get(k));
export const getAll = async (n) => req((await store(n)).getAll());
export const put = async (n, v, k) => req((await store(n, 'readwrite')).put(v, k));
export const del = async (n, k) => req((await store(n, 'readwrite')).delete(k));

export async function exportAll() {
  const out = { _app: 'macrocoach', _exportedAt: new Date().toISOString(), _dbVersion: VERSION };
  for (const n of Object.keys(STORES))
    out[n] = (n === 'settings' || n === 'planner') ? await get(n, 'main') : await getAll(n);
  return out;
}
export async function importAll(data) {
  if (data._app !== 'macrocoach') throw new Error('Not a MacroCoach backup file.');
  for (const n of Object.keys(STORES)) {
    if (data[n] == null) continue;
    if (n === 'settings' || n === 'planner') await put(n, data[n], 'main');
    else for (const v of data[n]) await put(n, v);
  }
}
export function wipe() {
  _db?.close(); _db = null;
  return new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(NAME);
    r.onsuccess = res; r.onerror = () => rej(r.error);
  });
}
