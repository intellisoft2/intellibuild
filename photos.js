/* =====================================================================
 * IntelliBuild AI — real photos
 *   1. Existing home from public sources: county aerial (Fairfax 3-inch
 *      orthophoto, Esri elsewhere) and street-level (Mapillary), saved to
 *      the project via the server, plus project photos reused in AI studio.
 *   2. "Real homes in this style" for Design Studio: openly licensed photos
 *      from Wikimedia Commons (Openverse as a fallback), shown with their
 *      author and licence and savable to the project as inspiration.
 * ===================================================================== */

/* ------------------------------------------------------------ existing home */
function icareUrl() {
  const pin = (S.P.county && S.P.county.pin) || S.P.parcelInput || '';
  return pin ? 'https://icare.fairfaxcounty.gov/ffxcare/Datalets/Datalet.aspx?mode=profileall&UseSearch=no&jur=000&pin=' + encodeURIComponent(pin) : 'https://icare.fairfaxcounty.gov/ffxcare/Main/Home.aspx';
}
function renderPhotoLinks() {
  qa('.icare-link').forEach(a => a.href = icareUrl());
  const has = S.P.lat != null && S.P.lon != null;
  qa('[data-getphoto]').forEach(b => { b.disabled = !has || !S.canEdit; b.title = has ? '' : 'Locate the property on Overview first'; });
  // Street-level needs a Mapillary token: hide for users, show a setup hint to admins.
  const street = !S.plansCfg || S.plansCfg.streetPhotos !== false, admin = !!(S.user && S.user.isAdmin);
  qa('[data-getphoto=street],[data-aiget=street]').forEach(b => { b.classList.toggle('hidden', !street && !admin); if (!street && admin) b.title = 'Admin: add a free Mapillary token under Admin → Platform keys to enable'; });
}
async function getPublicPhoto(kind, btn) {
  if (S.P.lat == null) return toast('Locate the property on Overview first.', { err: true });
  if (btn) busy(btn, true, kind === 'street' ? 'Searching street photos…' : 'Fetching aerial photo…');
  try {
    const r = await api('property.photo', { projectId: S.pid, lat: S.P.lat, lon: S.P.lon, kind }, kind === 'street' ? 'Finding a street-level photo of the home…' : 'Fetching the county aerial photo…', { timeoutMs: 60000 });
    S.fileCache[r.file.id] = Promise.resolve('data:' + r.mime + ';base64,' + r.b64);
    S.files.unshift(r.file); if (typeof renderThumbs === 'function') renderThumbs(); if (window.renderJourney) renderJourney();
    toast('Saved: ' + r.meta.source + (r.meta.capturedAt ? ' (taken ' + r.meta.capturedAt + ')' : '') + '. ' + r.meta.attribution);
    ibLog('info', 'photos', 'Saved ' + kind + ' photo from ' + r.meta.source);
    return r;
  } catch (e) { fail(e); throw e; } finally { if (btn) busy(btn, false); }
}

/* AI studio: use a photo already in the project, or fetch one */
function useAiPhoto(fileId, dataUrl, name) {
  const [head, b64] = dataUrl.split(','), mime = (/data:([^;]+)/.exec(head) || [, 'image/jpeg'])[1];
  aiPhoto = { b64, mime, dataUrl, name: name || 'existing-home.jpg' }; aiPhotoFileId = fileId;
  $('aiOriginal').src = dataUrl; $('aiOriginal').classList.remove('hidden');
  const f = S.files.find(x => x.id === fileId), aerial = f && /aerial/.test(f.name);
  $('aiStatus').textContent = 'Photo ready' + (aerial ? ' — note: an aerial (top-down) photo gives a roof-plan style concept; a street-level photo gives the best result' : '') + '. Choose a style and generate.';
}
function renderAiPhotoPicker() {
  const box = $('aiPhotoPick'); if (!box) return;
  const imgs = S.files.filter(f => (f.kind === 'photo' || f.kind === 'inspiration') && /^image/.test(f.mime)).slice(0, 12);
  box.innerHTML = imgs.length ? `<p class="small">Or pick a photo already in this project:</p><div class="pickgrid">${imgs.map(f => `<button class="pick" data-pickphoto="${f.id}" title="${esc(f.name)}"><img data-fid="${f.id}" alt="${esc(f.name)}"/><span>${esc(f.kind === 'inspiration' ? 'inspiration' : /aerial/.test(f.name) ? 'aerial' : /street/.test(f.name) ? 'street' : 'photo')}</span></button>`).join('')}</div>` : '';
  hydrateImages(box);
  qa('[data-pickphoto]', box).forEach(b => b.onclick = async () => {
    qa('.pick', box).forEach(x => x.classList.remove('on')); b.classList.add('on');
    try { useAiPhoto(b.dataset.pickphoto, await fileSrc(b.dataset.pickphoto), (S.files.find(f => f.id === b.dataset.pickphoto) || {}).name); } catch (e) { fail(e); }
  });
}
async function aiFetchPhoto(kind, btn) {
  try { const r = await getPublicPhoto(kind, btn); useAiPhoto(r.file.id, 'data:' + r.mime + ';base64,' + r.b64, r.file.name); renderAiPhotoPicker(); } catch (e) { }
}

/* ------------------------------------------------------------ real homes in a style */
const STYLE_QUERIES = {
  'Modern Farmhouse': ['modern farmhouse exterior', 'farmhouse style new house', 'board and batten house white'],
  'Contemporary': ['contemporary house exterior', 'modern house architecture residence', 'modernist single-family house'],
  'Colonial Revival': ['Colonial Revival house', 'Georgian Revival house brick', 'colonial house Virginia'],
  'Craftsman': ['Craftsman bungalow house', 'American Craftsman house porch', 'craftsman style house'],
  'Transitional': ['new suburban house exterior', 'single-family house stone siding', 'new home construction exterior'],
  'Mediterranean': ['Mediterranean Revival house', 'Spanish Colonial Revival house', 'stucco house tile roof']
};
const INSPO = { style: '', q: 0, offset: 0, items: [], seen: new Set(), loading: false };
const stripHtml = s => { const d = document.createElement('div'); d.innerHTML = String(s || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
const BAD = /interior|kitchen|bathroom|floor ?plan|plan of|map|diagram|drawing|sketch|logo|postcard|stamp|painting|furniture|room|aerial|satellite|construction site|ruin|church|museum|\.svg$|\.tif/i;

async function commonsSearch(q, offset) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=30&gsroffset=' + offset +
    '&gsrsearch=' + encodeURIComponent(q + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=640&iiextmetadatafilter=LicenseShortName|Artist|ObjectName|LicenseUrl';
  const j = await (await fetch(u, { ibLabel: 'Finding real homes in this style…' })).json();
  return Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index).map(p => {
    const ii = (p.imageinfo || [])[0] || {}, m = ii.extmetadata || {};
    return { id: 'c' + p.pageid, title: stripHtml((m.ObjectName && m.ObjectName.value) || p.title.replace(/^File:|\.\w+$/g, '')), thumb: ii.thumburl, big: ii.thumburl && ii.thumburl.replace(/\/\d+px-/, '/1280px-'),
      w: ii.width, h: ii.height, author: stripHtml(m.Artist && m.Artist.value) || 'Unknown', license: (m.LicenseShortName && m.LicenseShortName.value) || '', link: ii.descriptionurl, source: 'Wikimedia Commons', fname: p.title };
  }).filter(x => x.thumb && x.w >= 900 && x.w > x.h * 1.05 && !BAD.test(x.fname + ' ' + x.title) && !/^(fair use|non-free)/i.test(x.license));
}
async function openverseSearch(q, page) {
  const j = await (await fetch('https://api.openverse.org/v1/images/?page_size=20&category=photograph&aspect_ratio=wide&page=' + page + '&q=' + encodeURIComponent(q), { ibLabel: 'Finding real homes in this style…' })).json();
  return (j.results || []).filter(r => !BAD.test(r.title || '')).map(r => ({ id: 'o' + r.id, title: r.title || 'Untitled', thumb: r.thumbnail, big: r.url, w: r.width, h: r.height, author: r.creator || 'Unknown',
    license: ('CC ' + String(r.license || '').toUpperCase() + ' ' + (r.license_version || '')).replace('CC CC0', 'CC0').replace('CC PDM', 'Public domain').trim(), link: r.foreign_landing_url, source: 'Openverse / ' + (r.source || 'web') }));
}
async function loadInspiration(reset) {
  const grid = $('inspoGrid'); if (!grid || INSPO.loading) return;
  const style = S.P.design || 'Modern Farmhouse', qs = STYLE_QUERIES[style] || [style + ' house exterior'];
  if (reset || INSPO.style !== style) Object.assign(INSPO, { style, q: 0, offset: 0, items: [], seen: new Set() });
  $('inspoStyle').textContent = style;
  INSPO.loading = true; busy($('inspoMore'), true, 'Loading…');
  if (!INSPO.items.length) grid.innerHTML = '<p class="small">Finding photos of real ' + esc(style) + ' homes…</p>';
  let added = 0, tries = 0;
  try {
    while (added < 8 && tries < 4 && INSPO.q < qs.length * 3) {
      tries++; const q = qs[INSPO.q % qs.length]; let got = [];
      try { got = await commonsSearch(q, INSPO.offset); } catch (e) { ibLog('warn', 'photos', 'Wikimedia Commons unavailable: ' + e.message); }
      if (got.length < 3) { try { got = got.concat(await openverseSearch(q, 1 + Math.floor(INSPO.offset / 30))); } catch (e) { ibLog('warn', 'photos', 'Openverse unavailable: ' + e.message); } }
      INSPO.q++; if (INSPO.q % qs.length === 0) INSPO.offset += 30;
      got.forEach(x => { if (!INSPO.seen.has(x.id) && added < 12) { INSPO.seen.add(x.id); INSPO.items.push(x); added++; } });
    }
  } finally { INSPO.loading = false; busy($('inspoMore'), false); }
  if (INSPO.style !== style) return;
  renderInspiration();
  if (!INSPO.items.length) grid.innerHTML = '<p class="small">No photos found right now — try again later, or upload your own inspiration on Existing Property.</p>';
}
function renderInspiration() {
  const grid = $('inspoGrid');
  grid.innerHTML = INSPO.items.map((x, i) => `<figure class="inspo-item"><a href="${esc(x.link)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(x.thumb)}" alt="${esc(x.title)}"/></a>
    <figcaption><b title="${esc(x.title)}">${esc(x.title.slice(0, 70))}</b><span class="small">© ${esc(x.author.slice(0, 60))} · ${esc(x.license || 'see source')} · ${esc(x.source)}</span>
    <span class="flex"><button class="btn sm secondary edit-only" data-insave="${i}">Save to project</button><button class="btn sm secondary edit-only" data-inai="${i}">Use in AI brief</button></span></figcaption></figure>`).join('');
  qa('[data-insave]', grid).forEach(b => b.onclick = () => saveInspiration(INSPO.items[+b.dataset.insave], b));
  qa('[data-inai]', grid).forEach(b => b.onclick = () => {
    const x = INSPO.items[+b.dataset.inai], map = { 'Modern Farmhouse': 'modern farmhouse', 'Contemporary': 'contemporary', 'Colonial Revival': 'traditional colonial', 'Craftsman': 'craftsman', 'Transitional': 'transitional', 'Mediterranean': 'mediterranean' };
    S.P.aiStyle = map[INSPO.style] || S.P.aiStyle;
    S.P.aiNotes = ((S.P.aiNotes || '').trim() + (S.P.aiNotes ? '\n' : '') + 'Take design cues (massing, materials, porch and window style) from the reference home: "' + x.title + '".').slice(0, 1500);
    markDirty(); if (typeof fillAll === 'function') fillAll(); toast('Added to your AI Visual Studio brief.', { action: 'Open AI Studio', onAction: () => tab('visualai') });
  });
}
async function saveInspiration(x, btn) {
  busy(btn, true, 'Saving…');
  try {
    const blob = await (await fetch(x.big || x.thumb, { ibLabel: 'Saving inspiration photo…' })).blob();
    const file = new File([blob], 'x', { type: blob.type || 'image/jpeg' });
    const r = await resizeImage(file, 1600);
    const name = ('inspiration-' + INSPO.style + '-' + x.title).replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 80) + '.jpg';
    const d = await api('files.upload', { projectId: S.pid, name, mime: r.mime, b64: r.b64, kind: 'inspiration', meta: { source: x.source, attribution: '© ' + x.author + ' · ' + x.license, link: x.link, license: x.license, style: INSPO.style } }, 'Saving inspiration photo…');
    S.files.unshift(d.file); btn.textContent = '✓ Saved'; btn.disabled = true; renderAiPhotoPicker();
  } catch (e) { busy(btn, false); fail(e); }
}

/* ------------------------------------------------------------ wiring */
function wirePhotos() {
  qa('[data-getphoto]').forEach(b => b.onclick = () => getPublicPhoto(b.dataset.getphoto, b).catch(() => { }));
  qa('[data-aiget]').forEach(b => b.onclick = () => aiFetchPhoto(b.dataset.aiget, b));
  if ($('inspoMore')) $('inspoMore').onclick = () => loadInspiration(false);
  // Keep pieces fresh when the project, files or style change.
  const _rd = renderDesigns; renderDesigns = function () { _rd.apply(this, arguments); if (S.current === 'design' && INSPO.style !== (S.P.design || 'Modern Farmhouse')) loadInspiration(true); };
  const _tab = tab; tab = function (name) { const r = _tab.apply(this, arguments); if (name === 'design') loadInspiration(false); if (name === 'visualai') renderAiPhotoPicker(); if (name === 'property') renderPhotoLinks(); return r; };
  const _rt = renderThumbs; renderThumbs = function () { _rt.apply(this, arguments); renderPhotoLinks(); renderAiPhotoPicker(); };
}
