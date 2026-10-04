/* ============================================================================
   extract-game-data.js — puxa do bundle do jogo o que a aba Hunts precisa:
   a RESISTENCIA ELEMENTAL de cada monstro e a tabela de CHARMS.

       node tools/extract-game-data.js                 # baixa o bundle de baiakidle.com
       node tools/extract-game-data.js caminho.js      # usa um bundle ja baixado
       node tools/extract-game-data.js --dry           # so mostra o que mudaria

   Escreve:
     data/monsters.json   bestiary inteiro: name, hp, exp, armor, resist
     data/charms.json     os 24 charms: valores por tier e custo
     data/loot.json       tabela de loot do bestiary inteiro: item, chance, max
     data/prices.json     preco de venda de cada item, em gold
     data/hunts.json      hunt nova entra montada do zero (buildHunt); gravada so e'
                          recalculada se um insumo mudou no jogo; em todas injeta
                          `resist`, `threat` e `spawn` (quando o pack nao divide igual)
     data/bosses.json     salas de boss novas entram, as gravadas sao reescritas do
                          bundle; world bosses ficam como estao
     public/bosses.js     gerado a partir do data/bosses.json
     public/hunts.js      regenerado a partir do data/hunts.json
     public/charms.js     gerado a partir do data/charms.json
     public/loot.js       loot + precos, so das criaturas que aparecem em hunt

   COMO ELE ACHA AS COISAS: o bundle e minificado, entao os nomes das variaveis
   mudam a cada build do jogo. Em vez de chutar, o script procura a EXPRESSAO que
   monta a tabela final de monstros (base + override por nome + override por key) e
   tira dela os nomes das tres variaveis. Se o jogo mudar essa expressao, o script
   PARA com erro em vez de escrever dado errado -- e' pra ser barulhento.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data'), PUB = path.join(ROOT, 'public');
const SITE = 'https://baiakidle.com';
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const srcArg = argv.find(a => !a.startsWith('--'));

/* ---------------------------------------------------------------- fonte */
async function loadSource() {
  if (srcArg && fs.existsSync(srcArg)) {
    console.log(`bundle local: ${srcArg}`);
    return fs.readFileSync(srcArg, 'utf8');
  }
  const url = srcArg || await findBundleUrl();
  console.log(`baixando ${url}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return r.text();
}
async function findBundleUrl() {
  const r = await fetch(SITE);
  if (!r.ok) throw new Error(`${SITE} respondeu ${r.status}`);
  const html = await r.text();
  const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  if (!m) throw new Error('nao achei o <script> do bundle no index de baiakidle.com');
  return SITE + m[1];
}

/* ------------------------------------------------------- recorte de literais */
/* casa chaves/colchetes a partir de `from`, pulando o conteudo das strings. */
function matchBrackets(src, from, open) {
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return src.slice(from, i + 1);
  }
  throw new Error('literal sem fechamento a partir do offset ' + from);
}

/* avalia um literal de dados. Identificador solto (helper do bundle) vira uma
   funcao que devolve {} -- assim uma entrada exotica nao derruba a extracao
   inteira; ela so vem vazia, e a contagem no fim denuncia. */
function evalLiteral(text) {
  const scope = new Proxy({}, {
    has: () => true,
    get: (_, k) => (k === Symbol.unscopables ? undefined : () => ({})),
  });
  return new Function('__s', `with(__s){return (${text})}`)(scope);
}

function objectNamed(src, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*\\{`, 'g');
  let m, best = null;
  while ((m = re.exec(src))) {
    const text = matchBrackets(src, m.index + m[0].length - 1, '{');
    if (!best || text.length > best.length) best = text;
  }
  if (!best) throw new Error(`nao achei a definicao de ${name} no bundle`);
  return evalLiteral(best);
}
function arrayAround(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error(`nao achei "${anchor}" no bundle`);
  let depth = 0;
  for (let j = i; j >= 0; j--) {
    if (src[j] === ']') depth++;
    else if (src[j] === '[') { if (!depth) return evalLiteral(matchBrackets(src, j, '[')); depth--; }
  }
  throw new Error(`"${anchor}" nao esta dentro de um array`);
}

/* ------------------------------------------- identificador solto do bundle */
/* avalia um IDENTIFICADOR do bundle pelo que ele vale la: acha a definicao
   (`,nome=` / `const nome=` / `function nome(`), avalia, e o que ela citar de outro
   identificador e' resolvido do mesmo jeito, sob demanda. Serve pros mapas e
   funcoes pequenos que o jogo monta por cima da tabela de monstros (multiplicador
   de XP e de loot das hunts de endgame): copiar os numeros pra ca deixaria o site
   errado no primeiro rebalanceamento, que foi exatamente o bug do XP por clear.
   Globais (Object, Math, JSON...) passam direto. */
function bundleResolver(src) {
  const cache = new Map();
  const scope = new Proxy({}, {
    has: (_, k) => typeof k === 'string' && !(k in globalThis) && k !== '__s',
    get: (_, k) => (k === Symbol.unscopables ? undefined : resolve(k)),
  });
  const run = text => new Function('__s', `with(__s){return (${text})}`)(scope);
  /* fim de uma expressao: a primeira `,` ou `;` fora de string/colchete/parentese */
  function exprEnd(from) {
    let depth = 0;
    for (let i = from; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (--depth < 0) return i; }
      else if ((c === ',' || c === ';') && depth === 0) return i;
    }
    return src.length;
  }
  function resolve(name) {
    if (cache.has(name)) return cache.get(name);
    let val, found = false;
    const fn = src.indexOf(`function ${name}(`);
    if (fn >= 0) {
      const body = src.indexOf('{', src.indexOf(')', fn));
      val = run(`(${src.slice(fn, body)}${matchBrackets(src, body, '{')})`);
      found = true;
    } else {
      const re = new RegExp(`(?:[,;{]|\\b(?:const|let|var) )${name.replace(/\$/g, '\\$')}=(?![=>])`, 'g');
      let m;
      while (!found && (m = re.exec(src))) {
        const at = m.index + m[0].length;
        const text = src[at] === '{' || src[at] === '[' ? matchBrackets(src, at, src[at]) : src.slice(at, exprEnd(at));
        try { val = run(text); found = true; } catch (e) { /* outro `nome=` (string de HTML etc.): tenta o proximo */ }
      }
    }
    if (!found) throw new Error(`nao achei a definicao de ${name} no bundle`);
    cache.set(name, val);
    return val;
  }
  return resolve;
}

/* -------------------------------------------------------------- monstros */
const ELEMENTS = ['physical','energy','earth','fire','ice','holy','death'];

/* a tabela final de monstros do jogo, ja com os dois overrides aplicados.
   Sai daqui e nao de dentro do extractMonsters porque o LOOT vem do mesmo lugar:
   parsear o bundle duas vezes seria pagar duas vezes pela mesma resposta -- e
   abrir a porta pras duas leituras discordarem. */
function mergedMonsterTable(src) {
  // Ka=Object.fromEntries(Object.entries(_i).map(([e,a])=>{const o=qi[a.name.toLowerCase()]??{},t=vh[e]??{};...
  const m = src.match(
    /Object\.fromEntries\(Object\.entries\((\w+)\)\.map\(\(\[(\w+),(\w+)\]\)=>\{const \w+=(\w+)\[\3\.name\.toLowerCase\(\)\]\?\?\{\},\w+=(\w+)\[\2\]\?\?\{\}/);
  if (!m) throw new Error(
    'nao achei a expressao que monta a tabela de monstros. O bundle mudou de forma: '
    + 'abra o arquivo, procure "Object.fromEntries(Object.entries(" perto de um resist:{ e atualize o regex.');
  const [, baseVar, , , byNameVar, byKeyVar] = m;

  /* o resto da MESMA expressao, que o jogo passou a usar nas hunts de lv1500+:
       i=t1[e]??1; return[e,{...a,...o,...t,...i!==1?{exp:Math.round(a.exp*i)}:{},loot:r1(e,Xp(e,a.loot))}]
     t1 = multiplicador de XP por monstro (Bloated x3, Wandering Pillar x3.72...), r1 =
     multiplicador de CHANCE de loot. Sem isto o site mostrava ~1/3 do XP real nessas
     hunts. Se a expressao tiver so os tres overrides (bundle antigo), segue sem eles. */
  const tail = src.slice(m.index, m.index + 600).match(
    /,\w+=(\w+)\[\w+\]\?\?1;return\[\w+,\{[^}]*?\.\.\.(\w+)!==1\?\{exp:Math\.round\(\w+\.exp\*\2\)\}:\{\},loot:(\w+)\(\w+,/);
  const expVar = tail && tail[1], lootFn = tail && tail[3];
  console.log(`tabela de monstros: base=${baseVar} porNome=${byNameVar} porKey=${byKeyVar}`
    + (tail ? ` xpMult=${expVar} lootMult=${lootFn}` : ' (sem multiplicador de XP/loot)'));

  const base = objectNamed(src, baseVar);
  const byName = objectNamed(src, byNameVar);
  const byKey = objectNamed(src, byKeyVar);
  const resolve = tail ? bundleResolver(src) : null;
  const expMult = tail ? resolve(expVar) : {};
  const lootMult = tail ? resolve(lootFn) : null;

  const out = {};
  for (const [key, b] of Object.entries(base)) {
    out[key] = Object.assign({}, b, byName[String(b.name || '').toLowerCase()] || {}, byKey[key] || {});
    const xm = expMult[key] ?? 1;
    if (xm !== 1) out[key].exp = Math.round(b.exp * xm);   // sobre o exp BASE, como o jogo
    if (lootMult && Array.isArray(out[key].loot)) out[key].loot = lootMult(key, out[key].loot);
  }
  return out;
}

function extractMonsters(table) {
  const out = {};
  for (const [key, merged] of Object.entries(table)) {
    const resist = {};
    for (const el of ELEMENTS) if (merged.resist && merged.resist[el] != null) resist[el] = merged.resist[el];
    /* `dmg` e' o corpo-a-corpo [min,max]; `abilities` sao os golpes especiais, e
       delas so o que decide dano importa. O resto (radius, missile, effect, range,
       target, length, spread) e' animacao/posicionamento: nao entra na conta de
       "de que elemento me proteger", entao nao entra no repo. */
    const abilities = (merged.abilities || []).map(a => ({
      element: a.element, min: a.min, max: a.max,
      chance: a.chance == null ? 100 : a.chance, interval: a.interval || null,
    })).filter(a => a.element);
    out[key] = { name: merged.name, hp: merged.hp, exp: merged.exp, armor: merged.armor ?? null,
      dmg: merged.dmg || null, resist, abilities };
  }
  return out;
}

/* ------------------------------------------------------------------ loot */
/* `loot:[{name, chance, max}]` por monstro. `chance` e' por 100.000 e `max` marca
   o stackavel (a quantidade rola uniforme de 1 a max). A prova de que a escala e'
   essa esta no tools/check-loot.js: o gold de moedas calculado assim bate exato
   com o goldPerClear que data/hunts.json ja trazia por outra via. */
function extractLoot(table) {
  const out = {};
  for (const [key, merged] of Object.entries(table)) {
    if (!Array.isArray(merged.loot) || !merged.loot.length) continue;
    const rows = merged.loot
      .filter(r => r && r.name && r.chance)
      .map(r => (r.max ? { name: r.name, chance: r.chance, max: r.max } : { name: r.name, chance: r.chance }));
    if (rows.length) out[key] = rows;
  }
  return out;
}

/* o PRECO DE VENDA de cada item: "nome do item" -> gold.

   O jogo nao guarda isso num lugar so. Ele resolve em cascata, e a linha que faz
   isso e' a ancora daqui:

       ae[e]={value:o?.value||Vh[e]||Fh[e]||Hh[e]||0,color:...

   ou seja: o `value` que o catalogo de itens (`ae`) ja traz ganha, e so quando ele
   falta e' que valem as tres tabelas soltas, nessa ordem. A cascata NAO e'
   decorativa -- o catalogo tem 80 precos que as tabelas nao tem (`gold coin`
   entre eles) e discorda delas em outros 36, sempre ganhando. Achatar tudo num
   objeto so daria gold errado em ~116 itens.

   Como no resto do arquivo, os NOMES das quatro variaveis saem da propria
   expressao, nao de um chute: bundle novo minifica diferente, mas enquanto a
   forma da linha viver, isso acha. Se ela mudar, PARA com erro. */
function extractPrices(src) {
  const m = src.match(
    /(\w+)\[(\w+)\]=\{value:(\w+)\?\.value\|\|(\w+)\[\2\]\|\|(\w+)\[\2\]\|\|(\w+)\[\2\]\|\|0,color:/);
  if (!m) throw new Error(
    'nao achei a cascata de preco dos itens. O bundle mudou de forma: procure '
    + '"{value:" seguido de um ||, e atualize o regex.');
  const [, catalogVar, , , ...tableVars] = m;
  console.log(`preco: catalogo=${catalogVar} tabelas=${tableVars.join(',')}`);

  const out = {};
  /* de tras pra frente: a de menor precedencia entra primeiro e vai sendo
     sobrescrita, terminando no catalogo, que e' quem manda. */
  for (const v of tableVars.slice().reverse()) {
    for (const [name, gold] of Object.entries(objectNamed(src, v))) {
      if (typeof gold === 'number' && gold > 0) out[name] = gold;
    }
  }
  for (const [name, it] of Object.entries(objectNamed(src, catalogVar))) {
    if (it && typeof it.value === 'number' && it.value > 0) out[name] = it.value;
  }

  if (Object.keys(out).length < 500) throw new Error(
    `a tabela de precos veio com ${Object.keys(out).length} itens; esperado >500. `
    + 'Alguma das variaveis da cascata caiu no objeto errado.');
  return out;
}

/* ----------------------------------------------------------------- hunts */
function extractHunts(src) {
  const arr = arrayAround(src, 'id:"troll-cave"');
  const out = {};
  for (const h of arr) if (h && h.id) out[h.id] = h;
  return out;
}

/* monta uma hunt INTEIRA do bundle, com as mesmas contas que geraram as 79
   originais (conferido: reproduz todas, com no maximo ±1 de arredondamento):
     - HP do monstro = bestiary ×2 (multiplicador global do servidor)
     - o clear mata spawnCount(packBase) bichos pelo peso de spawn + 1 boss
     - XP/clear = spawns × exp media + exp do boss ×2.5; min/max trocam a media
       pelo bicho de menor/maior exp (as waves sorteiam a composicao)
     - HP/clear = spawns × HP medio + HP do boss ×3
     - gold/clear = moedas do loot (gold/platinum/crystal) pelas mortes do clear
   Hunt sem bossKey: o repo sempre usou o bicho de maior exp como boss. */
const HUNT_HP_MULT = 2, PHASE_BOSS_HP = 3, PHASE_BOSS_XP = 2.5;
const COINS = ['gold coin', 'platinum coin', 'crystal coin'];
function spawnCount(packBase) {
  let n = 0;
  for (let w = 1; w <= 9; w++) n += Math.min(9, packBase + Math.floor((w - 1) / 2));
  return n;
}
function huntBossKey(bh, table) {
  return bh.bossKey || bh.monsters.slice().sort((a, b) => (table[b].exp || 0) - (table[a].exp || 0))[0];
}
function buildHunt(bh, table, prices) {
  const packBase = bh.maxAlive || 4, N = spawnCount(packBase);
  const even = !(bh.weights && bh.weights.length === bh.monsters.length && new Set(bh.weights).size > 1);
  const ws = even ? bh.monsters.map(() => 1) : bh.weights;
  const tw = ws.reduce((s, x) => s + x, 0);
  const mon = k => ({ key: k, name: table[k].name, hp: table[k].hp * HUNT_HP_MULT, exp: table[k].exp || 0 });
  const monsters = bh.monsters.map(mon);
  const bk = huntBossKey(bh, table), boss = mon(bk);
  const avgExp = monsters.reduce((s, m, i) => s + m.exp * ws[i] / tw, 0);
  const avgHp = monsters.reduce((s, m, i) => s + m.hp * ws[i] / tw, 0);
  const bossXp = boss.exp * PHASE_BOSS_XP;
  const coins = k => (table[k].loot || []).filter(r => COINS.includes(r.name))
    .reduce((s, r) => s + r.chance / 1e5 * (r.max ? (1 + r.max) / 2 : 1) * (prices[r.name] || 0), 0);
  const gold = monsters.reduce((s, m, i) => s + N * ws[i] / tw * coins(m.key), 0) + coins(bk);
  const exps = monsters.map(m => m.exp);
  return {
    id: bh.id, name: bh.name, minLevel: bh.minLevel, packBase, monsters, boss,
    avgExp: Math.round(avgExp), avgHp: Math.round(avgHp),
    xpPerClear: Math.round(N * avgExp + bossXp), hpPerClear: Math.round(N * avgHp + boss.hp * PHASE_BOSS_HP),
    goldPerClear: Math.round(gold),
    xpMin: Math.round(N * Math.min(...exps) + bossXp), xpMax: Math.round(N * Math.max(...exps) + bossXp),
    ...(bh.avail === 'test' ? { avail: 'test' } : {}),
  };
}
/* o que mudou no JOGO entre a hunt gravada e a do bundle -- so os insumos das
   contas acima. Diferenca de arredondamento nao conta: se nada disso mudou, a
   hunt gravada fica como esta (o goldPerClear dela e' a prova independente que o
   check-loot.js usa, e recalcular de graca apagaria essa prova). */
function huntInputChanges(rec, bh, table) {
  const d = [];
  if (rec.minLevel !== bh.minLevel) d.push(`nivel ${rec.minLevel}->${bh.minLevel}`);
  if (rec.packBase !== (bh.maxAlive || 4)) d.push(`pack ${rec.packBase}->${bh.maxAlive}`);
  const keys = rec.monsters.map(m => m.key);
  for (const k of keys) if (!bh.monsters.includes(k)) d.push(`-${k}`);
  for (const k of bh.monsters) if (!keys.includes(k)) d.push(`+${k}`);
  for (const m of rec.monsters) {
    const t = table[m.key];
    if (!t || !bh.monsters.includes(m.key)) continue;
    if (m.hp !== t.hp * HUNT_HP_MULT) d.push(`${m.key} hp ${m.hp}->${t.hp * HUNT_HP_MULT}`);
    if (m.exp !== (t.exp || 0)) d.push(`${m.key} exp ${m.exp}->${t.exp || 0}`);
  }
  /* peso de spawn: entra em toda media do buildHunt. Gravado so existe quando o pack
     nao divide igual (o `spawn` de cada monstro), entao compara nessa mesma forma. */
  const uneven = bh.weights && bh.weights.length === bh.monsters.length && new Set(bh.weights).size > 1;
  const want = bh.monsters.map((k, i) => (uneven ? bh.weights[i] : null));
  const have = bh.monsters.map(k => { const m = rec.monsters.find(x => x.key === k); return m && m.spawn != null ? m.spawn : null; });
  if (JSON.stringify(want) !== JSON.stringify(have)) d.push(`spawn ${JSON.stringify(have)}->${JSON.stringify(want)}`);
  const bk = huntBossKey(bh, table);
  if (rec.boss && rec.boss.key && rec.boss.key !== bk) d.push(`boss ${rec.boss.key}->${bk}`);
  return d;
}

/* ---------------------------------------------------------------- charms */
function extractCharms(src) {
  const arr = arrayAround(src, 'key:"savage_blow"');
  return arr.map(c => {
    const row = { key: c.key, name: c.name, category: c.category, kind: c.kind };
    if (c.element) row.element = c.element;
    if (c.desc) row.desc = c.desc;        // texto oficial do efeito: a UI mostra em vez de parafrasear
    row.values = c.chance;                       // no bundle o campo se chama `chance`,
    // mas so nos elementais ele e' chance mesmo: em Savage Blow e' % de crit damage,
    // em Low Blow e' % de crit chance, em Scavenge e' % de gold. Aqui vira `values`.
    if (c.category === 'minor') row.echoes = c.points;   // Menores sao pagos em echoes
    else row.points = c.points;                          // Maiores, em Charm Points
    return row;
  }).sort((a, b) => (a.category === b.category ? 0 : a.category === 'major' ? -1 : 1)
    || a.key.localeCompare(b.key));
}

/* ---------------------------------------------------------------- bosses */
/* as salas de boss: cada entrada e' `{id,name,minLevel,bossKey,summons,rarity?,avail}`
   e mora num array que o bundle monta e depois estende com .push (os bosses novos
   entram assim). Em vez de caçar o nome do array, pega TODO objeto com essa forma.
   Tres grupos aparecem:
     - avail:"on", sem mapId  -> sala de boss (o que a aba mostra)
     - mapId:"worldboss"      -> boss cooperativo; o HP dele e' do servidor (escala
                                 por jogador), entao o repo guarda a mao e aqui nao toca
     - sem avail e sem mapId  -> listas que o cliente nunca exibe; ficam de fora */
/* id do boss -> key do monstro, pra TODO boss que o jogo mostra (salas + world
   bosses). O id nem sempre e' a key: "oberon" luta como grand_master_oberon. */
function extractBossKeys(src) {
  const re = /\{id:"[^"]+",name:"[^"]+",minLevel:\d+,bossKey:/g;
  const out = {};
  let m;
  while ((m = re.exec(src))) {
    const b = evalLiteral(matchBrackets(src, m.index, '{'));
    if ((b.avail === 'on' && !b.mapId) || b.mapId === 'worldboss') out[b.id] = b.bossKey;
  }
  return out;
}
function extractBossRooms(src) {
  const re = /\{id:"[^"]+",name:"[^"]+",minLevel:\d+,bossKey:/g;
  const out = {};
  let m;
  while ((m = re.exec(src))) {
    const b = evalLiteral(matchBrackets(src, m.index, '{'));
    if (b.avail === 'on' && !b.mapId) out[b.id] = b;
  }
  if (Object.keys(out).length < 80) throw new Error(
    `so ${Object.keys(out).length} salas de boss no bundle; esperado >80. A forma das entradas mudou.`);
  return out;
}

/* "de que elemento o boss bate", em % do dano que chega em voce. Calibrado contra
   os 101 bosses que o guia trazia (bate exato em 100, o outro erra por 1 ponto):
   melee (max) ×0.6, golpe com alvo ×1.1, golpe de area ×0.3 -- ambos no max × chance.
   O alvo pesa mais porque ele sempre te acha; a area depende de onde voce esta. */
function bossElements(m) {
  const w = {};
  const add = (el, v) => { if (v > 0) w[el] = (w[el] || 0) + v; };
  if (m.dmg) add('physical', m.dmg[1] * 0.6);
  for (const a of m.abilities || []) {
    if (!a.element || a.element === 'healing') continue;
    add(a.element, a.max * (a.chance == null ? 100 : a.chance) / 100 * (a.target ? 1.1 : 0.3));
  }
  const tot = Object.values(w).reduce((s, v) => s + v, 0);
  return Object.entries(w).sort((a, b) => b[1] - a[1])
    .map(([el, v]) => ({ el, pct: Math.round(v / tot * 100) }))
    .filter(e => e.pct > 0);
}

const ROOM_HP_MULT = 4.5, BOSS_XP_MULT = 2.5;   // data/xprates.json: roomBoss
function bossRecord(b, m) {
  const img = m.lookType
    ? { lookType: m.lookType, imgKind: 'outfit', img: `${SITE}/api/things/outfit/${m.lookType}.png?v=5` }
    : { lookType: 0, imgKind: 'object', img: `${SITE}/api/things/object/${m.lookTypeEx}.png?v=5` };
  return {
    id: b.id, name: b.name, rarity: b.rarity || 'normal', kind: 'room', minLevel: b.minLevel,
    base: m.hp, hpReal: m.hp * ROOM_HP_MULT, mult: ROOM_HP_MULT,
    hpPerPlayer: null, hpMin: null, hpMax: null,
    exp: m.exp, elements: bossElements(m), summons: b.summons || [],
    ...img, expReal: m.exp * BOSS_XP_MULT,
  };
}

/* ---------------------------------------------------------------- arvores */
/* SO CONFERE, nao escreve: data/trees.json tem forma propria (e o engine inteiro
   calibrado em cima dela), entao arvore que mudou no jogo e' decisao de gente, nao
   de script. Acha o array de cada vocacao pelo id de um no que o repo conhece e
   compara custo, ranks, tier, requisitos, special e atributos. O bundle usa um
   helper pra "absorb em todos os elementos" que o evalLiteral nao expande (vira {});
   esse caso nao conta como diferenca. */
function checkTrees(src) {
  const repo = readJSON(path.join(DATA, 'trees.json'));
  const out = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const [voc, nodes] of Object.entries(repo)) {
    let arr = null;
    for (const n of nodes) { try { arr = arrayAround(src, `id:"${n.id}"`); break; } catch (e) {} }
    if (!arr) { out.push(`${voc}: nenhum no do repo achado no bundle`); continue; }
    const byId = new Map(arr.filter(Boolean).map(n => [n.id, n]));
    for (const n of nodes) {
      const b = byId.get(n.id);
      if (!b) { out.push(`${voc}: ${n.id} saiu do jogo`); continue; }
      for (const k of ['cost', 'maxRank', 'tier']) if (b[k] !== n[k]) out.push(`${voc}: ${n.id} ${k} ${n[k]} -> ${b[k]}`);
      if (!same(b.requires || [], n.requires || [])) out.push(`${voc}: ${n.id} requisitos mudaram`);
      if (!same(b.special || null, n.special || null)) out.push(`${voc}: ${n.id} special ${JSON.stringify(n.special)} -> ${JSON.stringify(b.special)}`);
      const bp = Object.assign({}, b.per || {}), np = Object.assign({}, n.per || {});
      for (const k of Object.keys(bp)) if (bp[k] && typeof bp[k] === 'object' && !Object.keys(bp[k]).length) { delete bp[k]; delete np[k]; }
      if (!same(bp, np)) out.push(`${voc}: ${n.id} atributos ${JSON.stringify(np)} -> ${JSON.stringify(bp)}`);
    }
    for (const id of byId.keys()) if (!nodes.find(n => n.id === id)) out.push(`${voc}: no novo no jogo: ${id}`);
  }
  return out;
}

/* ------------------------------------------------------------------ saida */
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const changed = [];
function write(file, text) {
  const rel = path.relative(ROOT, file);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) { console.log(`  = ${rel}`); return; }
  changed.push(rel);
  if (DRY) { console.log(`  ~ ${rel} (dry-run, nao escrito)`); return; }
  fs.writeFileSync(file, text);
  console.log(`  + ${rel}`);
}

function main(src) {
  const table = mergedMonsterTable(src);
  const monsters = extractMonsters(table);
  const loot = extractLoot(table);
  const prices = extractPrices(src);
  const bundleHunts = extractHunts(src);
  const charms = extractCharms(src);

  const withResist = Object.values(monsters).filter(m => Object.keys(m.resist).length).length;
  console.log(`${Object.keys(monsters).length} monstros (${withResist} com resist, `
    + `${Object.keys(loot).length} com loot) · ${Object.keys(bundleHunts).length} hunts · `
    + `${charms.length} charms · ${Object.keys(prices).length} precos`);

  /* resist por key; boss de hunt as vezes vem sem key, so com o nome */
  const byLowerName = {};
  for (const [k, m] of Object.entries(monsters)) byLowerName[String(m.name).toLowerCase()] = k;
  const keyOf = ref => ref.key || byLowerName[String(ref.name || '').toLowerCase()] || null;

  /* AMEACA: quanto dano/s cada monstro cospe, por elemento. A conta e' do
     public/hunt-model.js (monsterThreat) -- aqui so grava o resultado, pra nao
     existir uma segunda versao da mesma formula no tools/. */
  require(path.join(PUB, 'hunt-model.js'));
  const HM = globalThis.HuntModel;
  if (!HM || !HM.monsterThreat) throw new Error('public/hunt-model.js nao exportou monsterThreat');
  const r1 = n => Math.round(n * 10) / 10;
  const threatOf = ref => {
    const k = keyOf(ref);
    if (!k || !monsters[k]) return null;
    const t = HM.monsterThreat(monsters[k]);
    const dps = {};
    for (const el of ELEMENTS) if (t.dps[el]) dps[el] = r1(t.dps[el]);
    return { threat: Object.keys(dps).length ? dps : null, heal: t.heal ? r1(t.heal) : 0 };
  };
  const stamp = (ref, onMissing) => {
    const k = keyOf(ref);
    if (k && monsters[k]) ref.resist = monsters[k].resist; else onMissing();
    const t = threatOf(ref);
    if (t && t.threat) ref.threat = t.threat; else delete ref.threat;
    if (t && t.heal) ref.heal = t.heal; else delete ref.heal;
  };

  /* HUNTS: as gravadas mantem a ordem do repo e as novas entram no fim, na ordem
     do bundle. Nova entra montada do zero; gravada so e' recalculada quando um
     insumo mudou no jogo (ver huntInputChanges). */
  const recorded = new Map(readJSON(path.join(DATA, 'hunts.json')).map(h => [h.id, h]));
  const order = [...recorded.keys()];
  const hunts = [];
  const bundleOrder = Object.values(bundleHunts)
    .sort((a, b) => ((order.indexOf(a.id) + 1) || 1e9) - ((order.indexOf(b.id) + 1) || 1e9));
  for (const bh of bundleOrder) {
    const rec = recorded.get(bh.id);
    const missing = [...bh.monsters, bh.bossKey].filter(k => k && !table[k]);
    if (missing.length) {
      /* key que sumiu do bestiary (renomeada, por exemplo): nao da pra montar nem
         comparar. Hunt ja gravada FICA como esta -- sumir do site e o log dizer
         "saiu do jogo" seria mentir duas vezes. Nova so entra quando o dado fechar. */
      console.log(`  ! hunt ${bh.id} com monstro fora do bestiary: ${missing.join(', ')}`
        + (rec ? ' -- mantida como estava' : ' -- nao entrou'));
      if (rec) { hunts.push(rec); recorded.delete(bh.id); }
      continue;
    }
    if (!rec) { hunts.push(buildHunt(bh, table, prices)); console.log(`  + hunt nova: ${bh.name} (nivel ${bh.minLevel})`); continue; }
    const d = huntInputChanges(rec, bh, table);
    if (d.length) console.log(`  ~ hunt ${bh.id}: ${d.join(', ')}`);
    /* so o nivel mudou: nenhuma conta depende dele, entao nada e' recalculado */
    if (d.length && d.every(x => x.startsWith('nivel '))) { rec.minLevel = bh.minLevel; hunts.push(rec); }
    else hunts.push(d.length ? buildHunt(bh, table, prices) : rec);
    /* avail:"test" nao tira a hunt do jogo (10 das que o site ja mostrava estao
       assim); so vai junto no dado, sem disparar recalculo */
    const h = hunts[hunts.length - 1];
    if (bh.avail === 'test') h.avail = 'test'; else delete h.avail;
    recorded.delete(bh.id);
  }
  for (const id of recorded.keys()) console.log(`  - hunt ${id} saiu do jogo`);

  let semResist = [], semThreat = [];
  for (const h of hunts) {
    const bh = bundleHunts[h.id];
    const weights = bh && bh.weights;
    h.monsters.forEach((m, i) => {
      stamp(m, () => semResist.push(`${h.id}/${m.key || m.name}`));
      if (!m.threat) semThreat.push(`${h.id}/${m.key || m.name}`);
      // so grava spawn quando a hunt NAO divide o pack igual entre os monstros
      if (weights && weights.length === h.monsters.length && new Set(weights).size > 1) m.spawn = weights[i];
      else delete m.spawn;
    });
    if (h.boss) {
      /* a key do boss vem do bundle (bossKey) quando existe; nas 18 hunts sem ela o
         jogo nao declara boss e o repo escolheu o bicho de maior exp -- ai a key sai
         do nome. Ela importa porque o charm se prende a CRIATURA: e' o que liga o
         boss da wave 10 ao mesmo bicho do pack em vez de virar uma criatura extra. */
      h.boss.key = (bh && bh.bossKey) || keyOf(h.boss);
      stamp(h.boss, () => semResist.push(`${h.id}/boss ${h.boss.name}`));
    }
  }
  if (semResist.length) console.log(`  ! sem resist: ${semResist.join(', ')}`);
  if (semThreat.length) console.log(`  ! sem dano (threat): ${semThreat.join(', ')}`);

  /* BOSSES: sala nova entra, sala que ja existe e' regravada do bundle (HP, XP,
     nivel, elementos). Os world bosses ficam como estao -- ver extractBossRooms. */
  const rooms = extractBossRooms(src);
  const bosses = readJSON(path.join(DATA, 'bosses.json'));
  const bossIdx = new Map(bosses.map((b, i) => [b.id, i]));
  const bossNew = [], bossMissing = [];
  for (const b of Object.values(rooms)) {
    const m = table[b.bossKey];
    if (!m) { bossMissing.push(b.id); continue; }
    const rec = bossRecord(b, m);
    if (bossIdx.has(b.id)) bosses[bossIdx.get(b.id)] = rec;
    else { bosses.push(rec); bossNew.push(b.name); }
  }
  bosses.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`${Object.keys(rooms).length} salas de boss`
    + (bossNew.length ? ` · novas: ${bossNew.join(', ')}` : ''));
  if (bossMissing.length) console.log(`  ! boss sem monstro no bundle: ${bossMissing.join(', ')}`);

  /* PAYLOAD DO LOOT: a aba Loot pergunta "que hunt me da o item X", entao o
     navegador so precisa dos bichos que APARECEM em hunt -- 239 dos 359. O
     data/loot.json fica com o bestiario inteiro (e a fonte, e nao e publicado);
     o public/loot.js leva a fatia que a tela usa, em arrays compactos, o que
     corta o arquivo de ~190KB pra ~100KB. O tools/check-loot.js confere que
     expandir os arrays devolve exatamente o data/loot.json. */
  const huntKeys = new Set();
  for (const h of hunts) {
    for (const mm of h.monsters) if (mm.key) huntKeys.add(mm.key);
    if (h.boss && h.boss.key) huntKeys.add(h.boss.key);
  }
  const semLoot = [...huntKeys].filter(k => !loot[k]);
  if (semLoot.length) console.log(`  ! criatura de hunt sem loot no bundle: ${semLoot.join(', ')}`);

  const lootPub = {};
  for (const k of [...huntKeys].sort()) {
    if (loot[k]) lootPub[k] = loot[k].map(r => (r.max ? [r.name, r.chance, r.max] : [r.name, r.chance]));
  }
  /* LOOT DOS BOSSES, por id do boss (o que a aba Bosses e a busca da aba Loot
     conhecem), lido pela key do monstro. Mesma forma compacta das criaturas. */
  const bossKeys = extractBossKeys(src);
  const bossLootPub = {}, bossSemLoot = [];
  for (const b of bosses) {
    const k = bossKeys[b.id] || b.id;
    if (loot[k]) bossLootPub[b.id] = loot[k].map(r => (r.max ? [r.name, r.chance, r.max] : [r.name, r.chance]));
    else bossSemLoot.push(b.id);
  }
  if (bossSemLoot.length) console.log(`  ! boss sem loot no bundle: ${bossSemLoot.join(', ')}`);

  /* RESIST DOS BOSSES: o card mostra "com que elemento bater". Vale pra todo boss,
     world boss incluso -- a resist vem do monstro que ele e' (bossKeys), nao do HP. */
  const bossSemResist = [];
  for (const b of bosses) {
    const m = monsters[bossKeys[b.id] || b.id];
    if (m) b.resist = m.resist; else bossSemResist.push(b.id);
  }
  if (bossSemResist.length) console.log(`  ! boss sem resist no bundle: ${bossSemResist.join(', ')}`);

  /* so os precos dos itens alcancaveis: os outros nunca cairiam na tela */
  const reachable = new Set();
  for (const rows of Object.values(lootPub)) for (const r of rows) reachable.add(r[0]);
  for (const rows of Object.values(bossLootPub)) for (const r of rows) reachable.add(r[0]);
  const pricePub = {};
  for (const n of [...reachable].sort()) if (prices[n] != null) pricePub[n] = prices[n];
  console.log(`  loot publicado: ${Object.keys(lootPub).length} criaturas + ${Object.keys(bossLootPub).length} bosses · `
    + `${reachable.size} itens (${Object.keys(pricePub).length} com preco)`);

  const treeDiff = checkTrees(src);
  if (treeDiff.length) {
    console.log(`  ! ARVORE MUDOU NO JOGO (${treeDiff.length}) -- data/trees.json NAO e' reescrito; ver o skill updating-game-data:`);
    for (const d of treeDiff.slice(0, 20)) console.log(`      ${d}`);
  } else console.log('arvores de talento: iguais ao bundle');

  console.log('arquivos:');
  write(path.join(DATA, 'bosses.json'), JSON.stringify(bosses, null, 2) + '\n');
  write(path.join(PUB, 'bosses.js'),
    '// GERADO de data/bosses.json (tools/extract-game-data.js; XP real = base x2.5). Nao editar a mao.\n'
    + 'window.BOSSES = ' + JSON.stringify(bosses) + ';\n');
  write(path.join(DATA, 'monsters.json'), JSON.stringify(monsters, null, 1) + '\n');
  write(path.join(DATA, 'charms.json'), JSON.stringify(charms, null, 1) + '\n');
  write(path.join(DATA, 'loot.json'), JSON.stringify(loot, null, 1) + '\n');
  write(path.join(DATA, 'prices.json'), JSON.stringify(prices, null, 1) + '\n');
  write(path.join(DATA, 'hunts.json'), JSON.stringify(hunts, null, 2) + '\n');
  write(path.join(PUB, 'hunts.js'),
    '// GERADO do bundle do JOGO. HP dos monstros ×2; XP/clear medio + xpMin/xpMax (waves aleatorias). Nao editar a mao.\n'
    + 'window.HUNTS = ' + JSON.stringify(hunts) + ';\n');
  /* os dois arquivos que NAO saem do bundle (trees.json e xprates.json sao editados a
     mao -- ver o skill updating-game-data) ainda tem o .js regenerado aqui, no formato
     exato de sempre: editou o JSON, roda o extrator e o public/ acompanha. */
  write(path.join(PUB, 'trees.js'),
    '// GERADO de trees.json — fonte unica dos dados das arvores. Nao editar a mao; rode o re-sync.\n'
    + 'window.TREES = ' + JSON.stringify(readJSON(path.join(DATA, 'trees.json')), null, 1) + ';\n');
  write(path.join(PUB, 'xprates.js'),
    '// GERADO de data/xprates.json (valores vivos do servidor). Nao editar a mao.\n'
    + 'window.XPRATES = ' + JSON.stringify(readJSON(path.join(DATA, 'xprates.json'))) + ';\n');
  write(path.join(PUB, 'charms.js'),
    '// GERADO do bundle do JOGO (tools/extract-game-data.js). Nao editar a mao.\n'
    + 'window.CHARMS = ' + JSON.stringify(charms) + ';\n');
  write(path.join(PUB, 'loot.js'),
    '// GERADO do bundle do JOGO (tools/extract-game-data.js). Nao editar a mao.\n'
    + '// m: criatura -> [[item, chance, max?], ...]   chance e por 100.000 (750 = 0,75%);\n'
    + '//                                              max marca stackavel: rola 1..max.\n'
    + '// b: boss (id da aba Bosses) -> [[item, chance, max?], ...], mesma escala.\n'
    + '// p: item -> gold de venda. So as criaturas de hunt e os bosses entram aqui;\n'
    + '//    o bestiario inteiro esta em data/loot.json.\n'
    + 'window.LOOT = ' + JSON.stringify({ m: lootPub, b: bossLootPub, p: pricePub }) + ';\n');

  console.log(changed.length ? `\n${changed.length} arquivo(s) mudaram` : '\nnada mudou');
}

loadSource().then(main).catch(e => { console.error('ERRO: ' + e.message); process.exit(1); });
