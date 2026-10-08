/* ============================================================================
   hunt-model.js — o modelo por tras da aba Hunts: qual ELEMENTO rende mais na
   hunt, e qual CHARM rende mais em cada monstro dela.

   Modulo puro: nao toca no DOM, nao le localStorage. Recebe hunt + contexto do
   personagem e devolve numeros. Roda igual no navegador (window.HuntModel) e no
   node (tools/check-hunt-model.js).

   ESTRUTURA DA HUNT (wiki do jogo, "Hunts e Fases"):
     waves 1-9  pack comeca no packBase da hunt e cresce +1 a cada 2 waves ate 9
     wave 10    1 boss, com HP x3, dano x1.5 e XP x2.5
   Somando o pack base 4: 4,4,5,5,6,6,7,7,8 = 52 spawns + o boss. E' exatamente a
   conta de onde saiu o hpPerClear gravado em data/hunts.json.

   RESISTENCIA: resist positivo reduz o dano daquele elemento, negativo AUMENTA
   (o monstro apanha mais), 100 e' imunidade. O perk element_pierce da arvore
   ignora uma fatia da resistencia -- so da positiva: ele nao existe pra encolher
   a fraqueza do monstro.
   ============================================================================ */
(function (global) {
'use strict';

const ELEMENTS = ['physical','energy','earth','fire','ice','holy','death'];
const PACK_CAP = 9;      // teto do pack por wave
const WAVES = 9;         // waves normais; a 10a e' o boss
const BOSS_HP_MULT = 3;
const BOSS_DMG_MULT = 1.5;
const MELEE_MS = 2000;   // cadencia assumida do corpo-a-corpo -- ver monsterThreat

/* quantos monstros normais uma hunt inteira spawna (waves 1-9) */
function spawnCount(packBase) {
  let n = 0;
  for (let w = 1; w <= WAVES; w++) n += Math.min(PACK_CAP, (packBase || 4) + Math.floor((w - 1) / 2));
  return n;
}

/* multiplicador de dano de um elemento contra um resist */
function elementMult(resist, el, pierce) {
  let r = (resist && resist[el]) || 0;
  if (r > 0 && pierce > 0) r = r * (1 - Math.min(100, pierce) / 100);
  return Math.max(0, 1 - r / 100);
}

/* peso de cada monstro no clear = HP que ele representa na hunt inteira.
   E' o peso certo pro elemento porque o que se mede e' tempo gasto batendo. */
function packWeights(hunt) {
  const list = hunt.monsters || [];
  /* `spawn` e' o peso de spawn do monstro dentro do pack. Quase toda hunt divide
     igual e nao grava o campo; Giant Spider e' a excecao (55/30/15 no bundle). */
  const share = m => (m.spawn != null ? m.spawn : 1);
  const totShare = list.reduce((s, m) => s + share(m), 0) || 1;
  const spawns = spawnCount(hunt.packBase);
  const out = list.map(m => ({ key: m.key, name: m.name, hp: m.hp, hpFight: m.hp, exp: m.exp,
    resist: m.resist || {}, threat: m.threat || null, heal: m.heal || 0,
    spawnPct: share(m) / totShare,
    weight: spawns * (share(m) / totShare) * m.hp, boss: false }));
  /* `hp` e' o valor de bestiary (o que a tabela mostra); `hpFight` e' o HP com que
     ele realmente luta. So diferem no boss da wave 10, e a diferenca importa: o
     proc dos charms elementais e' limitado a 5% do HP DO ALVO. */
  const b = hunt.boss;
  if (b && b.hp) out.push({ key: b.key, name: b.name, hp: b.hp, hpFight: b.hp * BOSS_HP_MULT,
    exp: b.exp, resist: b.resist || {}, threat: b.threat || null, heal: b.heal || 0,
    spawnPct: 0, weight: b.hp * BOSS_HP_MULT, boss: true });
  return out;
}

/* ranking dos elementos na hunt.

   A media NAO e' aritmetica: o que interessa e' o tempo total de clear, e tempo
   soma o inverso do multiplicador. Dai a harmonica ponderada por HP --
     mult = SOMA(hp) / SOMA(hp/mult_i)
   Um unico monstro imune no pack zera o elemento pra hunt inteira: o clear nunca
   termina, por mais que o resto apanhe mais. */
function huntElements(hunt, ctx) {
  const pierce = (ctx && ctx.pierce) || 0;
  const w = packWeights(hunt);
  const total = w.reduce((s, m) => s + m.weight, 0);
  const rows = ELEMENTS.map(el => {
    let time = 0, immune = false;
    for (const m of w) {
      if (!m.weight) continue;
      const mult = elementMult(m.resist, el, pierce);
      if (mult <= 0) { immune = true; break; }
      time += m.weight / mult;
    }
    return { el, immune, mult: immune || !time ? 0 : total / time };
  });
  /* empate (ate 0,5%) vai pro ELEMENTAL: physical so lidera quando e' estritamente o
     melhor. Sem isto o physical ganhava todo empate so por ser o primeiro da lista. */
  const key = r => Math.round(r.mult * 200);
  return rows.sort((a, b) => (key(b) - key(a)) || ((a.el === 'physical') - (b.el === 'physical'))
    || (b.mult - a.mult) || ELEMENTS.indexOf(a.el) - ELEMENTS.indexOf(b.el));
}

/* ============================================================================
   CHARMS

   Cada monstro segura no maximo 1 charm Maior + 1 Menor. Maiores custam Charm
   Points (teto vindo do bestiary), Menores custam echoes -- moedas diferentes,
   por isso os dois grupos sao rankeados separados na UI.

   O ganho de cada charm sai como FRACAO do seu dano atual. Isso divide os charms
   em dois tipos:

     percentuais (Savage Blow, Low Blow, Fatal Hold) -- mexem no multiplicador,
       entao rendem sem precisar saber quanto voce bate.
     dano fixo (os elementais, Carnage) -- somam um valor absoluto por proc, e so
       viram porcentagem se der pra saber o seu dano por golpe. Esse vem do DPS que
       voce colou na aba: dmgPerHit = dps / aps, com aps = 1 x (1 + atk speed),
       a mesma premissa do tools/model.js.

   ONDE ISSO SUBESTIMA OS ELEMENTAIS: o proc e' "ao acertar", e pela wiki do jogo o
   bonus dos charms vale no ataque normal E nas magias. Aqui `aps` so conta o
   auto-attack, entao um caster que solta muita magia proca mais vezes por segundo
   do que este modelo enxerga. Sem cadencia de magia em nenhum dado do repo, a
   escolha foi ficar POR BAIXO em vez de chutar um numero de casts.

   O proc tambem entra sem crit -- o texto do jogo nao diz que ele crita, e supor
   que sim inflaria justamente o charm que compete com a Savage Blow.

   Overpower e Overflux dependem do SEU HP/mana maximo, que nao existe em lugar
   nenhum do repo (a arvore da %, nao o valor absoluto). Eles saem com gain null e
   uma nota, em vez de um numero inventado.
   ============================================================================ */
/* um crit acerta por 1,5x + crit damage. Da wiki do jogo, duas vezes: "Critico:
   +50% de base (+ Crit Damage)" (Dados do Servidor) e "um critico da +50% de base e
   este atributo soma por cima" (atributos da Forja). Era 2 por suposicao -- e com 2 o
   critico valia mais do que vale, o que inflava Low Blow e Savage Blow juntas. */
const CRIT_BASE = 1.5;
const EXEC_FRAC = 0.25;  // fatia da luta com o alvo abaixo de 25% do HP
const CARNAGE_ADJ = 2;   // teto: vizinhos que o estouro PODE alcancar (ver carnageNeighbors)

/* que conta cada charm usa. O que nao esta aqui nao e dano e fica fora. */
const EFFECT = {
  wound:'elem', enflame:'elem', poison:'elem', freeze:'elem', zap:'elem',
  curse:'elem', divine_wrath:'elem',
  carnage:'carnage', overpower:'ownHp', overflux:'ownMana',
  low_blow:'critChance', savage_blow:'critDmg', fatal_hold:'execute',
};

/* multiplicador medio de dano por golpe: fora do Avatar crita por chance, dentro
   dele crita sempre. Identico ao de tools/model.js, pra nao existirem duas contas. */
function critMult(cc, cd, up) {
  const pc = Math.min(100, cc || 0) / 100, d = (cd || 0) / 100;
  return (1 - up) * (1 + pc * (CRIT_BASE - 1 + d)) + up * (CRIT_BASE + d);
}

const sumTo = (arr, tier) => (arr || []).slice(0, tier + 1).reduce((s, n) => s + n, 0);

/* ganho de um charm num tier, como fracao do dano atual. null = nao da pra estimar. */
function charmGain(charm, tier, monster, ctx) {
  const v = (charm.values || [])[tier] || 0;
  const hp = monster.hpFight || monster.hp || 0, lv = ctx.level || 1;
  const base = critMult(ctx.cc, ctx.cd, ctx.up);
  /* dano por GOLPE. Sem o golpe medio informado, dps/aps -- que supoe todo o DPS no
     ataque basico e por isso da golpes grandes e POUCOS, subestimando o elemental
     (que proca a cada acerto, runa e magia inclusive). ctx.hit e' o golpe medio que
     o jogador ve no jogo, com runas e magias -- quando existe, manda. */
  const dmgPerHit = ctx.hit > 0 ? ctx.hit : (ctx.dps > 0 && ctx.aps > 0) ? ctx.dps / ctx.aps : 0;

  switch (EFFECT[charm.key]) {
    case 'critDmg':    return { gain: critMult(ctx.cc, (ctx.cd||0) + v, ctx.up) / base - 1 };
    case 'critChance': return { gain: critMult((ctx.cc||0) + v, ctx.cd, ctx.up) / base - 1 };
    case 'execute':    return { gain: EXEC_FRAC * v / 100 };
    case 'elem': {
      if (!dmgPerHit) return { gain: null, note: 'cole o seu DPS pra comparar dano fixo com percentual' };
      const proc = Math.min(2 * lv, 0.05 * hp) * elementMult(monster.resist, charm.element, ctx.pierce);
      return { gain: (v / 100) * proc / dmgPerHit };
    }
    case 'carnage': {
      // estoura ao MATAR: o dano cai nos vizinhos, encurtando o resto do pack.
      // O boss da wave 10 spawna sozinho, entao nao ha em quem estourar.
      if (!hp) return { gain: null, note: 'sem HP do monstro' };
      if (monster.boss) return { gain: 0, note: 'o boss da wave 10 luta sozinho: nao ha vizinho pra estourar' };
      const burst = Math.min(0.15 * hp, 6 * lv);
      const adj = ctx.carnageAdj != null ? ctx.carnageAdj : CARNAGE_ADJ;
      return { gain: (v / 100) * burst * adj / hp };
    }
    case 'ownHp':   return { gain: null, note: 'depende do seu HP maximo (a arvore da %, nao o valor)' };
    case 'ownMana': return { gain: null, note: 'depende da sua mana maxima (a arvore da %, nao o valor)' };
    default:        return { gain: null, note: 'nao e dano' };
  }
}

/* QUANTOS BICHOS O CARNAGE ACERTA, em media, numa hunt.

   O estouro vai nas 4 casas coladas no bicho que morreu (wiki). Com o pack colado
   em voce, das 4 casas de um bicho do anel uma e' VOCE e outra fica pra fora do
   anel; sobram 2 casas do proprio anel -- e so contam se tiver bicho vivo nelas.
   Vale tanto pro bicho na sua frente (acerta os dois do lado dele) quanto pro da
   diagonal (acerta os dois colados nele).

   Entao a conta e' por morte: quando o k-esimo bicho de uma wave de n morre,
   sobram n-k vivos espalhados pelas outras 7 casas do anel, e cada uma das 2 casas
   do alcance tem bicho com chance min(n-k,7)/7. Media sobre todas as mortes das
   waves 1-9 (a wave 10 e' o boss sozinho). Pack que comeca em 4: 0,73 -- nao 2.

   Premissa: o pack fica colado em voce (melee, ou o ranged com tank). Kitando, eles
   andam em fila e o Carnage acerta ainda menos. */
function carnageNeighbors(hunt) {
  const pb = (hunt && hunt.packBase) || 4;
  let hits = 0, kills = 0;
  for (let w = 1; w <= WAVES; w++) {
    const n = Math.min(PACK_CAP, pb + Math.floor((w - 1) / 2));
    for (let k = 1; k <= n; k++) { hits += CARNAGE_ADJ * Math.min(n - k, 7) / 7; kills++; }
  }
  return kills ? hits / kills : 0;
}

/* CARNAGE x ELEMENTAL, pela quantidade de golpes. No teto de level os dois viram
   numeros fixos: o elemental rende chance x min(2 x level, 5% do HP) POR GOLPE, o
   Carnage rende chance x min(15% do HP, 6 x level) x vizinhos POR MORTE. O elemental
   passa o Carnage quando os golpes pra matar o bicho passam da razao entre os dois
   -- e isso nao depende do tamanho do golpe, so de quantos voce da. Devolve os
   golpes de virada (null se nao ha como comparar). */
function carnageBreakeven(creature, ctx, carnage, elem, hunt) {
  if (!carnage || !elem) return null;
  const hp = creature.hpFight || creature.hp || 0, lv = ctx.level || 1;
  if (!hp) return null;
  const tc = (carnage.values || []).length - 1, te = (elem.values || []).length - 1;
  const perKill = (carnage.values[tc] / 100) * Math.min(0.15 * hp, 6 * lv) * carnageNeighbors(hunt);
  const perHit = (elem.values[te] / 100) * Math.min(2 * lv, 0.05 * hp) * elementMult(creature.resist, elem.element, ctx.pierce);
  if (!perHit) return null;
  return perKill / perHit;
}

/* comparativo de charms contra UM monstro, do melhor pro pior.
   Charms que nao sao dano ficam de fora; os sem estimativa vao pro fim. */
function charmRanking(monster, ctx, charms) {
  const table = charms || global.CHARMS || [];
  const rows = [];
  for (const c of table) {
    if (!EFFECT[c.key]) continue;
    const top = (c.values || []).length - 1;
    if (top < 0) continue;
    const tiers = (c.values || []).map((v, i) => {
      const g = charmGain(c, i, monster, ctx);
      return { tier: i + 1, value: v, points: c.points ? sumTo(c.points, i) : null,
        echoes: c.echoes ? sumTo(c.echoes, i) : null, gain: g.gain };
    });
    const best = charmGain(c, top, monster, ctx);
    const points = c.points ? sumTo(c.points, top) : null;
    const echoes = c.echoes ? sumTo(c.echoes, top) : null;
    const cost = points || echoes || 0;
    rows.push({
      key: c.key, name: c.name, category: c.category, element: c.element || null,
      effect: EFFECT[c.key], tier: top + 1, value: (c.values || [])[top],
      points, echoes, tiers,
      gain: best.gain == null ? null : best.gain,
      gainPerK: (best.gain == null || !cost) ? null : best.gain / cost * 1000,
      note: best.note || null,
    });
  }
  return rows.sort((a, b) => {
    if (a.gain == null && b.gain == null) return 0;
    if (a.gain == null) return 1;
    if (b.gain == null) return -1;
    return b.gain - a.gain;
  });
}

/* Charm Point sai do BESTIARY: cada criatura com o bestiary fechado rende pontos,
   e um charm Maior so pode ser atribuido a um monstro de bestiary completo. Logo
   "use Savage Blow nesse bicho" tem um preco em kills, e a UI mostra os dois.
   Tabela da wiki do jogo (estrelas pela exp da criatura). */
const BESTIARY = [
  { max: 99,    stars: 1, points: 20,  kills: 250  },
  { max: 499,   stars: 2, points: 60,  kills: 500  },
  { max: 1999,  stars: 3, points: 100, kills: 1000 },
  { max: 9999,  stars: 4, points: 200, kills: 2500 },
  { max: Infinity, stars: 5, points: 400, kills: 2500 },
];
function bestiary(exp) {
  return BESTIARY.find(b => (exp || 0) <= b.max);
}

/* ============================================================================
   AMEACA — de que elemento a hunt te castiga

   O bundle do jogo traz, por monstro, `dmg:[min,max]` (o corpo-a-corpo) e
   `abilities:[{element,min,max,chance,interval}]` (os golpes especiais). Daqui sai
   o dano por segundo que cada bicho cospe, separado por elemento -- que e' o que
   decide qual absorb/imbuement de protecao levar pra hunt.

   PREMISSA DA CADENCIA DO MELEE: o `dmg` nao vem com intervalo. Nas abilities o
   intervalo dominante e' 2000ms (770 das ~1300 do bundle), e os monstros que
   trazem o proprio melee como ability o declaram em 2000ms -- daqui o MELEE_MS.
   O combate roda no servidor (o bundle nunca LE resist, dmg nem abilities: so os
   escreve), entao essa cadencia nao da pra conferir no cliente. Se estiver errada,
   ela erra por igual em todo mundo: a REPARTICAO por elemento -- que e' o que a
   aba mostra -- nao muda, so o valor absoluto de dano/s.

   `healing` nas abilities nao e' ameaca: e' o bicho se curando. Sai separado,
   porque um monstro que se cura muda como voce luta, nao do que voce se protege.
   ============================================================================ */

/* dano por segundo de UM monstro, por elemento, a partir do dado cru do bundle.
   Usado pelo extrator pra gravar `threat` em data/hunts.json -- a conta mora aqui
   pra nao existir uma segunda versao dela no tools/. */
function monsterThreat(raw) {
  const dps = {};
  let heal = 0;
  const dmg = raw.dmg || [0, 0];
  const melee = ((dmg[0] || 0) + (dmg[1] || 0)) / 2;
  if (melee > 0) dps.physical = melee * 1000 / MELEE_MS;
  for (const a of raw.abilities || []) {
    const avg = ((a.min || 0) + (a.max || 0)) / 2;
    const iv = a.interval || MELEE_MS;
    const rate = avg * ((a.chance == null ? 100 : a.chance) / 100) * 1000 / iv;
    if (!rate) continue;
    if (a.element === 'healing') { heal += rate; continue; }
    if (ELEMENTS.indexOf(a.element) < 0) continue;   // elemento que nao existe no jogo
    dps[a.element] = (dps[a.element] || 0) + rate;
  }
  return { dps, heal };
}

/* de que a hunt te castiga, e quanto.

   O dano que voce TOMA de um monstro na hunt inteira e' (tempo que ele fica vivo)
   x (dano/s dele). O tempo vivo e' proporcional ao HP que ele representa no clear
   -- exatamente o `weight` do packWeights. Por isso a repartição por elemento sai
   ponderada pelo mesmo peso, e nao pela contagem de spawn: um bicho gordo te bate
   por mais tempo. O boss da wave 10 entra com dano x1.5 (e o HP x3 ja esta no peso).

   `share` e' o que interessa (que protecao levar). O absoluto depende do seu DPS,
   que decide quanto tempo cada bicho fica vivo -- por isso ele nao sai daqui. */
function huntThreat(hunt) {
  const w = packWeights(hunt);
  const acc = {};
  let total = 0, missing = 0, counted = 0;
  const healers = [];
  for (const m of w) {
    if (!m.threat) { if (m.weight) missing++; continue; }
    counted++;
    const mult = m.boss ? BOSS_DMG_MULT : 1;
    for (const el of ELEMENTS) {
      const v = (m.threat[el] || 0) * m.weight * mult;
      if (!v) continue;
      acc[el] = (acc[el] || 0) + v;
      total += v;
    }
    if (m.heal && healers.indexOf(m.name) < 0) healers.push(m.name);   // o boss repete a criatura
  }
  const rows = ELEMENTS.map(el => ({ el, share: total ? (acc[el] || 0) / total : 0 }))
    .filter(r => r.share > 0)
    .sort((a, b) => b.share - a.share || ELEMENTS.indexOf(a.el) - ELEMENTS.indexOf(b.el));
  return { rows, healers, missing, counted, known: counted > 0 && !missing };
}

/* ============================================================================
   PLANO DE CHARMS DA HUNT

   O ranking do charmRanking responde "o que rende mais NESTE monstro". Nao e' a
   pergunta que se joga: um charm fica preso a UMA criatura (a wiki: "escolha o
   charm, escolha a criatura"), entao levar Savage Blow no bicho A custa nao ter
   Savage Blow em B. O plano resolve isso como ATRIBUICAO: quais charms em quais
   criaturas da hunt maximizam o clear inteiro.

   AS REGRAS DO JOGO QUE ISSO OBEDECE (wiki, pagina Charms):
     - cada criatura segura no maximo 1 Maior + 1 Menor;
     - cada charm mora em uma criatura so;
     - Maior exige bestiary completo da criatura; Menor pede 1 kill;
     - slots = criaturas com charm ao mesmo tempo (2 free / 6 VIP / 25 expansion).

   O BOSS DA WAVE 10 CONTA COMO A CRIATURA DELE. A wiki diz "Bosses nao recebem
   charm", mas a pagina de Bosses separa o "boss de fase (a wave 10 de toda hunt)"
   das "salas de boss" dedicadas -- e o boss de fase e' um dos proprios bichos do
   pack (nas 79 hunts o bossKey do bundle SEMPRE aponta pra um monstro da lista),
   mesma key, mesmo bestiary, só com HP x3. Charm se prende a criatura, então ele
   vale nas duas aparicoes. Se o jogo na verdade pular o charm na wave 10, o que
   muda e' o peso da criatura-boss, nao a estrutura do plano.

   POR QUE A ATRIBUICAO E' EXATA E NAO GULOSA: sao <=7 criaturas e <=10 charms
   Maiores com estimativa, entao um DP sobre subconjunto de charms
   (criatura x mascara) fecha o otimo em ~70k operacoes. Guloso erra em caso
   comum: o charm que rende mais no bicho gordo pode ser o unico que rende no
   magro, e trocar a ordem paga mais.
   ============================================================================ */
const CHARM_SLOTS = 25;      // default: Charm Expansion. 2 free, 6 VIP.
const ALT_GAIN_FLOOR = 0.7;  // "quase tao bom" pra sugerir o charm barato
const ALT_COST_CEIL = 0.5;   // ...por menos da metade dos pontos
const TIER_GAIN_FLOOR = 0.9; // tier menor que entrega 90% do ganho vira nota

/* MIGALHA: ganho abaixo de 0,1% do clear da hunt.

   Um charm assim continua sendo atribuido -- Charm Point e' TETO, nao moeda: a
   wiki diz que o teto sai do bestiary e que resetar devolve tudo, e fechar o
   bestiary inteiro (59.200) cobre maximizar todos os Maiores (48.900). Ponto
   sobrando nao compra nada, logo charm fraco de graca ainda e' lucro.

   O que custa de verdade e' o GRIND: Maior exige o bestiary COMPLETO da criatura
   (250 a 2500 kills). Por isso a migalha nao e' escondida, e' marcada -- pra nao
   parecer que vale caçar 1000 kills por +0,05% de clear. */
const MIN_MAJOR_VALUE = 0.001;
/* desempate: entre charms que rendem igual, o barato ganha. O peso e' pequeno o
   bastante pra nunca superar diferenca real de ganho (que vive na casa de 1e-3). */
const COST_TIEBREAK = 1e-12;

/* ordem de utilidade dos Menores. Os Maiores saem da conta de dano; os Menores,
   nao: Gut e' chance de drop e Scavenge e' gold -- nao existe cambio entre "20%
   mais gold" e "6% mais dano" que nao seja inventado. Entao Fatal Hold (o unico
   que e' dano puro) entra pela conta, e o resto segue esta ordem declarada, que e'
   a que o jogador pediu: loot antes de sustain. */
const MINOR_ORDER = ['fatal_hold', 'gut', 'scavenge', 'adrenaline_burst'];

/* REGRA DA CASA: Maiores que o jogador quer SEMPRE no plano (opts.must). E' politica
   dele, nao conta -- por isso vem de fora e o default e' vazio: sem ela o plano segue
   so a matematica (com crit 30% e sem Avatar, a Low Blow ganha da Savage, e o plano
   tem que dizer isso). A aba Hunts passa ['savage_blow']: Savage fixa, Low Blow so se
   valer. O bonus e' constante, entao nao muda QUAL criatura leva o que. */
const MUST_MAJOR = ['savage_blow'];   // a regra que a aba Hunts aplica
const MUST_BONUS = 1;

/* as criaturas da hunt, com o boss da wave 10 dobrado na criatura dele.
   `parts` guarda as duas aparicoes separadas porque elas rendem diferente: o proc
   elemental tem teto em 5% do HP do alvo, e na wave 10 o alvo tem HP x3. */
function huntCreatures(hunt) {
  const w = packWeights(hunt);
  const byId = new Map(), byName = new Map();
  const idOf = r => {
    if (r.key) return r.key;
    const n = String(r.name || '').toLowerCase();
    return byName.has(n) ? byName.get(n) : n;   // boss sem key cai na criatura de mesmo nome
  };
  for (const r of w) {
    const id = idOf(r);
    if (!byId.has(id)) {
      byId.set(id, { id, key: r.key || null, name: r.name, hp: r.hp, exp: r.exp,
        resist: r.resist, threat: r.threat, heal: r.heal, spawnPct: 0, weight: 0,
        parts: [], isBoss: false });
      byName.set(String(r.name || '').toLowerCase(), id);
    }
    const c = byId.get(id);
    c.weight += r.weight;
    c.spawnPct += r.spawnPct || 0;
    c.parts.push({ hpFight: r.hpFight, resist: r.resist, weight: r.weight, boss: r.boss });
    if (r.boss) c.isBoss = true;
    if (!c.key && r.key) c.key = r.key;
  }
  const list = [...byId.values()];
  const total = list.reduce((s, c) => s + c.weight, 0) || 1;
  for (const c of list) c.share = c.weight / total;
  return list.sort((a, b) => b.weight - a.weight);
}

/* ganho de um charm numa CRIATURA (pack + wave 10 juntos), como fracao do dano.
   Media ponderada pelo peso de cada aparicao. */
function charmValue(charm, tier, creature, ctx) {
  let acc = 0, w = 0, note = null;
  for (const p of creature.parts) {
    const g = charmGain(charm, tier, { hpFight: p.hpFight, hp: p.hpFight, resist: p.resist, boss: p.boss }, ctx);
    if (g.gain == null) return { gain: null, note: g.note };
    if (!g.gain && g.note && !note) note = g.note;
    acc += g.gain * p.weight;
    w += p.weight;
  }
  return { gain: w ? acc / w : 0, note };
}

/* atribuicao otima de charms Maiores: DP sobre (criatura, mascara de charms usados).
   Valor de um par = ganho na criatura x peso dela no clear = ganho na hunt. */
function assign(creatures, cands, ctx, slots, must) {
  const n = creatures.length, k = cands.length;
  if (!n || !k) return [];
  const val = creatures.map(c => cands.map(ch => {
    const v = charmValue(ch.charm, ch.tier, c, ctx);
    if (v.gain == null) return null;
    return v.gain * c.share - (sumCost(ch.charm, ch.tier) || 0) * COST_TIEBREAK
      + (must && must.indexOf(ch.charm.key) >= 0 ? MUST_BONUS : 0);
  }));
  const FULL = 1 << k;
  const popcount = m => { let n2 = 0; while (m) { n2 += m & 1; m >>= 1; } return n2; };
  /* best[i][mask] = melhor valor das criaturas i..n-1 usando os charms de `mask` */
  let next = new Float64Array(FULL);
  let pick = [];
  for (let i = n - 1; i >= 0; i--) {
    const cur = new Float64Array(FULL);
    const chosen = new Int8Array(FULL).fill(-1);
    for (let mask = 0; mask < FULL; mask++) {
      let best = next[mask], bestC = -1;                 // opcao: criatura i sem charm
      if (popcount(mask) < slots) {
        for (let j = 0; j < k; j++) {
          const bit = 1 << j;
          if (mask & bit) continue;
          const v = val[i][j];
          if (v == null) continue;
          const tot = v + next[mask | bit];
          if (tot > best + 1e-12) { best = tot; bestC = j; }
        }
      }
      cur[mask] = best;
      chosen[mask] = bestC;
    }
    pick[i] = chosen;
    next = cur;
  }
  const out = [];
  let mask = 0;
  for (let i = 0; i < n; i++) {
    const j = pick[i][mask];
    if (j < 0) { out.push(null); continue; }
    out.push(cands[j]);
    mask |= 1 << j;
  }
  return out;
}

/* preenche com elementais o que sobrou, escolhendo por resistencia em vez de por
   ganho. Devolve o conjunto de indices que entraram assim, pra a UI poder dizer que
   ali falta numero -- nao e' a mesma coisa que um charm medido. */
function assignBlind(creatures, assigned, blind, ctx, slots) {
  const out = new Set();
  if (!blind.length) return out;
  const used = new Set();
  let occupied = assigned.filter(Boolean).length;
  creatures.forEach((c, i) => {
    if (assigned[i] || occupied >= slots) return;
    let best = null, bestMult = 0, bestCost = Infinity;
    for (const b of blind) {
      if (used.has(b.charm.key)) continue;
      const mult = elementMult(c.resist, b.charm.element, (ctx && ctx.pierce) || 0);
      if (mult <= 0) continue;                       // imune: o charm nao faz nada
      const cost = sumCost(b.charm, b.tier) || 0;
      /* fraqueza manda; empate de resistencia vai pro charm mais barato */
      if (mult > bestMult + 1e-9 || (Math.abs(mult - bestMult) <= 1e-9 && cost < bestCost)) {
        best = b; bestMult = mult; bestCost = cost;
      }
    }
    if (!best) return;
    used.add(best.charm.key);
    assigned[i] = best;
    out.add(i);
    occupied++;
  });
  return out;
}

/* o plano da hunt: um Maior + um Menor por criatura, cada charm usado uma vez.
   opts: { owned:[keys] | null, slots:n, charms:[tabela] } */
function huntCharmPlan(hunt, ctxIn, opts) {
  const o = opts || {};
  /* o Carnage da hunt usa os vizinhos que ESTA hunt tem, nao o teto */
  const ctx = Object.assign({}, ctxIn || {}, { carnageAdj: carnageNeighbors(hunt) });
  const table = o.charms || global.CHARMS || [];
  const owned = o.owned ? new Set(o.owned) : null;
  const slots = o.slots || CHARM_SLOTS;
  const has = c => !owned || owned.has(c.key);
  const creatures = huntCreatures(hunt);
  const topTier = c => (c.values || []).length - 1;

  /* candidatos Maiores: tem conta de dano, o jogador tem, e rendem algo aqui */
  const majors = table.filter(c => c.category === 'major' && EFFECT[c.key] && has(c));
  const cands = majors.map(c => ({ charm: c, tier: topTier(c) })).filter(c => c.tier >= 0);
  const scored = cands.filter(c => creatures.some(cr => charmValue(c.charm, c.tier, cr, ctx).gain != null));
  const assigned = assign(creatures, scored, ctx, slots, o.must || null);

  /* ELEMENTAL SEM DPS COLADO ainda entra -- pela RESISTENCIA.

     O ganho do elemental e' dano fixo, entao virar porcentagem exige saber o seu
     dano por golpe. Nao saber quanto ele rende, porem, nao e' o mesmo que nao saber
     ONDE ele rende mais: a resistencia do bicho ja ordena isso sozinha. Deixar a
     criatura sem charm nenhum era esconder resposta que existe. */
  const blind = cands.filter(c => c.charm.element && scored.indexOf(c) < 0);
  const blindAt = assignBlind(creatures, assigned, blind, ctx, slots);

  /* os Maiores que ninguem usou -- servem pras notas de alternativa mais barata */
  const usedMajor = new Set(assigned.filter(Boolean).map(a => a.charm.key));
  const spareMajor = scored.filter(c => !usedMajor.has(c.charm.key));

  const rows = creatures.map((c, i) => {
    const a = assigned[i];
    const major = a ? Object.assign({ }, describe(a.charm, a.tier, c, ctx),
      { alt: cheaperAlt(a, c, ctx, spareMajor), tierNote: cheaperTier(a.charm, a.tier, c, ctx) }) : null;
    /* migalha: o charm entra (ponto sobrando nao vale nada) mas fica marcado, pra
       nao virar recomendacao de fechar bestiary por +0,05% de clear. */
    if (major) {
      major.marginal = major.gain != null && major.gain * c.share < MIN_MAJOR_VALUE;
      major.blind = blindAt.has(i);   // entrou por resistencia: falta o seu DPS pro numero
    }
    return { creature: c, major, majorNote: major ? null : 'none', minor: null,
      bestiary: bestiary(c.exp), elem: elemBreakeven(major, c, ctx, majors),
      locked: bestLocked(major, c, ctx, table, owned) };
  });

  /* MENORES, pelo que cada um rende de verdade:
       1. Fatal Hold (dano) onde rende mais na hunt -- e' o unico Menor que acelera o clear;
       2. Scavenge (+20% das MOEDAS) e Gut (+12% da chance dos outros DROPS) nas criaturas
          em que valem mais gold por clear, contado no loot real da hunt (sem loot na
          mao, caem na ordem declarada);
       3. o resto (utilidade) desce pelo peso da criatura.
     Slot e' POR CRIATURA: Menor vai primeiro em quem ja levou Maior. */
  const withMajor = rows.filter(r => r.major);
  const order = withMajor.concat(rows.filter(r => !r.major)).slice(0, slots);
  const minorOf = k => { const c = table.find(x => x.key === k); return c && has(c) && topTier(c) >= 0 ? c : null; };
  const put = (r, m) => { r.minor = describe(m, topTier(m), r.creature, ctx); };

  const fh = minorOf('fatal_hold');
  if (fh) {
    let best = -Infinity, target = null;
    for (const r of order) {
      if (r.minor) continue;
      const v = charmValue(fh, topTier(fh), r.creature, ctx);
      if (v.gain == null) continue;
      if (v.gain * r.creature.share > best) { best = v.gain * r.creature.share; target = r; }
    }
    if (target) put(target, fh);
  }

  const gold = o.loot ? creatureGold(hunt, o.loot) : null;
  const sc = minorOf('scavenge'), gt = minorOf('gut');
  if (gold && (sc || gt)) {
    const val = (m, r) => {
      const g = gold.get(r.creature.key || r.creature.id) || { coins: 0, drops: 0 };
      const pctv = (m.values || [])[topTier(m)] / 100;
      return m.key === 'scavenge' ? g.coins * pctv : g.drops * pctv;
    };
    /* dois charms, criaturas diferentes: testa todos os pares (sao poucas). Os dois
       sao FIXOS (regra da casa): com criatura livre pros dois, os dois entram, mesmo
       que um renda pouco; so com uma criatura sobrando e' que se escolhe o melhor. */
    const free = order.filter(r => !r.minor);
    let best = { v: -1, a: null, b: null };
    const both = sc && gt && free.length >= 2;
    const optsA = sc ? (both ? free : [null, ...free]) : [null];
    const optsB = gt ? (both ? free : [null, ...free]) : [null];
    for (const ra of optsA) for (const rb of optsB) {
      if (ra && rb && ra === rb) continue;
      const v = (ra ? val(sc, ra) : 0) + (rb ? val(gt, rb) : 0);
      if (v > best.v) best = { v, a: ra, b: rb };
    }
    if (best.a && sc) { put(best.a, sc); best.a.minor.goldClear = val(sc, best.a); }
    if (best.b && gt) { put(best.b, gt); best.b.minor.goldClear = val(gt, best.b); }
  }

  for (const k of MINOR_ORDER) {
    if (k === 'fatal_hold' || (gold && (k === 'scavenge' || k === 'gut'))) continue;
    const m = minorOf(k);
    if (!m || rows.some(r => r.minor && r.minor.key === k)) continue;
    const target = order.find(r => !r.minor);
    if (target) put(target, m);
  }

  const needsDps = !(ctx && ctx.dps > 0) && majors.some(c => EFFECT[c.key] === 'elem');
  return { rows, slots, slotsUsed: rows.filter(r => r.major || r.minor).length,
    missing: majors.length !== table.filter(c => c.category === 'major' && EFFECT[c.key]).length,
    needsDps };
}

/* gold por clear que cada criatura solta: MOEDAS (o que o Scavenge aumenta) e o
   resto do loot com preco (o que o Gut aumenta, pela chance de drop). */
function creatureGold(hunt, loot) {
  const prices = lootPrices(loot);
  const out = new Map();
  for (const k of killsPerClear(hunt)) {
    const rows = lootRows(k.key, loot);
    if (!rows) continue;
    let coins = 0, drops = 0;
    for (const r of rows) {
      const g = k.kills * lootPerKill(r) * (prices[r.name] || 0);
      if (/(gold|platinum|crystal) coin/.test(r.name)) coins += g; else drops += g;
    }
    out.set(k.key, { coins, drops });
  }
  return out;
}

const sumCost = (c, tier) => (c.points ? sumTo(c.points, tier) : null);
const sumEch = (c, tier) => (c.echoes ? sumTo(c.echoes, tier) : null);

function describe(charm, tier, creature, ctx) {
  const v = charmValue(charm, tier, creature, ctx);
  return { key: charm.key, name: charm.name, element: charm.element || null,
    category: charm.category, desc: charm.desc || null,
    tier: tier + 1, value: (charm.values || [])[tier],
    points: sumCost(charm, tier), echoes: sumEch(charm, tier),
    /* quanto o alvo apanha do elemento do charm: e' o que sobra de informacao
       quando o ganho nao da pra calcular, e vale mostrar sempre. */
    mult: charm.element ? elementMult(creature.resist, charm.element, (ctx && ctx.pierce) || 0) : null,
    gain: v.gain, note: v.note || null };
}

/* o charm barato que quase empata com o escolhido -- a decisao real de 4000 vs
   1200 pontos. So sugere charm que sobrou (usar um ja atribuido custaria o outro). */
function cheaperAlt(chosen, creature, ctx, spare) {
  const g0 = charmValue(chosen.charm, chosen.tier, creature, ctx).gain;
  const c0 = sumCost(chosen.charm, chosen.tier);
  if (!g0 || !c0) return null;
  let best = null;
  for (const s of spare) {
    const g = charmValue(s.charm, s.tier, creature, ctx).gain;
    const c = sumCost(s.charm, s.tier);
    if (!g || !c) continue;
    if (g < g0 * ALT_GAIN_FLOOR || c > c0 * ALT_COST_CEIL) continue;
    if (!best || g / c > best.gain / best.points) best = describe(s.charm, s.tier, creature, ctx);
  }
  return best;
}

/* o charm que voce NAO tem e que bateria o escolhido -- e' o que responde "vale
   caçar essa runa?". Sai com o ganho dos dois lado a lado, sem entrar no plano:
   plano e' o que da pra executar hoje.

   O caso vivo: Low Blow (+chance de crit) ganha de Savage Blow (+dano de crit)
   enquanto a sua chance de crit for baixa -- 30%/+150% de crit ja poe Low Blow em
   +12.9% contra +7.5%. Quanto mais crit chance voce junta, mais a Savage encosta. */
function bestLocked(major, creature, ctx, table, owned) {
  if (!owned) return null;
  let best = null;
  for (const c of table) {
    if (c.category !== 'major' || !EFFECT[c.key] || owned.has(c.key)) continue;
    const tier = (c.values || []).length - 1;
    if (tier < 0) continue;
    const v = charmValue(c, tier, creature, ctx);
    if (v.gain == null) continue;
    if (major && v.gain <= (major.gain || 0)) continue;      // nao e' upgrade: nao e' noticia
    if (!best || v.gain > best.gain) best = describe(c, tier, creature, ctx);
  }
  return best;
}

/* QUANDO O ELEMENTAL PASSA A VALER.

   O modelo mede o proc elemental contra o seu dano POR GOLPE (dps/aps), e `aps` so
   conta o auto-attack. Mas o charm proca em toda magia tambem -- logo quem casta
   muito acerta mais vezes por segundo do que este `aps` enxerga, e o ganho do
   elemental sobe na mesma proporcao (o proc e' por acerto, o dano por golpe cai).

   Em vez de chutar uma cadencia de magia que nao existe em nenhum dado do repo,
   sai daqui o ponto de virada: quantas VEZES o seu ritmo real de acertos teria que
   ser maior que o auto-attack pro melhor elemental empatar com o Maior escolhido.
   `times` <= 1 significa que o elemental ja ganha pela conta atual. */
function elemBreakeven(major, creature, ctx, majors) {
  if (!major || EFFECT[major.key] === 'elem') return null;
  let best = null;
  for (const c of majors) {
    if (EFFECT[c.key] !== 'elem') continue;
    const tier = (c.values || []).length - 1;
    if (tier < 0) continue;
    const v = charmValue(c, tier, creature, ctx);
    if (v.gain == null || !v.gain) continue;
    if (!best || v.gain > best.gain) best = { name: c.name, element: c.element, gain: v.gain };
  }
  if (!best || !major.gain) return null;
  return { name: best.name, element: best.element, gain: best.gain, times: major.gain / best.gain };
}

/* o tier menor que quase empata. Savage Blow e' o caso: T2 da +40% de crit damage
   por 2000 pontos, T3 da +44% por 6000 -- 3x o custo por 4 pontos percentuais. */
function cheaperTier(charm, tier, creature, ctx) {
  const g0 = charmValue(charm, tier, creature, ctx).gain;
  const c0 = sumCost(charm, tier);
  if (!g0 || !c0) return null;
  for (let t = 0; t < tier; t++) {
    const g = charmValue(charm, t, creature, ctx).gain;
    const c = sumCost(charm, t);
    if (g == null || !c || c >= c0) continue;
    if (g >= g0 * TIER_GAIN_FLOOR) return { tier: t + 1, gain: g, points: c };
  }
  return null;
}

/* ============================================================================
   LOOT — quanto de cada item uma hunt rende, e qual hunt rende mais de um item

   O bundle traz, por monstro, `loot:[{name, chance, max}]`. `chance` e' por
   100.000 (chance:750 = 0,75%) e `max` marca o stackavel: a quantidade rola
   uniforme de 1 a max.

   NADA DISSO E' CHUTE -- fecha contra um numero que o repo ja tinha por outra
   via. Somando (gold coin + platinum + crystal) x chance/1e5 x (1+max)/2 pelas
   mortes de um clear, o resultado bate com o `goldPerClear` gravado em
   data/hunts.json nas 79 hunts, exato. Isso prende de uma vez a escala da
   chance, a media do max e a contagem de mortes daqui de baixo. O
   tools/check-loot.js roda essa igualdade.

   PESO POR MORTE, NAO POR HP. O `packWeights` pesa cada monstro pelo HP que ele
   representa, porque lá o que se mede e' tempo gasto batendo (elemento, charm).
   Loot nao: um bicho de 100 HP e um de 10.000 dropam uma vez cada. Por isso
   existe o `killsPerClear` separado, e nao um parametro no packWeights -- sao
   duas perguntas diferentes sobre o mesmo pack, e misturar as duas foi o unico
   jeito de errar isso.

   A RARIDADE (Comum/Incomum/Raro/Epico/Lendario/Mitico) NAO ESTA AQUI. Ela e'
   outro eixo -- a qualidade que o item rola QUANDO cai -- e vem do servidor
   (admin.rarityDrop), nao do bundle. O que esta aqui e' a chance de cair.
   ============================================================================ */

/* quantas mortes de cada criatura um clear inteiro produz: as waves 1-9 pelo
   peso de spawn, mais 1 do boss da wave 10. */
function killsPerClear(hunt) {
  const list = (hunt && hunt.monsters) || [];
  const share = m => (m.spawn != null ? m.spawn : 1);
  const totShare = list.reduce((s, m) => s + share(m), 0) || 1;
  const spawns = spawnCount(hunt && hunt.packBase);
  const byKey = new Map();
  const add = (key, name, n) => {
    const id = key || String(name || '').toLowerCase();
    if (!byKey.has(id)) byKey.set(id, { key: id, name, kills: 0 });
    byKey.get(id).kills += n;
  };
  for (const m of list) add(m.key, m.name, spawns * share(m) / totShare);
  /* o boss da wave 10 e' um dos bichos do pack (mesma key, HP x3): uma morte a
     mais na criatura dele, nao uma criatura nova. */
  const b = hunt && hunt.boss;
  if (b && b.hp) add(b.key, b.name, 1);
  return [...byKey.values()].sort((a, b2) => b2.kills - a.kills);
}

/* unidades esperadas por morte de uma linha de loot */
function lootPerKill(row) {
  const p = (row && row.chance || 0) / 1e5;
  return p * (row && row.max ? (1 + row.max) / 2 : 1);
}

/* MESMO ITEM EM VARIAS LINHAS DA MESMA CRIATURA e' normal, nao e' erro do dado:
   o stack tem teto, entao um bicho que solta 297 gold vem em tres linhas de ate
   100. Sao rolagens independentes, logo a esperanca SOMA. E' exatamente somando
   assim que o gold calculado bate com o goldPerClear gravado -- se isso virar
   "pegue a maior linha" algum dia, o check-loot.js cai no bloco 3.

   Pra tela, as linhas de uma mesma criatura viram UMA fonte: mostrar "Spectre
   33%" tres vezes seguidas nao informa nada. `rows` guarda quantas eram. */
function foldSource(acc, k, r) {
  let f = acc.get(k.key);
  if (!f) acc.set(k.key, f = { key: k.key, name: k.name, kills: k.kills, chance: 0, max: 0, rows: 0, perKill: 0 });
  f.rows++;
  f.perKill += lootPerKill(r);
  if (r.chance > f.chance) f.chance = r.chance;   // a maior, pra rotular a fonte
  if ((r.max || 0) > f.max) f.max = r.max || 0;
  return f;
}

/* a tabela de loot de um monstro, normalizada. Aceita as duas formas: o objeto
   de data/loot.json e o array compacto de public/loot.js ([name,chance,max]). */
function lootRows(key, loot) {
  const table = (loot || global.LOOT || {}).m || (loot || global.LOOT || {}).monsters || {};
  const raw = table[key];
  if (!raw) return null;
  return raw.map(r => (Array.isArray(r)
    ? { name: r[0], chance: r[1], max: r[2] || 0 }
    : { name: r.name, chance: r.chance, max: r.max || 0 }));
}
function lootPrices(loot) {
  const src = loot || global.LOOT || {};
  return src.p || src.prices || {};
}

/* TUDO que uma hunt rende por clear. `gold` so conta o item que tem preco no
   bundle -- 225 dos itens alcancaveis nao tem, e somar 0 por eles seria mentir
   que o total e' o total. Por isso `priced` volta separado. */
function huntLoot(hunt, loot) {
  const prices = lootPrices(loot);
  const kills = killsPerClear(hunt);
  const byItem = new Map();
  const missing = [];
  for (const k of kills) {
    const rows = lootRows(k.key, loot);
    if (!rows) { missing.push(k.name || k.key); continue; }
    for (const r of rows) {
      if (!byItem.has(r.name)) byItem.set(r.name, { name: r.name, perClear: 0, src: new Map() });
      const it = byItem.get(r.name);
      it.perClear += k.kills * lootPerKill(r);
      foldSource(it.src, k, r);
    }
  }
  const items = [...byItem.values()];
  for (const it of items) {
    it.price = prices[it.name] != null ? prices[it.name] : null;
    it.gold = it.price != null ? it.perClear * it.price : 0;
    it.from = [...it.src.values()].sort((a, b) => b.chance - a.chance);
    delete it.src;
  }
  items.sort((a, b) => b.gold - a.gold || b.perClear - a.perClear);
  return {
    items,
    gold: items.reduce((s, it) => s + it.gold, 0),
    priced: items.filter(it => it.price != null).length,
    missing,                       // criaturas da hunt sem tabela de loot no bundle
  };
}

/* o inverso: das hunts dadas, quais rendem o item, e quanto.
   `perMhp` e' por 1M de HP moido -- o ranking justo quando nao ha DPS colado,
   porque um clear de lvl 800 e' varias vezes mais gordo que um de lvl 100. */
function lootSources(itemName, hunts, loot) {
  const want = String(itemName || '').toLowerCase();
  if (!want) return [];
  const list = hunts || global.HUNTS || [];
  const out = [];
  for (const h of list) {
    let perClear = 0;
    const src = new Map();
    for (const k of killsPerClear(h)) {
      const rows = lootRows(k.key, loot);
      if (!rows) continue;
      for (const r of rows) {
        if (String(r.name).toLowerCase() !== want) continue;
        perClear += k.kills * lootPerKill(r);
        foldSource(src, k, r);
      }
    }
    if (perClear <= 0) continue;
    out.push({ hunt: h, id: h.id, name: h.name, minLevel: h.minLevel, perClear,
      from: [...src.values()].sort((a, b) => b.chance - a.chance),
      perMhp: h.hpPerClear ? perClear / (h.hpPerClear / 1e6) : 0 });
  }
  return out.sort((a, b) => b.perClear - a.perClear);
}

/* UMA LISTA de itens contra as hunts: quantos da lista cada hunt cobre, e quanto
   valem por clear. E' a pergunta de quem tem cinco itens em mente em vez de um --
   e ela nao e' `lootSources` rodado N vezes e somado, porque "quantidade" nao
   soma entre itens diferentes (um amuleto + uma moeda nao sao dois de nada). O
   que soma e' COBERTURA (quantos da lista caem ali) e GOLD (o que essa fatia
   vale), nessa ordem. */
function lootBasket(names, hunts, loot) {
  const want = new Map();
  for (const n of (names || [])) {
    const s = String(n || '').trim();
    if (s) want.set(s.toLowerCase(), s);
  }
  if (!want.size) return [];
  const list = hunts || global.HUNTS || [];
  const prices = lootPrices(loot);
  const out = [];

  for (const h of list) {
    /* uma passada pelo pack, colhendo so o que esta na lista */
    const got = new Map();
    for (const k of killsPerClear(h)) {
      const rows = lootRows(k.key, loot);
      if (!rows) continue;
      for (const r of rows) {
        const key = String(r.name).toLowerCase();
        if (!want.has(key)) continue;
        if (!got.has(key)) got.set(key, { name: want.get(key), perClear: 0, src: new Map() });
        const it = got.get(key);
        it.perClear += k.kills * lootPerKill(r);
        foldSource(it.src, k, r);
      }
    }
    if (!got.size) continue;
    const hits = [...got.values()].map(it => {
      const price = prices[it.name] != null ? prices[it.name] : null;
      return { name: it.name, perClear: it.perClear, price,
        gold: price != null ? it.perClear * price : 0,
        from: [...it.src.values()].sort((a, b) => b.chance - a.chance) };
    }).sort((a, b) => b.gold - a.gold || b.perClear - a.perClear);
    out.push({ hunt: h, id: h.id, name: h.name, minLevel: h.minLevel,
      covered: hits.length, wanted: want.size, hits,
      gold: hits.reduce((s, x) => s + x.gold, 0) });
  }
  return out.sort((a, b) => b.covered - a.covered || b.gold - a.gold);
}

/* todo item alcancavel pelas hunts, pra alimentar a busca. Com opts.bosses os
   itens que so caem de boss entram tambem (e `bosses` conta de quantos). */
function lootItems(hunts, loot, opts) {
  const list = hunts || global.HUNTS || [];
  const prices = lootPrices(loot);
  const seen = new Map();
  const get = name => {
    if (!seen.has(name)) seen.set(name, { name, hunts: 0, bosses: 0, price: prices[name] != null ? prices[name] : null });
    return seen.get(name);
  };
  for (const h of list) {
    for (const k of killsPerClear(h)) {
      const rows = lootRows(k.key, loot);
      if (!rows) continue;
      for (const r of rows) get(r.name).hunts++;
    }
  }
  if (opts && opts.bosses) {
    const table = bossTable(loot);
    for (const id of Object.keys(table)) {
      const names = new Set(bossLootRows(id, loot).map(r => r.name));
      for (const n of names) get(n).bosses++;
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ============================================================================
   LOOT DE BOSS

   O mesmo `loot:[{name, chance, max}]` do bundle, na mesma escala (chance por
   100.000, stackavel rola 1..max), so que por MORTE do boss e nao por clear: uma
   sala de boss e' uma luta, nao um pack que respawna. Fica em LOOT.b, indexado
   pelo id da aba Bosses.

   O que NAO esta aqui: o que o servidor faz por cima (raridade do item, reward
   bag). Isso nao vem no bundle; o que vem e' a chance de cair, e e' ela que
   aparece.
   ============================================================================ */
function bossTable(loot) {
  const src = loot || global.LOOT || {};
  return src.b || {};
}
function bossLootRows(id, loot) {
  const raw = bossTable(loot)[id];
  if (!raw) return [];
  return raw.map(r => (Array.isArray(r)
    ? { name: r[0], chance: r[1], max: r[2] || 0 }
    : { name: r.name, chance: r.chance, max: r.max || 0 }));
}
/* tudo que UMA morte do boss rende. Linhas repetidas do mesmo item (stack com
   teto) somam, igual nas hunts. Ordem: o que mais vale por morte primeiro. */
function bossLoot(id, loot) {
  const prices = lootPrices(loot);
  const byItem = new Map();
  for (const r of bossLootRows(id, loot)) {
    if (!byItem.has(r.name)) byItem.set(r.name, { name: r.name, chance: 0, max: 0, perKill: 0, rows: 0 });
    const it = byItem.get(r.name);
    it.rows++;
    it.perKill += lootPerKill(r);
    if (r.chance > it.chance) it.chance = r.chance;
    if ((r.max || 0) > it.max) it.max = r.max || 0;
  }
  const items = [...byItem.values()].map(it => {
    const price = prices[it.name] != null ? prices[it.name] : null;
    return Object.assign(it, { price, gold: price != null ? it.perKill * price : 0 });
  }).sort((a, b) => b.gold - a.gold || b.chance - a.chance);
  return { items, gold: items.reduce((s, it) => s + it.gold, 0) };
}
/* o inverso: quais bosses dropam o item, com a chance e quanto sai por morte */
function bossSources(itemName, bosses, loot) {
  const want = String(itemName || '').toLowerCase();
  if (!want) return [];
  const out = [];
  for (const b of (bosses || global.BOSSES || [])) {
    const it = bossLoot(b.id, loot).items.find(x => x.name.toLowerCase() === want);
    if (!it) continue;
    out.push({ boss: b, id: b.id, name: b.name, minLevel: b.minLevel, rarity: b.rarity,
      chance: it.chance, max: it.max, rows: it.rows, perKill: it.perKill });
  }
  return out.sort((a, b) => b.perKill - a.perKill || b.chance - a.chance);
}

global.HuntModel = { ELEMENTS, spawnCount, elementMult, packWeights, huntElements,
  critMult, charmRanking, bestiary, monsterThreat, huntThreat, huntCreatures,
  charmValue, huntCharmPlan, MINOR_ORDER, CHARM_SLOTS,
  killsPerClear, lootPerKill, huntLoot, lootSources, lootItems, lootBasket,
  bossLoot, bossSources,
  CRIT_BASE, EXEC_FRAC, CARNAGE_ADJ, BOSS_DMG_MULT, MELEE_MS, carnageNeighbors, carnageBreakeven, MUST_MAJOR };

})(typeof window !== 'undefined' ? window : globalThis);
