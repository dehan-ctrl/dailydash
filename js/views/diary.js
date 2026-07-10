import { dstr, addDays, dowMon } from '../util.js';
import { dayMacros } from '../engine/planner.js';
import { targetsFor, activeTargets } from '../engine/targets.js';
import { normalizeServings, portionPreview, servingIndexForEntry, entryFromPortion, reconcileCustomFood, customMacroSourceServing } from '../food/portion.js';
import { buildCustomFood, customFoodForBarcode, normalizeBarcode } from '../food/custom.js';
import { lookupBarcode, searchFoodsPage } from '../food/off.js';
import { searchUsdaPage, hydrateUsdaFood } from '../food/usda.js';
import { startScan, stopScan, scanErrorMessage } from '../food/barcode.js';
import { ensureEntryIds, updateLogEntry, withEntryId } from '../food/log-entry.js';
import { turkishQueryToEnglish } from '../food/translate.js';
import { enFoodToTr } from '../food/tr-foods.js';
import { t, getLang, locale, langChip, wireLangChip } from '../i18n.js';
import { createPickerState } from './diary-state.js';

// Food names come from USDA/OFF in English; show them in Turkish when the
// UI is Turkish (stored data stays canonical English).
const tFood = (label) => (getLang() === 'tr' ? enFoodToTr(label) : label);

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
let date = dstr(), root, ctx, settings, mode = 'consumed', sheet = null;
// sheet = {meal, tab, q, searchPage, hasMore, results, searching, locals,
//          picked:{food, servingIdx, qty}|null, editEntry, editing, subform, recipeDraft, msg, scanning}

// The targets in force for a given date: date-versioned coach prescription,
// overridden by custom targets when selected, shaped by the planner's weekday.
export async function dayTargetFor(db, d) {
  const s = await db.get('settings', 'main');
  const base = activeTargets(s, targetsFor(await db.getAll('targets'), d));
  const plan = await db.get('planner', 'main');
  return plan?.enabled ? { ...dayMacros(plan.days[dowMon(d)].kcal, base), source: base.source } : base;
}

export async function mount(el, c) { root = el; ctx = c; settings = await c.db.get('settings', 'main'); render(); }

const blankLog = () => ({ date, complete: false, meals: MEALS.map((name) => ({ name, entries: [] })) });
const sumEntries = (entries) => entries.reduce(
  (a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }),
  { kcal: 0, p: 0, c: 0, f: 0 });

function fmtDay(d) {
  if (d === dstr()) return t('Today, {date}', { date: niceDate(d) });
  if (d === addDays(dstr(), -1)) return t('Yesterday, {date}', { date: niceDate(d) });
  return new Date(d + 'T12:00:00').toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });
}
const niceDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(locale(), { month: 'short', day: 'numeric' });

function ringsSvg(tt, target) {
  const ring = (r, cls, used, total) => {
    const c = 2 * Math.PI * r;
    const pct = Math.min(total ? used / total : 0, 1);
    return `<circle cx="54" cy="54" r="${r}" class="cr-track"/>
      <circle cx="54" cy="54" r="${r}" class="${cls}" transform="rotate(-90 54 54)"
        stroke-dasharray="${(pct * c).toFixed(1)} ${c.toFixed(1)}"/>`;
  };
  return `<div class="crings"><svg viewBox="0 0 108 108" role="img" aria-label="Macros">
    ${ring(46, 'cr-p', tt.p, target.proteinG)}${ring(34, 'cr-c', tt.c, target.carbG)}${ring(22, 'cr-f', tt.f, target.fatG)}
  </svg></div>`;
}

function summaryCard(tt, target) {
  const rem = (v, tot) => Math.max(0, Math.round(tot - v));
  const left = (v, tot) => (mode === 'consumed' ? Math.round(v) : rem(v, tot));
  return `<div class="seg" style="margin-bottom:12px">
    <button data-mode="consumed" class="${mode === 'consumed' ? 'on' : ''}">${t('Consumed')}</button>
    <button data-mode="remaining" class="${mode === 'remaining' ? 'on' : ''}">${t('Remaining')}</button>
  </div>
  <div class="card"><div class="sumgrid">
    ${ringsSvg(tt, target)}
    <div class="sumrows">
      <div class="sumrow"><span><b style="font-weight:700">${t('Cal')}</b></span><b>${left(tt.kcal, target.kcal)}</b><span class="tgt">${target.kcal}</span></div>
      <div class="sumrow"><span><i class="dot p"></i>${t('Protein')}</span><b>${left(tt.p, target.proteinG)}</b><span class="tgt">${target.proteinG}</span></div>
      <div class="sumrow"><span><i class="dot c"></i>${t('Carbs')}</span><b>${left(tt.c, target.carbG)}</b><span class="tgt">${target.carbG}</span></div>
      <div class="sumrow"><span><i class="dot f"></i>${t('Fat')}</span><b>${left(tt.f, target.fatG)}</b><span class="tgt">${target.fatG}</span></div>
    </div>
  </div>
  ${target.source === 'custom' ? `<p class="hint">${t('Using your custom targets (Settings → Macro targets).')}</p>` : ''}
  <div class="pillrow"><button class="pill" id="toplan">${t('📊 Planner')}</button></div>
  </div>`;
}

async function render() {
  document.body.classList.toggle('picker-open', !!sheet);
  if (sheet) return renderPicker();
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  if (ensureEntryIds(log)) await ctx.db.put('logs', log);
  const target = await dayTargetFor(ctx.db, date);
  const tt = sumEntries(log.meals.flatMap((m) => m.entries));
  root.innerHTML = `
  <div class="hero"><div class="spread">
    <button class="ghost" data-nav="-1">‹</button>
    <h2>${fmtDay(date)}</h2>
    <div class="row" style="flex:none;gap:6px">
      <button class="ghost" data-nav="1">›</button>${langChip()}</div>
  </div></div>
  ${summaryCard(tt, target)}
  ${log.meals.map((m, mi) => {
    const ms = sumEntries(m.entries);
    return `<div class="card meal"><div class="spread"><div>
      <h3 style="margin:0">${t(m.name)}</h3>
      <span class="mealsum">${t('{kcal} Cal, {p}p, {c}c, {f}f', { kcal: Math.round(ms.kcal), p: Math.round(ms.p), c: Math.round(ms.c), f: Math.round(ms.f) })}</span></div>
      <button class="fab" data-add="${mi}" aria-label="${t('Add to {meal}', { meal: t(m.name) })}">+</button></div>
      ${m.entries.map((e, ei) => `<div class="entry">
        ${entryMain(e, mi, ei)}
        <div style="flex:none">${e.kcal} <button class="del" data-del="${mi}:${ei}" aria-label="${t('Delete {label}', { label: e.label })}">×</button></div></div>`).join('')}
    </div>`;
  }).join('')}`;
  wire(log);
}

function entryPortionLabel(e) {
  if (e.unit === 'x') return t('quick add');
  if (e.servingLabel && e.grams > 0) return `${e.qty} × ${e.servingLabel}`;
  if (e.servingLabel) return e.servingLabel === 'serving' ? `${e.qty} × ${t('serving')}` : e.servingLabel;
  if (e.unit === 'serving') return t('{qty} serving', { qty: e.qty });
  return e.grams > 0 ? `${e.grams} g` : t('portion');
}

function entryMain(e, meal, index) {
  const content = `<span>${tFood(e.label)}</span><small>${entryPortionLabel(e)} · P ${e.p} C ${e.c} F ${e.f}</small>`;
  return canEditEntry(e)
    ? `<button class="entryopen" data-entry="${meal}:${index}" data-entry-id="${e.entryId || ''}">${content}</button>`
    : `<div class="entrytext">${content}</div>`;
}

function canEditEntry(e) {
  return e.foodId && e.unit === 'serving' && !String(e.foodId).startsWith('recipe:');
}

function wire(log) {
  wireLangChip(root, () => ctx.refresh()); // refresh via navigate so the tab bar re-translates too
  root.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { date = addDays(date, +b.dataset.nav); sheet = null; render(); }));
  root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; render(); }));
  root.querySelector('#toplan').onclick = () => ctx.navigate('plan');
  root.querySelectorAll('[data-add]').forEach((b) =>
    (b.onclick = () => { openPicker(+b.dataset.add); }));
  root.querySelectorAll('[data-entry]').forEach((b) => (b.onclick = async () => {
    const [mi, ei] = b.dataset.entry.split(':').map(Number);
    await openEntryEditor(log, mi, ei);
  }));
  root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const [mi, ei] = b.dataset.del.split(':').map(Number);
    log.meals[mi].entries.splice(ei, 1);
    await save(log);
  }));
}

async function save(log) { await ctx.db.put('logs', log); render(); }

/* ---------- full-page food picker ---------- */

function openPicker(meal) {
  sheet = createPickerState(meal);
  render();
}

async function addEntry(entry) {
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  log.meals[sheet.meal].entries.push(withEntryId(entry));
  await ctx.db.put('logs', log);
  sheet = null;
  render();
}

async function updateEntry(entry) {
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  const target = sheet.editEntry;
  if (!target) return;
  ensureEntryIds(log);
  updateLogEntry(log, target, entry, sheet.meal);
  await ctx.db.put('logs', log);
  sheet = null;
  render();
}

async function openEntryEditor(log, meal, index) {
  if (ensureEntryIds(log)) await ctx.db.put('logs', log);
  const entry = log.meals[meal]?.entries[index];
  if (!canEditEntry(entry)) return;
  const food = await foodForEntry(entry);
  if (!food) {
    alert(t('This food is no longer in your saved foods. Search or scan it again to edit its servings.'));
    return;
  }
  sheet = createPickerState(meal, {
    picked: { food, servingIdx: servingIndexForEntry(food, entry), qty: entry.qty || 1 },
    editEntry: { meal, index, entryId: entry.entryId },
  });
  render();
}

async function foodForEntry(entry) {
  const id = String(entry.foodId || '');
  if (id.startsWith('custom:')) {
    const food = await ctx.db.get('foods', +id.slice(7));
    return food ? { ...food, id } : null;
  }
  return ctx.db.get('foodcache', id);
}

// Stamp custom foods too, so they surface in Recent.
async function cacheFood(food) {
  if (String(food.id).startsWith('custom:')) {
    const numId = +String(food.id).slice(7);
    const prev = await ctx.db.get('foods', numId);
    if (prev) await ctx.db.put('foods', { ...prev, lastUsed: Date.now() });
    return;
  }
  const prev = await ctx.db.get('foodcache', food.id);
  await ctx.db.put('foodcache', { ...prev, ...food, fav: prev?.fav || false, lastUsed: Date.now() });
}

async function searchFoodSources(query, page = 1) {
  let usdaQuery = query;
  let usdaSkipped = false;
  if (getLang() === 'tr') {
    usdaQuery = await turkishQueryToEnglish(query);
    usdaSkipped = !usdaQuery;
  }
  const settled = await Promise.allSettled([
    searchFoodsPage(query, page),
    usdaSkipped ? Promise.resolve({ foods: [], hasMore: false }) : searchUsdaPage(usdaQuery, settings.usdaApiKey, page),
  ]);
  const [off, usda] = settled.map((r) => r.status === 'fulfilled' ? r.value : { foods: [], hasMore: false });
  const errors = settled.map((r, i) => r.status === 'rejected'
    ? { source: i === 0 ? 'packaged-food' : 'USDA', message: r.reason?.message || 'unavailable' }
    : null).filter(Boolean);
  const foods = [...off.foods, ...usda.foods];
  const hasMore = off.hasMore || usda.hasMore;
  const usingBundledUsda = !settings.usdaApiKey?.trim();
  let msg = null;
  if (foods.length && errors.some((e) => e.source === 'packaged-food')) {
    msg = { type: 'info', text: usingBundledUsda
      ? t('Showing USDA results with the shared app key. Add your own USDA key in Settings if searches start rate-limiting.')
      : t('Showing USDA results. Packaged-food search is temporarily unavailable.') };
  } else if (foods.length && errors.some((e) => e.source === 'USDA')) {
    msg = { type: 'info', text: usingBundledUsda
      ? t('Showing packaged-food results. The shared USDA key may be rate-limited; add your own key in Settings for more reliability.')
      : t('Showing packaged-food results. USDA search is temporarily unavailable.') };
  } else if (errors.length === 2) {
    msg = { type: 'error', text: t('Food search is temporarily unavailable ({errors}). Try again, add a custom food, or add your own USDA key in Settings.', { errors: errors.map((e) => e.message).join('; ') }) };
  } else if (!foods.length) {
    msg = { type: 'empty', text: t('No foods with usable nutrition found for "{query}". Try another search or add a custom food.', { query }) };
  } else if (usdaSkipped) {
    msg = { type: 'info', text: t('USDA search was skipped — the query could not be translated to English.') };
  }
  return { foods, msg, hasMore };
}

// Persist edits (macros/servings) to wherever this food lives.
async function persistFood(food) {
  if (String(food.id).startsWith('custom:')) {
    const numId = +String(food.id).slice(7);
    await ctx.db.put('foods', { ...reconcileCustomFood({ ...food, id: numId }), id: numId });
  } else {
    const prev = await ctx.db.get('foodcache', food.id);
    await ctx.db.put('foodcache', { ...prev, ...food, lastUsed: Date.now() });
  }
}

/* Default portion used for the row subtitle: the food's own serving if it
   has one, otherwise 100 g. */
function defaultPortion(f) {
  const servings = normalizeServings(f);
  const sv = servings.length > 1 ? servings[1] : servings[0];
  const m = portionPreview(f, sv, 1);
  const qty = sv.grams > 0 && sv.grams !== 100 ? `${+sv.grams.toFixed(1)}g` : sv.label;
  return `${qty} · ${t('{kcal} Cal, {p}p, {c}c, {f}f', { kcal: m.kcal, p: m.p, c: m.c, f: m.f })}`;
}

function foodRow(f, i, favs = {}) {
  return `<button class="foodrow" data-open="${i}">
    <span class="frname">${tFood(f.label)}${f.brand ? ` <span class="muted">(${f.brand})</span>` : ''}</span>
    <small class="muted">${favs[f.id] || f.fav ? '★ ' : ''}${defaultPortion(f)}</small>
  </button>`;
}

async function localFoods() {
  if (sheet.locals) return sheet.locals;
  const [cached, customs] = await Promise.all([ctx.db.getAll('foodcache'), ctx.db.getAll('foods')]);
  const customList = customs.map((f) => ({ ...f, id: 'custom:' + f.id, source: 'custom' }));
  sheet.locals = { cached, customs: customList };
  return sheet.locals;
}

function matchLocal(list, q) {
  const needle = q.toLocaleLowerCase(locale());
  return list.filter((f) => `${f.label} ${f.brand || ''}`.toLocaleLowerCase(locale()).includes(needle));
}

/* ---------- picker rendering ---------- */

const mealSelect = () => `<select id="mealpick" class="mealpick">${MEALS.map((m, i) =>
  `<option value="${i}" ${i === sheet.meal ? 'selected' : ''}>${t(m)}</option>`).join('')}</select>`;

async function renderPicker() {
  const renderSeq = ++pickerRenderSeq;
  if (sheet.picked) return renderFoodPage();
  const localsData = await localFoods();
  if (renderSeq !== pickerRenderSeq) return;
  if (sheet.picked) return renderFoodPage();
  const { cached, customs } = localsData;
  const favs = {};
  for (const c of cached) if (c.fav) favs[c.id] = true;

  let body = '';
  if (sheet.searchMode && sheet.q.trim().length >= 2) {
    const q = sheet.q.trim();
    const locals = [...matchLocal(customs, q), ...matchLocal(cached, q)]
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).slice(0, 15);
    sheet.results = [...locals, ...(sheet.online || [])];
    body = `
      ${locals.length ? `<p class="listhead">${t('Recent & My foods ({n})', { n: locals.length })}</p>
        <div class="foodlist">${locals.map((f, i) => foodRow(f, i, favs)).join('')}</div>` : ''}
      ${sheet.searching ? `<p class="muted" style="margin-top:10px">${t('Searching...')}</p>` : ''}
      ${(sheet.online || []).length ? `<p class="listhead">${t('Search results')}</p>
        <div class="foodlist">${sheet.online.map((f, i) => foodRow(f, locals.length + i, favs)).join('')}</div>` : ''}
      ${sheet.msg ? `<p class="${sheet.msg.type === 'error' ? 'msg' : 'muted'}" style="margin-top:8px">${sheet.msg.text}</p>` : ''}
      ${sheet.hasMore && !sheet.searching ? `<button class="ghost" id="morefoods" style="width:100%;margin-top:10px">${t('More results')}</button>` : ''}`;
  } else if (sheet.searchMode) {
    body = `<div class="searchempty">
      <p style="font-size:1.1rem;font-weight:700;margin:26px 0 6px">${t('Find the foods you ate')}</p>
      <p class="muted">${t('Search by food, brand name, or your favorites.')}</p></div>`;
  } else if (sheet.tab === 'recent') {
    const rec = [...cached, ...customs.filter((c) => c.lastUsed)]
      .sort((a, b) => ((b.fav || 0) - (a.fav || 0)) || ((b.lastUsed || 0) - (a.lastUsed || 0))).slice(0, 30);
    sheet.results = rec;
    body = rec.length
      ? `<div class="spread listhead"><span>${t('{n} results', { n: rec.length })}</span><span>${t('Recently used')}</span></div>
        <div class="foodlist">${rec.map((f, i) => foodRow(f, i, favs)).join('')}</div>`
      : `<p class="muted" style="margin-top:16px">${t('Foods you log will appear here.')}</p>`;
  } else if (sheet.tab === 'mine') {
    sheet.results = customs;
    body = `
      <div class="row" style="margin:10px 0">
        <button class="ghost" id="newfoodbtn">${t('+ New custom food')}</button>
        <button class="ghost" id="quickbtn">${t('Quick add')}</button></div>
      ${sheet.subform === 'newfood' ? newFoodForm() : ''}
      ${sheet.subform === 'quick' ? quickAddForm() : ''}
      ${customs.length ? `<div class="foodlist">${customs.map((f, i) => foodRow(f, i, favs)).join('')}</div>`
        : `<p class="muted">${t('Foods you create will appear here.')}</p>`}`;
  } else {
    body = renderRecipeTab(await ctx.db.getAll('recipes'));
    if (renderSeq !== pickerRenderSeq) return;
    if (sheet.picked) return renderFoodPage();
  }

  if (renderSeq !== pickerRenderSeq) return;
  if (sheet.picked) return renderFoodPage();

  root.innerHTML = `<div class="picker">
    <div class="pickerhead">
      ${sheet.searchMode ? '' : `<button class="ghost iconbtn" id="pickerback">‹</button>`}
      ${sheet.searchMode ? '' : mealSelect()}
      <form class="searchbar" id="foodsearch" style="flex:1" role="search">
        <span aria-hidden="true">🔍</span>
        <input id="q" type="search" enterkeyhint="search" placeholder="${t('Search')}" value="${sheet.q}" autocomplete="off" autocapitalize="none" spellcheck="false">
        <button class="scanicon searchgo" id="gosearch" type="submit" aria-label="${t('Search')}">↵</button>
        <button class="scanicon" id="scan" type="button" aria-label="${t('📷 Scan')}">▦</button>
      </form>
      ${sheet.searchMode ? `<button class="ghost" id="cancelsearch">${t('Cancel')}</button>` : ''}
    </div>
    <div id="scanbox"></div>
    ${sheet.searchMode ? '' : `<div class="pickertabs">${[['recent', t('Recent')], ['mine', t('My Foods')], ['recipe', t('Recipes')]]
      .map(([id, l]) => `<button data-tab="${id}" class="${sheet.tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>`}
    ${body}</div>`;
  wirePicker();
}

function newFoodForm() {
  return `<div class="card" style="margin:8px 0">
    <h3>${t('New custom food')}</h3>
    <input id="cname" placeholder="${t('Name')}">
    <input id="cbarcode" inputmode="numeric" placeholder="${t('barcode (optional)')}" style="margin-top:6px">
    <div class="row" style="margin-top:6px"><input id="cslabel" placeholder="${t('serving name (e.g. 2/3 cup)')}"><input id="csgrams" type="number" placeholder="${t('grams')}"></div>
    <label id="cmacros">${t('Macros per 100 g')}</label>
    <div class="row"><input id="ck" type="number" placeholder="${t('kcal')}"><input id="cp" type="number" placeholder="${t('protein')}"></div>
    <div class="row" style="margin-top:6px"><input id="cc" type="number" placeholder="${t('carbs')}"><input id="cf" type="number" placeholder="${t('fat')}"></div>
    <p class="hint">${t('Enter the macros for the serving above. Leave the serving blank to enter per 100 g instead.')}</p>
    <button class="ghost" id="csave" style="margin-top:8px">${t('Save food')}</button></div>`;
}

function quickAddForm() {
  return `<div class="card" style="margin:8px 0">
    <h3>${t('Quick add')}</h3>
    <input id="qlabel" placeholder="${t('Label (optional)')}">
    <div class="row" style="margin-top:6px"><input id="qk" type="number" placeholder="${t('kcal')}"><input id="qp" type="number" placeholder="${t('protein g')}"></div>
    <div class="row" style="margin-top:6px"><input id="qc" type="number" placeholder="${t('carbs g')}"><input id="qf" type="number" placeholder="${t('fat g')}"></div>
    <button class="ghost" id="qadd" style="margin-top:8px">${t('Add')}</button></div>`;
}

let searchTimer = null, pickerRenderSeq = 0;
async function runOnlineSearch(append = false) {
  if (!sheet) return; // debounce timer can outlive the picker
  const query = sheet.q.trim();
  if (query.length < 2) return;
  sheet.searchPage = append ? (sheet.searchPage || 1) + 1 : 1;
  sheet.searching = true;
  if (!append) { sheet.online = []; sheet.msg = ''; }
  renderPickerStable();
  try {
    const { foods, msg, hasMore } = await searchFoodSources(query, sheet.searchPage);
    if (!sheet || sheet.picked || sheet.q.trim() !== query) return; // picker closed, selected, or stale response
    const hydrated = await Promise.all(foods.map(async (f) => (await ctx.db.get('foodcache', f.id)) ?? f));
    if (!sheet || sheet.picked || sheet.q.trim() !== query) return;
    sheet.online = append ? mergeFoods(sheet.online || [], hydrated) : hydrated;
    sheet.hasMore = hasMore;
    sheet.msg = msg;
  } catch (e) {
    if (!append) sheet.online = [];
    sheet.hasMore = false;
    sheet.msg = { type: 'error', text: t('Food search is temporarily unavailable: {message}', { message: e.message }) };
  } finally {
    if (sheet && !sheet.picked) { sheet.searching = false; renderPickerStable(); }
  }
}

function wirePicker() {
  const q = (sel) => root.querySelector(sel);
  const back = q('#pickerback');
  if (back) back.onclick = () => { clearTimeout(searchTimer); sheet = null; render(); };
  const mp = q('#mealpick');
  if (mp) mp.onchange = () => { sheet.meal = +mp.value; };
  root.querySelectorAll('[data-tab]').forEach((b) =>
    (b.onclick = () => { sheet.tab = b.dataset.tab; sheet.subform = null; renderPickerStable(); }));

  const submitSearch = () => {
    clearTimeout(searchTimer);
    const input = q('#q');
    if (input) sheet.q = input.value;
    sheet.searchMode = true;
    sheet.online = [];
    sheet.msg = '';
    sheet.hasMore = false;
    renderPickerStable().then(() => runOnlineSearch(false));
  };

  /* search field: submit explicitly so mobile keyboards are not dismissed by
     a full picker remount after every keystroke. */
  const input = q('#q');
  if (input) {
    input.oninput = () => {
      sheet.q = input.value;
      clearTimeout(searchTimer);
      if (sheet.q.trim().length < 2) { sheet.online = []; sheet.msg = ''; sheet.hasMore = false; }
    };
  }
  const searchForm = q('#foodsearch');
  if (searchForm) searchForm.onsubmit = (e) => { e.preventDefault(); submitSearch(); };
  const cancel = q('#cancelsearch');
  if (cancel) cancel.onclick = () => {
    clearTimeout(searchTimer);
    sheet.searchMode = false; sheet.q = ''; sheet.online = []; sheet.msg = ''; sheet.hasMore = false;
    renderPickerStable();
  };
  const more = q('#morefoods');
  if (more) more.onclick = () => runOnlineSearch(true);
  const scan = q('#scan');
  if (scan) scan.onclick = () => startBarcodeScan(root);

  root.querySelectorAll('[data-open]').forEach((b) =>
    (b.onclick = async () => {
      const food = sheet.results[+b.dataset.open];
      const hydrated = food?.source === 'usda' ? await hydrateUsdaFood(food, settings.usdaApiKey) : food;
      selectFood(hydrated);
    }));

  /* my foods: subforms */
  const nf = q('#newfoodbtn');
  if (nf) nf.onclick = () => { sheet.subform = sheet.subform === 'newfood' ? null : 'newfood'; renderPickerStable(); };
  const qb = q('#quickbtn');
  if (qb) qb.onclick = () => { sheet.subform = sheet.subform === 'quick' ? null : 'quick'; renderPickerStable(); };
  const csgrams = q('#csgrams');
  if (csgrams) {
    const syncMacroLabel = () => {
      const g = +csgrams.value;
      q('#cmacros').textContent = g > 0
        ? t('Macros for {label} ({g} g)', { label: q('#cslabel').value.trim() || t('this serving'), g })
        : t('Macros per 100 g');
    };
    csgrams.oninput = syncMacroLabel;
    q('#cslabel').oninput = syncMacroLabel;
  }
  const csave = q('#csave');
  if (csave) csave.onclick = async () => {
    const name = q('#cname').value.trim();
    if (!name) return;
    await ctx.db.put('foods', buildCustomFood({
      label: name, barcode: q('#cbarcode').value,
      macros: { kcal: +q('#ck').value || 0, p: +q('#cp').value || 0, c: +q('#cc').value || 0, f: +q('#cf').value || 0 },
      servingLabel: q('#cslabel').value, servingGrams: +q('#csgrams').value,
    }));
    sheet.subform = null;
    sheet.locals = null; // refresh cache
    renderPickerStable();
  };
  const qadd = q('#qadd');
  if (qadd) qadd.onclick = () => addEntry({
    label: q('#qlabel').value.trim() || t('Quick add'), brand: '', qty: 1, unit: 'x',
    kcal: +q('#qk').value || 0, p: +q('#qp').value || 0, c: +q('#qc').value || 0, f: +q('#qf').value || 0,
  });
  wireRecipeTab(root);
}

function selectFood(hydrated) {
  const servings = normalizeServings(hydrated);
  pickerRenderSeq += 1;
  sheet.picked = { food: hydrated, servingIdx: servings.length > 1 ? 1 : 0, qty: 1 };
  sheet.editing = false;
  renderFoodPage();
}

/* Re-render just the picker list while typing (keeps the input focused). */
function renderListOnly() {
  renderPickerStable({ keepFocus: true });
}

async function renderPickerStable(opts = {}) {
  const top = root.scrollTop; // root is #view, the app's scroll container
  const hadFocus = opts.keepFocus && document.activeElement?.id === 'q';
  const selStart = hadFocus ? document.activeElement.selectionStart : null;
  await renderPicker();
  root.scrollTop = top;
  if (hadFocus) {
    const input = root.querySelector('#q');
    if (input) { input.focus(); input.setSelectionRange(selStart, selStart); }
  }
}

function mergeFoods(existing, incoming) {
  const seen = new Set(existing.map((f) => f.id));
  return [...existing, ...incoming.filter((f) => !seen.has(f.id) && seen.add(f.id))];
}

/* ---------- food page: nutrition + serving adjustment ---------- */

function renderFoodPage() {
  const { food, servingIdx, qty } = sheet.picked;
  const servings = normalizeServings(food);
  const sv = servings[Math.min(servingIdx, servings.length - 1)];
  const m = portionPreview(food, sv, qty);
  if (sheet.editing) { root.innerHTML = `<div class="picker">${editView(food, servings)}</div>`; wireEditView(); return; }
  root.innerHTML = `<div class="picker">
    <div class="pickerhead">
      <button class="ghost iconbtn" id="pback">×</button>
      ${mealSelect()}
      <button class="ghost" id="pedit">${t('Edit')}</button>
    </div>
    <h1 style="margin:14px 0 2px">${tFood(food.label)}</h1>
    ${food.brand ? `<p class="muted" style="margin:0 0 10px">${food.brand}</p>` : '<div style="height:10px"></div>'}
    <div class="macrostrip card">
      <div><b id="pkcal">${m.kcal}</b><span>${t('Cal')}</span></div>
      <div><b id="pp" class="mp">${m.p}</b><span>${t('Protein (g)')}</span></div>
      <div><b id="pc" class="mc">${m.c}</b><span>${t('Carbs (g)')}</span></div>
      <div><b id="pf" class="mf">${m.f}</b><span>${t('Fat (g)')}</span></div>
    </div>
    <div class="row" style="margin:14px 0 0">
      <input type="number" id="pqty" step="0.25" min="0" value="${qty}" style="flex:0 0 84px;text-align:center">
      <select id="servsel" style="flex:1">${servings.map((s, i) =>
        `<option value="${i}" ${i === Math.min(servingIdx, servings.length - 1) ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
    </div>
    <p class="hint" id="ppreview">${portionPreviewHint(sv, qty, m)}</p>
    <button class="primary" id="paddconfirm">${sheet.editEntry ? t('Update entry') : t('Add food')}</button>
    <div class="card" style="margin-top:18px">
      <h2>${t('Nutrition')}</h2>
      <div class="listrow"><span>${t('Calories')}</span><b id="nkcal">${m.kcal}</b></div>
      <div class="listrow"><span>${t('Protein')}</span><b id="np">${m.p} g</b></div>
      <div class="listrow"><span>${t('Carbs')}</span><b id="nc">${m.c} g</b></div>
      <div class="listrow"><span>${t('Fat')}</span><b id="nf">${m.f} g</b></div>
    </div></div>`;
  wireFoodPage();
}

function portionPreviewHint(serving, qty, preview) {
  return serving.grams > 0
    ? `${qty} × ${serving.label} = ${preview.grams} g`
    : t('Serving macros are entered directly for {label}.', { label: serving.label });
}

function updatePortionPreview() {
  if (!sheet?.picked || sheet.editing) return;
  const { food, servingIdx, qty } = sheet.picked;
  const servings = normalizeServings(food);
  const sv = servings[Math.min(servingIdx, servings.length - 1)];
  const m = portionPreview(food, sv, qty);
  const set = (id, value) => {
    const node = root.querySelector(id);
    if (node) node.textContent = value;
  };
  set('#pkcal', m.kcal); set('#pp', m.p); set('#pc', m.c); set('#pf', m.f);
  set('#nkcal', m.kcal); set('#np', `${m.p} g`); set('#nc', `${m.c} g`); set('#nf', `${m.f} g`);
  set('#ppreview', portionPreviewHint(sv, qty, m));
}

function wireFoodPage() {
  const q = (sel) => root.querySelector(sel);
  q('#pback').onclick = () => {
    if (sheet.editEntry) { sheet = null; render(); return; }
    sheet.picked = null;
    renderPickerStable();
  };
  const mp = q('#mealpick');
  if (mp) mp.onchange = () => { sheet.meal = +mp.value; };
  q('#pedit').onclick = () => { sheet.editing = true; renderPickerStable(); };
  const servsel = q('#servsel');
  servsel.onchange = () => { sheet.picked.servingIdx = +servsel.value; updatePortionPreview(); };
  const pqty = q('#pqty');
  pqty.oninput = () => { sheet.picked.qty = +pqty.value || 0; updatePortionPreview(); };
  q('#paddconfirm').onclick = async () => {
    const { food, servingIdx } = sheet.picked;
    const qty = +q('#pqty')?.value || 0;
    if (!qty) return;
    const servings = normalizeServings(food);
    const sv = servings[Math.min(servingIdx, servings.length - 1)];
    await cacheFood({ ...food, servings });
    const entry = entryFromPortion(food, sv, qty);
    if (sheet.editEntry) await updateEntry(entry);
    else await addEntry(entry);
  };
}

/* ---------- food edit form (macros/servings) ---------- */

function editView(food, servings) {
  const source = String(food.id).startsWith('custom:') ? customMacroSourceServing({ ...food, servings }) : null;
  const row = (s, i, fixed = false) => fixed
    ? `<div class="servedit fixed" data-servrow="${i}"><span class="muted">${t('100 g (always available)')}</span></div>`
    : `<div class="servedit" data-servrow="${i}">
        <input data-slabel="${i}" value="${s.label}" placeholder="${t('Serving')}">
        <input data-sgrams="${i}" type="number" step="0.1" value="${s.grams ?? ''}" placeholder="g">
        <input data-skcal="${i}" type="number" step="0.1" value="${s.macros?.kcal ?? ''}" placeholder="${t('kcal')}">
        <input data-sp="${i}" type="number" step="0.1" value="${s.macros?.p ?? ''}" placeholder="P">
        <input data-sc="${i}" type="number" step="0.1" value="${s.macros?.c ?? ''}" placeholder="C">
        <input data-sf="${i}" type="number" step="0.1" value="${s.macros?.f ?? ''}" placeholder="F">
        <button class="del" data-sdel="${i}">×</button>
      </div>`;
  return `<div class="backbar"><button class="ghost" id="peditback">${t('‹ Cancel')}</button>
    <h2 style="flex:1">${t('Edit food')}</h2></div>
  <label>${t('Name')}</label><input id="ename" value="${food.label}">
  <label>${t('Barcode (optional)')}</label><input id="ebarcode" inputmode="numeric" value="${food.barcode || ''}" placeholder="${t('Scan or type barcode')}">
  <label>${t('Macros per 100 g')}</label>
  <div class="macroedit">
    <label>${t('Calories')}<input id="ek" type="number" step="0.1" value="${food.per100g.kcal}"></label>
    <label>${t('Protein (g)')}<input id="ep" type="number" step="0.1" value="${food.per100g.p}"></label>
    <label>${t('Carbs (g)')}<input id="ec" type="number" step="0.1" value="${food.per100g.c}"></label>
    <label>${t('Fat (g)')}<input id="ef" type="number" step="0.1" value="${food.per100g.f}"></label>
  </div>
  ${source ? `<p class="hint sourcehint">${t('100 g is calculated from {label} ({grams} g).', { label: source.label, grams: source.grams })}</p>` : ''}
  <label>${t('Servings')}</label>
  ${servings.map((s, i) => s.grams === 100 ? row(s, i, true) : row(s, i)).join('')}
  <div class="servedit add">
    <input id="nslabel" placeholder="${t('e.g. 1 cup')}">
    <input id="nsgrams" type="number" step="0.1" placeholder="g">
    <input id="nskcal" type="number" step="0.1" placeholder="${t('kcal')}">
    <input id="nsp" type="number" step="0.1" placeholder="P">
    <input id="nsc" type="number" step="0.1" placeholder="C">
    <input id="nsf" type="number" step="0.1" placeholder="F">
    <button class="ghost" id="nsadd" style="padding:8px">+</button></div>
  <p class="hint">${t('Each serving can be gram-based, macro-based, or both. If you enter macros, the app will use them for that serving instead of scaling from 100 g.')}</p>
  <button class="primary" id="esave">${t('Save food')}</button>`;
}

function wireEditView() {
  const q = (sel) => root.querySelector(sel);
  q('#peditback').onclick = () => { sheet.editing = false; renderPickerStable(); };
  const nsadd = q('#nsadd');
  if (nsadd) nsadd.onclick = () => {
    keepEdits(root);
    const label = q('#nslabel').value.trim(), grams = +q('#nsgrams').value;
    const macros = readMacros(q, 'ns');
    if (!label || !(grams > 0) && !macros) return;
    sheet.picked.food.servings = [...normalizeServings(sheet.picked.food), { label, ...(grams > 0 ? { grams } : {}), ...(macros ? { macros } : {}) }];
    renderPickerStable();
  };
  root.querySelectorAll('[data-sdel]').forEach((b) => (b.onclick = () => {
    keepEdits(root);
    const servings = normalizeServings(sheet.picked.food);
    servings.splice(+b.dataset.sdel, 1);
    sheet.picked.food.servings = servings;
    renderPickerStable();
  }));
  q('#esave').onclick = async () => {
    keepEdits(root);
    await persistFood({ ...sheet.picked.food, servings: normalizeServings(sheet.picked.food) });
    sheet.editing = false;
    sheet.locals = null;
    sheet.picked.servingIdx = Math.min(sheet.picked.servingIdx, normalizeServings(sheet.picked.food).length - 1);
    renderPickerStable();
  };
}

// pull current edit-form values into sheet.picked.food before any re-render
function keepEdits(el) {
  const q = (sel) => el.querySelector(sel);
  const food = sheet.picked.food;
  if (!q('#ename')) return;
  food.label = q('#ename').value.trim() || food.label;
  food.barcode = normalizeBarcode(q('#ebarcode')?.value);
  food.per100g = {
    kcal: +q('#ek').value || 0, p: +q('#ep').value || 0,
    c: +q('#ec').value || 0, f: +q('#ef').value || 0,
  };
  const servings = normalizeServings(food);
  el.querySelectorAll('[data-slabel]').forEach((inp) => { servings[+inp.dataset.slabel].label = inp.value; });
  el.querySelectorAll('[data-sgrams]').forEach((inp) => {
    const i = +inp.dataset.sgrams;
    const v = +inp.value;
    if (v > 0) servings[i].grams = v;
    else delete servings[i].grams;
  });
  servings.forEach((serving, i) => setMacros(serving, q, i));
  food.servings = servings;
}

function readMacros(q, prefix) {
  const kcal = +q(`#${prefix}kcal`)?.value || 0;
  const p = +q(`#${prefix}p`)?.value || 0;
  const c = +q(`#${prefix}c`)?.value || 0;
  const f = +q(`#${prefix}f`)?.value || 0;
  return (kcal || p || c || f) ? { kcal, p, c, f } : null;
}

function setMacros(serving, q, idx) {
  const row = q(`[data-servrow="${idx}"]`);
  if (!row) return;
  const macros = {
    kcal: +row.querySelector('[data-skcal]')?.value || 0,
    p: +row.querySelector('[data-sp]')?.value || 0,
    c: +row.querySelector('[data-sc]')?.value || 0,
    f: +row.querySelector('[data-sf]')?.value || 0,
  };
  const has = macros.kcal || macros.p || macros.c || macros.f;
  if (has) serving.macros = macros;
  else delete serving.macros;
}

/* ---------- recipes ---------- */

function renderRecipeTab(recipes) {
  const d = sheet.recipeDraft;
  if (!d) {
    return `${recipes.map((r) => `<div class="result"><div>${r.name}
        <small class="muted">${t('{kcal} kcal/serving · makes {n}', { kcal: Math.round(r.perServing.kcal), n: r.servings })}</small></div>
      <input type="number" step="0.5" value="1" data-recqty="${r.id}" style="width:64px">
      <button class="ghost" data-recadd="${r.id}">${t('Add')}</button></div>`).join('')
      || `<p class="muted" style="margin-top:16px">${t('No recipes yet.')}</p>`}
      <button class="ghost" id="recnew" style="margin-top:10px">${t('+ New recipe')}</button>`;
  }
  return `<h3 style="margin-top:12px">${t('New recipe')}</h3>
    <input id="rname" placeholder="${t('Recipe name')}" value="${d.name}">
    <label>${t('Servings it makes')}</label><input id="rserv" type="number" value="${d.servings}">
    <div class="row" style="margin-top:8px"><input id="rq" placeholder="${t('Search ingredient…')}">
      <button class="ghost" id="rgo">${t('Search')}</button></div>
    ${(d.results || []).map((f, i) => `<div class="result"><div>${tFood(f.label)}<small class="muted"> ${t('{kcal} kcal/100g', { kcal: Math.round(f.per100g.kcal) })}</small></div>
      <input type="number" placeholder="g" data-ring-g="${i}" style="width:70px">
      <button class="ghost" data-ringadd="${i}">${t('Add')}</button></div>`).join('')}
    ${d.ingredients.length ? `<h3 style="margin-top:10px">${t('Ingredients')}</h3>` : ''}
    ${d.ingredients.map((ing, i) => `<div class="entry"><div>${tFood(ing.label)} <small>${ing.grams} g</small></div>
      <button class="del" data-ringdel="${i}">×</button></div>`).join('')}
    <button class="ghost" id="rsave" style="margin-top:10px">${t('Save recipe')}</button>`;
}

function wireRecipeTab(el) {
  const q = (sel) => el.querySelector(sel);
  const recnew = q('#recnew');
  if (recnew) recnew.onclick = () => { sheet.recipeDraft = { name: '', servings: 4, results: [], ingredients: [] }; renderPickerStable(); };
  el.querySelectorAll('[data-recadd]').forEach((b) => (b.onclick = async () => {
    const r = await ctx.db.get('recipes', +b.dataset.recadd);
    const qty = +el.querySelector(`[data-recqty="${r.id}"]`).value || 0;
    if (!qty) return;
    await addEntry({
      label: r.name, brand: 'recipe', foodId: 'recipe:' + r.id, qty, unit: 'serving', servingLabel: 'serving',
      kcal: Math.round(r.perServing.kcal * qty), p: +(r.perServing.p * qty).toFixed(1),
      c: +(r.perServing.c * qty).toFixed(1), f: +(r.perServing.f * qty).toFixed(1),
    });
  }));
  const d = sheet.recipeDraft;
  if (!d) return;
  const keep = () => { d.name = q('#rname').value; d.servings = +q('#rserv').value || 1; };
  const rgo = q('#rgo');
  if (rgo) rgo.onclick = async () => {
    keep();
    d.results = (await searchFoodSources(q('#rq').value.trim())).foods;
    renderPickerStable();
  };
  el.querySelectorAll('[data-ringadd]').forEach((b) => (b.onclick = () => {
    keep();
    const i = +b.dataset.ringadd;
    const grams = +el.querySelector(`[data-ring-g="${i}"]`).value;
    if (!grams) return;
    const f = d.results[i];
    d.ingredients.push({ label: f.label, grams, per100g: f.per100g });
    renderPickerStable();
  }));
  el.querySelectorAll('[data-ringdel]').forEach((b) => (b.onclick = () => { keep(); d.ingredients.splice(+b.dataset.ringdel, 1); renderPickerStable(); }));
  const rsave = q('#rsave');
  if (rsave) rsave.onclick = async () => {
    keep();
    if (!d.name || !d.ingredients.length) return;
    const tot = d.ingredients.reduce((a, ing) => {
      const s = ing.grams / 100;
      return { kcal: a.kcal + ing.per100g.kcal * s, p: a.p + ing.per100g.p * s, c: a.c + ing.per100g.c * s, f: a.f + ing.per100g.f * s };
    }, { kcal: 0, p: 0, c: 0, f: 0 });
    const n = d.servings || 1;
    await ctx.db.put('recipes', {
      name: d.name, servings: n, ingredients: d.ingredients,
      perServing: { kcal: tot.kcal / n, p: tot.p / n, c: tot.c / n, f: tot.f / n },
    });
    sheet.recipeDraft = null;
    renderPickerStable();
  };
}

/* ---------- barcode ---------- */

async function startBarcodeScan(el) {
  const box = el.querySelector('#scanbox');
  box.innerHTML = `<video class="scanner" playsinline muted></video>
    <button class="ghost" id="scanstop" style="margin-top:6px">${t('Stop')}</button>
    <p class="muted" id="scanmsg">${t('Point the camera at a barcode…')}</p>`;
  const video = box.querySelector('video');
  el.querySelector('#scanstop').onclick = () => { stopScan(); box.innerHTML = ''; };
  try {
    await startScan(video, async (code) => {
      stopScan();
      box.querySelector('#scanmsg').textContent = t('Looking up {code}…', { code });
      const custom = customFoodForBarcode(await ctx.db.getAll('foods'), code);
      const food = custom ?? (await ctx.db.get('foodcache', 'off:' + code)) ?? await lookupBarcode(code);
      if (!food) {
        box.querySelector('#scanmsg').textContent = t('No product found for {code}.', { code });
        return;
      }
      const hydrated = food.source === 'usda' ? await hydrateUsdaFood(food, settings.usdaApiKey) : food;
      selectFood(hydrated);
    });
  } catch (e) {
    box.innerHTML = `<p class="msg">${t(scanErrorMessage(e))}</p>`;
  }
}
