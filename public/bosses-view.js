/* bosses-view.js — renderiza a aba Bosses a partir de window.BOSSES (bosses.js). */
(function () {
'use strict';
const B = window.BOSSES || [];
const grid = document.getElementById('bosses-grid');
const search = document.getElementById('boss-search');
const sortSel = document.getElementById('boss-sort');
const favToggle = document.getElementById('boss-favs');
const suggestBtn = document.getElementById('boss-suggest');
const favLabel = document.getElementById('favs-label');
const countEl = document.getElementById('boss-count');
if (!grid) return;

const FAV_KEY = 'idlezada.bossFavs.v1', FAV_MAX = 40;
// preset "meta" de 40 bosses mais comuns de farmar (botão Suggest 40)
const SUGGESTED = ["bakragore","goshnars_cruelty","goshnars_greed","goshnars_hatred","goshnars_malice",
  "goshnars_spite","murcion","chagorz","ichgahal","vemiath","the_monster","court_warlock","the_primal_menace",
  "magma_bubble","king_zelos","urmahlullu_the_immaculate","the_brainstealer","the_unwelcome","ratmiral",
  "vladrukh","timira_the_many_headed","lord_retro","dragon_pack","brokul","scarlett","megasylvan_yselda",
  "drume","oberon","the_dread_maiden","tarbaz","duke_krule","outburst","foreshock","brain_head",
  "irgix_the_flimsy","unaz_the_mean","leiden","arbaziloth","alptramun","the_last_lore_keeper"];
let favs = loadFavs();
function loadFavs(){ try { const a = JSON.parse(localStorage.getItem(FAV_KEY)); return new Set(Array.isArray(a) ? a : []); } catch (e) { return new Set(); } }
function saveFavs(){ try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (e) {} }

const nf = n => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

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
  if (b.imgKind === 'outfit')
    return `<div class="sprite" style="background-image:url('${b.img}')"></div>`;
  if (b.imgKind === 'object')
    return `<img class="obj-img" loading="lazy" src="${b.img}" alt="${esc(b.name)}"
      onerror="this.closest('.boss-img').classList.add('noimg');this.remove()">`;
  return '';   // noimg -> placeholder via classe
}

function elsHtml(b){
  const els = (b.elements || []).slice(0, 3);   // até 3, já ordenados por %
  if (!els.length) return '';
  return `<div class="boss-els">${els.map(e =>
    `<span class="el el-${esc(e.el)}">${esc(e.el)} <b>${e.pct}%</b></span>`).join('')}</div>`;
}

function card(b){
  const group = b.kind === 'group';
  const noimg = b.imgKind === 'none' ? ' noimg' : '';
  const fav = favs.has(b.id);
  return `<div class="boss">
    <div class="boss-img${noimg}">
      ${imgHtml(b)}
      <button class="fav${fav ? ' on' : ''}" data-fav="${esc(b.id)}" title="Favorite" aria-label="Favorite">★</button>
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
        <div class="bs"><span>XP base</span><b>${nf(b.exp)}</b></div>
      </div>
      ${elsHtml(b)}
    </div>
  </div>`;
}

function updateFavLabel(){
  if (favLabel) favLabel.textContent = `★ Favorites (${favs.size}/${FAV_MAX})`;
}
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
    || (b.elements||[]).some(e => e.el.includes(q)));
  if (favToggle && favToggle.checked) list = list.filter(b => favs.has(b.id));
  list = sortList(list, sortSel.value);
  countEl.textContent = `${list.length} boss${list.length !== 1 ? 'es' : ''}`;
  grid.innerHTML = list.length ? list.map(card).join('') : '<div class="note">no bosses found</div>';
  updateFavLabel();
}

// favoritar (delegação) — respeita o cap de 40
grid.addEventListener('click', e => {
  const btn = e.target.closest('.fav'); if (!btn) return;
  const id = btn.dataset.fav;
  if (favs.has(id)) { favs.delete(id); }
  else { if (favs.size >= FAV_MAX) { flashLimit(); return; } favs.add(id); }
  saveFavs();
  if (favToggle && favToggle.checked) render();   // filtro ativo: re-render (pode sair da lista)
  else { btn.classList.toggle('on', favs.has(id)); updateFavLabel(); }
});

// Suggest 40: aplica o preset meta como favoritos e já filtra pra mostrá-los
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
