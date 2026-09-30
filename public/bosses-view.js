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

/* LOOT: a tabela de drop de cada boss vem do bundle (LOOT.b, via hunt-model).
   Opcional -- sem loot.js/hunt-model.js a aba continua funcionando sem ela. */
const HM = window.HuntModel, LOOT = window.LOOT;
const hasLoot = !!(HM && HM.bossLoot && LOOT && LOOT.b);
const lootCache = {};
const lootOf = b => hasLoot ? (lootCache[b.id] = lootCache[b.id] || HM.bossLoot(b.id, LOOT)) : { items: [], gold: 0 };
const openLoot = new Set();
const pctChance = c => { const v = c / 1000; return (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3)) + '%'; };

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
/* numero curto pro card (o exato fica no title): 4.5M le mais rapido que 4,500,000 */
const short = n => {
  if (n == null) return '—';
  const a = Math.abs(n);
  const f = (x, u) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10) + u;
  return a >= 1e9 ? f(n / 1e9, 'B') : a >= 1e6 ? f(n / 1e6, 'M') : a >= 1e4 ? f(n / 1e3, 'k') : nf(n);
};
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
    'loot':    (a,b)=> lootOf(b).gold - lootOf(a).gold || a.name.localeCompare(b.name),
  }[mode] || ((a,b)=> a.name.localeCompare(b.name));
  return list.sort(by);
}

function imgHtml(b){
  if (b.imgKind === 'outfit') return `<div class="sprite" style="background-image:url('${b.img}')"></div>`;
  if (b.imgKind === 'object') return `<img class="obj-img" loading="lazy" src="${b.img}" alt="${esc(b.name)}"
    onerror="this.closest('.boss-img').classList.add('noimg');this.remove()">`;
  return '';
}

/* o dano do boss como UMA barra: a largura de cada fatia e' a fatia do dano. Os
   chips embaixo repetem os tres maiores com o numero, que e' o que se le. Override
   manual nao tem %: vira fatias iguais, na ordem de prioridade escolhida. */
function elsHtml(b){
  const all = effEls(b);
  if (!all.length) return `<div class="boss-els"><span class="el-empty">no elements</span></div>`;
  const manual = all.every(e => e.pct == null);
  const segs = all.map(e => {
    const w = manual ? 100 / all.length : e.pct;
    return `<i class="dseg es-${esc(e.el)}" style="flex-basis:${w}%" title="${esc(e.el)}${e.pct != null ? ' ' + e.pct + '%' : ''}"></i>`;
  }).join('');
  const badges = all.slice(0, 3).map(e =>
    `<span class="el el-${esc(e.el)}">${esc(e.el)}${e.pct != null ? ` <b>${e.pct}%</b>` : ''}</span>`).join('');
  return `<div class="boss-els">
    <span class="dbar-k">Hits you with${manual ? ' <em>· your override</em>' : ''}</span>
    <span class="dbar">${segs}</span>
    <span class="dchips">${badges}</span>
  </div>`;
}

/* o drop do boss: fechado por padrao, com o gold medio por morte ja no botao --
   e' o numero que decide se vale a sala. Aberto, a lista vai do que mais vale por
   morte pro que menos vale, com chance, quantidade e preco de venda. */
function lootHtml(b){
  if (!hasLoot) return '';
  const L = lootOf(b);
  if (!L.items.length) return `<div class="boss-loot"><span class="el-empty">no loot table in the game data</span></div>`;
  const isOpen = openLoot.has(b.id);
  const btn = `<button type="button" class="loot-toggle${isOpen ? ' on' : ''}" data-loot="${esc(b.id)}" aria-expanded="${isOpen}">
      <span>${isOpen ? '▾' : '▸'} Loot <em>${L.items.length} items</em></span><b title="average gold per kill">${short(L.gold)}<small> / kill</small></b></button>`;
  if (!isOpen) return `<div class="boss-loot">${btn}</div>`;
  const rows = L.items.map(it => `<div class="bl-row">
      <span class="bl-n" title="${esc(it.name)}">${esc(it.name)}</span>
      <span class="bl-c">${pctChance(it.chance)}${it.rows > 1 ? ` <em>×${it.rows}</em>` : ''}</span>
      <span class="bl-q">${it.max ? `1–${it.max}` : '1'}</span>
      <span class="bl-p">${it.price != null ? short(it.price) : '—'}</span>
    </div>`).join('');
  return `<div class="boss-loot">${btn}
    <div class="bl-list"><div class="bl-row bl-head"><span>Item</span><span class="bl-c">Chance</span><span class="bl-q">Qty</span><span class="bl-p">Sells</span></div>${rows}</div>
  </div>`;
}

/* com que elemento bater: olha os sete e mostra os tres melhores, pelo dano que
   CHEGA no boss (resist 15 -> 85%). Vale pra toda vocacao -- o knight tambem
   escolhe o elemento pela arma elemental. So' destaca quando um elemento sozinho
   e' o melhor; empate no topo nao tem "o" melhor. Elemento que o jogo nao lista na
   resist e' 0, igual ao hunt-model. */
function hitHtml(b){
  if (!b.resist) return '';
  const rows = ELEMENTS.map(el => ({ el, m: Math.max(0, 100 - (b.resist[el] || 0)) }))
    .sort((a, c) => c.m - a.m);
  const solo = rows[0].m > rows[1].m;
  const chips = rows.slice(0, 3).map((r, i) => `<span class="el el-${r.el}${solo && i === 0 ? ' best' : ''}"
      title="${r.el}: ${r.m}% of your damage lands">${r.el} <b class="${r.m > 100 ? 'up' : r.m < 100 ? 'down' : ''}">${r.m}%</b></span>`).join('');
  return `<div class="boss-hit">
    <span class="dbar-k">Hit it with</span>
    <span class="dchips">${chips}</span>
  </div>`;
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
        <div class="bs"><span>HP real</span><b title="${nf(b.hpReal)}">${short(b.hpReal)}</b></div>
        <div class="bs"><span>XP</span><b title="${nf(b.expReal ?? b.exp)}">${short(b.expReal ?? b.exp)}</b></div>
        <div class="bs"><span>Level</span><b>${b.minLevel ?? '—'}</b></div>
      </div>
      ${editingId === b.id ? editorHtml(b) : elsHtml(b)}
      ${hitHtml(b)}
      ${lootHtml(b)}
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
  /* a busca tambem acha o boss pelo ITEM: "moonsilver" leva ao Phosphorus */
  let list = B.filter(b => !q || b.name.toLowerCase().includes(q) || (b.rarity||'').includes(q)
    || effEls(b).some(e => e.el.includes(q))
    || (q.length >= 3 && lootOf(b).items.some(it => it.name.toLowerCase().includes(q))));
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
  const lootBtn = e.target.closest('.loot-toggle');

  if (lootBtn) {
    const id = lootBtn.dataset.loot;
    openLoot.has(id) ? openLoot.delete(id) : openLoot.add(id);
    render(); return;
  }

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
