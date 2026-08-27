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
     data/hunts.json      injeta `resist` (e `spawn`, quando a hunt nao divide o
                          pack igual) nos monstros que ja estao la -- HP, XP e
                          gold gravados NAO sao tocados
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
  console.log(`tabela de monstros: base=${baseVar} porNome=${byNameVar} porKey=${byKeyVar}`);

  const base = objectNamed(src, baseVar);
  const byName = objectNamed(src, byNameVar);
  const byKey = objectNamed(src, byKeyVar);

  const out = {};
  for (const [key, b] of Object.entries(base)) {
    out[key] = Object.assign({}, b, byName[String(b.name || '').toLowerCase()] || {}, byKey[key] || {});
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

  const hunts = readJSON(path.join(DATA, 'hunts.json'));
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
  /* so os precos dos itens alcancaveis: os outros 500 nunca cairiam na tela */
  const reachable = new Set();
  for (const rows of Object.values(lootPub)) for (const r of rows) reachable.add(r[0]);
  const pricePub = {};
  for (const n of [...reachable].sort()) if (prices[n] != null) pricePub[n] = prices[n];
  console.log(`  loot publicado: ${Object.keys(lootPub).length} criaturas · ${reachable.size} itens `
    + `(${Object.keys(pricePub).length} com preco)`);

  console.log('arquivos:');
  write(path.join(DATA, 'monsters.json'), JSON.stringify(monsters, null, 1) + '\n');
  write(path.join(DATA, 'charms.json'), JSON.stringify(charms, null, 1) + '\n');
  write(path.join(DATA, 'loot.json'), JSON.stringify(loot, null, 1) + '\n');
  write(path.join(DATA, 'prices.json'), JSON.stringify(prices, null, 1) + '\n');
  write(path.join(DATA, 'hunts.json'), JSON.stringify(hunts, null, 2) + '\n');
  write(path.join(PUB, 'hunts.js'),
    '// GERADO do bundle do JOGO. HP dos monstros ×2; XP/clear medio + xpMin/xpMax (waves aleatorias). Nao editar a mao.\n'
    + 'window.HUNTS = ' + JSON.stringify(hunts) + ';\n');
  write(path.join(PUB, 'charms.js'),
    '// GERADO do bundle do JOGO (tools/extract-game-data.js). Nao editar a mao.\n'
    + 'window.CHARMS = ' + JSON.stringify(charms) + ';\n');
  write(path.join(PUB, 'loot.js'),
    '// GERADO do bundle do JOGO (tools/extract-game-data.js). Nao editar a mao.\n'
    + '// m: criatura -> [[item, chance, max?], ...]   chance e por 100.000 (750 = 0,75%);\n'
    + '//                                              max marca stackavel: rola 1..max.\n'
    + '// p: item -> gold de venda. So as criaturas que aparecem em hunt entram aqui;\n'
    + '//    o bestiario inteiro esta em data/loot.json.\n'
    + 'window.LOOT = ' + JSON.stringify({ m: lootPub, p: pricePub }) + ';\n');

  console.log(changed.length ? `\n${changed.length} arquivo(s) mudaram` : '\nnada mudou');
}

loadSource().then(main).catch(e => { console.error('ERRO: ' + e.message); process.exit(1); });
