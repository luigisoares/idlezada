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
  { key:'aoe',      label:'AoE' },
  { key:'tank',     label:'Tank' },
  { key:'puller',   label:'Puller' },
  { key:'healer',   label:'Healer' },
  { key:'curadano', label:'Heal + Dmg' },
  { key:'xp',       label:'XP' },
  { key:'atkspeed', label:'Atk Speed' },
];
// título do card por objetivo
const OBJTITLE = { dano:'MAX DAMAGE', critico:'CRIT', avatar:'AVATAR', aoe:'AOE / MULTI-TARGET',
  tank:'TANK', puller:'PULLER', healer:'HEALER', curadano:'HEAL + DAMAGE', xp:'XP', atkspeed:'ATTACK SPEED' };
/* objetivos em que o elemento de dano muda a build -> mostra o seletor. Vem do engine
   (derivado dos pesos elemPick) em vez de escrito a mao: a lista antiga esquecia o
   `avatar`, que tem elemPick 1.3, e por isso nao havia como pedir "avatar de fire" --
   sem escolha o otimizador subia as tres escadas de elemento do sorcerer em paralelo. */
const ELEM_OBJS = E.elementObjs();
/* os objetivos agrupados pelo CENARIO em que ganham, que e' a divisao que a analise
   comparativa mostrou importar: Avatar domina o 1v1 (boss) mas cai abaixo do Damage
   num pack; o AoE e' o inverso. Chip solto nao comunica isso e leva a escolha errada. */
const OBJ_GROUPS = [
  { label:'Single target · boss', objs:['dano','critico','avatar','atkspeed'] },
  { label:'Pack · hunt',          objs:['aoe','puller','xp'] },
  { label:'Defense & support',    objs:['tank','healer','curadano'] },
];

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
  { label:"Knight",          voc:'knight',   level:500, obj:'dano', element:E.defaultElement('knight'), perks:[], perksOpen:false, forcePerks:false },
  { label:"Elder Druid",     voc:'druid',    level:500, obj:'dano', element:E.defaultElement('druid'), perks:[], perksOpen:false, forcePerks:false },
  { label:"Master Sorcerer", voc:'sorcerer', level:500, obj:'dano', element:E.defaultElement('sorcerer'), perks:[], perksOpen:false, forcePerks:false },
];
let state = loadState();

function loadState(){
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && Array.isArray(raw.slots) && raw.slots.length === 3) {
      // estado salvo antes desta versao pode ter objetivo que a vocacao nao oferece
      return { slots: raw.slots.map((s,i)=>sanitizeSlot({ ...DEFAULT_SLOTS[i], ...s })), tab: raw.tab || 'builds' };
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

  const objBtns = OBJ_GROUPS.map(g => {
    const keys = g.objs.filter(k => E.objAvailable(s.voc, k));
    if (!keys.length) return '';                            // grupo inteiro indisponivel
    const chips = keys.map(k => {
      const o = OBJS.find(x => x.key === k);
      return `<div class="obj${k===s.obj?' on':''}" data-obj="${k}">${o.label}</div>`;
    }).join('');
    return `<div class="objgroup"><span class="objgroup-k">${g.label}</span>
      <div class="objs">${chips}</div></div>`;
  }).join('');

  const els = E.damageElements(s.voc);
  const showElem = ELEM_OBJS.includes(s.obj) && els.length >= 2;
  /* 'No element' substitui o antigo 'All elements'. "Todos" era dominado: valorizava
     os tres elementos igualmente e mandava o otimizador subir tres escadas, quando o
     personagem ataca com um. Medido no sorcerer/avatar/lv1500, 'none' rende mais que
     'all' ATE pra quem ataca com fire (5.80 vs 5.63). */
  const elemOptions = ['none', ...els].map(e =>
    `<option value="${e}"${e===s.element?' selected':''}>${e==='none'?'No element':ELNAME[e]||e}</option>`).join('');
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
    <div class="field"><span class="k">Objective</span><div class="objgroups">${objBtns}</div></div>
    <div class="field" data-role="elemfield" style="${showElem?'':'display:none'}">
      <span class="k">Damage element</span><select data-role="element">${elemOptions}</select></div>
    <div class="field">
      <button type="button" class="perks-h" data-role="perks-toggle" aria-expanded="${s.perksOpen?'true':'false'}">
        <span class="perks-caret">${s.perksOpen?'▾':'▸'}</span>
        <span class="perks-t">Perks to prioritize</span>
        <span class="perks-n" data-role="perks-n">${perkCountLabel(s)}</span>
      </button>
      <div class="perks" data-role="perks"${s.perksOpen?'':' hidden'}>${perkRows(s)}</div>
    </div>
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
    sanitizeSlot(s);
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
  el.querySelector('[data-role=warn]').addEventListener('change', e=>{
    if (!e.target.matches('[data-role=force]')) return;
    s.forcePerks = e.target.checked; save(); recompute(el, s);
  });
  el.querySelector('[data-role=perks-toggle]').addEventListener('click', ()=>{
    s.perksOpen = !s.perksOpen; save();
    const box = el.querySelector('[data-role=perks]');
    const btn = el.querySelector('[data-role=perks-toggle]');
    box.hidden = !s.perksOpen;
    btn.setAttribute('aria-expanded', s.perksOpen ? 'true' : 'false');
    el.querySelector('.perks-caret').textContent = s.perksOpen ? '▾' : '▸';
  });
  /* delegado no container: o stepper reescreve só o número da linha, mas o handler
     precisa sobreviver a isso de qualquer jeito. */
  el.querySelector('[data-role=perks]').addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-tac]');
    if (!b) return;
    const n = tacticsNode(s.voc);
    if (!n) return;
    s.tactics = Math.max(0, Math.min(n.maxRank, tacticsWant(s) + Number(b.dataset.tac)));
    updateTacticsRow(el, s);
    save(); recompute(el, s);   // igual aos perks: recalcula sem re-render, pra lista nao fechar
  });
  el.querySelectorAll('[data-perk]').forEach(cb => cb.addEventListener('change', ()=>{
    const id = cb.dataset.perk;
    s.perks = cb.checked ? [...(s.perks||[]), id] : (s.perks||[]).filter(x => x !== id);
    cb.closest('.perk').classList.toggle('on', cb.checked);
    el.querySelector('[data-role=perks-n]').textContent = perkCountLabel(s);
    save(); recompute(el, s);   // so recalcula: nao re-renderiza, pra a lista nao fechar
  }));
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

/* o objetivo escolhido depende de stats que a arvore pode nao ter (cura so existe
   no druid, cleave so no knight...). em vez de esconder o botao ao trocar de vocacao,
   o autobuild degrada pro mais proximo e a gente avisa aqui o que aconteceu.
   detectado da arvore, nao hardcoded por vocacao -> sobrevive ao re-sync. */
/* se a vocacao mudou e o objetivo escolhido nao existe mais nela, cai no Damage. */
function sanitizeSlot(s){
  if (!E.objAvailable(s.voc, s.obj)) s.obj = 'dano';
  /* 'all' e' estado salvo de versao anterior: migra pro padrao da vocacao (physical no
     knight/monk, 'none' onde ha escolha a fazer). Mesmo caminho serve pra quando a
     vocacao muda e o elemento escolhido nao existe na arvore nova. */
  if (s.element === 'all' || (s.element !== 'none' && !E.damageElements(s.voc).includes(s.element)))
    s.element = E.defaultElement(s.voc);
  // os ids de perk sao por arvore: trocar de vocacao descarta o que nao existe na nova
  const ids = new Set(E.perkNodes(s.voc).map(n => n.id));
  s.perks = (s.perks || []).filter(id => ids.has(id));
  /* o marker tambem e' por arvore (o maxRank vem do no). null continua sendo "segue o
     objetivo" -- estado salvo antes desta versao cai ai, sem bump do LS_KEY. */
  const tn = tacticsNode(s.voc);
  if (s.tactics != null)
    s.tactics = tn ? Math.max(0, Math.min(tn.maxRank, Math.floor(s.tactics) || 0)) : null;
  return s;
}

/* efeito do perk em uma linha, reusando os mesmos formatadores do resumo. */
function perkEffect(n){
  const bits = [];
  if (n.per) {
    for (const k of SORD) if (n.per[k]) bits.push(SL[k] ? SL[k](fmtNum(n.per[k])) : `${k} +${n.per[k]}`);
    const ed = n.per.elementDmgPct;
    if (ed) for (const e of ELORD) if (ed[e]) bits.push(`+${fmtNum(ed[e])}% ${ELNAME[e]||e}`);
    const ab = n.per.absorbPct;
    if (ab) {
      const keys = ELORD.filter(e => ab[e]);
      const uniform = keys.length > 1 && keys.every(e => Math.abs(ab[e]-ab[keys[0]]) < 0.001);
      bits.push(uniform ? `+${fmtNum(ab[keys[0]])}% absorb (all)`
        : keys.map(e => `+${fmtNum(ab[e])}% ${ELNAME[e]||e} absorb`).join(' · '));
    }
  }
  if (n.special) bits.push(SPL[n.special.key] ? SPL[n.special.key](fmtNum(n.special.value)) : n.special.key);
  return bits.join(' · ');
}

function perkCountLabel(s){
  const n = (s.perks||[]).length, t = tacticsWant(s);
  const bits = [];
  if (t) bits.push(`tactics r${t}`);
  if (n) bits.push(`${n} perk${n===1?'':'s'}`);
  return bits.length ? bits.join(' · ') : 'none';
}

/* BATTLE TACTICS — o marker de rank no topo da lista.

   O nó é `kind:'small'` (rank 1-10, custo triangular), então ele não entra em
   `perkNodes` e não teria como ser um checkbox: 0-10 é um número, não um sim/não.
   Por isso a linha é fixa e vem com stepper, em vez de aparecer só quando marcada.

   `s.tactics` ausente = a build nunca tocou no controle e segue o default do OBJETIVO
   (E.defaultTactics: r3 em quem farma sozinho, 0 no resto). No primeiro clique o número
   vira escolha da build e para de seguir o objetivo — senão trocar de objetivo
   sobrescreveria em silêncio o que você acabou de pedir.

   `tacticsNode` é declaração e não `const` de propósito: o `sanitizeSlot` chama ela de
   dentro do `loadState()`, que roda no init do módulo — antes desta linha. Como `const`
   dava TDZ, e o `catch` do loadState ("storage corrompido: ignora") engolia o erro: quem
   já tinha build salva perdia as três em silêncio e caía nos slots padrão. Coberto no
   tools/check-builds-view.js. */
function tacticsNode(voc){
  const id = E.tacticsNodeId(voc);
  return id ? TREES[voc].find(n => n.id === id) : null;
}
function tacticsWant(s){
  const n = tacticsNode(s.voc);
  if (!n) return 0;
  const w = s.tactics == null ? E.defaultTactics(s.obj) : s.tactics;
  return Math.max(0, Math.min(n.maxRank, Math.floor(w) || 0));
}
function tacticsRow(s){
  const n = tacticsNode(s.voc);
  if (!n) return '';
  const want = tacticsWant(s);
  return `<div class="perk tac${want?' on':''}" data-role="tac-row">
    <span class="perk-b">
      <span class="perk-top"><span class="perk-name">${esc(n.name)}</span>
        <span class="perk-cost" data-role="tac-cost">${E.totalCost(n, want)}</span></span>
      <span class="perk-eff">Aim, positioning and reaction — rank 3 kites forever without a tank</span>
    </span>
    <span class="tac-step">
      <button type="button" class="tac-b" data-tac="-1" aria-label="Lower Battle Tactics"${want<=0?' disabled':''}>−</button>
      <span class="tac-n" data-role="tac-n">${want}</span>
      <button type="button" class="tac-b" data-tac="1" aria-label="Raise Battle Tactics"${want>=n.maxRank?' disabled':''}>+</button>
    </span>
  </div>`;
}
/* atualiza a linha no lugar em vez de re-renderizar a lista: um innerHTML novo
   descartaria os listeners dos checkboxes de perk e fecharia o scroll onde estava. */
function updateTacticsRow(el, s){
  const n = tacticsNode(s.voc), row = el.querySelector('[data-role=tac-row]');
  if (!n || !row) return;
  const want = tacticsWant(s);
  row.classList.toggle('on', want > 0);
  row.querySelector('[data-role=tac-n]').textContent = want;
  row.querySelector('[data-role=tac-cost]').textContent = E.totalCost(n, want);
  row.querySelectorAll('[data-tac]').forEach(b => {
    b.disabled = (+b.dataset.tac < 0) ? want <= 0 : want >= n.maxRank;
  });
  el.querySelector('[data-role=perks-n]').textContent = perkCountLabel(s);
}
function perkRows(s){
  return tacticsRow(s) + E.perkNodes(s.voc).map(n => {
    const on = (s.perks||[]).includes(n.id);
    return `<label class="perk${on?' on':''}">
      <input type="checkbox" data-perk="${n.id}"${on?' checked':''}>
      <span class="perk-b">
        <span class="perk-top"><span class="perk-name">${esc(n.name)}</span><span class="perk-cost">${n.cost}</span></span>
        <span class="perk-eff">${esc(perkEffect(n))}</span>
      </span></label>`;
  }).join('');
}

function recompute(el, s){
  const build = E.autobuild(s.voc, s.level, s.obj,
    { element: s.element, perks: s.perks || [], forcePerks: !!s.forcePerks, tactics: tacticsWant(s) });
  el.querySelector('[data-role=code]').value = E.encode(s.voc, build.ranks, s.level);

  const warn = el.querySelector('[data-role=warn]');
  const nameOfNode = id => (TREES[s.voc].find(n => n.id === id) || {}).name || id;
  const P = build.perks || { reached:[], missing:[], unaffordable:[], forced:false };
  const hasPerks = (s.perks||[]).length > 0;
  // "nao cabe no level" e "cabia mas nao valeu" sao problemas diferentes: o primeiro
  // nao tem solucao a nao ser subir de level, e forcar nao muda nada. Por isso o
  // checkbox de forcar so e' oferecido no segundo caso.
  const tooExpensive = P.unaffordable.map(nameOfNode);
  const notWorth = P.missing.filter(id => !P.unaffordable.includes(id)).map(nameOfNode);
  const plural = n => n === 1 ? 'perk' : 'perks';

  let msg = null;
  if (s.obj === 'avatar' && !build.reachedAvatar) {
    msg = 'Level too low to reach the Avatar node — built the best damage setup with the available points.';
  } else if (tooExpensive.length) {
    msg = `Level too low for ${tooExpensive.join(', ')} — the path alone costs more than your points.`;
  } else if (notWorth.length) {
    msg = s.forcePerks
      ? `Even forced, ${notWorth.join(', ')} does not fit alongside your other picks at this level.`
      : `${notWorth.join(', ')} left out: at this level the points cost more than the perk gives back.`;
  }
  // o controle de forcar fica visivel enquanto estiver ligado, senao nao daria pra
  // desligar depois que o aviso que o ofereceu desaparece.
  const forceRow = (hasPerks && (notWorth.length || s.forcePerks))
    ? `<label class="forcebox"><input type="checkbox" data-role="force"${s.forcePerks?' checked':''}>
        <span>Take ${(s.perks||[]).length===1?'it':'them'} anyway — build the rest around ${(s.perks||[]).length===1?'it':'them'}</span></label>`
    : '';
  // !msg: se ja existe um aviso, o forceRow vai nele -- senao dois checkboxes iguais
  // renderizariam juntos (ex.: preset Avatar em level baixo + perks forcados).
  const forcedNote = (!msg && s.forcePerks && hasPerks && !notWorth.length && !tooExpensive.length)
    ? `Forcing ${P.reached.length} ${plural(P.reached.length)} — the rest of the build is shaped around ${P.reached.length===1?'it':'them'}.`
    : null;
  // acima do custo total da arvore todo objetivo produz a MESMA build (tudo maxado),
  // entao trocar de botao deixa de fazer efeito -- melhor dizer isso que deixar o
  // usuario clicando sem entender.
  const cap = E.fullCost(s.voc);
  /* o marker e' garantia, entao a UNICA razao pra voltar abaixo do pedido e' o level nao
     pagar a escada (custo triangular: r10 sozinho ja custa 110 pontos). Aviso proprio, e
     nao no msg dos perks, porque os dois podem acontecer na mesma build. */
  const T = build.tactics || { want:0, got:0 };
  const tacMsg = T.got < T.want
    ? `Level too low for Battle Tactics r${T.want} — the path plus the ranks cost more than your points. Built r${T.got}.`
    : null;
  const capped = s.level >= cap
    ? `Level ${s.level.toLocaleString('en-US')} maxes this entire tree (${cap.toLocaleString('en-US')} points) — every objective builds the same thing from here.`
    : null;
  warn.innerHTML =
      (msg ? `<div class="warn">${esc(msg)}${forceRow}</div>` : '')
    + (forcedNote ? `<div class="info">${esc(forcedNote)}${forceRow}</div>` : '')
    + (tacMsg ? `<div class="warn">${esc(tacMsg)}</div>` : '')
    + (capped ? `<div class="info">${esc(capped)}</div>` : '');

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
    sustain: b.spellHealPct ? SL.spellHealPct(fmtNum(b.spellHealPct)) : (b.lifeLeech ? SL.lifeLeech(fmtNum(b.lifeLeech)) : (b.hpRegenPct ? SL.hpRegenPct(fmtNum(b.hpRegenPct)) : null)),
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
  const upt = E.avatarUptime(voc, build.ranks);
  for (const n of TREES[voc]) {
    if (n.special && (build.ranks[n.id]||0) >= 1) {
      const s2 = SPL[n.special.key] ? SPL[n.special.key](fmtNum(n.special.value*(build.ranks[n.id]||1))) : '';
      // no Avatar a chance por hit sozinha nao diz nada: o que importa e' quanto do
      // tempo a build passa na forma -- e' o uptime que faz o crit damage compensar.
      const extra = (n.special.key==='avatar' && upt>0)
        ? `<b>~${Math.round(upt*100)}% uptime</b> — always crits while active`
        : '';
      specialPills.push(`<div class="pill2 sp">★ ${esc(n.name)}${s2?` — ${s2}`:''}${extra?` · ${extra}`:''}</div>`);
    }
  }
  const pillsHtml = pills.map(p=>`<div class="pill2">${p}</div>`).join('') + specialPills.join('');

  const titleEl = (ELEM_OBJS.includes(s.obj) && s.element!=='none') ? ` / ${ (ELNAME[s.element]||s.element).toUpperCase() }` : '';
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
/* O nonce na query e' o que garante recarga DE VERDADE a cada clique. Sem ele o src ia
   de "...html#A" pra "...html#B", o que troca so o fragmento e nao recarrega o
   documento -- a build certa aparecia apenas no primeiro clique. Trocar a query forca
   load novo sempre, o que tambem resolve reabrir o MESMO codigo depois de mexer na
   arvore na mao (a build volta como foi gerada, em vez de manter a ediçao).
   O simuladorbuild.html tambem passou a escutar hashchange, o que o deixa correto por
   conta propria; aqui a recarga e' o caminho deterministico. */
let simNonce = 0;
function openInSimulator(code){
  frames.sim.src = `${iframeSrc.sim}?n=${++simNonce}#${code}`;
  switchTab('sim');
}

/* ---------- util ---------- */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

/* ---------- boot ---------- */
render();
switchTab(state.tab || 'builds');
})();
