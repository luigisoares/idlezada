/* ============================================================================
   engine.js — motor compartilhado (sem DOM). Depende de window.TREES (trees.js).

   As funcoes de custo / reach / valid / aggregate / encode / decode sao copia
   VERBATIM do simuladorbuild.html validado, pra o share code continuar
   byte-identico ao do jogo. Nao altere a logica delas.

   Novidade: autobuild() + perfis de peso por objetivo.
   ============================================================================ */
(function (global) {
'use strict';

const TREES = global.TREES;
if (!TREES) throw new Error('engine.js: window.TREES nao carregado (inclua trees.js antes).');

const VOCS = ['knight','paladin','sorcerer','druid','monk'];
const VLET = {knight:'K',paladin:'P',sorcerer:'S',druid:'D',monk:'M'};
const LETV = {K:'knight',P:'paladin',S:'sorcerer',D:'druid',M:'monk'};
const ELORD = ['physical','energy','earth','fire','ice','holy','death'];

/* ---------- indices / grafo (verbatim) ---------- */
const IDX={},ADJ={};
for(const v of VOCS){
  IDX[v]={}; for(const n of TREES[v]) IDX[v][n.id]=n;
  const m=new Map(); for(const n of TREES[v]) m.set(n.id,[]);
  for(const n of TREES[v]) for(const r of (n.requires||[])){ m.get(n.id).push(r); m.get(r).push(n.id); }
  ADJ[v]=m;
}
const nd=(v,id)=>IDX[v][id];
const nextCost=(n,r)=> n.kind==='small' ? n.cost*(r+1) : n.cost;
function totalCost(n,r){ r=Math.min(Math.max(0,r),n.maxRank);
  return n.kind==='small' ? n.cost*r*(r+1)/2 : (r>0?n.cost:0); }
function spent(v,rk){ let s=0; for(const n of TREES[v]){ const r=rk[n.id]||0; if(r>0) s+=totalCost(n,r); } return s; }
const fullCost=v=>TREES[v].reduce((s,n)=>s+totalCost(n,n.maxRank),0);
function reach(v,rk){
  const a=ADJ[v],seen=new Set(),st=[];
  for(const n of TREES[v]) if(n.tier===0&&(rk[n.id]||0)>=1){seen.add(n.id);st.push(n.id);}
  while(st.length){const id=st.pop();
    for(const b of (a.get(id)||[])) if(!seen.has(b)&&(rk[b]||0)>=1){seen.add(b);st.push(b);}}
  return seen;
}
const allocCount=(v,rk)=>TREES[v].filter(n=>(rk[n.id]||0)>=1).length;
const valid=(v,rk)=>reach(v,rk).size===allocCount(v,rk);
function connected(v,rk,id){
  const n=nd(v,id); if(n.tier===0) return true;
  return (ADJ[v].get(id)||[]).some(x=>(rk[x]||0)>=1);
}
function canAlloc(v,rk,id,bud){
  const n=nd(v,id); if(!n) return false;
  const r=rk[id]||0;
  if(r>=n.maxRank) return false;
  if(!connected(v,rk,id)) return false;
  return spent(v,rk)+nextCost(n,r)<=bud;
}
function canDealloc(v,rk,id){
  const n=nd(v,id); if(!n) return false;
  const r=rk[id]||0; if(r<1) return false;
  if(r===1){ const t=Object.assign({},rk); t[id]=0; if(!valid(v,t)) return false; }
  return true;
}
const stack=(a,b)=>a+b-a*b/100;
function aggregate(v,rk){
  const bonus={},absorb={},elem={},spec={};
  for(const n of TREES[v]){
    const r=Math.min(rk[n.id]||0,n.maxRank); if(r<=0) continue;
    if(n.per) for(const k in n.per){
      const val=n.per[k];
      if(k==='absorbPct'){ for(const e in val) absorb[e]=stack(absorb[e]||0,val[e]*r); }
      else if(typeof val==='object'){ elem[k]=elem[k]||{}; for(const e in val) elem[k][e]=(elem[k][e]||0)+val[e]*r; }
      else bonus[k]=(bonus[k]||0)+val*r;
    }
    if(n.special) spec[n.special.key]=(spec[n.special.key]||0)+n.special.value*r;
  }
  return {bonus,absorb,elem,spec};
}
const sortedNodes=v=>[...TREES[v]].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
function encode(v,rk,lv){
  const hex=sortedNodes(v).map(n=>Math.min(Math.max(0,rk[n.id]||0),n.maxRank).toString(16))
    .join('').replace(/0+$/,'');
  return `BT1-${VLET[v]}${lv==null?'F':String(Math.max(1,Math.floor(lv)))}-${hex.toUpperCase()}`;
}
function decode(code){
  const m=String(code).trim().toUpperCase().match(/^BT1-([KPSDM])(F|\d{1,7})-([0-9A-F]*)$/);
  if(!m) return null;
  const v=LETV[m[1]], lv=m[2]==='F'?null:parseInt(m[2],10), sn=sortedNodes(v), rk={};
  for(let i=0;i<sn.length&&i<m[3].length;i++){
    const r=parseInt(m[3][i],16); if(r>0) rk[sn[i].id]=Math.min(r,sn[i].maxRank);
  }
  const rc=reach(v,rk); for(const k of Object.keys(rk)) if(!rc.has(k)) delete rk[k];
  return {voc:v,level:lv,ranks:rk};
}

/* ============================================================================
   AUTOBUILD — greedy custo-benefico com abertura de caminho amortizada.
   ============================================================================ */

/* elementos de DANO presentes na arvore (chaves de per.elementDmgPct),
   na ordem canonica. Detectado da arvore -> sobrevive ao re-sync. */
function damageElements(v){
  const set=new Set();
  for(const n of TREES[v]) if(n.per&&n.per.elementDmgPct) for(const e in n.per.elementDmgPct) set.add(e);
  return ELORD.filter(e=>set.has(e));
}
function avatarNodeId(v){
  for(const n of TREES[v]) if(n.special&&n.special.key==='avatar') return n.id;
  return null;
}

/* perfis de peso por objetivo. valor(no) = soma(peso[stat] * quantidade).
   ajuste aqui pra afinar as builds. */
const DMG_STATS = { atkPct:1.0, spellDmgPct:1.0, critChance:1.2, critDmg:0.35, attackSpeedPct:0.9, lifeLeech:0.1 };
const DMG_SPECIALS = { execute:0.6, precision:2.0, chain:3.0, slash:0.15, element_pierce:0.5, momentum:1.5, battle_instinct:0, tactics:0, dodge:0, gift_of_life:0, avatar:0 };

const PROFILES = {
  dano: {
    stats: DMG_STATS,
    elem: 0.9, elemPick: 1.3, elemOther: 0.12, absorb: 0,
    specials: DMG_SPECIALS,
  },
  critico: {
    // critChance e critDmg se multiplicam; sozinho, critDmg sem chance e' fraco.
    // pesos calibrados pra as duas crescerem juntas (critChance rende ~0.6/rank, critDmg ~2.5/rank).
    stats: { critChance:4.0, critDmg:1.0, atkPct:0.6, spellDmgPct:0.6, attackSpeedPct:0.5, lifeLeech:0.1 },
    elem: 0.5, elemPick: 0.6, elemOther: 0.1, absorb: 0,
    specials: Object.assign({}, DMG_SPECIALS),
  },
  avatar: {
    // a forma Avatar SEMPRE crita -> na sobra de pontos, critDmg vale muito mais que critChance.
    stats: { atkPct:1.0, spellDmgPct:1.0, critChance:0.5, critDmg:1.2, attackSpeedPct:0.9, lifeLeech:0.1 },
    elem: 0.9, elemPick: 1.3, elemOther: 0.12, absorb: 0,
    specials: Object.assign({}, DMG_SPECIALS, { avatar: 1000 }),
  },
  tank: {
    stats: { hpPct:1.5, defFlat:1.0, armorFlat:1.0, hpRegenPct:4.0, lifeLeech:1.0, manaPct:0.1,
             atkPct:0.15, spellDmgPct:0.15, critChance:0.1 },
    elem: 0.1, elemPick: 0.1, elemOther: 0.1, absorb: 8.0,
    specials: { dodge:3.0, gift_of_life:0.6, battle_instinct:2.0, avatar:8, execute:0, precision:0, chain:0, slash:0, tactics:0, momentum:0, element_pierce:0 },
  },
  xp: {
    stats: { expPct:10.0, lootPct:1.0, atkPct:0.3, spellDmgPct:0.3, critChance:0.3, attackSpeedPct:0.3, critDmg:0.1, hpPct:0.1 },
    elem: 0.25, elemPick: 0.3, elemOther: 0.2, absorb: 0.1,
    specials: Object.assign({}, DMG_SPECIALS, { tactics:8.0 }),
  },
  atkspeed: {
    stats: { attackSpeedPct:10.0, atkPct:0.3, spellDmgPct:0.3, critChance:0.4, critDmg:0.2 },
    elem: 0.25, elemPick: 0.3, elemOther: 0.2, absorb: 0,
    specials: Object.assign({}, DMG_SPECIALS, { precision:3.0 }),
  },
};

function nodeValue(n, obj, elem){
  const W = PROFILES[obj] || PROFILES.dano;
  let val = 0;
  if(n.per) for(const k in n.per){
    const x = n.per[k];
    if(k==='elementDmgPct'){
      for(const e in x){
        let w = W.elem||0;
        if(elem && elem!=='all') w = (e===elem) ? (W.elemPick||W.elem||0) : (W.elemOther!=null?W.elemOther:0);
        val += w * x[e];
      }
    } else if(k==='absorbPct'){
      for(const e in x) val += (W.absorb||0) * x[e];
    } else {
      val += (W.stats[k]||0) * x;
    }
  }
  if(n.special) val += (W.specials[n.special.key]||0) * n.special.value;
  return val;
}

/* Dijkstra: custo minimo pra deixar cada no alocado+conectado, dado rk atual.
   Nos ja alocados sao waypoints de custo 0. Nos tier-0 sao entradas (custo do 1o rank). */
function unlockDijkstra(v, rk){
  const dist={}, pred={};
  for(const n of TREES[v]) dist[n.id]=Infinity;
  for(const n of TREES[v]){
    if((rk[n.id]||0)>=1){ dist[n.id]=0; }
    else if(n.tier===0 && n.cost<dist[n.id]){ dist[n.id]=n.cost; pred[n.id]=null; }
  }
  const done=new Set();
  while(true){
    let u=null,ud=Infinity;
    for(const id in dist){ if(!done.has(id)&&dist[id]<ud){ ud=dist[id]; u=id; } }
    if(u===null||ud===Infinity) break;
    done.add(u);
    for(const w of (ADJ[v].get(u)||[])){
      if(done.has(w)) continue;
      const c = (rk[w]||0)>=1 ? 0 : nd(v,w).cost;
      const alt = dist[u]+c;
      if(alt<dist[w]){ dist[w]=alt; pred[w]=u; }
    }
  }
  return {dist,pred};
}
function firstStepOnPath(id, pred, rk){
  const chain=[]; let c=id, guard=0;
  while(c!=null && guard++<500){ chain.push(c); c=pred[c]; }
  chain.reverse();
  for(const x of chain) if((rk[x]||0)<1) return x;
  return id;
}

/* monta a build. retorna {ranks, spent, reachedAvatar}. */
function autobuild(v, level, obj, opts){
  opts = opts||{};
  const elem = opts.element || 'all';
  const budget = Math.max(0, Math.floor(level||0));
  const nodes = TREES[v];
  const rk = {};
  const val = {};
  for(const n of nodes) val[n.id] = nodeValue(n, obj, elem);

  let guard = 0;
  while(guard++ < 200000){
    const rem = budget - spent(v, rk);
    if(rem <= 0) break;
    const {dist,pred} = unlockDijkstra(v, rk);
    let best = null;
    for(const n of nodes){
      const r = rk[n.id]||0;
      if(r >= n.maxRank) continue;
      if(val[n.id] <= 0) continue;               // nao mira nos sem valor (mas eles entram como caminho)
      let cost, firstStep;
      if(connected(v, rk, n.id)){
        cost = nextCost(n, r); firstStep = n.id;
      } else {
        cost = dist[n.id]; if(!isFinite(cost)) continue;
        firstStep = firstStepOnPath(n.id, pred, rk);
      }
      if(cost > rem) continue;                   // so persegue alvo se o caminho inteiro cabe
      const ratio = val[n.id] / cost;
      if(!best || ratio > best.ratio) best = {ratio, firstStep};
    }
    if(!best) break;
    if(!canAlloc(v, rk, best.firstStep, budget)) break;   // seguranca
    rk[best.firstStep] = (rk[best.firstStep]||0) + 1;
  }

  const av = avatarNodeId(v);
  return { ranks: rk, spent: spent(v, rk), reachedAvatar: !!(av && (rk[av]||0) >= 1) };
}

/* ---------- export ---------- */
global.Engine = {
  VOCS, VLET, LETV, ELORD,
  nd, nextCost, totalCost, spent, fullCost, reach, allocCount, valid,
  connected, canAlloc, canDealloc, aggregate, sortedNodes, encode, decode,
  damageElements, avatarNodeId, autobuild, PROFILES,
};

})(window);
