import { dstr, addDays, dowMon } from '../util.js';
import { fmtWeight, lbToKg } from '../units.js';
import { dayMacros } from '../engine/planner.js';
import { lookupBarcode, searchFoods } from '../food/off.js';
import { searchUsda } from '../food/usda.js';
import { startScan, stopScan } from '../food/barcode.js';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
let date = dstr(), root, ctx, settings, sheet = null; // sheet = {meal, tab, q, results, picked, recipeDraft}

export function latestTargets(all) {
  return [...all].sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))[0];
}
export async function dayTargetFor(db, d) {
  const t = latestTargets(await db.getAll('targets'));
  const plan = await db.get('planner', 'main');
  return plan?.enabled ? dayMacros(plan.days[dowMon(d)].kcal, t) : t;
}

export async function mount(el, c) { root = el; ctx = c; settings = await c.db.get('settings', 'main'); render(); }

const blankLog = () => ({ date, complete: false, meals: MEALS.map((name) => ({ name, entries: [] })) });
const totals = (log) => log.meals.flatMap((m) => m.entries)
  .reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }),
    { kcal: 0, p: 0, c: 0, f: 0 });

function ring(label, used, total) {
  const pct = total ? used / total : 0, r = 26, c = 2 * Math.PI * r;
  return `<div class="ring"><svg viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="${r}" class="ring-bg"/>
    <circle cx="32" cy="32" r="${r}" class="ring-fg ${pct > 1 ? 'over' : ''}"
      stroke-dasharray="${(Math.min(pct, 1) * c).toFixed(1)} ${c.toFixed(1)}"/></svg>
    <b>${Math.round(total - used)}</b><span>${label} left</span></div>`;
}

async function render() {
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  const target = await dayTargetFor(ctx.db, date);
  const weighin = await ctx.db.get('weighins', date);
  const t = totals(log);
  root.innerHTML = `
  <div class="spread">
    <button class="ghost" data-nav="-1">‹</button>
    <h2>${date === dstr() ? 'Today' : date}</h2>
    <button class="ghost" data-nav="1">›</button>
  </div>
  <div class="card"><div class="row">
    <input type="number" step="0.1" id="wt" placeholder="Weigh-in (${settings.units === 'imperial' ? 'lb' : 'kg'})"
      value="${weighin ? (settings.units === 'imperial' ? (weighin.weightKg / 0.45359237).toFixed(1) : weighin.weightKg) : ''}">
    <button class="ghost" id="savewt" style="flex:none">Save</button>
  </div></div>
  <div class="card"><div class="rings">
    ${ring('kcal', t.kcal, target.kcal)}${ring('protein', t.p, target.proteinG)}
    ${ring('carbs', t.c, target.carbG)}${ring('fat', t.f, target.fatG)}
  </div><p class="hint">Target today: ${target.kcal} kcal · P ${target.proteinG} · C ${target.carbG} · F ${target.fatG}</p></div>
  ${log.meals.map((m, mi) => `<div class="card meal"><div class="spread"><h3>${m.name}</h3>
    <button class="ghost" data-add="${mi}">+ Add</button></div>
    ${m.entries.map((e, ei) => `<div class="entry"><div>${e.label}
      <small>${e.unit === 'x' ? 'quick add' : e.unit === 'serving' ? `${e.qty} serving` : `${e.grams} g`} · P ${e.p} C ${e.c} F ${e.f}</small></div>
      <div style="flex:none">${e.kcal} <button class="del" data-del="${mi}:${ei}">×</button></div></div>`).join('')}
  </div>`).join('')}
  <div class="row">
    <button class="ghost" id="copy">Copy yesterday</button>
    <button class="ghost" id="complete">${log.complete ? '✓ Day complete' : 'Mark day complete'}</button>
  </div>
  <p class="hint">Days marked complete count toward your weekly check-in.</p>
  <div id="sheetroot"></div>`;
  wire(log);
  if (sheet) renderSheet(log);
}

function wire(log) {
  root.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { date = addDays(date, +b.dataset.nav); sheet = null; render(); }));
  root.querySelector('#savewt').onclick = async () => {
    const v = +root.querySelector('#wt').value;
    if (!v) return;
    const kg = settings.units === 'imperial' ? lbToKg(v) : v;
    await ctx.db.put('weighins', { date, weightKg: +kg.toFixed(2) });
    render();
  };
  root.querySelector('#complete').onclick = async () => { log.complete = !log.complete; await save(log); };
  root.querySelector('#copy').onclick = async () => {
    const prev = await ctx.db.get('logs', addDays(date, -1));
    if (!prev) return alert('Nothing logged yesterday.');
    log.meals = structuredClone(prev.meals);
    await save(log);
  };
  root.querySelectorAll('[data-add]').forEach((b) =>
    (b.onclick = () => { sheet = { meal: +b.dataset.add, tab: 'search', q: '', results: [], picked: null, recipeDraft: null }; render(); }));
  root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const [mi, ei] = b.dataset.del.split(':').map(Number);
    log.meals[mi].entries.splice(ei, 1);
    await save(log);
  }));
}

async function save(log) { await ctx.db.put('logs', log); render(); }

/* ---------- add-food sheet ---------- */

const entryFromFood = (food, qty, unit) => {
  const grams = unit === 'serving' ? qty * (food.serving?.grams || 100) : qty;
  const s = grams / 100, f = food.per100g;
  return {
    label: food.label, brand: food.brand || '', foodId: food.id, qty, unit, grams: Math.round(grams),
    kcal: Math.round(f.kcal * s), p: +(f.p * s).toFixed(1), c: +(f.c * s).toFixed(1), f: +(f.f * s).toFixed(1),
  };
};

async function addEntry(entry) {
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  log.meals[sheet.meal].entries.push(entry);
  await ctx.db.put('logs', log);
  sheet = null;
  render();
}

async function cacheFood(food) {
  const prev = await ctx.db.get('foodcache', food.id);
  await ctx.db.put('foodcache', { ...food, fav: prev?.fav || false, lastUsed: Date.now() });
}

function resultRow(f, i, favs = {}) {
  const per = f.serving ? `${Math.round(f.per100g.kcal * f.serving.grams / 100)} kcal/serving` : `${Math.round(f.per100g.kcal)} kcal/100g`;
  return `<div class="result"><div>${f.label}<small class="muted"> ${f.brand}</small><br><small class="muted">${per}</small></div>
    <button class="fav ${favs[f.id] ? 'on' : ''}" data-fav="${i}">★</button>
    <button class="ghost" data-pick="${i}">Add</button></div>`;
}

function portionForm(f) {
  const hasServing = !!f.serving;
  return `<div class="card"><b>${f.label}</b>
    <div class="row" style="margin-top:8px">
      <input type="number" id="pqty" step="0.1" value="${hasServing ? 1 : 100}">
      <select id="punit">${hasServing ? `<option value="serving">serving (${f.serving.grams} g)</option>` : ''}
        <option value="g" ${hasServing ? '' : 'selected'}>grams</option></select>
      <button class="ghost" id="paddconfirm" style="flex:none">Add</button>
    </div></div>`;
}

async function renderSheet() {
  const el = root.querySelector('#sheetroot');
  const favsList = sheet.tab === 'recent' ? await ctx.db.getAll('foodcache') : [];
  const customs = sheet.tab === 'custom' ? await ctx.db.getAll('foods') : [];
  const recipes = sheet.tab === 'recipe' ? await ctx.db.getAll('recipes') : [];
  const favs = Object.fromEntries((sheet.results || []).map((f) => [f.id, false]));
  for (const c of await ctx.db.getAll('foodcache')) if (c.fav) favs[c.id] = true;

  const tabs = [['search', 'Search'], ['recent', 'Recent'], ['custom', 'Custom'], ['recipe', 'Recipes'], ['quick', 'Quick']];
  let body = '';
  if (sheet.picked) body = portionForm(sheet.picked);
  else if (sheet.tab === 'search') {
    body = `<div class="row"><input id="q" placeholder="Search foods…" value="${sheet.q}">
      <button class="ghost" id="go" style="flex:none">Search</button>
      <button class="ghost" id="scan" style="flex:none">📷</button></div>
      <div id="scanbox"></div>
      ${sheet.busy ? '<p class="muted">Searching…</p>' : ''}
      ${(sheet.results || []).map((f, i) => resultRow(f, i, favs)).join('')}`;
  } else if (sheet.tab === 'recent') {
    const rec = favsList.sort((a, b) => (b.fav - a.fav) || (b.lastUsed - a.lastUsed)).slice(0, 30);
    sheet.results = rec;
    body = rec.length ? rec.map((f, i) => resultRow(f, i, favs)).join('') : '<p class="muted">Foods you log will appear here.</p>';
  } else if (sheet.tab === 'custom') {
    sheet.results = customs.map((f) => ({ ...f, id: 'custom:' + f.id }));
    body = `${sheet.results.map((f, i) => resultRow(f, i, favs)).join('')}
      <h3 style="margin-top:12px">New custom food (per 100 g)</h3>
      <input id="cname" placeholder="Name">
      <div class="row"><input id="ck" type="number" placeholder="kcal"><input id="cp" type="number" placeholder="protein"></div>
      <div class="row"><input id="cc" type="number" placeholder="carbs"><input id="cf" type="number" placeholder="fat"></div>
      <input id="cserv" type="number" placeholder="serving size in g (optional)">
      <button class="ghost" id="csave" style="margin-top:8px">Save food</button>`;
  } else if (sheet.tab === 'recipe') {
    body = renderRecipeTab(recipes);
  } else { // quick
    body = `<h3>Quick add</h3><input id="qlabel" placeholder="Label (optional)">
      <div class="row"><input id="qk" type="number" placeholder="kcal"><input id="qp" type="number" placeholder="protein g"></div>
      <div class="row"><input id="qc" type="number" placeholder="carbs g"><input id="qf" type="number" placeholder="fat g"></div>
      <button class="ghost" id="qadd" style="margin-top:8px">Add</button>`;
  }

  el.innerHTML = `<div class="sheet-back" id="back"></div><div class="sheet">
    <div class="spread"><h2>Add to ${MEALS[sheet.meal]}</h2><button class="ghost" id="close">Close</button></div>
    <div class="seg" style="margin:8px 0">${tabs.map(([id, l]) =>
      `<button data-tab="${id}" class="${sheet.tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${body}</div>`;
  wireSheet(el);
}

function wireSheet(el) {
  const q = (sel) => el.querySelector(sel);
  q('#back').onclick = q('#close').onclick = () => { sheet = null; render(); };
  el.querySelectorAll('[data-tab]').forEach((b) =>
    (b.onclick = () => { sheet.tab = b.dataset.tab; sheet.picked = null; sheet.results = []; renderSheet(); }));
  el.querySelectorAll('[data-pick]').forEach((b) =>
    (b.onclick = () => { sheet.picked = sheet.results[+b.dataset.pick]; renderSheet(); }));
  el.querySelectorAll('[data-fav]').forEach((b) => (b.onclick = async () => {
    const f = sheet.results[+b.dataset.fav];
    const prev = await ctx.db.get('foodcache', f.id);
    await ctx.db.put('foodcache', { ...f, fav: !(prev?.fav), lastUsed: prev?.lastUsed || Date.now() });
    renderSheet();
  }));
  const go = q('#go');
  if (go) {
    const run = async () => {
      sheet.q = q('#q').value.trim();
      if (!sheet.q) return;
      sheet.busy = true; renderSheet();
      try {
        const [off, usda] = await Promise.all([
          searchFoods(sheet.q).catch(() => []),
          searchUsda(sheet.q, settings.usdaApiKey).catch(() => []),
        ]);
        sheet.results = [...off, ...usda];
      } finally { sheet.busy = false; renderSheet(); }
    };
    go.onclick = run;
    q('#q').onkeydown = (e) => { if (e.key === 'Enter') run(); };
    q('#q').focus();
  }
  const scan = q('#scan');
  if (scan) scan.onclick = () => startBarcodeScan(el); // wired for real in Task 11
  const confirm = q('#paddconfirm');
  if (confirm) confirm.onclick = async () => {
    const f = sheet.picked;
    await cacheFood(f);
    await addEntry(entryFromFood(f, +q('#pqty').value || 1, q('#punit').value));
  };
  const csave = q('#csave');
  if (csave) csave.onclick = async () => {
    const name = q('#cname').value.trim();
    if (!name) return;
    const servG = +q('#cserv').value;
    await ctx.db.put('foods', {
      source: 'custom', label: name, brand: '',
      per100g: { kcal: +q('#ck').value || 0, p: +q('#cp').value || 0, c: +q('#cc').value || 0, f: +q('#cf').value || 0 },
      serving: servG > 0 ? { grams: servG, label: `${servG} g` } : null,
    });
    renderSheet();
  };
  const qadd = q('#qadd');
  if (qadd) qadd.onclick = () => addEntry({
    label: q('#qlabel').value.trim() || 'Quick add', brand: '', qty: 1, unit: 'x',
    kcal: +q('#qk').value || 0, p: +q('#qp').value || 0, c: +q('#qc').value || 0, f: +q('#qf').value || 0,
  });
  wireRecipeTab(el);
}

/* ---------- recipes ---------- */

function renderRecipeTab(recipes) {
  const d = sheet.recipeDraft;
  if (!d) {
    return `${recipes.map((r) => `<div class="result"><div>${r.name}
        <small class="muted">${Math.round(r.perServing.kcal)} kcal/serving · makes ${r.servings}</small></div>
        <button class="ghost" data-recadd="${r.id}">Add</button></div>`).join('')
      || '<p class="muted">No recipes yet.</p>'}
      <button class="ghost" id="recnew" style="margin-top:10px">+ New recipe</button>`;
  }
  return `<h3>New recipe</h3>
    <input id="rname" placeholder="Recipe name" value="${d.name}">
    <label>Servings it makes</label><input id="rserv" type="number" value="${d.servings}">
    <div class="row" style="margin-top:8px"><input id="rq" placeholder="Search ingredient…">
      <button class="ghost" id="rgo" style="flex:none">Search</button></div>
    ${(d.results || []).map((f, i) => `<div class="result"><div>${f.label}<small class="muted"> ${Math.round(f.per100g.kcal)} kcal/100g</small></div>
      <input type="number" placeholder="g" data-ring-g="${i}" style="width:70px;flex:none">
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
    const qty = +prompt(`How many servings of ${r.name}?`, '1') || 0;
    if (!qty) return;
    await addEntry({
      label: r.name, brand: 'recipe', foodId: 'recipe:' + r.id, qty, unit: 'serving',
      kcal: Math.round(r.perServing.kcal * qty), p: +(r.perServing.p * qty).toFixed(1),
      c: +(r.perServing.c * qty).toFixed(1), f: +(r.perServing.f * qty).toFixed(1),
    });
  }));
  const d = sheet.recipeDraft;
  if (!d) return;
  const keep = () => { d.name = q('#rname').value; d.servings = +q('#rserv').value || 1; };
  const rgo = q('#rgo');
  if (rgo) rgo.onclick = async () => { keep(); d.results = await searchFoods(q('#rq').value.trim()).catch(() => []); renderSheet(); };
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

async function startBarcodeScan(el) {
  const box = el.querySelector('#scanbox');
  box.innerHTML = `<video class="scanner" playsinline muted></video>
    <button class="ghost" id="scanstop" style="margin-top:6px">Stop</button>
    <p class="muted" id="scanmsg">Point the camera at a barcode...</p>`;
  const video = box.querySelector('video');
  el.querySelector('#scanstop').onclick = () => { stopScan(); box.innerHTML = ''; };
  try {
    await startScan(video, async (code) => {
      stopScan();
      box.querySelector('#scanmsg').textContent = `Looking up ${code}...`;
      const food = await lookupBarcode(code);
      if (!food) {
        box.querySelector('#scanmsg').textContent = `No product found for ${code}.`;
        return;
      }
      sheet.picked = food;
      renderSheet();
    });
  } catch (e) {
    box.innerHTML = `<p class="msg">Camera unavailable: ${e.message}</p>`;
  }
}
