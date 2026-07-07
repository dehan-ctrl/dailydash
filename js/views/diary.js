import { dstr, addDays, dowMon } from '../util.js';
import { dayMacros } from '../engine/planner.js';
import { targetsFor, activeTargets } from '../engine/targets.js';
import { normalizeServings, portionPreview, servingIndexForEntry, entryFromPortion, reconcileCustomFood, customMacroSourceServing } from '../food/portion.js';
import { buildCustomFood, customFoodForBarcode, normalizeBarcode } from '../food/custom.js';
import { lookupBarcode, searchFoodsPage } from '../food/off.js';
import { searchUsdaPage, hydrateUsdaFood } from '../food/usda.js';
import { startScan, stopScan, scanErrorMessage } from '../food/barcode.js';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
let date = dstr(), root, ctx, settings, mode = 'consumed', sheet = null;
// sheet = {meal, tab, q, searchPage, hasMore, results, picked:{food, servingIdx, qty}|null, editEntry, editing, recipeDraft, busy, msg}

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
  if (d === dstr()) return `Today, ${niceDate(d)}`;
  if (d === addDays(dstr(), -1)) return `Yesterday, ${niceDate(d)}`;
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
const niceDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function ringsSvg(t, target) {
  const ring = (r, cls, used, total) => {
    const c = 2 * Math.PI * r;
    const pct = Math.min(total ? used / total : 0, 1);
    return `<circle cx="54" cy="54" r="${r}" class="cr-track"/>
      <circle cx="54" cy="54" r="${r}" class="${cls}" transform="rotate(-90 54 54)"
        stroke-dasharray="${(pct * c).toFixed(1)} ${c.toFixed(1)}"/>`;
  };
  return `<div class="crings"><svg viewBox="0 0 108 108" role="img" aria-label="Macros">
    ${ring(46, 'cr-p', t.p, target.proteinG)}${ring(34, 'cr-c', t.c, target.carbG)}${ring(22, 'cr-f', t.f, target.fatG)}
  </svg></div>`;
}

function summaryCard(t, target) {
  const rem = (v, tot) => Math.max(0, Math.round(tot - v));
  const left = (v, tot) => (mode === 'consumed' ? Math.round(v) : rem(v, tot));
  return `<div class="seg" style="margin-bottom:12px">
    <button data-mode="consumed" class="${mode === 'consumed' ? 'on' : ''}">Consumed</button>
    <button data-mode="remaining" class="${mode === 'remaining' ? 'on' : ''}">Remaining</button>
  </div>
  <div class="card"><div class="sumgrid">
    ${ringsSvg(t, target)}
    <div class="sumrows">
      <div class="sumrow"><span><b style="font-weight:700">Cal</b></span><b>${left(t.kcal, target.kcal)}</b><span class="tgt">${target.kcal}</span></div>
      <div class="sumrow"><span><i class="dot p"></i>Protein</span><b>${left(t.p, target.proteinG)}</b><span class="tgt">${target.proteinG}</span></div>
      <div class="sumrow"><span><i class="dot c"></i>Carbs</span><b>${left(t.c, target.carbG)}</b><span class="tgt">${target.carbG}</span></div>
      <div class="sumrow"><span><i class="dot f"></i>Fat</span><b>${left(t.f, target.fatG)}</b><span class="tgt">${target.fatG}</span></div>
    </div>
  </div>
  ${target.source === 'custom' ? '<p class="hint">Using your custom targets (Settings → Macro targets).</p>' : ''}
  <div class="pillrow"><button class="pill" id="toplan">📊 Planner</button></div>
  </div>`;
}

async function render() {
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  const target = await dayTargetFor(ctx.db, date);
  const t = sumEntries(log.meals.flatMap((m) => m.entries));
  root.innerHTML = `
  <div class="hero"><div class="spread">
    <button class="ghost" data-nav="-1">‹</button>
    <h2>${fmtDay(date)}</h2>
    <button class="ghost" data-nav="1">›</button>
  </div></div>
  ${summaryCard(t, target)}
  ${log.meals.map((m, mi) => {
    const ms = sumEntries(m.entries);
    return `<div class="card meal"><div class="spread"><div>
      <h3 style="margin:0">${m.name}</h3>
      <span class="mealsum">${Math.round(ms.kcal)} Cal, ${Math.round(ms.p)}p, ${Math.round(ms.c)}c, ${Math.round(ms.f)}f</span></div>
      <button class="fab" data-add="${mi}" aria-label="Add to ${m.name}">+</button></div>
      ${m.entries.map((e, ei) => `<div class="entry">
        ${entryMain(e, mi, ei)}
        <div style="flex:none">${e.kcal} <button class="del" data-del="${mi}:${ei}" aria-label="Delete ${e.label}">×</button></div></div>`).join('')}
    </div>`;
  }).join('')}
  <div id="sheetroot"></div>`;
  wire(log);
  if (sheet) renderSheet();
}

function entryPortionLabel(e) {
  if (e.unit === 'x') return 'quick add';
  if (e.servingLabel && e.grams > 0) return `${e.qty} × ${e.servingLabel}`;
  if (e.servingLabel) return e.servingLabel;
  if (e.unit === 'serving') return `${e.qty} serving`;
  return e.grams > 0 ? `${e.grams} g` : 'portion';
}

function entryMain(e, meal, index) {
  const content = `<span>${e.label}</span><small>${entryPortionLabel(e)} · P ${e.p} C ${e.c} F ${e.f}</small>`;
  return canEditEntry(e)
    ? `<button class="entryopen" data-entry="${meal}:${index}">${content}</button>`
    : `<div class="entrytext">${content}</div>`;
}

function canEditEntry(e) {
  return e.foodId && e.unit === 'serving' && !String(e.foodId).startsWith('recipe:');
}

function wire(log) {
  root.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { date = addDays(date, +b.dataset.nav); sheet = null; render(); }));
  root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; render(); }));
  root.querySelector('#toplan').onclick = () => ctx.navigate('plan');
  root.querySelectorAll('[data-add]').forEach((b) =>
    (b.onclick = () => { sheet = { meal: +b.dataset.add, tab: 'search', q: '', results: [], picked: null, editEntry: null, editing: false, recipeDraft: null, msg: '' }; render(); }));
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

/* ---------- add-food sheet ---------- */

async function addEntry(entry) {
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  log.meals[sheet.meal].entries.push(entry);
  await ctx.db.put('logs', log);
  sheet = null;
  render();
}

async function updateEntry(entry) {
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  const target = sheet.editEntry;
  if (!target) return;
  log.meals[target.meal].entries[target.index] = entry;
  await ctx.db.put('logs', log);
  sheet = null;
  render();
}

async function openEntryEditor(log, meal, index) {
  const entry = log.meals[meal]?.entries[index];
  if (!canEditEntry(entry)) return;
  const food = await foodForEntry(entry);
  if (!food) {
    alert('This food is no longer in your saved foods. Search or scan it again to edit its servings.');
    return;
  }
  sheet = {
    meal, tab: 'search', q: '', searchPage: 1, hasMore: false, results: [], picked: {
      food,
      servingIdx: servingIndexForEntry(food, entry),
      qty: entry.qty || 1,
    },
    editEntry: { meal, index }, editing: false, recipeDraft: null, msg: '',
  };
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

async function cacheFood(food) {
  if (String(food.id).startsWith('custom:')) return; // custom foods live in `foods`
  const prev = await ctx.db.get('foodcache', food.id);
  await ctx.db.put('foodcache', { ...prev, ...food, fav: prev?.fav || false, lastUsed: Date.now() });
}

async function searchFoodSources(query, page = 1) {
  const settled = await Promise.allSettled([
    searchFoodsPage(query, page),
    searchUsdaPage(query, settings.usdaApiKey, page),
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
      ? 'Showing USDA results with the shared app key. Add your own USDA key in Settings if searches start rate-limiting.'
      : 'Showing USDA results. Packaged-food search is temporarily unavailable.' };
  } else if (foods.length && errors.some((e) => e.source === 'USDA')) {
    msg = { type: 'info', text: usingBundledUsda
      ? 'Showing packaged-food results. The shared USDA key may be rate-limited; add your own key in Settings for more reliability.'
      : 'Showing packaged-food results. USDA search is temporarily unavailable.' };
  } else if (!foods.length && errors.length === settled.length) {
    msg = { type: 'error', text: `Food search is temporarily unavailable (${errors.map((e) => e.message).join('; ')}). Try again, add a custom food, or add your own USDA key in Settings.` };
  } else if (!foods.length) {
    msg = { type: 'empty', text: `No foods with usable nutrition found for "${query}". Try another search or add a custom food.` };
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

function resultRow(f, i, favs = {}) {
  const per = `${Math.round(f.per100g.kcal)} kcal/100g`;
  return `<div class="result">
    <button class="open" data-open="${i}">${f.label}<small class="muted"> ${f.brand || ''}</small><br><small class="muted">${per}</small></button>
    <button class="fav ${favs[f.id] ? 'on' : ''}" data-fav="${i}">★</button>
    <button class="ghost" data-open="${i}">View</button></div>`;
}

function mergeFoods(existing, incoming) {
  const seen = new Set(existing.map((f) => f.id));
  return [...existing, ...incoming.filter((f) => !seen.has(f.id) && seen.add(f.id))];
}

/* food detail: serving picker + editable macros/servings */
function detailView() {
  const { food, servingIdx, qty } = sheet.picked;
  const servings = normalizeServings(food);
  const sv = servings[Math.min(servingIdx, servings.length - 1)];
  const m = portionPreview(food, sv, qty);
  if (sheet.editing) return editView(food, servings);
  return `<div class="backbar"><button class="ghost" id="pback">‹ Back</button>
    <h2 style="flex:1">${food.label}</h2>
    <button class="ghost" id="pedit">Edit</button></div>
  ${food.brand ? `<p class="muted" style="margin-top:-6px">${food.brand}</p>` : ''}
  <label>Serving</label>
  <div class="chiprow">${servings.map((s, i) =>
    `<button class="chip ${i === Math.min(servingIdx, servings.length - 1) ? 'on' : ''}" data-serv="${i}">${s.label}</button>`).join('')}</div>
  <label>How many servings? (0.5 = half)</label>
  <input type="number" id="pqty" step="0.25" min="0" value="${qty}">
  <div class="macrogrid">
    <div><b id="pkcal">${m.kcal}</b><span>Calories</span></div><div><b id="pp">${m.p}g</b><span>Protein</span></div>
    <div><b id="pc">${m.c}g</b><span>Carbs</span></div><div><b id="pf">${m.f}g</b><span>Fat</span></div>
  </div>
  <p class="hint" id="ppreview">${portionPreviewHint(sv, qty, m)}</p>
  <button class="primary" id="paddconfirm">${sheet.editEntry ? `Update ${MEALS[sheet.meal]} entry` : `Add to ${MEALS[sheet.meal]}`}</button>`;
}

function portionPreviewHint(serving, qty, preview) {
  return serving.grams > 0
    ? `${qty} × ${serving.label} = ${preview.grams} g`
    : `Serving macros are entered directly for ${serving.label}.`;
}

function editView(food, servings) {
  const source = String(food.id).startsWith('custom:') ? customMacroSourceServing({ ...food, servings }) : null;
  const row = (s, i, fixed = false) => fixed
    ? `<div class="servedit fixed" data-servrow="${i}"><span class="muted">100 g (always available)</span></div>`
    : `<div class="servedit" data-servrow="${i}">
        <input data-slabel="${i}" value="${s.label}" placeholder="Serving">
        <input data-sgrams="${i}" type="number" step="0.1" value="${s.grams || ''}" placeholder="g">
        <input data-skcal="${i}" type="number" step="0.1" value="${s.macros?.kcal ?? ''}" placeholder="kcal">
        <input data-sp="${i}" type="number" step="0.1" value="${s.macros?.p ?? ''}" placeholder="P">
        <input data-sc="${i}" type="number" step="0.1" value="${s.macros?.c ?? ''}" placeholder="C">
        <input data-sf="${i}" type="number" step="0.1" value="${s.macros?.f ?? ''}" placeholder="F">
        <button class="del" data-sdel="${i}">×</button>
      </div>`;
  return `<div class="backbar"><button class="ghost" id="peditback">‹ Cancel</button>
    <h2 style="flex:1">Edit food</h2></div>
  <label>Name</label><input id="ename" value="${food.label}">
  <label>Barcode (optional)</label><input id="ebarcode" inputmode="numeric" value="${food.barcode || ''}" placeholder="Scan or type barcode">
  <label>Macros per 100 g</label>
  <div class="macroedit">
    <label>Calories<input id="ek" type="number" step="0.1" value="${food.per100g.kcal}"></label>
    <label>Protein (g)<input id="ep" type="number" step="0.1" value="${food.per100g.p}"></label>
    <label>Carbs (g)<input id="ec" type="number" step="0.1" value="${food.per100g.c}"></label>
    <label>Fat (g)<input id="ef" type="number" step="0.1" value="${food.per100g.f}"></label>
  </div>
  ${source ? `<p class="hint sourcehint">100 g is calculated from ${source.label} (${source.grams} g).</p>` : ''}
  <label>Servings</label>
  ${servings.map((s, i) => s.grams === 100
    ? row(s, i, true)
    : row(s, i)).join('')}
  <div class="servedit add">
    <input id="nslabel" placeholder="e.g. 1 cup">
    <input id="nsgrams" type="number" step="0.1" placeholder="g">
    <input id="nskcal" type="number" step="0.1" placeholder="kcal">
    <input id="nsp" type="number" step="0.1" placeholder="P">
    <input id="nsc" type="number" step="0.1" placeholder="C">
    <input id="nsf" type="number" step="0.1" placeholder="F">
    <button class="ghost" id="nsadd" style="padding:8px">+</button></div>
  <p class="hint">Each serving can be gram-based, macro-based, or both. If you enter macros, the app will use them for that serving instead of scaling from 100 g.</p>
  <button class="primary" id="esave">Save food</button>`;
}

async function renderSheet() {
  const el = root.querySelector('#sheetroot');
  const favsList = sheet.tab === 'recent' ? await ctx.db.getAll('foodcache') : [];
  const customs = sheet.tab === 'custom' ? await ctx.db.getAll('foods') : [];
  const recipes = sheet.tab === 'recipe' ? await ctx.db.getAll('recipes') : [];
  const favs = {};
  for (const c of await ctx.db.getAll('foodcache')) if (c.fav) favs[c.id] = true;

  const tabs = [['search', 'Search'], ['recent', 'Recent'], ['custom', 'Custom'], ['recipe', 'Recipes'], ['quick', 'Quick']];
  let body = '';
  if (sheet.picked) body = detailView();
  else if (sheet.tab === 'search') {
    body = `<div class="row"><input id="q" placeholder="Search foods…" value="${sheet.q}" style="flex:2 1 120px">
      <button class="ghost ${sheet.busy ? 'loading' : ''}" id="go" ${sheet.busy ? 'disabled' : ''}>${sheet.busy ? 'Searching...' : 'Search'}</button>
      <button class="ghost" id="scan">📷 Scan</button></div>
      <div id="scanbox"></div>
      ${sheet.msg ? `<p class="${sheet.msg.type === 'error' ? 'msg' : 'muted'}">${sheet.msg.text}</p>` : ''}
      ${sheet.busy ? '<p class="muted">Searching...</p>' : ''}
      ${(sheet.results || []).map((f, i) => resultRow(f, i, favs)).join('')}
      ${sheet.hasMore && !sheet.busy ? '<button class="ghost" id="morefoods" style="width:100%;margin-top:10px">More results</button>' : ''}`;
  } else if (sheet.tab === 'recent') {
    const rec = favsList.sort((a, b) => (b.fav - a.fav) || (b.lastUsed - a.lastUsed)).slice(0, 30);
    sheet.results = rec;
    body = rec.length ? rec.map((f, i) => resultRow(f, i, favs)).join('') : '<p class="muted">Foods you log will appear here.</p>';
  } else if (sheet.tab === 'custom') {
    sheet.results = customs.map((f) => ({ ...f, id: 'custom:' + f.id }));
    body = `${sheet.results.map((f, i) => resultRow(f, i, favs)).join('')}
      <h3 style="margin-top:12px">New custom food</h3>
      <input id="cname" placeholder="Name">
      <input id="cbarcode" inputmode="numeric" placeholder="barcode (optional)">
      <div class="row"><input id="cslabel" placeholder="serving name (e.g. 2/3 cup)"><input id="csgrams" type="number" placeholder="grams"></div>
      <label id="cmacros">Macros per 100 g</label>
      <div class="row"><input id="ck" type="number" placeholder="kcal"><input id="cp" type="number" placeholder="protein"></div>
      <div class="row"><input id="cc" type="number" placeholder="carbs"><input id="cf" type="number" placeholder="fat"></div>
      <p class="hint">Enter the macros for the serving above. Leave the serving blank to enter per 100 g instead.</p>
      <button class="ghost" id="csave" style="margin-top:8px">Save food</button>`;
  } else if (sheet.tab === 'recipe') {
    body = renderRecipeTab(recipes);
  } else {
    body = `<h3>Quick add</h3><input id="qlabel" placeholder="Label (optional)">
      <div class="row"><input id="qk" type="number" placeholder="kcal"><input id="qp" type="number" placeholder="protein g"></div>
      <div class="row"><input id="qc" type="number" placeholder="carbs g"><input id="qf" type="number" placeholder="fat g"></div>
      <button class="ghost" id="qadd" style="margin-top:8px">Add</button>`;
  }

  el.innerHTML = `<div class="sheet-back" id="back"></div><div class="sheet">
    ${sheet.picked ? '' : `<div class="spread"><h2>Add to ${MEALS[sheet.meal]}</h2><button class="ghost" id="close">Close</button></div>
    <div class="seg" style="margin:8px 0">${tabs.map(([id, l]) =>
      `<button data-tab="${id}" class="${sheet.tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>`}
    ${body}</div>`;
  wireSheet(el);
}

function wireSheet(el) {
  const q = (sel) => el.querySelector(sel);
  q('#back').onclick = () => { sheet = null; render(); };
  const close = q('#close');
  if (close) close.onclick = () => { sheet = null; render(); };
  el.querySelectorAll('[data-tab]').forEach((b) =>
    (b.onclick = () => { sheet.tab = b.dataset.tab; sheet.picked = null; sheet.results = []; sheet.searchPage = 1; sheet.hasMore = false; sheet.msg = ''; renderSheetStable(); }));
  el.querySelectorAll('[data-open]').forEach((b) =>
    (b.onclick = async () => {
      const food = sheet.results[+b.dataset.open];
      const hydrated = food?.source === 'usda' ? await hydrateUsdaFood(food, settings.usdaApiKey) : food;
      const servings = normalizeServings(hydrated);
      sheet.picked = { food: hydrated, servingIdx: servings.length > 1 ? 1 : 0, qty: 1 };
      sheet.editing = false;
      renderSheetStable();
    }));
  el.querySelectorAll('[data-fav]').forEach((b) => (b.onclick = async () => {
    const f = sheet.results[+b.dataset.fav];
    const prev = await ctx.db.get('foodcache', f.id);
    await ctx.db.put('foodcache', { ...f, fav: !(prev?.fav), lastUsed: prev?.lastUsed || Date.now() });
    renderSheet();
  }));

  /* search */
  const runSearch = async (append = false) => {
    const query = q('#q')?.value.trim() || sheet.q;
    if (!query) return;
    sheet.q = query;
    sheet.searchPage = append ? (sheet.searchPage || 1) + 1 : 1;
    sheet.busy = true;
    sheet.msg = '';
    renderSheetStable();
    try {
      const { foods, msg, hasMore } = await searchFoodSources(sheet.q, sheet.searchPage);
      const hydrated = await Promise.all(foods.map(async (f) =>
        (await ctx.db.get('foodcache', f.id)) ?? f));
      sheet.results = append ? mergeFoods(sheet.results || [], hydrated) : hydrated;
      sheet.hasMore = hasMore;
      sheet.msg = msg;
    } catch (e) {
      if (!append) sheet.results = [];
      sheet.hasMore = false;
      sheet.msg = { type: 'error', text: `Food search is temporarily unavailable: ${e.message}` };
    } finally {
      sheet.busy = false;
      renderSheetStable();
    }
  };
  const go = q('#go');
  if (go) {
    go.onclick = () => runSearch(false);
    q('#q').onkeydown = (e) => { if (e.key === 'Enter') runSearch(false); };
  }
  const more = q('#morefoods');
  if (more) more.onclick = () => runSearch(true);
  const scan = q('#scan');
  if (scan) scan.onclick = () => startBarcodeScan(el);

  /* detail */
  const pback = q('#pback');
  if (pback) pback.onclick = () => {
    if (sheet.editEntry) {
      sheet = null;
      render();
      return;
    }
    sheet.picked = null;
    renderSheetStable();
  };
  el.querySelectorAll('[data-serv]').forEach((b) =>
    (b.onclick = () => {
      sheet.picked.servingIdx = +b.dataset.serv;
      sheet.picked.qty = +q('#pqty').value || 0;
      el.querySelectorAll('[data-serv]').forEach((chip) => chip.classList.toggle('on', chip === b));
      updatePortionPreview(el);
    }));
  const pqty = q('#pqty');
  if (pqty && !sheet.editing) pqty.oninput = () => { sheet.picked.qty = +pqty.value || 0; updatePortionPreview(el); };
  const pedit = q('#pedit');
  if (pedit) pedit.onclick = () => { sheet.editing = true; renderSheetStable(); };
  const confirm = q('#paddconfirm');
  if (confirm) confirm.onclick = async () => {
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

  /* edit mode */
  const peditback = q('#peditback');
  if (peditback) peditback.onclick = () => { sheet.editing = false; renderSheetStable(); };
  const nsadd = q('#nsadd');
  if (nsadd) nsadd.onclick = () => {
    keepEdits(el);
    const label = q('#nslabel').value.trim(), grams = +q('#nsgrams').value;
    const macros = readMacros(q, 'ns');
    if (!label || !(grams > 0) && !macros) return;
    sheet.picked.food.servings = [...normalizeServings(sheet.picked.food), { label, ...(grams > 0 ? { grams } : {}), ...(macros ? { macros } : {}) }];
    renderSheetStable();
  };
  el.querySelectorAll('[data-sdel]').forEach((b) => (b.onclick = () => {
    keepEdits(el);
    const servings = normalizeServings(sheet.picked.food);
    servings.splice(+b.dataset.sdel, 1);
    sheet.picked.food.servings = servings;
    renderSheetStable();
  }));
  const esave = q('#esave');
  if (esave) esave.onclick = async () => {
    keepEdits(el);
    await persistFood({ ...sheet.picked.food, servings: normalizeServings(sheet.picked.food) });
    sheet.editing = false;
    sheet.picked.servingIdx = Math.min(sheet.picked.servingIdx, normalizeServings(sheet.picked.food).length - 1);
    renderSheetStable();
  };

  /* custom food */
  const csgrams = q('#csgrams');
  if (csgrams) {
    const syncMacroLabel = () => {
      const g = +csgrams.value;
      q('#cmacros').textContent = g > 0
        ? `Macros for ${q('#cslabel').value.trim() || 'this serving'} (${g} g)`
        : 'Macros per 100 g';
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
    renderSheetStable();
  };

  /* quick add */
  const qadd = q('#qadd');
  if (qadd) qadd.onclick = () => addEntry({
    label: q('#qlabel').value.trim() || 'Quick add', brand: '', qty: 1, unit: 'x',
    kcal: +q('#qk').value || 0, p: +q('#qp').value || 0, c: +q('#qc').value || 0, f: +q('#qf').value || 0,
  });
  wireRecipeTab(el);
}

function updatePortionPreview(el) {
  if (!sheet?.picked || sheet.editing) return;
  const { food, servingIdx, qty } = sheet.picked;
  const servings = normalizeServings(food);
  const sv = servings[Math.min(servingIdx, servings.length - 1)];
  const m = portionPreview(food, sv, qty);
  const set = (id, value) => {
    const node = el.querySelector(id);
    if (node) node.textContent = value;
  };
  set('#pkcal', m.kcal);
  set('#pp', `${m.p}g`);
  set('#pc', `${m.c}g`);
  set('#pf', `${m.f}g`);
  set('#ppreview', portionPreviewHint(sv, qty, m));
}

async function renderSheetStable() {
  const sheetEl = root.querySelector('.sheet');
  const top = sheetEl?.scrollTop ?? 0;
  await renderSheet();
  const next = root.querySelector('.sheet');
  if (next) next.scrollTop = top;
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
        <small class="muted">${Math.round(r.perServing.kcal)} kcal/serving · makes ${r.servings}</small></div>
      <input type="number" step="0.5" value="1" data-recqty="${r.id}" style="width:64px">
      <button class="ghost" data-recadd="${r.id}">Add</button></div>`).join('')
      || '<p class="muted">No recipes yet.</p>'}
      <button class="ghost" id="recnew" style="margin-top:10px">+ New recipe</button>`;
  }
  return `<h3>New recipe</h3>
    <input id="rname" placeholder="Recipe name" value="${d.name}">
    <label>Servings it makes</label><input id="rserv" type="number" value="${d.servings}">
    <div class="row" style="margin-top:8px"><input id="rq" placeholder="Search ingredient…">
      <button class="ghost" id="rgo">Search</button></div>
    ${(d.results || []).map((f, i) => `<div class="result"><div>${f.label}<small class="muted"> ${Math.round(f.per100g.kcal)} kcal/100g</small></div>
      <input type="number" placeholder="g" data-ring-g="${i}" style="width:70px">
      <button class="ghost" data-ringadd="${i}">Add</button></div>`).join('')}
    ${d.ingredients.length ? `<h3 style="margin-top:10px">Ingredients</h3>` : ''}
    ${d.ingredients.map((ing, i) => `<div class="entry"><div>${ing.label} <small>${ing.grams} g</small></div>
      <button class="del" data-ringdel="${i}">×</button></div>`).join('')}
    <button class="ghost" id="rsave" style="margin-top:10px">Save recipe</button>`;
}

function wireRecipeTab(el) {
  const q = (sel) => el.querySelector(sel);
  const recnew = q('#recnew');
  if (recnew) recnew.onclick = () => { sheet.recipeDraft = { name: '', servings: 4, results: [], ingredients: [] }; renderSheet(); };
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
    renderSheet();
  };
  el.querySelectorAll('[data-ringadd]').forEach((b) => (b.onclick = () => {
    keep();
    const i = +b.dataset.ringadd;
    const grams = +el.querySelector(`[data-ring-g="${i}"]`).value;
    if (!grams) return;
    const f = d.results[i];
    d.ingredients.push({ label: f.label, grams, per100g: f.per100g });
    renderSheet();
  }));
  el.querySelectorAll('[data-ringdel]').forEach((b) => (b.onclick = () => { keep(); d.ingredients.splice(+b.dataset.ringdel, 1); renderSheet(); }));
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
    renderSheet();
  };
}

/* ---------- barcode ---------- */

async function startBarcodeScan(el) {
  const box = el.querySelector('#scanbox');
  box.innerHTML = `<video class="scanner" playsinline muted></video>
    <button class="ghost" id="scanstop" style="margin-top:6px">Stop</button>
    <p class="muted" id="scanmsg">Point the camera at a barcode…</p>`;
  const video = box.querySelector('video');
  el.querySelector('#scanstop').onclick = () => { stopScan(); box.innerHTML = ''; };
  try {
    await startScan(video, async (code) => {
      stopScan();
      box.querySelector('#scanmsg').textContent = `Looking up ${code}…`;
      const custom = customFoodForBarcode(await ctx.db.getAll('foods'), code);
      const food = custom ?? (await ctx.db.get('foodcache', 'off:' + code)) ?? await lookupBarcode(code);
      if (!food) {
        box.querySelector('#scanmsg').textContent = `No product found for ${code}.`;
        return;
      }
      const hydrated = food.source === 'usda' ? await hydrateUsdaFood(food, settings.usdaApiKey) : food;
      const servings = normalizeServings(hydrated);
      sheet.picked = { food: hydrated, servingIdx: servings.length > 1 ? 1 : 0, qty: 1 };
      renderSheetStable();
    });
  } catch (e) {
    box.innerHTML = `<p class="msg">${scanErrorMessage(e)}</p>`;
  }
}
