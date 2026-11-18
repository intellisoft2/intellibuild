/* IntelliBuild AI™ v3.2.7 — Materials & Labor price book, Permits/Safety/Quality, Plans & Documents, key tests */
'use strict';

/* ================================================================== price book */
function costbook() { return (S.plansCfg && S.plansCfg.costbook) || null; }
const TRADE_LABEL = { laborer: 'Construction laborers', carpenter: 'Carpenters', electrician: 'Electricians', plumber: 'Plumbers', hvac: 'HVAC mechanics', mason: 'Masons',
  tile: 'Tile setters', flooring: 'Floor layers', painter: 'Painters', drywall: 'Drywall installers', cementMason: 'Cement masons', roofer: 'Roofers', insulation: 'Insulation installers', operator: 'Equipment operators' };
let mlBids = [], mlOpen = {};
async function renderMaterials() {
  const cb = costbook();
  if (!cb) { $('mlBody').innerHTML = '<p class="small">Loading price book…</p>'; S.plansCfg = await api('billing.plans'); return renderMaterials(); }
  if (S.pid) { try { mlBids = (await api('bids.list', { projectId: S.pid })).bids; } catch (e) { mlBids = []; } }
  drawMaterials();
}
function drawMaterials() {
  const cb = costbook(), p = S.P, e = IBPricing.estimate(p, cb), t = e.totals, n = IBPricing.nahbBenchmark(p, cb);
  const kpi = (a, b, s) => `<div class="card"><div class="small">${a}</div><div class="metric">${b}</div>${s ? `<div class="small">${s}</div>` : ''}</div>`;
  const pct = (v, tot) => tot ? (v / tot * 100).toFixed(1) + '%' : '—';
  const stageRows = e.stages.filter(s => s.scope === 'contract');
  const maxStage = Math.max(...stageRows.map(s => s.price), 1);
  const bidsHtml = mlBids.length ? (() => {
    const lo = Math.min(t.low, ...mlBids.map(b => b.price)) * 0.95, hi = Math.max(t.high, ...mlBids.map(b => b.price)) * 1.05, x = v => ((v - lo) / (hi - lo) * 100).toFixed(2) + '%';
    const lev = mlBids.map(b => Object.assign({ b }, IBPricing.levelBid(b, e)));
    return `<div class="rangebar"><div class="band" style="left:${x(t.low)};width:calc(${x(t.high)} - ${x(t.low)})"></div><div class="tick est" style="left:${x(t.contract)}" title="Estimate ${fmt(t.contract)}"></div>
      ${lev.map((l, i) => `<div class="tick bid" style="left:${x(l.b.price)}" title="${esc(l.b.firm)} ${fmt(l.b.price)}"><span>${i + 1}</span></div>`).join('')}</div>
      <div class="flex small mt"><span><i class="sw est"></i>IntelliBuild estimate ${fmt(t.contract)}</span><span><i class="sw band"></i>Expected bid range ${fmt(t.low)} – ${fmt(t.high)}</span><span><i class="sw bid"></i>Bids (numbered)</span></div>
      <div class="scroll mt"><table class="data"><thead><tr><th>#</th><th>Contractor</th><th class="num">Bid</th><th class="num">$/sq ft</th><th>Excluded scope (from bid)</th><th class="num">Comparable estimate</th><th class="num">Variance</th><th>Assessment</th></tr></thead><tbody>
      ${lev.map((l, i) => `<tr><td>${i + 1}</td><td><b>${esc(l.b.firm)}</b><div class="small">${l.b.months} months · ${esc(l.b.status)}</div></td><td class="num">${fmt(l.b.price)}</td><td class="num">${fmt(l.perSqft)}</td><td class="small">${l.excluded.length ? esc(l.excluded.join(', ')) + ' <b>(−' + fmt(l.removed) + ')</b>' : 'None detected'}</td><td class="num">${fmt(l.comparable)}</td><td class="num"><b style="color:${l.verdict[0] === 'bad' ? 'var(--red)' : l.verdict[0] === 'warn' ? 'var(--gold)' : 'var(--teal)'}">${l.variance >= 0 ? '+' : ''}${l.variance.toFixed(1)}%</b></td><td><span class="badge ${l.verdict[0]}">${esc(l.verdict[1])}</span></td></tr>`).join('')}</tbody></table></div>
      <p class="small">Excluded scope is detected from each bid's “Exclusions” text and removed from the comparable estimate. Ask every bidder to use the trade breakdown in the Invitation to Bid (Plans &amp; Documents) for line-by-line leveling.</p>`;
  })() : `<p class="small">No bids yet. Once contractors submit bids on <a href="#bids" data-go="bids" class="link">Contractor Bids</a>, they are leveled here against this estimate.</p>`;
  const groups = {};
  e.lines.forEach(l => (groups[l.stage] = groups[l.stage] || []).push(l));
  const ed = S.canEdit;
  const lineTable = Object.keys(groups).map(st => {
    const ls = groups[st], open = mlOpen[st];
    return `<tbody class="grp"><tr class="grp-head" data-grp="${esc(st)}"><td colspan="9"><b>${open ? '▾' : '▸'} ${esc(st)}</b> <span class="small">· ${ls.length} items · ${fmt(ls.reduce((a, l) => a + l.price, 0))}${ls[0].scope === 'owner' ? ' · owner-paid, not in contractor bids' : ''}</span></td></tr>
      ${open ? ls.map(l => `<tr><td>${esc(l.item)}${l.overridden ? ' <span class="badge warn">edited</span>' : ''}</td><td class="num">${ed ? `<input class="ml-in" data-ml="${l.id}" data-f="qty" type="number" step="any" value="${+l.qty.toFixed(2)}"/>` : (+l.qty.toFixed(1)).toLocaleString()}</td><td class="small">${esc(l.unit)}</td>
        <td class="num">${ed ? `<input class="ml-in" data-ml="${l.id}" data-f="matUnit" type="number" step="any" value="${+l.matUnit.toFixed(2)}"/>` : fmt2(l.matUnit)}</td><td class="num">${fmt(l.mat)}</td><td class="small">${l.trade ? esc(TRADE_LABEL[l.trade] || l.trade) : 'Subcontract / allowance'}</td>
        <td class="num">${l.trade ? (ed ? `<input class="ml-in sm" data-ml="${l.id}" data-f="hrs" type="number" step="any" value="${l.hrsPerUnit}"/>` : l.hrsPerUnit) : '—'}</td><td class="num">${l.trade ? fmt(l.lab) + '<div class="small">' + Math.round(l.labHrs).toLocaleString() + ' h</div>' : '—'}</td><td class="num"><b>${fmt(l.price)}</b></td></tr>`).join('') : ''}</tbody>`;
  }).join('');
  const nahbStage = {};
  n.rows.forEach(r => { nahbStage[r.grp] = (nahbStage[r.grp] || 0) + r.value; });
  const mine = { site: 0, foundation: 0, framing: 0, exterior: 0, mep: 0, interior: 0, final: 0, soft: 0 };
  const stageMap = { 'Demolition & site': 'site', 'Foundations': 'foundation', 'Framing': 'framing', 'Exterior': 'exterior', 'Mechanical, electrical & plumbing': 'mep', 'Interior': 'interior', 'Final steps': 'final', 'Owner soft costs': 'soft' };
  e.stages.forEach(s => { mine[stageMap[s.stage]] += s.price * (s.scope === 'contract' ? t.markupFactor : 1); });
  const grpLabel = { site: 'Site work & demolition', foundation: 'Foundations', framing: 'Framing', exterior: 'Exterior finishes', mep: 'Major systems (MEP)', interior: 'Interior finishes', final: 'Final steps & other', soft: 'Permits, fees, design' };
  $('mlBody').innerHTML = `
  <div class="grid">${kpi('Expected contract price', fmt(t.contract), fmt(t.perSqft) + ' / sq ft · incl. GC fee & general conditions')}${kpi('Expected bid range', fmt(t.low) + ' – ' + fmt(t.high), '±' + cb.bidRangePct + '% around the estimate')}
  ${kpi('Materials (direct)', fmt(t.materials), pct(t.materials, t.materials + t.labor) + ' of direct cost')}${kpi('Labor (direct)', fmt(t.labor), Math.round(t.laborHours).toLocaleString() + ' labor hours · ' + pct(t.labor, t.materials + t.labor))}</div>
  <div class="grid section">${kpi('Trade costs incl. sub O&amp;P (' + cb.subMarkupPct + '%)', fmt(t.tradeCost))}${kpi('General conditions (' + cb.generalConditionsPct + '%)', fmt(t.generalConditions), 'Supervision, temp utilities, insurance')}${kpi('Builder fee (' + cb.gcFeePct + '%)', fmt(t.gcFee))}${kpi('Owner soft costs', fmt(t.owner), 'Permits, design, survey, grading plan')}</div>
  <div class="card section"><div class="flex between"><h2>Bid benchmark</h2><span class="small">Total project incl. owner costs: <b>${fmt(t.project)}</b></span></div>${bidsHtml}</div>
  <div class="two section"><div class="card"><h2>Cost by construction stage</h2>${stageRows.map(s => `<div class="hbar wide"><span>${esc(s.stage)}</span><div class="track"><div class="fill" style="width:${(s.price / maxStage * 100).toFixed(1)}%"></div></div><b>${fmt(s.price)}</b></div>`).join('')}<p class="small">Trade prices include subcontractor overhead &amp; profit; GC fee and general conditions shown above.</p></div>
  <div class="card"><h2>Labor by trade</h2><div class="scroll"><table class="data"><thead><tr><th>Trade</th><th class="num">Wage</th><th class="num">Burdened</th><th class="num">Hours</th><th class="num">Cost</th></tr></thead><tbody>${e.labTrades.map(l => `<tr><td>${esc(TRADE_LABEL[l.trade] || l.trade)}<div class="small">${esc((cb.wages[l.trade] || {}).src || '')}</div></td><td class="num">${fmt2(l.wage)}</td><td class="num">${fmt2(l.wage * cb.laborBurden)}</td><td class="num">${Math.round(l.hrs).toLocaleString()}</td><td class="num">${fmt(l.cost)}</td></tr>`).join('')}</tbody></table></div><p class="small">Burden ×${cb.laborBurden} covers payroll taxes, workers’ comp, liability insurance and benefits.</p></div></div>
  <div class="card section"><div class="flex between"><h2>Line-item materials &amp; labor</h2><div class="flex"><button class="btn sm secondary" id="mlExpand">Expand all</button>${ed ? '<button class="btn sm secondary" id="mlReset">Reset edits</button>' : ''}<button class="btn sm secondary" id="mlCsv">Export CSV</button>${ed ? '<button class="btn sm" id="mlUseRate">Use as Cost Estimator rate</button>' : ''}</div></div>
    <p class="small">Quantities are derived from the Design Studio (${Number(p.area).toLocaleString()} sq ft, ${p.stories} stories, ${esc(p.foundation || 'basement')}, ${esc(p.finishTier || 'Premium')} finishes). ${ed ? 'Edit quantity, unit price or hours per unit to replace any line with a supplier or subcontractor quote.' : ''}</p>
    <div class="scroll"><table class="data ml"><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Material / unit</th><th class="num">Material</th><th>Labor trade</th><th class="num">Hrs / unit</th><th class="num">Labor</th><th class="num">Price</th></tr></thead>${lineTable}</table></div></div>
  <div class="two section"><div class="card"><h2>Cross-check: NAHB national benchmark</h2><p class="small">NAHB 2024 average components scaled to ${Number(p.area).toLocaleString()} sq ft, escalated ${cb.nahb2024.escalationTo2026Pct}% to 2026 and ×${cb.nahb2024.regionFactor} for Northern Virginia (editable assumptions).</p>
    <table class="data"><thead><tr><th>Stage</th><th class="num">IntelliBuild</th><th class="num">NAHB-scaled</th><th class="num">Diff</th></tr></thead><tbody>${Object.keys(grpLabel).map(g => `<tr><td>${grpLabel[g]}</td><td class="num">${fmt(mine[g])}</td><td class="num">${fmt(nahbStage[g] || 0)}</td><td class="num">${g === 'site' ? '<span class="small">n/a¹</span>' : nahbStage[g] ? ((mine[g] / nahbStage[g] - 1) * 100).toFixed(0) + '%' : '—'}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td class="num"><b>${fmt(t.project)}</b></td><td class="num"><b>${fmt(n.total)}</b></td><td class="num"><b>${((t.project / n.total - 1) * 100).toFixed(0)}%</b></td></tr></tbody></table>
    <p class="small">¹ NAHB homes are built on vacant finished lots, so its site work excludes demolition, abatement and utility reconnection. NAHB reflects average production-builder homes; custom Northern Virginia homes usually run higher in finishes.</p></div>
  <div class="card"><h2>Price data &amp; sources</h2><p class="small">Price book: ${esc(cb.region)} · as of ${esc(cb.asOf)}. Administrators can update every price, wage and productivity factor in Admin Console → Price book.</p>
    <ul class="srcs">${cb.sources.map(s => `<li><a class="link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a></li>`).join('')}</ul>
    <h3 class="mt">Professional cost data you can plug in</h3><ul class="srcs small"><li><b>RSMeans Data (Gordian)</b> — industry-standard unit and assembly costs with city cost indexes; licensed online/API. <a class="link" href="https://www.rsmeans.com" target="_blank" rel="noopener">rsmeans.com ↗</a></li>
    <li><b>1build</b> — live county-level material, labor and equipment prices via API. <a class="link" href="https://www.1build.com" target="_blank" rel="noopener">1build.com ↗</a></li><li><b>Craftsman National Construction Estimator</b> — annual residential cost book with area modifiers. <a class="link" href="https://craftsman-book.com" target="_blank" rel="noopener">craftsman-book.com ↗</a></li>
    <li><b>BLS OEWS &amp; PPI</b> — free official wage and price-index data used for this price book. <a class="link" href="https://www.bls.gov/oes/" target="_blank" rel="noopener">bls.gov ↗</a></li></ul></div></div>
  <div class="note">Planning estimate only. Prices vary by supplier, season, site access and design. Replace allowances with written quotes before contracting.</div>`;
  qa('[data-grp]').forEach(r => r.onclick = () => { mlOpen[r.dataset.grp] = !mlOpen[r.dataset.grp]; drawMaterials(); });
  $('mlExpand').onclick = () => { const all = Object.keys(groups).every(g => mlOpen[g]); Object.keys(groups).forEach(g => mlOpen[g] = !all); drawMaterials(); };
  qa('[data-ml]').forEach(inp => inp.onchange = () => { S.P.mlOverrides = S.P.mlOverrides || {}; const o = S.P.mlOverrides[inp.dataset.ml] = S.P.mlOverrides[inp.dataset.ml] || {}; o[inp.dataset.f] = Number(inp.value); markDirty(); drawMaterials(); });
  if ($('mlReset')) $('mlReset').onclick = () => { S.P.mlOverrides = {}; markDirty(); drawMaterials(); };
  if ($('mlUseRate')) $('mlUseRate').onclick = () => { S.P.rate = Math.round(t.contract / Number(p.area) / 5) * 5; fillAll(); compute(); markDirty(); toast('Cost Estimator rate set to $' + S.P.rate + '/sq ft from the price book.'); };
  $('mlCsv').onclick = () => {
    const rows = [['Stage', 'Item', 'Quantity', 'Unit', 'Material unit $', 'Material $', 'Labor trade', 'Hours/unit', 'Labor hours', 'Labor $', 'Price $ (incl. sub O&P)']].concat(e.lines.map(l => [l.stage, l.item, l.qty.toFixed(2), l.unit, l.matUnit.toFixed(2), l.mat.toFixed(0), TRADE_LABEL[l.trade] || '', l.hrsPerUnit, l.labHrs.toFixed(1), l.lab.toFixed(0), l.price.toFixed(0)]))
      .concat([[], ['', 'General conditions', '', '', '', '', '', '', '', '', t.generalConditions.toFixed(0)], ['', 'Builder fee', '', '', '', '', '', '', '', '', t.gcFee.toFixed(0)], ['', 'Expected contract price', '', '', '', '', '', '', '', '', t.contract.toFixed(0)]]);
    downloadBlob('intellibuild-materials-labor.csv', new Blob([rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n')], { type: 'text/csv' }));
  };
}

/* ================================================================== permits, safety & quality */
const PHASES = [
  { id: 'dd', name: 'Due diligence & design', items: [
    ['zoning', 'Verify parcel, zoning, setbacks, easements & RPA', 'Owner', 'https://www.fairfaxcounty.gov/planning-development/zoning'],
    ['survey', 'Boundary & topographic survey; house location plat', 'Surveyor'],
    ['geo', 'Soils / geotechnical evaluation', 'Engineer'],
    ['trees', 'Tree inventory & tree-preservation plan', 'Arborist'],
    ['plans', 'Architectural & structural construction drawings', 'Architect'],
    ['energy', 'Energy code compliance (REScheck / HERS)', 'Architect'],
    ['bids', 'Contractor bids leveled & contract signed', 'Owner']] },
  { id: 'permit', name: 'Permits & approvals', items: [
    ['inf', 'Infill lot grading plan (INF) approved', 'Engineer', 'https://www.fairfaxcounty.gov/landdevelopment/permit-library/infill-lot-grading-plans'],
    ['demoPermit', 'Residential demolition permit (DEMOR)', 'Contractor', 'https://www.fairfaxcounty.gov/landdevelopment/node/788'],
    ['bldr', 'New single-family building permit (BLDR)', 'Contractor', 'https://www.fairfaxcounty.gov/landdevelopment/permit-library/new-building-residential'],
    ['trade', 'Electrical, mechanical & plumbing trade permits', 'Contractor'],
    ['vdot', 'VDOT / right-of-way permit (driveway apron, utilities)', 'Contractor'],
    ['utilities', 'Water & sewer availability; utility service applications', 'Owner'],
    ['hoa', 'HOA / architectural review approval (if applicable)', 'Owner']] },
  { id: 'safety', name: 'Demolition & site safety', items: [
    ['hazmat', 'Asbestos & lead survey; abatement before demolition', 'Contractor'],
    ['disconnect', 'Gas, electric, water & sewer disconnects confirmed', 'Contractor'],
    ['811', 'VA811 “call before you dig” utility locate', 'Contractor', 'https://www.va811.com'],
    ['esc', 'Erosion & sediment controls installed (silt fence, inlet protection)', 'Contractor'],
    ['tpf', 'Tree-protection fencing installed', 'Contractor'],
    ['fence', 'Site fencing, signage & construction entrance', 'Contractor'],
    ['plan', 'Site-specific safety plan; OSHA fall protection & PPE', 'Contractor', 'https://www.osha.gov/residential-construction'],
    ['preCon', 'Pre-construction meeting with county inspector', 'Contractor']] },
  { id: 'insp', name: 'Construction inspections', items: [
    ['footing', 'Footing inspection', 'County'], ['foundation', 'Foundation, waterproofing & drain tile inspection', 'County'], ['wallcheck', 'Wall check / location survey', 'Surveyor'],
    ['framing', 'Framing inspection', 'County'], ['mep', 'Electrical, plumbing & mechanical rough-in inspections', 'County'],
    ['insulation', 'Insulation & air-barrier inspection', 'County'], ['blower', 'Blower-door & duct-leakage tests', 'Contractor'], ['drywall', 'Pre-drywall owner walkthrough', 'Owner']] },
  { id: 'close', name: 'Quality & closeout', items: [
    ['finals', 'Final electrical, plumbing, mechanical & building inspections', 'County'], ['asbuilt', 'As-built survey & final grading/E&S release', 'Surveyor'],
    ['rup', 'Residential use permit / certificate of occupancy', 'Contractor'], ['punch', 'Punch list complete & signed off', 'Owner'],
    ['warranty', 'Warranties, manuals & lien waivers received', 'Owner'], ['bond', 'Grading bond / escrow released', 'Owner']] }
];
const LEGACY_CHECKS = ['zoning', 'survey', 'hazmat', 'disconnect', 'plans', 'demoPermit', 'bldr', 'foundation', 'mep', 'insulation', 'finals', 'rup'];
const PARTIES = ['Owner', 'Architect', 'Engineer', 'Surveyor', 'Arborist', 'Contractor', 'County'];
let qcFilter = 'all';
function checklistState() {
  const p = S.P; p.checklist = p.checklist || {};
  Object.keys(p.checks || {}).forEach(i => { const id = LEGACY_CHECKS[i]; if (id && p.checks[i] && !p.checklist[id]) p.checklist[id] = { done: true }; });
  return p.checklist;
}
const allItems = () => PHASES.flatMap(ph => ph.items.map(it => ({ ph, id: it[0], t: it[1], party: it[2], link: it[3] })));
function checklistProgress() { const st = checklistState(), all = allItems(); const n = all.filter(i => (st[i.id] || {}).done).length; return { n, total: all.length, pct: Math.round(n / all.length * 100) }; }
function renderChecklist() {
  const st = checklistState(), pr = checklistProgress(), ed = S.canEdit;
  $('mTasks').textContent = pr.pct + '% complete';
  const next = allItems().filter(i => !(st[i.id] || {}).done).slice(0, 3);
  $('checklist').innerHTML = `<div class="grid qc-kpis"><div class="card"><div class="small">Overall progress</div><div class="metric">${pr.pct}%</div><div class="progress mt"><div style="width:${pr.pct}%"></div></div><div class="small mt">${pr.n} of ${pr.total} items complete</div></div>
    ${PHASES.slice(0, 3).map(ph => phaseKpi(ph, st)).join('')}</div>
    <div class="flex between section"><div class="seg" id="qcFilter">${[['all', 'All items'], ['open', 'Open'], ['done', 'Completed']].map(([v, l]) => `<button data-f="${v}" class="${qcFilter === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="small">Next up: ${next.map(i => '<b>' + esc(i.t) + '</b>').join(' · ') || 'All done 🎉'}</div><button class="btn sm secondary" id="qcCsv">Export CSV</button></div>
    ${PHASES.map((ph, pi) => {
      const items = ph.items.map(it => ({ id: it[0], t: it[1], party: it[2], link: it[3], s: st[it[0]] || {} })).filter(i => qcFilter === 'all' || (qcFilter === 'done' ? i.s.done : !i.s.done));
      const done = ph.items.filter(it => (st[it[0]] || {}).done).length;
      return `<div class="card section qc-phase"><div class="qc-head"><span class="qc-num">${pi + 1}</span><div><h2>${esc(ph.name)}</h2><div class="small">${done} of ${ph.items.length} complete</div></div><div class="progress qc-bar"><div style="width:${done / ph.items.length * 100}%"></div></div></div>
      ${items.length ? `<div class="qc-rows">${items.map(i => `<div class="qc-row ${i.s.done ? 'done' : ''}">
        <label class="qc-check"><input type="checkbox" data-qc="${i.id}" ${i.s.done ? 'checked' : ''} ${ed ? '' : 'disabled'}/><span></span></label>
        <div class="qc-title">${esc(i.t)}${i.link ? ` <a class="chiplink" href="${esc(i.link)}" target="_blank" rel="noopener">Official info ↗</a>` : ''}${i.s.done && i.s.doneAt ? `<div class="small">Completed ${day(i.s.doneAt)}${i.s.by ? ' by ' + esc(i.s.by) : ''}</div>` : ''}</div>
        <select data-qcp="${i.id}" ${ed ? '' : 'disabled'} aria-label="Responsible party">${PARTIES.map(p => `<option ${(i.s.party || i.party) === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
        <input type="date" data-qcd="${i.id}" value="${esc(i.s.date || '')}" ${ed ? '' : 'disabled'} aria-label="Target date"/>
        <input data-qcn="${i.id}" value="${esc(i.s.note || '')}" placeholder="Permit #, inspector, notes…" ${ed ? '' : 'disabled'} aria-label="Notes"/></div>`).join('')}</div>` : '<p class="small">No items match this filter.</p>'}</div>`;
    }).join('')}`;
  const upd = (id, patch) => { const cur = st[id] = Object.assign({}, st[id] || {}, patch); if (patch.done !== undefined) { cur.doneAt = patch.done ? new Date().toISOString() : ''; cur.by = patch.done && S.user ? S.user.name : ''; } markDirty(); };
  qa('[data-qc]').forEach(el => el.onchange = () => { upd(el.dataset.qc, { done: el.checked }); renderChecklist(); });
  qa('[data-qcp]').forEach(el => el.onchange = () => upd(el.dataset.qcp, { party: el.value }));
  qa('[data-qcd]').forEach(el => el.onchange = () => upd(el.dataset.qcd, { date: el.value }));
  qa('[data-qcn]').forEach(el => el.onchange = () => upd(el.dataset.qcn, { note: el.value }));
  qa('#qcFilter button').forEach(b => b.onclick = () => { qcFilter = b.dataset.f; renderChecklist(); });
  $('qcCsv').onclick = () => { const rows = [['Phase', 'Item', 'Responsible', 'Target date', 'Status', 'Completed', 'Notes']].concat(allItems().map(i => { const s = st[i.id] || {}; return [i.ph.name, i.t, s.party || i.party, s.date || '', s.done ? 'Done' : 'Open', s.doneAt ? s.doneAt.slice(0, 10) : '', s.note || '']; }));
    downloadBlob('intellibuild-permits-quality.csv', new Blob([rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n')], { type: 'text/csv' })); };
}
function phaseKpi(ph, st) { const d = ph.items.filter(it => (st[it[0]] || {}).done).length; return `<div class="card"><div class="small">${esc(ph.name)}</div><div class="metric">${d}/${ph.items.length}</div><div class="progress mt"><div style="width:${d / ph.items.length * 100}%"></div></div></div>`; }
function progress() { const pr = checklistProgress(); $('mTasks').textContent = pr.pct + '% complete'; }

/* ================================================================== plans & documents */
function roomProgram(p) {
  const S0 = Number(p.stories) || 2, beds = Number(p.newBeds) || 4, baths = Number(p.newBaths) || Math.max(2, beds - 0.5), full = Math.floor(baths), half = baths % 1 >= 0.5 ? 1 : 0;
  const lux = { Standard: 1, Premium: 1.12, Luxury: 1.28 }[p.finishTier || 'Premium'] || 1, style = p.design || '';
  if (S0 === 1) {
    const front = [['Foyer', 70], ['Study', 130], ['Dining', 170]], back = [['Family room', 360], ['Kitchen', 240], ['Primary bedroom', 240 * lux], ['Primary bath', 110 * lux], ['Walk-in closet', 70]];
    for (let b = 2; b <= beds; b++) front.push(['Bedroom ' + b, 150]);
    for (let b = 2; b <= full; b++) front.push(['Bath ' + b, 55], ['Linen', 22]);
    if (half) back.push(['Powder', 30]); back.push(['Laundry / mud', 80]);
    return [{ name: 'Main level', front, back, stair: false }];
  }
  const f1f = [['Foyer', 110], ['Study', 140], ['Dining', 190 * lux]], f1b = [['Family room', 380 * lux], ['Kitchen', 260 * lux], ['Breakfast', 130], ['Mudroom', 70], ['Pantry', 40]];
  if (half) f1f.push(['Powder', 35], ['Coat closet', 25]);
  let upBeds = beds;
  if (beds >= 5) { if (half) f1f.pop(); f1f.splice(f1f.length - (half ? 1 : 0), 0, ['Guest suite', 170], ['Guest bath', 55]); upBeds--; }
  const f2f = [], f2b = [['Primary bedroom', 260 * lux], ['Primary bath', 140 * lux], ['Walk-in closet', 90 * lux]];
  for (let b = 2; b <= upBeds; b++) f2f.push(['Bedroom ' + b, 165]);
  const upperBaths = Math.max(1, full - 1 - (beds >= 5 ? 1 : 0));
  for (let b = 0; b < upperBaths; b++) f2f.splice(Math.min(f2f.length, 1 + b * 3), 0, ['Bath ' + (b + 2), 60], ['Closet', 28]);
  f2b.push(['Laundry', 60]);
  const floors = [{ name: 'First floor', front: f1f, back: f1b, stair: true }, { name: 'Second floor', front: f2f, back: f2b, stair: true }];
  if (S0 >= 3) floors.push({ name: 'Third floor', front: [['Bonus / rec room', 360], ['Bedroom', 170]], back: [['Bath', 60], ['Storage', 120]], stair: true });
  return floors;
}
function layoutFloors(p) {
  const S0 = Number(p.stories) || 2, fp = (Number(p.area) || 4000) / S0, W = Math.round(Math.sqrt(fp * 1.55)), D = Math.round(fp / W), flip = (p.planVariant || 0) % 2 === 1;
  const hall = S0 > 1 ? 5 : 4;
  return roomProgram(p).map((f, fi) => {
    const sumF = f.front.reduce((a, r) => a + r[1], 0), sumB = f.back.reduce((a, r) => a + r[1], 0);
    const usable = D - hall, dF = Math.max(10, Math.round(usable * sumF / (sumF + sumB))), dB = usable - dF;
    // Consecutive small rooms (baths, closets, pantries) share one column, stacked, so proportions stay realistic.
    const place = (rooms, y, h) => {
      const cols = [];
      for (let i = 0; i < rooms.length; i++) { const r = rooms[i], n = rooms[i + 1]; if (r[1] < 110 && n && n[1] < 110) { cols.push([r, n]); i++; } else cols.push([r]); }
      const tot = rooms.reduce((a, r) => a + r[1], 0); let cum = 0, out = [];
      cols.forEach(c => { const wt = c.reduce((a, r) => a + r[1], 0), x0 = Math.round(W * cum / tot); cum += wt; const w = Math.max(1, Math.round(W * cum / tot) - x0), x = flip ? W - x0 - w : x0;
        if (c.length === 1) out.push({ name: c[0][0], x, y, w, h }); else { const h1 = Math.max(4, Math.round(h * c[0][1] / wt)); out.push({ name: c[0][0], x, y, w, h: h1 }, { name: c[1][0], x, y: y + h1, w, h: h - h1 }); } });
      return out;
    };
    const rooms = place(f.front, 0, dF).concat(f.stair ? [{ name: 'Stair', x: flip ? W - Math.round(W * 0.42) - 4 : Math.round(W * 0.42), y: dF, w: 4, h: hall, stair: true }, { name: 'Hall', x: 0, y: dF, w: W, h: hall, hall: true }] : [{ name: 'Gallery / hall', x: 0, y: dF, w: W, h: hall, hall: true }]).concat(place(f.back, dF + hall, dB));
    return { name: f.name, W, D, rooms, garage: fi === 0 && Number(p.garage) > 0 ? { w: Number(p.garage) * 11 + 2, h: 24 } : null, flip };
  });
}
function floorPlanSVG(p) {
  const floors = layoutFloors(p), gW = floors[0].garage ? floors[0].garage.w : 0, totalW = floors[0].W + gW, sc = Math.min(11, 860 / totalW), pad = 40;
  let y = pad, out = '';
  floors.forEach(f => {
    const ox = pad + (f.flip ? 0 : gW * sc), oy = y + 26;
    out += `<text x="${pad}" y="${y + 14}" class="fp-title">${esc(f.name)} · ${f.W}' × ${f.D}' · ${(f.W * f.D).toLocaleString()} sq ft</text>`;
    if (f.garage) { const gx = f.flip ? pad + f.W * sc : pad, gh = f.garage.h * sc; out += `<rect x="${gx}" y="${oy + (f.D * sc - gh)}" width="${f.garage.w * sc}" height="${gh}" class="fp-garage"/><text x="${gx + f.garage.w * sc / 2}" y="${oy + f.D * sc - gh / 2}" class="fp-label">Garage</text><text x="${gx + f.garage.w * sc / 2}" y="${oy + f.D * sc - gh / 2 + 15}" class="fp-dim">${f.garage.w}' × ${f.garage.h}'</text>`; }
    f.rooms.filter(r => r.hall).concat(f.rooms.filter(r => !r.hall)).forEach(r => {
      const x = ox + r.x * sc, yy = oy + r.y * sc, w = r.w * sc, h = r.h * sc;
      out += `<rect x="${x}" y="${yy}" width="${w}" height="${h}" class="${r.stair ? 'fp-stair' : r.hall ? 'fp-hall' : 'fp-room'}"/>`;
      if (r.stair) for (let i = 1; i < 6; i++) out += `<line x1="${x}" x2="${x + w}" y1="${yy + h * i / 6}" y2="${yy + h * i / 6}" class="fp-tread"/>`;
      else if (!r.hall && w > 30 && h > 22) out += `<text x="${x + w / 2}" y="${yy + h / 2 - 2}" class="fp-label">${esc(r.name)}</text><text x="${x + w / 2}" y="${yy + h / 2 + 13}" class="fp-dim">${r.w}' × ${r.h}'</text>`;
    });
    out += `<rect x="${ox}" y="${oy}" width="${f.W * sc}" height="${f.D * sc}" class="fp-outline"/>`;
    y = oy + f.D * sc + 40;
  });
  const H = y + 10, Wd = totalW * sc + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="Concept floor plan"><style>.fp-title{font:700 14px sans-serif;fill:#0b1727}.fp-room{fill:#fff;stroke:#334155;stroke-width:1.5}.fp-hall{fill:#eef2f6;stroke:#94a3b8;stroke-width:1}.fp-stair{fill:#e2e8f0;stroke:#334155;stroke-width:1.2}.fp-tread{stroke:#94a3b8;stroke-width:1}.fp-garage{fill:#f1f5f9;stroke:#475569;stroke-width:1.5;stroke-dasharray:6 4}.fp-outline{fill:none;stroke:#0b1727;stroke-width:5}.fp-label{font:600 12px sans-serif;fill:#0f172a;text-anchor:middle}.fp-dim{font:11px sans-serif;fill:#475569;text-anchor:middle}</style><rect width="100%" height="100%" fill="#f8fafc"/>${out}<text x="${pad}" y="${H - 8}" style="font:10px sans-serif;fill:#64748b">INTELLIBUILD CONCEPT PLAN — schematic massing for discussion only; not to scale for construction. Replace with architect drawings.</text></svg>`;
}
function roomSchedule(p) { return layoutFloors(p).flatMap(f => f.rooms.filter(r => !r.hall && !r.stair).map(r => ({ floor: f.name, name: r.name, w: r.w, h: r.h, area: r.w * r.h }))).concat(Number(p.garage) ? [{ floor: 'First floor', name: 'Garage (unconditioned)', w: Number(p.garage) * 11 + 2, h: 24, area: (Number(p.garage) * 11 + 2) * 24 }] : []); }
function renderDocs() {
  const p = S.P, plans = S.files.filter(f => f.kind === 'plan' || f.kind === 'survey'), sched = roomSchedule(p), ed = S.canEdit;
  $('docsBody').innerHTML = `<div class="two"><div class="card"><div class="flex between"><h2>Concept floor plan</h2><div class="flex"><button class="btn sm secondary" id="fpVariant" ${ed ? '' : 'disabled'}>Mirror layout</button><button class="btn sm secondary" id="fpSvg">Download SVG</button><button class="btn sm" id="fpSave" ${S.user && !S.guest && ROLE_RANK[S.role] >= ROLE_RANK.contractor && !(S.project.isDemo && !S.canEdit) ? '' : 'disabled'}>Save to project files</button></div></div>
    <p class="small">Generated from the Design Studio program: ${Number(p.area).toLocaleString()} sq ft · ${p.stories} stories · ${p.newBeds} bedrooms · ${p.newBaths || '—'} baths · ${p.garage}-car garage · ${esc(p.design)}. Change those inputs and the plan updates.</p>
    <div class="fp-wrap">${floorPlanSVG(p)}</div></div>
  <div class="card"><h2>Room schedule</h2><div class="scroll"><table class="data"><thead><tr><th>Floor</th><th>Room</th><th class="num">Size</th><th class="num">Area</th></tr></thead><tbody>${sched.map(r => `<tr><td class="small">${esc(r.floor)}</td><td>${esc(r.name)}</td><td class="num">${r.w}' × ${r.h}'</td><td class="num">${(r.area).toLocaleString()} sf</td></tr>`).join('')}</tbody></table></div>
    <h3 class="mt">Your plans &amp; surveys</h3>${plans.length ? `<ul class="srcs">${plans.map(f => `<li>${esc(f.name)} <span class="small">· ${esc(f.kind)} · ${day(f.createdAt)} · ${esc(f.by)}</span></li>`).join('')}</ul><p class="small">Uploaded architect drawings supersede the concept plan for bidding and permits.</p>` : '<p class="small">No plans uploaded yet. Upload architect drawings or a purchased stock plan on <a href="#property" data-go="property" class="link">Existing Property</a> — they replace the concept plan.</p>'}</div></div>
  <div class="card section"><h2>Project documents</h2><p class="small">Generated from this project's data. Print or save as PDF, download, or send to contractors. Replace any of them with your own documents at any time.</p>
    <div class="docgrid">${DOCS.map(d => `<div class="doccard"><div class="docicon">${d.icon}</div><div><b>${esc(d.title)}</b><p class="small">${esc(d.desc)}</p><div class="flex"><button class="btn sm" data-doc="${d.id}">Open / print</button><button class="btn sm secondary" data-docdl="${d.id}">Download</button></div></div></div>`).join('')}</div></div>
  <div class="two section"><div class="card"><h2>Stock house plans (licensed)</h2><p class="small">Buy a ready-made plan set and have a local architect or engineer adapt it to your lot and Fairfax County code. Filter by about ${Number(p.area).toLocaleString()} sq ft, ${p.newBeds} beds, ${p.stories} stories, ${esc(p.design)} style.</p>
    <ul class="srcs"><li><a class="link" href="https://www.houseplans.com" target="_blank" rel="noopener">Houseplans.com ↗</a></li><li><a class="link" href="https://www.architecturaldesigns.com" target="_blank" rel="noopener">Architectural Designs ↗</a></li><li><a class="link" href="https://www.thehousedesigners.com" target="_blank" rel="noopener">The House Designers ↗</a></li><li><a class="link" href="https://www.eplans.com" target="_blank" rel="noopener">ePlans ↗</a></li></ul>
    <p class="small">Plan sets are copyrighted. Upload only plans you have purchased a license to build.</p></div>
  <div class="card"><h2>Official records &amp; forms</h2><ul class="srcs"><li><a class="link" href="https://www.fairfaxcounty.gov/landdevelopment/lds-public-records" target="_blank" rel="noopener">Fairfax LDS public records — house location plats, approved grading plans ↗</a></li>
    <li><a class="link" href="https://www.fairfaxcounty.gov/plan2build/" target="_blank" rel="noopener">Fairfax Plan2Build — new single-family dwelling guidance ↗</a></li><li><a class="link" href="https://www.fairfaxcounty.gov/landdevelopment/sites/landdevelopment/files/assets/documents/forms/infill-lot-grading-plan-checklist.pdf" target="_blank" rel="noopener">Infill lot grading plan checklist (PDF) ↗</a></li>
    <li><a class="link" href="https://www.fairfaxcounty.gov/plan2build/plus" target="_blank" rel="noopener">PLUS permit portal ↗</a></li><li><a class="link" href="https://msc.fema.gov/portal/home" target="_blank" rel="noopener">FEMA flood map ↗</a></li></ul>
    <p class="small">Existing-house plans are rarely on file publicly; the county may hold permit drawings for later additions. Request them through the LDS records page.</p></div></div>`;
  hydrateImages($('docsBody'));
  $('fpVariant').onclick = () => { S.P.planVariant = ((S.P.planVariant || 0) + 1) % 2; markDirty(); renderDocs(); };
  $('fpSvg').onclick = () => downloadBlob('intellibuild-concept-plan.svg', new Blob([floorPlanSVG(S.P)], { type: 'image/svg+xml' }));
  $('fpSave').onclick = async () => {
    const b = $('fpSave'); busy(b, true, 'Saving…');
    try {
      const svg = floorPlanSVG(S.P), img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2; const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url);
      await api('files.upload', { projectId: S.pid, name: 'concept-floor-plan-' + new Date().toISOString().slice(0, 10) + '.png', mime: 'image/png', b64: c.toDataURL('image/png').split(',')[1], kind: 'plan' });
      await loadFiles(); toast('Concept plan saved to project files.'); renderDocs();
    } catch (e) { fail(e); } finally { busy(b, false); }
  };
  qa('[data-doc]').forEach(b => b.onclick = () => { const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to open the document, or use Download.', { err: true }); w.document.write(buildDoc(b.dataset.doc)); w.document.close(); });
  qa('[data-docdl]').forEach(b => b.onclick = () => downloadBlob('intellibuild-' + b.dataset.docdl + '.html', new Blob([buildDoc(b.dataset.docdl)], { type: 'text/html' })));
}
const DOCS = [
  { id: 'itb', icon: '📨', title: 'Invitation to bid & scope of work', desc: 'Project description, quantities and a trade-by-trade bid form so every contractor prices the same scope.' },
  { id: 'program', icon: '📐', title: 'Design program & room schedule', desc: 'Brief for your architect: program, room sizes, priorities, constraints and the concept plan.' },
  { id: 'permits', icon: '🏛', title: 'Fairfax permit & submission checklist', desc: 'Permits, plans and inspections with responsible parties, dates and official links.' },
  { id: 'budget', icon: '＄', title: 'Budget & cost summary', desc: 'Stage budget, materials and labor, soft costs and the expected bid range.' }
];
function buildDoc(id) {
  const p = S.P, pr = S.project || {}, cb = costbook(), e = cb ? IBPricing.estimate(p, cb) : null, addr = p.matched || p.address || 'Address to be confirmed';
  const head = t => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(t)} — ${esc(pr.name || '')}</title><style>body{font:14px/1.5 Arial,sans-serif;color:#0f172a;max-width:860px;margin:30px auto;padding:0 24px}h1{font-size:24px;margin:0}h2{font-size:16px;border-bottom:2px solid #1aa88e;padding-bottom:4px;margin-top:26px}table{width:100%;border-collapse:collapse;margin:8px 0}td,th{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;font-size:13px}th{background:#f1f5f9}.num{text-align:right}.muted{color:#64748b;font-size:12px}.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0b1727;padding-bottom:10px}.logo{font:800 18px Arial}.logo span{color:#1aa88e}@media print{button{display:none}}</style></head><body><div class="hdr"><div><div class="logo">Intelli<span>Build</span> AI™</div><h1>${esc(t)}</h1></div><div class="muted">${esc(pr.name || '')}<br>${esc(addr)}<br>${new Date().toLocaleDateString()}</div></div><p><button onclick="print()">Print / Save as PDF</button></p>`;
  const foot = '<p class="muted" style="margin-top:30px">Prepared with IntelliBuild AI. Planning document — quantities and figures are preliminary and must be verified by licensed professionals. Contractors are responsible for their own takeoffs.</p></body></html>';
  const progRows = `<tr><td>Proposed finished area</td><td>${Number(p.area).toLocaleString()} sq ft</td></tr><tr><td>Stories / foundation</td><td>${p.stories} · ${esc(p.foundation || 'basement')}</td></tr><tr><td>Bedrooms / baths</td><td>${p.newBeds} / ${p.newBaths || '—'}</td></tr><tr><td>Garage</td><td>${p.garage}-car attached</td></tr><tr><td>Style / finish level</td><td>${esc(p.design)} · ${esc(p.finishTier || 'Premium')}</td></tr><tr><td>Existing house</td><td>${p.existingArea ? Number(p.existingArea).toLocaleString() + ' sq ft' : 'TBD'}${p.yearBuilt ? ', built ' + p.yearBuilt : ''} — to be demolished</td></tr><tr><td>Lot / zoning</td><td>${p.lotArea ? Number(p.lotArea).toLocaleString() + ' sq ft' : 'TBD'} · ${esc(p.zone || 'verify')}</td></tr>`;
  if (id === 'itb') {
    const q = e ? e.q : {};
    const groups = e ? [...new Set(e.lines.filter(l => l.scope === 'contract').map(l => l.stage))] : [];
    return head('Invitation to Bid & Scope of Work') + `<h2>1. Project</h2><table>${progRows}</table>
      <h2>2. Scope of work</h2><p>Complete demolition of the existing dwelling and construction of a new single-family home as described, including all labor, materials, equipment, supervision, temporary facilities, trade permits and inspections required for a residential use permit. Owner furnishes architectural/structural drawings, survey and the infill lot grading plan.</p>
      <h2>3. Approximate quantities (for reference — verify with your own takeoff)</h2><table><tr><th>Item</th><th class="num">Quantity</th></tr>
      ${e ? [['Concrete (footings, walls, slabs)', Math.round(q.concreteCY) + ' CY'], ['Framing lumber', Math.round(q.lumberBF).toLocaleString() + ' BF'], ['Sheathing', q.sheathingSheets + ' sheets'], ['Roofing', q.roofSquares.toFixed(1) + ' squares'], ['Exterior cladding', Math.round(q.sidingSqft).toLocaleString() + ' sq ft'], ['Windows / exterior doors', q.windows + ' / ' + q.extDoors], ['Drywall', q.drywallSheets + ' sheets'], ['Plumbing fixtures', q.fixtures], ['HVAC capacity', q.hvacTons + ' tons'], ['Wood/LVP flooring', Math.round(q.woodFloorSqft).toLocaleString() + ' sq ft'], ['Tile', Math.round(q.tileSqft).toLocaleString() + ' sq ft'], ['Cabinets', q.cabinetLF + ' LF']].map(r => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td></tr>`).join('') : ''}</table>
      <h2>4. Bid form — complete every line</h2><table><tr><th>Trade / stage</th><th class="num">Amount ($)</th><th>Included allowances / notes</th></tr>${groups.map(g => `<tr><td>${esc(g)}</td><td></td><td></td></tr>`).join('')}<tr><td>General conditions</td><td></td><td></td></tr><tr><td>Overhead &amp; fee</td><td></td><td></td></tr><tr><th>Total lump sum</th><th></th><th></th></tr></table>
      <p>Duration (months): ________ &nbsp; Exclusions: ______________________________________________</p><p>Submit bids through the IntelliBuild project portal (Contractor Bids) and attach your trade breakdown.</p>
      <h2>5. Requirements</h2><ul><li>Virginia Class A/B contractor license and proof of general liability and workers' compensation insurance.</li><li>Erosion &amp; sediment controls and tree protection per the approved grading plan.</li><li>Schedule of values, lien waivers with each draw, and a one-year workmanship warranty.</li></ul>` + foot;
  }
  if (id === 'program') {
    const sched = roomSchedule(p);
    return head('Design Program & Room Schedule') + `<h2>Program</h2><table>${progRows}</table><h2>Priorities</h2><p>${esc(p.priorities || 'Not specified')}</p><h2>Constraints</h2><p>${esc(p.designConstraints || p.constraints || 'Not specified')}</p>
      <h2>Concept plan</h2>${floorPlanSVG(p).replace('<svg ', '<svg style="width:100%;height:auto" ')}<h2>Room schedule</h2><table><tr><th>Floor</th><th>Room</th><th class="num">Size</th><th class="num">Area</th></tr>${sched.map(r => `<tr><td>${esc(r.floor)}</td><td>${esc(r.name)}</td><td class="num">${r.w}' × ${r.h}'</td><td class="num">${r.area} sf</td></tr>`).join('')}</table>` + foot;
  }
  if (id === 'permits') {
    const st = checklistState();
    return head('Fairfax County Permit & Submission Checklist') + PHASES.map(ph => `<h2>${esc(ph.name)}</h2><table><tr><th>Item</th><th>Responsible</th><th>Target</th><th>Status</th><th>Notes</th></tr>${ph.items.map(it => { const s = st[it[0]] || {}; return `<tr><td>${esc(it[1])}${it[3] ? `<br><a class="muted" href="${esc(it[3])}">${esc(it[3])}</a>` : ''}</td><td>${esc(s.party || it[2])}</td><td>${esc(s.date || '')}</td><td>${s.done ? '✔ Done' : 'Open'}</td><td>${esc(s.note || '')}</td></tr>`; }).join('')}</table>`).join('') + foot;
  }
  if (id === 'budget' && e) {
    const t = e.totals;
    return head('Budget & Cost Summary') + `<h2>Summary</h2><table><tr><td>Expected contract price</td><td class="num"><b>${fmt(t.contract)}</b> (${fmt(t.perSqft)}/sq ft)</td></tr><tr><td>Expected bid range</td><td class="num">${fmt(t.low)} – ${fmt(t.high)}</td></tr><tr><td>Owner soft costs</td><td class="num">${fmt(t.owner)}</td></tr><tr><td>Total project</td><td class="num"><b>${fmt(t.project)}</b></td></tr><tr><td>Materials / labor (direct)</td><td class="num">${fmt(t.materials)} / ${fmt(t.labor)} (${Math.round(t.laborHours).toLocaleString()} h)</td></tr></table>
      <h2>By stage</h2><table><tr><th>Stage</th><th class="num">Materials</th><th class="num">Labor</th><th class="num">Price</th></tr>${e.stages.map(s => `<tr><td>${esc(s.stage)}</td><td class="num">${fmt(s.mat)}</td><td class="num">${fmt(s.lab)}</td><td class="num">${fmt(s.price)}</td></tr>`).join('')}</table>
      <h2>Line items</h2><table><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Price</th></tr>${e.lines.map(l => `<tr><td>${esc(l.item)}</td><td class="num">${(+l.qty.toFixed(1)).toLocaleString()}</td><td>${esc(l.unit)}</td><td class="num">${fmt(l.price)}</td></tr>`).join('')}</table><p class="muted">Price book: ${esc(cb.region)}, ${esc(cb.asOf)}.</p>` + foot;
  }
  return head('Document') + '<p>Not available.</p>' + foot;
}

/* ================================================================== admin: price book editor, key status & tests */
async function adminPricebook() {
  const d = await api('admin.settingsGet'), cb = d.settings.costbook;
  const sec = (k, label) => `<label>${label}<textarea rows="10" data-cbj="${k}" spellcheck="false" style="font-family:monospace;font-size:12px">${esc(JSON.stringify(cb[k], null, 2))}</textarea></label>`;
  const num = (k, label) => `<label>${label}<input type="number" step="any" data-cbn="${k}" value="${cb[k]}"/></label>`;
  $('adminBody').innerHTML = `<div class="card"><h2>Price book — ${esc(cb.region)}</h2><p class="small">Every estimate, the Materials &amp; Labor benchmark and the bid leveling use these values. Paste updated prices from RSMeans, 1build, Craftsman or supplier quotes. Changes apply immediately to all projects.</p>
    <div class="grid">${num('laborBurden', 'Labor burden multiplier')}${num('subMarkupPct', 'Subcontractor O&P %')}${num('generalConditionsPct', 'General conditions %')}${num('gcFeePct', 'Builder fee %')}${num('bidRangePct', 'Expected bid range ± %')}<label>Price book date<input data-cbt="asOf" value="${esc(cb.asOf)}"/></label><label>Region<input data-cbt="region" value="${esc(cb.region)}"/></label></div></div>
    <div class="two section"><div class="card">${sec('materials', 'Material unit prices (USD)')}${sec('allowances', 'Allowances (USD)')}</div><div class="card">${sec('wages', 'Wages (USD/hour, straight time) with source')}${sec('productivity', 'Labor productivity (hours per unit)')}${sec('finishTiers', 'Finish tier multipliers')}${sec('nahb2024', 'NAHB benchmark assumptions')}</div></div>
    <div class="flex section"><button class="btn" id="cbSave">Save price book</button><button class="btn secondary" id="cbReset">Restore defaults</button></div>`;
  $('cbSave').onclick = async () => {
    try {
      const out = JSON.parse(JSON.stringify(cb));
      qa('[data-cbn]').forEach(el => out[el.dataset.cbn] = Number(el.value));
      qa('[data-cbt]').forEach(el => out[el.dataset.cbt] = el.value.trim());
      qa('[data-cbj]').forEach(el => { try { out[el.dataset.cbj] = JSON.parse(el.value); } catch (er) { throw new Error('Invalid JSON in ' + el.dataset.cbj); } });
      await api('admin.settingsSave', { settings: { costbook: out } }); S.plansCfg = await api('billing.plans'); toast('Price book saved.');
    } catch (e) { fail(e); }
  };
  $('cbReset').onclick = async () => { if (!(await modal('Restore default price book?', '<p>Your edits to prices, wages and productivity are replaced with the built-in November 2026 Northern Virginia values.</p>', 'Restore'))) return; try { await api('admin.settingsSave', { settings: { costbook: d.defaults.costbook } }); S.plansCfg = await api('billing.plans'); toast('Defaults restored.'); adminPricebook(); } catch (e) { fail(e); } };
}
const KEY_FIELDS = [['GEMINI_API_KEY', 'Google Gemini API key', 'AIza… from aistudio.google.com/apikey', true], ['OPENAI_API_KEY', 'OpenAI API key (optional alternative)', 'sk-…', true],
  ['STRIPE_SECRET_KEY', 'Stripe secret key', 'sk_test_… or sk_live_…', true], ['STRIPE_WEBHOOK_KEY', 'Webhook path secret (optional)', 'any long random string', false], ['SITE_URL', 'Public app URL', 'https://build.intellisoft-tech.com', false], ['ADMIN_EMAILS', 'Administrator emails', 'comma-separated', false]];
function renderKeyPanel(k) {
  const secret = n => ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_KEY'].includes(n);
  $('keyFields').innerHTML = `<p class="small">Active AI provider: ${k.activeAiProvider ? `<span class="badge ok">${esc(k.activeAiProvider)}</span>` : '<span class="badge bad">none — add a Gemini or OpenAI key</span>'}</p>` + KEY_FIELDS.map(([n, l, ph, testable]) => `<div class="keyrow">
    <div class="keyhead"><b>${l}</b>${secret(n) ? (k[n] ? `<span class="badge ok">✓ Set ${esc(k[n])}</span>` : '<span class="badge bad">Not set</span>') : ''}</div>
    <div class="flex"><input class="grow" type="${secret(n) ? 'password' : 'text'}" data-key="${n}" autocomplete="off" placeholder="${secret(n) && k[n] ? 'Saved — paste a new value to replace' : esc(ph)}" ${secret(n) ? '' : `value="${esc(k[n] || '')}"`}/>${testable ? `<button class="btn sm secondary" data-ktest="${n}" ${k[n] ? '' : 'disabled'}>Test</button>` : ''}</div>
    <div class="small keyres" id="kres_${n}"></div></div>`).join('');
  qa('[data-ktest]').forEach(b => b.onclick = async () => {
    const out = $('kres_' + b.dataset.ktest); busy(b, true, 'Testing…'); out.innerHTML = '';
    try { const r = await api('admin.keyTest', { key: b.dataset.ktest }); out.innerHTML = `<span class="badge ${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓ Working' : '✗ Problem'}</span> ${esc(r.message)}${r.ms ? ' <span class="small">(' + r.ms + ' ms)</span>' : ''}`; }
    catch (e) { out.innerHTML = '<span class="badge bad">✗ Error</span> ' + esc(e.message); } finally { busy(b, false); }
  });
}

/* ================================================================== activity log drawer */
function logText(rows) {
  return ['IntelliBuild AI v' + VERSION + ' activity log · exported ' + new Date().toISOString(), 'Browser: ' + navigator.userAgent, 'User: ' + (S.user ? S.user.email : S.guest ? 'guest' : 'signed out') + ' · Project: ' + (S.project ? S.project.name + ' (' + S.pid + ')' : 'none'), '']
    .concat(rows.map(e => e.t.replace('T', ' ').slice(0, 19) + '  ' + e.level.toUpperCase().padEnd(5) + ' ' + e.area.padEnd(9) + ' ' + e.msg + (e.detail ? '\n                                   ' + e.detail : ''))).join('\n');
}
function logRows() {
  const f = $('logFilter').value;
  return IBLOG.items.filter(e => !f || (f === 'problems' ? e.level !== 'info' : e.area === f));
}
function renderLog() {
  const rows = logRows().slice().reverse();
  $('logList').innerHTML = rows.length ? rows.map(e => `<div class="lg ${e.level}"><span class="lg-t">${esc(new Date(e.t).toLocaleTimeString())}</span><span class="lg-a">${esc(e.area)}</span><div class="lg-m">${esc(e.msg)}${e.detail ? `<code>${esc(e.detail)}</code>` : ''}</div></div>`).join('') : '<p class="small" style="padding:16px">No events yet.</p>';
}
function renderLogBadge() { const b = $('logBadge'); if (!b) return; b.textContent = IBLOG.unseenErr; b.classList.toggle('hidden', !IBLOG.unseenErr); }
function openLog(open) { const d = $('logDrawer'); d.classList.toggle('open', open); d.setAttribute('aria-hidden', open ? 'false' : 'true'); if (open) { IBLOG.unseenErr = 0; renderLogBadge(); renderLog(); } }
$('logBtn').onclick = () => openLog(!$('logDrawer').classList.contains('open'));
$('logClose').onclick = () => openLog(false);
$('logFilter').onchange = renderLog;
$('logCopy').onclick = () => navigator.clipboard.writeText(logText(logRows())).then(() => toast('Log copied — paste it into an email or chat to support.')).catch(() => toast('Copy failed — use Download instead.', { err: true }));
$('logDl').onclick = () => downloadBlob('intellibuild-log-' + new Date().toISOString().slice(0, 16).replace(':', '') + '.txt', new Blob([logText(logRows())], { type: 'text/plain' }));
$('logClear').onclick = () => { IBLOG.items = []; IBLOG.unseenErr = 0; try { localStorage.removeItem('ib_log'); } catch (e) { } renderLog(); renderLogBadge(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('logDrawer').classList.contains('open')) openLog(false); });
ibLog('info', 'app', 'IntelliBuild v' + VERSION + ' loaded');

wire(); renderStatic(); boot();
