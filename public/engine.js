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
/* critChance/critDmg em 1.0 = "conta pelo valor real em % de dano" (ver nodeValue,
   que faz a conta marginal). acima de 1.0 e' preferencia explicita pelo caminho de
   crit, nao correcao de escala.
   slash em 0.25: cleave de 40% em ~2 adjacentes rende ~+80% de throughput num pack
   de 4 (peso 2.0 nesse cenario), MAS zero contra boss. Medido: por o cleave alto
   aqui custava 3-12% de dano 1v1 em todos os objetivos da familia. Como o caso de
   pack tem objetivo proprio (AoE, com slash 1.5 e chain 60), esta familia fica
   otimizando single-target e o cleave entra so quando sobra ponto. */
const DMG_STATS = { atkPct:1.0, spellDmgPct:1.0, critChance:1.0, critDmg:1.0, attackSpeedPct:0.9, lifeLeech:0.1 };
/* REGRA: so o objetivo Avatar persegue o no do Avatar (peso 1000 la). Nos outros
   perfis ele fica em 0.
   Por que nao o peso "correto" de ~11 (o no vale ~+56% de dano a ~48% de uptime):
   porque com ele TODO objetivo de dano gastava 300 pontos no mesmo no de tier 11 e
   virava a mesma build -- Damage, Crit, AoE e Atk Speed colapsavam no Avatar. O preset
   tem que responder o que voce pediu, nao o que rende mais no papel. Se o no entrar
   numa build de outro objetivo, e' pelos stats dele (que `per` conta normalmente),
   nao por perseguicao. */
const DMG_SPECIALS = { execute:0.6, precision:2.0, chain:3.0, slash:0.25, element_pierce:0.5, momentum:1.5, avatar:0, battle_instinct:0, tactics:0, dodge:0, gift_of_life:0 };

/* elemOther em 0 em TODOS os perfis, e o motivo e' o mesmo em todos: o personagem
   ataca com UM elemento. Dano de um elemento que voce nao usa vale zero, nao "um
   pouco". Com o 0.12 antigo o otimizador subia as escadas de fora em paralelo com a
   escolhida -- MEDIDO no sorcerer/avatar/lv1500: 30.9% de dano em elementos que nao
   eram o escolhido, 11 nos gastos nisso. Zerando, aqueles pontos viram spellDmg e
   critDmg e o dano sobe 14.5%.
   Os nos de elemento de fora nao ficam PROIBIDOS: com valor 0 eles continuam
   elegiveis como degrau de caminho (ver o filtro em autobuild), so param de ser
   PERSEGUIDOS. */
const PROFILES = {
  dano: {
    stats: DMG_STATS,
    elem: 0.9, elemPick: 1.3, elemOther: 0, absorb: 0, absorbElem: 0,
    specials: DMG_SPECIALS,
  },
  critico: {
    // divisao de papeis: nodeValue cuida do EQUILIBRIO entre critChance e critDmg (elas
    // se multiplicam, entao crescem juntas sozinhas); o peso 3.0 aqui e' a PREFERENCIA
    // de quem clicou em "Crit" -- sem ele o otimizador nota que crit-stacking rende
    // menos que atk puro e entrega uma build de dano com o nome errado.
    stats: { critChance:3.0, critDmg:3.0, atkPct:0.6, spellDmgPct:0.6, attackSpeedPct:0.5, lifeLeech:0.1 },
    elem: 0.5, elemPick: 0.6, elemOther: 0, absorb: 0, absorbElem: 0,
    specials: Object.assign({}, DMG_SPECIALS),
  },
  avatar: {
    /* dentro da forma todo hit crita, e isso define o que a build quer:
       - atk speed (2.2, o maior peso): rende DUAS vezes aqui -- mais hits que ja sao
         crits garantidos, e a forma dispara por hit, entao mais hits = mais uptime.
       - crit damage (1.6): e' o multiplicador desses crits garantidos.
       - crit chance fica em 1.0 e nodeValue ja a desconta por (1-uptime) sozinho:
         durante a forma a chance e' 100% e um ponto ali nao compra nada. */
    stats: { attackSpeedPct:2.2, critDmg:1.6, atkPct:1.0, spellDmgPct:1.0, critChance:1.0, lifeLeech:0.1 },
    elem: 0.9, elemPick: 1.3, elemOther: 0, absorb: 0, absorbElem: 0,
    // sem inclinacao pra cleave DE PROPOSITO: o Avatar e' a build de boss/single-target
    // e por cleave nela media -12% de dano 1v1 no lv500. Pra pack, o objetivo e' AoE.
    specials: Object.assign({}, DMG_SPECIALS, { avatar: 1000 }),
  },
  tank: {
    /* cenario BOSS: luta longa, um alvo, hit grande. Muda duas coisas:
       - gift_of_life sobe pra 2.5. Ele sobrevive a um hit letal a cada 60s, ou seja
         numa luta de boss de alguns minutos e' uma barra de vida extra varias vezes.
         O indice de EHP nao ve isso (ele mede o tamanho da barra, nao quantas voce
         tem), entao aqui e' julgamento declarado, nao numero medido.
       - avatar cai pra 0: MEDIDO. O no custa 300 pontos e da -3% de dano recebido em
         ~43% do tempo = ~1.3% na media; tirar ele do perfil AUMENTA o EHP no lv900
         (1.479 vs 1.450), porque os pontos vao pra HP e absorb. */
    /* HP e' o que tanka. defFlat/armorFlat sao PLANOS (+1 def por rank, teto de +78
       na arvore inteira do knight) e nao escalam com o level, enquanto hpPct escala com
       a barra toda -- MEDIDO: com peso 1.0 o knight/tank/2500 gastava 545 dos 2500
       pontos (22%) pra comprar +45 def e +33 armor. Em 0.1 eles entram so quando nao
       ha mais nada, que e' o lugar deles.
       absorb (fisico) em 3.0 = MESMO peso de hpPct, e isso e' ancora, nao chute:
       +1% de absorb fisico multiplica a barra por 1/(1-0.01) = +1.01% de EHP, e +1% de
       hpPct da' +1%. Sao a mesma coisa por unidade, entao pesam igual. O 8.0 antigo
       vinha de quando o peso valia pros 7 elementos de uma vez. */
    stats: { hpPct:3.0, defFlat:0.1, armorFlat:0.1, hpRegenPct:4.0, lifeLeech:1.0, manaPct:0.1,
             atkPct:0.15, spellDmgPct:0.15, critChance:0.1 },
    elem: 0.1, elemPick: 0.1, elemOther: 0, absorb: 3.0, absorbElem: 0,
    specials: { dodge:3.0, gift_of_life:2.5, battle_instinct:2.0, avatar:0, execute:0, precision:0, chain:0, slash:0, tactics:0, momentum:0, element_pierce:0 },
  },
  xp: {
    /* xp/h = exp% x kills/h. O exp% satura BARATO e cedo -- 55 pontos no sorcerer
       (Scholar r10, teto de +10%), 165 no druid (+22%) -- entao depois disso o
       objetivo XP e', na pratica, uma build de dano. A versao anterior era uma build
       de dano TORTA: critDmg em 0.1 contra critChance em 0.3 (elas se MULTIPLICAM,
       valorizar uma em 1/3 da outra monta crit quebrado) e elemPick em 0.3 numa
       arvore de sorcerer que e' quase toda elemental. Agora o lado de dano e' o
       DMG_STATS inteiro, na escala real, e o expPct em 10.0 continua garantindo que
       os nos de exp entrem primeiro -- MEDIDO: o exp final nao caiu em nenhuma
       vocacao, em nenhum level.

       SO XP, loot nao: lootPct fica de fora (= 0). Ver o commit anterior.

       avatar em 11 e' a UNICA excecao a regra "so o objetivo Avatar persegue o no do
       Avatar" (ver DMG_SPECIALS), e ela nao contradiz o motivo da regra. A regra
       existe porque Damage/Crit/AoE/AtkSpeed sao ESTILOS de bater: com o Avatar
       ligado os quatro gastam os mesmos 300 pontos no mesmo no de tier 11 e colapsam
       na mesma build, e ai o preset deixa de responder o que foi pedido. XP nao e'
       estilo, e' uma METRICA -- nao existe "XP de crit" contra "XP de atk speed" pra
       colapsar, entao nao ha o que proteger. E o no e' grande demais pra ignorar:
       uptime MEDIDO de 43-55% conforme a vocacao (o 11 e' o peso "correto" que o
       comentario de DMG_SPECIALS ja calculava: ~+56% de dano a ~48% de uptime).
       Ele se auto-regula pelo orcamento: no lv500 nao entra em vocacao nenhuma
       (300 pontos nao pagam em 500), so a partir do ~lv900.

       Indice de xp/h = (1 + exp%) x dano, antes -> depois:
         sorcerer/900   2.97 -> 4.26  (+44%)   sorcerer/1500  4.12 -> 5.84  (+42%)
         druid/1500     2.85 -> 4.30  (+51%)   paladin/1500   3.76 -> 6.64  (+77%)
         monk/1500      3.68 -> 6.03  (+64%)
       tactics fica em 8.0: nao e' medido pelo model.js (ele nao modela "aim da IA"),
       e' julgamento declarado, e continua sendo a maior preferencia do perfil mesmo
       agora que os pesos de dano subiram de 0.3 pra 1.0. */
    stats: Object.assign({ expPct:10.0 }, DMG_STATS),
    elem: 0.9, elemPick: 1.3, elemOther: 0, absorb: 0, absorbElem: 0,
    specials: Object.assign({}, DMG_SPECIALS, { tactics:8.0, avatar:11 }),
  },
  atkspeed: {
    stats: { attackSpeedPct:10.0, atkPct:0.3, spellDmgPct:0.3, critChance:0.4, critDmg:0.2 },
    elem: 0.25, elemPick: 0.3, elemOther: 0, absorb: 0, absorbElem: 0,
    specials: Object.assign({}, DMG_SPECIALS, { precision:3.0 }),
  },
  healer: {
    // cura de grupo: spellHealPct e' o produto, mana e' o combustivel.
    // dano fica em ~0.15 de peso so pra a build nao ficar inutil solo.
    stats: { spellHealPct:5.0, mpRegenPct:5.0, hpRegenPct:3.0, manaLeech:1.5, manaPct:1.2,
             hpPct:0.6, lifeLeech:0.3, spellDmgPct:0.15, atkPct:0.15, critChance:0.05 },
    elem: 0.05, elemPick: 0.05, elemOther: 0, absorb: 3.0, absorbElem: 0,
    specials: { gift_of_life:1.5, dodge:2.0, tactics:1.0, avatar:0, momentum:0.3,
                chain:0.2, execute:0, precision:0, slash:0, battle_instinct:0, element_pierce:0 },
  },
  aoe: {
    // multi-target. chain 1 = +1 alvo a 60% do dano ~= +60% de throughput, entao o
    // peso do chain tem que ser da ordem de 60 "pontos de dano%" -- com peso baixo
    // ele nunca ganha de um no pequeno e o objetivo viraria um clone do dano.
    // crit em 1.0/1.0 como o perfil dano: desde que nodeValue passou a calcular crit
    // em "dano equivalente", qualquer valor abaixo de 1.0 aqui e' subvalorizar de graca.
    stats: { spellDmgPct:1.0, atkPct:1.0, critChance:1.0, critDmg:1.0, attackSpeedPct:0.7,
             lifeLeech:0.2, mpRegenPct:0.5, manaPct:0.1 },
    elem: 1.0, elemPick: 1.4, elemOther: 0, absorb: 0, absorbElem: 0,
    specials: { chain:60.0, momentum:2.0, slash:1.5, precision:1.0, element_pierce:0.5,
                execute:0.2, avatar:0, tactics:0, dodge:0, battle_instinct:0, gift_of_life:0 },
  },
};

/* mistura dois perfis (t=0 -> a, t=1 -> b). serve pros objetivos hibridos:
   os pesos sao lineares em nodeValue(), entao a media ponderada das tabelas da'
   exatamente "metade de cada objetivo" sem nenhum caso especial no autobuild. */
function blend(a, b, t){
  const mixMap = (x, y) => {
    const out = {};
    for(const k of new Set([...Object.keys(x||{}), ...Object.keys(y||{})]))
      out[k] = (x[k]||0)*(1-t) + (y[k]||0)*t;
    return out;
  };
  return {
    stats: mixMap(a.stats, b.stats),
    specials: mixMap(a.specials, b.specials),
    elem:      (a.elem||0)*(1-t)      + (b.elem||0)*t,
    elemPick:  (a.elemPick||0)*(1-t)  + (b.elemPick||0)*t,
    elemOther: (a.elemOther||0)*(1-t) + (b.elemOther||0)*t,
    absorb:     (a.absorb||0)*(1-t)     + (b.absorb||0)*t,
    absorbElem: (a.absorbElem||0)*(1-t) + (b.absorbElem||0)*t,
  };
}

/* hibrido pedido pro Elder Druid: cura E dano na mesma build.
   t=0.65 puxado pro dano de proposito, nao 50/50: o ramo de cura do druid e'
   pequeno e satura em ~+61% spellHeal, entao num 50/50 o greedy enche a cura
   primeiro e a build vira "healer com sobra". Em 0.65 as duas metades crescem
   juntas (lv500: cura +40.7% e dano +52.5%). Pra afinar, muda so o t. */
PROFILES.curadano = blend(PROFILES.healer, PROFILES.dano, 0.65);

/* puller = tank que segura PULL. era uma tabela escrita a mao e ficava num vale:
   menos EHP que o tank puro E menos throughput que o aoe -- dominado nos dois eixos.
   como mistura tank<->aoe em 0.65 ele passa a ser um ponto de Pareto real
   (EK lv1500: mesmo EHP do puller antigo com o DOBRO do dano).
   nota de calibragem: packBase = 4 em 78 das 79 hunts (data/hunts.json), entao
   battle_instinct (+6 def/bicho em melee) rende so +24 def -- nao paga os 150 pontos
   do notavel, e o otimizador acerta em gastar isso em absorb/HP. */
PROFILES.puller = blend(PROFILES.tank, PROFILES.aoe, 0.65);

/* ---------------------------------------------------------------------------
   VALORACAO CIENTE DO ESTADO.

   Os pesos por stat sao lineares, mas dois efeitos NAO sao, e ignorar isso
   produzia builds mensuravelmente piores:

   a) critChance e critDmg se MULTIPLICAM. +85% de crit damage com 2% de chance
      de critar nao vale quase nada; com 11% vale 5x mais. Com peso fixo o
      otimizador empilhava um sem o outro -- era por isso que o objetivo Crit
      chegava a perder do Damage puro na arvore do knight.
   b) na forma Avatar o hit SEMPRE crita. Isso faz o crit damage valer pelo
      uptime do Avatar (~45-50% com 5%/hit e 15s de duracao) em vez de valer
      pela crit chance. E' o que torna Avatar + crit damage o melhor 1v1.

   Entao o valor de critChance/critDmg e' recalculado a cada ponto alocado,
   convertido em "pontos de dano equivalente" -- a mesma unidade de atkPct, o
   que deixa os pesos dos perfis comparaveis entre si. Os outros stats seguem
   lineares, porque sao lineares mesmo.
   --------------------------------------------------------------------------- */

/* crit chance que o personagem tem FORA da arvore (base + equipamento). so
   influencia como o otimizador pondera os nos, nunca os stats mostrados na UI.
   sem esse piso, crit damage valeria 0 numa build zerada e nunca seria pego. */
const CRIT_BASE_CHANCE = 5;

/* contexto = o que a build JA tem, pro calculo marginal acima. */
/* duracao da forma Avatar, em segundos (do texto do proprio no). */
const AVATAR_DUR = 15;
/* uptime estimado da forma Avatar: a chance e' por hit que acerta, entao quanto mais
   rapido o ataque, mais rapido ela dispara. assume ~1 hit/s de base escalado por atk
   speed, e que a forma NAO reseta a duracao se disparar de novo dentro dela (se
   resetar, o uptime real e' maior que este). uma funcao so, usada pelo otimizador e
   pela UI, pra nao existirem duas contas divergentes. */
function avatarUptimeFrom(agg){
  const ch = (agg.spec.avatar||0)/100;
  if(ch <= 0) return 0;
  const aps = 1 + (agg.bonus.attackSpeedPct||0)/100;
  return AVATAR_DUR/(AVATAR_DUR + 1/(ch*aps));
}
function avatarUptime(v, rk){ return avatarUptimeFrom(aggregate(v, rk)); }

function valueCtx(v, rk){
  const a = aggregate(v, rk);
  const cc = CRIT_BASE_CHANCE + (a.bonus.critChance||0);
  const cd = a.bonus.critDmg||0;
  return { cc:Math.min(100,cc), cd, up:avatarUptimeFrom(a) };
}
const NO_CTX = { cc:CRIT_BASE_CHANCE, cd:0, up:0 };

/* 'none' = "nao conto com elemento nenhum". Nao e' o mesmo que o antigo 'all', que
   valorizava TODOS os elementos igualmente e por isso mandava o otimizador subir tres
   escadas em paralelo. 'all' era dominado: no sorcerer/avatar/lv1500 ele rendia menos
   que 'none' ate PRA QUEM ATACA COM FIRE (5.63 vs 5.80 no indice de dano), porque os
   pontos das escadas de fora rendem mais como spellDmg. Fica aceito como apelido de
   'none' so pra nao quebrar estado salvo no localStorage. */
const noElement = elem => !elem || elem === 'none' || elem === 'all';

/* peso de reserva do PASSE DE SOBRA (em autobuild). Qualquer stat que o perfil
   zerou passa a valer isso -- baixo o bastante pra nunca competir com o tema (o menor
   peso real de um perfil e' 0.05), mas positivo, pra que ponto sem destino melhor va
   pro maior stat disponivel em vez de ficar na mao. */
const FALLBACK_W = 0.01;

/* limite de "vale nada". Tem que ser O MESMO no greedy (o que ele nao persegue) e na
   poda (o que ela remove): com limites diferentes, um no no meio dos dois era removido
   pela poda e recomprado pelo greedy em loop, e a build saia com o caminho morto de
   volta. Bem abaixo do menor valor real possivel (FALLBACK_W x o menor stat da arvore,
   0.1, da' 0.001). */
const DEAD_EPS = 1e-9;

/* floor=true -> modo reserva: todo peso zerado vira FALLBACK_W. */
function nodeValue(n, obj, elem, ctx, floor){
  const W = PROFILES[obj] || PROFILES.dano;
  const C = ctx || NO_CTX;
  const w = x => floor ? Math.max(x||0, FALLBACK_W) : (x||0);
  // chance efetiva de critar: dentro do avatar e' 100%, fora e' a crit chance
  const pEff = C.up + (1-C.up)*(C.cc/100);
  let val = 0;
  if(n.per) for(const k in n.per){
    const x = n.per[k];
    if(k==='elementDmgPct'){
      // sem elemento escolhido o no de elemento nao vale nada: so entra como caminho
      if(noElement(elem)){ if(floor) for(const e in x) val += FALLBACK_W * x[e]; }
      else for(const e in x)
        val += w(e===elem ? (W.elemPick||W.elem||0) : W.elemOther) * x[e];
    } else if(k==='absorbPct'){
      /* absorb de FISICO conta; de elemento nao. Resistencia elemental vem do
         equipamento, entao ponto de arvore gasto nela e' ponto perdido -- MEDIDO na
         build BT1-K540 (knight tank lv540): Fire Ward r9 45p, Death Ward r8 36p, Ice
         Ward r5 30p e Energy Ward r5 30p somavam 141 dos 540 pontos (26%) em absorcao
         elemental, com hpPct em apenas 17.4%. Pior: essa escada de Wards E' o "segundo
         caminho" subindo em paralelo ao ramo de HP.
         Os notaveis que dao absorb em TODOS os elementos (Resilience, Fortress,
         Colossus, Avatar of Steel) continuam contando -- pela parte fisica deles. */
      for(const e in x) val += w(e==='physical' ? W.absorb : W.absorbElem) * x[e];
    } else if(k==='critChance'){
      // +1% de chance rende (1 + critDmg atual) de dano extra; durante o avatar
      // a chance ja e' 100%, logo esse ganho so valeria nos (1-uptime) restantes
      val += w(W.stats.critChance) * x * (1-C.up) * (1 + C.cd/100);
    } else if(k==='critDmg'){
      // +1% de crit damage rende so na fracao dos hits que critam
      val += w(W.stats.critDmg) * x * pEff;
    } else {
      val += w(W.stats[k]) * x;
    }
  }
  if(n.special) val += w(W.specials[n.special.key]) * n.special.value;
  return val;
}

/* objetivos em que ESCOLHER o elemento muda a build de verdade. A UI usava uma lista
   escrita a mao que esquecia o `avatar` (elemPick 1.3!), entao nao havia como pedir
   "avatar de fire" -- e sem escolha o otimizador subia as tres escadas. Derivado dos
   pesos -> nao da pra esquecer um objetivo novo. */
const elementObjs = () => Object.keys(PROFILES)
  .filter(o => (PROFILES[o].elemPick || PROFILES[o].elem || 0) >= 0.5);

/* elemento padrao da vocacao. Com UM elemento de dano na arvore nao existe escolha a
   fazer: aquele elemento E' o do personagem, e trata-lo como "sem elemento" joga dano
   fora de graca -- MEDIDO no knight/dano/lv1500, 3.711 com physical contra 3.352 com
   none (-10.7%), porque a arvore do knight e do monk e' toda physical.
   Com dois ou mais, quem escolhe e' o jogador e 'none' nao chuta por ele. */
const defaultElement = v => {
  const els = damageElements(v);
  return els.length === 1 ? els[0] : 'none';
};

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

/* PERKS — os notaveis da arvore, que o usuario pode marcar como prioridade.
   `kind !== 'small'` e' o que define um notavel: rank unico, custo alto, efeito com
   identidade (Avatar of Steel, Executioner, Cleaving Strikes...). Detectado do dado. */
const perkNodes = v => TREES[v].filter(n => n.kind !== 'small');

/* Marcar um perk PRIORIZA, nao garante. O bonus e' proporcional ao custo do no, o que
   equivale a fixar pra ele uma razao custo-beneficio minima de PERK_BOOST.

   0.35 foi medido, nao chutado. Marcando Avatar of Steel + Executioner num EK:
     K=0.35 -> lv500 entra so o Executioner (o Avatar custaria 300 pontos e derrubaria
               o atk de 60% pra 26%); lv900 entram os dois e o Avatar custa 8 pontos de
               atk (73% vs 81%); lv1500 os dois, com atk MAIOR que sem perk.
     K>=0.5 -> força os dois ja no lv500 e estraga a build -- isso e' "garantir", nao
               "priorizar".
     K<=0.2 -> mesmo resultado do 0.35, sem margem.
   Ou seja: empurra forte, mas o otimizador ainda recusa quando o perk destruiria o
   resto da build.

   opts.forcePerks troca isso por GARANTIR: o bonus vira grande o bastante pra dominar
   qualquer outro no (razao ~100 contra ~2 do melhor no pequeno), entao o perk marcado
   e' perseguido primeiro, custe o que custar. E' a valvula de escape pra quando o
   modelo esta sendo conservador demais e voce sabe que o perk vale.
   Um limite intransponivel continua: se o caminho ate o no custar mais que o level
   inteiro, nem forcando ele entra -- ai o que falta e' level, nao prioridade. */
const PERK_BOOST = 0.35;
const PERK_FORCE = 100;

/* um passe do greedy custo-beneficio. Continua de onde `rk` esta (nao exige arvore
   vazia), o que e' o que permite rodar de novo depois da poda e no passe de sobra.
   `floor` liga o modo reserva do nodeValue. Devolve quantos pontos gastou. */
function growGreedy(v, budget, obj, elem, rk, perkSet, forcePerks, floor, noNewBranch){
  const nodes = TREES[v];
  const val = {};
  const before = spent(v, rk);
  let guard = 0;
  while(guard++ < 200000){
    const rem = budget - spent(v, rk);
    if(rem <= 0) break;
    // o valor de crit depende do que a build ja tem -> recalcula por iteracao
    const ctx = valueCtx(v, rk);
    for(const n of nodes){
      val[n.id] = nodeValue(n, obj, elem, ctx, floor);
      // o bonus e' somado (nao multiplicado): um perk pode valer 0 no perfil escolhido
      // -- Avatar num perfil de tank, por exemplo -- e multiplicar zero nao prioriza nada.
      if(perkSet.has(n.id)) val[n.id] += n.cost * (forcePerks ? PERK_FORCE : PERK_BOOST);
    }
    const {dist,pred} = unlockDijkstra(v, rk);
    let best = null;
    for(const n of nodes){
      const r = rk[n.id]||0;
      if(r >= n.maxRank) continue;
      // noNewBranch==='deepen': so engrossa no que a build JA tem, nao acende no novo
      if(noNewBranch === 'deepen' && r < 1) continue;
      if(val[n.id] <= DEAD_EPS) continue;        // nao mira nos sem valor (mas eles entram como caminho)
      let cost, firstStep;
      if(connected(v, rk, n.id)){
        cost = nextCost(n, r); firstStep = n.id;
      } else {
        // noNewBranch: a sobra engrossa o que a build ja tem, nao abre ramo distante
        if(noNewBranch) continue;
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
  return spent(v, rk) - before;
}

/* PODA — devolve os pontos de nos que nao valem nada NO PERFIL e que saem sem quebrar
   a conectividade.

   Por que eles existem: o greedy escolhe um alvo, paga o primeiro passo do caminho e
   nunca revisa. Quando mais tarde aparece uma rota melhor, o caminho antigo continua
   pago. MEDIDO na versao anterior a esta: 301 pontos desperdicados em 84 de 180
   combos. O caso mais visivel era o knight/avatar, com NOVE nos de defesa acesos
   (Plating, Fire Ward, Resilience, Second Wind, Ice Ward, Energy Ward, Fortress, Iron
   Will, Colossus) numa build de dano.

   Remove do mais barato pro mais caro: tirar o barato primeiro abre a cascata (um no
   de 1 ponto que segurava outro de 3 sai antes, e ai o de 3 tambem passa a sair).
   Devolve os pontos liberados. */
function pruneDeadWeight(v, rk, obj, elem, floor){
  const ctx = valueCtx(v, rk);
  const dead = Object.keys(rk)
    .filter(id => (rk[id]||0) > 0 && nodeValue(nd(v,id), obj, elem, ctx, floor) <= DEAD_EPS)
    .map(id => ({ id, pts: totalCost(nd(v,id), rk[id]) }))
    .sort((a,b) => a.pts - b.pts);
  let freed = 0;
  for(const d of dead){
    const t = Object.assign({}, rk); t[d.id] = 0;
    if(!valid(v, t)) continue;                   // e' caminho obrigatorio: fica
    // delete, nao `= 0`: `ranks` tem que conter SO no alocado. Uma chave com valor 0
    // sobrevive ao Object.keys e quebrava o round-trip do share code (o decode nunca
    // devolve chave zerada, entao as contagens divergiam).
    delete rk[d.id]; freed += d.pts;
  }
  return freed;
}

/* monta a build. retorna {ranks, spent, reachedAvatar, leftover, spentFallback,
   perks:{reached,missing,unaffordable}}. */
function autobuild(v, level, obj, opts){
  opts = opts||{};
  /* 'all' (legado do localStorage) e ausencia de escolha caem no padrao da vocacao, nao
     em 'none': pro knight isso devolve `physical` (o elemento dele) em vez de descartar
     o ramo de dano fisico. 'none' explicito continua sendo "nao conto com elemento". */
  const elem = (!opts.element || opts.element === 'all') ? defaultElement(v) : opts.element;
  const budget = Math.max(0, Math.floor(level||0));
  const rk = {};
  // perks pedidos que existem nesta arvore (id de outra vocacao e' ignorado)
  const perks = (opts.perks||[]).filter(id => IDX[v][id]);
  const perkSet = new Set(perks);
  const grow = (floor, noNewBranch) => growGreedy(v, budget, obj, elem, rk, perkSet,
    !!opts.forcePerks, floor, noNewBranch);

  grow(false);

  /* poda + recrescer ate estabilizar. Cada volta devolve caminho morto e reinveste os
     pontos no tema. MEDIDO em 180 combos: 16 builds melhoraram, 164 ficaram iguais,
     ZERO pioraram -- ele so tira no que nao vale nada e nao segura nada. */
  const settle = floor => {
    for(let i = 0; i < 10; i++){
      if(pruneDeadWeight(v, rk, obj, elem, floor) === 0) break;
      if(grow(floor) === 0) break;
    }
  };
  settle(false);

  /* PASSE DE SOBRA. Quando o tema acaba antes do level, o passe principal para com
     ponto na mao -- zerar o peso de elemento deixava o druid/dano/2500 gastando 1628
     de 2500, porque a arvore dele e' quase toda earth/ice. Aqui os pontos restantes
     vao pro melhor no disponivel com os pesos de reserva.

     Roda DEPOIS da poda, nunca antes: o que ele compra vale 0 no perfil real, entao
     uma poda posterior desfaria a compra e o ciclo nao terminaria.

     E roda so quando a sobra passa de um punhado de pontos. Rodando sempre ele acende
     um no de lixo pra gastar 1 ponto solto, que e' de novo o problema que a poda acabou
     de resolver. Sobra de 1-2 pontos e' arredondamento (o proximo rank de tudo que
     presta custa mais que o que restou) e fica na mao de proposito.

     5 pontos, absoluto, MEDIDO nos 216 combos -- limite / pior sobra / nos por build:
       5% do level ->  47 pts (!) / 18.83   <- 47 pontos parados no druid/critico/1500
       > 5 pts     ->   5 pts     / 18.92   <- escolhido
       > 2 pts     ->   5 pts     / 19.04
       sempre      ->   5 pts     / 19.30
     Absoluto em vez de percentual porque o que importa e' quanto ponto fica parado, nao
     a fracao: os mesmos 47 pontos que sao 3% de um lv1500 nao viram arredondamento por
     causa do level ser alto. Abaixo de 5 nao compra mais nada (a pior sobra para em 5
     pts nos tres limites), so acende mais no -- entao 5 e' onde o ganho termina. */
  const LEFTOVER_TOLERANCE = 5;
  let spentFallback = 0;
  if((budget - spent(v, rk)) > LEFTOVER_TOLERANCE){
    /* dois estagios, pra sobra nao virar confete: primeiro engrossa o que a build ja
       tem (nenhum no novo aceso), e so se isso nao gastar nada abre no adjacente. */
    spentFallback = grow(true, 'deepen');
    if(spentFallback === 0) spentFallback = grow(true, true);
    // o passe de sobra tambem abre caminho, entao tambem deixa caminho morto. Poda com
    // a valoracao DELE: um no sem valor nem pros pesos de reserva nao tem por que ficar.
    settle(true);
  }

  const av = avatarNodeId(v);
  /* distancia a partir da arvore VAZIA = custo minimo pra alcancar cada no. Serve pra
     separar "nao caberia no level de jeito nenhum" de "cabia, mas o otimizador preferiu
     outra coisa" -- sao avisos diferentes pra quem marcou o checkbox. */
  const fromScratch = perks.length ? unlockDijkstra(v, {}).dist : null;
  const reached = perks.filter(id => (rk[id]||0) >= 1);
  const missing = perks.filter(id => (rk[id]||0) < 1);
  const used = spent(v, rk);
  return {
    ranks: rk, spent: used,
    reachedAvatar: !!(av && (rk[av]||0) >= 1),
    /* leftover > 0 significa "a arvore nao tem mais nada pra comprar neste level",
       nao bug. spentFallback = quanto foi pro que sobrou, fora do tema. */
    leftover: budget - used, spentFallback,
    perks: {
      reached, missing, forced: !!opts.forcePerks,
      unaffordable: missing.filter(id => !isFinite(fromScratch[id]) || fromScratch[id] > budget),
    },
  };
}

/* ============================================================================
   DISPONIBILIDADE — que objetivo faz sentido em que arvore.

   Nao e' regra de tela: e' o dado dizendo que Healer num knight nao e' uma build
   ruim, e' uma build que nao existe (a arvore dele nao tem spellHealPct em no
   nenhum). A UI usa isso pra nao mostrar o botao, e a verificacao usa pra nao
   comparar builds que ninguem consegue pedir.
   Detectado da arvore -> sobrevive ao re-sync de trees.json.
   ============================================================================ */
const OBJ_NEEDS = {
  healer:   { stat:'spellHealPct' },      // so o druid
  curadano: { stat:'spellHealPct' },      // so o druid
  xp:       { stat:'expPct' },            // o knight nao tem
  atkspeed: { stat:'attackSpeedPct' },    // o druid nao tem
  puller:   { specials:['slash','chain','battle_instinct'] },  // paladin/monk nao tem
  aoe:      { specials:['chain','slash'] },                    // paladin/monk nao tem
};
const treeHasStat = (v,k) => TREES[v].some(n => n.per && n.per[k] != null);
const treeHasSpecial = (v,ks) => TREES[v].some(n => n.special && ks.includes(n.special.key));
function objAvailable(v, obj){
  const need = OBJ_NEEDS[obj];
  if(!need) return true;                  // dano/critico/avatar/tank: sempre
  if(need.stat) return treeHasStat(v, need.stat);
  if(need.specials) return treeHasSpecial(v, need.specials);
  return true;
}
const availableObjs = v => Object.keys(PROFILES).filter(o => objAvailable(v, o));

/* ---------- export ---------- */
global.Engine = {
  VOCS, VLET, LETV, ELORD,
  nd, nextCost, totalCost, spent, fullCost, reach, allocCount, valid,
  connected, canAlloc, canDealloc, aggregate, sortedNodes, encode, decode,
  damageElements, avatarNodeId, autobuild, PROFILES, blend, avatarUptime,
  OBJ_NEEDS, objAvailable, availableObjs, perkNodes, PERK_BOOST, PERK_FORCE,
  // valoracao exposta pra verificacao (tools/check-builds.js) e pra UI do elemento
  nodeValue, valueCtx, elementObjs, noElement, defaultElement, DEAD_EPS,
};

})(window);
