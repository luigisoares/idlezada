/* app.js — tela de 3 builds. Depende de trees.js + engine.js. */
(function () {
'use strict';
const E = window.Engine;

/* ---------- rotulos / cores ---------- */
const VNAME = { knight:'Knight', paladin:'Paladin', sorcerer:'Sorcerer', druid:'Druid', monk:'Monk' };
const VCOL  = { knight:'#ff6b5e', paladin:'#ffd76a', sorcerer:'#b060ff', druid:'#6fdc8c', monk:'#5fd4e8' };

const OBJS = [
  { key:'dano',     label:'Dano' },
  { key:'critico',  label:'Crítico' },
  { key:'avatar',   label:'Avatar' },
  { key:'tank',     label:'Tank' },
  { key:'xp',       label:'XP' },
  { key:'atkspeed', label:'Atk Speed' },
];

const ELNAME = { physical:'Físico', energy:'Energia', earth:'Terra', fire:'Fogo', ice:'Gelo', holy:'Sagrado', death:'Morte' };

/* labels de stats (iguais aos do simulador) */
const SL = {
  atkPct:v=>`+${v}% ataque`, defFlat:v=>`+${v} def`, armorFlat:v=>`+${v} armadura`,
  critChance:v=>`+${v}% chance de crítico`, critDmg:v=>`+${v}% dano crítico`,
  lifeLeech:v=>`+${v}% life leech`, manaLeech:v=>`+${v}% mana leech`,
  hpPct:v=>`+${v}% HP`, manaPct:v=>`+${v}% mana`, expPct:v=>`+${v}% exp`, lootPct:v=>`+${v}% loot`,
  spellDmgPct:v=>`+${v}% dano de magia`, attackSpeedPct:v=>`+${v}% velocidade de ataque`,
  spellHealPct:v=>`+${v}% cura de magia`, hpRegenPct:v=>`+${v}% regen de HP`,
  mpRegenPct:v=>`+${v}% regen de mana`,
};
const SORD = ['critChance','critDmg','lifeLeech','manaLeech','atkPct','attackSpeedPct','armorFlat',
  'defFlat','hpPct','manaPct','expPct','lootPct','spellDmgPct','spellHealPct','hpRegenPct','mpRegenPct'];
const ELORD = ['physical','energy','earth','fire','ice','holy','death'];
const SPL = {
  dodge:v=>`${v}% de chance de desviar (0 de dano)`,
  gift_of_life:v=>`Gift of Life: sobrevive a golpe letal (cd ${v}s)`,
  momentum:v=>`${v}% de chance de cortar 2s dos cooldowns no auto-attack`,
  execute:v=>`+${v}% de dano vs monstros abaixo de 25% do HP`,
  element_pierce:v=>`Ignora ${v}% da resistência elemental dos monstros`,
  battle_instinct:v=>`+${v} def por monstro em melee range`,
  chain:v=>`Auto-attack salta pra +${v} monstro(s) próximo(s) (60% do dano)`,
  slash:v=>`Corta os monstros adjacentes ao alvo por ${v}% do golpe`,
  precision:v=>`${v}% de chance de um segundo ataque completo`,
  tactics:v=>`+${v} de tática: mira, posicionamento e reação`,
  avatar:v=>`${v}% de chance (por acerto) de entrar na forma Avatar por 15s`,
};
const fmtNum = x => String(Math.round(x*100)/100);

/* ---------- estado ---------- */
const LS_KEY = 'idlezada.builds.v2';
const DEFAULT_SLOTS = [
  { label:"K'Nihti",         voc:'knight',   level:500, obj:'dano', element:'all' },
  { label:"Elder Druid",     voc:'druid',    level:500, obj:'dano', element:'all' },
  { label:"Master Sorcerer", voc:'sorcerer', level:500, obj:'dano', element:'all' },
];
let state = loadState();

function loadState(){
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && Array.isArray(raw.slots) && raw.slots.length === 3) {
      return {
        slots: raw.slots.map((s,i)=>({ ...DEFAULT_SLOTS[i], ...s })),
        tab: raw.tab || 'builds',
      };
    }
  } catch (e) { /* ignora storage corrompido */ }
  return { slots: DEFAULT_SLOTS.map(s=>({...s})), tab:'builds' };
}
function saveState(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ---------- render ---------- */
const slotsEl = document.getElementById('slots');

function render(){
  slotsEl.innerHTML = '';
  state.slots.forEach((s, i) => slotsEl.appendChild(renderSlot(s, i)));
}

function renderSlot(s, i){
  const el = document.createElement('div');
  el.className = 'slot';
  const col = VCOL[s.voc] || '#6fdc8c';

  // objetivos
  const objBtns = OBJS.map(o =>
    `<div class="obj${o.key===s.obj?' on':''}" data-obj="${o.key}">${o.label}</div>`).join('');

  // seletor de elemento (so no Dano e quando ha 2+ elementos)
  const els = E.damageElements(s.voc);
  const showElem = s.obj === 'dano' && els.length >= 2;
  const elemOptions = ['all', ...els].map(e =>
    `<option value="${e}"${e===s.element?' selected':''}>${e==='all'?'Todos os elementos':ELNAME[e]||e}</option>`).join('');

  const vocOptions = E.VOCS.map(v =>
    `<option value="${v}"${v===s.voc?' selected':''}>${VNAME[v]}</option>`).join('');

  el.innerHTML = `
    <div class="head">
      <div class="avatar" style="background:${col}">${VNAME[s.voc][0]}</div>
      <input class="label" type="text" maxlength="24" value="${escapeAttr(s.label)}" data-role="label">
    </div>
    <div class="row2">
      <div class="field" style="flex:1"><span class="k">Vocação</span>
        <select data-role="voc">${vocOptions}</select></div>
      <div class="field"><span class="k">Level</span>
        <input type="number" min="1" max="9999999" value="${s.level}" data-role="level"></div>
    </div>
    <div class="field"><span class="k">Objetivo</span><div class="objs">${objBtns}</div></div>
    <div class="field${showElem?'':' hide'}" data-role="elemfield" style="${showElem?'':'display:none'}">
      <span class="k">Elemento de dano</span><select data-role="element">${elemOptions}</select></div>
    <div class="pts"><span>pontos</span><div class="bar"><i data-role="ptbar"></i></div>
      <b data-role="pttxt"></b></div>
    <div data-role="warn"></div>
    <div class="stats" data-role="stats"></div>
    <div class="codebox"><input type="text" readonly data-role="code"><button data-role="copy">Copiar</button></div>
    <div class="actions"><button class="gold" data-role="open">Abrir no simulador</button></div>
    <div class="note">Cole o código no Baiak Idle — ou aqui no simulador pra ajustar.</div>
  `;

  // ---- listeners ----
  el.querySelector('[data-role=label]').addEventListener('input', e=>{ s.label=e.target.value; save(); });
  el.querySelector('[data-role=voc]').addEventListener('change', e=>{
    s.voc = e.target.value;
    // se o elemento escolhido nao existe na nova voc, volta pra "all"
    if (s.element !== 'all' && !E.damageElements(s.voc).includes(s.element)) s.element = 'all';
    save(); render();  // re-render (muda cor, seletor de elemento, etc.)
  });
  el.querySelector('[data-role=level]').addEventListener('input', e=>{
    s.level = Math.max(1, parseInt(e.target.value||'1',10)); save(); recompute(el, s);
  });
  el.querySelectorAll('[data-obj]').forEach(b => b.addEventListener('click', ()=>{
    s.obj = b.dataset.obj; save(); render();  // re-render (mostra/esconde elemento)
  }));
  const elemSel = el.querySelector('[data-role=element]');
  if (elemSel) elemSel.addEventListener('change', e=>{ s.element=e.target.value; save(); recompute(el, s); });
  el.querySelector('[data-role=copy]').addEventListener('click', ()=>{
    const inp = el.querySelector('[data-role=code]');
    navigator.clipboard && navigator.clipboard.writeText(inp.value);
    const btn = el.querySelector('[data-role=copy]');
    btn.textContent='Copiado!'; setTimeout(()=>btn.textContent='Copiar',1200);
  });
  el.querySelector('[data-role=open]').addEventListener('click', ()=>{
    const code = el.querySelector('[data-role=code]').value;
    openInSimulator(code);
  });

  // primeira computacao
  setTimeout(()=>recompute(el, s), 0);
  return el;
}

function recompute(el, s){
  const build = E.autobuild(s.voc, s.level, s.obj, { element: s.element });
  const code = E.encode(s.voc, build.ranks, s.level);
  el.querySelector('[data-role=code]').value = code;

  const pct = s.level>0 ? Math.min(100, Math.round(build.spent/s.level*100)) : 0;
  el.querySelector('[data-role=ptbar]').style.width = pct+'%';
  el.querySelector('[data-role=pttxt]').textContent = `${build.spent.toLocaleString('pt-BR')} / ${s.level.toLocaleString('pt-BR')}`;

  // aviso avatar inalcancavel
  const warn = el.querySelector('[data-role=warn]');
  if (s.obj==='avatar' && !build.reachedAvatar) {
    warn.innerHTML = `<div class="warn">Level insuficiente pra chegar no nó Avatar — montei a melhor build de dano com os pontos disponíveis.</div>`;
  } else warn.innerHTML = '';

  renderStats(el.querySelector('[data-role=stats]'), s.voc, build.ranks);
}

function renderStats(box, voc, ranks){
  const { bonus, absorb, elem, spec } = E.aggregate(voc, ranks);
  box.innerHTML = '';
  const add = (txt, sp)=>{ const d=document.createElement('div'); d.className='stat'+(sp?' sp':''); d.textContent=txt; box.appendChild(d); };
  for (const k of SORD) if (bonus[k]) add((SL[k]||(v=>`+${v} ${k}`))(fmtNum(bonus[k])));
  for (const k in bonus) if (!SORD.includes(k) && bonus[k]) add((SL[k]||(v=>`+${v} ${k}`))(fmtNum(bonus[k])));
  for (const e of ELORD) if (absorb[e]) add(`+${fmtNum(absorb[e])}% proteção ${ELNAME[e].toLowerCase()}`);
  if (elem.elementDmgPct) for (const e of ELORD) if (elem.elementDmgPct[e]) add(`+${fmtNum(elem.elementDmgPct[e])}% dano de ${ELNAME[e].toLowerCase()}`);
  for (const k in spec) if (spec[k]) add((SPL[k]||(v=>`${k}: ${v}`))(fmtNum(spec[k])), true);
  if (!box.children.length) add('Nenhum nó alocado.', false), box.lastChild.classList.add('empty');
}

/* debounce leve pra salvar rótulo/level sem spammar storage */
let saveT=null;
function save(){ clearTimeout(saveT); saveT=setTimeout(saveState, 200); }

/* ---------- abas ---------- */
const views = { builds:'view-builds', sim:'view-sim', stamina:'view-stamina' };
const iframeSrc = { sim:'simuladorbuild.html', stamina:'stamina.html' };
const frames = { sim: document.getElementById('simFrame'), stamina: document.getElementById('staminaFrame') };

function switchTab(view){
  state.tab = view; saveState();
  document.querySelectorAll('.navtab').forEach(t=>t.classList.toggle('on', t.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));
  document.getElementById(views[view]).classList.add('on');
  // lazy-load do iframe
  if (frames[view] && !frames[view].src) frames[view].src = iframeSrc[view];
}
document.getElementById('navtabs').addEventListener('click', e=>{
  const t = e.target.closest('.navtab'); if (t) switchTab(t.dataset.view);
});

function openInSimulator(code){
  const f = frames.sim;
  f.src = iframeSrc.sim + '#' + code;   // sempre re-seta (recarrega com o codigo)
  switchTab('sim');
}

/* ---------- util ---------- */
function escapeAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

/* ---------- boot ---------- */
render();
switchTab(state.tab || 'builds');
})();
