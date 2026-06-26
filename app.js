import { DATA_URL, SNAPSHOT_URL, TYPE_ORDER, TYPE_COLORS, parseAllStats } from './df-data.js?v=2';
import { enrich } from './df-formulas.js?v=2';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  rawWeapons:[], allWeapons:[], ammoMap:{}, typeFilter:'All', ammoFilter:'All', cbFilter:'All',
  reloadStat:0, dexStat:0, critStat:0, strengthStat:25, sortKeys:[{col:'sustained',dir:'desc'}],
};

const SORT_COLS = ['name','base','sustained','unlimited'];

// ── Column Filter Definitions ─────────────────────────────────────────────────
// To add a new column filter: add an entry here and give the target <th> the matching id.
const COL_FILTERS = {
  type: {
    thId:       'th-type',
    stateKey:   'typeFilter',
    defaultVal: 'All',
    getOptions: () => ['All', ...TYPE_ORDER.slice(1).filter(t => new Set(state.rawWeapons.map(w => w.type)).has(t))],
    optLabel:   v => v === 'All' ? 'All Types' : v,
    optColor:   v => v === 'All' ? '#dc2626' : (TYPE_COLORS[v] || '#9ca3af'),
    test:       (w, v) => w.type === v,
  },
  ammo: {
    thId:       'th-ammo',
    stateKey:   'ammoFilter',
    defaultVal: 'All',
    getOptions: () => ['All', 'Unlimited', 'Ammo'],
    optLabel:   v => ({ All:'All Ammo', Unlimited:'♾ Unlimited', Ammo:'🔫 Requires Ammo' })[v],
    optColor:   v => ({ All:'#dc2626', Unlimited:'#34d399', Ammo:'#6b7280' })[v],
    test:       (w, v) => v === 'Unlimited' ? w.unlimited : !w.unlimited,
  },
  cb: {
    thId:       'th-name',
    stateKey:   'cbFilter',
    defaultVal: 'All',
    getOptions: () => ['All', 'Normal', 'Special'],
    optLabel:   v => ({ All:'All Items', Normal:'Normal Only', Special:'★ Special' })[v],
    optColor:   v => ({ All:'#dc2626', Normal:'#60a5fa', Special:'#f59e0b' })[v],
    test:       (w, v) => v === 'Normal' ? !w.cbExclude : w.cbExclude,
  },
};

// ── Column Filter UI ──────────────────────────────────────────────────────────
let openFilterId = null;

function initColFilters() {
  for (const [id, def] of Object.entries(COL_FILTERS)) {
    const th = document.getElementById(def.thId);
    if (!th) continue;

    const btn = document.createElement('button');
    btn.className = 'cf-btn';
    btn.title = 'Filter';
    btn.innerHTML = '▾';
    btn.addEventListener('click', e => { e.stopPropagation(); toggleColFilter(id); });

    const panel = document.createElement('div');
    panel.className = 'cf-panel';
    panel.id = 'cfp-' + id;

    th.appendChild(btn);
    document.body.appendChild(panel); // appended to body so fixed positioning escapes overflow clipping
  }
}

function toggleColFilter(id) {
  if (openFilterId === id) { closeColFilter(); return; }
  closeColFilter();
  openFilterId = id;
  const def    = COL_FILTERS[id];
  const th     = document.getElementById(def.thId);
  const btn    = th.querySelector('.cf-btn');
  const panel  = document.getElementById('cfp-' + id);
  const rect   = btn.getBoundingClientRect();

  const current = state[def.stateKey];
  panel.innerHTML = def.getOptions().map(v => {
    const active = v === current;
    const color  = def.optColor(v);
    return `<button class="cf-opt${active ? ' active' : ''}" data-val="${v}"
      style="${active ? `background:${color}22;color:${color};border-color:${color}44` : ''}"
      >${def.optLabel(v)}</button>`;
  }).join('');

  panel.querySelectorAll('.cf-opt').forEach(optBtn => {
    optBtn.addEventListener('click', e => {
      e.stopPropagation();
      state[def.stateKey] = optBtn.dataset.val;
      updateColFilterIndicator(id);
      closeColFilter();
      applyFilters();
    });
  });

  // position below the button, left-aligned, flip left if near right edge
  panel.style.display = 'block';
  const panelW = panel.offsetWidth;
  let left = rect.left;
  if (left + panelW > window.innerWidth - 8) left = rect.right - panelW;
  panel.style.top  = (rect.bottom + 4) + 'px';
  panel.style.left = Math.max(4, left) + 'px';

  btn.classList.add('open');
}

function closeColFilter() {
  if (!openFilterId) return;
  const def   = COL_FILTERS[openFilterId];
  const th    = document.getElementById(def.thId);
  const btn   = th?.querySelector('.cf-btn');
  const panel = document.getElementById('cfp-' + openFilterId);
  if (panel)  panel.style.display = 'none';
  if (btn)    btn.classList.remove('open');
  openFilterId = null;
}

function updateColFilterIndicator(id) {
  const def = COL_FILTERS[id];
  const th  = document.getElementById(def.thId);
  const btn = th?.querySelector('.cf-btn');
  if (!btn) return;
  const active = state[def.stateKey] !== def.defaultVal;
  btn.classList.toggle('cf-active', active);
  btn.style.color = active ? def.optColor(state[def.stateKey]) : '';
}

function updateAllColFilterIndicators() {
  for (const id of Object.keys(COL_FILTERS)) updateColFilterIndicator(id);
}

// close on outside click
document.addEventListener('click', () => closeColFilter());

// ── Render ────────────────────────────────────────────────────────────────────
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function dpsCell(val, max, color) {
  const w = Math.round((val / max) * 80);
  return '<td><div class="dps-cell">'
    + '<div class="dps-bar" style="width:' + w + 'px;background:' + color + '"></div>'
    + '<span class="dps-val" style="color:' + color + '">' + val.toFixed(1) + '</span>'
    + '</div></td>';
}
function renderTable(data) {
  const tbody = document.getElementById('table-body');
  if (data.length === 0) {
    tbody.innerHTML = '<tr id="empty-row"><td colspan="5">No weapons match your filters.</td></tr>';
    return;
  }
  const maxBase = Math.max(1, ...data.map(w => w.base));
  const maxSust = Math.max(1, ...data.map(w => w.sustained));
  tbody.innerHTML = data.map(w => {
    const tc = TYPE_COLORS[w.type] || '#9ca3af';
    const ammoClass = w.noAmmo ? 'ammo-noammo' : w.unlimited ? 'ammo-unlimited' : 'ammo-required';
    const ammoName  = (!w.unlimited && w.ammoType) ? (state.ammoMap[w.ammoType] || w.ammoType) : null;
    const ammoLabel = w.noAmmo ? '♾ No Ammo' : w.unlimited ? '♾ Unlimited' : '🔫 ' + (ammoName || 'Ammo');
    return '<tr>'
      + '<td class="td-name">' + esc(w.name) + '</td>'
      + '<td><span class="type-badge" style="background:' + tc + '22;color:' + tc + ';border:1px solid ' + tc + '44">' + esc(w.type) + '</span></td>'
      + dpsCell(w.base, maxBase, '#e5e7eb')
      + dpsCell(w.sustained, maxSust, '#a78bfa')
      + '<td><span class="ammo-badge ' + ammoClass + '">' + ammoLabel + '</span></td>'
      + '</tr>';
  }).join('');
}
function renderSortChain() {
  const {sortKeys} = state;
  const chain = document.getElementById('sort-chain');
  const pills = document.getElementById('chain-pills');
  if (sortKeys.length <= 1) { chain.style.display = 'none'; return; }
  chain.style.display = 'flex';
  pills.innerHTML = sortKeys.map(({col, dir}, i) =>
    (i > 0 ? '<span class="chain-sep">then</span>' : '')
    + '<span class="chain-pill"><span class="pill-col">' + col + '</span>'
    + '<span class="pill-dir">' + (dir === 'desc' ? '↓' : '↑') + '</span>'
    + '<span class="pill-rm" data-rm-col="' + col + '">✕</span></span>'
  ).join('');
}
function renderSortIcons() {
  const {sortKeys} = state;
  SORT_COLS.forEach(col => {
    const el = document.getElementById('si-' + col);
    if (!el) return;
    const th = el.closest('th');
    const idx = sortKeys.findIndex(k => k.col === col);
    th.classList.remove('sort-primary','sort-secondary');
    if (idx === -1) {
      el.innerHTML = '<span style="opacity:.25">↕</span>';
    } else {
      const arrow = sortKeys[idx].dir === 'desc' ? '↓' : '↑';
      const badge = sortKeys.length > 1 ? '<span class="sort-badge">' + (idx+1) + '</span>' : '';
      const rm    = sortKeys.length > 1 ? '<span class="pill-rm" data-rm-col="' + col + '" style="margin-left:2px;font-size:9px">✕</span>' : '';
      el.innerHTML = arrow + badge + rm;
      th.classList.add(idx === 0 ? 'sort-primary' : 'sort-secondary');
    }
  });
}

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters() {
  const { allWeapons, sortKeys } = state;
  const q = document.getElementById('search').value.trim().toLowerCase();
  let data = allWeapons;
  for (const [id, def] of Object.entries(COL_FILTERS)) {
    const val = state[def.stateKey];
    if (val !== def.defaultVal) data = data.filter(w => def.test(w, val));
  }
  if (q) data = data.filter(w => w.name.toLowerCase().includes(q));
  data = [...data].sort((a, b) => {
    for (const {col, dir} of sortKeys) {
      const va = a[col], vb = b[col];
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
  document.getElementById('count-label').textContent = data.length + ' weapons shown';
  renderTable(data);
  renderSortChain();
  renderSortIcons();
}

function reEnrichAndFilter() {
  const stats = { dexStat: state.dexStat, critStat: state.critStat, reloadStat: state.reloadStat, strengthStat: state.strengthStat };
  state.allWeapons = state.rawWeapons.map(w => enrich(w, stats));
  applyFilters();
}

function setReload(val)   { state.reloadStat   = +val; document.getElementById('reload-val').textContent   = val; reEnrichAndFilter(); }
function setDex(val)      { state.dexStat      = +val; document.getElementById('dex-val').textContent      = val; reEnrichAndFilter(); }
function setCrit(val)     { state.critStat     = +val; document.getElementById('crit-val').textContent     = val; reEnrichAndFilter(); }
function setStrength(val) { state.strengthStat = +val; document.getElementById('strength-val').textContent = val; reEnrichAndFilter(); }
function clearSort()      { state.sortKeys = [{col:'sustained',dir:'desc'}]; applyFilters(); }
function removeSortKey(col) {
  state.sortKeys = state.sortKeys.filter(k => k.col !== col);
  if (state.sortKeys.length === 0) state.sortKeys = [{col:'sustained',dir:'desc'}];
  applyFilters();
}
function handleSortClick(col, shiftKey) {
  if (!SORT_COLS.includes(col)) return;
  const {sortKeys} = state;
  if (shiftKey) {
    const idx = sortKeys.findIndex(k => k.col === col);
    if (idx === -1) state.sortKeys = [...sortKeys, {col, dir:'desc'}];
    else state.sortKeys = sortKeys.map((k,i) => i===idx ? {col, dir:k.dir==='desc'?'asc':'desc'} : k);
  } else {
    state.sortKeys = (sortKeys.length===1 && sortKeys[0].col===col)
      ? [{col, dir:sortKeys[0].dir==='desc'?'asc':'desc'}]
      : [{col, dir:'desc'}];
  }
  applyFilters();
}

// ── Loader ────────────────────────────────────────────────────────────────────
function showStatus(s, count, isSnapshot, msg) {
  document.getElementById('status-loading').style.display = s==='loading' ? '' : 'none';
  document.getElementById('status-error').style.display   = s==='error'   ? '' : 'none';
  document.getElementById('status-ok').style.display      = s==='ok'      ? '' : 'none';
  if (s==='ok')    document.getElementById('status-ok').textContent  = isSnapshot ? '✓ Loaded '+count+' weapons from local snapshot' : '✓ Loaded '+count+' weapons from live game data';
  if (s==='error') document.getElementById('error-msg').textContent = '✗ Failed to load: '+msg;
}
function showDataSections(show) {
  const FLEX_IDS = new Set(['filters','legend']);
  document.querySelectorAll('.needs-data').forEach(el => {
    el.style.display = show ? (FLEX_IDS.has(el.id) ? 'flex' : 'block') : 'none';
  });
  const btn = document.getElementById('btn-refresh');
  if (show) { btn.disabled=false; btn.textContent='⟳ Refresh'; }
}
function loadParsed(raw, isSnapshot) {
  const { weapons, ammoMap } = parseAllStats(raw);
  if (weapons.length === 0) throw new Error('No weapons parsed — unexpected response format.');
  const stats = { dexStat: state.dexStat, critStat: state.critStat, reloadStat: state.reloadStat, strengthStat: state.strengthStat };
  state.ammoMap    = ammoMap;
  state.rawWeapons = weapons;
  state.allWeapons = weapons.map(w => enrich(w, stats));
  showDataSections(true);
  showStatus('ok', weapons.length, isSnapshot);
  updateAllColFilterIndicators();
  applyFilters();
}
async function loadData() {
  showStatus('loading');
  const btn = document.getElementById('btn-refresh');
  btn.disabled=true; btn.textContent='⟳ Loading…';
  try {
    const snap = await fetch(SNAPSHOT_URL);
    if (!snap.ok) throw new Error('Snapshot HTTP ' + snap.status);
    loadParsed(await snap.text(), true);
  } catch(e) {
    console.warn('[DF DPS] Snapshot load failed, trying live feed:', e.message);
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      loadParsed(await res.text(), false);
    } catch(e2) {
      console.error('[DF DPS] Live fetch also failed:', e2);
      showStatus('error', 0, false, e.message);
      btn.disabled=false; btn.textContent='⟳ Refresh';
    }
  }
}

// ── Event wiring ──────────────────────────────────────────────────────────────
initColFilters();

document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', e => handleSortClick(th.dataset.col, e.shiftKey));
});
document.getElementById('chain-pills').addEventListener('click', e => { const r = e.target.closest('[data-rm-col]'); if (r) removeSortKey(r.dataset.rmCol); });
document.querySelector('#weapons-table thead').addEventListener('click', e => { const r = e.target.closest('[data-rm-col]'); if (r) { e.stopPropagation(); removeSortKey(r.dataset.rmCol); } });
document.getElementById('search').addEventListener('input', () => applyFilters());
document.getElementById('reload-slider').addEventListener('input', e => setReload(e.target.value));
document.getElementById('dex-slider').addEventListener('input', e => setDex(e.target.value));
document.getElementById('crit-slider').addEventListener('input', e => setCrit(e.target.value));
document.getElementById('strength-slider').addEventListener('input', e => setStrength(e.target.value));
document.getElementById('btn-refresh').addEventListener('click', () => loadData());
document.getElementById('btn-retry').addEventListener('click', () => loadData());
document.getElementById('btn-clear-sort').addEventListener('click', () => clearSort());

loadData();
