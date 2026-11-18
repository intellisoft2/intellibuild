/* IntelliBuild AI™ v3.2.0 — guided project journey, Autopilot, and the narrated demo tour */
'use strict';

/* ================================================================== journey */
S.bidStats = { count: 0, awarded: 0 };
const JOURNEY = [
  { id: 'locate', t: 'Locate property', tab: 'overview', done: () => !!(S.P.matched || S.P.sample), next: 'Enter the property address and click Find property.' },
  { id: 'verify', t: 'Verify records', tab: 'records', done: () => !!(S.P.county || ['assessor', 'survey', 'county'].includes(S.P.source)), next: 'Pull official county records, or enter verified details from the assessor.' },
  { id: 'existing', t: 'Existing home', tab: 'property', done: () => !!S.P.existingArea && S.files.some(f => f.kind === 'photo'), next: 'Confirm the existing house details and upload a few photos.' },
  { id: 'design', t: 'Design', tab: 'design', done: () => !!S.P.designTouched, next: 'Choose the style, size, bedrooms and finish level of the new home.' },
  { id: 'visualize', t: 'Visualize', tab: 'visualai', done: () => S.files.some(f => f.kind === 'render' || f.kind === 'plan'), next: 'Generate an AI concept from a photo, or save the concept floor plan.' },
  { id: 'budget', t: 'Budget', tab: 'materials', done: () => !!S.P.priceReviewed, next: 'Review the materials & labor estimate and expected bid range.' },
  { id: 'permits', t: 'Permits', tab: 'quality', done: () => Object.values(S.P.checklist || {}).some(x => x && (x.date || x.done)), next: 'Schedule permits, safety steps and inspections.' },
  { id: 'bids', t: 'Collect bids', tab: 'bids', done: () => S.bidStats.count > 0, next: 'Invite contractors and collect bids.' },
  { id: 'award', t: 'Award', tab: 'bids', done: () => S.bidStats.awarded > 0, next: 'Level the bids against the estimate and award the best value.' }
];
function journeyState() { const st = JOURNEY.map(j => ({ j, done: !!(S.pid && j.done()) })); const cur = st.find(x => !x.done); return { st, cur, n: st.filter(x => x.done).length }; }
async function refreshBidStats() {
  if (!S.pid) return;
  try { const b = (await api('bids.list', { projectId: S.pid })).bids; S.bidStats = { count: b.length, awarded: b.filter(x => x.status === 'awarded').length }; } catch (e) { }
  renderJourney();
}
function renderJourney() {
  const el = $('journey'); if (!el) return;
  if (!S.pid || !PROJECT_TABS.has(S.current)) { el.classList.add('hidden'); return; }
  const { st, cur, n } = journeyState();
  el.classList.remove('hidden');
  el.innerHTML = `<div class="jr-top"><div class="jr-title"><b>Project journey</b> <span class="small">${n} of ${JOURNEY.length} steps complete</span></div>
    <div class="jr-next">${cur ? `<span class="small">Next:</span> <b>${esc(cur.j.next)}</b> <button class="btn sm" data-jgo="${cur.j.tab}">Go →</button>` : '<b>🎉 All steps complete — enjoy the build!</b>'}
    ${S.canEdit && !S.project.isDemo ? '<button class="btn sm secondary" id="autopilotBtn" title="Let IntelliBuild fill in everything it can">✨ Autopilot</button>' : ''}</div></div>
    <ol class="jr-steps">${st.map((x, i) => `<li class="${x.done ? 'done' : ''} ${cur && cur.j.id === x.j.id ? 'cur' : ''} ${S.current === x.j.tab ? 'here' : ''}"><button data-jgo="${x.j.tab}" title="${esc(x.j.next)}"><span class="jr-dot">${x.done ? '✓' : i + 1}</span><span class="jr-lbl">${esc(x.j.t)}</span></button></li>`).join('')}</ol>`;
  qa('[data-jgo]', el).forEach(b => b.onclick = () => tab(b.dataset.jgo));
  if ($('autopilotBtn')) $('autopilotBtn').onclick = autopilot;
}
function journeyList() {
  const { st, cur } = journeyState();
  return st.map((x, i) => `<div class="statrow jr-row ${x.done ? 'done' : ''}"><span><span class="jr-dot sm">${x.done ? '✓' : i + 1}</span> ${esc(x.j.t)}${!x.done && cur && cur.j.id === x.j.id ? ' <span class="badge warn">next</span>' : ''}</span><strong>${x.done ? '<span class="small">Done</span>' : `<button class="btn sm secondary" data-go="${x.j.tab}">Open</button>`}</strong></div>`).join('');
}

/* ================================================================== autopilot */
function suggestProgram(p) {
  if (p.designTouched || !p.existingArea) return false;
  const ex = Number(p.existingArea), beds = Number(p.bedrooms) || 3;
  p.area = Math.min(7000, Math.max(2800, Math.round(ex * 1.6 / 100) * 100));
  p.newBeds = Math.min(7, Math.max(4, beds + 1)); p.newBaths = p.newBeds - 0.5; p.stories = p.area > 3200 ? 2 : Number(p.stories) || 2;
  p.garage = Math.max(2, Number(p.garage) || 2); p.designTouched = true;
  return true;
}
const SCHEDULE_WEEKS = { dd: [0, 10], permit: [8, 22], safety: [22, 26], insp: [26, 62], close: [62, 70] };
function autoSchedule(force) {
  const st = checklistState(); let n = 0; const today = new Date();
  PHASES.forEach(ph => { const [a, b] = SCHEDULE_WEEKS[ph.id] || [0, 4]; ph.items.forEach((it, i) => {
    const cur = st[it[0]] = st[it[0]] || {};
    if (cur.done || (cur.date && !force)) return;
    const d = new Date(today.getTime() + ((a + (b - a) * (i + 1) / (ph.items.length + 1)) * 7) * 864e5);
    cur.date = d.toISOString().slice(0, 10); if (!cur.party) cur.party = it[2]; n++;
  }); });
  return n;
}
async function geocode(q) {
  try { return (await api('property.geocode', { address: q })).match; } catch (e) { return null; }
}
async function saveConceptPlanFile() {
  const svg = floorPlanSVG(S.P), img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2; const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url);
  await api('files.upload', { projectId: S.pid, name: 'concept-floor-plan-' + new Date().toISOString().slice(0, 10) + '.png', mime: 'image/png', b64: c.toDataURL('image/png').split(',')[1], kind: 'plan' });
}
async function autopilot() {
  if (!S.canEdit || !S.pid) return;
  let addr = S.P.matched || S.P.address;
  if (!addr && !S.P.sample) { const v = await modal('Autopilot', '<p>Enter the property address and IntelliBuild will set up the rest of the project for you.</p><label>Street address, city, state ZIP<input name="a" placeholder="e.g. 3615 Chain Bridge Rd, Fairfax, VA 22030"/></label>', 'Start Autopilot'); if (!v || !v.a.trim()) return; addr = v.a.trim(); S.P.address = addr; }
  const steps = [['locate', 'Locate the property'], ['map', 'Map nearby structures'], ['records', 'Pull official county records'], ['program', 'Suggest the new-home program'], ['price', 'Price materials & labor'], ['brief', 'Write the architect brief'], ['schedule', 'Schedule permits & inspections'], ['plan', 'Draw & save the concept floor plan']];
  const ov = document.createElement('div'); ov.className = 'modal'; ov.innerHTML = `<div class="modal-card ap"><h2>✨ Autopilot</h2><p class="small">Doing the busywork so you don't have to. You can change anything afterwards.</p><ol class="ap-steps">${steps.map(s => `<li id="ap_${s[0]}"><span class="ap-ico">○</span><span>${s[1]}</span><span class="small ap-note"></span></li>`).join('')}</ol><div class="flex end mt"><button class="btn hidden" id="apDone">See my next step →</button></div></div>`;
  document.body.append(ov);
  const mark = (id, state, note) => { const li = $('ap_' + id); li.className = state; li.querySelector('.ap-ico').textContent = { run: '◌', ok: '✓', skip: '–', err: '!' }[state]; li.querySelector('.ap-note').textContent = note || ''; };
  const run = async (id, fn) => { mark(id, 'run'); try { const r = await fn(); mark(id, r && r.skip ? 'skip' : 'ok', r && r.note); } catch (e) { mark(id, 'err', e.message); } };
  await run('locate', async () => {
    if (S.P.sample) return { skip: 1, note: 'Sample property' };
    if (S.P.matched) return { note: S.P.matched };
    const m = await geocode(addr); if (!m) throw new Error('No exact Census match — check the address on Overview');
    Object.assign(S.P, { matched: m.matchedAddress, lat: m.lat, lon: m.lon }); return { note: m.matchedAddress };
  });
  await run('map', async () => {
    if (S.P.lat === null || S.P.lat === '') return { skip: 1, note: 'Needs a located address' };
    const els = (await api('property.footprints', { lat: S.P.lat, lon: S.P.lon })).elements;
    S.P.intel = { buildingCount: els.length, lastChecked: new Date().toISOString() }; return { note: els.length + ' mapped buildings within 100 m' };
  });
  await run('records', async () => {
    if (S.P.county) return { note: 'Already retrieved' };
    if (!S.P.matched || !/,\s*VA\b/i.test(S.P.matched)) return { skip: 1, note: 'Official records available for Fairfax County, VA' };
    if (!premium()) return { skip: 1, note: 'Pro feature — unlock to auto-pull official records' };
    await lookupCounty(); if (!S.P.county) return { skip: 1, note: $('recordStatus').textContent.slice(0, 90) };
    const d = S.P.county.tables.dwelling || {}, l = S.P.county.tables.land || {}, pp = S.P.county.tables.parcel || {};
    if (d.SFLA) S.P.existingArea = Number(d.SFLA); if (d.YRBLT) S.P.yearBuilt = Number(d.YRBLT); if (d.RMBED) S.P.bedrooms = Number(d.RMBED); if (l.SF) S.P.lotArea = Number(l.SF); if (pp.ZONING_DESC) S.P.zone = pp.ZONING_DESC;
    S.P.parcelInput = S.P.county.pin; S.P.source = 'county'; return { note: 'PIN ' + S.P.county.pin };
  });
  await run('program', async () => { if (suggestProgram(S.P)) return { note: S.P.area.toLocaleString() + ' sq ft · ' + S.P.newBeds + ' bed · ' + S.P.newBaths + ' bath' }; return { skip: 1, note: S.P.designTouched ? 'Kept your design choices' : 'Add existing-home size for a suggestion' }; });
  await run('price', async () => { const cb = costbook(); if (!cb) return { skip: 1 }; const e = IBPricing.estimate(S.P, cb); S.P.rate = Math.round(e.totals.contract / Number(S.P.area) / 5) * 5; compute(); return { note: fmt(e.totals.contract) + ' expected contract · ' + fmt(e.totals.low) + '–' + fmt(e.totals.high) + ' bid range' }; });
  await run('brief', async () => { if (S.P.brief) return { skip: 1, note: 'Kept your existing brief' }; S.P.brief = templateBrief(); return {}; });
  await run('schedule', async () => { const n = autoSchedule(false); return n ? { note: n + ' items dated from today' } : { skip: 1, note: 'Already scheduled' }; });
  S.dirty = true; await saveNow(S.project && /^New replacement-home project/.test(S.project.name) && S.P.matched ? { name: S.P.matched.split(',')[0].replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()) + ' rebuild' } : {});
  await run('plan', async () => { if (S.files.some(f => f.kind === 'plan')) return { skip: 1, note: 'Plan already on file' }; await saveConceptPlanFile(); await loadFiles(); return { note: 'Saved to Files & Renders' }; });
  fillAll(); compute(); renderOverview(); renderDesigns(); renderJourney();
  const b = $('apDone'); b.classList.remove('hidden'); b.onclick = () => { ov.remove(); const c = journeyState().cur; tab(c ? c.j.tab : 'overview'); };
}

/* ================================================================== narrated tour */
const TOUR = [
  { tab: 'overview', sel: '#journey', title: 'Welcome to IntelliBuild AI', say: 'Welcome to IntelliBuild AI. In about two minutes, I will show you how to plan a knockdown and rebuild, from the address all the way to an awarded contractor. Every project follows this guided nine-step journey, and IntelliBuild always tells you the next step.' },
  { tab: 'overview', sel: '#journey .jr-next', title: 'Autopilot does the busywork', say: 'Short on time? Autopilot does the busywork. One click locates the property, pulls the records, suggests the new home program, prices the build, schedules permits and draws a concept floor plan.' },
  { tab: 'property', sel: '#map', title: 'Start with an address', say: 'It starts with your address. We match it against U.S. Census data, map it, and keep your photos, plans and surveys securely with the project, shared with your team.' },
  { tab: 'records', sel: '#records .hero', title: 'Verified county records', say: 'In Fairfax County, one click retrieves the official parcel, dwelling and assessment records, so your plan starts from verified facts instead of guesses.' },
  { tab: 'visualai', sel: '#visualai .two', title: 'See your new home with AI', say: 'Upload a photo of your current house, and our AI creates a photorealistic concept of the new home on the same lot, in the style and finish level you choose.' },
  { tab: 'design', sel: '#designCards', title: 'Design in minutes', say: 'Pick an architectural style, the size, bedrooms and finish level. Every number in the project updates instantly.' },
  { tab: 'docs', sel: '.fp-wrap', title: 'Floor plan & bid package', say: 'IntelliBuild drafts a concept floor plan and room schedule, then generates your invitation to bid, permit checklist and budget summary, ready to print or send.' },
  { tab: 'materials', sel: '#mlBody .grid', title: 'Know the real cost', say: 'This is where owners save real money. We price about fifty line items using current Northern Virginia material prices and published local labor wages, so you know what the house should cost before you talk to builders.' },
  { tab: 'materials', sel: '.rangebar', title: 'Catch lowball bids', say: 'Each bid is plotted against the expected range. Sample builder C looks cheapest, but IntelliBuild reads its exclusions, finds about one hundred eighty thousand dollars of missing scope, and compares every bid apples to apples, before a gap becomes a change order.' },
  { tab: 'bids', sel: '#bidList', title: 'Contractors bid in their own portal', say: 'Invite contractors by email. They submit bids in their own portal, and you shortlist and award with one click, with messages and tasks kept in one place.' },
  { tab: 'quality', sel: '.qc-phase', title: 'Permits & inspections on track', say: 'Permits, safety and inspections are organized in five phases, with official Fairfax County links, owners and target dates, so nothing slips through the cracks.' },
  { tab: 'overview', sel: null, title: 'Start your project free', say: 'That is IntelliBuild AI. Start free with two projects and five AI credits, and upgrade only when you are ready. Create your free account to begin your own project today.', cta: true }
];
const T = { i: -1, on: false, paused: false, muted: localStorage.getItem('ib_tour_muted') === '1', timer: null, token: 0 };
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices().filter(v => /^en(-|_)/i.test(v.lang));
  const pref = [/Google US English/i, /Natural/i, /Samantha/i, /Aria|Jenny|Guy/i, /Microsoft.*(Zira|David)/i, /en-US/i];
  for (const r of pref) { const v = vs.find(x => r.test(x.name) || r.test(x.lang)); if (v) return v; }
  return vs[0] || null;
}
function speak(text, done) {
  const tok = ++T.token, finish = () => { if (tok === T.token) done(); };
  if (T.muted || !('speechSynthesis' in window)) { T.timer = setTimeout(finish, Math.max(4500, text.split(' ').length * 400)); return; }
  speechSynthesis.cancel();
  const parts = text.match(/[^.!?]+[.!?]+/g) || [text], v = pickVoice();
  let k = 0, guard;
  const next = () => {
    if (tok !== T.token) return;
    if (k >= parts.length) { clearTimeout(guard); return finish(); }
    const u = new SpeechSynthesisUtterance(parts[k++].trim()); if (v) u.voice = v; u.rate = 1.02; u.pitch = 1;
    u.onend = next; u.onerror = next; speechSynthesis.speak(u);
  };
  guard = setTimeout(finish, Math.max(9000, text.split(' ').length * 650)); // safety if the browser never fires onend
  next();
}
function tourBox() {
  let b = $('tourBox');
  if (!b) { b = document.createElement('div'); b.id = 'tourBox'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-live', 'polite'); document.body.append(b); }
  const st = TOUR[T.i];
  b.innerHTML = `<div class="tb-prog"><div style="width:${(T.i + 1) / TOUR.length * 100}%"></div></div><div class="tb-head"><span class="tb-step">${T.i + 1} / ${TOUR.length}</span><b>${esc(st.title)}</b><button class="tb-x" id="tbX" aria-label="End tour">✕</button></div>
    <p>${esc(st.say)}</p>${st.cta ? `<div class="flex"><button class="btn" id="tbSign">${S.user ? 'Start my own project' : 'Create free account'}</button><button class="btn secondary" id="tbStay">Explore on my own</button></div>` : ''}
    <div class="tb-ctl"><button id="tbBack" ${T.i ? '' : 'disabled'} aria-label="Previous">⏮</button><button id="tbPlay" aria-label="${T.paused ? 'Play' : 'Pause'}">${T.paused ? '▶' : '⏸'}</button><button id="tbNext" ${T.i < TOUR.length - 1 ? '' : 'disabled'} aria-label="Next">⏭</button><button id="tbMute" aria-label="${T.muted ? 'Unmute' : 'Mute'}">${T.muted ? '🔇' : '🔊'}</button><span class="small">${'speechSynthesis' in window ? (T.muted ? 'Narration off' : 'Narration on') : 'Captions only'}</span></div>`;
  $('tbX').onclick = endTour; $('tbBack').onclick = () => tourGo(T.i - 1); $('tbNext').onclick = () => tourGo(T.i + 1);
  $('tbPlay').onclick = () => { T.paused = !T.paused; if (T.paused) { T.token++; clearTimeout(T.timer); if ('speechSynthesis' in window) speechSynthesis.cancel(); tourBox(); } else tourGo(T.i); };
  $('tbMute').onclick = () => { T.muted = !T.muted; localStorage.setItem('ib_tour_muted', T.muted ? '1' : '0'); tourGo(T.i); };
  if (st.cta) { $('tbSign').onclick = () => { endTour(); if (S.user) newProject(false); else showAuth('signup'); }; $('tbStay').onclick = endTour; }
}
function tourGo(i) {
  if (i < 0 || i >= TOUR.length) return;
  T.i = i; T.paused = false; clearTimeout(T.timer); T.token++;
  qa('.tour-focus').forEach(e => e.classList.remove('tour-focus'));
  const st = TOUR[i]; tab(st.tab); tourBox();
  setTimeout(() => {
    if (!T.on || T.i !== i) return;
    const el = st.sel && document.querySelector(st.sel);
    if (el) { el.classList.add('tour-focus'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    speak(st.say, () => { if (T.on && !T.paused && T.i === i && i < TOUR.length - 1) T.timer = setTimeout(() => tourGo(i + 1), 900); });
  }, 900);
}
async function startTour() {
  try {
    if (!S.pid || !S.project || !S.project.isDemo) await openDemo();
    T.on = true; document.body.classList.add('touring'); tourGo(0);
  } catch (e) { fail(e); }
}
function endTour() {
  T.on = false; T.token++; clearTimeout(T.timer); if ('speechSynthesis' in window) speechSynthesis.cancel();
  qa('.tour-focus').forEach(e => e.classList.remove('tour-focus')); document.body.classList.remove('touring');
  const b = $('tourBox'); if (b) b.remove();
}

/* ================================================================== wiring */
(function wireJourney() {
  const baseTab = tab;
  tab = function (name) { baseTab(name); renderJourney(); if (name === 'materials' && S.pid && S.canEdit && !S.P.priceReviewed) { S.P.priceReviewed = true; markDirty(); } };
  const baseApply = applyProject;
  applyProject = function (d, isDemo) { baseApply(d, isDemo); S.bidStats = { count: 0, awarded: 0 }; refreshBidStats(); };
  const baseLoadFiles = loadFiles;
  loadFiles = async function (silent) { await baseLoadFiles(silent); renderJourney(); if (S.current === 'overview') renderOverview(); };
  const baseOverview = renderOverview;
  renderOverview = function () { baseOverview(); if (S.pid) $('readiness').innerHTML = journeyList(); };
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
  document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.k; if (['area', 'stories', 'newBeds', 'newBaths', 'garage', 'finishTier', 'foundation'].includes(k) && S.canEdit && !S.P.designTouched) { S.P.designTouched = true; renderJourney(); } });
  document.addEventListener('keydown', e => { if (T.on && e.key === 'Escape') endTour(); });
  qa('[data-tour]').forEach(b => b.onclick = async () => { if (!S.user && !S.guest) await startGuest(); startTour(); });
})();
