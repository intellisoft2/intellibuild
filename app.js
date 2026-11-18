/* IntelliBuild AI™ Enterprise — web client v3.0.2 (c) Intellisoft Technologies Inc. */
'use strict';
const VERSION = '3.0.2';
const CFG = window.INTELLIBUILD_CONFIG || {};
const $ = id => document.getElementById(id);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const fmt2 = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = iso => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const day = iso => iso ? new Date(iso).toLocaleDateString([], { dateStyle: 'medium' }) : '—';

const DEFAULTS = {
  address: '', matched: '', lat: null, lon: null, design: 'Modern Farmhouse', area: 4000, stories: 2, newBeds: 4, garage: 2,
  existingArea: '', yearBuilt: '', bedrooms: '', bathrooms: '', lotArea: '', parcelInput: '',
  rate: 275, demo: 35000, site: 50000, soft: 12, cont: 12, checks: {}, zone: '', constraints: '', source: 'owner',
  compareRate: 300, renoRate: 175, takeoff: { area: 4000, stories: 2, shape: 1.15, waste: 10, rates: {}, qty: {} },
  priorities: '', designConstraints: '', brief: '', aiStyle: 'modern farmhouse', aiFinish: 'Premium', aiNotes: '',
  concept: { style: 'contemporary', opacity: 75, width: 62, height: 58 }, county: null, intel: { buildingCount: null, lastChecked: null }, privateNotes: ''
};
const NUMERIC = new Set(['area', 'stories', 'newBeds', 'garage', 'rate', 'demo', 'site', 'soft', 'cont', 'existingArea', 'yearBuilt', 'bedrooms', 'bathrooms', 'lotArea', 'compareRate', 'renoRate']);
const ROLE_RANK = { viewer: 1, contractor: 2, editor: 3, owner: 4, admin: 5 };
const PROJECT_TABS = new Set(['overview', 'property', 'intelligence', 'records', 'visualai', 'takeoffs', 'conceptlab', 'design', 'budget', 'materials', 'schedule', 'quality', 'feasibility', 'compare', 'bids', 'team', 'files']);

const S = {
  token: localStorage.getItem('ib_token') || '', user: null, ent: null, plansCfg: null, projects: [], demo: null, invites: [],
  pid: null, project: null, P: clone(DEFAULTS), canEdit: false, role: null, members: [], collabLimit: 0, updatedAt: '',
  files: [], fileCache: {}, guest: false, dirty: false, saving: false, current: 'projects', adminTab: 'overview', inviteToken: '', resetToken: ''
};
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function merged(data) { const p = Object.assign(clone(DEFAULTS), data || {}); p.takeoff = Object.assign(clone(DEFAULTS.takeoff), (data || {}).takeoff || {}); p.concept = Object.assign(clone(DEFAULTS.concept), (data || {}).concept || {}); p.intel = Object.assign(clone(DEFAULTS.intel), (data || {}).intel || {}); p.checks = p.checks || {}; return p; }
const P = () => S.P;

/* ------------------------------------------------------------------ API, toasts, modal */
async function api(action, payload = {}) {
  if (!CFG.api) throw Object.assign(new Error('The IntelliBuild service is not configured yet.'), { code: 'config' });
  let r;
  try { r = await fetch(CFG.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, token: S.token }, payload)) }); }
  catch (e) { throw new Error('Cannot reach the IntelliBuild service. Check your connection and try again.'); }
  let j; try { j = await r.json(); } catch (e) { throw new Error('The service returned an unexpected response. Please try again.'); }
  if (!j.ok) {
    const e = new Error(j.error || 'Request failed'); e.code = j.code;
    if (j.code === 'auth' && S.token && !['login', 'signup'].includes(action)) { signOutLocal(); toast(j.error, { err: true }); }
    throw e;
  }
  return j.data;
}
function toast(msg, o = {}) {
  const t = document.createElement('div'); t.className = 'toast' + (o.err ? ' err' : '');
  t.innerHTML = '<div>' + esc(msg) + '</div>' + (o.action ? '<button class="btn sm">' + esc(o.action) + '</button>' : '');
  if (o.action) t.querySelector('button').onclick = () => { t.remove(); o.onAction(); };
  $('toasts').append(t); setTimeout(() => t.remove(), o.ms || (o.action ? 9000 : 5000));
}
function fail(e) {
  if (!e) return;
  if (e.code === 'upgrade') return toast(e.message, { err: true, action: 'See plans', onAction: () => tab('billing') });
  if (e.code === 'credits') return toast(e.message, { err: true, action: 'Buy credits', onAction: () => tab('billing') });
  if (e.code === 'auth') return;
  toast(e.message || String(e), { err: true });
}
function modal(title, html, okText = 'OK') {
  return new Promise(resolve => {
    $('modalTitle').textContent = title; $('modalBody').innerHTML = html; $('modalOk').textContent = okText; $('modal').classList.remove('hidden');
    const first = $('modalBody').querySelector('input,select,textarea'); if (first) setTimeout(() => first.focus(), 50);
    const close = v => { $('modal').classList.add('hidden'); $('modalOk').onclick = $('modalCancel').onclick = null; resolve(v); };
    $('modalCancel').onclick = () => close(null);
    $('modalOk').onclick = () => { const v = {}; qa('[name]', $('modalBody')).forEach(el => v[el.name] = el.type === 'checkbox' ? el.checked : el.value); close(v); };
  });
}
function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.textContent = label || 'Working…'; } else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; } }
function downloadBlob(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
function downloadJSON(name, data) { downloadBlob(name, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); }
function readDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read file')); r.readAsDataURL(file); }); }
async function resizeImage(file, max = 1600) {
  const url = await readDataURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read image')); i.src = url; });
  const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const d = c.toDataURL('image/jpeg', 0.88); return { dataUrl: d, b64: d.split(',')[1], mime: 'image/jpeg' };
}
const planCfg = k => (S.plansCfg && S.plansCfg.plans && S.plansCfg.plans[k]) || {};
const creditCost = k => (S.plansCfg && S.plansCfg.creditCosts && S.plansCfg.creditCosts[k]) || ({ render_standard: 2, render_hd: 5, brief: 1 })[k];

/* ------------------------------------------------------------------ boot & routing */
function hashParams() { const h = location.hash.replace(/^#/, ''); const o = {}; h.split('&').forEach(kv => { const [k, v] = kv.split('='); if (k) o[k] = v === undefined ? true : decodeURIComponent(v); }); return o; }
async function boot() {
  qa('.ver').forEach(e => e.textContent = VERSION);
  const hp = hashParams(), qp = new URLSearchParams(location.search);
  api('billing.plans').then(d => { S.plansCfg = d; renderPublicPlans(); refreshCreditCostLabels(); }).catch(() => {});
  if (hp.verify) { try { await api('verifyEmail', { verifyToken: hp.verify }); toast('Email verified. Thank you!'); } catch (e) { fail(e); } history.replaceState(null, '', location.pathname); }
  if (hp.reset) { S.resetToken = hp.reset; history.replaceState(null, '', location.pathname); showAuth('reset'); return done(); }
  if (hp.invite) { S.inviteToken = hp.invite; history.replaceState(null, '', location.pathname); }
  const checkoutSession = qp.get('checkout') === 'success' ? qp.get('session_id') : null;
  if (qp.get('checkout')) history.replaceState(null, '', location.pathname + location.hash);
  if (qp.get('checkout') === 'cancel') toast('Checkout cancelled — no charge was made.');
  if (S.token) {
    try { const me = await api('me'); S.user = me.user; S.ent = me.entitlements; await enterApp({ checkoutSession, hp }); return done(); }
    catch (e) { signOutLocal(true); }
  }
  if (S.inviteToken) await previewInvite();
  showAuth(S.inviteToken ? 'signup' : 'login');
  if (hp.demo) startGuest();
  done();
  function done() { $('boot').classList.add('hidden'); }
}
function showAuth(mode) {
  $('appView').classList.add('hidden'); $('authView').classList.remove('hidden'); setAuthMode(mode || 'login');
  if (!CFG.api) $('authMsg').textContent = 'Service endpoint not configured. Set INTELLIBUILD_CONFIG.api in config.js (deploy.sh does this).';
}
function setAuthMode(m) {
  ['login', 'signup', 'forgot', 'reset'].forEach(x => $(x + 'Form').classList.toggle('hidden', x !== m));
  qa('#authTabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('authTabs').classList.toggle('hidden', m === 'reset' || m === 'forgot'); $('authMsg').textContent = '';
}
async function previewInvite() {
  try {
    const i = await api('invites.peek', { inviteToken: S.inviteToken });
    $('inviteNote').innerHTML = '<b>' + esc(i.invitedBy) + '</b> invited <b>' + esc(i.email) + '</b> to <b>' + esc(i.projectName) + '</b> as ' + esc(i.role) + '. ' + (i.accountExists ? 'Sign in to accept.' : 'Create your free account to accept.');
    $('inviteNote').classList.remove('hidden');
    qa('input[name=email]').forEach(el => el.value = i.email);
    if (i.accountExists) setTimeout(() => setAuthMode('login'));
  } catch (e) { fail(e); S.inviteToken = ''; }
}
function signOutLocal(silent) {
  S.token = ''; S.user = null; localStorage.removeItem('ib_token'); S.pid = null; S.project = null; S.guest = false;
  if (!silent) showAuth('login');
}
async function afterAuth(d) {
  S.token = d.token; localStorage.setItem('ib_token', d.token); S.user = d.user; S.guest = false;
  const me = await api('me'); S.ent = me.entitlements; S.inviteToken = '';
  $('inviteNote').classList.add('hidden'); closeProject(); history.replaceState(null, '', location.pathname);
  if (d.projectId) { localStorage.setItem('ib_project', d.projectId); history.replaceState(null, '', location.pathname + '#overview'); toast('Invitation accepted — welcome to the project.'); }
  await enterApp({});
}

async function enterApp(o = {}) {
  $('authView').classList.add('hidden'); $('appView').classList.remove('hidden');
  qa('[data-auth-only]').forEach(el => el.classList.toggle('hidden', S.guest));
  qa('.admin-only').forEach(el => el.classList.toggle('hidden', !(S.user && S.user.isAdmin)));
  renderUserChrome();
  if (S.guest) { await openDemo(); return; }
  if (S.inviteToken) {
    try { const r = await api('members.accept', { inviteToken: S.inviteToken }); S.inviteToken = ''; toast('Invitation accepted.'); await loadProjects(); await openProject(r.projectId); return tab('overview'); }
    catch (e) { fail(e); S.inviteToken = ''; }
  }
  await loadProjects();
  if (o.checkoutSession) await confirmCheckout(o.checkoutSession);
  const hp = o.hp || hashParams();
  const target = hp.project || localStorage.getItem('ib_project');
  if (target && (S.projects.some(p => p.id === target) || (S.demo && S.demo.id === target))) {
    try { await openProject(target); } catch (e) { localStorage.removeItem('ib_project'); }
  }
  const t = hp.tab || (Object.keys(hp).find(k => PROJECT_TABS.has(k) || ['billing', 'account', 'admin', 'projects'].includes(k)));
  tab(o.checkoutSession ? 'billing' : (t || (S.pid ? 'overview' : 'projects')));
  if (S.user && !S.user.verified && !$('banner').classList.contains('hidden')) toast('Please verify your email address — check your inbox.');
  else if (S.user && !S.user.verified) setBanner('Please verify your email address to secure your account. <button class="btn sm secondary" id="resendV">Resend email</button>', () => { $('resendV').onclick = async () => { try { await api('resendVerification'); toast('Verification email sent.'); } catch (e) { fail(e); } }; });
}
function setBanner(html, after) { const b = $('banner'); if (!html) { b.classList.add('hidden'); return; } b.innerHTML = html; b.classList.remove('hidden'); if (after) after(); }
function renderUserChrome() {
  $('creditBadge').classList.toggle('hidden', S.guest);
  $('creditCount').textContent = S.user ? S.user.credits : 0;
  $('userBtn').textContent = S.guest ? 'Sign up free' : (S.user ? S.user.name.split(' ')[0] + ' · ' + (S.user.planName || 'Explore') : '');
}
function setCredits(n) { if (S.user && n !== undefined && n !== null) { S.user.credits = n; renderUserChrome(); } }

function tab(name) {
  if (PROJECT_TABS.has(name) && !S.pid) name = 'projects';
  if (name === 'admin' && !(S.user && S.user.isAdmin)) name = 'projects';
  if (S.guest && ['billing', 'account', 'admin'].includes(name)) name = 'projects';
  S.current = name;
  qa('.tab').forEach(x => x.classList.toggle('active', x.id === name));
  qa('.nav').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  history.replaceState(null, '', location.pathname + '#' + name);
  $('menu').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const h = { projects: loadProjects, overview: renderOverview, property: renderProperty, intelligence: renderIntel, records: renderCounty, visualai: renderGallery, takeoffs: renderTake,
    conceptlab: drawConcept, design: renderDesigns, budget: compute, materials: compute, schedule: () => {}, quality: renderChecklist, feasibility: renderFeas, compare: renderCompare,
    bids: loadBids, team: loadTeam, files: loadFiles, billing: loadBilling, account: fillAccount, admin: () => loadAdmin(S.adminTab) }[name];
  if (h) Promise.resolve(h()).catch(fail);
}
function syncNav() { qa('.nav[data-proj]').forEach(b => b.disabled = !S.pid); }

/* ------------------------------------------------------------------ projects */
async function loadProjects() {
  if (S.guest) { renderProjects(); return; }
  const d = await api('projects.list');
  S.projects = d.projects; S.demo = d.demo; S.invites = d.invites; S.ent = d.entitlements;
  renderProjects(); renderSwitcher();
}
function renderSwitcher() {
  const sel = $('projectSwitch');
  sel.innerHTML = '<option value="">Select a project…</option>' + S.projects.map(p => `<option value="${p.id}">${esc(p.name)}${p.role !== 'owner' ? ' (' + p.role + ')' : ''}</option>`).join('') +
    (S.demo ? `<option value="${S.demo.id}">★ Live sample (read-only)</option>` : '') + (S.guest ? '' : '<option value="__new">＋ New project…</option>');
  sel.value = S.pid || '';
}
function renderProjects() {
  $('guestCta').classList.toggle('hidden', !S.guest);
  qa('#newProject,#copyDemo').forEach(b => b.classList.toggle('hidden', S.guest));
  if (S.guest) { $('entLine').textContent = 'You are exploring the live sample project.'; $('projectCards').innerHTML = ''; $('inviteList').innerHTML = ''; return; }
  const e = S.ent || {};
  $('entLine').textContent = (e.planName || 'Explore') + ' plan · ' + e.ownedProjects + ' of ' + (e.maxProjects < 0 ? 'unlimited' : e.maxProjects) + ' owned projects used';
  $('inviteList').innerHTML = (S.invites || []).map(i => `<div class="note">You're invited to <b>${esc(i.projectName)}</b> as ${esc(i.role)}. <button class="btn sm" data-accept="${i.token}">Accept</button></div>`).join('');
  qa('[data-accept]').forEach(b => b.onclick = async () => { try { const r = await api('members.accept', { inviteToken: b.dataset.accept }); await loadProjects(); await openProject(r.projectId); tab('overview'); } catch (er) { fail(er); } });
  $('projectCards').innerHTML = S.projects.length ? S.projects.map(p => `<div class="card pcard"><div class="flex"><span class="badge ${p.role === 'owner' ? 'ok' : ''}">${esc(p.role)}</span>${p.premium ? '<span class="badge warn">PRO</span>' : ''}</div>
    <h3 class="mt">${esc(p.name)}</h3><p class="small">${esc(p.address || 'No address yet')}</p><div class="kv"><span>Proposed</span><b>${p.area ? Number(p.area).toLocaleString() + ' sq ft' : '—'}</b><span>Budget</span><b>${p.budget ? fmt(p.budget) : '—'}</b><span>Updated</span><b>${day(p.updatedAt)}</b></div>
    <div class="flex"><button class="btn sm" data-open="${p.id}">Open</button>${p.role === 'owner' ? `<button class="btn sm secondary" data-del="${p.id}">Delete</button>` : ''}</div></div>`).join('')
    : '<div class="card"><h3>No projects yet</h3><p>Create a project for your property, or copy the sample project to see a complete example.</p></div>';
  qa('[data-open]').forEach(b => b.onclick = async () => { await openProject(b.dataset.open).catch(fail); tab('overview'); });
  qa('[data-del]').forEach(b => b.onclick = async () => {
    const v = await modal('Delete project?', '<p>This removes the project for you and all collaborators. Type <b>DELETE</b> to confirm.</p><input name="c"/>', 'Delete');
    if (!v || v.c !== 'DELETE') return;
    try { await api('projects.delete', { id: b.dataset.del }); if (S.pid === b.dataset.del) closeProject(); toast('Project deleted.'); loadProjects(); } catch (e) { fail(e); }
  });
}
async function newProject(fromDemo) {
  let v = { name: '', address: '' };
  if (!fromDemo) { v = await modal('New project', '<label>Project name<input name="name" placeholder="e.g. Oakton rebuild"/></label><label>Property address (optional)<input name="address" placeholder="Street, city, state ZIP"/></label>', 'Create project'); if (!v) return; }
  try {
    const r = await api('projects.create', { name: v.name, fromDemo: !!fromDemo, data: fromDemo ? undefined : { address: v.address } });
    await loadProjects(); await openProject(r.project.id); tab('overview');
    toast(fromDemo ? 'Sample copied — it is now your editable project.' : 'Project created.');
    if (v.address) lookup();
  } catch (e) { fail(e); }
}
function closeProject() { S.pid = null; S.project = null; S.P = clone(DEFAULTS); localStorage.removeItem('ib_project'); syncNav(); renderSwitcher(); setBanner(''); }
async function openDemo() {
  const d = await api('demo.get'); S.demo = d.project; applyProject(d, true);
  if (S.guest) { renderSwitcher(); tab('overview'); }
}
async function openProject(id) {
  if (S.dirty) await saveNow();
  if (S.demo && id === S.demo.id && !(S.user && S.user.isAdmin)) return openDemo();
  const d = await api('projects.get', { id }); applyProject(d, false);
}
function applyProject(d, isDemoView) {
  S.pid = d.project.id; S.project = d.project; S.P = merged(d.data); S.canEdit = !!d.canEdit; S.role = d.project.role; S.members = d.members || [];
  S.collabLimit = d.collaboratorLimit; S.updatedAt = d.project.updatedAt; S.files = []; S.fileCache = {}; S.dirty = false;
  if (!isDemoView || S.user) localStorage.setItem('ib_project', S.pid);
  renderSwitcher(); syncNav(); fillAll(); compute(); renderOverview(); renderDesigns(); renderChecklist(); resetTakeInputs();
  setSave(S.canEdit ? 'All changes saved' : 'Read-only');
  if (S.guest) setBanner('You are viewing the live sample project (read-only). <button class="btn sm" id="bnSign">Create a free account</button> to save your own projects.', () => $('bnSign').onclick = () => showAuth('signup'));
  else if (S.project.isDemo && !S.canEdit) setBanner('Live sample project — read-only. <button class="btn sm" id="bnCopy">Copy to my workspace</button> to edit it, upload photos and generate AI concepts.', () => $('bnCopy').onclick = () => newProject(true));
  else if (S.project.isDemo) setBanner('You are editing the public demo project as administrator. Changes are visible to all visitors.');
  else if (!S.canEdit) setBanner('You have ' + S.role + ' access to this project. You can review it, submit bids, add tasks and message the team.');
  else setBanner(S.user && !S.user.verified ? '' : '');
  loadFiles(true).catch(() => {});
}
function fillAll() {
  qa('[data-k]').forEach(el => { const v = S.P[el.dataset.k]; el.value = v === null || v === undefined ? '' : v; });
  $('projName').value = S.project ? S.project.name : '';
  const c = S.P.concept; $('conceptStyle').value = c.style; $('conceptOpacity').value = c.opacity; $('conceptWidth').value = c.width; $('conceptHeight').value = c.height;
  applyEditability();
}
function applyEditability() {
  const ro = !S.canEdit;
  qa('[data-k],.edit-only').forEach(el => el.disabled = ro);
  qa('#uploads,#uploadKind').forEach(el => el.disabled = !S.user || S.guest || ROLE_RANK[S.role] < ROLE_RANK.contractor || (S.project.isDemo && !S.canEdit));
  const aiOk = S.user && !S.guest && ROLE_RANK[S.role] >= ROLE_RANK.contractor && !(S.project.isDemo && !S.canEdit);
  qa('#aiGenerate,#aiPhoto,#aiQuality,#aiConsent,#aiBrief').forEach(el => el.disabled = !aiOk);
  $('conceptPhoto').disabled = false;
}
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.k; if (!k || !S.canEdit) return;
  const raw = e.target.value;
  S.P[k] = NUMERIC.has(k) ? (raw === '' ? '' : Number(raw)) : raw;
  qa('[data-k="' + k + '"]').forEach(el => { if (el !== e.target) el.value = raw; });
  derive(k); markDirty();
});
function derive(k) {
  compute();
  if (['address'].includes(k)) return;
  if (S.current === 'feasibility') renderFeas();
  if (S.current === 'compare') renderCompare();
  if (S.current === 'intelligence') renderEvidence();
  if (S.current === 'property') renderPropRecord();
}

/* save (debounced, optimistic concurrency) */
let saveTimer = null;
function setSave(t) { $('saveState').textContent = t; }
function markDirty() { if (!S.canEdit) return; S.dirty = true; setSave('Unsaved changes…'); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1200); }
async function saveNow(extra = {}) {
  clearTimeout(saveTimer);
  if ((!S.dirty && !extra.name) || !S.canEdit || !S.pid) return;
  if (S.saving) { saveTimer = setTimeout(saveNow, 800); return; }
  S.saving = true; S.dirty = false; setSave('Saving…');
  try {
    const r = await api('projects.save', Object.assign({ id: S.pid, data: S.P, baseUpdatedAt: S.updatedAt, address: S.P.matched || S.P.address || '' }, extra));
    if (r.conflict) {
      S.updatedAt = r.updatedAt; S.P = merged(r.data); fillAll(); compute(); renderOverview();
      toast('A collaborator saved changes to this project. The latest version is loaded — please re-apply your last edit.', { err: true, ms: 9000 });
    } else { S.updatedAt = r.updatedAt; S.project = Object.assign(S.project, r.project); setSave('All changes saved'); if (extra.name) { loadProjects(); } }
  } catch (e) { S.dirty = true; setSave('Save failed — retrying'); saveTimer = setTimeout(saveNow, 6000); fail(e); }
  finally { S.saving = false; }
}
window.addEventListener('beforeunload', e => { if (S.dirty) { saveNow(); e.preventDefault(); e.returnValue = ''; } });

/* ------------------------------------------------------------------ overview & property */
let map = null, marker = null;
function renderOverview() {
  const p = S.P, located = !!p.matched;
  $('ovTitle').textContent = S.project ? S.project.name : 'Build what’s next.';
  $('mProperty').textContent = p.sample ? 'Sample only' : located ? 'Located' : 'Not located';
  $('mArea').textContent = Number(p.area).toLocaleString() + ' sq ft';
  $('mBudget').textContent = fmt(p.budget);
  const pct = Math.round(Object.values(p.checks).filter(Boolean).length / CHECKS.length * 100); $('mTasks').textContent = pct + '% complete';
  const rows = [['Address identified', located ? 'Located' : p.sample ? 'Sample' : 'Pending'], ['Existing home details', p.existingArea ? 'Entered' : 'Pending'],
    ['Official records', p.county ? 'Retrieved ' + day(p.county.retrievedAt) : 'Not retrieved'], ['Design style', p.design || 'Pending'],
    ['AI concepts', S.files.filter(f => f.kind === 'render').length + ' saved'], ['Team members', Math.max(0, S.members.length - 1) + ' collaborators'], ['Budget', fmt(p.budget) + ' (illustrative)']];
  $('readiness').innerHTML = rows.map(([a, b]) => `<div class="statrow"><span>${a}</span><strong>${esc(b)}</strong></div>`).join('');
  if (p.matched) $('lookupStatus').textContent = '✓ Matched: ' + p.matched + ' (location only — verify characteristics with the assessor).';
  else if (p.sample) $('lookupStatus').textContent = 'Fictional sample property — no real address.';
  else $('lookupStatus').textContent = 'U.S. Census address geocoding';
}
async function lookup() {
  const q = $('address').value.trim();
  if (q.length < 8) { $('lookupStatus').textContent = 'Please enter a complete street address.'; return; }
  S.P.address = q; busy($('lookup'), true, 'Searching…'); $('lookupStatus').textContent = 'Searching the U.S. Census address database…';
  let m = null;
  try { m = (await api('property.geocode', { address: q })).match; }
  catch (e) {
    try { const r = await fetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=' + encodeURIComponent(q) + '&benchmark=Public_AR_Current&format=json'); const j = await r.json(); const x = j.result?.addressMatches?.[0]; if (x) m = { matchedAddress: x.matchedAddress, lat: x.coordinates.y, lon: x.coordinates.x }; } catch (e2) { }
  } finally { busy($('lookup'), false); }
  if (!m) { $('lookupStatus').textContent = 'No exact Census match. Check street, city, state and ZIP — you can still enter details manually.'; markDirty(); return; }
  Object.assign(S.P, { matched: m.matchedAddress, lat: m.lat, lon: m.lon, sample: false, county: null, intel: { buildingCount: null, lastChecked: null } });
  const rename = S.project && /^New replacement-home project|^My copy of the sample/.test(S.project.name);
  S.dirty = true; await saveNow(rename ? { name: m.matchedAddress.split(',')[0].replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()) + ' rebuild' } : {});
  renderOverview(); toast('Address matched.'); tab('property');
}
function ensureMap() {
  if (map || !window.L) return;
  map = L.map('map', { scrollWheelZoom: false }).setView([38.85, -77.30], 10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
}
function renderProperty() {
  ensureMap(); const p = S.P;
  $('fullAddress').textContent = p.matched || (p.sample ? 'Fictional sample property · no verified address' : p.address ? 'Address entered (not verified): ' + p.address : 'Search for an address on Overview to begin.');
  if (map) {
    setTimeout(() => map.invalidateSize(), 120);
    if (marker) { map.removeLayer(marker); marker = null; }
    if (p.lat !== null && p.lat !== '') { map.setView([p.lat, p.lon], 17); marker = L.marker([p.lat, p.lon]).addTo(map).bindPopup('Approximate address location'); $('mapLink').href = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`; }
  }
  renderPropRecord(); renderThumbs();
}
function renderPropRecord() {
  const p = S.P, c = p.county;
  const rows = [['Matched address', p.matched || '—'], ['Coordinates', p.lat !== null && p.lat !== '' ? Number(p.lat).toFixed(5) + ', ' + Number(p.lon).toFixed(5) : '—'],
    ['Parcel ID', (c && c.pin) || p.parcelInput || 'Not retrieved'], ['Year built', p.yearBuilt || 'Not entered'], ['Existing area', p.existingArea ? Number(p.existingArea).toLocaleString() + ' sq ft' : 'Not entered'],
    ['Zoning', p.zone || 'Verification needed'], ['Evidence source', ({ owner: 'Owner supplied (unverified)', assessor: 'Assessor verified', survey: 'Professional survey', county: 'Fairfax County GIS' })[p.source] || p.source]];
  $('propRecord').innerHTML = rows.map(([a, b]) => `<div class="statrow"><span>${a}</span><strong>${esc(b)}</strong></div>`).join('');
}

/* files */
async function loadFiles(silent) {
  if (!S.pid) return;
  const d = await api('files.list', { projectId: S.pid }); S.files = d.files;
  if (S.current === 'files') renderFileGrid(); if (S.current === 'property') renderThumbs(); if (S.current === 'visualai') renderGallery(); if (S.current === 'overview') renderOverview();
}
function fileSrc(id) {
  if (!S.fileCache[id]) S.fileCache[id] = api('files.get', { id }).then(d => 'data:' + d.file.mime + ';base64,' + d.b64);
  return S.fileCache[id];
}
function hydrateImages(root) { qa('img[data-fid]', root).forEach(img => fileSrc(img.dataset.fid).then(src => { img.src = src; }).catch(() => { img.alt = 'Unavailable'; })); }
function renderThumbs() {
  const list = S.files.filter(f => f.kind !== 'render').slice(0, 24);
  $('thumbs').innerHTML = list.map(f => `<figure>${/^image/.test(f.mime) ? `<img data-fid="${f.id}" alt="${esc(f.name)}"/>` : '<div class="doc">📄</div>'}<figcaption title="${esc(f.name)}">${esc(f.kind)} · ${esc(f.name)}</figcaption></figure>`).join('') || '<p class="small">No files uploaded yet.</p>';
  hydrateImages($('thumbs'));
}
async function uploadFiles(files) {
  const kind = $('uploadKind').value; let n = 0;
  for (const f of files) {
    if (!/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(f.type)) { toast(f.name + ': unsupported type', { err: true }); continue; }
    $('uploadStatus').textContent = 'Uploading ' + f.name + '…';
    try {
      let b64, mime = f.type;
      if (/^image/.test(f.type) && f.size > 2.5e6) { const r = await resizeImage(f, 2400); b64 = r.b64; mime = r.mime; }
      else { if (f.size > 10e6) throw new Error(f.name + ' exceeds 10 MB'); b64 = (await readDataURL(f)).split(',')[1]; }
      await api('files.upload', { projectId: S.pid, name: f.name, mime, b64, kind }); n++;
    } catch (e) { fail(e); }
  }
  $('uploadStatus').textContent = n + ' file(s) uploaded and saved to the project.'; $('uploads').value = '';
  await loadFiles();
}
function renderFileGrid() {
  const k = $('fileFilter').value, list = S.files.filter(f => !k || f.kind === k);
  $('fileGrid').innerHTML = list.map(f => `<div class="card">${/^image/.test(f.mime) ? `<img data-fid="${f.id}" alt="${esc(f.name)}"/>` : '<div class="doc">📄</div>'}
    <p class="small"><span class="badge ${f.kind === 'render' ? 'ok' : ''}">${esc(f.kind)}</span> ${esc(f.name)}<br/>${esc(f.by)} · ${day(f.createdAt)} · ${(f.size / 1024).toFixed(0)} KB</p>
    <div class="flex"><button class="btn sm secondary" data-dl="${f.id}">Download</button>${S.canEdit || (S.user && f.by === S.user.name) ? `<button class="btn sm danger" data-rm="${f.id}">Delete</button>` : ''}</div></div>`).join('') || '<p>No files yet.</p>';
  hydrateImages($('fileGrid'));
  qa('[data-dl]').forEach(b => b.onclick = async () => { const f = S.files.find(x => x.id === b.dataset.dl); const src = await fileSrc(f.id).catch(fail); if (!src) return; const a = document.createElement('a'); a.href = src; a.download = f.name; a.click(); });
  qa('[data-rm]').forEach(b => b.onclick = async () => { if (!(await modal('Delete file?', '<p>The file is moved to trash for all collaborators.</p>', 'Delete'))) return; try { await api('files.delete', { id: b.dataset.rm }); await loadFiles(); } catch (e) { fail(e); } });
}
