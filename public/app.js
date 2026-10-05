/* ═══════════════════════════════════════════════════════════════════════════════
   WildTrack — Frontend Application Logic
   ═══════════════════════════════════════════════════════════════════════════════ */

const API = '';
let currentTab = 'dashboard';
let editingTable = null;
let editingId = null;
let deleteTable = null;
let deleteId = null;

// Cache for FK dropdowns
let speciesCache = [];
let corridorCache = [];
let rangerCache = [];
let animalCache = [];

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  checkHealth();
  refreshDashboard();
});

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab === 'dashboard') refreshDashboard();
  else loadTable(tab);
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
async function checkHealth() {
  const el = document.getElementById('db-status');
  try {
    const res = await fetch(`${API}/api/health`);
    const data = await res.json();
    if (data.dbConnected) {
      el.className = 'db-status connected';
      el.querySelector('span').textContent = 'DB Connected';
    } else {
      el.className = 'db-status disconnected';
      el.querySelector('span').textContent = 'DB Disconnected';
    }
  } catch {
    el.className = 'db-status disconnected';
    el.querySelector('span').textContent = 'Server Offline';
  }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function refreshDashboard() {
  try {
    const res = await fetch(`${API}/api/dashboard`);
    if (!res.ok) throw new Error('Failed to load');
    const d = await res.json();

    // ── Stat strip counts ──────────────────────────────────────────
    animateCount('count-species',      d.speciesCount);
    animateCount('count-animals',      d.animalCount);
    animateCount('count-corridors',    d.corridorCount);
    animateCount('count-rangers',      d.rangerCount);
    animateCount('count-observations', d.observationCount);

    // ── Metric cards ───────────────────────────────────────────────
    animateCount('metric-animals', d.animalCount);
    animateCount('metric-obs',     d.observationCount);

    // ── Observation line chart ─────────────────────────────────────
    drawLineChart('obs-line-chart', d.recentObservations || []);

    // ── Health + Danger grouped bar chart ─────────────────────────
    drawBarChart('health-bar-chart', d.healthBreakdown || [], d.dangerBreakdown || []);

    // ── Wildlife profile card ──────────────────────────────────────
    populateProfile(d.recentObservations || [], d.healthBreakdown || []);

  } catch (e) {
    console.warn('Dashboard load failed:', e.message);
  }
}

function drawLineChart(canvasId, obsData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 400;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Generate synthetic weekly data (current + previous period)
  const weeks = ['Week 1','Week 2','Week 3','Week 4'];
  const total = obsData.length || 10;
  const curr  = [Math.round(total*.18), Math.round(total*.28), Math.round(total*.22), Math.round(total*.32)];
  const prev  = [Math.round(total*.12), Math.round(total*.20), Math.round(total*.18), Math.round(total*.24)];
  const maxV  = Math.max(...curr, ...prev, 1);
  const pad   = { t: 16, r: 16, b: 30, l: 28 };
  const gW = W - pad.l - pad.r, gH = H - pad.t - pad.b;

  // Grid lines
  ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + gH - (i / 4) * gH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
  }

  function drawLine(data, color, fill) {
    const pts = data.map((v, i) => ({
      x: pad.l + (i / (data.length - 1)) * gW,
      y: pad.t + gH - (v / maxV) * gH,
    }));
    // Fill
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.t + gH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length-1].x, pad.t + gH);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    // Line
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    // Dots
    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#130f09'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }

  drawLine(prev, '#8b5cf6', 'rgba(139,92,246,.18)');
  drawLine(curr, '#f97316', 'rgba(249,115,22,.18)');

  // X labels
  ctx.fillStyle = '#d4a96a'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'center';
  weeks.forEach((w, i) => {
    const x = pad.l + (i / (weeks.length - 1)) * gW;
    ctx.fillText(w, x, H - 6);
  });
}

function drawBarChart(canvasId, healthData, dangerData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 270;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const healthColors = { Healthy:'#f97316', Injured:'#fbbf24', Critical:'#f87171' };
  const dangerColors = { Low:'#a78bfa', Medium:'#c4b5fd', High:'#f87171' };

  const allItems = [
    ...healthData.map(r => ({ label: r.Health_Status, count: r.cnt, color: healthColors[r.Health_Status] || '#818cf8' })),
    ...dangerData.map(r => ({ label: r.Danger_Level,  count: r.cnt, color: dangerColors[r.Danger_Level]  || '#818cf8' })),
  ].filter(x => x.label && x.count > 0);

  if (!allItems.length) return;

  const maxV = Math.max(...allItems.map(x => x.count), 1);
  const pad  = { t: 10, r: 16, b: 10, l: 8 };
  const gW   = W - pad.l - pad.r;
  const rowH = (H - pad.t - pad.b) / allItems.length;

  allItems.forEach((item, i) => {
    const y    = pad.t + i * rowH;
    const barW = (item.count / maxV) * (gW - 60);
    const barH = Math.min(rowH - 10, 18);
    const by   = y + (rowH - barH) / 2;

    // Label
    ctx.fillStyle = '#d4a96a'; ctx.font = '10px Inter,sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(item.label, pad.l, by + barH * .75);

    // Track
    ctx.fillStyle = '#2a1f12';
    ctx.beginPath();
    roundRect(ctx, pad.l + 55, by, gW - 65, barH, 4);
    ctx.fill();

    // Bar
    const grad = ctx.createLinearGradient(pad.l+55, 0, pad.l+55+barW, 0);
    grad.addColorStop(0, item.color);
    grad.addColorStop(1, item.color + '99');
    ctx.fillStyle = grad;
    ctx.beginPath();
    roundRect(ctx, pad.l + 55, by, Math.max(barW, 4), barH, 4);
    ctx.fill();

    // Count
    ctx.fillStyle = '#fdf3e7'; ctx.font = 'bold 10px Inter,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.count, pad.l + 55 + barW + 5, by + barH * .75);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);      ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

function populateProfile(obsData, healthData) {
  const o = obsData[0];
  if (!o) return;
  const name = o.Ani_Name || `Animal #${o.Log_ID}`;
  document.getElementById('prof-species').textContent = name;
  document.getElementById('prof-sci').textContent     = o.Spec_Name || '—';
  document.getElementById('prof-age').textContent     = '—'; // age not in obs query
  document.getElementById('prof-id').textContent      = `WL-${String(o.Log_ID).padStart(3,'0')}`;
  document.getElementById('prof-corr').textContent    = o.Corr_Name || '—';
  const healthy = healthData.find(h => h.Health_Status === 'Healthy');
  document.getElementById('prof-health').textContent  = healthy ? `${healthy.cnt} Healthy` : '—';
  document.getElementById('prof-diet').textContent    = '—';
}



function renderBars(containerId, data, labelKey, countKey, colors, total) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!data.length) { el.innerHTML = '<p style="opacity:.4;font-size:.85rem">No data</p>'; return; }
  el.innerHTML = data.map(item => {
    const label = item[labelKey] || 'Unknown';
    const count = item[countKey] || 0;
    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
    const color = colors[label] || 'var(--accent)';
    return `
      <div class="bar-item">
        <div class="bar-meta">
          <span class="bar-label">${label}</span>
          <span class="bar-count">${count} <span style="opacity:.5">(${pct}%)</span></span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${color}" data-pct="${pct}"></div>
        </div>
      </div>`;
  }).join('');
  // Animate bars in
  requestAnimationFrame(() => {
    el.querySelectorAll('.bar-fill').forEach(b => {
      b.style.width = '0';
      setTimeout(() => { b.style.transition = 'width .7s cubic-bezier(.4,0,.2,1)'; b.style.width = b.dataset.pct + '%'; }, 50);
    });
  });
}

function renderRecentObs(obs) {
  const el = document.getElementById('recent-obs-list');
  if (!el) return;
  if (!obs.length) { el.innerHTML = '<p style="opacity:.4;font-size:.85rem;padding:1rem">No observations yet</p>'; return; }
  el.innerHTML = obs.map(o => {
    const date    = o.Log_Date ? new Date(o.Log_Date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const animal  = o.Ani_Name  ? `${o.Ani_Name} <span style="opacity:.5">(${o.Spec_Name || '?'})</span>` : (o.Spec_Name || `#${o.Log_ID}`);
    const ranger  = o.Rang_Name || '—';
    const corr    = o.Corr_Name || '—';
    return `
      <div class="obs-row">
        <div class="obs-date">${date}</div>
        <div class="obs-animal">${animal}</div>
        <div class="obs-ranger">👤 ${ranger}</div>
        <div class="obs-corr">🗺 ${corr}</div>
      </div>`;
  }).join('');
}


function animateCount(id, target) {
  const el = document.getElementById(id);
  const duration = 600;
  const start = performance.now();
  const from = parseInt(el.textContent) || 0;

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (target - from) * ease);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── LOAD TABLES ──────────────────────────────────────────────────────────────
async function loadTable(table) {
  const endpoint = getEndpoint(table);
  try {
    const res = await fetch(`${API}/api/${endpoint}`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    renderTable(table, data);
    // Cache data for FK dropdowns
    if (table === 'species') speciesCache = data;
    if (table === 'corridors') corridorCache = data;
    if (table === 'rangers') rangerCache = data;
    if (table === 'animals') animalCache = data;
  } catch (err) {
    showToast('Error loading data: ' + err.message, 'error');
  }
}

function getEndpoint(table) {
  const map = { species: 'species', animals: 'animals', corridors: 'corridors', rangers: 'rangers', observations: 'observations' };
  return map[table] || table;
}

// ─── RENDER TABLES ────────────────────────────────────────────────────────────
function renderTable(table, data) {
  const tbody = document.getElementById(`tbody-${table}`);
  const empty = document.getElementById(`empty-${table}`);
  const tableEl = document.getElementById(`table-${table}`);

  if (!data.length) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    if (tableEl) tableEl.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  if (tableEl) tableEl.style.display = 'table';

  const renderers = { species: renderSpecies, animals: renderAnimals, corridors: renderCorridors, rangers: renderRangers, observations: renderObservations };
  tbody.innerHTML = data.map(row => renderers[table](row)).join('');
}

function dangerBadge(level) {
  if (!level) return '<span class="badge badge-default">Unknown</span>';
  const l = level.toLowerCase();
  if (l.includes('critical') || l.includes('extinct')) return `<span class="badge badge-critical">${level}</span>`;
  if (l.includes('endanger')) return `<span class="badge badge-endangered">${level}</span>`;
  if (l.includes('vulner')) return `<span class="badge badge-vulnerable">${level}</span>`;
  if (l.includes('stable') || l.includes('safe') || l.includes('least')) return `<span class="badge badge-stable">${level}</span>`;
  return `<span class="badge badge-default">${level}</span>`;
}

function healthBadge(status) {
  if (!status) return '<span class="badge health-default">Unknown</span>';
  const s = status.toLowerCase();
  if (s.includes('health') || s.includes('good') || s.includes('stable')) return `<span class="badge health-healthy">${status}</span>`;
  if (s.includes('injur') || s.includes('sick') || s.includes('weak')) return `<span class="badge health-injured">${status}</span>`;
  if (s.includes('critical') || s.includes('severe')) return `<span class="badge health-critical">${status}</span>`;
  return `<span class="badge health-default">${status}</span>`;
}

function actionBtns(table, id) {
  return `<td class="actions-cell">
    <button class="btn-icon edit" onclick="openEditModal('${table}', ${id})" title="Edit">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    </button>
    <button class="btn-icon delete" onclick="openDeleteModal('${table}', ${id})" title="Delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
    </button>
  </td>`;
}

function renderSpecies(r) {
  return `<tr><td>${r.Spec_ID}</td><td style="color:var(--text-primary);font-weight:600">${r.Spec_Name}</td><td>${dangerBadge(r.Danger_Level)}</td><td>${r.Diet_Type || '—'}</td>${actionBtns('species', r.Spec_ID)}</tr>`;
}

function renderAnimals(r) {
  const name = r.Ani_Name ? `<span style="color:var(--text-primary);font-weight:600">${r.Ani_Name}</span>` : '<span style="opacity:0.4">—</span>';
  return `<tr><td>${r.Ani_ID}</td><td>${name}</td><td>${r.ANI_Age ?? '—'}</td><td>${healthBadge(r.Health_Status)}</td><td>${r.Spec_Name || r.Spec_ID || '—'}</td><td>${r.Corr_Name || r.Corr_ID || '—'}</td>${actionBtns('animals', r.Ani_ID)}</tr>`;
}

function renderCorridors(r) {
  return `<tr><td>${r.Corr_ID}</td><td style="color:var(--text-primary);font-weight:600">${r.Corr_Name}</td><td>${r.climate || '—'}</td>${actionBtns('corridors', r.Corr_ID)}</tr>`;
}

function renderRangers(r) {
  const salary = r.Salary != null ? `$${Number(r.Salary).toLocaleString()}` : '—';
  return `<tr><td>${r.Rang_ID}</td><td style="color:var(--text-primary);font-weight:600">${r.Rang_Name}</td><td>${r.Phone || '—'}</td><td>${salary}</td>${actionBtns('rangers', r.Rang_ID)}</tr>`;
}

function renderObservations(r) {
  const date = r.Log_Date ? new Date(r.Log_Date).toLocaleDateString() : '—';
  const animal = r.Spec_Name ? `#${r.Ani_ID} (${r.Spec_Name})` : `#${r.Ani_ID}`;
  return `<tr><td>${r.Log_ID}</td><td>${date}</td><td>${animal}</td><td>${r.Rang_Name || r.Rang_ID || '—'}</td><td>${r.Corr_Name || r.Corr_ID || '—'}</td>${actionBtns('observations', r.Log_ID)}</tr>`;
}

// ─── SEARCH / FILTER ──────────────────────────────────────────────────────────
function filterTable(table) {
  const q = document.getElementById(`search-${table}`).value.toLowerCase();
  const rows = document.querySelectorAll(`#tbody-${table} tr`);
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

// ─── MODAL: ADD / EDIT ────────────────────────────────────────────────────────
async function openModal(table, data = null) {
  editingTable = table;
  editingId = data ? getIdFromData(table, data) : null;

  document.getElementById('modal-title').textContent = data ? `Edit ${tableLabel(table)}` : `Add ${tableLabel(table)}`;

  // Pre-fetch FK data
  await loadFKData();

  const body = document.getElementById('modal-body');
  body.innerHTML = getFormFields(table, data);
  document.getElementById('modal-overlay').classList.add('open');

  // Focus first input
  const first = body.querySelector('input, select');
  if (first) setTimeout(() => first.focus(), 100);
}

async function openEditModal(table, id) {
  const endpoint = getEndpoint(table);
  try {
    const res = await fetch(`${API}/api/${endpoint}/${id}`);
    if (!res.ok) throw new Error('Record not found');
    const data = await res.json();
    openModal(table, data);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingTable = null;
  editingId = null;
}

function tableLabel(t) {
  const labels = { species: 'Species', animals: 'Animal', corridors: 'Corridor', rangers: 'Ranger', observations: 'Observation' };
  return labels[t] || t;
}

function getIdFromData(table, data) {
  const keys = { species: 'Spec_ID', animals: 'Ani_ID', corridors: 'Corr_ID', rangers: 'Rang_ID', observations: 'Log_ID' };
  return data[keys[table]];
}

async function loadFKData() {
  try {
    const [s, c, r, a] = await Promise.all([
      fetch(`${API}/api/species`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/corridors`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/rangers`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/animals`).then(r => r.json()).catch(() => []),
    ]);
    speciesCache = s; corridorCache = c; rangerCache = r; animalCache = a;
  } catch { /* use cached */ }
}

function selectOptions(items, valueKey, labelKey, selected) {
  return items.map(item =>
    `<option value="${item[valueKey]}" ${item[valueKey] == selected ? 'selected' : ''}>${item[valueKey]} — ${item[labelKey]}</option>`
  ).join('');
}

function getFormFields(table, d) {
  const v = (key) => d ? (d[key] ?? '') : '';
  const isEdit = !!d;
  const idReadonly = isEdit ? 'readonly style="opacity:0.6;cursor:not-allowed"' : 'required';

  switch (table) {
    case 'species': return `
      <div class="form-group"><label>Species ID</label><input type="number" name="Spec_ID" value="${v('Spec_ID')}" ${idReadonly}></div>
      <div class="form-group"><label>Species Name</label><input type="text" name="Spec_Name" value="${v('Spec_Name')}" required></div>
      <div class="form-group"><label>Danger Level</label>
        <select name="Danger_Level">
          <option value="">— Select —</option>
          ${['Critically Endangered','Endangered','Vulnerable','Near Threatened','Least Concern'].map(o => `<option ${v('Danger_Level')===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Diet Type</label>
        <select name="Diet_Type">
          <option value="">— Select —</option>
          ${['Herbivore','Carnivore','Omnivore','Insectivore'].map(o => `<option ${v('Diet_Type')===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>`;

    case 'animals': return `
      <div class="form-group"><label>Animal ID</label><input type="number" name="Ani_ID" value="${v('Ani_ID')}" ${idReadonly}></div>
      <div class="form-group"><label>Animal Name</label><input type="text" name="Ani_Name" value="${v('Ani_Name')}" placeholder="e.g. Leo, Simba…"></div>
      <div class="form-group"><label>Age</label><input type="number" name="ANI_Age" value="${v('ANI_Age')}" min="0"></div>
      <div class="form-group"><label>Health Status</label>
        <select name="Health_Status">
          <option value="">— Select —</option>
          ${['Healthy','Injured','Sick','Critical'].map(o => `<option ${v('Health_Status')===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Species (FK)</label>
        <select name="Spec_ID" required>
          <option value="">— Select Species —</option>
          ${selectOptions(speciesCache, 'Spec_ID', 'Spec_Name', v('Spec_ID'))}
        </select>
      </div>
      <div class="form-group"><label>Corridor (FK)</label>
        <select name="Corr_ID" required>
          <option value="">— Select Corridor —</option>
          ${selectOptions(corridorCache, 'Corr_ID', 'Corr_Name', v('Corr_ID'))}
        </select>
      </div>`;

    case 'corridors': return `
      <div class="form-group"><label>Corridor ID</label><input type="number" name="Corr_ID" value="${v('Corr_ID')}" ${idReadonly}></div>
      <div class="form-group"><label>Corridor Name</label><input type="text" name="Corr_Name" value="${v('Corr_Name')}" required></div>
      <div class="form-group"><label>Climate</label>
        <select name="climate">
          <option value="">— Select —</option>
          ${['Tropical','Arid','Temperate','Cold','Mediterranean','Subtropical'].map(o => `<option ${v('climate')===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>`;

    case 'rangers': return `
      <div class="form-group"><label>Ranger ID</label><input type="number" name="Rang_ID" value="${v('Rang_ID')}" ${idReadonly}></div>
      <div class="form-group"><label>Ranger Name</label><input type="text" name="Rang_Name" value="${v('Rang_Name')}" required></div>
      <div class="form-group"><label>Phone</label><input type="text" name="Phone" value="${v('Phone')}"></div>
      <div class="form-group"><label>Salary</label><input type="number" name="Salary" value="${v('Salary')}" step="0.01" min="0"></div>`;

    case 'observations': return `
      <div class="form-group"><label>Log ID</label><input type="number" name="Log_ID" value="${v('Log_ID')}" ${idReadonly}></div>
      <div class="form-group"><label>Date</label><input type="date" name="Log_Date" value="${v('Log_Date') ? v('Log_Date').substring(0,10) : ''}" required></div>
      <div class="form-group"><label>Animal (FK)</label>
        <select name="Ani_ID" required>
          <option value="">— Select Animal —</option>
          ${animalCache.map(a => `<option value="${a.Ani_ID}" ${a.Ani_ID == v('Ani_ID') ? 'selected' : ''}>#${a.Ani_ID}${a.Ani_Name ? ' — ' + a.Ani_Name : ''} (${a.Spec_Name || 'Species ' + a.Spec_ID})</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Ranger (FK)</label>
        <select name="Rang_ID" required>
          <option value="">— Select Ranger —</option>
          ${selectOptions(rangerCache, 'Rang_ID', 'Rang_Name', v('Rang_ID'))}
        </select>
      </div>
      <div class="form-group"><label>Corridor (FK)</label>
        <select name="Corr_ID" required>
          <option value="">— Select Corridor —</option>
          ${selectOptions(corridorCache, 'Corr_ID', 'Corr_Name', v('Corr_ID'))}
        </select>
      </div>`;

    default: return '';
  }
}

// ─── FORM SUBMIT ──────────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('modal-form');
  const formData = new FormData(form);
  const body = {};
  formData.forEach((val, key) => {
    if (val !== '') body[key] = isNaN(val) || val === '' ? val : Number(val);
  });

  // Keep date as string
  if (body.Log_Date) body.Log_Date = formData.get('Log_Date');

  const endpoint = getEndpoint(editingTable);
  const isEdit = editingId !== null;
  const url = isEdit ? `${API}/api/${endpoint}/${editingId}` : `${API}/api/${endpoint}`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Operation failed');
    showToast(result.message || 'Success!', 'success');
    closeModal();
    loadTable(editingTable || currentTab);
    refreshDashboard();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
function openDeleteModal(table, id) {
  deleteTable = table;
  deleteId = id;
  document.getElementById('delete-message').textContent = `Delete ${tableLabel(table)} record #${id}? This cannot be undone.`;

  // Show cascade option for tables with dependents
  const cascadeTables = ['species', 'corridors', 'rangers', 'animals'];
  const cascadeOpt = document.getElementById('cascade-option');
  cascadeOpt.style.display = cascadeTables.includes(table) ? 'flex' : 'none';
  document.getElementById('cascade-checkbox').checked = false;

  document.getElementById('delete-overlay').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('delete-overlay').classList.remove('open');
  deleteTable = null;
  deleteId = null;
}

async function confirmDelete() {
  const cascade = document.getElementById('cascade-checkbox').checked;
  const endpoint = getEndpoint(deleteTable);
  const url = `${API}/api/${endpoint}/${deleteId}${cascade ? '?cascade=true' : ''}`;

  try {
    const res = await fetch(url, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Delete failed');
    showToast(result.message || 'Deleted successfully', 'success');
    closeDeleteModal();
    loadTable(deleteTable || currentTab);
    refreshDashboard();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
