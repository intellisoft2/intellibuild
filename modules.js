/* IntelliBuild AI™ v3.2.5 — feature modules (loaded after app.js) */
'use strict';

/* ------------------------------------------------------------------ property intelligence */
let aerialMap = null, aerialMarker = null, footprintLayer = null, imageryLayer = null, streetLayer = null, showSatellite = true;
function ensureAerial() {
  if (aerialMap || !window.L) return;
  aerialMap = L.map('aerialMap', { scrollWheelZoom: false }).setView([38.85, -77.3], 11);
  imageryLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri and imagery contributors', maxZoom: 19 });
  streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 });
  imageryLayer.addTo(aerialMap);
}
function intelRow(label, value, source) { return `<div class="evidence-row"><span>${esc(label)}</span><strong>${esc(value)}<div class="source-tag">${esc(source)}</div></strong></div>`; }
function renderEvidence() {
  const p = S.P, matched = !!p.matched;
  $('intelAddress').textContent = matched ? 'Matched' : p.sample ? 'Sample' : 'Not verified';
  $('intelJurisdiction').textContent = matched ? (/\bVA\b/.test(p.matched.toUpperCase()) ? 'Virginia (verify locality)' : 'U.S. (verify locality)') : 'Unknown';
  $('intelBuildings').textContent = p.intel.buildingCount === null ? '—' : String(p.intel.buildingCount);
  $('intelConfidence').textContent = p.county ? 'County records' : matched ? 'Location only' : 'Unverified';
  $('intelEvidence').innerHTML = [intelRow('Entered address', p.address || 'Not entered', 'User entry'), intelRow('Census matched address', p.matched || 'No match', 'U.S. Census Geocoder'),
    intelRow('Latitude / longitude', p.lat !== null && p.lat !== '' ? Number(p.lat).toFixed(6) + ', ' + Number(p.lon).toFixed(6) : 'Unavailable', 'Census coordinate, approximate'),
    intelRow('Nearby mapped buildings', p.intel.buildingCount === null ? 'Not checked' : p.intel.buildingCount + ' OSM features', 'OpenStreetMap, not verified parcel buildings'),
    intelRow('Existing home size', p.existingArea ? p.existingArea + ' sq ft' : 'Not entered', p.source === 'county' ? 'Fairfax County GIS' : 'User input, unverified'),
    intelRow('Year built', p.yearBuilt || 'Not entered', p.source === 'county' ? 'Fairfax County GIS' : 'User input, unverified'),
    intelRow('Lot size', p.lotArea ? p.lotArea + ' sq ft' : 'Not entered', p.source === 'county' ? 'Fairfax County GIS' : 'User input, unverified'),
    intelRow('Zoning', p.zone || 'Not entered', p.source === 'county' ? 'Fairfax County GIS' : 'User input, unverified')].join('');
}
function renderIntel() {
  renderEvidence();
  const links = [['Census Geocoder', 'https://geocoding.geo.census.gov/geocoder/'], ['FEMA Flood Map', 'https://msc.fema.gov/portal/home'], ['USGS National Map', 'https://apps.nationalmap.gov/viewer/'],
    ['Fairfax Real Estate', 'https://www.fairfaxcounty.gov/taxes/real-estate'], ['Fairfax Zoning', 'https://www.fairfaxcounty.gov/planning-development/zoning']];
  $('intelLinks').innerHTML = links.map(x => `<a class="intel-link" target="_blank" rel="noopener noreferrer" href="${x[1]}">${esc(x[0])} ↗</a>`).join('');
  ensureAerial();
  if (aerialMap) {
    if (aerialMarker) { aerialMap.removeLayer(aerialMarker); aerialMarker = null; }
    if (footprintLayer) { aerialMap.removeLayer(footprintLayer); footprintLayer = null; }
    if (S.P.lat !== null && S.P.lat !== '') { aerialMap.setView([S.P.lat, S.P.lon], 18); aerialMarker = L.marker([S.P.lat, S.P.lon]).addTo(aerialMap).bindPopup('Approximate geocoded location'); }
    setTimeout(() => aerialMap.invalidateSize(), 150);
  }
}
/** OpenStreetMap building outlines within 100 m: server proxy first, then public Overpass mirrors directly from the browser. */
async function getFootprints(lat, lon) {
  try { return (await api('property.footprints', { lat, lon })).elements; } catch (e) { /* fall through to browser */ }
  const q = `[out:json][timeout:20];(way["building"](around:100,${lat},${lon}););out geom;`;
  for (const m of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    try { const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); if (r.ok) return ((await r.json()).elements || []).filter(e => e.geometry && e.geometry.length > 2); } catch (e) { }
  }
  throw new Error('the OpenStreetMap building service is busy right now');
}
async function findFootprints() {
  const p = S.P; if (p.lat === null || p.lat === '') { $('footprintStatus').textContent = 'Geocode an address on Overview first.'; return; }
  const b = $('refreshFootprints'); busy(b, true, 'Searching…'); $('footprintStatus').textContent = 'Requesting nearby OpenStreetMap building outlines (100 m)…';
  try {
    const els = await getFootprints(p.lat, p.lon);
    ensureAerial(); if (footprintLayer) aerialMap.removeLayer(footprintLayer); footprintLayer = L.layerGroup().addTo(aerialMap);
    let n = 0; els.forEach(f => { if (f.geometry && f.geometry.length > 2) { L.polygon(f.geometry.map(x => [x.lat, x.lon]), { color: '#44e1c3', weight: 2, fillOpacity: .16 }).addTo(footprintLayer); n++; } });
    p.intel = { buildingCount: n, lastChecked: new Date().toISOString() }; markDirty();
    $('footprintStatus').textContent = n + ' mapped building outline(s) within 100 m. These may include neighbours and do not establish the subject house footprint.'; renderEvidence();
  } catch (e) { $('footprintStatus').textContent = 'Building outlines unavailable: ' + e.message + '. Optional — everything else still works.'; }
  finally { busy(b, false); }
}
function currentProperty() {
  const p = S.P;
  return { address: p.matched || p.address || 'Not provided', geocoded: !!p.matched, latitude: p.lat, longitude: p.lon, existingSqFt: Number(p.existingArea) || null, yearBuilt: Number(p.yearBuilt) || null,
    bedrooms: Number(p.bedrooms) || null, bathrooms: Number(p.bathrooms) || null, lotSqFt: Number(p.lotArea) || null, zoning: p.zone || null, constraints: p.constraints || null, source: p.source,
    parcelPin: (p.county && p.county.pin) || p.parcelInput || null, sourceNote: 'Geocoding verifies location matching only. Characteristics are verified only where sourced from county records.' };
}
function templateBrief() {
  const p = currentProperty(), P0 = S.P;
  return ['INTELLIBUILD AI — ARCHITECTURAL CONCEPT BRIEF', 'Project: ' + (S.project ? S.project.name : ''), 'Status: Concept planning only; NOT permit-ready drawings.', '',
    'SITE & EXISTING CONDITIONS', 'Address: ' + p.address, 'Address geocoded: ' + (p.geocoded ? 'Yes (location only)' : 'No'), 'Parcel PIN: ' + (p.parcelPin || 'unverified'),
    'Existing floor area: ' + (p.existingSqFt || 'unknown') + ' sq ft', 'Year built: ' + (p.yearBuilt || 'unknown'), 'Lot area: ' + (p.lotSqFt || 'unknown') + ' sq ft', 'Zoning: ' + (p.zoning || 'unverified'), '',
    'NEW HOME DESIGN', 'Style: ' + P0.design, 'Target gross floor area: ' + P0.area + ' sq ft', 'Stories: ' + P0.stories + ' · Bedrooms: ' + P0.newBeds + ' · Garage: ' + P0.garage,
    'Preliminary budget: ' + fmt(P0.budget), 'User priorities: ' + (P0.priorities || 'Not specified'), 'Site constraints: ' + (P0.designConstraints || P0.constraints || 'Not specified'), '',
    'REQUESTED DELIVERABLES', '1. Three alternative site-aware conceptual massing options.', '2. Room-by-room 2D conceptual layouts with labeled dimensions.', '3. Front and rear elevation concepts and material palette.',
    '4. Budget-sensitive finish options and high-level construction sequencing.', '5. Flag uncertain setbacks, utilities, grading, drainage, trees, easements, code requirements and demolition hazards.', '',
    'VALIDATION REQUIRED', 'Licensed design professional review, current survey, zoning verification, structural and MEP engineering, permit approvals, site investigation and contractor pricing.'].join('\n');
}
function setBrief(t) { S.P.brief = t; $('conceptBrief').value = t; markDirty(); }
async function aiBrief() {
  const b = $('aiBrief'); busy(b, true, 'Writing brief…');
  try { const r = await api('ai.brief', { projectId: S.pid, context: templateBrief() + '\n\nOwner notes: ' + (S.P.priorities || '') }); setBrief(r.brief); setCredits(r.credits); toast('AI brief written · ' + r.charged + ' credit used.'); }
  catch (e) { fail(e); } finally { busy(b, false); }
}

/* ------------------------------------------------------------------ Fairfax County records */
const COUNTY_BASE = 'https://services1.arcgis.com/ioennV6PpG5Xodq0/ArcGIS/rest/services/';
const COUNTY_PARCELS = 'https://www.fairfaxcounty.gov/gispub1/rest/services/OpenData/OpenData_A9/MapServer/0';
const COUNTY_TABLES = { parcel: COUNTY_BASE + 'Tax_Administration_Real_Estate_Parcels_Data/FeatureServer/0', dwelling: COUNTY_BASE + 'Tax_Administration_Real_Estate_Dwelling_Data/FeatureServer/0',
  land: COUNTY_BASE + 'Tax_Administration_Real_Estate_Land_Data/FeatureServer/0', assessment: COUNTY_BASE + 'Tax_Administration_Real_Estate_Assessed_Values/FeatureServer/0' };
const pretty = x => x === null || x === undefined || x === '' ? 'Not reported' : String(x);
async function arcQuery(url, params) {
  const u = new URL(url + '/query'); Object.entries(Object.assign({}, params, { f: 'json' })).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(u, { signal: ctl.signal }); clearTimeout(t);
    if (!r.ok) throw Error('HTTP ' + r.status); const j = await r.json(); if (j.error) throw Error(j.error.message || 'ArcGIS error'); return j.features || [];
  } catch (e) { return (await api('property.arcgis', { url, params })).features; }
}
function pinVariants(pin) { const p = String(pin || '').trim(); const a = [p, p.replace(/\s+/g, ''), p.replace(/\s+/g, ' ').trim()]; const c = p.replace(/[^A-Za-z0-9]/g, ''); if (c.length >= 7) { a.push(c.slice(0, 4) + ' ' + c.slice(4, 6) + ' ' + c.slice(6)); a.push(c.slice(0, 4) + ' ' + c.slice(4)); } return [...new Set(a.filter(Boolean))]; }
async function countyTable(name, pin) { for (const v of pinVariants(pin)) { const f = await arcQuery(COUNTY_TABLES[name], { where: "PARID='" + v.replace(/'/g, "''") + "'", outFields: '*', returnGeometry: 'false', resultRecordCount: 25 }); if (f.length) return f.map(x => x.attributes); } return []; }
const latest = rows => [...rows].sort((a, b) => Number(b.TAXYR || 0) - Number(a.TAXYR || 0))[0] || {};
const firstValue = (o, keys) => { for (const k of keys) if (o[k] !== null && o[k] !== undefined && o[k] !== '') return o[k]; return null; };
const COUNTY_ADDR = 'https://services1.arcgis.com/ioennV6PpG5Xodq0/ArcGIS/rest/services/Parcel_Address_Validator/FeatureServer/0';
const STREET_TYPES = /\s+(RD|ROAD|ST|STREET|DR|DRIVE|CT|COURT|LN|LANE|AVE|AV|AVENUE|WAY|PL|PLACE|CIR|CIRCLE|TER|TERR|TERRACE|BLVD|PKWY|HWY|TRL|TRAIL|SQ|LOOP|RUN|PIKE|XING|GLN|GLEN|CV|COVE|ROW|WALK|PATH|PT|POINT|CRES|CRESCENT|LNDG|LANDING)$/;
/** "1234 N PALMER GLEN CT, OAKTON, VA, 22124" → { num, words, zip } */
function parseAddress(s) {
  const u = String(s || '').toUpperCase().replace(/\./g, ''), m = u.match(/^\s*(\d+[A-Z]?)\s+([^,]+)/);
  if (!m) return null;
  const z = u.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  const street = m[2].replace(STREET_TYPES, '').replace(/^(N|S|E|W|NORTH|SOUTH|EAST|WEST)\s+/, '').trim();
  return { num: m[1], street, words: street.split(/\s+/).filter(w => w.length > 1), zip: z ? z[1] : '' };
}
function ringCentroid(geom) {
  const pts = (geom && geom.rings ? geom.rings[0] : []) || []; if (!pts.length) return null;
  const c = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]); return { lon: c[0] / pts.length, lat: c[1] / pts.length };
}
/** Finds the parcel: 1) county address points by street address, 2) nearest parcel within 200 ft, 3) exact point. */
async function findParcel(p) {
  const a = parseAddress(p.matched || p.address);
  if (a) {
    const esc1 = v => String(v).replace(/'/g, "''");
    let rows = await arcQuery(COUNTY_ADDR, { where: `FullStreetNumber='${esc1(a.num)}'` + (a.zip ? ` AND Zip='${esc1(a.zip)}'` : ''), outFields: 'PIN,FullAddress,StreetName,Zip,City', returnGeometry: 'true', outSR: 4326, resultRecordCount: 50 });
    const score = f => { const full = String(f.attributes.FullAddress || '').toUpperCase(); return a.words.filter(w => full.includes(w)).length; };
    let best = rows.filter(f => score(f) === a.words.length);
    if (!best.length && a.zip) { // ZIP from Census can differ from the county's; retry by number + street
      rows = await arcQuery(COUNTY_ADDR, { where: `FullStreetNumber='${esc1(a.num)}' AND UPPER(StreetName) LIKE '%${esc1(a.words[a.words.length - 1] || '')}%'`, outFields: 'PIN,FullAddress,StreetName,Zip,City', returnGeometry: 'true', outSR: 4326, resultRecordCount: 50 });
      best = rows.filter(f => score(f) === a.words.length);
    }
    const pins = [...new Set(best.map(f => f.attributes.PIN))];
    if (pins.length === 1) { const f = best[0]; return { pin: pins[0], method: 'address', label: 'Matched by street address (' + f.attributes.FullAddress + ', ' + f.attributes.City + ' ' + f.attributes.Zip + ')', centroid: ringCentroid(f.geometry), type: '' }; }
    if (pins.length > 1) return { multiple: pins, method: 'address' };
  }
  if (p.lat === null || p.lat === '') return null;
  const pt = JSON.stringify({ x: p.lon, y: p.lat, spatialReference: { wkid: 4326 } });
  let feats = await arcQuery(COUNTY_PARCELS, { geometry: pt, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'PIN,PARCEL_TYPE', returnGeometry: 'true', outSR: 4326 });
  if (feats.length === 1) return { pin: feats[0].attributes.PIN, method: 'point', label: 'Geocoded point falls inside this parcel', centroid: ringCentroid(feats[0].geometry), type: feats[0].attributes.PARCEL_TYPE };
  feats = await arcQuery(COUNTY_PARCELS, { geometry: pt, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', distance: 200, units: 'esriSRUnit_Foot', outFields: 'PIN,PARCEL_TYPE', returnGeometry: 'true', outSR: 4326 });
  if (!feats.length) return null;
  const d = f => { const c = ringCentroid(f.geometry); return c ? Math.hypot((c.lat - p.lat) * 364000, (c.lon - p.lon) * 288000) : 1e9; };
  feats.sort((x, y) => d(x) - d(y));
  return { pin: feats[0].attributes.PIN, method: 'nearest', label: 'Nearest parcel to the geocoded point (' + Math.round(d(feats[0])) + ' ft) — confirm this is your lot', centroid: ringCentroid(feats[0].geometry), type: feats[0].attributes.PARCEL_TYPE, others: feats.slice(1, 4).map(f => f.attributes.PIN) };
}
async function lookupCounty() {
  if (!requirePro('Fairfax official records')) return;
  const st = $('recordStatus'), p = S.P;
  if (!p.matched && !p.address) { st.textContent = 'Enter and locate the property address on the Overview tab first.'; return; }
  const b = $('lookupCounty'); busy(b, true, 'Searching county records…'); st.textContent = 'Searching Fairfax County address points and parcels…';
  try {
    const hit = await findParcel(p);
    if (!hit) { st.textContent = 'No Fairfax County parcel found for this address. It may be in an independent city (City of Fairfax, Falls Church, Alexandria) or a town with its own records — enter the PIN on Existing Property if you know it.'; return; }
    if (hit.multiple) { st.textContent = 'This address matches several parcels (e.g. units or condos): ' + hit.multiple.slice(0, 5).join(', ') + '. Enter the correct PIN on Existing Property.'; return; }
    const pin = hit.pin;
    st.textContent = 'Parcel PIN ' + pin + ' found. Retrieving tax assessment tables…';
    const keys = ['parcel', 'dwelling', 'land', 'assessment'], settled = await Promise.allSettled(keys.map(k => countyTable(k, pin))), tables = {}, counts = {}, errors = [];
    keys.forEach((k, i) => { const rows = settled[i].status === 'fulfilled' ? settled[i].value : []; tables[k] = latest(rows); counts[k] = rows.length; if (settled[i].status === 'rejected') errors.push(k + ': ' + settled[i].reason.message); });
    p.county = { pin, parcelType: hit.type || (tables.parcel.LUC_DESC ? '' : ''), method: hit.method, methodLabel: hit.label, nearby: hit.others || [], matchedAddress: p.matched, retrievedAt: new Date().toISOString(), tables, counts, errors };
    if (hit.centroid && hit.method !== 'point') { p.lat = +hit.centroid.lat.toFixed(6); p.lon = +hit.centroid.lon.toFixed(6); p.geoSource = 'parcel'; }
    const ap = applyCountyFields(false);
    st.textContent = '✓ ' + hit.label + '. ' + keys.filter(k => counts[k]).length + ' of 4 assessment tables matched · ' + ap.filled + ' field(s) filled automatically' + (ap.conflicts.length ? ' · ' + ap.conflicts.length + ' differ from your entries (review below)' : '') + '.' + (errors.length ? ' Some sources failed.' : '');
    renderCounty(); renderPropRecord(); if (window.renderJourney) renderJourney();
  } catch (e) { st.textContent = 'County lookup unavailable: ' + e.message + '. No property values have been inferred.'; }
  finally { busy(b, false); }
}
function countyLine(n, v, s) { return intelRow(n, pretty(v), s); }
function renderCounty() {
  const c = S.P.county;
  if (!c) { $('countyParcel').innerHTML = '<p>No verified parcel loaded.</p>'; $('countyDwelling').innerHTML = '<p>No dwelling records loaded.</p>'; $('countyProvenance').textContent = premium() ? '' : 'Official records are included with Homeowner Pro or Builder Pro.'; return; }
  const p = c.tables.parcel || {}, d = c.tables.dwelling || {}, l = c.tables.land || {}, a = c.tables.assessment || {};
  $('countyParcel').innerHTML = [countyLine('Parcel PIN', c.pin, c.methodLabel || 'Fairfax GIS parcel geometry'), countyLine('Parcel type', c.parcelType, 'County parcel layer'), countyLine('Zoning description', p.ZONING_DESC, 'County tax parcel table'), countyLine('Land use', p.LUC_DESC, 'County tax parcel table'), countyLine('Land size (sq ft)', l.SF, 'County land table')].join('');
  $('countyDwelling').innerHTML = [countyLine('Year built', d.YRBLT, 'County dwelling table'), countyLine('Above-grade living area (sq ft)', d.SFLA, 'County dwelling table'), countyLine('Bedrooms', d.RMBED, 'County dwelling table'), countyLine('Full bathrooms', d.FIXBATH, 'County dwelling table'), countyLine('Half bathrooms', d.FIXHALF, 'County dwelling table'), countyLine('Style', d.STYLE_DESC, 'County dwelling table'), countyLine('Condition', d.CDU_DESC, 'County dwelling table'), countyLine('Construction grade', d.GRADE_DESC, 'County dwelling table'), countyLine('Basement', [d.BSMT_DESC, d.USER9_DESC].filter(Boolean).join(' · ') || null, 'County dwelling table'),
    countyLine('Finished rec room (sq ft)', d.RECROMAREA, 'County dwelling table'), countyLine('Exterior walls', d.EXTWALL_DESC, 'County dwelling table'), countyLine('Heating / cooling', d.HEAT_DESC, 'County dwelling table'),
    countyLine('Fireplaces', d.WBFP_PF, 'County dwelling table'), countyLine('Other material noted', d.USER13_DESC, 'County dwelling table — confirm in hazmat survey'), countyLine('Current assessed value', (v => v === null ? null : isNaN(+v) ? v : fmt(+v))(firstValue(a, ['TOTAL', 'TOTAL_VALUE', 'TOTVAL', 'TOTALVAL', 'CURR_TOTAL', 'TOT_ASMT'])), 'County assessment' + (a.TAXYR ? ' · tax year ' + a.TAXYR : ''))].join('');
  renderCountyConflicts();
  $('countyProvenance').textContent = 'Retrieved ' + when(c.retrievedAt) + ' · PIN ' + c.pin + ' · record counts: ' + Object.entries(c.counts).map(([k, v]) => k + ' ' + v).join(', ') + '. ' + (c.errors.length ? 'Errors: ' + c.errors.join('; ') : 'No API errors.') + ' Source data may lag real-world changes.';
}
/** County values mapped to project fields. */
function countyFieldValues() {
  const c = S.P.county; if (!c) return [];
  const d = c.tables.dwelling || {}, l = c.tables.land || {}, p = c.tables.parcel || {};
  const baths = d.FIXBATH !== undefined && d.FIXBATH !== null ? Number(d.FIXBATH) + 0.5 * Number(d.FIXHALF || 0) : null;
  return [['existingArea', 'Existing floor area (sq ft)', d.SFLA], ['yearBuilt', 'Year built', d.YRBLT], ['bedrooms', 'Bedrooms', d.RMBED], ['bathrooms', 'Bathrooms', baths],
    ['lotArea', 'Lot size (sq ft)', l.SF], ['zone', 'Zoning', p.ZONING_DESC], ['parcelInput', 'Parcel ID', c.pin]]
    .filter(r => r[2] !== null && r[2] !== undefined && r[2] !== '').map(([k, label, v]) => ({ k, label, county: NUMERIC.has(k) ? Number(v) : String(v) }));
}
/** Fills empty fields from county records (or all fields when overwrite=true). Returns fields where the owner's entry differs. */
function applyCountyFields(overwrite) {
  const rows = countyFieldValues(); let n = 0; const conflicts = [];
  rows.forEach(r => {
    const cur = S.P[r.k], empty = cur === '' || cur === null || cur === undefined || (NUMERIC.has(r.k) && !Number(cur));
    if (empty || overwrite) { if (String(cur) !== String(r.county)) { S.P[r.k] = r.county; n++; } }
    else if (String(cur).replace(/\s+/g, ' ').trim().toUpperCase() !== String(r.county).replace(/\s+/g, ' ').trim().toUpperCase()) conflicts.push(Object.assign({ mine: cur }, r));
  });
  if (rows.length) S.P.source = 'county';
  S.P.countyConflicts = conflicts.map(c => c.k);
  fillAll(); compute(); markDirty(); renderCountyConflicts();
  return { filled: n, conflicts };
}
function renderCountyConflicts() {
  const box = $('countyConflicts'); if (!box) return;
  const rows = countyFieldValues().filter(r => (S.P.countyConflicts || []).includes(r.k) && String(S.P[r.k]) !== String(r.county));
  if (!rows.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="note"><b>Your entries differ from the county record.</b> Choose which to keep:</div><div class="scroll"><table class="data"><thead><tr><th>Field</th><th class="num">Your entry</th><th class="num">Fairfax County</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(S.P[r.k])}</td><td class="num"><b>${esc(r.county)}</b></td><td><div class="flex"><button class="btn sm" data-cc-use="${r.k}" ${S.canEdit ? '' : 'disabled'}>Use county</button><button class="btn sm secondary" data-cc-keep="${r.k}" ${S.canEdit ? '' : 'disabled'}>Keep mine</button></div></td></tr>`).join('')}</tbody></table></div>`;
  qa('[data-cc-use]', box).forEach(b => b.onclick = () => { const r = rows.find(x => x.k === b.dataset.ccUse); S.P[r.k] = r.county; S.P.countyConflicts = S.P.countyConflicts.filter(k => k !== r.k); fillAll(); compute(); markDirty(); renderCountyConflicts(); renderPropRecord(); });
  qa('[data-cc-keep]', box).forEach(b => b.onclick = () => { S.P.countyConflicts = S.P.countyConflicts.filter(k => k !== b.dataset.ccKeep); markDirty(); renderCountyConflicts(); });
}
function applyCounty() {
  if (!S.P.county) return toast('Find an official parcel first.', { err: true });
  const r = applyCountyFields(true); S.P.countyConflicts = []; renderCountyConflicts(); renderPropRecord();
  toast(r.filled + ' field(s) updated from official county records. Review each value before relying on it.');
}

/* ------------------------------------------------------------------ AI visual studio */
let aiPhoto = null, aiPhotoFileId = null;
function refreshCreditCostLabels() {
  const q = $('aiQuality') ? $('aiQuality').value : 'standard';
  if ($('aiCost')) $('aiCost').textContent = creditCost('render_' + q);
  qa('.cc-brief').forEach(e => e.textContent = creditCost('brief'));
}
async function aiPickPhoto(e) {
  const f = e.target.files[0]; if (!f) return;
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { $('aiStatus').textContent = 'Choose a JPG, PNG or WebP image.'; e.target.value = ''; return; }
  try { aiPhoto = await resizeImage(f, 1536); aiPhoto.name = f.name; aiPhotoFileId = null; $('aiOriginal').src = aiPhoto.dataUrl; $('aiOriginal').classList.remove('hidden'); $('aiStatus').textContent = 'Photo ready. Choose a style and generate.'; }
  catch (er) { $('aiStatus').textContent = er.message; }
}
async function aiGenerate() {
  if (!aiPhoto) { $('aiStatus').textContent = 'Upload an existing-home photograph first.'; return; }
  if (!$('aiConsent').checked) { $('aiStatus').textContent = 'Confirm photo permission and AI processing consent.'; return; }
  const q = $('aiQuality').value, cost = creditCost('render_' + q);
  if (S.user.credits < cost) return fail(Object.assign(new Error('This render needs ' + cost + ' credits and you have ' + S.user.credits + '.'), { code: 'credits' }));
  const b = $('aiGenerate'); busy(b, true, 'Generating — up to a minute…'); $('aiStatus').textContent = 'Generating concept with the AI image service…';
  try {
    const r = await api('ai.render', { projectId: S.pid, photoB64: aiPhoto.b64, mime: aiPhoto.mime, photoName: aiPhoto.name, photoFileId: aiPhotoFileId, style: S.P.aiStyle, finish: S.P.aiFinish, notes: S.P.aiNotes, quality: q, consent: true });
    aiPhotoFileId = r.photoFileId; setCredits(r.credits);
    S.fileCache[r.file.id] = Promise.resolve('data:' + (r.mime || 'image/png') + ';base64,' + r.b64);
    S.files.unshift(r.file); renderGallery();
    $('aiStatus').textContent = 'Concept generated and saved to the project · ' + r.charged + ' credits used · ' + r.credits + ' remaining.';
  } catch (e) { $('aiStatus').textContent = e.message; fail(e); }
  finally { busy(b, false); refreshCreditCostLabels(); }
}
function renderGallery() {
  refreshCreditCostLabels();
  const r = S.files.filter(f => f.kind === 'render');
  $('aiGallery').innerHTML = r.length ? r.map(f => `<figure><img data-fid="${f.id}" alt="AI ${esc(f.meta.style || '')} concept"/><figcaption class="small">✦ ${esc(f.meta.style || 'concept')} · ${esc(f.meta.finish || '')} · ${esc(f.meta.quality || '')} · ${when(f.createdAt)} · ${esc(f.by)}</figcaption><button class="btn sm secondary" data-dlr="${f.id}">Download PNG</button></figure>`).join('')
    : '<div class="upload"><p>No concepts generated yet.</p></div>';
  hydrateImages($('aiGallery'));
  qa('[data-dlr]').forEach(b => b.onclick = async () => { const src = await fileSrc(b.dataset.dlr); const a = document.createElement('a'); a.href = src; a.download = 'intellibuild-concept-' + b.dataset.dlr + '.png'; a.click(); });
}

/* ------------------------------------------------------------------ takeoffs */
const UNIT_RATES = { foundation: 18, roof: 12, exterior: 16, interior: 3.5, flooring: 9, paint: 2.3, electrical: 14, plumbing: 13, hvac: 12, framing: 28 };
let takeRows = [];
function resetTakeInputs() { const t = S.P.takeoff; $('takeArea').value = t.area; $('takeStories').value = String(t.stories); $('takeShape').value = String(t.shape); $('takeWaste').value = t.waste; }
function takeCalc(fromUser) {
  const t = S.P.takeoff;
  if (fromUser) { t.area = Number($('takeArea').value); t.stories = Number($('takeStories').value); t.shape = Number($('takeShape').value); t.waste = Number($('takeWaste').value); t.qty = {}; }
  const a = Number(t.area), stories = Number(t.stories), shape = Number(t.shape), w = 1 + Number(t.waste) / 100;
  if (!(a >= 300 && a <= 30000)) { toast('Enter floor area between 300 and 30,000 sq ft.', { err: true }); return; }
  const fp = a / stories, perimeter = 4 * Math.sqrt(fp) * shape, roof = fp * 1.25 * shape, ext = perimeter * 9 * stories;
  const defs = [['foundation', 'Foundation slab', fp, 'sq ft', 'Area / stories'], ['roof', 'Roof covering', roof * w, 'sq ft', 'Footprint × 1.25 pitch × shape × waste'], ['exterior', 'Exterior cladding', ext * w, 'sq ft', 'Perimeter × 9 ft/story × waste'],
    ['interior', 'Drywall', a * 3.2 * w, 'sq ft', '3.2 × finished area × waste'], ['flooring', 'Floor finishes', a * .92 * w, 'sq ft', '92% coverage × waste'], ['paint', 'Paintable surface', a * 3.5, 'sq ft', '3.5 × finished area'],
    ['framing', 'Structural framing allowance', a, 'finished sq ft', 'Allowance; engineered takeoff required'], ['electrical', 'Electrical trade allowance', a, 'finished sq ft', 'Labor + materials allowance'],
    ['plumbing', 'Plumbing trade allowance', a, 'finished sq ft', 'Labor + materials allowance'], ['hvac', 'HVAC trade allowance', a, 'finished sq ft', 'Labor + materials allowance']];
  takeRows = defs.map(([id, name, qty, unit, basis]) => ({ id, name, qty: t.qty[id] !== undefined ? t.qty[id] : Math.round(qty), unit, rate: t.rates[id] !== undefined ? t.rates[id] : UNIT_RATES[id], basis }));
  if (fromUser) markDirty();
}
function renderTake() {
  resetTakeInputs(); takeCalc(false);
  const tb = $('takeRows'); tb.innerHTML = '';
  takeRows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(r.name)}</td><td><input type="number" min="0" value="${r.qty}" aria-label="${esc(r.name)} quantity"/></td><td>${esc(r.unit)}</td><td><input type="number" min="0" step=".01" value="${r.rate}" aria-label="${esc(r.name)} rate"/></td><td class="num" id="takeExt${i}"></td><td class="small">${esc(r.basis)}</td>`;
    const [qi, ri] = qa('input', tr);
    qi.disabled = ri.disabled = !S.canEdit;
    qi.oninput = () => { r.qty = Math.max(0, Number(qi.value) || 0); S.P.takeoff.qty[r.id] = r.qty; takeTotals(); markDirty(); };
    ri.oninput = () => { r.rate = Math.max(0, Number(ri.value) || 0); S.P.takeoff.rates[r.id] = r.rate; takeTotals(); markDirty(); };
    tb.append(tr);
  });
  takeTotals();
}
function takeTotals() { let sum = 0; takeRows.forEach((r, i) => { const x = r.qty * r.rate; sum += x; const el = $('takeExt' + i); if (el) el.textContent = fmt(x); }); $('takeSummary').textContent = fmt(sum); $('takeBreakdown').textContent = takeRows.length + ' packages · planning-only rates · excludes demolition, land, permits and contingency.'; }
function takeCSV() { takeCalc(false); const csv = [['Package', 'Quantity', 'Unit', 'Unit rate USD', 'Extended USD', 'Basis'], ...takeRows.map(r => [r.name, r.qty, r.unit, r.rate, (r.qty * r.rate).toFixed(2), r.basis])].map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n'); downloadBlob('intellibuild-takeoff.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' })); }

/* ------------------------------------------------------------------ concept lab */
let conceptImage = null;
function drawConcept() {
  const canvas = $('conceptCanvas'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, c = S.P.concept;
  c.style = $('conceptStyle').value; c.opacity = Number($('conceptOpacity').value); c.width = Number($('conceptWidth').value); c.height = Number($('conceptHeight').value);
  ctx.clearRect(0, 0, w, h);
  if (conceptImage) { const s = Math.max(w / conceptImage.width, h / conceptImage.height), iw = conceptImage.width * s, ih = conceptImage.height * s; ctx.drawImage(conceptImage, (w - iw) / 2, (h - ih) / 2, iw, ih); }
  else { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#29475f'); g.addColorStop(1, '#476b58'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#d8e5f3'; ctx.font = '26px sans-serif'; ctx.fillText('Upload an existing home photo to create an overlay', 90, 70); }
  const style = c.style, opacity = c.opacity / 100, width = c.width / 100, cy = c.height / 100, bw = w * width, bx = (w - bw) / 2, baseY = h * .88, topY = h * cy;
  ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = style === 'farmhouse' ? '#f5f1e8' : style === 'traditional' ? '#b77e64' : '#d8e0e7'; ctx.fillRect(bx, topY, bw, baseY - topY);
  ctx.fillStyle = style === 'traditional' ? '#473d42' : '#24364a'; ctx.beginPath();
  if (style === 'contemporary') { ctx.moveTo(bx - 10, topY); ctx.lineTo(bx + bw + 10, topY); ctx.lineTo(bx + bw + 10, topY + 22); ctx.lineTo(bx - 10, topY + 22); } else { ctx.moveTo(bx - 25, topY + 10); ctx.lineTo(w / 2, topY - 90); ctx.lineTo(bx + bw + 25, topY + 10); }
  ctx.closePath(); ctx.fill();
  const cols = style === 'contemporary' ? 4 : 3; for (let i = 0; i < cols; i++) { const xx = bx + bw * (i + .12) / cols; ctx.fillStyle = '#244f69'; ctx.fillRect(xx, topY + 65, bw * .15, Math.max(48, (baseY - topY) * .26)); ctx.strokeStyle = '#d7e5ed'; ctx.lineWidth = 6; ctx.strokeRect(xx, topY + 65, bw * .15, Math.max(48, (baseY - topY) * .26)); }
  ctx.fillStyle = '#233746'; ctx.fillRect(bx + bw * .45, baseY - 125, bw * .14, 125); ctx.restore();
  ctx.fillStyle = 'rgba(4,13,23,.8)'; ctx.fillRect(0, h - 42, w, 42); ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.fillText('INTELLIBUILD CONCEPT OVERLAY — NOT TO SCALE / NOT AI GENERATED', 18, h - 15);
  $('opacityLabel').textContent = c.opacity + '%'; $('widthLabel').textContent = c.width + '%'; $('heightLabel').textContent = c.height + '%';
}

/* ------------------------------------------------------------------ design, budget, materials, schedule, checklist */
const STYLES = [['Modern Farmhouse', '⌂', 'Warm traditional forms with clean contemporary details'], ['Contemporary', '▱', 'Minimal lines, large windows and open-plan spaces'], ['Colonial Revival', '♜', 'Classic symmetry, brick and timeless proportions'],
  ['Craftsman', '▤', 'Porches, natural materials and detailed trim'], ['Transitional', '◇', 'A balanced mix of classic and modern'], ['Mediterranean', '☼', 'Stucco, tile roofing and courtyard living']];
function renderDesigns() {
  $('designCards').innerHTML = STYLES.map(([n, i, d]) => `<div class="design ${S.P.design === n ? 'selected' : ''}"><div class="art">${i}</div><div class="body"><h3>${n}</h3><p class="small">${d}</p><button class="btn ${S.P.design === n ? '' : 'secondary'}" data-style="${n}" ${S.canEdit ? '' : 'disabled'}>${S.P.design === n ? '✓ Selected' : 'Choose style'}</button></div></div>`).join('');
  qa('[data-style]').forEach(b => b.onclick = () => { S.P.design = b.dataset.style; S.P.designTouched = true; markDirty(); renderDesigns(); if (window.renderJourney) renderJourney(); });
}
function compute() {
  const p = S.P, area = Number(p.area) || 0, rate = Number(p.rate) || 0, demo = Number(p.demo) || 0, site = Number(p.site) || 0, construction = area * rate, soft = construction * (Number(p.soft) || 0) / 100;
  const cont = (construction + demo + site + soft) * (Number(p.cont) || 0) / 100, total = construction + demo + site + soft + cont;
  p.budget = Math.round(total);
  $('rateLabel').textContent = '$' + rate; $('areaLabel').textContent = area.toLocaleString() + ' sq ft'; $('mArea').textContent = area.toLocaleString() + ' sq ft'; $('mBudget').textContent = fmt(total); $('grandTotal').textContent = fmt(total);
  $('costRows').innerHTML = [['Construction (incl. trades & materials)', construction], ['Demolition', demo], ['Sitework & utility allowance', site], ['Design, permits & soft costs', soft], ['Contingency', cont]].map(([a, b]) => `<div class="statrow"><span>${a}</span><strong>${fmt(b)}</strong></div>`).join('');
  if ($('materialRows')) $('materialRows').innerHTML = [['Floor area', area.toLocaleString() + ' sq ft'], ['Roof coverage allowance (conceptual)', Math.round(area / (Number(p.stories) || 2) * 1.25).toLocaleString() + ' sq ft'], ['Drywall surface allowance (conceptual)', Math.round(area * 3.5).toLocaleString() + ' sq ft'], ['Floor finishes allowance (conceptual)', Math.round(area * .9).toLocaleString() + ' sq ft']].map(([a, b]) => `<div class="statrow"><span>${a}</span><strong>${b}</strong></div>`).join('');
}
const STAGES = [['Feasibility, survey and concept design', '4–8 weeks'], ['Architectural and engineering plans', '6–12 weeks'], ['Permit review and utility coordination', '8–20+ weeks'], ['Utility disconnects and demolition', '2–5 weeks'], ['Excavation and foundation', '4–8 weeks'], ['Framing, roof and weatherproofing', '8–14 weeks'], ['MEP rough-in and inspections', '5–10 weeks'], ['Insulation, drywall and interiors', '8–16 weeks'], ['Exterior, landscape and final inspections', '4–10 weeks'], ['Punch list and handover', '2–4 weeks']];
function renderStatic() {
  $('scheduleRows').innerHTML = STAGES.map(([n, d], i) => `<div class="statrow"><span><span style="color:var(--teal)">${String(i + 1).padStart(2, '0')}</span> &nbsp; ${n}</span><strong>${d}</strong></div>`).join('');
}
/* ------------------------------------------------------------------ pro gating, feasibility, scenarios */
function premium() { return !!(S.project && S.project.premium); }
function lockHTML(feature) {
  const hp = planCfg('homeowner'), bp = planCfg('builder');
  return `<div class="lockpane"><h3>🔒 ${esc(feature)} is a Pro feature</h3><p>Unlock it with <b>Homeowner Pro</b> for this project (${fmt(hp.priceUsd || 299)} one-time, includes ${hp.projectCredits || 40} AI credits) or <b>Builder Pro</b> (${fmt(bp.priceUsd || 399)}/month, every project, ${bp.monthlyCredits || 200} credits monthly).</p><button class="btn" data-go="billing">See plans</button></div>`;
}
function requirePro(feature) { if (premium()) return true; toast(feature + ' requires Homeowner Pro for this project or Builder Pro.', { err: true, action: 'See plans', onAction: () => tab('billing') }); return false; }
function renderFeas() {
  const p = currentProperty();
  $('evidence').innerHTML = `<table class="data"><tr><td>Address</td><td>${esc(p.address)}</td></tr><tr><td>Location match</td><td>${p.geocoded ? 'Census geocoded' : 'Not verified'}</td></tr><tr><td>Parcel PIN</td><td>${esc(p.parcelPin || 'Not verified')}</td></tr><tr><td>Existing area</td><td>${p.existingSqFt ? p.existingSqFt.toLocaleString() + ' sq ft' : 'Not provided'}</td></tr><tr><td>Year built</td><td>${p.yearBuilt || 'Not provided'}</td></tr><tr><td>Record status</td><td>${esc(p.source)}</td></tr></table>`;
  $('feasSummary').innerHTML = (premium() ? '' : lockHTML('The printable feasibility report')) + `<div class="grid"><div class="card"><div class="small">Lot area</div><div class="metric">${p.lotSqFt ? p.lotSqFt.toLocaleString() + ' ft²' : 'Unknown'}</div></div><div class="card"><div class="small">Zoning</div><div class="metric">${esc(p.zoning || 'Unverified')}</div></div><div class="card"><div class="small">Proposed home</div><div class="metric">${Number(S.P.area).toLocaleString()} ft²</div></div><div class="card"><div class="small">Budget</div><div class="metric">${fmt(S.P.budget)}</div></div></div>
    <p><strong>Lot coverage indication:</strong> ${p.lotSqFt ? Math.round(S.P.area / (Number(S.P.stories) || 2) / p.lotSqFt * 100) + '% footprint-to-lot (conceptual; verify against zoning limits)' : 'Enter lot area'}</p>
    <p><strong>Outstanding due diligence:</strong> boundary survey, zoning/setback review, utility disconnects, demolition hazards, structural/civil engineering, permit eligibility and contractor bids.</p><p><strong>Constraints:</strong> ${esc(p.constraints || 'Not supplied')}</p>`;
}
function estimateScenario(area, rate, demolition) { const hard = area * rate; return Math.round((hard + hard * .15 + demolition) * 1.12); }
function renderCompare() {
  if (!premium()) { $('compareCards').innerHTML = '<div style="grid-column:1/-1">' + lockHTML('Scenario comparison') + '</div>'; $('scenarioTable').innerHTML = ''; return; }
  const p = S.P, area = Number(p.area) || 4000, existing = Number(p.existingArea) || 2400, rate = Number(p.compareRate) || 300, reno = Number(p.renoRate) || 175, demo = Number(p.demo) || 35000;
  const sc = [{ name: 'Renovate existing', size: existing, cost: estimateScenario(existing, reno, 0), months: '6–12', note: 'Existing structure retained; scope unknown' }, { name: 'Efficient replacement', size: 2800, cost: estimateScenario(2800, rate * .85, demo), months: '10–16', note: 'Compact layout; lower finish allowance' },
    { name: 'Custom replacement', size: area, cost: estimateScenario(area, rate, demo), months: '12–20', note: 'Design and size from this project' }, { name: 'Premium replacement', size: Math.round(area * 1.25), cost: estimateScenario(Math.round(area * 1.25), rate * 1.4, demo), months: '15–24', note: 'Larger area, premium specifications' }];
  $('compareCards').innerHTML = sc.map(x => `<div class="card"><div class="small">${x.name}</div><div class="metric">${fmt(x.cost)}</div><p>${x.size.toLocaleString()} sq ft · ${x.months} months</p><p class="small">${x.note} · ${fmt(x.cost / x.size)}/sq ft all-in</p></div>`).join('');
  $('scenarioTable').innerHTML = `<table class="data"><thead><tr><th>Option</th><th class="num">Area</th><th class="num">Budget</th><th class="num">$/sq ft</th><th>Timeline</th></tr></thead><tbody>${sc.map(x => `<tr><td>${x.name}</td><td class="num">${x.size.toLocaleString()}</td><td class="num">${fmt(x.cost)}</td><td class="num">${fmt(x.cost / x.size)}</td><td>${x.months}</td></tr>`).join('')}</tbody></table>`;
}

/* ------------------------------------------------------------------ bids */
let bidCache = [];
async function loadBids() {
  const canBid = S.user && !S.guest && ROLE_RANK[S.role] >= ROLE_RANK.contractor && !(S.project.isDemo && !S.canEdit);
  const isMgr = ROLE_RANK[S.role] >= ROLE_RANK.editor;
  $('bidFormTitle').textContent = isMgr ? 'Log a bid received offline' : 'Submit your bid';
  $('bidIntro').textContent = isMgr ? 'Contractors you invite submit bids here directly and are notified when you award. You can also log bids received by email or phone.' : S.role === 'contractor' ? 'Submit or revise your bid. Only the project owner and editors can see all bids.' : 'Bids for this project.';
  qa('#bidName,#bidPrice,#bidMonths,#bidExcl,#bidScope,#addBid').forEach(el => el.disabled = !canBid);
  if (!isMgr && S.user && !$('bidName').value) $('bidName').value = S.user.company || S.user.name;
  const d = await api('bids.list', { projectId: S.pid }); bidCache = d.bids; renderBids(isMgr);
}
function renderBids(isMgr) {
  S.bidStats = { count: bidCache.length, awarded: bidCache.filter(x => x.status === 'awarded').length }; if (window.renderJourney) renderJourney();
  const b = bidCache, est = Number(S.P.budget) || 0, prices = b.map(x => x.price).sort((a, c) => a - c), median = prices.length ? prices[Math.floor((prices.length - 1) / 2)] : 0;
  $('bidStats').innerHTML = [['Bids received', b.length], ['Lowest bid', prices.length ? fmt(prices[0]) : '—'], ['Median bid', prices.length ? fmt(median) : '—'], ['IntelliBuild estimate', fmt(est)]].map(([a, v]) => `<div class="card"><div class="small">${a}</div><div class="metric">${v}</div></div>`).join('');
  const max = Math.max(est, ...prices, 1);
  $('bidChart').innerHTML = b.length ? [{ firm: 'IntelliBuild estimate', price: est, est: true }].concat(b).map(x => `<div class="hbar"><span title="${esc(x.firm)}">${esc(x.firm.length > 20 ? x.firm.slice(0, 19) + '…' : x.firm)}</span><div class="track"><div class="fill" style="width:${(x.price / max * 100).toFixed(1)}%;${x.est ? 'background:#3d5671' : ''}"></div></div><b>${fmt(x.price)}</b></div>`).join('') + '<p class="small">Bars scale to the highest value. Compare scope and exclusions before choosing on price.</p>' : '<p class="small">No bids yet.</p>';
  $('bidList').innerHTML = b.length ? `<table class="data"><thead><tr><th>Firm</th><th class="num">Price</th><th class="num">vs estimate</th><th class="num">Months</th><th>Scope / exclusions</th><th>Status</th><th></th></tr></thead><tbody>${b.map(x => `<tr><td><b>${esc(x.firm)}</b><div class="small">${esc(x.submittedBy)} · ${day(x.updatedAt)}</div></td><td class="num">${fmt(x.price)}</td><td class="num">${est ? ((x.price / est - 1) * 100).toFixed(1) + '%' : '—'}</td><td class="num">${x.months}</td><td class="small">${esc(x.scope)}${x.exclusions ? '<br/><b>Excl:</b> ' + esc(x.exclusions) : ''}${x.note ? '<br/><b>Note:</b> ' + esc(x.note) : ''}</td>
    <td><span class="badge ${x.status === 'awarded' ? 'ok' : x.status === 'declined' || x.status === 'withdrawn' ? 'bad' : x.status === 'shortlisted' ? 'warn' : ''}">${x.status}</span></td>
    <td><div class="flex">${isMgr ? ['shortlisted', 'awarded', 'declined'].filter(s => s !== x.status).map(s => `<button class="btn sm secondary" data-bs="${x.id}" data-st="${s}">${{ shortlisted: 'Shortlist', awarded: 'Award', declined: 'Decline' }[s]}</button>`).join('') : ''}${x.mine ? `<button class="btn sm secondary" data-be="${x.id}">Edit</button>` : ''}${x.mine && !isMgr && x.status !== 'withdrawn' ? `<button class="btn sm danger" data-bs="${x.id}" data-st="withdrawn">Withdraw</button>` : ''}${isMgr || x.mine ? `<button class="btn sm danger" data-br="${x.id}">Remove</button>` : ''}</div></td></tr>`).join('')}</tbody></table>` : '<p>No bids yet. Invite contractors from Team &amp; Messages.</p>';
  qa('[data-bs]').forEach(btn => btn.onclick = async () => {
    let note; if (btn.dataset.st === 'awarded') { const v = await modal('Award this bid?', '<p>The contractor is emailed that their bid was awarded.</p><label>Note (optional)<input name="note"/></label>', 'Award'); if (!v) return; note = v.note; }
    try { await api('bids.update', { id: btn.dataset.bs, status: btn.dataset.st, note }); toast('Bid ' + btn.dataset.st + '.');
      if (btn.dataset.st === 'awarded' && S.canEdit) { const st = checklistState(); st.bids = Object.assign({}, st.bids, { done: true, doneAt: new Date().toISOString(), by: S.user ? S.user.name : '' }); markDirty(); toast('Checklist updated: contractor bids leveled & awarded.'); }
      loadBids(); } catch (e) { fail(e); }
  });
  qa('[data-br]').forEach(btn => btn.onclick = async () => { if (!(await modal('Remove bid?', '<p>This deletes the bid from the register.</p>', 'Remove'))) return; try { await api('bids.update', { id: btn.dataset.br, remove: true }); loadBids(); } catch (e) { fail(e); } });
  qa('[data-be]').forEach(btn => btn.onclick = () => { const x = bidCache.find(y => y.id === btn.dataset.be); $('bidId').value = x.id; $('bidName').value = x.firm; $('bidPrice').value = x.price; $('bidMonths').value = x.months; $('bidScope').value = x.scope; $('bidExcl').value = x.exclusions; $('addBid').textContent = 'Update bid'; $('cancelBidEdit').classList.remove('hidden'); $('bidName').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
}
function clearBidForm() { if (ROLE_RANK[S.role] >= ROLE_RANK.editor) $('bidName').value = ''; ['bidId', 'bidPrice', 'bidMonths', 'bidScope', 'bidExcl'].forEach(id => $(id).value = ''); $('addBid').textContent = 'Submit bid'; $('cancelBidEdit').classList.add('hidden'); }
async function submitBid() {
  const b = $('addBid'); busy(b, true, 'Saving…');
  try { await api('bids.submit', { projectId: S.pid, id: $('bidId').value || undefined, firm: $('bidName').value, price: Number($('bidPrice').value), months: Number($('bidMonths').value), scope: $('bidScope').value, exclusions: $('bidExcl').value }); busy(b, false); clearBidForm(); toast('Bid saved.'); loadBids(); }
  catch (e) { busy(b, false); fail(e); }
}

/* ------------------------------------------------------------------ team, tasks, messages */
let threadTimer = null;
async function loadTeam() {
  clearInterval(threadTimer);
  if (S.guest) { $('teamIntro').textContent = 'Create a free account to invite contractors and collaborate.'; $('memberList').innerHTML = ''; $('inviteBox').classList.add('hidden'); $('taskList').innerHTML = ''; $('thread').innerHTML = ''; $('activity').innerHTML = ''; return; }
  const d = await api('projects.get', { id: S.pid }); S.members = d.members; S.collabLimit = d.collaboratorLimit;
  const isMgr = ROLE_RANK[S.role] >= ROLE_RANK.editor && !S.project.isDemo, isOwner = ['owner', 'admin'].includes(S.role);
  const used = S.members.length - 1;
  $('teamIntro').textContent = 'Your role: ' + S.role + '. ' + (S.collabLimit < 0 ? 'Unlimited collaborators on this project.' : used + ' of ' + S.collabLimit + ' collaborator seats used on this project.');
  $('inviteBox').classList.toggle('hidden', !isMgr);
  $('memberList').innerHTML = S.members.map(m => `<div class="statrow"><span><b>${esc(m.name)}</b>${m.company ? ' · ' + esc(m.company) : ''}<div class="small">${esc(m.email)}</div></span><strong class="flex">${m.status === 'invited' ? '<span class="badge warn">invited</span>' : ''}${isOwner && m.id !== 'owner' ? `<select data-mrole="${m.id}">${['contractor', 'editor', 'viewer'].map(r => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select><button class="btn sm danger" data-mrm="${m.id}">Remove</button>` : `<span class="badge ${m.role === 'owner' ? 'ok' : ''}">${m.role}</span>`}</strong></div>`).join('');
  qa('[data-mrole]').forEach(s => s.onchange = async () => { try { await api('members.update', { memberId: s.dataset.mrole, role: s.value }); toast('Role updated.'); } catch (e) { fail(e); } });
  qa('[data-mrm]').forEach(b => b.onclick = async () => { if (!(await modal('Remove from project?', '<p>They will lose access immediately.</p>', 'Remove'))) return; try { await api('members.update', { memberId: b.dataset.mrm, remove: true }); loadTeam(); } catch (e) { fail(e); } });
  $('taskAssignee').innerHTML = '<option value="">Unassigned</option>' + S.members.filter(m => m.userId && m.status === 'active').map(m => `<option value="${m.userId}">${esc(m.name)}</option>`).join('');
  const canWork = ROLE_RANK[S.role] >= ROLE_RANK.contractor && !(S.project.isDemo && !S.canEdit);
  qa('#taskTitle,#taskAssignee,#taskDue,#addTask,#msgText,#sendMsg').forEach(el => el.disabled = !canWork);
  await Promise.all([loadTasks(), loadThread(), loadActivity()]);
  threadTimer = setInterval(() => { if (S.current === 'team' && !document.hidden) loadThread().catch(() => {}); else clearInterval(threadTimer); }, 30000);
}
async function loadTasks() {
  const d = await api('tasks.list', { projectId: S.pid });
  $('taskList').innerHTML = d.tasks.length ? d.tasks.map(t => `<div class="task"><select data-tst="${t.id}">${['open', 'in_progress', 'blocked', 'done'].map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}</select><span class="grow" style="${t.status === 'done' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}<div class="small">${t.assigneeName ? '→ ' + esc(t.assigneeName) : 'Unassigned'}${t.due ? ' · due ' + esc(t.due) : ''}</div></span><button class="btn sm secondary" data-tdel="${t.id}">✕</button></div>`).join('') : '<p class="small">No tasks yet.</p>';
  qa('[data-tst]').forEach(s => s.onchange = async () => { try { await api('tasks.save', { projectId: S.pid, id: s.dataset.tst, status: s.value }); loadTasks(); } catch (e) { fail(e); } });
  qa('[data-tdel]').forEach(b => b.onclick = async () => { try { await api('tasks.save', { projectId: S.pid, id: b.dataset.tdel, remove: true }); loadTasks(); } catch (e) { fail(e); } });
}
async function loadThread() {
  const d = await api('comments.list', { projectId: S.pid }), th = $('thread');
  th.innerHTML = d.comments.length ? d.comments.map(c => `<div class="msg ${c.mine ? 'mine' : ''}"><div class="meta">${esc(c.userName)} · ${when(c.createdAt)}${c.mine ? ` · <a href="#" data-cdel="${c.id}" class="link">delete</a>` : ''}</div>${esc(c.text).replace(/\n/g, '<br/>')}</div>`).join('') : '<p class="small">No messages yet. Start the conversation with your contractors and architect.</p>';
  th.scrollTop = th.scrollHeight;
  qa('[data-cdel]').forEach(a => a.onclick = async e => { e.preventDefault(); try { await api('comments.delete', { id: a.dataset.cdel }); loadThread(); } catch (er) { fail(er); } });
}
async function loadActivity() {
  try { const d = await api('projects.activity', { projectId: S.pid }); $('activity').innerHTML = d.activity.map(a => `<div class="statrow"><span>${esc(a.by)} · ${esc(a.action.replace(/[._]/g, ' '))}</span><strong class="small">${when(a.at)}</strong></div>`).join('') || '<p class="small">No activity yet.</p>'; }
  catch (e) { $('activity').innerHTML = ''; }
}

/* ------------------------------------------------------------------ billing */
async function loadBilling() {
  const [h, pl] = await Promise.all([api('billing.history'), S.plansCfg ? Promise.resolve(S.plansCfg) : api('billing.plans')]);
  S.plansCfg = pl; S.user = h.user; S.ent = h.entitlements; renderUserChrome();
  const u = S.user, e = S.ent, proj = S.project && !S.project.isDemo ? S.project : null;
  $('billingKpis').innerHTML = [['Current plan', u.planName + (u.planStatus && u.plan === 'builder' ? ' · ' + u.planStatus : '')], ['AI credits', u.credits.toLocaleString()], ['Owned projects', e.ownedProjects + ' / ' + (e.maxProjects < 0 ? '∞' : e.maxProjects)], ['This project', proj ? (proj.premium ? 'Pro features unlocked' : 'Explore (free)') : 'No project open']]
    .map(([a, b]) => `<div class="card"><div class="small">${a}</div><div class="metric">${esc(b)}</div></div>`).join('');
  const P0 = pl.plans, isOwnerProj = proj && proj.role === 'owner';
  const card = (k, cta, featured) => { const c = P0[k]; return `<div class="card ${featured ? 'featured' : ''}"><h2>${esc(c.name)}</h2><div class="metric">${c.priceUsd === null ? 'Custom' : c.priceUsd === 0 ? 'Free' : fmt(c.priceUsd)}<span class="small">${c.interval === 'month' ? ' / month' : c.interval === 'one_time' ? ' one-time per project' : ''}</span></div><ul>${(c.features || []).map(f => '<li>' + esc(f) + '</li>').join('')}</ul>${cta}</div>`; };
  $('planCards').innerHTML = card('free', `<button class="btn secondary" disabled>${u.plan === 'free' ? 'Current plan' : 'Included'}</button>`) +
    card('homeowner', isOwnerProj && !proj.hasPass && !proj.premium ? `<button class="btn" data-buy="homeowner">Unlock “${esc(proj.name.slice(0, 26))}”</button>` : proj && proj.hasPass ? '<button class="btn secondary" disabled>✓ Active on this project</button>' : `<button class="btn secondary" disabled>${e.isBuilder ? 'Included in Builder Pro' : 'Open a project you own to unlock it'}</button>`) +
    card('builder', e.isBuilder ? '<button class="btn secondary" data-portal>Manage subscription</button>' : '<button class="btn" data-buy="builder">Subscribe to Builder Pro</button>', true) +
    card('enterprise', `<a class="btn secondary" href="mailto:${esc(pl.enterpriseContact)}?subject=IntelliBuild%20Enterprise">Contact sales</a>`);
  const rpc = creditCost('render_standard');
  $('creditExplainer').textContent = 'AI concept render: ' + rpc + ' credits (high detail: ' + creditCost('render_hd') + ') · AI brief: ' + creditCost('brief') + ' credit. Credits never expire; failed generations are refunded automatically.';
  $('packCards').innerHTML = pl.creditPacks.map(p => `<div class="card"><div class="small">${p.credits.toLocaleString()} credits</div><div class="metric">${fmt(p.priceUsd)}</div><p class="small">≈ ${Math.floor(p.credits / rpc)} standard renders · ${fmt2(p.priceUsd / p.credits)} per credit</p><button class="btn" data-pack="${p.id}">Buy</button></div>`).join('');
  if (!pl.stripeEnabled) $('creditExplainer').textContent += ' (Online payments are being configured — contact support to purchase.)';
  qa('[data-buy]').forEach(b => b.onclick = () => checkout({ kind: b.dataset.buy, projectId: b.dataset.buy === 'homeowner' ? proj.id : undefined }, b));
  qa('[data-pack]').forEach(b => b.onclick = () => checkout({ kind: 'credits', packId: b.dataset.pack }, b));
  qa('[data-portal]').forEach(b => b.onclick = openPortal);
  $('openPortal').classList.toggle('hidden', !u.hasBilling);
  $('payHistory').innerHTML = h.payments.length ? `<table class="data"><thead><tr><th>Date</th><th>Item</th><th class="num">Amount</th></tr></thead><tbody>${h.payments.map(p => `<tr><td>${day(p.createdAt)}</td><td>${esc(p.description)}</td><td class="num">${fmt2(p.amountCents / 100)}</td></tr>`).join('')}</tbody></table>` : '<p class="small">No payments yet.</p>';
  $('creditHistory').innerHTML = h.credits.length ? `<table class="data"><thead><tr><th>Date</th><th>Reason</th><th class="num">Change</th><th class="num">Balance</th></tr></thead><tbody>${h.credits.map(c => `<tr><td>${day(c.createdAt)}</td><td>${esc(c.reason)}</td><td class="num" style="color:${c.delta > 0 ? 'var(--teal)' : 'inherit'}">${c.delta > 0 ? '+' : ''}${c.delta}</td><td class="num">${c.balance}</td></tr>`).join('')}</tbody></table>` : '<p class="small">No credit activity yet.</p>';
}
async function checkout(payload, btn) {
  if (S.user && !S.user.verified) toast('Tip: verify your email so receipts reach you.');
  busy(btn, true, 'Opening secure checkout…');
  try { const r = await api('billing.checkout', payload); await saveNow(); location.href = r.url; } catch (e) { busy(btn, false); fail(e); }
}
async function openPortal() { try { const r = await api('billing.portal'); location.href = r.url; } catch (e) { fail(e); } }
async function confirmCheckout(sessionId) {
  toast('Confirming your payment…');
  for (let i = 0; i < 4; i++) {
    try {
      const r = await api('billing.confirm', { sessionId }); S.user = r.user; S.ent = r.entitlements; renderUserChrome();
      if (/fulfilled|active/.test(r.result)) { toast('Payment confirmed — thank you! Your purchase is active.'); await loadProjects(); if (S.pid) { const sp = S.projects.find(p => p.id === S.pid); if (sp) S.project = Object.assign(S.project || {}, sp); } return; }
    } catch (e) { fail(e); return; }
    await new Promise(r => setTimeout(r, 2500));
  }
  toast('Payment is processing. Your purchase will activate automatically within a few minutes.');
}

/* ------------------------------------------------------------------ account */
function fillAccount() {
  const f = $('profileForm'), u = S.user; f.name.value = u.name; f.company.value = u.company || ''; f.phone.value = u.phone || ''; f.accountType.value = u.accountType || 'homeowner';
  $('verifyLine').innerHTML = esc(u.email) + ' · ' + (u.verified ? '<span class="badge ok">verified</span>' : '<span class="badge warn">not verified</span> <a href="#" id="resendV2" class="link">resend email</a>') + ' · member since ' + day(u.createdAt);
  if ($('resendV2')) $('resendV2').onclick = async e => { e.preventDefault(); try { await api('resendVerification'); toast('Verification email sent.'); } catch (er) { fail(er); } };
}

/* ------------------------------------------------------------------ admin console */
let adminCache = {};
async function loadAdmin(which) {
  S.adminTab = which; qa('#adminTabs button').forEach(b => b.classList.toggle('on', b.dataset.a === which));
  const body = $('adminBody'); body.innerHTML = '<p class="small">Loading…</p>';
  ({ overview: adminOverview, users: adminUsers, settings: adminSettings, pricebook: adminPricebook, demo: adminDemo, audit: adminAudit })[which]().catch(e => { body.innerHTML = '<p class="status">' + esc(e.message) + '</p>'; });
}
async function adminOverview() {
  const days = adminCache.days || 30, d = await api('admin.dashboard', { days }), k = d.kpis, h = d.health;
  const kpi = (a, b, s) => `<div class="card"><div class="small">${a}</div><div class="metric">${b}</div>${s ? `<div class="small">${s}</div>` : ''}</div>`;
  $('adminBody').innerHTML = `<div class="flex"><label class="flex">Period <select id="admDays">${[7, 30, 90, 365].map(x => `<option value="${x}" ${x === days ? 'selected' : ''}>Last ${x} days</option>`).join('')}</select></label><button class="btn sm secondary" id="admSync">Sync Stripe now</button></div>
  <div class="grid section">${kpi('Revenue (period)', fmt2(k.revenuePeriod), 'All-time ' + fmt2(k.revenueAll))}${kpi('AI provider cost (period)', fmt2(k.aiCostPeriod), 'All-time ' + fmt2(k.aiCostAll))}${kpi('Gross margin after AI', fmt2(k.grossMarginPeriod), k.marginPct === null ? '—' : k.marginPct.toFixed(1) + '% of revenue')}${kpi('MRR (Builder Pro)', fmt(k.mrr), k.payingBuilders + ' active subscriptions')}
  ${kpi('Users', k.users.toLocaleString(), '+' + k.newUsers + ' in period')}${kpi('AI jobs (period)', k.aiJobsPeriod.toLocaleString(), k.failureRate.toFixed(1) + '% failed · avg render ' + fmt2(k.avgRenderCost))}${kpi('Credits outstanding', k.creditsOutstanding.toLocaleString(), k.creditsConsumedPeriod + ' consumed in period')}${kpi('Today’s AI spend', fmt2(k.todayAiCost), 'Daily cap ' + fmt2(k.dailyCap) + (k.todayAiCost >= k.dailyCap ? ' · <b style="color:var(--red)">AI paused</b>' : ''))}</div>
  <div class="card section"><h2>Revenue vs AI cost per day</h2>${lineChart(d.series, [{ key: 'revenue', label: 'Revenue', color: 'var(--s-rev)' }, { key: 'aiCost', label: 'AI cost', color: 'var(--s-cost)' }])}
  <details class="mt"><summary class="small">View as table</summary><div class="scroll"><table class="data"><thead><tr><th>Day</th><th class="num">Revenue</th><th class="num">AI cost</th><th class="num">AI jobs</th><th class="num">Sign-ups</th></tr></thead><tbody>${d.series.slice().reverse().map(r => `<tr><td>${r.day}</td><td class="num">${fmt2(r.revenue)}</td><td class="num">${fmt2(r.aiCost)}</td><td class="num">${r.jobs}</td><td class="num">${r.signups}</td></tr>`).join('')}</tbody></table></div></details></div>
  <div class="two section"><div class="card"><h2>Revenue by product (period)</h2>${hbars(d.revenueByKind)}</div><div class="card"><h2>Platform health</h2><div class="kv"><span>Version</span><b>${esc(h.version)}</b><span>AI provider</span><b>${h.ai ? '<span class="badge ok">' + esc(h.aiProvider) + '</span>' : '<span class="badge bad">missing key</span>'}</b><span>Stripe</span><b>${h.stripe ? '<span class="badge ' + (h.stripeMode === 'live' ? 'ok' : 'warn') + '">' + h.stripeMode + ' mode</span>' : '<span class="badge bad">not configured</span>'}</b><span>Last Stripe sync</span><b>${when(h.lastStripeSync)}</b><span>Webhook</span><b>${h.webhook ? 'enabled' : 'polling only'}</b><span>Public URL</span><b>${esc(h.siteUrl)}</b><span>Projects / collaborators / bids</span><b>${k.projects} / ${k.collaborators} / ${k.bids}</b><span>Revenue per credit sold</span><b>${k.revenuePerCredit ? fmt2(k.revenuePerCredit) : '—'}</b></div></div></div>
  <div class="two section"><div class="card"><h2>Top AI spenders (period)</h2>${table(['User', 'Jobs', 'Credits', 'Cost'], d.topSpenders.map(t => [esc(t.user), t.jobs, t.credits, fmt2(t.cost)]), [1, 2, 3])}</div><div class="card"><h2>Recent payments</h2>${table(['When', 'User', 'Item', 'Amount'], d.recentPayments.map(p => [day(p.at), esc(p.user), esc(p.description), fmt2(p.amount)]), [3])}</div></div>
  <div class="card section"><h2>Recent AI jobs</h2>${table(['When', 'User', 'Type', 'Credits', 'Cost', 'Status', 'Time'], d.recentJobs.map(j => [when(j.at), esc(j.user), esc(j.type), j.credits, fmt2(j.cost), j.status === 'success' ? '<span class="badge ok">success</span>' : `<span class="badge bad" title="${esc(j.error)}">failed</span>`, (j.ms / 1000).toFixed(1) + 's']), [3, 4, 6])}</div>`;
  $('admDays').onchange = () => { adminCache.days = Number($('admDays').value); adminOverview().catch(fail); };
  $('admSync').onclick = async () => { try { const r = await api('admin.stripeSync'); toast(r.processed + ' Stripe event(s) processed.'); adminOverview(); } catch (e) { fail(e); } };
  attachChart();
}
function table(head, rows, numCols = []) { return rows.length ? `<div class="scroll"><table class="data"><thead><tr>${head.map((h, i) => `<th class="${numCols.includes(i) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${numCols.includes(i) ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="small">Nothing yet.</p>'; }
function hbars(obj) {
  const labels = { subscription: 'Builder Pro subscriptions', project_pass: 'Homeowner Pro passes', credits: 'AI credit packs', refund: 'Refunds' }, e = Object.entries(obj);
  if (!e.length) return '<p class="small">No revenue in this period.</p>';
  const max = Math.max(...e.map(x => Math.abs(x[1])));
  return e.map(([k, v]) => `<div class="hbar"><span>${labels[k] || k}</span><div class="track"><div class="fill" style="width:${(Math.abs(v) / max * 100).toFixed(1)}%"></div></div><b>${fmt2(v)}</b></div>`).join('');
}
let chartData = null;
function lineChart(series, keys) {
  chartData = { series, keys };
  const W = 760, H = 250, L = 56, R = 70, T = 14, B = 30, n = series.length;
  const maxV = Math.max(1, ...series.flatMap(s => keys.map(k => s[k.key])));
  const step = Math.pow(10, Math.floor(Math.log10(maxV))), top = Math.ceil(maxV / step) * step;
  const x = i => L + (n <= 1 ? 0 : i / (n - 1) * (W - L - R)), y = v => T + (1 - v / top) * (H - T - B);
  chartData.geom = { W, H, L, R, T, B, x, y };
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = top * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#263a51" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" fill="#94a9c2" font-size="11">${fmt(v)}</text>`; }
  const every = Math.max(1, Math.ceil(n / 7));
  series.forEach((s, i) => { if (i % every === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" fill="#94a9c2" font-size="11">${s.day.slice(5)}</text>`; });
  const lines = keys.map(k => `<path d="${series.map((s, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(s[k.key]).toFixed(1)).join(' ')}" fill="none" stroke="${k.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><text x="${W - R + 6}" y="${y(series[n - 1][k.key]) + 4}" fill="#c4d4e6" font-size="11">${k.label}</text>`).join('');
  return `<div class="legend">${keys.map(k => `<span><i style="background:${k.color}"></i>${k.label}</span>`).join('')}</div><div class="chart-wrap" id="chartWrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily revenue and AI cost">${g}${lines}<line id="xhair" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#94a9c2" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>${keys.map((k, i) => `<circle id="dot${i}" r="4" fill="${k.color}" stroke="#101e31" stroke-width="2" visibility="hidden"/>`).join('')}<rect id="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="chart-tip" id="chartTip"></div></div>`;
}
function attachChart() {
  const hit = $('hit'); if (!hit || !chartData) return;
  const { series, keys, geom } = chartData, svg = hit.ownerSVGElement, tip = $('chartTip');
  const move = ev => {
    const pt = svg.getBoundingClientRect(), sx = (ev.clientX - pt.left) / pt.width * geom.W;
    const i = Math.max(0, Math.min(series.length - 1, Math.round((sx - geom.L) / (geom.W - geom.L - geom.R) * (series.length - 1)))), s = series[i], cx = geom.x(i);
    $('xhair').setAttribute('x1', cx); $('xhair').setAttribute('x2', cx); $('xhair').setAttribute('visibility', 'visible');
    keys.forEach((k, j) => { const d = $('dot' + j); d.setAttribute('cx', cx); d.setAttribute('cy', geom.y(s[k.key])); d.setAttribute('visibility', 'visible'); });
    tip.innerHTML = `<b>${s.day}</b><br/>` + keys.map(k => `<i style="display:inline-block;width:10px;height:3px;background:${k.color};margin-right:6px;vertical-align:middle"></i>${k.label}: ${fmt2(s[k.key])}`).join('<br/>') + `<br/><span class="small">${s.jobs} AI jobs · ${s.signups} sign-ups</span>`;
    tip.style.display = 'block'; const left = cx / geom.W * pt.width; tip.style.left = Math.min(left + 12, pt.width - 190) + 'px'; tip.style.top = '10px';
  };
  hit.addEventListener('mousemove', move);
  hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; $('xhair').setAttribute('visibility', 'hidden'); keys.forEach((k, j) => $('dot' + j).setAttribute('visibility', 'hidden')); });
}
async function adminUsers() {
  const q = adminCache.q || '', d = await api('admin.users', { q });
  $('adminBody').innerHTML = `<div class="flex"><input id="admQ" placeholder="Search name, email or company" value="${esc(q)}" class="grow"/><button class="btn sm" id="admQgo">Search</button><span class="small">${d.total} user(s)</span></div>
  <div class="card section">${table(['User', 'Type', 'Plan', 'Credits', 'Paid', 'AI cost', 'Projects', 'Last login', 'Actions'], d.users.map(u => [
    `<b>${esc(u.name)}</b>${u.isAdmin ? ' <span class="badge warn">admin</span>' : ''}${u.disabled ? ' <span class="badge bad">disabled</span>' : ''}<div class="small">${esc(u.email)}${u.company ? ' · ' + esc(u.company) : ''}</div>`, esc(u.accountType), esc(u.planName) + (u.planStatus ? '<div class="small">' + esc(u.planStatus) + '</div>' : ''), u.credits, fmt2(u.paid), fmt2(u.aiCost), u.projects, day(u.lastLogin),
    `<div class="flex"><button class="btn sm secondary" data-ucr="${u.id}">Credits ±</button><button class="btn sm secondary" data-upl="${u.id}" data-v="${u.plan === 'builder' ? 'free' : 'builder'}">${u.plan === 'builder' ? 'Set free' : 'Comp Builder'}</button>${u.id !== S.user.id ? `<button class="btn sm secondary" data-uad="${u.id}" data-v="${u.isAdmin ? 'user' : 'admin'}">${u.isAdmin ? 'Revoke admin' : 'Make admin'}</button><button class="btn sm danger" data-udis="${u.id}" data-v="${u.disabled ? '' : '1'}">${u.disabled ? 'Enable' : 'Disable'}</button>` : ''}</div>`]), [3, 4, 5, 6])}</div>`;
  $('admQgo').onclick = () => { adminCache.q = $('admQ').value; adminUsers().catch(fail); };
  $('admQ').onkeydown = e => { if (e.key === 'Enter') $('admQgo').click(); };
  const upd = async (payload, msg) => { try { await api('admin.userUpdate', payload); toast(msg); adminUsers(); } catch (e) { fail(e); } };
  qa('[data-ucr]').forEach(b => b.onclick = async () => { const v = await modal('Adjust AI credits', '<label>Credits to add (negative to remove)<input name="delta" type="number" value="25"/></label><label>Reason<input name="reason" placeholder="e.g. Goodwill, pilot customer"/></label>', 'Apply'); if (!v) return; try { const r = await api('admin.credits', { userId: b.dataset.ucr, delta: Number(v.delta), reason: v.reason }); toast('New balance: ' + r.credits); adminUsers(); } catch (e) { fail(e); } });
  qa('[data-upl]').forEach(b => b.onclick = () => upd({ userId: b.dataset.upl, plan: b.dataset.v }, 'Plan updated (complimentary, not billed).'));
  qa('[data-uad]').forEach(b => b.onclick = () => upd({ userId: b.dataset.uad, role: b.dataset.v }, 'Role updated.'));
  qa('[data-udis]').forEach(b => b.onclick = () => upd({ userId: b.dataset.udis, disabled: !!b.dataset.v }, b.dataset.v ? 'User disabled and signed out.' : 'User enabled.'));
}
async function adminSettings() {
  const d = await api('admin.settingsGet'), s = d.settings;
  const packPrice = (s.creditPacks.find(p => p.id === 'pack_200') || s.creditPacks[0] || { priceUsd: 0, credits: 1 });
  const perCredit = packPrice.priceUsd / packPrice.credits;
  const marginRow = (label, credits, cost) => `<tr><td>${label}</td><td class="num">${credits}</td><td class="num">${fmt2(credits * perCredit)}</td><td class="num">${fmt2(cost)}</td><td class="num">${credits * perCredit ? ((1 - cost / (credits * perCredit)) * 100).toFixed(0) + '%' : '—'}</td></tr>`;
  const num = (k, label, v) => `<label>${label}<input type="number" min="0" step="any" data-set="${k}" value="${v}"/></label>`;
  const js = (k, label) => `<label>${label}<textarea rows="8" data-json="${k}" spellcheck="false" style="font-family:monospace;font-size:12px">${esc(JSON.stringify(s[k], null, 2))}</textarea></label>`;
  $('adminBody').innerHTML = `<div class="two"><div class="card"><h2>Credits &amp; guardrails</h2><div class="two">${num('signupCredits', 'Welcome credits on sign-up', s.signupCredits)}${num('dailyAiCostCapUsd', 'Daily platform AI spend cap ($)', s.dailyAiCostCapUsd)}${num('userRendersPerHour', 'Max AI jobs per user per hour', s.userRendersPerHour)}
    ${num('cc.render_standard', 'Credits · standard render', s.creditCosts.render_standard)}${num('cc.render_hd', 'Credits · high-detail render', s.creditCosts.render_hd)}${num('cc.brief', 'Credits · AI brief', s.creditCosts.brief)}</div>
    <label>AI provider<select data-text="aiProvider">${[['auto', 'Auto (Gemini if its key is set, else OpenAI)'], ['gemini', 'Google Gemini'], ['openai', 'OpenAI']].map(([v, l]) => `<option value="${v}" ${s.aiProvider === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="two"><label>Gemini image model<input data-text="geminiImageModel" value="${esc(s.geminiImageModel)}"/></label><label>Gemini text model<input data-text="geminiTextModel" value="${esc(s.geminiTextModel)}"/></label>
    <label>OpenAI image model<input data-text="imageModel" value="${esc(s.imageModel)}"/></label><label>OpenAI text model<input data-text="textModel" value="${esc(s.textModel)}"/></label></div>
    <h3 class="mt">Unit economics at ${fmt2(perCredit)}/credit (${packPrice.credits}-credit pack)</h3><table class="data"><thead><tr><th>Job</th><th class="num">Credits</th><th class="num">Price</th><th class="num">Est. cost</th><th class="num">Margin</th></tr></thead><tbody>${marginRow('Standard render', s.creditCosts.render_standard, s.providerCostEstimates.render_standard)}${marginRow('High-detail render', s.creditCosts.render_hd, s.providerCostEstimates.render_hd)}${marginRow('AI brief', s.creditCosts.brief, s.providerCostEstimates.brief)}</tbody></table><p class="small">Actual cost per job is computed from the provider's reported token usage and shown in Revenue &amp; costs.</p></div>
  <div class="card"><h2>Plans, packs &amp; provider prices</h2>${js('plans', 'Plans (prices in USD; maxProjects / collaborators −1 = unlimited)')}${js('creditPacks', 'Credit packs')}${js('providerCostEstimates', 'Fallback cost estimates per job (USD)')}${js('geminiTokenPrices', 'Gemini token prices (USD per 1M tokens)')}${js('imageTokenPrices', 'OpenAI image token prices (USD per 1M tokens)')}${js('textTokenPrices', 'Text token prices (USD per 1M tokens)')}<label>Enterprise contact<input data-text="enterpriseContact" value="${esc(s.enterpriseContact)}"/></label><label>Support email<input data-text="supportEmail" value="${esc(s.supportEmail)}"/></label></div></div>
  <div class="card section"><h2>Platform keys</h2><p class="small">Secret keys are write-only: after saving, only the last 4 characters are shown. Paste a new value to replace a key, click <b>Save keys</b>, then <b>Test</b> to confirm it works.</p><div id="keyFields"><p class="small">Loading…</p></div><button class="btn secondary" id="saveKeys">Save keys</button></div>
  <div class="flex section"><button class="btn" id="saveSettings">Save settings</button><span class="small">Price changes apply to new checkouts immediately. Existing subscriptions keep their price until changed in Stripe.</span></div>`;
  api('admin.keys', { keys: {} }).then(r => renderKeyPanel(r.keys)).catch(fail);
  $('saveKeys').onclick = async () => { const keys = {}; qa('[data-key]').forEach(el => { if (el.value.trim() && !(el.type === 'text' && el.defaultValue === el.value)) keys[el.dataset.key] = el.value.trim(); }); try { const r = await api('admin.keys', { keys }); renderKeyPanel(r.keys); toast(r.changed.length ? 'Saved: ' + r.changed.join(', ') + '. Use Test to verify.' : 'No changes to save.'); } catch (e) { fail(e); } };
  $('saveSettings').onclick = async () => {
    const out = { creditCosts: Object.assign({}, s.creditCosts) };
    try {
      qa('[data-set]').forEach(el => { const v = Number(el.value); if (el.dataset.set.startsWith('cc.')) out.creditCosts[el.dataset.set.slice(3)] = v; else out[el.dataset.set] = v; });
      qa('[data-text]').forEach(el => out[el.dataset.text] = el.value.trim());
      qa('[data-json]').forEach(el => { try { out[el.dataset.json] = JSON.parse(el.value); } catch (e) { throw new Error('Invalid JSON in ' + el.dataset.json); } });
      await api('admin.settingsSave', { settings: out }); S.plansCfg = await api('billing.plans'); toast('Settings saved.'); adminSettings();
    } catch (e) { fail(e); }
  };
}
async function adminDemo() {
  const demo = await api('demo.get');
  const canPublish = S.pid && S.project && !S.project.isDemo;
  $('adminBody').innerHTML = `<div class="two"><div class="card"><h2>Live sample project</h2><p>The sample is persistent and admin-controlled: every visitor and user sees the same project, read-only, until you change it here. Admins can edit it directly.</p>
    <div class="kv"><span>Name</span><b>${esc(demo.project.name)}</b><span>Last updated</span><b>${when(demo.project.updatedAt)}</b><span>Proposed</span><b>${Number(demo.data.area || 0).toLocaleString()} sq ft · ${esc(demo.data.design || '')}</b></div>
    <div class="flex mt"><button class="btn" id="dmOpen">Open &amp; edit sample</button><button class="btn secondary" id="dmReset">Reset to built-in sample</button></div></div>
  <div class="card"><h2>Publish a showcase</h2><p>Copy the currently open project (including its data) to become the public sample. The original project is not changed. Files and renders are not copied.</p>
    <label>Showcase name<input id="dmName" value="${canPublish ? esc('Showcase: ' + S.project.name) : ''}" ${canPublish ? '' : 'disabled'}/></label><button class="btn" id="dmPub" ${canPublish ? '' : 'disabled'}>Publish open project as sample</button>${canPublish ? '' : '<p class="small">Open one of your projects first.</p>'}</div></div>`;
  $('dmOpen').onclick = async () => { await openProject(demo.project.id).catch(fail); tab('overview'); };
  $('dmReset').onclick = async () => { if (!(await modal('Reset the sample?', '<p>All edits to the public sample project are replaced with the built-in fictional sample.</p>', 'Reset'))) return; try { await api('admin.demo', { op: 'reset' }); toast('Sample reset.'); adminDemo(); } catch (e) { fail(e); } };
  $('dmPub').onclick = async () => { try { await api('admin.demo', { op: 'publish', projectId: S.pid, name: $('dmName').value }); toast('Published as the public sample.'); loadProjects(); adminDemo(); } catch (e) { fail(e); } };
}
async function adminAudit() {
  const d = await api('admin.audit');
  $('adminBody').innerHTML = `<div class="card"><h2>Exports (CSV)</h2><div class="flex">${['users', 'payments', 'aijobs', 'credits'].map(t => `<button class="btn sm secondary" data-exp="${t}">${t}</button>`).join('')}</div></div>
  <div class="card section"><h2>Audit log (latest 300)</h2>${table(['When', 'Actor', 'Action', 'Detail'], d.audit.map(a => [when(a.at), esc(a.actor), esc(a.action), `<span class="small">${esc(String(a.detail).slice(0, 160))}</span>`]))}</div>`;
  qa('[data-exp]').forEach(b => b.onclick = async () => { try { const r = await api('admin.export', { table: b.dataset.exp }); downloadBlob(r.filename, new Blob([r.csv], { type: 'text/csv;charset=utf-8' })); } catch (e) { fail(e); } });
}

/* ------------------------------------------------------------------ public pricing */
function renderPublicPlans() {
  const pl = S.plansCfg; if (!pl) return;
  $('publicPlans').innerHTML = ['free', 'homeowner', 'builder', 'enterprise'].map(k => { const c = pl.plans[k]; return `<div class="card ${k === 'builder' ? 'featured' : ''}"><h2>${esc(c.name)}</h2><div class="metric">${c.priceUsd === null ? 'Custom' : c.priceUsd === 0 ? 'Free' : fmt(c.priceUsd)}<span class="small">${c.interval === 'month' ? ' / month' : c.interval === 'one_time' ? ' per project' : ''}</span></div><ul>${(c.features || []).map(f => '<li>' + esc(f) + '</li>').join('')}</ul></div>`; }).join('');
  $('publicPacks').innerHTML = '<p class="small center">AI credit packs: ' + pl.creditPacks.map(p => p.credits + ' for ' + fmt(p.priceUsd)).join(' · ') + '. A standard AI render uses ' + creditCost('render_standard') + ' credits.</p>';
}

/* ------------------------------------------------------------------ guest demo */
async function startGuest() {
  S.guest = true; S.user = null; S.role = 'viewer';
  try { await enterApp({}); } catch (e) { fail(e); S.guest = false; showAuth('login'); }
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); tab(g.dataset.go); } });
  qa('.nav').forEach(b => b.onclick = () => tab(b.dataset.tab));
  $('menuToggle').onclick = () => $('menu').classList.toggle('open');
  qa('#authTabs button').forEach(b => b.onclick = () => setAuthMode(b.dataset.mode));
  qa('[data-auth]').forEach(a => a.onclick = e => { e.preventDefault(); setAuthMode(a.dataset.auth); });
  $('toForgot').onclick = e => { e.preventDefault(); setAuthMode('forgot'); };
  $('toPricing').onclick = e => { e.preventDefault(); $('pricing').scrollIntoView({ behavior: 'smooth' }); };
  const formSubmit = (id, fn) => $(id).onsubmit = async e => { e.preventDefault(); const btn = e.target.querySelector('button[type=submit],button:not([type])'); busy(btn, true); $('authMsg').textContent = ''; try { await fn(Object.fromEntries(new FormData(e.target))); } catch (er) { $('authMsg').textContent = er.message; } finally { busy(btn, false); } };
  formSubmit('loginForm', async v => afterAuth(await api('login', Object.assign(v, { inviteToken: S.inviteToken || undefined }))));
  formSubmit('signupForm', async v => { const d = await api('signup', Object.assign(v, { inviteToken: S.inviteToken || undefined })); toast('Welcome! Check your inbox to verify your email.'); await afterAuth(d); });
  formSubmit('forgotForm', async v => { await api('forgotPassword', v); $('authMsg').textContent = 'If an account exists for that email, a reset link is on its way.'; });
  formSubmit('resetForm', async v => { const d = await api('resetPassword', { resetToken: S.resetToken, password: v.password }); toast('Password updated.'); await afterAuth(d); });
  $('exploreDemo').onclick = startGuest; $('guestSignup').onclick = () => showAuth('signup'); $('heroSignup').onclick = () => { setAuthMode('signup'); $('signupForm').querySelector('input').focus(); };
  $('userBtn').onclick = () => S.guest ? showAuth('signup') : tab('account');
  $('creditBadge').onclick = () => tab('billing');
  $('projectSwitch').onchange = async e => { const v = e.target.value; if (v === '__new') { renderSwitcher(); return newProject(false); } if (!v) return; try { await openProject(v); tab(PROJECT_TABS.has(S.current) ? S.current : 'overview'); } catch (er) { fail(er); renderSwitcher(); } };
  $('newProject').onclick = () => newProject(false); $('copyDemo').onclick = () => newProject(true);
  $('openDemo').onclick = async () => { try { await openDemo(); tab('overview'); } catch (e) { fail(e); } };
  $('lookup').onclick = lookup; $('address').addEventListener('keydown', e => { if (e.key === 'Enter') lookup(); });
  $('projName').onchange = () => { if (S.canEdit && $('projName').value.trim()) saveNow({ name: $('projName').value.trim() }); };
  $('uploads').onchange = e => uploadFiles([...e.target.files]);
  $('refreshFootprints').onclick = findFootprints;
  $('toggleImagery').onclick = () => { ensureAerial(); if (showSatellite) { aerialMap.removeLayer(imageryLayer); streetLayer.addTo(aerialMap); } else { aerialMap.removeLayer(streetLayer); imageryLayer.addTo(aerialMap); } showSatellite = !showSatellite; };
  $('exportEvidence').onclick = () => downloadJSON('intellibuild-property-evidence.json', { property: currentProperty(), mappedBuildingsWithin100m: S.P.intel.buildingCount, retrievedAt: S.P.intel.lastChecked, county: S.P.county, disclaimer: 'Geocoding and nearby map features do not verify parcel boundaries, zoning, building attributes or construction feasibility.' });
  $('generateBrief').onclick = () => setBrief(templateBrief()); $('aiBrief').onclick = aiBrief;
  $('copyBrief').onclick = () => { if (!$('conceptBrief').value) setBrief(templateBrief()); navigator.clipboard?.writeText($('conceptBrief').value).then(() => toast('Brief copied.')).catch(() => { $('conceptBrief').select(); document.execCommand('copy'); }); };
  $('lookupCounty').onclick = lookupCounty; $('useCounty').onclick = applyCounty;
  $('exportCounty').onclick = () => S.P.county ? downloadJSON('intellibuild-county-evidence.json', Object.assign({}, S.P.county, { disclaimer: 'Public assessor records are not a survey, zoning determination, engineering review, or permit approval.' })) : toast('No official records to export.', { err: true });
  $('aiPhoto').onchange = aiPickPhoto; $('aiGenerate').onclick = aiGenerate; $('aiQuality').onchange = refreshCreditCostLabels; $('aiBuy').onclick = () => tab('billing');
  $('aiToDesign').onclick = () => { const st = S.P.aiStyle, m = STYLES.find(s => s[0].toLowerCase().includes(st.split(' ')[0]) || st.includes(s[0].toLowerCase())); if (m) S.P.design = m[0]; S.P.priorities = ((S.P.priorities || '') + '\nVisual concept preference: ' + st + ', ' + S.P.aiFinish + ' finishes. ' + (S.P.aiNotes || '')).trim(); fillAll(); markDirty(); tab('design'); };
  $('takeCalc').onclick = () => { takeCalc(true); renderTake(); }; $('takeCSV').onclick = takeCSV;
  $('takeSync').onclick = () => { $('takeArea').value = S.P.area; $('takeStories').value = String(S.P.stories); takeCalc(true); renderTake(); };
  $('conceptPhoto').onchange = () => { const f = $('conceptPhoto').files[0]; if (!f) return; if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast('Choose a JPG, PNG or WebP image.', { err: true }); const url = URL.createObjectURL(f), im = new Image(); im.onload = () => { conceptImage = im; URL.revokeObjectURL(url); drawConcept(); }; im.src = url; };
  $('clearConcept').onclick = () => { conceptImage = null; $('conceptPhoto').value = ''; drawConcept(); };
  $('saveConcept').onclick = () => { const a = document.createElement('a'); a.href = $('conceptCanvas').toDataURL('image/png'); a.download = 'intellibuild-concept-overlay.png'; a.click(); };
  ['conceptStyle', 'conceptOpacity', 'conceptWidth', 'conceptHeight'].forEach(id => $(id).addEventListener('input', () => { drawConcept(); if (S.canEdit) markDirty(); }));
  $('conceptToBrief').onclick = () => { S.P.priorities = ((S.P.priorities || '') + '\nConcept lab style: ' + $('conceptStyle').selectedOptions[0].text + '; illustration only; needs professional review.').trim(); fillAll(); markDirty(); tab('intelligence'); toast('Concept preference added to the brief inputs.'); };
  $('exportProject').onclick = () => downloadJSON('IntelliBuild_' + (S.project ? S.project.name.replace(/\W+/g, '_') : 'project') + '.json', { app: 'IntelliBuild AI ' + VERSION, project: S.project && S.project.name, data: S.P, disclaimer: 'Preliminary planning data, not a verified estimate' });
  $('printFeas').onclick = () => { if (!requirePro('The feasibility report')) return; renderFeas(); document.body.classList.add('print-feas'); window.print(); setTimeout(() => document.body.classList.remove('print-feas'), 600); };
  $('exportFeas').onclick = () => { if (!requirePro('Feasibility export')) return; downloadJSON('intellibuild-feasibility.json', { property: currentProperty(), design: { style: S.P.design, area: S.P.area, budget: S.P.budget }, county: S.P.county, disclaimer: 'Preliminary planning only; no zoning or engineering certification.' }); };
  $('addBid').onclick = submitBid; $('cancelBidEdit').onclick = clearBidForm;
  $('sendInvite').onclick = async () => {
    const emails = [...new Set($('invEmail').value.split(/[\s,;]+/).map(x => x.trim()).filter(x => x.includes('@')))];
    if (!emails.length) return toast('Enter at least one email address.', { err: true });
    const b = $('sendInvite'); busy(b, true, 'Sending ' + emails.length + '…'); const out = [];
    for (const em of emails) { try { const r = await api('members.invite', { projectId: S.pid, email: em, role: $('invRole').value }); out.push(`✓ ${esc(em)} — ${r.emailed ? 'emailed' : 'email failed, share the link'} · <a class="link" href="${esc(r.inviteLink)}" title="Copy and share by text if needed">invite link</a>`); } catch (e) { out.push(`✗ ${esc(em)} — ${esc(e.message)}`); if (e.code === 'upgrade') break; } }
    $('inviteResult').innerHTML = out.join('<br/>'); $('invEmail').value = ''; busy(b, false); loadTeam();
  };
  $('addTask').onclick = async () => { try { await api('tasks.save', { projectId: S.pid, title: $('taskTitle').value, assigneeId: $('taskAssignee').value, due: $('taskDue').value }); $('taskTitle').value = ''; $('taskDue').value = ''; loadTasks(); loadActivity(); } catch (e) { fail(e); } };
  $('sendMsg').onclick = async () => { const t = $('msgText').value.trim(); if (!t) return; try { await api('comments.add', { projectId: S.pid, text: t }); $('msgText').value = ''; loadThread(); } catch (e) { fail(e); } };
  $('msgText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('sendMsg').click(); });
  $('fileFilter').onchange = renderFileGrid;
  $('openPortal').onclick = openPortal;
  $('profileForm').onsubmit = async e => { e.preventDefault(); try { const r = await api('updateProfile', Object.fromEntries(new FormData(e.target))); S.user = r.user; renderUserChrome(); toast('Profile saved.'); } catch (er) { fail(er); } };
  $('passwordForm').onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); try { const r = await api('updateProfile', Object.assign({ name: S.user.name, company: S.user.company, phone: S.user.phone }, v)); S.user = r.user; e.target.reset(); toast('Password changed.'); } catch (er) { fail(er); } };
  $('logoutBtn').onclick = async () => { await saveNow(); try { await api('logout'); } catch (e) { } signOutLocal(); };
  qa('#adminTabs button').forEach(b => b.onclick = () => loadAdmin(b.dataset.a));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').classList.contains('hidden')) $('modalCancel').click(); });
}

