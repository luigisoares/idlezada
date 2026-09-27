/* ============================================================================
   check-loot.js — verificacao do modelo de LOOT (public/hunt-model.js) e do que
   o extrator escreveu em data/loot.json + data/prices.json + public/loot.js.

       node tools/check-loot.js        (sai != 0 se algo falhar)

   O BLOCO QUE IMPORTA E' O 3. Toda a aba Loot se apoia em tres suposicoes sobre
   o bundle que nao dao pra conferir no cliente -- o combate roda no servidor:

     (a) `chance` e' por 100.000, e nao por 1.000 ou por 10.000;
     (b) `max` e' quantidade uniforme de 1 a max, e nao quantidade fixa;
     (c) um clear mata spawnCount(packBase) bichos pelo peso de spawn, + 1 boss.

   As tres caem juntas num unico teste: o repo JA TINHA o `goldPerClear` de cada
   hunt, gravado a partir do jogo por outra via, muito antes de existir tabela de
   loot aqui. Somando as moedas do loot com (a)+(b)+(c) o resultado tem que dar
   exatamente esse numero -- e da, nas 79 hunts. Errar qualquer uma das tres
   estoura o bloco 3 na hora. E' o teste mais barato e mais forte que esse dado
   permite, e e' por isso que ele existe.

   A TELA tem verificacao propria: tools/check-loot-view.js.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public'), DATA = path.join(ROOT, 'data');

const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
for (const f of ['hunts.js', 'loot.js', 'bosses.js', 'hunt-model.js']) {
  vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sandbox, { filename: f });
}
const M = sandbox.window.HuntModel;
const HUNTS = sandbox.window.HUNTS;
const LOOT = sandbox.window.LOOT;

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-9 : eps);

/* fixtures sinteticas, pra a conta de mortes nao depender do dado real */
const mon = (key, hp, spawn) => {
  const m = { key, name: key, hp, exp: 10, resist: {} };
  if (spawn != null) m.spawn = spawn;
  return m;
};
const hunt = (monsters, boss) => ({ id: 'x', name: 'X', packBase: 4, monsters, boss: boss || null });

/* ------------------------------------------------------- 1. MORTES POR CLEAR */
console.log('== mortes: o clear inteiro sao os spawns das waves 1-9 + 1 boss ==');
{
  const h = hunt([mon('a', 100), mon('b', 100)], mon('b', 100));
  const k = M.killsPerClear(h);
  const total = k.reduce((s, x) => s + x.kills, 0);
  ok(near(total, M.spawnCount(4) + 1), `deviam ser ${M.spawnCount(4) + 1} mortes, deu ${total}`);
  ok(M.spawnCount(4) === 52, `pack base 4 spawna 52 nas waves 1-9, deu ${M.spawnCount(4)}`);
  ok(k.length === 2, 'o boss e um bicho do pack: nao vira uma terceira criatura');
  const b = k.find(x => x.key === 'b');
  ok(near(b.kills, 26 + 1), `o bicho que faz de boss morre 26 vezes no pack + 1 na wave 10, deu ${b.kills}`);
}

console.log('== mortes: o peso de spawn reparte o pack (e nao o HP) ==');
{
  /* Giant Spider e' o caso real: 55/30/15 no bundle */
  const h = hunt([mon('a', 100, 55), mon('b', 9999, 30), mon('c', 100, 15)]);
  const k = M.killsPerClear(h);
  const by = Object.fromEntries(k.map(x => [x.key, x.kills]));
  ok(near(by.a, 52 * 0.55), `a devia ter 55% dos 52 spawns, deu ${by.a}`);
  ok(near(by.b, 52 * 0.30), 'b devia ter 30% -- o HP de 9999 nao pode inflar a contagem de MORTES');
  ok(near(by.c, 52 * 0.15), `c devia ter 15%, deu ${by.c}`);
}

console.log('== mortes: sem peso declarado o pack divide igual ==');
{
  const k = M.killsPerClear(hunt([mon('a', 1), mon('b', 1), mon('c', 1), mon('d', 1)]));
  ok(k.every(x => near(x.kills, 13)), 'quatro bichos sem `spawn` deviam ficar com 13 cada');
}

console.log('== mortes: packBase maior bate no teto de 9 por wave ==');
{
  const h = Object.assign(hunt([mon('a', 1)]), { packBase: 9 });
  ok(M.spawnCount(9) === 81, `packBase 9 nas 9 waves e 81 (teto), deu ${M.spawnCount(9)}`);
  ok(near(M.killsPerClear(h)[0].kills, 81), 'a hunt de um bicho so fica com todos os spawns');
}

/* ------------------------------------------------------------ 2. POR MORTE */
console.log('== por morte: chance e por 100.000, max e quantidade uniforme 1..max ==');
{
  ok(near(M.lootPerKill({ chance: 100000 }), 1), 'chance 100.000 e sempre: 1 por morte');
  ok(near(M.lootPerKill({ chance: 750 }), 0.0075), 'chance 750 e 0,75%');
  ok(near(M.lootPerKill({ chance: 100000, max: 3 }), 2), 'max 3 rola 1..3: media 2');
  ok(near(M.lootPerKill({ chance: 50000, max: 11 }), 3), 'metade das vezes, media 6: da 3');
  ok(near(M.lootPerKill({ chance: 0 }), 0), 'chance 0 nao cai');
}

/* ----------------------------------------------- 3. A PROVA CONTRA O REPO */
console.log(`== gold: as moedas do loot reproduzem o goldPerClear das ${HUNTS.length} hunts ==`);
{
  /* O `goldPerClear` de data/hunts.json foi gravado do jogo antes de existir
     tabela de loot no repo. Se a escala da chance, a media do max ou a contagem
     de mortes estiverem erradas, este bloco cai. */
  const COINS = ['gold coin', 'platinum coin', 'crystal coin'];
  let checked = 0, worst = 0, worstHunt = null;
  for (const h of HUNTS) {
    if (!h.goldPerClear) continue;
    let gold = 0;
    for (const k of M.killsPerClear(h)) {
      const rows = (LOOT.m || {})[k.key];
      if (!rows) continue;
      for (const r of rows) {
        const name = r[0];
        if (!COINS.includes(name)) continue;
        gold += k.kills * M.lootPerKill({ chance: r[1], max: r[2] || 0 }) * LOOT.p[name];
      }
    }
    checked++;
    /* o gravado e inteiro (arredondado), entao a folga e de 1 gold */
    const off = Math.abs(gold - h.goldPerClear);
    if (off > worst) { worst = off; worstHunt = `${h.name}: calc ${gold.toFixed(2)} vs gravado ${h.goldPerClear}`; }
  }
  /* 79 com o gold gravado do jogo (a prova de verdade) + as 8 da atualizacao de
     set/2026, que o extrator ja montou por esta mesma conta (nelas e' coerencia) */
  /* toda hunt tem goldPerClear: as gravadas vieram do jogo (a prova de verdade), as
     montadas pelo extrator sairam desta mesma conta (nelas e' coerencia). Contagem
     tirada do dado, nao escrita a mao: hunt nova nao pode quebrar este teste. */
  ok(checked === HUNTS.length, `todas as ${HUNTS.length} hunts deviam ter goldPerClear, foram ${checked}`);
  ok(worst <= 1, `o pior erro devia ser <= 1 gold (arredondamento), deu ${worst.toFixed(2)} em ${worstHunt}`);
}

/* --------------------------------------------------------- 4. LOOT DA HUNT */
console.log('== huntLoot: o inverso lista o que a hunt rende, com fonte e gold ==');
{
  const h = HUNTS.find(x => x.id === 'hydra-cave') || HUNTS.find(x => /hydra/i.test(x.name));
  ok(!!h, 'a hunt da Hydra devia existir no dado');
  const r = M.huntLoot(h, LOOT);
  ok(r.items.length > 5, `a Hydra devia render vários itens, veio ${r.items.length}`);
  ok(r.gold > 0, 'o gold do clear devia ser positivo');
  ok(r.items.every(it => it.from.length > 0), 'todo item tem que dizer de qual criatura vem');
  ok(r.items.every(it => it.perClear > 0), 'nenhum item pode entrar com 0 por clear');
  ok(r.items.every(it => it.from.every(f => f.chance > 0)), 'toda fonte tem chance > 0');
  const ssa = r.items.find(it => it.name === 'stone skin amulet');
  ok(!!ssa && near(ssa.perClear, 27 * 0.0075, 1e-6),
    `Hydra: 27 mortes x 0,75% = 0,2025 amuleto/clear, deu ${ssa && ssa.perClear}`);
  ok(ssa && ssa.price === 500, 'e o preco de venda dele e 500g');
  /* ordenado por gold: a primeira linha e a que mais paga */
  for (let i = 1; i < r.items.length; i++) ok(r.items[i - 1].gold >= r.items[i].gold, 'itens fora de ordem de gold');
}

console.log('== huntLoot: criatura sem tabela de loot e RELATADA, nao ignorada ==');
{
  /* minion_of_versperoth e bloodjaw nao tem loot no bundle: a tela precisa saber
     pra poder dizer "esta hunt tem um bicho fora da conta". */
  const semLoot = HUNTS.filter(h => M.huntLoot(h, LOOT).missing.length);
  ok(semLoot.length > 0, 'alguma hunt devia relatar criatura sem loot');
  const all = new Set(semLoot.flatMap(h => M.huntLoot(h, LOOT).missing.map(String)));
  ok(all.size <= 3, `poucas criaturas sem loot esperadas, vieram ${[...all].join(', ')}`);
}

/* -------------------------------------------------------- 5. BUSCA DE ITEM */
console.log('== lootSources: o ranking de hunts de um item ==');
{
  const r = M.lootSources('stone skin amulet', HUNTS, LOOT);
  ok(r.length === 19, `19 hunts dropam stone skin amulet, veio ${r.length}`);
  ok(r.every(x => x.perClear > 0 && x.from.length), 'toda hunt do ranking tem quantidade e fonte');
  ok(r.every(x => x.perMhp > 0), 'e o rendimento por HP moido');
  for (let i = 1; i < r.length; i++) ok(r[i - 1].perClear >= r[i].perClear, 'ranking fora de ordem');
  /* por HP moido, o Gazer ganha: Burster Spectre solta 8,86%, a maior do jogo */
  const byHp = r.slice().sort((a, b) => b.perMhp - a.perMhp);
  ok(/gazer/i.test(byHp[0].name), `por HP moido o Gazer devia liderar, veio ${byHp[0].name}`);
  ok(byHp[0].from[0].chance === 8860, `a fonte devia ser a de 8,86%, veio ${byHp[0].from[0].chance}`);

  ok(M.lootSources('item que nao existe', HUNTS, LOOT).length === 0, 'item inexistente devia dar lista vazia');
  ok(M.lootSources('', HUNTS, LOOT).length === 0, 'busca vazia devia dar lista vazia');
  ok(M.lootSources('STONE SKIN AMULET', HUNTS, LOOT).length === 19, 'a busca ignora caixa');
}

console.log('== lootBasket: uma lista de itens contra as hunts ==');
{
  const lista = ['stone skin amulet', 'boots of haste', 'royal helmet'];
  const r = M.lootBasket(lista, HUNTS, LOOT);
  ok(r.length > 0, 'alguma hunt devia cobrir parte da lista');
  ok(r.every(x => x.covered >= 1 && x.covered <= lista.length), 'cobertura fora do intervalo da lista');
  ok(r.every(x => x.wanted === lista.length), 'toda linha devia saber o tamanho da lista');
  ok(r.every(x => x.hits.length === x.covered), '`hits` tem que ter exatamente os itens cobertos');
  ok(r.every(x => x.hits.every(h => h.perClear > 0 && h.from.length)), 'todo acerto traz quantidade e fonte');
  /* ordenado por cobertura, desempatando por gold */
  for (let i = 1; i < r.length; i++) {
    ok(r[i-1].covered > r[i].covered || (r[i-1].covered === r[i].covered && r[i-1].gold >= r[i].gold),
      'lootBasket fora de ordem (cobertura, depois gold)');
  }

  /* COERENCIA COM lootSources: a quantidade de um item numa hunt tem que ser a
     mesma, seja perguntada item a item ou pela lista inteira. */
  let divergiu = null;
  for (const row of r) {
    for (const h of row.hits) {
      const solo = M.lootSources(h.name, HUNTS, LOOT).find(x => x.id === row.id);
      if (!solo || !near(solo.perClear, h.perClear, 1e-9)) divergiu = `${row.name}/${h.name}`;
    }
  }
  ok(!divergiu, `lootBasket e lootSources discordaram em ${divergiu}`);

  /* a hunt que mais cobre a lista tem que cobrir pelo menos tanto quanto
     qualquer hunt que apareca no ranking individual de um item so */
  const um = M.lootBasket(['stone skin amulet'], HUNTS, LOOT);
  ok(um.length === 19, `lista de um item devia dar as mesmas 19 hunts, deu ${um.length}`);
  ok(um.every(x => x.covered === 1 && x.wanted === 1), 'com um item so, cobertura e sempre 1 de 1');

  ok(M.lootBasket([], HUNTS, LOOT).length === 0, 'lista vazia devia dar resultado vazio');
  ok(M.lootBasket(['nao existe'], HUNTS, LOOT).length === 0, 'item inexistente nao gera linha');
  ok(M.lootBasket(['STONE SKIN AMULET'], HUNTS, LOOT).length === 19, 'a lista ignora caixa');
  /* item repetido na lista nao pode contar duas vezes */
  const dup = M.lootBasket(['stone skin amulet', 'Stone Skin Amulet'], HUNTS, LOOT);
  ok(dup.every(x => x.covered === 1 && x.wanted === 1), 'item repetido na lista conta uma vez so');

  /* o gold da fatia e a soma dos acertos, e nada mais */
  ok(r.every(x => near(x.gold, x.hits.reduce((s, h) => s + h.gold, 0), 1e-6)),
    'o valor da fatia tem que ser a soma dos itens cobertos');
}

console.log('== lootItems: o universo buscavel ==');
{
  const items = M.lootItems(HUNTS, LOOT);
  /* o esperado sai direto do LOOT.m das criaturas de hunt, sem passar pela funcao
     testada -- e sem numero escrito a mao, que quebrava a cada atualizacao do jogo */
  const want = new Set();
  for (const h of HUNTS) for (const k of M.killsPerClear(h)) for (const r of (LOOT.m[k.key] || [])) want.add(r[0]);
  ok(items.length === want.size, `${want.size} itens alcancaveis pelas hunts, veio ${items.length}`);
  ok(items.every(it => it.hunts > 0), 'todo item da busca cai em pelo menos uma hunt');
  ok(items.every(it => it.price != null), `todos os ${items.length} tem preco (a cascata do extrator cobre 100%)`);
  const sorted = items.slice().sort((a, b) => a.name.localeCompare(b.name));
  ok(JSON.stringify(items.map(i => i.name)) === JSON.stringify(sorted.map(i => i.name)),
    'a lista vem em ordem alfabetica, que e como a busca mostra');
}

/* ---------------------------------------------------------------- 6. DADOS */
console.log('== dados: o public/loot.js e uma fatia fiel do data/loot.json ==');
{
  const dl = JSON.parse(fs.readFileSync(path.join(DATA, 'loot.json'), 'utf8'));
  const dp = JSON.parse(fs.readFileSync(path.join(DATA, 'prices.json'), 'utf8'));

  /* expandir os arrays compactos tem que devolver o objeto original */
  let mismatch = null;
  for (const [key, rows] of Object.entries(LOOT.m)) {
    const expanded = rows.map(r => (r[2] ? { name: r[0], chance: r[1], max: r[2] } : { name: r[0], chance: r[1] }));
    if (JSON.stringify(expanded) !== JSON.stringify(dl[key])) { mismatch = key; break; }
  }
  ok(!mismatch, `public/loot.js divergiu de data/loot.json em "${mismatch}"`);
  ok(Object.entries(LOOT.p).every(([n, g]) => dp[n] === g), 'public/loot.js tem preco que data/prices.json nao confirma');

  /* a fatia publicada e exatamente "criatura que aparece em hunt" */
  const inHunts = new Set();
  for (const h of HUNTS) {
    for (const m of h.monsters) if (m.key) inHunts.add(m.key);
    if (h.boss && h.boss.key) inHunts.add(h.boss.key);
  }
  const published = new Set(Object.keys(LOOT.m));
  const extra = [...published].filter(k => !inHunts.has(k));
  const faltando = [...inHunts].filter(k => !published.has(k) && dl[k]);
  ok(!extra.length, `public/loot.js leva criatura que nao aparece em hunt: ${extra.join(', ')}`);
  ok(!faltando.length, `criatura de hunt COM loot ficou fora do public/loot.js: ${faltando.join(', ')}`);

  /* nenhum preco carregado a mais: payload e' pra ser so o alcancavel -- o que
     cai em hunt OU de boss (LOOT.b, a aba Bosses e a busca da aba Loot usam) */
  const reachable = new Set([...Object.values(LOOT.m), ...Object.values(LOOT.b || {})].flatMap(rows => rows.map(r => r[0])));
  const sobrando = Object.keys(LOOT.p).filter(n => !reachable.has(n));
  ok(!sobrando.length, `public/loot.js carrega ${sobrando.length} precos de item que nenhuma hunt nem boss solta`);
}

console.log('== dados: as linhas de loot sao sas ==');
{
  let bad = null, empty = null;
  for (const [key, rows] of Object.entries(LOOT.m)) {
    if (!rows.length) { empty = key; break; }
    /* max:1 existe no bundle (307 linhas) e e' um no-op: (1+1)/2 = 1. Fica como
       veio, porque data/loot.json e' espelho do bundle, nao uma versao arrumada. */
    const b = rows.find(r => !r[0] || !(r[1] > 0) || r[1] > 100000 || (r[2] != null && !(r[2] >= 1)));
    if (b) { bad = `${key}: ${JSON.stringify(b)}`; break; }
  }
  ok(!empty, `${empty} entrou com tabela vazia`);
  ok(!bad, `linha de loot invalida em ${bad}`);
}

console.log('== dados: item repetido na mesma criatura e stack de moeda, e SOMA ==');
{
  /* O teto de stack e 100: um bicho que solta 297 gold vem em 3 linhas. Nao e'
     dado sujo -- sao rolagens independentes, e somar e' o que faz o bloco 3
     fechar. Este teste existe pra ninguem "consertar" isso com um dedupe. */
  const dups = [], estranho = [];
  for (const [key, rows] of Object.entries(LOOT.m)) {
    const byName = new Map();
    for (const r of rows) { if (!byName.has(r[0])) byName.set(r[0], []); byName.get(r[0]).push(r); }
    for (const [name, group] of byName) {
      if (group.length < 2) continue;
      dups.push(`${key}/${name}`);
      /* Duas formas legitimas de repetir, e nenhuma outra:
           moeda  -> stack com teto (as linhas diferem no `max`);
           o resto -> rolagens independentes do MESMO item (linhas identicas).
         O caso real do segundo tipo e a Blightwalker, que pode soltar duas
         giant shimmering pearl a 4,45% cada. */
      const isCoin = /(gold|platinum|crystal) coin/.test(name);
      const iguais = group.every(r => r[1] === group[0][1] && (r[2] || 0) === (group[0][2] || 0));
      if (!isCoin && !iguais) estranho.push(`${key}/${name}: ${JSON.stringify(group)}`);
    }
  }
  ok(dups.length > 0, 'o bundle tem item repetido por criatura; se isso zerou, o extrator deduplicou por engano');
  ok(!estranho.length, `repeticao que nao e stack de moeda nem rolagem identica: ${estranho.slice(0, 3).join(' | ')}`);

  /* e a tela recebe UMA fonte por criatura, com o total somado */
  const spectre = HUNTS.find(h => M.huntLoot(h, LOOT).items.some(it => it.from.some(f => f.rows > 1)));
  ok(!!spectre, 'alguma hunt devia ter fonte com mais de uma linha (rows > 1)');
  if (spectre) {
    const it = M.huntLoot(spectre, LOOT).items.find(x => x.from.some(f => f.rows > 1));
    const f = it.from.find(x => x.rows > 1);
    ok(f.perKill > M.lootPerKill({ chance: f.chance, max: f.max }) * 0.999,
      'a fonte agrupada tem que somar as linhas, nao pegar a maior');
    ok(it.from.length === new Set(it.from.map(x => x.key)).size,
      'a mesma criatura nao pode aparecer duas vezes na lista de fontes');
  }
}

/* ------------------------------------------------------------------- resultado */
console.log('== loot de boss: por morte, na mesma escala das hunts ==');
{
  const BOSSES = sandbox.window.BOSSES;
  const semLoot = BOSSES.filter(b => !(LOOT.b || {})[b.id]);
  ok(!semLoot.length, `todo boss da aba devia ter tabela de loot (faltam ${semLoot.map(b => b.id).join(', ')})`);

  /* Phosphorus, conta na mao: crystal 100% × media(1..60)=30,5 × 10.000
     + figurine 2% × 5,7M + 5 armas de 1% × 126k + sigil 5% × 1.500 */
  const ph = M.bossLoot('phosphorus', LOOT);
  const want = 1 * 30.5 * 10000 + 0.02 * 5700000 + 5 * 0.01 * 126000 + 0.05 * 1500;
  ok(near(ph.gold, want, 1e-6), `Phosphorus devia render ${want} gold por morte, deu ${ph.gold}`);
  ok(ph.items[0].name === 'crystal coin', 'o que mais vale por morte vem primeiro');
  ok(ph.items.every(it => it.price != null), 'todo item de boss tem preco (a cascata cobre)');

  /* o id da aba nem sempre e' a key do monstro: oberon luta como grand_master_oberon */
  ok(M.bossLoot('oberon', LOOT).items.length > 0, 'Oberon devia achar o loot pela key do monstro');

  const src = M.bossSources('moonsilver bow', BOSSES, LOOT);
  ok(src.length === 1 && src[0].id === 'phosphorus' && src[0].chance === 1000,
    `moonsilver bow so cai do Phosphorus, a 1% (veio ${JSON.stringify(src.map(x => [x.id, x.chance]))})`);

  const soHunt = M.lootItems(HUNTS, LOOT).length;
  const comBoss = M.lootItems(HUNTS, LOOT, { bosses: true });
  const soM = new Set();
  for (const h of HUNTS) for (const k of M.killsPerClear(h)) for (const r of (LOOT.m[k.key] || [])) soM.add(r[0]);
  ok(soHunt === soM.size, `sem a opcao, o catalogo continua so de hunts (${soM.size}), veio ${soHunt}`);
  ok(comBoss.length > soHunt && comBoss.some(it => it.name === 'moonsilver bow' && it.bosses === 1 && it.hunts === 0),
    'com bosses, o item que so cai de boss entra no catalogo, marcado como tal');
}

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
