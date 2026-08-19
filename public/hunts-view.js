/* hunts-view.js — aba Hunts: recomenda hunts pelo level + DPS colado (Session).
   XP/h real = XP/clear × rate × share × 3600 × partyDPS / HP_total.
   Depende de hunts.js (window.HUNTS) e xprates.js (window.XPRATES). */
(function () {
'use strict';
const HUNTS = window.HUNTS || [];
const XP = window.XPRATES || {};
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
function loadDps(){ try { const d = JSON.parse(localStorage.getItem(DPS_KEY)); return d && typeof d === 'object' ? d : { total:0, perChar:{}, text:'' }; } catch(e){ return { total:0, perChar:{}, text:'' }; } }
function saveDps(){ try { localStorage.setItem(DPS_KEY, JSON.stringify(dps)); } catch(e){} }
function parseNum(s){ s = String(s).trim(); return s.includes(',') ? (parseFloat(s.replace(/\./g,'').replace(',','.'))||0) : (parseInt(s.replace(/\./g,''),10)||0); }
function parseDps(text){
  const perChar = {}; let total = 0;
  const re = /([A-Za-z]{2,4})[ \t]*[\r\n]+[ \t]*([\d.,]+)\s*\/s/g; let m;
  while ((m = re.exec(text))) { const v = parseNum(m[2]); perChar[m[1].toUpperCase()] = v; total += v; }
  if (!total) { const re2 = /([\d.,]+)\s*\/s/g; while ((m = re2.exec(text))) total += parseNum(m[2]); }
  return { total, perChar, text };
}
function dpsInfoText(){
  if (!dps.total) return 'no DPS set — paste your Session to rank by real XP/h';
  const parts = Object.entries(dps.perChar).map(([k,v]) => `${k} ${nf(v)}`).join(' · ');
  return `Party DPS ${nf(dps.total)}/s` + (parts ? ` · ${parts}` : '');
}

/* ---------- rates / party ---------- */
function rateFor(level){ for (const b of (XP.xpRatesByLevel||[])) if (level>=b.min && (b.max==null||level<=b.max)) return b.mult; return 1; }
const share = () => (partyToggle && partyToggle.checked && XP.party) ? XP.party.leaderXpShare : 1;

function loadChars(){
  try { const raw = JSON.parse(localStorage.getItem('idlezada.builds.v3'));
    if (raw && Array.isArray(raw.slots)) return raw.slots.map(s => ({ label: s.label || s.voc, level: s.level || 1 })); } catch (e) {}
  return [];
}
function renderChars(){ charsEl.innerHTML = loadChars().map(c => `<button class="charpick" data-lvl="${c.level}">${esc(c.label)} <b>${c.level}</b></button>`).join(''); }

/* ---------- métricas ---------- */
function metrics(level){
  const rate = rateFor(level), sh = share(), D = dps.total || 0;
  return HUNTS.map(h => {
    const xpVal = Math.round(h.xpPerClear * rate * sh);
    const xpMinVal = Math.round((h.xpMin ?? h.xpPerClear) * rate * sh);
    const xpMaxVal = Math.round((h.xpMax ?? h.xpPerClear) * rate * sh);
    const xph = (D > 0 && h.hpPerClear) ? Math.round(xpVal * 3600 * D / h.hpPerClear) : 0;
    const clearSec = (D > 0 && h.hpPerClear) ? h.hpPerClear / D : 0;
    return { ...h, feasible: level >= h.minLevel, xpVal, xpMinVal, xpMaxVal, xph, clearSec, goldVal: h.goldPerClear };
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

function detail(h){
  const rows = h.monsters.map(m => `<div class="htd-row"><span>${esc(m.name)}</span><span class="num">${nf(m.hp)}</span><span class="num">${nf(m.exp)}</span></div>`).join('');
  const boss = h.boss && h.boss.name
    ? `<div class="htd-row boss"><span>${esc(h.boss.name)} <em>wave-10 boss · in-fight HP ×3 · XP ×2.5</em></span><span class="num">${nf(h.boss.hp)}</span><span class="num">${nf(h.boss.exp)}</span></div>` : '';
  return `<div class="ht-detail"><div class="htd-row htd-head"><span>Monster (base values)</span><span class="num">HP</span><span class="num">XP</span></div>${rows}${boss}</div>`;
}

function render(){
  const level = Math.max(1, parseInt(levelInp.value || '1', 10));
  const rate = rateFor(level), sh = share();
  rateEl.textContent = `level ${level} → XP rate ${rate}× · share ${Math.round(sh*100)}%`;
  if (dpsInfo) dpsInfo.textContent = dpsInfoText();
  const hasDps = dps.total > 0;

  const rows = metrics(level);
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
      <span></span><span>Hunt</span><span>Lv</span><span>Monsters</span><span class="num">XP/clear</span><span class="num">XP/h</span><span class="num">Gold/clear</span>
    </div>` + sorted.map(h => {
    const isOpen = open.has(h.id);
    return `<div class="ht-item">
      <div class="ht-row${h.feasible?'':' locked'}${isOpen?' open':''}" data-hunt="${esc(h.id)}">
        <span class="caret">${isOpen?'▾':'▸'}</span>
        <span class="hn">${esc(h.name)}</span>
        <span class="hl${h.feasible?'':' bad'}">${h.minLevel}</span>
        <span class="hm">${esc(monLabel(h))}</span>
        <span class="num xpc"><b>${nf(h.xpVal)}</b><em>${nfShort(h.xpMinVal)}–${nfShort(h.xpMaxVal)}</em></span>
        <span class="num xph">${hasDps?nf(h.xph):'—'}</span>
        <span class="num">${nf(h.goldVal)}</span>
      </div>${isOpen ? detail(h) : ''}</div>`;
  }).join('');
}

/* ---------- wiring ---------- */
renderChars();
if (dpsInp) { dpsInp.value = dps.text || ''; dpsInp.addEventListener('input', () => { dps = parseDps(dpsInp.value); saveDps(); render(); }); }
charsEl.addEventListener('click', e => { const b = e.target.closest('.charpick'); if (b) { levelInp.value = b.dataset.lvl; render(); } });
grid.addEventListener('click', e => { const row = e.target.closest('.ht-row'); if (!row) return; const id = row.dataset.hunt; open.has(id)?open.delete(id):open.add(id); render(); });
levelInp.addEventListener('input', render);
if (partyToggle) partyToggle.addEventListener('change', render);
sortSel.addEventListener('change', render);
render();

document.getElementById('navtabs')?.addEventListener('click', e => { if (e.target.closest('[data-view="hunts"]')) { renderChars(); render(); } });
})();
