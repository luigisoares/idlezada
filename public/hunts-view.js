/* hunts-view.js — aba Hunts: recomenda hunts pelo level + DPS colado (Session).
   XP/h real = XP/clear × rate × share × 3600 × partyDPS / HP_total.

   Também responde as duas perguntas de dano da hunt, via hunt-model.js:
   qual ELEMENTO o pack apanha melhor, e qual CHARM rende mais em cada monstro.
   Esses dois dependem do personagem, que vem dos slots da aba Builds (level,
   crit, uptime do Avatar, element_pierce) — por isso os chips de personagem aqui
   SELECIONAM um char, não só jogam o level no input.

   Depende de hunts.js (window.HUNTS), xprates.js (window.XPRATES),
   charms.js (window.CHARMS), hunt-model.js (window.HuntModel) e engine.js. */
(function () {
'use strict';
const HUNTS = window.HUNTS || [];
const XP = window.XPRATES || {};
const HM = window.HuntModel;
const CHARMS = window.CHARMS || [];
const E = window.Engine;
const grid = document.getElementById('hunts-table');
const levelInp = document.getElementById('hunt-level');
const charsEl = document.getElementById('hunt-chars');
const partyToggle = document.getElementById('hunt-party');
const sortSel = document.getElementById('hunt-sort');
const rateEl = document.getElementById('hunt-rate');
const recoEl = document.getElementById('hunt-reco');
const dpsInp = document.getElementById('hunt-dps');
const dpsInfo = document.getElementById('hunt-dpsinfo');
if (!grid) return;

const open = new Set();
const nf = n => Number(n || 0).toLocaleString('en-US');
const nfShort = n => { n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n); };
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ---------- DPS (colar Session) ---------- */
const DPS_KEY = 'idlezada.huntDps.v1';
let dps = loadDps();
/* re-parseia o texto guardado em vez de confiar no `perChar` salvo: quando a regra
   de parse melhora, a Session que você já colou passa a ser lida certo sozinha. */
function loadDps(){
  const empty = { total:0, perChar:{}, text:'' };
  try {
    const d = JSON.parse(localStorage.getItem(DPS_KEY));
    if (!d || typeof d !== 'object') return empty;
    return d.text ? parseDps(d.text) : Object.assign({}, empty, d);
  } catch(e){ return empty; }
}
function saveDps(){ try { localStorage.setItem(DPS_KEY, JSON.stringify(dps)); } catch(e){} }
function parseNum(s){ s = String(s).trim(); return s.includes(',') ? (parseFloat(s.replace(/\./g,'').replace(',','.'))||0) : (parseInt(s.replace(/\./g,''),10)||0); }
/* O rótulo é a LINHA INTEIRA antes do número, ancorada com /m. Sem a âncora (era
   `[A-Za-z]{2,4}`) um nome de personagem entrava truncado nas últimas 4 letras --
   "Luigi" virava "UIGI" -- e aí nada casava com ele depois. Sigla de vocação, nome
   completo e nome com espaço passam pela mesma regra. */
function parseDps(text){
  const perChar = {}; let total = 0;
  const re = /^[ \t]*([A-Za-z][A-Za-z '\-]{0,23})[ \t]*[\r\n]+[ \t]*([\d.,]+)\s*\/s/gm; let m;
  while ((m = re.exec(text))) {
    const v = parseNum(m[2]);
    if (!v) continue;
    perChar[m[1].trim().toUpperCase()] = v;
    total += v;
  }
  if (!total) { const re2 = /([\d.,]+)\s*\/s/g; while ((m = re2.exec(text))) total += parseNum(m[2]); }
  return { total, perChar, text };
}
function dpsInfoText(){
  if (!dps.total) return 'no DPS set — paste your Session to rank by real XP/h';
  const parts = Object.entries(dps.perChar).map(([k,v]) => `${k} ${nf(v)}`).join(' · ');
  return `Party DPS ${nf(dps.total)}/s` + (parts ? ` · ${parts}` : '');
}

/* o que o comparativo de charms está usando — se o número sai daqui, tem que aparecer */
function ctxInfoText(ctx){
  const crit = ctx.up >= 0.995
    ? `always crits (Avatar)`
    : `crit ${Math.round(ctx.cc)}%/+${Math.round(ctx.cd)}%${ctx.up > 0 ? ` · Avatar ${Math.round(ctx.up*100)}% uptime` : ''}`;
  /* de onde saiu o DPS deste personagem importa: "party total" infla o dano por
     golpe e portanto SUBESTIMA os charms de dano fixo. Melhor dizer do que fingir. */
  const own = !ctx.dps ? 'no own DPS'
    : ctx.dpsSrc === 'total' ? `${nf(ctx.dps)}/s <b>party total</b> — paste splits per character for a sharper number`
    : ctx.dpsSrc === 'solo' ? `${esc(ctx.dpsTag)} ${nf(ctx.dps)}/s (only entry in the paste)`
    : `${esc(ctx.dpsTag)} ${nf(ctx.dps)}/s`;
  return `${esc(ctx.label)}: ${crit} · ${own}`;
}

/* ---------- rates / party ---------- */
function rateFor(level){ for (const b of (XP.xpRatesByLevel||[])) if (level>=b.min && (b.max==null||level<=b.max)) return b.mult; return 1; }
const share = () => (partyToggle && partyToggle.checked && XP.party) ? XP.party.leaderXpShare : 1;

/* ---------- personagem selecionado (vem dos slots da aba Builds) ---------- */
const VOC_TAG = { knight:'EK', paladin:'RP', sorcerer:'MS', druid:'ED', monk:'MK' };
let chars = [], charIdx = 0;

function loadChars(){
  try { const raw = JSON.parse(localStorage.getItem('idlezada.builds.v3'));
    if (raw && Array.isArray(raw.slots)) return raw.slots.map(s => ({
      label: s.label || s.voc, level: s.level || 1, voc: s.voc, obj: s.obj,
      element: s.element, perks: s.perks || [], forcePerks: !!s.forcePerks })); } catch (e) {}
  return [];
}

/* autobuild é caro pro render de 79 hunts, e o slot só muda quando o usuário mexe
   na outra aba — então o contexto de combate fica em cache pela assinatura do slot. */
const ctxCache = {};
function charCtx(level){
  const c = chars[charIdx];
  if (!c || !E || !HM) return null;
  /* o level que vale é o do campo: mexer nele é planejar noutro level, e aí a
     própria build muda (mais pontos = mais crit), não só o dano do proc. */
  const lv = Math.max(1, level || c.level);
  const key = [c.voc, lv, c.obj, c.element, (c.perks||[]).join('.'), c.forcePerks].join('|');
  if (!ctxCache[key]) {
    let ctx;
    try {
      const b = E.autobuild(c.voc, lv, c.obj, { element: c.element, perks: c.perks, forcePerks: c.forcePerks });
      const a = E.aggregate(c.voc, b.ranks);
      const v = E.valueCtx(c.voc, b.ranks);
      ctx = { level: lv, cc: v.cc, cd: v.cd, up: v.up,
        pierce: a.spec.element_pierce || 0,
        aps: 1 + (a.bonus.attackSpeedPct || 0) / 100 };
    } catch (e) { ctx = { level: lv, cc: 0, cd: 0, up: 0, pierce: 0, aps: 1 }; }
    ctxCache[key] = ctx;
  }
  /* o DPS não entra no cache: muda quando o usuário cola outra Session */
  const own = ownDps(c);
  return Object.assign({}, ctxCache[key], { dps: own.dps, dpsTag: own.tag, dpsSrc: own.src,
    label: c.label, voc: c.voc });
}

/* qual fatia do DPS colado é DESTE personagem.
   A Session não tem formato fixo: às vezes vem a sigla da vocação (EK/RP/MS/ED/MK),
   às vezes o nome do personagem, às vezes só um total. Casar só pela sigla deixava
   `dps: 0` num paste perfeitamente válido — e aí o modelo descartava todo charm de
   dano fixo e o plano vinha com uma linha só. A ordem abaixo vai do mais específico
   pro mais frouxo, e `src` diz qual acertou pra a barra não mentir. */
function ownDps(c){
  const tag = VOC_TAG[c.voc];
  if (tag && dps.perChar[tag]) return { dps: dps.perChar[tag], tag, src: 'voc' };
  const label = String(c.label || '').trim().toUpperCase();
  for (const k of [label, label.split(/\s+/)[0]]) {
    if (k && dps.perChar[k]) return { dps: dps.perChar[k], tag: k, src: 'label' };
  }
  const keys = Object.keys(dps.perChar);
  /* uma entrada só: é o próprio jogador, qualquer que seja o rótulo dele */
  if (keys.length === 1) return { dps: dps.perChar[keys[0]], tag: keys[0], src: 'solo' };
  /* nenhuma entrada nomeada mas há total: o parse caiu no fallback de "só números" */
  if (!keys.length && dps.total) return { dps: dps.total, tag: null, src: 'total' };
  return { dps: 0, tag: null, src: null };
}

function renderChars(){
  chars = loadChars();
  if (charIdx >= chars.length) charIdx = 0;
  charsEl.innerHTML = chars.map((c, i) =>
    `<button class="charpick${i === charIdx ? ' on' : ''}" data-idx="${i}">${esc(c.label)} <b>${c.level}</b></button>`).join('');
}

/* ---------- charms que eu tenho, e quantos slots ----------
   O plano só serve se for executável hoje: charm que você não tem não entra. E
   slot (criaturas com charm ao mesmo tempo) é limite de CONTA — 2 free, 6 VIP, 25
   com a Charm Expansion — então ele é escolha do jogador, não constante do jogo. */
const CFG_KEY = 'idlezada.charmCfg.v1';
const SLOT_OPTS = [{ n:2, tag:'free' }, { n:6, tag:'VIP' }, { n:25, tag:'expansion' }];
const MISSING_DEFAULT = ['low_blow', 'carnage'];
const cfgToggle = document.getElementById('charm-cfg-toggle');
const cfgBody = document.getElementById('charm-cfg');
let cfg = loadCfg();

function loadCfg(){
  const all = CHARMS.map(c => c.key);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(CFG_KEY)); } catch(e){}
  const owned = saved && Array.isArray(saved.owned)
    ? saved.owned.filter(k => all.indexOf(k) >= 0)
    : all.filter(k => MISSING_DEFAULT.indexOf(k) < 0);
  const slots = saved && SLOT_OPTS.some(o => o.n === saved.slots) ? saved.slots : (HM ? HM.CHARM_SLOTS : 25);
  return { owned, slots };
}
function saveCfg(){ try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch(e){} }

function renderCfg(){
  if (!cfgToggle) return;
  const missing = CHARMS.length - cfg.owned.length;
  cfgToggle.setAttribute('aria-expanded', String(!cfgBody.hidden));
  cfgToggle.innerHTML = `<span class="perks-caret">${cfgBody.hidden ? '▸' : '▾'}</span>`
    + `<span class="perks-t">my charms</span>`
    + `<span class="perks-n">${missing ? missing + ' missing' : 'all ' + CHARMS.length} · ${cfg.slots} slots</span>`;
  if (cfgBody.hidden) return;
  const group = cat => CHARMS.filter(c => c.category === cat).map(c =>
    `<button class="cchip${cfg.owned.indexOf(c.key) >= 0 ? ' on' : ''}" data-charm="${esc(c.key)}"
      title="${esc(c.desc || '')}">${c.element ? elChip(c.element) : ''}${esc(c.name)}</button>`).join('');
  cfgBody.innerHTML = `
    <div class="cfg-line"><span class="cfg-k">Major</span><div class="cfg-chips">${group('major')}</div></div>
    <div class="cfg-line"><span class="cfg-k">Minor</span><div class="cfg-chips">${group('minor')}</div></div>
    <div class="cfg-line"><span class="cfg-k">Slots</span><div class="cfg-chips">${SLOT_OPTS.map(o =>
      `<button class="cchip${cfg.slots === o.n ? ' on' : ''}" data-slots="${o.n}">${o.n} <em>${o.tag}</em></button>`).join('')}</div>
      <span class="cfg-note">creatures holding a charm at once — account-wide, not per hunt</span></div>`;
}

/* ---------- métricas ---------- */
function metrics(level, ctx){
  const rate = rateFor(level), sh = share(), D = dps.total || 0;
  return HUNTS.map(h => {
    const els = HM ? HM.huntElements(h, ctx || {}) : [];
    const xpVal = Math.round(h.xpPerClear * rate * sh);
    const xpMinVal = Math.round((h.xpMin ?? h.xpPerClear) * rate * sh);
    const xpMaxVal = Math.round((h.xpMax ?? h.xpPerClear) * rate * sh);
    const xph = (D > 0 && h.hpPerClear) ? Math.round(xpVal * 3600 * D / h.hpPerClear) : 0;
    const clearSec = (D > 0 && h.hpPerClear) ? h.hpPerClear / D : 0;
    return { ...h, feasible: level >= h.minLevel, xpVal, xpMinVal, xpMaxVal, xph, clearSec,
      goldVal: h.goldPerClear, els };
  });
}
function sortRows(rows, mode){
  const by = {
    xph:  (a,b)=> (b.xph - a.xph) || (b.xpVal - a.xpVal),
    xp:   (a,b)=> b.xpVal - a.xpVal,
    gold: (a,b)=> b.goldVal - a.goldVal,
    level:(a,b)=> a.minLevel - b.minLevel,
  }[mode] || ((a,b)=> (b.xph - a.xph) || (b.xpVal - a.xpVal));
  return rows.slice().sort(by);
}
const monLabel = h => h.monsters.slice(0,3).map(m => m.name).join(', ');
const fmtClear = s => s ? (s>=60 ? Math.floor(s/60)+'m'+String(Math.round(s%60)).padStart(2,'0')+'s' : Math.round(s)+'s') : '—';

/* ---------- elementos e charms ---------- */
const pct = x => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x * 1000) / 10) + '%';
const elChip = (el, extra) => `<span class="el el-${esc(el)}">${esc(el)}${extra ? ` <b>${extra}</b>` : ''}</span>`;

/* melhor elemento da hunt, pro chip da tabela */
function bestEl(h){
  const top = (h.els || []).filter(e => !e.immune)[0];
  if (!top) return '<span class="el-empty">all immune</span>';
  const flat = (h.els || []).every(e => Math.abs(e.mult - 1) < 0.005);
  if (flat) return '<span class="el-empty">no bias</span>';
  return elChip(top.el, (Math.round(top.mult * 100) / 100).toFixed(2) + '×');
}

/* resistências de um monstro: fraqueza primeiro, que é o que interessa */
function resistChips(m){
  const r = m.resist || {};
  const rows = HM.ELEMENTS.filter(el => r[el]).sort((a, b) => r[a] - r[b]);
  if (!rows.length) return '<span class="el-empty">no resistances</span>';
  return rows.map(el => `<span class="rs ${r[el] < 0 ? 'weak' : 'hard'}">${elChip(el)}<i>${r[el] > 0 ? '+' : ''}${r[el]}</i></span>`).join('');
}

/* ---------- o plano da hunt ----------
   Uma linha por criatura: que charm Maior e que Menor prender nela. O charm mora
   numa criatura só, então isto é uma atribuição, não um ranking — quem resolve é o
   HM.huntCharmPlan. Aqui só se desenha o resultado. */

/* rótulo do que um Menor entrega quando não é dano (Gut é drop, Scavenge é gold):
   não existe câmbio honesto entre "+20% de gold" e "+6% de dano", então em vez de
   um número comparável sai a unidade dele. */
const MINOR_TAG = { gut:'drop chance', scavenge:'gold', adrenaline_burst:'your speed on hit',
  vampiric_embrace:'life leech', cripple:'slow', numb:'slow attacker',
  void_inversion:'mana shield', voids_call:'mana leech', bless:'death penalty' };

const charmChip = c => `${c.element ? elChip(c.element) : ''}<b>${esc(c.name)}</b> <span class="pl-t">T${c.tier}</span>`;

/* ganho pequeno demais pra arredondar: "+0%" mente (não é zero), e a casa decimal
   extra não muda decisão nenhuma. */
const pctTiny = x => Math.abs(x) < 0.0005 ? '≈0%' : pct(x);

const fmtMult = x => '×' + (Math.round(x * 100) / 100).toFixed(2);

function planCharm(c){
  if (!c) return '<span class="pl-none">—</span>';
  /* charm colocado por resistência (sem DPS pro número): mostra o que se sabe —
     o quanto o bicho apanha desse elemento — em vez de um ganho inventado. */
  const val = c.blind ? `<em class="pl-q">${fmtMult(c.mult)} taken · no % without your DPS</em>`
    : c.gain != null && c.gain > 0 ? `<i>${pctTiny(c.gain)}</i>`
    : MINOR_TAG[c.key] ? `<em>+${c.value}% ${esc(MINOR_TAG[c.key])}</em>`
    : c.note ? `<em>${esc(c.note)}</em>` : '';
  const cost = c.points != null ? `${nfShort(c.points)} pts` : `${nfShort(c.echoes)} ech`;
  return `<span class="pl-charm${c.marginal ? ' thin' : ''}" title="${esc(c.desc || '')}">
    ${charmChip(c)} ${val} <u>${cost}</u></span>`;
}

/* As notas do plano. Uma nota por FATO, não por linha: um charm mora numa criatura
   só, então "com Low Blow seria melhor" é uma frase, não quatro. Notas de charm
   marcado como migalha não entram — discutir o tier de algo que rende 0,02% é o
   que deixava esta seção ilegível. Teto de MAX_NOTES pra não voltar a crescer. */
const MAX_NOTES = 4;
const ELEM_PLAUSIBLE = 10;   // acima disso o elemental não é "quase", é outra ordem

function planNotes(plan){
  const out = [];
  const real = plan.rows.filter(r => r.major && !r.major.marginal);
  if (plan.needsDps) out.push('the elemental charms below are placed by <b>resistance</b> only — paste your DPS above to also get how much each one is worth');

  /* O charm que falta: só o melhor par (charm, criatura) do plano inteiro. O peso é
     ganho × fatia do clear, não o ganho cru — Low Blow rende o mesmo em qualquer
     bicho, então quem decide onde ele iria é onde você gasta tempo batendo. */
  let lock = null, lockVal = 0;
  for (const r of plan.rows){
    if (!r.locked) continue;
    const v = r.locked.gain * r.creature.share;
    if (v > lockVal) { lockVal = v; lock = r; }
  }
  if (lock) out.push(`<b>${esc(lock.locked.name)}</b> is unchecked in <em>my charms</em> — it would give ${pct(lock.locked.gain)} on ${esc(lock.creature.name)}`
    + (lock.major ? ` instead of ${pct(lock.major.gain)}` : ''));

  /* tier/alternativa mais barata: só nos charms que rendem de verdade */
  for (const r of real){
    const m = r.major;
    if (m.tierNote) out.push(`<b>${esc(m.name)} T${m.tierNote.tier}</b> on ${esc(r.creature.name)} gives ${pct(m.tierNote.gain)} for ${nfShort(m.tierNote.points)} pts — T${m.tier} wants ${nfShort(m.points)} for ${pct(m.gain)}`);
    else if (m.alt) out.push(`<b>${esc(m.alt.name)}</b> on ${esc(r.creature.name)} gives ${pct(m.alt.gain)} for ${nfShort(m.alt.points)} pts instead of ${nfShort(m.points)}`);
  }

  /* elementais: uma frase pra hunt. Longe do empate isso é um veredito, não um
     "quase" — dizer "1045× mais acertos" finge que existe caminho. */
  const eb = plan.rows.map(r => r.elem).filter(Boolean).sort((a, b) => a.times - b.times)[0];
  if (eb) out.push(eb.times > ELEM_PLAUSIBLE
    ? `elemental charms are noise here: the proc caps at <b>min(2× your level, 5% of target HP)</b>, a flat number that your hit damage outgrows`
    : `<b>${esc(eb.name)}</b> catches up if you land <b>${eb.times.toFixed(1)}×</b> more hits/s than your auto-attack — the proc fires on spells too, which this model does not count`);

  const thin = plan.rows.filter(r => r.major && r.major.marginal);
  if (thin.length) out.push(`crumbs, under 0.1% of the clear: ${thin.map(r => esc(r.major.name) + ' on ' + esc(r.creature.name)).join(', ')} — free if that bestiary is already closed, not worth the grind if it is not`);

  return out.length ? `<div class="pl-notes">${out.slice(0, MAX_NOTES).map(t => `<div>${t}</div>`).join('')}</div>` : '';
}

function planBlock(h, ctx){
  if (!ctx) return '<div class="pl-hint">pick a character above to get the charm plan</div>';
  const plan = HM.huntCharmPlan(h, ctx, { owned: cfg.owned, slots: cfg.slots, charms: CHARMS });
  const threat = HM.huntThreat(h);
  const hit = (h.els || []).filter(e => !e.immune).slice(0, 2);
  const flat = (h.els || []).every(e => Math.abs(e.mult - 1) < 0.005);

  const hitLine = flat || !hit.length
    ? '<span class="el-empty">no element bias in this pack</span>'
    : hit.map(e => elChip(e.el, (Math.round(e.mult * 100) / 100).toFixed(2) + '×')).join(' ');
  const protLine = threat.rows.length
    ? threat.rows.slice(0, 4).map(r => elChip(r.el, Math.round(r.share * 100) + '%')).join(' ')
    : '<span class="el-empty">no damage data</span>';

  const row = r => {
    const c = r.creature;
    const tag = c.isBoss
      ? `<em>wave-10 boss too · ${Math.round(c.share * 100)}% of the clear</em>`
      : `<em>${Math.round(c.share * 100)}% of the clear</em>`;
    const b = r.bestiary;
    return `<div class="pl-row${c.isBoss ? ' boss' : ''}">
      <span class="pl-c">${esc(c.name)} ${tag}</span>
      <span class="pl-maj">${planCharm(r.major)}</span>
      <span class="pl-min">${planCharm(r.minor)}</span>
      <span class="pl-bst" title="a major charm needs this creature's bestiary closed; it then yields ${b.points} charm points">${'★'.repeat(b.stars)} ${nfShort(b.kills)} kills</span>
    </div>`;
  };

  return `<div class="pl">
    <div class="pl-top">
      <span class="pl-lab">Hit with</span><span class="pl-els">${hitLine}</span>
      <span class="pl-lab">Protect from</span><span class="pl-els">${protLine}</span>
      ${threat.healers.length ? `<span class="pl-heal">heals itself: ${threat.healers.map(esc).join(', ')}</span>` : ''}
    </div>
    <div class="pl-rows">${plan.rows.map(row).join('')}</div>
    ${planNotes(plan)}
  </div>`;
}

/* ranking completo de charms de um monstro — o número por tier, pra decidir até
   onde subir. Fica fechado: o plano acima já responde a pergunta do dia a dia. */
function charmRows(m, ctx){
  if (!ctx) return '';
  const rows = HM.charmRanking(m, ctx, CHARMS);
  const line = r => {
    const cost = r.points != null ? `${nfShort(r.points)} pts` : `${nfShort(r.echoes)} echoes`;
    // gain 0 com nota (Carnage no boss) é uma explicação, não um número
    const val = (r.gain == null || (!r.gain && r.note))
      ? `<em class="cm-na">${esc(r.note || 'no estimate')}</em>`
      : `<b>${pct(r.gain)}</b> dps <em>· ${pct(r.gainPerK)} per 1k</em>`;
    return `<div class="cm-row"><span class="cm-n">${r.element ? elChip(r.element) : ''}${esc(r.name)}</span>
      <span class="cm-t">T${r.tier}</span><span class="cm-v">${val}</span><span class="cm-c">${cost}</span></div>`;
  };
  return `<details class="cm-all"><summary>all charms on this monster</summary>
    <div class="cm">${rows.map(line).join('')}</div></details>`;
}

function detail(h, ctx){
  const mons = HM ? HM.packWeights(h) : [];
  const total = mons.reduce((s, x) => s + x.weight, 0) || 1;
  const block = m => `<div class="htd-mon">
      <div class="htd-row${m.boss ? ' boss' : ''}"><span>${esc(m.name)}${m.boss
        ? ' <em>wave-10 boss · in-fight HP ×3 · XP ×2.5</em>'
        : ` <em>${Math.round(m.weight / total * 100)}% of the clear</em>`}</span>
        <span class="num">${nf(m.hp)}</span><span class="num">${nf(m.exp)}</span></div>
      <div class="htd-res">${resistChips(m)}</div>
      ${charmRows(m, ctx)}
    </div>`;
  return `<div class="ht-detail">
    ${planBlock(h, ctx)}
    <div class="htd-row htd-head"><span>Monster (base values)</span><span class="num">HP</span><span class="num">XP</span></div>
    ${mons.map(block).join('')}</div>`;
}

function render(){
  const level = Math.max(1, parseInt(levelInp.value || '1', 10));
  const rate = rateFor(level), sh = share();
  rateEl.textContent = `level ${level} → XP rate ${rate}× · share ${Math.round(sh*100)}%`;
  const ctx = charCtx(level);
  if (dpsInfo) dpsInfo.textContent = dpsInfoText() + (ctx ? ' · ' + ctxInfoText(ctx) : '');
  const hasDps = dps.total > 0;

  const rows = metrics(level, ctx);
  const feasible = rows.filter(r => r.feasible);
  const top = feasible.slice().sort((a,b)=> hasDps ? (b.xph-a.xph) : (b.xpVal-a.xpVal)).slice(0,3);
  recoEl.innerHTML = top.length
    ? `<div class="reco"><div class="reco-h">★ ${hasDps?'Best XP/h':'Top XP'} for level ${level} <span>(${hasDps?'using your pasted DPS':'paste your DPS for real XP/h'})</span></div>
        <div class="reco-list">${top.map((h,i)=>
          `<div class="reco-item${i===0?' win':''}"><span class="rk">#${i+1}</span>
            <span class="rn">${esc(h.name)}</span>
            ${hasDps?`<span class="rm">XP/h <b>${nf(h.xph)}</b></span><span class="rm">clear <b>${fmtClear(h.clearSec)}</b></span>`:''}
            <span class="rm">XP/clear <b>${nf(h.xpVal)}</b> <em>${nfShort(h.xpMinVal)}–${nfShort(h.xpMaxVal)}</em></span>
            <span class="rm">gold <b>${nf(h.goldVal)}</b></span></div>`).join('')}</div></div>`
    : `<div class="reco"><div class="reco-h">No hunt at or below level ${level}.</div></div>`;

  const sorted = sortRows(rows, sortSel.value);
  grid.innerHTML = `<div class="ht-head">
      <span></span><span>Hunt</span><span>Lv</span><span>Monsters</span><span>Best el</span><span class="num">XP/clear</span><span class="num">XP/h</span><span class="num">Gold/clear</span>
    </div>` + sorted.map(h => {
    const isOpen = open.has(h.id);
    return `<div class="ht-item">
      <div class="ht-row${h.feasible?'':' locked'}${isOpen?' open':''}" data-hunt="${esc(h.id)}">
        <span class="caret">${isOpen?'▾':'▸'}</span>
        <span class="hn">${esc(h.name)}</span>
        <span class="hl${h.feasible?'':' bad'}">${h.minLevel}</span>
        <span class="hm">${esc(monLabel(h))}</span>
        <span class="he">${bestEl(h)}</span>
        <span class="num xpc"><b>${nf(h.xpVal)}</b><em>${nfShort(h.xpMinVal)}–${nfShort(h.xpMaxVal)}</em></span>
        <span class="num xph">${hasDps?nf(h.xph):'—'}</span>
        <span class="num">${nf(h.goldVal)}</span>
      </div>${isOpen ? detail(h, ctx) : ''}</div>`;
  }).join('');
}

/* ---------- wiring ---------- */
renderChars();
renderCfg();
if (cfgToggle) cfgToggle.addEventListener('click', () => { cfgBody.hidden = !cfgBody.hidden; renderCfg(); });
if (cfgBody) cfgBody.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.slots) cfg.slots = parseInt(b.dataset.slots, 10);
  else if (b.dataset.charm) {
    const i = cfg.owned.indexOf(b.dataset.charm);
    if (i >= 0) cfg.owned.splice(i, 1); else cfg.owned.push(b.dataset.charm);
  } else return;
  saveCfg(); renderCfg(); render();
});
if (dpsInp) { dpsInp.value = dps.text || ''; dpsInp.addEventListener('input', () => { dps = parseDps(dpsInp.value); saveDps(); render(); }); }
charsEl.addEventListener('click', e => {
  const b = e.target.closest('.charpick');
  if (!b) return;
  charIdx = parseInt(b.dataset.idx, 10) || 0;
  levelInp.value = (chars[charIdx] || {}).level || levelInp.value;
  renderChars(); render();
});
grid.addEventListener('click', e => { const row = e.target.closest('.ht-row'); if (!row) return; const id = row.dataset.hunt; open.has(id)?open.delete(id):open.add(id); render(); });
levelInp.addEventListener('input', render);
if (partyToggle) partyToggle.addEventListener('change', render);
sortSel.addEventListener('change', render);
render();

document.getElementById('navtabs')?.addEventListener('click', e => { if (e.target.closest('[data-view="hunts"]')) { renderChars(); render(); } });
})();
