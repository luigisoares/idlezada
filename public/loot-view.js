/* loot-view.js — aba Loot: de qual bicho sai o item, e em que hunt ele sai mais.

   TRES MODOS, e o que voce digita decide qual:
     item na busca      -> as hunts que dropam aquele item, com a criatura e a
                           chance de onde ele vem;
     busca vazia + ★    -> MINHA LISTA: as hunts ranqueadas por quanto dos seus
                           favoritos elas cobrem;
     busca vazia, sem ★ -> as hunts pelo que a tabela de loot inteira vale.

   A conta mora no hunt-model.js (lootSources / lootBasket / huntLoot); aqui e'
   so tela. O tools/check-loot.js prova a conta, o tools/check-loot-view.js prova
   que a tela usa a conta sem explodir.

   NAO HA DPS AQUI, de proposito. A pergunta desta aba e' "qual bicho solta mais,
   e onde" -- chance e quantidade por clear. Velocidade de clear e' assunto da
   aba Hunts, e trazer ela pra ca so acrescentava uma coluna que dependia de voce
   ter colado a Session em outro lugar.

   Depende de hunts.js (window.HUNTS), loot.js (window.LOOT) e
   hunt-model.js (window.HuntModel). */
(function () {
'use strict';
const HUNTS = window.HUNTS || [];
const LOOT = window.LOOT || { m: {}, b: {}, p: {} };
/* bosses sao opcionais: sem bosses.js a aba continua sendo so de hunts */
const BOSSES = window.BOSSES || [];
const HM = window.HuntModel;

const grid = document.getElementById('loot-table');
const searchInp = document.getElementById('loot-search');
const listEl = document.getElementById('loot-items');
const levelInp = document.getElementById('loot-level');
const sortSel = document.getElementById('loot-sort');
const infoEl = document.getElementById('loot-info');
const noteEl = document.getElementById('loot-note');
const favsEl = document.getElementById('loot-favs');
const starBtn = document.getElementById('loot-star');
if (!grid || !HM) return;

const open = new Set();
const nf = n => Number(n || 0).toLocaleString('en-US');
const nfShort = n => { n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n); };
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/* quantidade de item: 0,0043 e' informacao, 0 nao e'. Casas conforme a ordem. */
const qty = n => {
  if (!n) return '—';
  if (n >= 100) return nf(Math.round(n));
  if (n >= 10) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(3);
  return n.toExponential(1);
};
const pctChance = c => (c / 1000).toFixed(c >= 10000 ? 1 : c >= 1000 ? 2 : 3) + '%';
/* quantos clears pra sair uma unidade */
const clearsFor = per => (per > 0 ? (per >= 1 ? '<1' : qty(1 / per)) : '—');

/* ---------- favoritos ---------- */
const FAV_KEY = 'idlezada.lootFavs.v1';

/* Com o que a lista comeca em quem nunca mexeu nela. Sao itens de verdade do
   catalogo -- o tools/check-loot-view.js confere que cada um cai em alguma hunt,
   pra a tela nunca abrir com um chip que nao leva a lugar nenhum. */
const DEFAULT_FAVS = ['stone skin amulet', 'butterfly ring', 'platinum amulet', 'wooden spellbook'];

let favs = loadFavs();
/* A semente vale so na PRIMEIRA visita, e a diferenca que decide isso e' entre
   "nunca gravou" (chave ausente) e "gravou uma lista vazia". Sem essa distincao,
   esvaziar a lista faria ela renascer no proximo render -- voce tiraria o ultimo
   item e ele voltaria sozinho. Lista vazia gravada e' uma escolha, e fica. */
function loadFavs(){
  let raw = null;
  try { raw = localStorage.getItem(FAV_KEY); } catch(e){ return DEFAULT_FAVS.slice(); }
  if (raw == null) return DEFAULT_FAVS.slice();
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter(x => typeof x === 'string') : DEFAULT_FAVS.slice();
  } catch(e){ return DEFAULT_FAVS.slice(); }
}
function saveFavs(){ try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch(e){} }
const isFav = name => favs.some(f => f.toLowerCase() === String(name).toLowerCase());
function toggleFav(name){
  const i = favs.findIndex(f => f.toLowerCase() === String(name).toLowerCase());
  if (i >= 0) favs.splice(i, 1); else favs.push(name);
  saveFavs();
}

/* ---------- level default: o maior personagem da aba Builds ---------- */
function defaultLevel(){
  try {
    const raw = JSON.parse(localStorage.getItem('idlezada.builds.v3'));
    const lv = (raw && Array.isArray(raw.slots) ? raw.slots : []).map(s => s.level || 0);
    if (lv.length) return Math.max.apply(null, lv);
  } catch(e){}
  return 900;
}

/* ---------- catalogo de itens, pro autocomplete ---------- */
/* o catalogo da busca inclui o que so cai de boss: procurar "moonsilver bow" e nao
   achar nada, quando o Phosphorus dropa, seria a aba mentindo por omissao */
const ITEMS = HM.lootItems(HUNTS, LOOT, { bosses: BOSSES.length > 0 });
const BY_LOWER = new Map(ITEMS.map(it => [it.name.toLowerCase(), it]));
if (listEl) listEl.innerHTML = ITEMS.map(it => `<option value="${esc(it.name)}"></option>`).join('');

/* o que o usuario digitou, resolvido pra um item do catalogo.
   Casa exato primeiro; depois prefixo; depois substring. Assim "stone skin"
   acha o amuleto sem exigir o nome inteiro. */
function resolve(q){
  const s = String(q || '').trim().toLowerCase();
  if (!s) return null;
  if (BY_LOWER.has(s)) return BY_LOWER.get(s);
  const pre = ITEMS.filter(it => it.name.toLowerCase().startsWith(s));
  if (pre.length) return pre[0];
  const sub = ITEMS.filter(it => it.name.toLowerCase().includes(s));
  return sub.length ? sub[0] : null;
}
function suggestions(q){
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  return ITEMS.filter(it => it.name.toLowerCase().includes(s)).slice(0, 8);
}

/* estrela reaproveitada em todo lugar que lista um item */
const star = (name, extra) => `<button class="lstar${isFav(name) ? ' on' : ''}${extra ? ' ' + extra : ''}"`
  + ` data-fav="${esc(name)}" title="${isFav(name) ? 'Remove from my list' : 'Add to my list'}"`
  + ` aria-pressed="${isFav(name)}">${isFav(name) ? '★' : '☆'}</button>`;

/* "Burster Spectre 8.86% ×17.3 kills" — a criatura, a chance, e quantas vezes
   ela morre num clear. `rows>1` marca o item que a criatura rola mais de uma vez. */
const srcLabel = f => `${esc(f.name)} <b>${pctChance(f.chance)}</b>`
  + (f.rows > 1 ? `<em>×${f.rows} rolls</em>` : '')
  + `<em>×${f.kills < 10 ? f.kills.toFixed(1) : Math.round(f.kills)} kills</em>`;

/* ======================= bosses que dropam o item ======================= */
/* Por MORTE, nao por clear: sala de boss e' uma luta so. Por isso fica numa tabela
   propria embaixo das hunts, e nao misturada no ranking delas. */
function bossSection(item, level){
  if (!HM.bossSources || !BOSSES.length) return '';
  const rows = HM.bossSources(item.name, BOSSES, LOOT);
  if (!rows.length) return '';
  return `<div class="lb-h">Bosses that drop it <span>${rows.length} · chance per kill</span></div>
    <div class="lt-head lb-row"><span></span><span>Boss</span><span>Lv</span><span>Rarity</span>
      <span class="num">Chance</span><span class="num">Per kill</span><span class="num">Kills / 1</span></div>`
    + rows.map(r => {
      const feasible = r.minLevel == null || level >= r.minLevel;
      return `<div class="lt-item"><div class="lb-row lb-body${feasible ? '' : ' locked'}">
        <span></span><span class="hn">${esc(r.name)}</span>
        <span class="hl${feasible ? '' : ' bad'}">${r.minLevel ?? '—'}</span>
        <span><span class="rb rb-${esc(r.rarity || 'normal')}">${esc(r.rarity || 'normal')}</span></span>
        <span class="num big">${pctChance(r.chance)}${r.rows > 1 ? `<em> ×${r.rows} rolls</em>` : ''}</span>
        <span class="num">${qty(r.perKill)}${r.max ? `<em> 1–${r.max}</em>` : ''}</span>
        <span class="num">${clearsFor(r.perKill)}</span>
      </div></div>`;
    }).join('');
}

/* ============================ modo item ============================ */
function sortItemRows(rows, mode){
  const by = {
    clear:  (a,b)=> b.perClear - a.perClear,
    chance: (a,b)=> (b.topChance - a.topChance) || (b.perClear - a.perClear),
    level:  (a,b)=> a.minLevel - b.minLevel,
  }[mode] || ((a,b)=> b.perClear - a.perClear);
  return rows.slice().sort(by);
}
function renderItem(item, level){
  const rows = sortItemRows(HM.lootSources(item.name, HUNTS, LOOT).map(r => ({
    ...r,
    feasible: level >= r.minLevel,
    topChance: r.from.length ? r.from[0].chance : 0,
  })), sortSel.value);
  const reach = rows.filter(r => r.feasible).length;
  const bosses = bossSection(item, level);
  const nBoss = item.bosses || 0;

  infoEl.innerHTML = `${star(item.name, 'big')}<b>${esc(item.name)}</b>`
    + ` · dropped in ${rows.length} hunt${rows.length===1?'':'s'}`
    + (nBoss ? ` and by ${nBoss} boss${nBoss===1?'':'es'}` : '')
    + ` · ${reach} hunt${reach===1?'':'s'} at or below level ${nf(level)}`
    + ` · sells for ${item.price != null ? nf(item.price) + 'g' : '—'}`;

  if (!rows.length) {
    grid.innerHTML = `<div class="lt-empty">No hunt drops <b>${esc(item.name)}</b>${bosses ? ' — only bosses do:' : '.'}</div>` + bosses;
    return;
  }

  grid.innerHTML = `<div class="lt-head">
      <span></span><span>Hunt</span><span>Lv</span><span>Drops from</span>
      <span class="num">Per clear</span><span class="num">Clears / 1</span>
    </div>` + rows.map(r => {
    const isOpen = open.has(r.id);
    return `<div class="lt-item">
      <div class="lt-row${r.feasible?'':' locked'}${isOpen?' open':''}" data-hunt="${esc(r.id)}">
        <span class="caret">${isOpen?'▾':'▸'}</span>
        <span class="hn">${esc(r.name)}</span>
        <span class="hl${r.feasible?'':' bad'}">${r.minLevel}</span>
        <span class="lsrc">${r.from.map(srcLabel).join('<span class="sep">+</span>')}</span>
        <span class="num big">${qty(r.perClear)}</span>
        <span class="num">${clearsFor(r.perClear)}</span>
      </div>${isOpen ? huntDetail(r.hunt) : ''}</div>`;
  }).join('') + bosses;
}

/* ========================= modo MINHA LISTA ========================= */
function renderBasket(level){
  const all = HM.lootBasket(favs, HUNTS, LOOT);
  const mode = sortSel.value;
  const by = {
    clear:  (a,b)=> (b.covered - a.covered) || (b.gold - a.gold),
    chance: (a,b)=> (b.covered - a.covered) || (b.gold - a.gold),
    level:  (a,b)=> a.minLevel - b.minLevel,
  }[mode] || ((a,b)=> (b.covered - a.covered) || (b.gold - a.gold));
  const rows = all.slice().sort(by);

  const best = rows.length ? rows[0].covered : 0;
  infoEl.innerHTML = `<b>My list</b> · ${favs.length} item${favs.length===1?'':'s'}`
    + ` · dropped across ${rows.length} hunt${rows.length===1?'':'s'}`
    + (best ? ` · best coverage ${best} of ${favs.length}` : '');

  if (!rows.length) {
    grid.innerHTML = `<div class="lt-empty">None of your ${favs.length} starred item${favs.length===1?'':'s'} drops in any hunt.</div>`;
    return;
  }

  grid.innerHTML = `<div class="lt-head lt-head-b">
      <span></span><span>Hunt</span><span>Lv</span><span>Covers</span>
      <span class="num">Of your list</span><span class="num">Value / clear</span>
    </div>` + rows.map(r => {
    const isOpen = open.has(r.id);
    const feasible = level >= r.minLevel;
    return `<div class="lt-item">
      <div class="lt-row lt-row-b${feasible?'':' locked'}${isOpen?' open':''}" data-hunt="${esc(r.id)}">
        <span class="caret">${isOpen?'▾':'▸'}</span>
        <span class="hn">${esc(r.name)}</span>
        <span class="hl${feasible?'':' bad'}">${r.minLevel}</span>
        <span class="lcov">${r.hits.map(x =>
          `<span class="lcov-i">${esc(x.name)}<em>${qty(x.perClear)}/clear</em></span>`).join('')}</span>
        <span class="num big">${r.covered} <em>/ ${r.wanted}</em></span>
        <span class="num">${r.gold ? nfShort(r.gold) : '—'}</span>
      </div>${isOpen ? huntDetail(r.hunt) : ''}</div>`;
  }).join('');
}

/* ==================== modo gold (sem busca e sem ★) ==================== */
function renderGold(level){
  const mode = sortSel.value;
  const rows = HUNTS.map(h => {
    const r = HM.huntLoot(h, LOOT);
    const coins = r.items.filter(it => /(gold|platinum|crystal) coin/.test(it.name))
      .reduce((s, it) => s + it.gold, 0);
    return { hunt: h, id: h.id, name: h.name, minLevel: h.minLevel,
      feasible: level >= h.minLevel, items: r.items.length,
      gold: r.gold, coins, drops: r.gold - coins };
  }).sort({
    clear:  (a,b)=> b.gold - a.gold,
    chance: (a,b)=> b.gold - a.gold,
    level:  (a,b)=> a.minLevel - b.minLevel,
  }[mode] || ((a,b)=> b.gold - a.gold));

  infoEl.innerHTML = `${nf(ITEMS.length)} items searchable across ${HUNTS.length} hunts`
    + ` · ranking by what each hunt's <b>whole loot table</b> is worth`
    + ` · <span class="hint">star items to build a list and rank by coverage instead</span>`;

  grid.innerHTML = `<div class="lt-head lt-head-g">
      <span></span><span>Hunt</span><span>Lv</span><span class="num">Items</span>
      <span class="num">Coins / clear</span><span class="num">Drops / clear</span><span class="num">Total / clear</span>
    </div>` + rows.map(r => {
    const isOpen = open.has(r.id);
    return `<div class="lt-item">
      <div class="lt-row lt-row-g${r.feasible?'':' locked'}${isOpen?' open':''}" data-hunt="${esc(r.id)}">
        <span class="caret">${isOpen?'▾':'▸'}</span>
        <span class="hn">${esc(r.name)}</span>
        <span class="hl${r.feasible?'':' bad'}">${r.minLevel}</span>
        <span class="num">${r.items}</span>
        <span class="num dim">${nfShort(r.coins)}</span>
        <span class="num">${nfShort(r.drops)}</span>
        <span class="num big">${nfShort(r.gold)}</span>
      </div>${isOpen ? huntDetail(r.hunt) : ''}</div>`;
  }).join('');
}

/* =================== detalhe: o loot inteiro de uma hunt =================== */
function huntDetail(h){
  const r = HM.huntLoot(h, LOOT);
  const coins = r.items.filter(it => /(gold|platinum|crystal) coin/.test(it.name));
  const coinGold = coins.reduce((s, it) => s + it.gold, 0);

  const rows = r.items.map(it => `<div class="ltd-row${isFav(it.name) ? ' hit' : ''}">
      <span class="ltd-n">${star(it.name)}${esc(it.name)}</span>
      <span class="ltd-s">${it.from.map(srcLabel).join('<span class="sep">+</span>')}</span>
      <span class="num">${qty(it.perClear)}</span>
      <span class="num">${clearsFor(it.perClear)}</span>
      <span class="num">${it.price != null ? nf(it.price) + 'g' : '—'}</span>
      <span class="num">${it.gold ? nfShort(it.gold) : '—'}</span>
    </div>`).join('');

  return `<div class="ltd">
    <div class="ltd-sum">
      <span><em>clear</em> ${h.hpPerClear ? nfShort(h.hpPerClear) + ' HP' : '—'}</span>
      <span><em>items</em> ${r.items.length}</span>
      <span><em>coins</em> ${nfShort(coinGold)}</span>
      <span><em>drops</em> ${nfShort(r.gold - coinGold)}</span>
      <span><em>total / clear</em> <b>${nfShort(r.gold)}</b></span>
    </div>
    ${r.missing.length ? `<div class="ltd-warn">Outside the numbers: <b>${r.missing.map(esc).join(', ')}</b>
      — the game bundle has no loot table for ${r.missing.length > 1 ? 'these' : 'this one'}.</div>` : ''}
    <div class="ltd-row ltd-head"><span>Item</span><span>From</span><span class="num">Per clear</span><span class="num">Clears / 1</span><span class="num">Sells</span><span class="num">Gold / clear</span></div>
    ${rows}
  </div>`;
}

/* --------------------------- chips dos favoritos --------------------------- */
function renderFavs(){
  if (!favsEl) return;
  if (!favs.length) { favsEl.innerHTML = ''; return; }
  favsEl.innerHTML = `<span class="lfav-k">My list</span>`
    + favs.map(n => `<span class="lfav${isCurrent(n) ? ' on' : ''}">`
      + `<button class="lfav-go" data-go="${esc(n)}">${esc(n)}</button>`
      + `<button class="lfav-x" data-fav="${esc(n)}" title="Remove from my list">✕</button></span>`).join('')
    + `<button class="lfav-all" data-go="">show my list</button>`;
}
function isCurrent(name){
  const it = resolve(searchInp.value);
  return !!it && it.name.toLowerCase() === String(name).toLowerCase();
}

/* ------------------------------- render ------------------------------- */
function render(){
  const level = parseInt(levelInp.value, 10) || 1;
  const q = String(searchInp.value || '').trim();
  const item = resolve(q);

  renderFavs();
  if (starBtn) {
    starBtn.innerHTML = item ? (isFav(item.name) ? '★' : '☆') : '☆';
    starBtn.disabled = !item;
    starBtn.className = 'lstar big' + (item && isFav(item.name) ? ' on' : '') + (item ? '' : ' off');
    starBtn.setAttribute('title', item ? (isFav(item.name) ? 'Remove from my list' : 'Add to my list') : 'Search an item to star it');
  }

  /* o que a busca entendeu, quando nao foi o que se digitou */
  const sug = suggestions(q);
  if (noteEl) {
    noteEl.innerHTML = (item && q.toLowerCase() !== item.name.toLowerCase())
      ? `showing <b>${esc(item.name)}</b>` + (sug.length > 1
          ? ` · also matched: ${sug.filter(s => s !== item).slice(0, 5).map(s => `<button class="lsug" data-go="${esc(s.name)}">${esc(s.name)}</button>`).join('')}` : '')
      : '';
  }

  if (item) { renderItem(item, level); return; }
  /* Digitou e nao casou nada: estado vazio explicito. Cair num ranking aqui
     seria pior do que nao responder -- a tabela cheia LE como resultado da
     busca, e nao e'. */
  if (q) {
    infoEl.innerHTML = `no item matching <b>${esc(q)}</b>`;
    grid.innerHTML = `<div class="lt-empty">Nothing named <b>${esc(q)}</b> drops in any of the ${HUNTS.length} hunts.`
      + `<br><span class="dim">${nf(ITEMS.length)} items are searchable.</span></div>`;
    return;
  }
  if (favs.length) { renderBasket(level); return; }
  renderGold(level);
}

/* ------------------------------- wiring ------------------------------- */
levelInp.value = String(defaultLevel());

/* ir pra um item (ou pra Minha lista, com o alvo vazio) */
function goTo(name){
  searchInp.value = name || '';
  open.clear();
  render();
}
/* toda estrela da tela passa por aqui, venha da barra, do chip ou do detalhe */
function onFavClick(e){
  const b = e.target.closest('[data-fav]');
  if (!b) return false;
  toggleFav(b.dataset.fav);
  render();
  return true;
}

searchInp.addEventListener('input', () => { open.clear(); render(); });
levelInp.addEventListener('input', render);
sortSel.addEventListener('change', render);
if (starBtn) starBtn.addEventListener('click', () => {
  const item = resolve(searchInp.value);
  if (!item) return;
  toggleFav(item.name);
  render();
});
grid.addEventListener('click', e => {
  if (onFavClick(e)) return;               // a estrela nao pode abrir/fechar a hunt
  const row = e.target.closest('.lt-row');
  if (!row) return;
  const id = row.dataset.hunt;
  open.has(id) ? open.delete(id) : open.add(id);
  render();
});
if (favsEl) favsEl.addEventListener('click', e => {
  if (onFavClick(e)) return;
  const g = e.target.closest('[data-go]');
  if (g) goTo(g.dataset.go);
});
if (noteEl) noteEl.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) goTo(g.dataset.go);
});
render();
})();
