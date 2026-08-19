/* bosses-view.js — renderiza a aba Bosses a partir de window.BOSSES (bosses.js). */
(function () {
'use strict';
const B = window.BOSSES || [];
const byId = {}; B.forEach(b => byId[b.id] = b);
const grid = document.getElementById('bosses-grid');
const search = document.getElementById('boss-search');
const sortSel = document.getElementById('boss-sort');
const favToggle = document.getElementById('boss-favs');
const suggestBtn = document.getElementById('boss-suggest');
const favLabel = document.getElementById('favs-label');
const countEl = document.getElementById('boss-count');
if (!grid) return;

const ELEMENTS = ['physical','energy','earth','fire','ice','holy','death'];

/* favoritos */
const FAV_KEY = 'idlezada.bossFavs.v1', FAV_MAX = 40;
const SUGGESTED = ["bakragore","goshnars_cruelty","goshnars_greed","goshnars_hatred","goshnars_malice",
  "goshnars_spite","murcion","chagorz","ichgahal","vemiath","the_monster","court_warlock","the_primal_menace",
  "magma_bubble","king_zelos","urmahlullu_the_immaculate","the_brainstealer","the_unwelcome","ratmiral",
  "vladrukh","timira_the_many_headed","lord_retro","dragon_pack","brokul","scarlett","megasylvan_yselda",
  "drume","oberon","the_dread_maiden","tarbaz","duke_krule","outburst","foreshock","brain_head",
  "irgix_the_flimsy","unaz_the_mean","leiden","arbaziloth","alptramun","the_last_lore_keeper"];
let favs = loadJSON(FAV_KEY, a => new Set(Array.isArray(a) ? a : []), () => new Set());
const saveFavs = () => saveJSON(FAV_KEY, [...favs]);

/* overrides de elementos (edição manual) -> { [bossId]: [el, ...] } */
const OVR_KEY = 'idlezada.bossElemOverrides.v1';
let overrides = loadJSON(OVR_KEY, o => (o && typeof o === 'object') ? o : {}, () => ({}));
const saveOvr = () => saveJSON(OVR_KEY, overrides);

/* estado do editor inline */
let editingId = null, editSel = [];

function loadJSON(key, ok, fallback){ try { return ok(JSON.parse(localStorage.getItem(key))); } catch (e) { return fallback(); } }
function saveJSON(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

const nf = n => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// elementos efetivos: override manual (se existir) tem prioridade sobre o scraped
function effEls(b){
  const o = overrides[b.id];
  if (o && o.length) return o.map(el => ({ el, pct: null }));
  return b.elements || [];
}

function sortList(list, mode){
  const by = {
    'hp-desc': (a,b)=> b.hpReal - a.hpReal,
    'hp-asc':  (a,b)=> a.hpReal - b.hpReal,
    'level':   (a,b)=> (a.minLevel ?? 1e9) - (b.minLevel ?? 1e9) || a.name.localeCompare(b.name),
    'name':    (a,b)=> a.name.localeCompare(b.name),
  }[mode] || ((a,b)=> a.name.localeCompare(b.name));
  return list.sort(by);
}

function imgHtml(b){
  if (b.imgKind === 'outfit') return `<div class="sprite" style="background-image:url('${b.img}')"></div>`;
  if (b.imgKind === 'object') return `<img class="obj-img" loading="lazy" src="${b.img}" alt="${esc(b.name)}"
    onerror="this.closest('.boss-img').classList.add('noimg');this.remove()">`;
  return '';
}

function elsHtml(b){
  const els = effEls(b).slice(0, 3);
  const badges = els.map(e =>
    `<span class="el el-${esc(e.el)}">${esc(e.el)}${e.pct != null ? ` <b>${e.pct}%</b>` : ''}</span>`).join('');
  return `<div class="boss-els">${badges || '<span class="el-empty">no elements</span>'}</div>`;
}

function editorHtml(b){
  const chips = ELEMENTS.map(el => {
    const idx = editSel.indexOf(el);
    return `<span class="el-pick el-${el}${idx >= 0 ? ' sel' : ''}" data-el="${el}">${el}${idx >= 0 ? ` <b>${idx + 1}</b>` : ''}</span>`;
  }).join('');
  return `<div class="boss-editor">
    <div class="ed-hint">pick up to 3 (click order = priority)</div>
    <div class="ed-chips">${chips}</div>
    <div class="ed-actions">
      <button class="edit-save gold" data-id="${esc(b.id)}">Save</button>
      <button class="edit-reset" data-id="${esc(b.id)}">Default</button>
      <button class="edit-cancel">Cancel</button>
    </div>
  </div>`;
}

function card(b){
  const group = b.kind === 'group';
  const noimg = b.imgKind === 'none' ? ' noimg' : '';
  const fav = favs.has(b.id);
  const edited = !!(overrides[b.id] && overrides[b.id].length);
  return `<div class="boss">
    <div class="boss-img${noimg}">
      ${imgHtml(b)}
      <div class="boss-tools">
        <button class="boss-edit${edited ? ' on' : ''}" data-edit="${esc(b.id)}" title="Edit elements" aria-label="Edit elements">✎</button>
        <button class="fav${fav ? ' on' : ''}" data-fav="${esc(b.id)}" title="Favorite" aria-label="Favorite">★</button>
      </div>
    </div>
    <div class="boss-body">
      <div class="boss-name">${esc(b.name)}</div>
      <div class="boss-badges">
        <span class="rb rb-${esc(b.rarity)}">${esc(b.rarity)}</span>
        ${group ? '<span class="rb rb-group">group</span>' : ''}
      </div>
      <div class="boss-stats">
        <div class="bs"><span>HP real</span><b>${nf(b.hpReal)}</b></div>
        <div class="bs"><span>Level</span><b>${b.minLevel ?? '—'}</b></div>
        <div class="bs"><span>XP</span><b>${nf(b.expReal ?? b.exp)}</b></div>
      </div>
      ${editingId === b.id ? editorHtml(b) : elsHtml(b)}
    </div>
  </div>`;
}

function updateFavLabel(){ if (favLabel) favLabel.textContent = `★ Favorites (${favs.size}/${FAV_MAX})`; }
let flashT = null;
function flashLimit(){
  if (!favLabel) return;
  clearTimeout(flashT);
  favLabel.textContent = `★ max ${FAV_MAX} reached`;
  favLabel.parentElement.classList.add('limit');
  flashT = setTimeout(() => { favLabel.parentElement.classList.remove('limit'); updateFavLabel(); }, 1500);
}

function render(){
  const q = (search.value || '').trim().toLowerCase();
  let list = B.filter(b => !q || b.name.toLowerCase().includes(q) || (b.rarity||'').includes(q)
    || effEls(b).some(e => e.el.includes(q)));
  if (favToggle && favToggle.checked) list = list.filter(b => favs.has(b.id));
  list = sortList(list, sortSel.value);
  countEl.textContent = `${list.length} boss${list.length !== 1 ? 'es' : ''}`;
  grid.innerHTML = list.length ? list.map(card).join('') : '<div class="note">no bosses found</div>';
  updateFavLabel();
}

/* interações (delegação) */
grid.addEventListener('click', e => {
  const fav = e.target.closest('.fav');
  const edit = e.target.closest('.boss-edit');
  const pick = e.target.closest('.el-pick');
  const save = e.target.closest('.edit-save');
  const reset = e.target.closest('.edit-reset');
  const cancel = e.target.closest('.edit-cancel');

  if (fav) {
    const id = fav.dataset.fav;
    if (favs.has(id)) favs.delete(id);
    else { if (favs.size >= FAV_MAX) return flashLimit(); favs.add(id); }
    saveFavs();
    if (favToggle && favToggle.checked) render();
    else { fav.classList.toggle('on', favs.has(id)); updateFavLabel(); }
    return;
  }
  if (edit) { editingId = edit.dataset.edit; editSel = effEls(byId[editingId]).map(x => x.el).slice(0, 3); render(); return; }
  if (pick) {
    const el = pick.dataset.el, i = editSel.indexOf(el);
    if (i >= 0) editSel.splice(i, 1);
    else if (editSel.length < 3) editSel.push(el);
    render(); return;
  }
  if (save) { overrides[save.dataset.id] = editSel.slice(0, 3); saveOvr(); editingId = null; render(); return; }
  if (reset) { delete overrides[reset.dataset.id]; saveOvr(); editingId = null; render(); return; }
  if (cancel) { editingId = null; render(); return; }
});

if (suggestBtn) suggestBtn.addEventListener('click', () => {
  const valid = new Set(B.map(b => b.id));
  favs = new Set(SUGGESTED.filter(id => valid.has(id)).slice(0, FAV_MAX));
  saveFavs();
  if (favToggle) favToggle.checked = true;
  render();
});
search.addEventListener('input', render);
sortSel.addEventListener('change', render);
if (favToggle) favToggle.addEventListener('change', render);
render();
})();
