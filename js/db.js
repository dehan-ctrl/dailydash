// Promise wrapper over IndexedDB. App data is scoped to the active local profile.
const NAME = 'macrocoach', VERSION = 2;
const DEFAULT_PROFILE_ID = 'default';
const SEP = '|';

const STORES = {
  settings: undefined, planner: undefined,                       // out-of-line key 'main'
  targets: { keyPath: 'effectiveDate' },
  weighins: { keyPath: 'date' }, logs: { keyPath: 'date' }, checkins: { keyPath: 'date' },
  foods: { keyPath: 'id', autoIncrement: true },
  recipes: { keyPath: 'id', autoIncrement: true },
  foodcache: { keyPath: 'id' },
  profiles: { keyPath: 'id' },
  meta: undefined,
};

const PROFILED = ['settings', 'planner', 'targets', 'weighins', 'logs', 'checkins', 'foods', 'recipes', 'foodcache'];
const KEY_PATH = {
  targets: 'effectiveDate', weighins: 'date', logs: 'date', checkins: 'date',
  foods: 'id', recipes: 'id', foodcache: 'id',
};
const AUTO_STORES = new Set(['foods', 'recipes']);
const PREFIXED_KEY_STORES = new Set(['targets', 'weighins', 'logs', 'checkins', 'foodcache']);

let _db = null, _open = null, _activeProfileId = null;

const clone = (v) => v == null ? v : structuredClone(v);
const isScopedValue = (v) => typeof v === 'string' && v.includes(SEP);
const unscopedValue = (v) => {
  if (!isScopedValue(v)) return v;
  return v.slice(v.indexOf(SEP) + 1);
};

export const isProfiledStore = (n) => PROFILED.includes(n);

export function storageKeyFor(storeName, key, profileId = _activeProfileId || DEFAULT_PROFILE_ID) {
  if (!isProfiledStore(storeName) || AUTO_STORES.has(storeName)) return key;
  if (typeof key === 'string' && key.startsWith(`${profileId}${SEP}`)) return key;
  return `${profileId}${SEP}${key}`;
}

export function toStorageRecord(storeName, value, profileId = _activeProfileId || DEFAULT_PROFILE_ID) {
  const v = clone(value);
  if (!isProfiledStore(storeName)) return v;
  v.profileId = profileId;
  if (PREFIXED_KEY_STORES.has(storeName)) {
    const kp = KEY_PATH[storeName];
    v[kp] = storageKeyFor(storeName, unscopedValue(v[kp]), profileId);
  }
  return v;
}

export function fromStorageRecord(storeName, value) {
  const v = clone(value);
  if (!v || !isProfiledStore(storeName)) return v;
  delete v.profileId;
  if (PREFIXED_KEY_STORES.has(storeName)) {
    const kp = KEY_PATH[storeName];
    v[kp] = unscopedValue(v[kp]);
  }
  return v;
}

export function recordBelongsToProfile(storeName, value, profileId = _activeProfileId || DEFAULT_PROFILE_ID) {
  if (!isProfiledStore(storeName)) return true;
  if (value?.profileId) return value.profileId === profileId;
  if (PREFIXED_KEY_STORES.has(storeName)) return String(value?.[KEY_PATH[storeName]] || '').startsWith(`${profileId}${SEP}`);
  return profileId === DEFAULT_PROFILE_ID; // legacy unscoped row before migration
}

export function openDB() {
  if (_db) return Promise.resolve(_db);
  if (_open) return _open;
  _open = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      for (const [n, opt] of Object.entries(STORES))
        if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, opt);
    };
    r.onsuccess = async () => {
      _db = r.result;
      try {
        await ensureProfileState();
        res(_db);
      } catch (e) {
        rej(e);
      }
    };
    r.onerror = () => rej(r.error);
  });
  return _open;
}

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const rawStore = (n, mode = 'readonly') => _db.transaction(n, mode).objectStore(n);
const rawGet = (n, k) => req(rawStore(n).get(k));
const rawGetAll = (n) => req(rawStore(n).getAll());
const rawPut = (n, v, k) => req(k === undefined ? rawStore(n, 'readwrite').put(v) : rawStore(n, 'readwrite').put(v, k));
const rawDel = (n, k) => req(rawStore(n, 'readwrite').delete(k));

async function ensureProfileState() {
  let profiles = await rawGetAll('profiles');
  if (!profiles.length) {
    await rawPut('profiles', { id: DEFAULT_PROFILE_ID, name: 'Me', createdAt: new Date().toISOString() });
    profiles = await rawGetAll('profiles');
  }
  let active = await rawGet('meta', 'activeProfileId');
  if (!active || !profiles.some((p) => p.id === active)) {
    active = profiles[0].id;
    await rawPut('meta', active, 'activeProfileId');
  }
  _activeProfileId = active;
  await migrateLegacyData(DEFAULT_PROFILE_ID);
}

async function migrateLegacyData(profileId) {
  if (await rawGet('meta', 'profileMigrationV2')) return;
  for (const n of ['settings', 'planner']) {
    const legacy = await rawGet(n, 'main');
    if (legacy && !(await rawGet(n, storageKeyFor(n, 'main', profileId)))) {
      await rawPut(n, toStorageRecord(n, legacy, profileId), storageKeyFor(n, 'main', profileId));
      await rawDel(n, 'main');
    }
  }
  for (const n of ['targets', 'weighins', 'logs', 'checkins', 'foodcache']) {
    const kp = KEY_PATH[n];
    for (const row of await rawGetAll(n)) {
      if (isScopedValue(row?.[kp])) continue;
      await rawPut(n, toStorageRecord(n, row, profileId));
      await rawDel(n, row[kp]);
    }
  }
  for (const n of ['foods', 'recipes']) {
    for (const row of await rawGetAll(n)) {
      if (row.profileId) continue;
      await rawPut(n, { ...row, profileId });
    }
  }
  await rawPut('meta', true, 'profileMigrationV2');
}

async function store(n, mode = 'readonly') {
  return (await openDB()).transaction(n, mode).objectStore(n);
}

async function getForProfile(n, k, profileId) {
  const row = await req((await store(n)).get(storageKeyFor(n, k, profileId)));
  if (!row || !recordBelongsToProfile(n, row, profileId)) return undefined;
  return fromStorageRecord(n, row);
}

async function getAllForProfile(n, profileId) {
  return (await req((await store(n)).getAll()))
    .filter((v) => recordBelongsToProfile(n, v, profileId))
    .map((v) => fromStorageRecord(n, v));
}

async function putForProfile(n, v, k, profileId) {
  const row = toStorageRecord(n, v, profileId);
  const s = await store(n, 'readwrite');
  if (k === undefined) return req(s.put(row));
  return req(s.put(row, storageKeyFor(n, k, profileId)));
}

export const get = async (n, k) => getForProfile(n, k, await getActiveProfileId());
export const getAll = async (n) => getAllForProfile(n, await getActiveProfileId());
export const put = async (n, v, k) => putForProfile(n, v, k, await getActiveProfileId());
export const del = async (n, k) => req((await store(n, 'readwrite')).delete(storageKeyFor(n, k, await getActiveProfileId())));

export async function getActiveProfileId() {
  await openDB();
  return _activeProfileId;
}

export async function getActiveProfile() {
  return rawGet('profiles', await getActiveProfileId());
}

export async function listProfiles() {
  await openDB();
  return (await rawGetAll('profiles')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createProfile(name) {
  await openDB();
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const profile = { id, name: name?.trim() || 'New user', createdAt: new Date().toISOString() };
  await rawPut('profiles', profile);
  return profile;
}

export async function setActiveProfile(id) {
  await openDB();
  if (!(await rawGet('profiles', id))) throw new Error('Profile not found.');
  _activeProfileId = id;
  await rawPut('meta', id, 'activeProfileId');
}

export async function renameProfile(id, name) {
  await openDB();
  const p = await rawGet('profiles', id);
  if (!p) throw new Error('Profile not found.');
  p.name = name?.trim() || p.name;
  await rawPut('profiles', p);
}

export async function deleteProfile(id) {
  await openDB();
  const profiles = await listProfiles();
  if (profiles.length <= 1) throw new Error('Create another profile before deleting this one.');
  if (!profiles.some((p) => p.id === id)) throw new Error('Profile not found.');
  for (const n of ['settings', 'planner']) await rawDel(n, storageKeyFor(n, 'main', id));
  for (const n of ['targets', 'weighins', 'logs', 'checkins', 'foodcache']) {
    const kp = KEY_PATH[n];
    for (const row of await rawGetAll(n))
      if (recordBelongsToProfile(n, row, id)) await rawDel(n, row[kp]);
  }
  for (const n of ['foods', 'recipes']) {
    for (const row of await rawGetAll(n))
      if (recordBelongsToProfile(n, row, id)) await rawDel(n, row.id);
  }
  await rawDel('profiles', id);
  if (_activeProfileId === id) await setActiveProfile(profiles.find((p) => p.id !== id).id);
}

export async function exportAll() {
  const profiles = await listProfiles();
  const activeProfileId = await getActiveProfileId();
  const out = { _app: 'macrocoach', _exportedAt: new Date().toISOString(), _dbVersion: VERSION, profiles, activeProfileId, data: {} };
  for (const p of profiles) {
    out.data[p.id] = {};
    for (const n of PROFILED)
      out.data[p.id][n] = (n === 'settings' || n === 'planner') ? await getForProfile(n, 'main', p.id) : await getAllForProfile(n, p.id);
  }
  return out;
}

export async function importAll(data) {
  if (data._app !== 'macrocoach') throw new Error('Not a MacroCoach backup file.');
  await openDB();
  if (!data.profiles || !data.data) {
    for (const n of PROFILED) {
      if (data[n] == null) continue;
      if (n === 'settings' || n === 'planner') await put(n, data[n], 'main');
      else for (const v of data[n]) await put(n, v);
    }
    return;
  }
  for (const p of data.profiles) await rawPut('profiles', p);
  for (const [profileId, profileData] of Object.entries(data.data)) {
    for (const n of PROFILED) {
      if (profileData[n] == null) continue;
      if (n === 'settings' || n === 'planner') await putForProfile(n, profileData[n], 'main', profileId);
      else for (const v of profileData[n]) await putForProfile(n, v, undefined, profileId);
    }
  }
  if (data.activeProfileId && await rawGet('profiles', data.activeProfileId)) await setActiveProfile(data.activeProfileId);
}

export function wipe() {
  _db?.close(); _db = null; _open = null; _activeProfileId = null;
  return new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(NAME);
    r.onsuccess = res; r.onerror = () => rej(r.error);
  });
}
