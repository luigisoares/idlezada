/* app.js — 3-build generator screen. Depends on trees.js + engine.js.
   (comentários em PT propositalmente, pra facilitar manutenção — UI é toda em inglês.) */
(function () {
'use strict';
const E = window.Engine;
const TREES = window.TREES;

/* ---------- labels / colors ---------- */
const VNAME = { knight:'Knight', paladin:'Paladin', sorcerer:'Sorcerer', druid:'Druid', monk:'Monk' };
const VCOL  = { knight:'#ff6b5e', paladin:'#ffd76a', sorcerer:'#b060ff', druid:'#6fdc8c', monk:'#5fd4e8' };

const OBJS = [
  { key:'dano',     label:'Damage' },
  { key:'critico',  label:'Crit' },
  { key:'avatar',   label:'Avatar' },
  { key:'tank',     label:'Tank' },
  { key:'xp',       label:'XP' },
  { key:'atkspeed', label:'Atk Speed' },
];
// título do card por objetivo
const OBJTITLE = { dano:'MAX DAMAGE', critico:'CRIT', avatar:'AVATAR', tank:'TANK', xp:'XP', atkspeed:'ATTACK SPEED' };

const ELNAME = { physical:'Physical', energy:'Energy', earth:'Earth', fire:'Fire', ice:'Ice', holy:'Holy', death:'Death' };

/* stat labels (English) */
const SL = {
  atkPct:v=>`+${v}% attack`, defFlat:v=>`+${v} def`, armorFlat:v=>`+${v} armor`,
  critChance:v=>`+${v}% crit chance`, critDmg:v=>`+${v}% crit damage`,
  lifeLeech:v=>`+${v}% life leech`, manaLeech:v=>`+${v}% mana leech`,
  hpPct:v=>`+${v}% HP`, manaPct:v=>`+${v}% mana`, expPct:v=>`+${v}% exp`, lootPct:v=>`+${v}% loot`,
  spellDmgPct:v=>`+${v}% spell damage`, attackSpeedPct:v=>`+${v}% attack speed`,
  spellHealPct:v=>`+${v}% spell healing`, hpRegenPct:v=>`+${v}% HP regen`,
  mpRegenPct:v=>`+${v}% mana regen`,
};
const SORD = ['critChance','critDmg','lifeLeech','manaLeech','atkPct','attackSpeedPct','armorFlat',
  'defFlat','hpPct','manaPct','expPct','lootPct','spellDmgPct','spellHealPct','hpRegenPct','mpRegenPct'];
const ELORD = ['physical','energy','earth','fire','ice','holy','death'];
// resumo curto de cada special (inglês)
const SPL = {
  dodge:v=>`${v}% chance to take 0 damage`,
  gift_of_life:v=>`survives a lethal hit (cd ${v}s)`,
  momentum:v=>`${v}% chance on auto-attack to cut 2s off all spell cooldowns`,
  execute:v=>`+${v}% damage vs monsters below 25% HP`,
  element_pierce:v=>`ignores ${v}% of the monster's elemental resistance`,
  battle_instinct:v=>`+${v} def per monster in melee range`,
  chain:v=>`auto-attack jumps to +${v} nearby monster(s) (60% damage)`,
  slash:v=>`cleaves monsters adjacent to the target for ${v}% of the hit`,
  precision:v=>`${v}% chance of a full second attack`,
  tactics:v=>`+${v} tactics: aim, positioning and reaction`,
  avatar:v=>`${v}% chance (per hit) to enter Avatar form for 15s`,
};
const fmtNum = x => String(Math.round(x*100)/100);

/* ícones das categorias (SVG monocromático, herda a cor via currentColor) */
const ICON = {
  damage:  '<svg viewBox="0 0 20 20" class="ci"><path d="M12 3h5v5l-6.5 6.5-1.8-1.8L15.2 6H12zM3 15l3.5-3.5 1.9 1.9L4.9 17H3z"/></svg>',
  speed:   '<svg viewBox="0 0 20 20" class="ci"><path d="M11 2 4 11h4l-1 7 7-9h-4z"/></svg>',
  crit:    '<svg viewBox="0 0 20 20" class="ci"><path d="M10 2l1.7 5.9L18 10l-6.3 2.1L10 18l-1.7-5.9L2 10l6.3-2.1z"/></svg>',
  sustain: '<svg viewBox="0 0 20 20" class="ci"><path d="M10 17C4.5 13.2 3 10.4 3 7.8 3 5.7 4.6 4 6.7 4 8 4 9.2 4.7 10 5.8 10.8 4.7 12 4 13.3 4 15.4 4 17 5.7 17 7.8c0 2.6-1.5 5.4-7 9.2z"/></svg>',
  defense: '<svg viewBox="0 0 20 20" class="ci"><path d="M10 2l6 2.2v4.6c0 4-2.6 6.9-6 9.2-3.4-2.3-6-5.2-6-9.2V4.2z"/></svg>',
  element: '<svg viewBox="0 0 20 20" class="ci"><path d="M10 2l6 8-6 8-6-8z"/></svg>',
};
const CAT_ORDER = ['damage','speed','crit','sustain','defense','element'];
const CAT_LABEL = { damage:'Damage', speed:'Speed', crit:'Crit', sustain:'Sustain', defense:'Defense', element:'Element' };

/* ---------- state ---------- */
const LS_KEY = 'idlezada.builds.v3';
const DEFAULT_SLOTS = [
  { label:"Knight",          voc:'knight',   level:500, obj:'dano', element:'all' },
  { label:"Elder Druid",     voc:'druid',    level:500, obj:'dano', element:'all' },
  { label:"Master Sorcerer", voc:'sorcerer', level:500, obj:'dano', element:'all' },
];
let state = loadState();

function loadState(){
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && Array.isArray(raw.slots) && raw.slots.length === 3) {
      return { slots: raw.slots.map((s,i)=>({ ...DEFAULT_SLOTS[i], ...s })), tab: raw.tab || 'builds' };
    }
  } catch (e) { /* storage corrompido: ignora */ }
  return { slots: DEFAULT_SLOTS.map(s=>({...s})), tab:'builds' };
}
function saveState(){ try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

/* ---------- render ---------- */
const slotsEl = document.getElementById('slots');
function render(){ slotsEl.innerHTML=''; state.slots.forEach(s=>slotsEl.appendChild(renderSlot(s))); }

function renderSlot(s){
  const el = document.createElement('div');
  el.className = 'slot';
  const col = VCOL[s.voc] || '#6fdc8c';

  const objBtns = OBJS.map(o =>
    `<div class="obj${o.key===s.obj?' on':''}" data-obj="${o.key}">${o.label}</div>`).join('');

  const els = E.damageElements(s.voc);
  const showElem = s.obj === 'dano' && els.length >= 2;
  const elemOptions = ['all', ...els].map(e =>
    `<option value="${e}"${e===s.element?' selected':''}>${e==='all'?'All elements':ELNAME[e]||e}</option>`).join('');
  const vocOptions = E.VOCS.map(v =>
    `<option value="${v}"${v===s.voc?' selected':''}>${VNAME[v]}</option>`).join('');

  el.innerHTML = `
    <div class="head">
      <div class="avatar" style="background:${col}">${VNAME[s.voc][0]}</div>
      <input class="label" type="text" maxlength="24" value="${escapeAttr(s.label)}" data-role="label">
    </div>
    <div class="row2">
      <div class="field" style="flex:1"><span class="k">Vocation</span>
        <select data-role="voc">${vocOptions}</select></div>
      <div class="field"><span class="k">Level</span>
        <input type="number" min="1" max="9999999" value="${s.level}" data-role="level"></div>
    </div>
    <div class="field"><span class="k">Objective</span><div class="objs">${objBtns}</div></div>
    <div class="field" data-role="elemfield" style="${showElem?'':'display:none'}">
      <span class="k">Damage element</span><select data-role="element">${elemOptions}</select></div>
    <div data-role="warn"></div>
    <div class="sum" data-role="summary"></div>
    <div class="codebox"><input type="text" readonly data-role="code"><button data-role="copy">Copy</button></div>
    <div class="actions"><button class="gold" data-role="open">Open in simulator</button></div>
    <div class="note">Paste the code into the game — or into the simulator here to fine-tune.</div>
  `;

  // ---- listeners ----
  el.querySelector('[data-role=label]').addEventListener('input', e=>{ s.label=e.target.value; save(); });
  el.querySelector('[data-role=voc]').addEventListener('change', e=>{
    s.voc = e.target.value;
    if (s.element !== 'all' && !E.damageElements(s.voc).includes(s.element)) s.element = 'all';
    save(); render();
  });
  el.querySelector('[data-role=level]').addEventListener('input', e=>{
    s.level = Math.max(1, parseInt(e.target.value||'1',10)); save(); recompute(el, s);
  });
  el.querySelectorAll('[data-obj]').forEach(b => b.addEventListener('click', ()=>{
    s.obj = b.dataset.obj; save(); render();
  }));
  const elemSel = el.querySelector('[data-role=element]');
  if (elemSel) elemSel.addEventListener('change', e=>{ s.element=e.target.value; save(); recompute(el, s); });
  el.querySelector('[data-role=copy]').addEventListener('click', ()=>{
    const inp = el.querySelector('[data-role=code]');
    if (navigator.clipboard) navigator.clipboard.writeText(inp.value);
    const btn = el.querySelector('[data-role=copy]');
    btn.textContent='Copied!'; setTimeout(()=>btn.textContent='Copy',1200);
  });
  el.querySelector('[data-role=open]').addEventListener('click', ()=>{
    openInSimulator(el.querySelector('[data-role=code]').value);
  });

  recompute(el, s);   // el ainda é detached, mas querySelector funciona; computa antes de anexar
  return el;
}

function recompute(el, s){
  const build = E.autobuild(s.voc, s.level, s.obj, { element: s.element });
  el.querySelector('[data-role=code]').value = E.encode(s.voc, build.ranks, s.level);

  const warn = el.querySelector('[data-role=warn]');
  warn.innerHTML = (s.obj==='avatar' && !build.reachedAvatar)
    ? `<div class="warn">Level too low to reach the Avatar node — built the best damage setup with the available points.</div>`
    : '';

  renderSummary(el.querySelector('[data-role=summary]'), s, build);
}

/* ---------- summary card ---------- */
function renderSummary(box, s, build){
  const voc = s.voc;
  const agg = E.aggregate(voc, build.ranks);
  const b = agg.bonus, absorb = agg.absorb, elemDmg = agg.elem.elementDmgPct || {};

  // headline por categoria (ou null -> "—")
  const elemJoin = ELORD.filter(e=>elemDmg[e]).map(e=>`${ELNAME[e]} +${fmtNum(elemDmg[e])}%`).join(' · ');
  const absKeys = ELORD.filter(e=>absorb[e]);
  const absUniform = absKeys.length>1 && absKeys.every(e=>Math.abs(absorb[e]-absorb[absKeys[0]])<0.001);
  const head = {
    damage:  b.atkPct ? SL.atkPct(fmtNum(b.atkPct)) : null,
    speed:   b.attackSpeedPct ? SL.attackSpeedPct(fmtNum(b.attackSpeedPct)) : null,
    crit:    b.critChance ? SL.critChance(fmtNum(b.critChance)) : (b.critDmg ? SL.critDmg(fmtNum(b.critDmg)) : null),
    sustain: b.lifeLeech ? SL.lifeLeech(fmtNum(b.lifeLeech)) : (b.hpRegenPct ? SL.hpRegenPct(fmtNum(b.hpRegenPct)) : null),
    defense: b.hpPct ? SL.hpPct(fmtNum(b.hpPct)) : (b.defFlat ? SL.defFlat(fmtNum(b.defFlat)) : (b.armorFlat ? SL.armorFlat(fmtNum(b.armorFlat)) : (absKeys.length ? `+${fmtNum(absorb[absKeys[0]])}% absorb` : null))),
    element: elemJoin || null,
  };

  // intensidades pro medidor (decorativo)
  const absAvg = absKeys.length ? absKeys.reduce((a,e)=>a+absorb[e],0)/absKeys.length : 0;
  const I = {
    damage:  (b.atkPct||0)+(b.spellDmgPct||0),
    speed:   (b.attackSpeedPct||0),
    crit:    (b.critChance||0)*3+(b.critDmg||0),
    sustain: (b.lifeLeech||0)*4+(b.manaLeech||0)*3+(b.hpRegenPct||0)*12+(b.mpRegenPct||0)*12+(b.spellHealPct||0)*2,
    defense: (b.hpPct||0)*2+(b.defFlat||0)+(b.armorFlat||0)+absAvg*12,
    element: ELORD.reduce((a,e)=>a+(elemDmg[e]||0),0),
  };

  // linhas de categoria
  const rows = CAT_ORDER.map(k=>{
    const v = head[k];
    return `<div class="cat${v?'':' off'}"><span class="ci-wrap">${ICON[k]}</span>
      <span class="cl">${CAT_LABEL[k]}</span>
      <span class="cv">${v ? v : '—'}</span></div>`;
  }).join('');

  // bônus consolidados (todos, exaustivo)
  const pills = [];
  for (const k of SORD) if (b[k]) pills.push(esc(SL[k](fmtNum(b[k]))));
  if (elemJoin) pills.push(`elem. dmg: ${esc(elemJoin)}`);
  if (absKeys.length) pills.push(absUniform ? `absorb: all +${fmtNum(absorb[absKeys[0]])}%`
    : `absorb: ${absKeys.map(e=>`${ELNAME[e]} +${fmtNum(absorb[e])}%`).join(' · ')}`);
  // specials: nome do nó (inglês, vem do dado) + resumo em inglês
  const specialPills = [];
  for (const n of TREES[voc]) {
    if (n.special && (build.ranks[n.id]||0) >= 1) {
      const s2 = SPL[n.special.key] ? SPL[n.special.key](fmtNum(n.special.value*(build.ranks[n.id]||1))) : '';
      specialPills.push(`<div class="pill2 sp">★ ${esc(n.name)}${s2?` — ${s2}`:''}</div>`);
    }
  }
  const pillsHtml = pills.map(p=>`<div class="pill2">${p}</div>`).join('') + specialPills.join('');

  const titleEl = (s.obj==='dano' && s.element!=='all') ? ` / ${ (ELNAME[s.element]||s.element).toUpperCase() }` : '';
  box.innerHTML = `
    <div class="sum-title">◆ BUILD SUMMARY · ${OBJTITLE[s.obj]||''}${titleEl}</div>
    <div class="sum-body">
      <div class="sum-cats">${rows}</div>
      <div class="sum-gauge">${gauge(I)}</div>
    </div>
    <div class="sum-bonus-h">Consolidated bonuses</div>
    <div class="sum-pills">${pillsHtml || '<div class="pill2 off">no nodes allocated</div>'}</div>
    <div class="sum-foot">${build.spent.toLocaleString('en-US')} / ${s.level.toLocaleString('en-US')} points allocated · total values for this recommendation</div>
  `;
}

/* medidor: radar hexagonal PREENCHIDO (polígono das 6 categorias).
   sem agulha e sem hub central — só o frame hexagonal + o polígono. baseline
   de 0.16R evita que ele degenere numa linha quando poucos eixos têm valor. */
function gauge(I){
  const keys = CAT_ORDER, cx=44, cy=44, R=32;
  const max = Math.max(1e-9, ...keys.map(k=>I[k]||0));
  const ang = i => (-90 + i*60) * Math.PI/180;
  const pt = (i,r)=>[cx+r*Math.cos(ang(i)), cy+r*Math.sin(ang(i))];
  const ring = f => keys.map((_,i)=>pt(i, R*f).map(n=>n.toFixed(1)).join(',')).join(' ');
  const poly = keys.map((k,i)=>pt(i, R*0.16 + R*0.84*((I[k]||0)/max)).map(n=>n.toFixed(1)).join(',')).join(' ');
  return `<svg viewBox="0 0 88 88" class="gauge">
    <polygon class="g-hex" points="${ring(1)}"/>
    <polygon class="g-hex g-hex2" points="${ring(0.5)}"/>
    <polygon class="g-poly" points="${poly}"/>
  </svg>`;
}

/* ---------- persist (debounce) ---------- */
let saveT=null;
function save(){ clearTimeout(saveT); saveT=setTimeout(saveState, 200); }

/* ---------- tabs ---------- */
const views = { builds:'view-builds', bosses:'view-bosses', hunts:'view-hunts', sim:'view-sim', stamina:'view-stamina' };
const iframeSrc = { sim:'simuladorbuild.html', stamina:'stamina.html' };
const frames = { sim: document.getElementById('simFrame'), stamina: document.getElementById('staminaFrame') };
function switchTab(view){
  state.tab = view; saveState();
  document.querySelectorAll('.navtab').forEach(t=>t.classList.toggle('on', t.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));
  document.getElementById(views[view]).classList.add('on');
  if (frames[view] && !frames[view].src) frames[view].src = iframeSrc[view];
}
document.getElementById('navtabs').addEventListener('click', e=>{
  const t = e.target.closest('.navtab'); if (t) switchTab(t.dataset.view);
});
function openInSimulator(code){ frames.sim.src = iframeSrc.sim + '#' + code; switchTab('sim'); }

/* ---------- util ---------- */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

/* ---------- boot ---------- */
render();
switchTab(state.tab || 'builds');
})();
