/* hunts-view.js — aba Hunts: COMPARAR hunts pelo XP que cada personagem faz.

   A pergunta da aba: "nessas hunts que eu estou pensando, quanto XP cada um dos meus
   personagens faz por clear -- e por hora?". Entao:
     - os personagens vem da aba Builds (level e arvore), TODOS ao mesmo tempo: nao
       ha seletor. Cada um tem o seu bonus (XP% da arvore + um extra digitado);
     - o XP/clear e' PREVISTO a partir do jogo (hunts.js) e o XP/hora so existe
       quando o jogador salva quanto tempo leva um clear -- nada de DPS colado;
     - a lista de baixo ranqueia todas as hunts pelo primeiro personagem, e abrir
       uma hunt mostra o plano de charms dele.

   Depende de hunts.js (window.HUNTS), xprates.js (window.XPRATES),
   charms.js (window.CHARMS), hunt-model.js (window.HuntModel) e engine.js. */
(function () {
'use strict';
const HUNTS = window.HUNTS || [];
const XP = window.XPRATES || {};
const HM = window.HuntModel;
const CHARMS = window.CHARMS || [];
const E = window.Engine;
const $ = id => document.getElementById(id);
const grid = $('hunts-table');
const charsEl = $('hunt-chars');
const leadSel = $('hunt-leader');
const vipToggle = $('hunt-vip');
const eventToggle = $('hunt-event');
const eventV = $('hunt-event-v');
const levelWrap = $('hunt-levelwrap');
const levelInp = $('hunt-level');
const qInp = $('hunt-q');
const sugEl = $('hunt-sug');
const cmpEl = $('hunt-compare');
const onlyToggle = $('hunt-only');
const listWho = $('hunt-list-who');
if (!grid) return;

const open = new Set();
const nf = n => Number(n || 0).toLocaleString('en-US');
/* milhao e' KK, como no jogo (4.3KK, nao 4.3M) */
const nfShort = n => { n = Math.round(n || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'KKK';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 2).replace(/\.?0+$/, '') + 'KK';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n); };
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function parseNum(s){ s = String(s).trim(); return s.includes(',') ? (parseFloat(s.replace(/\./g,'').replace(',','.'))||0) : (parseInt(s.replace(/\./g,''),10)||0); }
function loadJSON(k, def){ try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch(e){ return def; } }
function saveJSON(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
const fmtPct = v => (Math.round(v * 10) / 10) + '%';

/* ---------- personagens (aba Builds) ----------
   So os visiveis la (`shown:false` e' o slot escondido). O level e a arvore sao os
   de la: mudou na aba Builds, muda aqui. */
const VOC_COL = { knight:'#ff7a68', paladin:'#ffd46b', sorcerer:'#b98cff', druid:'#76d69a', monk:'#6fd3ee' };
let chars = [];
function loadChars(){
  try { const raw = JSON.parse(localStorage.getItem('idlezada.builds.v3'));
    if (raw && Array.isArray(raw.slots)) return raw.slots.filter(s => s && s.shown !== false).map(s => ({
      label: s.label || s.voc, level: Math.max(1, parseInt(s.level, 10) || 1), voc: s.voc, obj: s.obj,
      element: s.element, perks: s.perks || [], tactics: s.tactics, xp: !!s.xp })); } catch (e) {}
  return [];
}
/* sem personagem nenhum a aba ainda funciona: um "voce" com o level do campo */
function people(){
  if (chars.length) return chars;
  return [{ label: 'You', level: Math.max(1, parseInt(levelInp && levelInp.value || '900', 10) || 900), voc: null, none: true }];
}

/* contexto de combate de um personagem (crit, Avatar, pierce, XP% da arvore) --
   autobuild e' caro, entao cache pela assinatura do slot. O plano de charms nao tem
   DPS aqui: os elementais entram por resistencia. */
const ctxCache = {};
function charCtx(c){
  if (!c || c.none || !E || !HM) return null;
  const key = [c.voc, c.level, c.obj, c.element, (c.perks||[]).join('.'), c.tactics, c.xp].join('|');
  if (!ctxCache[key]) {
    let ctx;
    try {
      /* a MESMA build da aba Builds (perk marcado garantido, marker do Battle Tactics) */
      const b = E.autobuild(c.voc, c.level, c.obj, { element: c.element, perks: c.perks, forcePerks: true,
        tactics: c.tactics == null ? undefined : c.tactics, xp: c.xp });
      const a = E.aggregate(c.voc, b.ranks);
      const v = E.valueCtx(c.voc, b.ranks);
      ctx = { level: c.level, cc: v.cc, cd: v.cd, up: v.up, pierce: a.spec.element_pierce || 0,
        aps: 1 + (a.bonus.attackSpeedPct || 0) / 100, expPct: a.bonus.expPct || 0 };
    } catch (e) { ctx = { level: c.level, cc: 0, cd: 0, up: 0, pierce: 0, aps: 1, expPct: 0 }; }
    ctxCache[key] = ctx;
  }
  return Object.assign({}, ctxCache[key], { dps: 0, hit: 0, label: c.label, voc: c.voc });
}

/* ---------- XP ---------- */
function rateFor(level){ for (const b of (XP.xpRatesByLevel||[])) if (level>=b.min && (b.max==null||level<=b.max)) return b.mult; return 1; }

/* PARTY: o XP do clear e' UM so, da party inteira, e se divide: o lider leva 40% em
   trio (60% em duo) e os outros dividem o resto. E' esse total que o jogador ve no
   jogo (~4.3M na Bloated), entao ele e' o numero principal; a fatia de cada um vem
   embaixo. Cada personagem ganha a fatia dele com o PROPRIO rate de level e o PROPRIO
   bonus -- a soma das fatias e' o total da party. A party sao os 3 primeiros
   personagens visiveis na aba Builds; o lider o jogador escolhe. */
const LEAD_KEY = 'idlezada.huntLeader.v1';
const PARTY_MAX = (XP.party && XP.party.maxMembers) || 3;
let leaderKey = loadJSON(LEAD_KEY, '');
const party = () => people().slice(0, PARTY_MAX);
const leaderIdx = () => Math.max(0, party().findIndex(c => charKey(c) === leaderKey));
function shareOf(i){
  const n = party().length;
  if (n <= 1) return 1;
  const L = (XP.party && XP.party.leaderShare) || { duo: 0.6, trio: 0.4 };
  const lead = n >= 3 ? L.trio : L.duo;
  return i === leaderIdx() ? lead : (1 - lead) / (n - 1);
}

/* bonus: VIP e evento valem pra conta; arvore e extra sao de cada personagem.
   SOMADOS (o jogo nao publica a regra; com os numeros medidos a diferenca pra
   multiplicar e' de 1-2%). */
const VIP_KEY = 'idlezada.huntVip.v1', EVT_KEY = 'idlezada.huntEvent.v1', EXTRA_KEY = 'idlezada.huntXpExtra.v1';
const VIP_PCT = (XP.bonus && XP.bonus.vipPct) || 10;
let extraByChar = loadJSON(EXTRA_KEY, {});
const charKey = c => c && !c.none ? `${c.voc}|${c.label}` : '';
let liveEvent = null, eventState = 'loading';
function bonusParts(c){
  const parts = [];
  if (!vipToggle || vipToggle.checked) parts.push({ k: 'VIP', v: VIP_PCT });
  if (liveEvent && (!eventToggle || eventToggle.checked)) parts.push({ k: 'event', v: liveEvent.expPct });
  const ctx = charCtx(c);
  if (ctx && ctx.expPct) parts.push({ k: 'tree', v: ctx.expPct });
  const ex = parseFloat(String(extraByChar[charKey(c)] ?? '').replace(',', '.'));
  if (isFinite(ex) && ex) parts.push({ k: 'extra', v: ex });
  return parts;
}
const bonusOf = c => bonusParts(c).reduce((s, p) => s + p.v, 0);
/* o multiplicador inteiro de um personagem: rate do level x bonus x fatia da party */
const multOf = (c, i) => rateFor(c.level) * (1 + bonusOf(c) / 100) * shareOf(i);

/* evento de XP ao vivo: a API publica que o proprio jogo usa no banner de eventos */
function fetchEvent(){
  if (typeof fetch !== 'function') { eventState = 'off'; return; }
  fetch('https://baiakidle.com/api/trpc/adminConfig.events')
    .then(r => r.json())
    .then(j => {
      const now = Date.now();
      const evs = (((j || {}).result || {}).data || {}).events || [];
      const act = evs.filter(e => e.enabled !== false && e.expPct > 0 && now >= e.startsAt && now < e.endsAt)
        .sort((a, b) => b.expPct - a.expPct)[0];
      liveEvent = act ? { name: act.name, expPct: act.expPct, endsAt: act.endsAt } : null;
      eventState = 'ok'; render();
    })
    .catch(() => { eventState = 'off'; render(); });
}
function eventText(){
  if (eventState === 'loading') return 'checking…';
  if (!liveEvent) return eventState === 'off' ? 'could not check, add it as extra' : 'none running';
  const h = Math.floor(Math.max(0, liveEvent.endsAt - Date.now()) / 36e5);
  return `+${liveEvent.expPct}%, ${h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + 'h'} left`;
}

/* ---------- o que o jogador mediu em cada hunt ----------
   Tempo por clear (andar, escada, respawn, morrer: o que conta de verdade) e, se
   quiser, o XP DA PARTY que ele viu cair por clear. Por hunt, guardado. */
const RUNS_KEY = 'idlezada.huntRuns.v1';
let runs = loadJSON(RUNS_KEY, {});
/* o campo de XP e' em KK: "4.3" / "4,3" = 4.3KK. Tambem aceita sufixo ("850k",
   "4.3kk") e o numero inteiro ("4.300.000"). */
function parseXp(s){
  s = String(s || '').trim().toLowerCase().replace(/\s/g, '');
  if (!s) return 0;
  if (/^\d{1,3}([.,]\d{1,3})?$/.test(s)) return Math.round(parseFloat(s.replace(',', '.')) * 1e6);
  const m = s.match(/^([\d.,]+)(kkk|kk|k|m|b)?$/);
  if (!m) return 0;
  const n = m[2] ? parseFloat(m[1].replace(',', '.')) : parseNum(m[1]);
  return Math.round((n || 0) * ({ k: 1e3, kk: 1e6, m: 1e6, kkk: 1e9, b: 1e9 }[m[2]] || 1));
}
const fmtKK = n => String(Math.round(n / 1e4) / 100);   // 4300000 -> "4.3"
const fmtTime = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

/* ---------- hunts escolhidas pra comparar ---------- */
const PICKS_KEY = 'idlezada.huntPicks.v1';
let picks = loadJSON(PICKS_KEY, []).filter(id => HUNTS.some(h => h.id === id));
const savePicks = () => saveJSON(PICKS_KEY, picks);
const SORT_KEY = 'idlezada.huntSort.v1';
let sortMode = loadJSON(SORT_KEY, 'xp');

/* ---------- charms que eu tenho, e quantos slots ----------
   O plano so serve se for executavel hoje: charm que voce nao tem nao entra. Slot
   (criaturas com charm ao mesmo tempo) e' limite de CONTA: 2 free, 6 VIP, 25 com a
   Charm Expansion. v2: o default e' TODOS os charms; da v1 so herda os slots. */
const CFG_KEY = 'idlezada.charmCfg.v2';
const CFG_KEY_V1 = 'idlezada.charmCfg.v1';
const SLOT_OPTS = [{ n:2, tag:'free' }, { n:6, tag:'VIP' }, { n:25, tag:'expansion' }];
const cfgToggle = $('charm-cfg-toggle');
const cfgBody = $('charm-cfg');
let cfg = loadCfg();
function loadCfg(){
  const all = CHARMS.map(c => c.key);
  let saved = loadJSON(CFG_KEY, null);
  if (!saved) { const v1 = loadJSON(CFG_KEY_V1, null); if (v1 && v1.slots) saved = { slots: v1.slots }; }
  const owned = saved && Array.isArray(saved.owned) ? saved.owned.filter(k => all.indexOf(k) >= 0) : all;
  const slots = saved && SLOT_OPTS.some(o => o.n === saved.slots) ? saved.slots : (HM ? HM.CHARM_SLOTS : 25);
  return { owned, slots };
}
const saveCfg = () => saveJSON(CFG_KEY, cfg);
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
      <span class="cfg-note">creatures holding a charm at once, account-wide</span></div>`;
}

/* ---------- metricas de uma hunt ----------
   fatias por personagem e o total da party (a soma delas) */
function splitOf(h){
  const P = party();
  const each = P.map((c, i) => {
    const m = multOf(c, i);
    return { c, i, share: shareOf(i), xp: Math.round(h.xpPerClear * m),
      min: Math.round((h.xpMin ?? h.xpPerClear) * m), max: Math.round((h.xpMax ?? h.xpPerClear) * m) };
  });
  const sum = k => each.reduce((s, e) => s + e[k], 0);
  return { each, xp: sum('xp'), min: sum('min'), max: sum('max') };
}
/* a linha da lista/comparativo: XP DA PARTY previsto; o que o jogador viu no jogo
   (se salvo) ganha da previsao; XP/h so com tempo salvo */
function rowOf(h, ctx){
  const sp = splitOf(h);
  const run = runs[h.id] || {};
  const myXp = run.xp > 0 ? run.xp : 0, sec = run.sec > 0 ? run.sec : 0;
  const xpUse = myXp || sp.xp;
  const lead = party()[leaderIdx()];
  return { ...h, feasible: lead.level >= h.minLevel, split: sp, xpVal: sp.xp, xpMinVal: sp.min, xpMaxVal: sp.max,
    myXp, sec, xpUse, xph: sec ? Math.round(xpUse * 3600 / sec) : 0,
    goldVal: h.goldPerClear, els: HM ? HM.huntElements(h, ctx || {}) : [], threat: HM ? HM.huntThreat(h) : null };
}
const monLabel = h => h.monsters.slice(0,3).map(m => m.name).join(', ');

/* ---------- elementos e charms ---------- */
const pct = x => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x * 1000) / 10) + '%';
const elChip = (el, extra) => `<span class="el el-${esc(el)}">${esc(el)}${extra ? ` <b>${extra}</b>` : ''}</span>`;

/* AS DUAS RESPOSTAS DE ELEMENTO, simples: com o que bater e do que se defender.

   Bater: o elemento que o pack inteiro mais apanha (o mult harmonico do
   huntElements), dito como "% a mais de dano" -- ×1.12 vira +12%, que e' o que se
   le. Empate vai pro elemental; physical so aparece quando e' o melhor de todos
   (a ordem vem pronta do huntElements). Pack sem preferencia diz isso em vez de
   inventar um vencedor.

   Defender: os ate 3 MAIORES danos que chegam (huntThreat). Elemento abaixo de 5%
   do dano e' ruido e fica de fora. */
const PROTECT_MIN = 0.05, PROTECT_MAX = 3;
const plusPct = m => { const v = Math.round((m - 1) * 100); return (v >= 0 ? '+' : '−') + Math.abs(v) + '%'; };
function hitOf(h){
  const els = h.els || [];
  const flat = els.every(e => Math.abs(e.mult - 1) < 0.005);
  const top = els.filter(e => !e.immune)[0];
  if (!top) return '<span class="el-empty">all immune</span>';
  if (flat) return '<span class="el-empty">any element</span>';
  return elChip(top.el, plusPct(top.mult));
}
function protectOf(h){
  const rows = (h.threat && h.threat.rows) || [];
  if (!rows.length) return '<span class="el-empty">no data</span>';
  const out = rows.filter((r, i) => i === 0 || r.share >= PROTECT_MIN).slice(0, PROTECT_MAX);
  return out.map(r => elChip(r.el, Math.round(r.share * 100) + '%')).join('');
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

/* so o nome e o tier: a pilula de elemento repetia o que o nome ja diz */
const charmChip = c => `<b>${esc(c.name)}</b> <span class="pl-t">T${c.tier}</span>`;

/* ganho pequeno demais pra arredondar: "+0%" mente (não é zero), e a casa decimal
   extra não muda decisão nenhuma. */
const pctTiny = x => Math.abs(x) < 0.0005 ? '≈0%' : pct(x);

const fmtMult = x => '×' + (Math.round(x * 100) / 100).toFixed(2);

function planCharm(c){
  if (!c) return '<span class="pl-none">—</span>';
  /* charm colocado por resistência (sem DPS pro número): mostra o que se sabe —
     o quanto o bicho apanha desse elemento — em vez de um ganho inventado. */
  /* uma informacao por charm, curta: o ganho de dano, ou o gold por clear (Scavenge,
     Gut), ou o efeito. Colocado por resistencia (sem DPS) nao tem numero -- fica so
     o nome, e o porque vai no title. */
  const val = c.blind ? ''
    : c.gain != null && c.gain > 0 ? `<i>${pctTiny(c.gain)}</i>`
    : c.goldClear > 0 ? `<i>+${nfShort(c.goldClear)}</i><em>gold / clear</em>`
    : MINOR_TAG[c.key] ? `<em>+${c.value}% ${esc(MINOR_TAG[c.key])}</em>`
    : c.note ? `<em>${esc(c.note)}</em>` : '';
  const cost = (c.blind ? 'placed by resistance · ' : '')
    + (c.points != null ? `${nfShort(c.points)} charm points` : `${nfShort(c.echoes)} echoes`);
  /* limpo de proposito: nome, tier e o que rende. Custo e descricao ficam no title. */
  return `<span class="pl-charm${c.marginal ? ' thin' : ''}" title="${esc((c.desc ? c.desc + ' · ' : '') + cost)}">
    ${charmChip(c)} ${val}</span>`;
}

/* As notas do plano. Uma nota por FATO, não por linha: um charm mora numa criatura
   só, então "com Low Blow seria melhor" é uma frase, não quatro. Notas de charm
   marcado como migalha não entram — discutir o tier de algo que rende 0,02% é o
   que deixava esta seção ilegível. Teto de MAX_NOTES pra não voltar a crescer. */
const MAX_NOTES = 4;
const ELEM_PLAUSIBLE = 10;   // acima disso o elemental não é "quase", é outra ordem

/* SAVAGE x LOW BLOW com Avatar. Dentro da forma todo golpe ja crita, entao chance
   de critico a mais (Low Blow) so rende no tempo FORA dela, e dano critico a mais
   (Savage Blow) rende em todo critico -- inclusive os do Avatar. A frase so aparece
   quando ha Avatar, e com os dois numeros na criatura que mais pesa no clear. */
function critNote(plan, ctx){
  if (!ctx || !(ctx.up > 0.05) || !HM.charmRanking) return null;
  const top = plan.rows.map(r => r.creature).sort((a, b) => b.share - a.share)[0];
  if (!top) return null;
  const rows = HM.charmRanking({ hp: top.hp, hpFight: top.hpFight, resist: top.resist || {} }, ctx,
    CHARMS.filter(c => c.key === 'low_blow' || c.key === 'savage_blow'));
  const lb = rows.find(r => r.key === 'low_blow'), sv = rows.find(r => r.key === 'savage_blow');
  if (!lb || !sv || lb.gain == null || sv.gain == null) return null;
  return `with Avatar up <b>${Math.round(ctx.up * 100)}%</b> of the time, <b>Savage Blow</b> gives ${pct(sv.gain)} on ${esc(top.name)} and <b>Low Blow</b> only ${pct(lb.gain)} — inside the form every hit already crits, so extra crit chance only counts outside it`;
}

/* CARNAGE x ELEMENTAL: a virada em GOLPES, na criatura que levou um dos dois. E' a
   frase que responde "e se eu bato de runa, de longe?" -- mais golpes por bicho,
   mais procs do elemental; o Carnage so rende quando o bicho morre. */
function carnageNote(plan, ctx, hunt){
  if (!HM.carnageBreakeven || !ctx) return null;
  const carn = CHARMS.find(c => c.key === 'carnage');
  const r = plan.rows.find(x => x.major && (x.major.key === 'carnage' || (CHARMS.find(c => c.key === x.major.key) || {}).element));
  if (!carn || !r) return null;
  const c = r.creature;
  const els = CHARMS.filter(x => x.element);
  /* o melhor elemental NESTA criatura (o que ela mais apanha) */
  const el = els.map(e => ({ e, m: HM.elementMult(c.resist, e.element, ctx.pierce) })).sort((a, b) => b.m - a.m)[0];
  if (!el) return null;
  const n = HM.carnageBreakeven(c, ctx, carn, el.e, hunt);
  if (n == null) return null;
  const hit = ctx.hit > 0 ? ctx.hit : (ctx.dps > 0 && ctx.aps > 0 ? ctx.dps / ctx.aps : 0);
  const now = hit ? (c.hp / hit) : null;
  return `<b>Carnage × ${esc(el.e.name)}</b> on ${esc(c.name)}: the elemental wins once you need more than <b>${n.toFixed(1)} hits</b> to kill it`
    + (now != null ? ` — it takes ~${now < 10 ? now.toFixed(1) : Math.round(now)}` : '');
}

function planNotes(plan, ctx, hunt){
  const out = [];
  const real = plan.rows.filter(r => r.major && !r.major.marginal);
  const cn = critNote(plan, ctx);
  if (cn) out.push(cn);
  const kn = carnageNote(plan, ctx, hunt);
  if (kn) out.push(kn);
  if (plan.needsDps) out.push('elemental charms go where the creature takes the most of that element (by <b>resistance</b>)');

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
  const plan = HM.huntCharmPlan(h, ctx, { owned: cfg.owned, slots: cfg.slots, charms: CHARMS, loot: window.LOOT,
    must: HM.MUST_MAJOR });   // regra da casa: Savage fixa; Low Blow so se valer
  const threat = HM.huntThreat(h);
  const hit = (h.els || []).filter(e => !e.immune).slice(0, 2);
  const flat = (h.els || []).every(e => Math.abs(e.mult - 1) < 0.005);

  const hitLine = flat || !hit.length
    ? '<span class="el-empty">no element bias in this pack</span>'
    : hit.map(e => elChip(e.el, plusPct(e.mult))).join(' ');
  const protLine = threat.rows.length
    ? threat.rows.filter((r, i) => i === 0 || r.share >= PROTECT_MIN).slice(0, PROTECT_MAX).map(r => elChip(r.el, Math.round(r.share * 100) + '%')).join(' ')
    : '<span class="el-empty">no damage data</span>';

  /* UMA linha por criatura: onde prender cada charm. O "quanto do clear" diz por
     que ela pega o melhor charm -- e' onde voce passa mais tempo batendo. */
  const row = r => {
    const c = r.creature;
    const tag = c.isBoss
      ? `<em>${Math.round(c.share * 100)}% of the clear · wave-10 boss too</em>`
      : `<em>${Math.round(c.share * 100)}% of the clear</em>`;
    return `<div class="pl-row${c.isBoss ? ' boss' : ''}">
      <span class="pl-c">${esc(c.name)} ${tag}</span>
      <span class="pl-maj">${planCharm(r.major)}</span>
      <span class="pl-min">${planCharm(r.minor)}</span>
    </div>`;
  };
  /* o custo em bestiary sai da linha e vai pro "por que": e' informacao de quando
     voce ainda nao fechou o bestiary, nao do dia a dia */
  const bst = plan.rows.map(r => `${esc(r.creature.name)} ${'★'.repeat(r.bestiary.stars)} ${nfShort(r.bestiary.kills)} kills`).join(' · ');
  const notes = planNotes(plan, ctx, h);

  return `<div class="pl">
    <div class="pl-top">
      <span class="pl-lab">Hit with</span><span class="pl-els">${hitLine}</span>
      <span class="pl-lab">Protect from</span><span class="pl-els">${protLine}</span>
      ${threat.healers.length ? `<span class="pl-heal">heals itself: ${threat.healers.map(esc).join(', ')}</span>` : ''}
    </div>
    <div class="pl-head"><span>Creature</span><span>Major charm</span><span>Minor charm</span></div>
    <div class="pl-rows">${plan.rows.map(row).join('')}</div>
    <details class="pl-why"><summary>Why these charms</summary>
      ${notes}
      <div class="pl-bst">Major charms need the creature's bestiary closed: ${bst}</div>
    </details>
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
  /* a prova (valores base, resistencias, todo charm em todo bicho) fica recolhida:
     o plano acima ja e' a resposta */
  return `<div class="ht-detail">
    ${planBlock(h, ctx)}
    <details class="htd-more"><summary>Monsters — base HP and XP, resistances, every charm</summary>
      <div class="htd-row htd-head"><span>Monster (base values)</span><span class="num">HP</span><span class="num">XP</span></div>
      ${mons.map(block).join('')}
    </details></div>`;
}


/* ================================================================= TELA */

/* ---------- topo: a party ----------
   Um cartao por personagem: quem lidera (e a fatia), o bonus TOTAL dele e o extra
   que so ele tem. Os inputs nao sao redesenhados enquanto o jogador digita. */
function renderParty(){
  const P = people(), Pt = party(), li = leaderIdx();
  if (levelWrap) levelWrap.hidden = chars.length > 0;
  if (eventV) eventV.textContent = eventText();
  if (leadSel) {
    leadSel.innerHTML = Pt.map((c, i) => `<option value="${esc(charKey(c))}"${i === li ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
    leadSel.disabled = !chars.length || Pt.length < 2;
  }
  if (!chars.length) {
    charsEl.innerHTML = '<div class="pc-empty">Set up your characters in the <b>Builds</b> tab.</div>';
    return;
  }
  charsEl.innerHTML = P.map((c, i) => {
    const parts = bonusParts(c), tot = parts.reduce((s, p) => s + p.v, 0);
    const tree = (parts.find(p => p.k === 'tree') || {}).v || 0;
    const inP = i < PARTY_MAX;
    const role = !inP ? 'not in the party'
      : Pt.length < 2 ? 'solo'
      : i === li ? `leader · ${Math.round(shareOf(i) * 100)}%` : `${Math.round(shareOf(i) * 100)}% of the XP`;
    return `<div class="pc${inP ? '' : ' out'}${inP && i === li && Pt.length > 1 ? ' lead' : ''}" style="--vc:${VOC_COL[c.voc] || '#9c9db6'}">
      <div class="pc-top"><span class="pc-dot"></span><b class="pc-n">${esc(c.label)}</b><span class="pc-lv">lv ${nf(c.level)}</span></div>
      <div class="pc-role">${role}</div>
      <div class="pc-bonus" title="VIP + event + tree ${fmtPct(tree)} + extra"><span class="pc-tot" data-tot="${i}">+${fmtPct(tot)}</span> XP bonus</div>
      <label class="pc-extra">extra <input type="text" inputmode="decimal" data-extra="${i}" value="${esc(extraByChar[charKey(c)] ?? '')}" placeholder="0" aria-label="Extra XP % for ${esc(c.label)}">%</label>
    </div>`;
  }).join('');
}

/* ---------- o comparativo ----------
   Uma tabela de verdade: hunts nas colunas, as perguntas nas linhas, pra ler
   atravessado. O melhor de cada linha que decide (XP/clear, XP/h, gold) fica marcado. */
function renderCompare(byId){
  if (!cmpEl) return;
  if (!picks.length) {
    cmpEl.innerHTML = '<div class="hcmp-empty">Search above or press <span class="pick-ico">+</span> on a hunt below to compare it here.</div>';
    return;
  }
  const R = picks.map(id => byId[id]).filter(Boolean);
  const P = party(), multi = P.length > 1;
  const top = k => Math.max(...R.map(r => r[k] || 0));
  const best = (r, k) => R.length > 1 && r[k] > 0 && r[k] === top(k) ? ' best' : '';
  const td = (cls, inner) => `<td class="${cls}">${inner}</td>`;
  const row = (label, cells, cls) => `<tr class="${cls || ''}"><th scope="row">${label}</th>${cells.join('')}</tr>`;

  const head = `<tr><th class="hc-corner"></th>${R.map(r =>
    `<th scope="col" class="hc-hunt">
      <button type="button" class="hc-x" data-unpick="${esc(r.id)}" aria-label="Remove ${esc(r.name)} from the comparison">×</button>
      <span class="hc-name">${esc(r.name)}</span>
      <span class="hc-lv${r.feasible ? '' : ' bad'}">level ${r.minLevel}</span></th>`).join('')}</tr>`;

  /* o numero que vale (o seu, se salvo) grande; a previsao e o desvio pequenos */
  const xpCell = r => {
    const dev = r.myXp ? r.myXp / r.xpVal - 1 : null;
    const devTxt = dev == null ? '' : Math.abs(dev) < 0.03 ? ' ✓'
      : ` (${dev > 0 ? '+' : '−'}${Math.abs(Math.round(dev * 100))}%)`;
    return `<b class="hc-big">${nfShort(r.xpUse)}</b>`
      + `<small>${r.myXp ? `yours · forecast ${nfShort(r.xpVal)}${devTxt}` : 'forecast'}</small>`;
  };
  /* a sua run: XP em KK e tempo em minutos + segundos, numa linha so */
  const runCell = r => `<div class="hc-run">
      <label><input type="text" inputmode="decimal" data-run-xp="${esc(r.id)}" value="${r.myXp ? fmtKK(r.myXp) : ''}"
        placeholder="${fmtKK(r.xpVal)}" aria-label="XP per clear you got in ${esc(r.name)}, in KK"><span>KK</span></label>
      <label><input type="number" min="0" data-run-min="${esc(r.id)}" value="${r.sec ? Math.floor(r.sec / 60) : ''}"
        placeholder="0" aria-label="Minutes per clear in ${esc(r.name)}"><span>m</span></label>
      <label><input type="number" min="0" max="59" data-run-s="${esc(r.id)}" value="${r.sec ? Math.round(r.sec % 60) : ''}"
        placeholder="0" aria-label="Seconds per clear in ${esc(r.name)}"><span>s</span></label>
    </div>`;
  /* a fatia de cada um: nome e valor colados, e o por-hora do lado quando ha tempo */
  const splitCell = r => { const k = r.myXp ? r.myXp / r.xpVal : 1;
    return `<div class="hc-split">${r.split.each.map(e => `<span class="hc-who" style="--vc:${VOC_COL[e.c.voc] || '#9c9db6'}">
      <i>${esc(e.c.label)}</i><b>${nfShort(e.xp * k)}</b>${r.sec ? `<em>${nfShort(e.xp * k * 3600 / r.sec)}/h</em>` : ''}</span>`).join('')}</div>`; };
  const rows = [
    row('XP per clear', R.map(r => td('hc-xp' + best(r, 'xpUse'), xpCell(r))), 'hc-key'),
    row('XP per hour', R.map(r => td('hc-xph' + best(r, 'xph'),
      r.xph ? `<b class="hc-big">${nfShort(r.xph)}</b>` : '<small>fill your clear below</small>')), 'hc-key'),
    row('Your clear', R.map(r => td('hc-in', runCell(r)))),
    ...(multi ? [row('Each one gets', R.map(r => td('', splitCell(r))))] : []),
    row('Hit with', R.map(r => td('hc-el', hitOf(r)))),
    row('Protect from', R.map(r => td('hc-el', protectOf(r)))),
    row('Gold per clear', R.map(r => td('hc-gold' + best(r, 'goldVal'), nfShort(r.goldVal)))),
  ];
  cmpEl.innerHTML = `<div class="hcmp-scroll"><table class="hcmp-t"><thead>${head}</thead><tbody>${rows.join('')}</tbody></table></div>`;
}

/* ---------- a lista de todas as hunts ---------- */
const SORT_COLS = { xp:'XP per clear', xph:'XP per hour', gold:'Gold per clear', level:'Level' };
const th = (mode, label, cls) => `<button type="button" class="th${cls ? ' ' + cls : ''}${sortMode === mode ? ' on' : ''}"
  data-sort="${mode}" title="Rank by ${SORT_COLS[mode]}">${label}</button>`;
function sortRows(rows){
  const by = {
    xph:  (a,b)=> (b.xph - a.xph) || (b.xpUse - a.xpUse),
    xp:   (a,b)=> b.xpUse - a.xpUse,
    gold: (a,b)=> b.goldVal - a.goldVal,
    level:(a,b)=> a.minLevel - b.minLevel,
  }[sortMode] || ((a,b)=> b.xpUse - a.xpUse);
  return rows.slice().sort(by);
}

function renderList(rows, q){
  const only = !!(onlyToggle && onlyToggle.checked);
  const hit = h => h.name.toLowerCase().includes(q) || h.monsters.some(m => m.name.toLowerCase().includes(q));
  const shown = sortRows(rows).filter(h => (!only || h.feasible) && (!q || hit(h)));
  const multi = party().length > 1;
  const head = `<div class="ht-head">
      <span></span>${th('level', 'Hunt · level', 'l')}<span title="The element the whole pack takes the most damage from">Hit with</span><span title="The elements behind most of the damage you take here">Protect from</span>
      ${th('xp', 'XP / clear', 'num')}${th('xph', 'XP / hour', 'num')}${th('gold', 'Gold / clear', 'num')}<span class="num" title="Add to the comparison">Compare</span>
    </div>`;
  const body = shown.map(h => {
    const isOpen = open.has(h.id), picked = picks.includes(h.id);
    return `<div class="ht-item${isOpen?' is-open':''}">
      <div class="ht-row${h.feasible?'':' locked'}${isOpen?' open':''}" data-hunt="${esc(h.id)}" role="button" tabindex="0" aria-expanded="${isOpen}">
        <span class="caret" aria-hidden="true">${isOpen?'▾':'▸'}</span>
        <span class="hcell"><span class="hn">${esc(h.name)}</span>
          <span class="hm"><span class="hl${h.feasible?'':' bad'}">lv ${h.minLevel}</span> · ${esc(monLabel(h))}</span></span>
        <span class="he">${hitOf(h)}</span>
        <span class="hp">${protectOf(h)}</span>
        <span class="num xpc" data-xp="${h.xpUse}">${h.myXp
          ? `<b>${nfShort(h.myXp)}</b><em>yours · forecast ${nfShort(h.xpVal)}</em>`
          : `<b>${nfShort(h.xpVal)}</b><em>${nfShort(h.xpMinVal)} to ${nfShort(h.xpMaxVal)}</em>`}</span>
        <span class="num xph" data-xph="${h.xph}">${h.xph ? `${nfShort(h.xph)}<em>${fmtTime(h.sec)} / clear</em>` : '<span class="na" title="add it to the comparison and save your time per clear">—</span>'}</span>
        <span class="num gold">${nf(h.goldVal)}</span>
        <span class="num pk"><button type="button" class="pick${picked ? ' on' : ''}" data-pick="${esc(h.id)}"
          aria-pressed="${picked}" aria-label="${picked ? 'Remove from' : 'Add to'} the comparison">${picked ? '✓' : '+'}</button></span>
      </div>${isOpen ? detail(h, listCtx) : ''}</div>`;
  }).join('');
  grid.innerHTML = head + (body || `<div class="ht-empty">No hunt matches${q ? ` <b>${esc(q)}</b>` : ''}${only ? ' at or below the leader\'s level' : ''}.</div>`);
}

function renderSug(rows, q){
  if (!sugEl) return;
  const hit = h => h.name.toLowerCase().includes(q) || h.monsters.some(m => m.name.toLowerCase().includes(q));
  const sug = q ? sortRows(rows).filter(h => hit(h) && !picks.includes(h.id)).slice(0, 8) : [];
  sugEl.innerHTML = sug.map(h =>
    `<button type="button" class="hsug" data-pick="${esc(h.id)}"><span>${esc(h.name)}</span><em>level ${h.minLevel} · ${nfShort(h.xpUse)} XP / clear</em></button>`).join('');
}

/* o plano de charms e a lista usam o lider (e' quem bate mais na party do jogador) */
let listCtx = null;
function render(opts){
  opts = opts || {};
  const P = party();
  listCtx = charCtx(P[leaderIdx()]);
  if (!opts.keepParty) renderParty();
  else if (charsEl.querySelectorAll) for (const el of charsEl.querySelectorAll('[data-tot]')) {
    const c = people()[+el.dataset.tot]; if (c) el.textContent = '+' + fmtPct(bonusOf(c));
  }
  if (listWho) listWho.textContent = P.length > 1 ? '· party XP' : '';
  const rows = HUNTS.map(h => rowOf(h, listCtx));
  const byId = {}; for (const r of rows) byId[r.id] = r;
  const q = qInp ? String(qInp.value || '').trim().toLowerCase() : '';
  renderSug(rows, q);
  renderCompare(byId);
  renderList(rows, q);
}

/* ================================================================ WIRING */
function pick(id){
  if (!id) return;
  picks = picks.includes(id) ? picks.filter(x => x !== id) : picks.concat(id);
  savePicks();
}
/* minutos e segundos sao campos separados: cada um troca so a sua parte do tempo */
function saveRun(id, field, value){
  const r = Object.assign({}, runs[id]);
  const n = Math.max(0, parseInt(value, 10) || 0), cur = r.sec || 0;
  if (field === 'min') r.sec = n * 60 + (cur % 60);
  else if (field === 's') r.sec = Math.floor(cur / 60) * 60 + Math.min(59, n);
  else r.xp = parseXp(value);
  if (!r.sec) delete r.sec;
  if (!r.xp) delete r.xp;
  if (Object.keys(r).length) runs[id] = r; else delete runs[id];
  saveJSON(RUNS_KEY, runs);
}

chars = loadChars();
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

/* party: lider, VIP, evento, extra por personagem */
if (leadSel) leadSel.addEventListener('change', () => { leaderKey = leadSel.value; saveJSON(LEAD_KEY, leaderKey); render(); });
if (vipToggle) {
  vipToggle.checked = loadJSON(VIP_KEY, true) !== false;
  vipToggle.addEventListener('change', () => { saveJSON(VIP_KEY, vipToggle.checked); render(); });
}
if (eventToggle) {
  /* desligado por padrao: o jogador prefere ver o XP sem evento (o evento passa) */
  eventToggle.checked = loadJSON(EVT_KEY, false) === true;
  eventToggle.addEventListener('change', () => { saveJSON(EVT_KEY, eventToggle.checked); render(); });
}
if (levelInp) levelInp.addEventListener('input', () => render());
function onExtra(e, keepParty){
  const t = e.target; if (!t || !t.dataset || t.dataset.extra == null) return;
  const c = people()[+t.dataset.extra]; if (!c) return;
  const k = charKey(c);
  if (String(t.value || '').trim() === '') delete extraByChar[k]; else extraByChar[k] = String(t.value).trim();
  saveJSON(EXTRA_KEY, extraByChar);
  render({ keepParty });
}
/* digitando: so os totais mudam no cartao (o input nao perde o foco); ao sair, tudo */
charsEl.addEventListener('input', e => onExtra(e, true));
charsEl.addEventListener('change', e => onExtra(e, false));

/* busca: sugere, Enter fixa a primeira, Esc limpa; a lista abaixo filtra junto */
if (qInp) {
  qInp.addEventListener('input', () => { if (sugEl) sugEl.hidden = false; render(); });
  qInp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { qInp.value = ''; render(); return; }
    if (e.key !== 'Enter') return;
    const first = sugEl && sugEl.querySelector && sugEl.querySelector('[data-pick]');
    if (first) { e.preventDefault(); pick(first.dataset.pick); qInp.value = ''; render(); }
  });
  if (sugEl) {
    sugEl.addEventListener('mousedown', e => e.preventDefault());   // o clique vale antes do blur fechar
    qInp.addEventListener('blur', () => { sugEl.hidden = true; });
    qInp.addEventListener('focus', () => { sugEl.hidden = false; });
  }
}
if (sugEl) sugEl.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-pick]'); if (!b) return;
  pick(b.dataset.pick); if (qInp) qInp.value = ''; render();
});

/* comparativo: tirar hunt, salvar tempo e XP (no change: o render refaz a tabela) */
if (cmpEl) {
  cmpEl.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-unpick]'); if (!b) return;
    picks = picks.filter(id => id !== b.dataset.unpick); savePicks(); render();
  });
  cmpEl.addEventListener('change', e => {
    const t = e.target; if (!t || !t.dataset) return;
    if (t.dataset.runMin) saveRun(t.dataset.runMin, 'min', t.value);
    else if (t.dataset.runS) saveRun(t.dataset.runS, 's', t.value);
    else if (t.dataset.runXp) saveRun(t.dataset.runXp, 'xp', t.value);
    else return;
    render();
  });
}

/* lista: ordenar pelo cabecalho, + compara, clique na linha abre o plano */
function toggleHunt(id){ open.has(id) ? open.delete(id) : open.add(id); render(); }
grid.addEventListener('click', e => {
  const t = e.target.closest('.th');
  if (t) { sortMode = t.dataset.sort; saveJSON(SORT_KEY, sortMode); render(); return; }
  const p = e.target.closest('[data-pick]');
  if (p) { pick(p.dataset.pick); render(); return; }
  const row = e.target.closest('.ht-row'); if (!row) return;
  toggleHunt(row.dataset.hunt);
});
grid.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest && e.target.closest('.ht-row'); if (!row || e.target !== row) return;
  e.preventDefault(); toggleHunt(row.dataset.hunt);
  const again = grid.querySelector(`.ht-row[data-hunt="${row.dataset.hunt}"]`); if (again) again.focus();
});
if (onlyToggle) onlyToggle.addEventListener('change', () => render());

render();
fetchEvent();
/* voltou pra aba: a aba Builds pode ter mudado level, arvore ou quem aparece */
document.getElementById('navtabs')?.addEventListener('click', e => {
  if (e.target.closest('[data-view="hunts"]')) { chars = loadChars(); render(); }
});
})();
