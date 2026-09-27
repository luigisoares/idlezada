/* ============================================================================
   check-hunt-model.js — verificacao do modelo da aba Hunts (public/hunt-model.js).

       node tools/check-hunt-model.js        (sai != 0 se algo falhar)

   Sem dependencia: carrega os arquivos de public/ num shim de `window`, igual ao
   navegador. Cinco blocos:

     1. ELEMENTO  — resist -> multiplicador, e o ranking por hunt.
     2. CHARMS    — quanto cada charm rende pro personagem que esta selecionado.
     3. AMEACA    — de que elemento a hunt te castiga (dmg + abilities do bundle).
     4. PLANO     — a atribuicao: um charm por criatura, cada charm uma vez so.
     5. DADOS     — o que o extrator escreveu bate com o bundle do jogo.

   A TELA tem verificacao propria: tools/check-hunts-view.js.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const PUB = path.join(__dirname, '..', 'public');
const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
for (const f of ['hunt-model.js']) {
  vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sandbox, { filename: f });
}
const M = sandbox.window.HuntModel;

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-9 : eps);

/* fixtures: hunts sinteticas, pra o teste nao depender do dado real */
const mon = (key, hp, exp, resist) => ({ key, name: key, hp, exp, resist: resist || {} });
const hunt = (monsters, boss) => ({ id: 'x', name: 'X', monsters, boss: boss || null });

/* ------------------------------------------------------------------ 1. ELEMENTO */
console.log('== elemento: resist vira multiplicador de dano ==');
{
  ok(near(M.elementMult({ earth: 15 }, 'earth', 0), 0.85), 'resist +15 devia dar 0.85x');
  ok(near(M.elementMult({ fire: -5 }, 'fire', 0), 1.05), 'resist -5 devia dar 1.05x (apanha mais)');
  ok(near(M.elementMult({ earth: 15 }, 'ice', 0), 1.0), 'elemento ausente do resist devia dar 1x');
  ok(near(M.elementMult({ earth: 100 }, 'earth', 0), 0), 'resist 100 e imunidade: 0x');
}

console.log('== elemento: element_pierce corta so a resistencia positiva ==');
{
  ok(near(M.elementMult({ earth: 20 }, 'earth', 50), 0.90), 'pierce 50 em resist +20 devia dar 0.90x');
  ok(near(M.elementMult({ fire: -20 }, 'fire', 50), 1.20), 'pierce nao pode encolher a FRAQUEZA do monstro');
}

console.log('== elemento: o ranking da hunt pesa por HP e conta o boss com HP x3 ==');
{
  // 52 spawns divididos entre os monstros da lista + 1 boss com HP x3 (waves 1-9 e 10)
  const h = hunt([mon('a', 100, 10, { fire: -50 }), mon('b', 100, 10, {})]);
  const r = M.huntElements(h, {});
  ok(r[0].el === 'fire', 'metade do pack fraca a fogo devia por fogo em primeiro');
  // tempo de clear: 52/2 monstros a 100hp com 1.5x + 52/2 a 100hp com 1x
  const total = 5200, spent = 2600 / 1.5 + 2600 / 1;
  ok(near(r[0].mult, total / spent, 1e-6), 'mult da hunt devia ser a media harmonica ponderada por HP');

  // o boss tem HP x3: um boss resistente puxa o ranking pra baixo
  const weak = hunt([mon('a', 100, 10, { fire: -50 })], mon('a', 100, 10, { fire: -50 }));
  const tough = hunt([mon('a', 100, 10, { fire: -50 })], mon('c', 100, 10, { fire: 50 }));
  const rw = M.huntElements(weak, {}).find(x => x.el === 'fire');
  const rt = M.huntElements(tough, {}).find(x => x.el === 'fire');
  ok(rt.mult < rw.mult, 'boss resistente devia baixar o multiplicador da hunt');
}

console.log('== elemento: o boss entra no charm com o HP DE LUTA, nao com o base ==');
{
  // o charm elemental proca min(2x level, 5% do HP do alvo). Na wave 10 o alvo tem
  // HP x3, entao o teto de 5% e' 3x maior -- usar o HP base subestima o proc.
  // level 500: 5% do HP base (10000) = 500, abaixo do teto de 2x level; ja 5% do HP
  // de luta (30000) = 1500, acima. Os dois valores sao distinguiveis de proposito.
  const h = hunt([mon('a', 100, 10, {})], mon('b', 10000, 900, {}));
  const boss = M.packWeights(h).find(x => x.boss);
  ok(boss.hpFight === 30000, `boss devia lutar com 10000x3 = 30000 de HP, veio ${boss.hpFight}`);
  ok(boss.hp === 10000, 'o HP base continua exposto pra tabela mostrar o valor do bestiary');
  const c = { key:'freeze', name:'Freeze', category:'major', element:'ice', values:[5,10,11], points:[320,480,1600] };
  const at = t => M.charmRanking(t, { level:500, cc:30, cd:150, up:0, pierce:0, dps:100000, aps:1 }, [c])[0].gain;
  ok(near(at(boss), 0.11 * 1000 / 100000, 1e-9), 'no boss o proc devia usar o HP de luta (1000), nao o base (500)');
  ok(near(at({ hp: 10000, resist: {} }), 0.11 * 500 / 100000, 1e-9), 'monstro normal de 10000 hp continua em 5% = 500');
}

console.log('== elemento: monstro raro pesa menos (spawn weight da hunt) ==');
{
  // giant-spider e a excecao do jogo: weights 55/30/15 em vez de dividir igual
  const h = { id: 'gs', packBase: 4, boss: mon('a', 2600, 900, {}),
    monsters: [{ ...mon('a', 2600, 900, {}), spawn: 55 },
               { ...mon('b', 450, 120, {}), spawn: 30 },
               { ...mon('c', 40, 12, { fire: -90 }), spawn: 15 }] };
  const w = M.packWeights(h);
  const sum = w.reduce((s, x) => s + x.weight, 0);
  ok(near(sum, 89492, 1), `pack ponderado devia somar 89492 de HP, somou ${Math.round(sum)}`);
  ok(w[0].weight > w[1].weight * 6, 'o monstro de 55% e 2600hp devia dominar o peso do clear');
  const fire = M.huntElements(h, {}).find(x => x.el === 'fire');
  ok(fire.mult < 1.02, 'fraqueza num bicho de 40hp e 15% de spawn quase nao muda a hunt');
}

console.log('== elemento: imunidade no pack desclassifica o elemento da hunt inteira ==');
{
  const h = hunt([mon('a', 100, 10, { fire: -80 }), mon('b', 100, 10, { fire: 100 })]);
  const fire = M.huntElements(h, {}).find(x => x.el === 'fire');
  ok(fire.immune === true, 'elemento com um monstro imune no pack devia vir marcado immune');
  ok(fire.mult === 0, 'elemento com imune no pack nao tem multiplicador (clear infinito)');
  ok(M.huntElements(h, {})[0].el !== 'fire', 'elemento com imune nao pode ser o recomendado');
}

console.log('== elemento: o peso do pack reproduz o hpPerClear ja gravado em hunts.json ==');
{
  const HUNTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hunts.json'), 'utf8'));
  let checked = 0;
  for (const h of HUNTS) {
    const w = M.packWeights(h);
    const sum = w.reduce((s, x) => s + x.weight, 0);
    if (near(sum, h.hpPerClear, 1)) checked++;
    else if (checked === 0) console.log(`   (${h.id}: soma ${Math.round(sum)} vs hpPerClear ${h.hpPerClear})`);
  }
  ok(checked === HUNTS.length, `packWeights devia somar hpPerClear nas ${HUNTS.length} hunts (bateu em ${checked})`);
}

/* -------------------------------------------------------------------- 2. CHARMS */
/* tabela minima, no formato que o extrator escreve em data/charms.json */
const CHARMS = [
  { key:'wound',        name:'Wound',        category:'major', element:'physical', values:[5,10,11],   points:[240,360,1200] },
  { key:'freeze',       name:'Freeze',       category:'major', element:'ice',      values:[5,10,11],   points:[320,480,1600] },
  { key:'carnage',      name:'Carnage',      category:'major', values:[10,20,22],  points:[600,900,3000] },
  { key:'overpower',    name:'Overpower',    category:'major', values:[5,10,11],   points:[600,900,3000] },
  { key:'overflux',     name:'Overflux',     category:'major', values:[5,10,11],   points:[600,900,3000] },
  { key:'low_blow',     name:'Low Blow',     category:'major', values:[4,8,9],     points:[800,1200,4000] },
  { key:'savage_blow',  name:'Savage Blow',  category:'major', values:[20,40,44],  points:[800,1200,4000] },
  { key:'fatal_hold',   name:'Fatal Hold',   category:'minor', values:[10,15,20],  echoes:[100,150,225] },
  { key:'scavenge',     name:'Scavenge',     category:'minor', values:[10,15,20],  echoes:[100,150,225] },
];
const find = (rows, key) => rows.find(r => r.key === key);
/* contexto padrao: level 500, crit 30%/+150%, sem Avatar, 100k de dano por hit */
const ctx = o => Object.assign({ level:500, cc:30, cd:150, up:0, pierce:0, dps:100000, aps:1 }, o || {});
const target = (hp, resist) => mon('t', hp, 100, resist);

console.log('== charms: Savage Blow escala com o uptime do Avatar ==');
{
  const noAva = find(M.charmRanking(target(20000), ctx({ up: 0 }), CHARMS), 'savage_blow');
  const avatar = find(M.charmRanking(target(20000), ctx({ up: 1 }), CHARMS), 'savage_blow');
  ok(avatar.gain > noAva.gain, 'dentro do Avatar (crita sempre) a Savage Blow devia render mais');
  // up=1: todo hit crita, entao o ganho e' (1.5+cd+0.44)/(1.5+cd) - 1 -- critico da
  // +50% de base (wiki do jogo), nao +100%
  ok(near(avatar.gain, (1.5 + 1.5 + 0.44) / (1.5 + 1.5) - 1, 1e-9), 'com Avatar o ganho e o proprio salto no multiplicador de crit');
  ok(M.CRIT_BASE === 1.5, `critico da +50% de base no jogo, CRIT_BASE devia ser 1.5 (veio ${M.CRIT_BASE})`);
  ok(avatar.points === 6000, 'tier 3 da Savage Blow devia custar 800+1200+4000 = 6000 pontos');
}

console.log('== charms: Low Blow nao vale nada quando voce ja crita sempre ==');
{
  const avatar = find(M.charmRanking(target(20000), ctx({ up: 1 }), CHARMS), 'low_blow');
  ok(near(avatar.gain, 0), 'com 100% de uptime do Avatar o +crit chance da Low Blow e inutil');
  const noAva = find(M.charmRanking(target(20000), ctx({ up: 0 }), CHARMS), 'low_blow');
  ok(noAva.gain > 0, 'fora do Avatar o +crit chance devia render alguma coisa');
}

console.log('== charms: o elemental respeita a resistencia do monstro ==');
{
  const weak = find(M.charmRanking(target(20000, { ice: -50 }), ctx(), CHARMS), 'freeze');
  const flat = find(M.charmRanking(target(20000, {}), ctx(), CHARMS), 'freeze');
  const hard = find(M.charmRanking(target(20000, { ice: 50 }), ctx(), CHARMS), 'freeze');
  ok(near(weak.gain, flat.gain * 1.5, 1e-9), 'monstro que apanha 50% a mais de gelo devia render 1.5x no Freeze');
  ok(near(hard.gain, flat.gain * 0.5, 1e-9), 'monstro que resiste 50% a gelo devia render metade');
  ok(weak.gain > hard.gain, 'fraqueza tem que ranquear na frente de resistencia');
}

console.log('== charms: o dano do elemental e min(2x level, 5% do HP do alvo) ==');
{
  // HP alto: trava em 2x level = 1000. chance 11% no tier 3, dano por hit 100k
  const big = find(M.charmRanking(target(1000000), ctx(), CHARMS), 'freeze');
  ok(near(big.gain, 0.11 * 1000 / 100000, 1e-9), 'em monstro gordo o proc trava em 2x o level');
  // HP baixo: 5% de 10000 = 500 manda
  const small = find(M.charmRanking(target(10000), ctx(), CHARMS), 'freeze');
  ok(near(small.gain, 0.11 * 500 / 100000, 1e-9), 'em monstro magro o proc trava em 5% do HP dele');
}

console.log('== charms: Carnage e dano puro (nao olha resistencia) ==');
{
  const normal = find(M.charmRanking(target(20000, {}), ctx(), CHARMS), 'carnage');
  const immune = find(M.charmRanking(target(20000, { fire:100, ice:100, physical:100 }), ctx(), CHARMS), 'carnage');
  ok(near(normal.gain, immune.gain), 'Carnage e dano puro: imunidade elemental nao muda nada');
  ok(normal.gain > 0, 'Carnage devia render alguma coisa num pack');
}

console.log('== charms: Carnage nao rende no boss, que luta sozinho ==');
{
  // o estouro cai nas 4 casas vizinhas; na wave 10 nao ha vizinho nenhum
  const h = hunt([mon('a', 20000, 900, {})], mon('a', 20000, 900, {}));
  const w = M.packWeights(h);
  const pack = find(M.charmRanking(w[0], ctx(), CHARMS), 'carnage');
  const boss = find(M.charmRanking(w[1], ctx(), CHARMS), 'carnage');
  ok(pack.gain > 0, 'no pack o Carnage rende');
  ok(boss.gain === 0, 'no boss sozinho o Carnage nao tem em quem estourar');
  ok(!!boss.note, 'e o boss devia dizer por que o Carnage zerou');
}

console.log('== charms: o que depende do SEU HP/mana nao recebe numero inventado ==');
{
  const rows = M.charmRanking(target(20000), ctx(), CHARMS);
  for (const k of ['overpower', 'overflux']) {
    const r = find(rows, k);
    ok(r.gain === null, `${k} devia vir sem estimativa (depende do seu HP/mana maximo)`);
    ok(!!r.note, `${k} devia explicar por que nao tem numero`);
  }
}

console.log('== charms: sem DPS colado, so os percentuais rendem numero ==');
{
  const rows = M.charmRanking(target(20000), ctx({ dps: 0 }), CHARMS);
  ok(find(rows, 'freeze').gain === null, 'sem DPS nao da pra comparar dano fixo com percentual');
  ok(!!find(rows, 'freeze').note, 'o elemental sem DPS devia dizer o que falta');
  ok(find(rows, 'savage_blow').gain > 0, 'Savage Blow e percentual: nao precisa de DPS');
}

console.log('== charms: separa Maior de Menor e ordena pelo ganho ==');
{
  const rows = M.charmRanking(target(20000), ctx(), CHARMS);
  ok(find(rows, 'savage_blow').category === 'major', 'Savage Blow e charm Maior (custa pontos)');
  const fh = find(rows, 'fatal_hold');
  ok(fh.category === 'minor' && fh.echoes === 475, 'Fatal Hold e Menor e custa 100+150+225 = 475 echoes');
  ok(!find(rows, 'scavenge'), 'charm que nao e dano fica fora do comparativo de dano');
  const scored = rows.filter(r => r.gain !== null);
  for (let i = 1; i < scored.length; i++) ok(scored[i-1].gain >= scored[i].gain, 'ranking devia estar ordenado por ganho');
  ok(rows[rows.length-1].gain === null, 'os sem estimativa vao pro fim da lista');
}

console.log('== charms: eficiencia por ponto e o gargalo real (Charm Points) ==');
{
  const rows = M.charmRanking(target(20000), ctx(), CHARMS);
  const sb = find(rows, 'savage_blow');
  ok(near(sb.gainPerK, sb.gain / sb.points * 1000, 1e-12), 'gainPerK devia ser ganho por 1000 pontos');
}

console.log('== bestiary: quanto o monstro rende de Charm Point e quantos kills custa ==');
{
  // tabela da wiki do jogo: estrelas por exp -> pontos e meta de kills
  ok(M.bestiary(99).stars === 1 && M.bestiary(99).points === 20 && M.bestiary(99).kills === 250, 'exp 99 e 1 estrela: 20 pontos, 250 kills');
  ok(M.bestiary(100).stars === 2 && M.bestiary(100).points === 60 && M.bestiary(100).kills === 500, 'exp 100 vira 2 estrelas');
  ok(M.bestiary(900).stars === 3 && M.bestiary(900).points === 100 && M.bestiary(900).kills === 1000, 'exp 900 e 3 estrelas');
  ok(M.bestiary(2000).stars === 4 && M.bestiary(2000).points === 200, 'exp 2000 vira 4 estrelas');
  ok(M.bestiary(10000).stars === 5 && M.bestiary(10000).points === 400 && M.bestiary(10000).kills === 2500, 'exp 10000+ e 5 estrelas');
}

/* -------------------------------------------------------------------- 3. AMEACA */
console.log('== ameaca: dmg vira dano/s fisico e a ability vira dano/s do elemento dela ==');
{
  // dmg [0,100] = 50 de media a cada 2000ms = 25/s de fisico
  const t = M.monsterThreat({ dmg: [0, 100] });
  ok(near(t.dps.physical, 25), `melee [0,100] devia dar 25/s de fisico, deu ${t.dps.physical}`);
  ok(t.heal === 0, 'monstro sem cura nao devia reportar cura');
  // ability: media 300, chance 50%, a cada 3000ms = 50/s
  const a = M.monsterThreat({ dmg: [0, 0], abilities: [{ element: 'fire', min: 200, max: 400, chance: 50, interval: 3000 }] });
  ok(near(a.dps.fire, 50), `ability devia render 50/s de fogo, deu ${a.dps.fire}`);
  ok(!a.dps.physical, 'sem melee nao existe fisico');
  // melee e ability somam; healing sai por fora
  const b = M.monsterThreat({ dmg: [0, 100], abilities: [
    { element: 'fire', min: 200, max: 400, chance: 50, interval: 3000 },
    { element: 'healing', min: 100, max: 100, chance: 100, interval: 1000 }] });
  ok(near(b.dps.physical, 25) && near(b.dps.fire, 50), 'melee e ability deviam conviver');
  ok(near(b.heal, 100), 'a cura devia sair separada, nao como ameaca');
  ok(!b.dps.healing, '"healing" nao e elemento de dano');
  // elemento que nao existe no jogo e ignorado em vez de virar coluna nova
  const c = M.monsterThreat({ dmg: [0, 0], abilities: [{ element: 'lifedrain', min: 100, max: 100, chance: 100, interval: 1000 }] });
  ok(Object.keys(c.dps).length === 0, 'elemento fora da lista do jogo nao entra no threat');
}

console.log('== ameaca: a reparticao pesa pelo tempo que cada bicho fica vivo ==');
{
  /* dois bichos, mesmo spawn. O de 900hp fica vivo 9x mais que o de 100hp, entao
     castiga 9x mais -- mesmo cuspindo o mesmo dano/s. Peso por HP, nao por cabeca. */
  const h = hunt([
    { key:'a', name:'a', hp:100, exp:10, resist:{}, threat:{ fire:10 } },
    { key:'b', name:'b', hp:900, exp:10, resist:{}, threat:{ ice:10 } }]);
  const t = M.huntThreat(h);
  const fire = t.rows.find(r => r.el === 'fire'), ice = t.rows.find(r => r.el === 'ice');
  ok(near(ice.share / fire.share, 9, 1e-9), `o bicho gordo devia castigar 9x mais, deu ${ice.share/fire.share}`);
  ok(near(fire.share + ice.share, 1, 1e-9), 'as fatias deviam somar 100%');
  ok(t.rows[0].el === 'ice', 'a maior ameaca vem primeiro');
}

console.log('== ameaca: o boss da wave 10 bate 1.5x, e cura nao viravira ameaca ==');
{
  const m = { key:'a', name:'a', hp:100, exp:10, resist:{}, threat:{ fire:10 } };
  const b = { key:'b', name:'b', hp:100, exp:10, resist:{}, threat:{ ice:10 }, heal:50 };
  const t = M.huntThreat(hunt([m], b));
  const fire = t.rows.find(r => r.el === 'fire'), ice = t.rows.find(r => r.el === 'ice');
  // pack: 52 spawns x 100hp = 5200 de peso; boss: 100x3 = 300 de peso, dano x1.5
  ok(near(ice.share / fire.share, (300 * 1.5) / 5200, 1e-9), 'o boss devia entrar com dano x1.5 sobre o peso dele');
  ok(t.healers.join() === 'b', `o bicho que se cura devia ser listado, veio ${t.healers.join()}`);
  const t2 = M.huntThreat(hunt([m], Object.assign({}, b, { name:'a', key:'a' })));
  ok(t2.healers.length <= 1, 'boss que e a mesma criatura do pack nao pode aparecer duas vezes na lista de cura');
}

console.log('== ameaca: hunt sem dado de dano diz que nao sabe, em vez de chutar ==');
{
  const t = M.huntThreat(hunt([mon('a', 100, 10, {})]));
  ok(t.rows.length === 0, 'sem threat no dado nao sai reparticao');
  ok(t.known === false, 'e a hunt devia se declarar sem dado');
}

/* --------------------------------------------------------------------- 4. PLANO */
/* tabela com o suficiente pra atribuicao ter escolha real */
const PLAN_CHARMS = CHARMS.concat([
  { key:'poison', name:'Poison', category:'major', element:'earth', values:[5,10,11], points:[240,360,1200] },
  { key:'enflame', name:'Enflame', category:'major', element:'fire', values:[5,10,11], points:[400,600,2000] },
  { key:'gut', name:'Gut', category:'minor', values:[6,9,12], echoes:[100,150,225] },
  { key:'adrenaline_burst', name:'Adrenaline Burst', category:'minor', values:[6,9,12], echoes:[100,150,225] },
]);
const planOf = (h, o) => M.huntCharmPlan(h, ctx(o && o.ctx), Object.assign({ charms: PLAN_CHARMS }, o));

console.log('== plano: o boss da wave 10 e A MESMA criatura do pack, nao uma linha extra ==');
{
  /* e' o achado que muda a recomendacao: nas 79 hunts do jogo o boss e um bicho do
     proprio pack, entao o charm dele vale nas duas aparicoes -- pack e wave 10. */
  const h = { id:'x', packBase:4, monsters: [mon('a', 100, 10, {}), mon('b', 200, 20, {})],
    boss: mon('b', 200, 20, {}) };
  const cr = M.huntCreatures(h);
  ok(cr.length === 2, `2 bichos no pack deviam dar 2 criaturas, deu ${cr.length}`);
  const b = cr.find(c => c.id === 'b');
  ok(b.isBoss === true, 'a criatura que faz de boss devia estar marcada');
  ok(b.parts.length === 2, 'ela devia ter 2 aparicoes (pack + wave 10) somadas no peso');
  ok(near(cr.reduce((s, c) => s + c.share, 0), 1, 1e-9), 'as fatias das criaturas somam 100%');
  const total = M.packWeights(h).reduce((s, x) => s + x.weight, 0);
  ok(near(cr.reduce((s, c) => s + c.weight, 0), total, 1e-6), 'juntar o boss nao pode criar nem perder peso');
}

console.log('== plano: cada charm mora numa criatura so, e cada criatura pega 1 Maior + 1 Menor ==');
{
  const h = { id:'x', packBase:4, boss: mon('a', 300, 900, {}),
    monsters: [mon('a', 300, 900, {}), mon('b', 300, 900, {}), mon('c', 300, 900, {})] };
  const p = planOf(h);
  const majors = p.rows.filter(r => r.major).map(r => r.major.key);
  const minors = p.rows.filter(r => r.minor).map(r => r.minor.key);
  ok(new Set(majors).size === majors.length, `charm Maior repetido no plano: ${majors.join(',')}`);
  ok(new Set(minors).size === minors.length, `charm Menor repetido no plano: ${minors.join(',')}`);
  for (const r of p.rows) {
    ok(!r.major || r.major.category === 'major', 'o slot de Maior so aceita Maior');
    ok(!r.minor || r.minor.category === 'minor', 'o slot de Menor so aceita Menor');
  }
}

console.log('== plano: charm que o jogador nao tem nao entra ==');
{
  const h = { id:'x', packBase:4, boss: mon('a', 300, 900, {}), monsters: [mon('a', 300, 900, {})] };
  const all = planOf(h);
  /* no ctx padrao (crit 30%/+150%) o melhor passivo e Low Blow, nao Savage Blow --
     ver o bloco de crit abaixo. O que este teste prova e' a POSSE, nao quem ganha. */
  ok(all.rows[0].major.key === 'low_blow', `com tudo na mao entra o melhor Maior, veio ${all.rows[0].major.key}`);
  const sem = planOf(h, { owned: ['poison', 'gut'] });
  ok(sem.rows[0].major.key === 'poison', 'sem Savage Blow o plano cai no que sobrou');
  ok(sem.rows[0].minor.key === 'gut', 'e o Menor tambem respeita a posse');
  const nada = planOf(h, { owned: [] });
  ok(nada.rows[0].major === null && nada.rows[0].minor === null, 'sem charm nenhum o plano fica vazio, nao inventa');
}

console.log('== plano: o Maior forte vai pra criatura que mais pesa no clear ==');
{
  /* Savage Blow rende igual em qualquer bicho (e' % de crit), entao quem decide e' o
     PESO -- e o peso e' onde voce gasta tempo batendo. E' a pergunta do jogador:
     "a Savage vai no bicho que mais tem". A resposta e "no que mais pesa", que com
     o boss da wave 10 (HP x3) costuma ser a criatura-boss. */
  const h = { id:'x', packBase:4, boss: mon('big', 1000, 900, {}),
    monsters: [mon('small', 100, 900, {}), mon('big', 1000, 900, {})] };
  const p = planOf(h, { owned: ['savage_blow', 'poison', 'enflame'] });
  const sb = p.rows.find(r => r.major && r.major.key === 'savage_blow');
  ok(sb && sb.creature.id === 'big', `Savage Blow devia ir no bicho de maior peso, foi em ${sb && sb.creature.id}`);
  ok(sb.creature.isBoss === true, 'que aqui e a propria criatura-boss');
}

console.log('== plano: entre os passivos, quem ganha depende do SEU crit ==');
{
  /* Nao e' "Savage Blow e a melhor" -- Low Blow (+chance) e Savage Blow (+dano de
     crit) trocam de lugar conforme a sua chance de crit. Com 30% de chance, +9 de
     chance vale mais que +44 de dano; com a chance alta, inverte. O plano tem que
     seguir a conta, nao a fama do charm. */
  const h = { id:'x', packBase:4, boss: mon('a', 300, 900, {}), monsters: [mon('a', 300, 900, {})] };
  const low = planOf(h, { ctx: { cc: 30, cd: 150 } });
  ok(low.rows[0].major.key === 'low_blow', `crit chance baixa devia escolher Low Blow, escolheu ${low.rows[0].major.key}`);
  const high = planOf(h, { ctx: { cc: 80, cd: 100 } });
  ok(high.rows[0].major.key === 'savage_blow', `crit chance alta devia escolher Savage Blow, escolheu ${high.rows[0].major.key}`);
  /* e o Avatar (crita sempre) mata a Low Blow de vez */
  const ava = planOf(h, { ctx: { up: 1 } });
  ok(ava.rows[0].major.key === 'savage_blow', 'dentro do Avatar, +chance de crit nao vale nada');
}

console.log('== plano: o charm que falta vira nota, nao entra no plano ==');
{
  const h = { id:'x', packBase:4, boss: mon('a', 300, 900, {}), monsters: [mon('a', 300, 900, {})] };
  const p = planOf(h, { owned: ['savage_blow', 'fatal_hold'], ctx: { cc: 30, cd: 150 } });
  ok(p.rows[0].major.key === 'savage_blow', 'o plano usa o que da pra executar hoje');
  const lk = p.rows[0].locked;
  ok(lk && lk.key === 'low_blow', `devia avisar que Low Blow bateria o escolhido, veio ${lk && lk.key}`);
  ok(lk.gain > p.rows[0].major.gain, 'e a nota so aparece quando o charm que falta e upgrade de verdade');
  /* com tudo na mao nao existe "charm que falta" */
  ok(planOf(h, { ctx: { cc: 30, cd: 150 } }).rows[0].locked === null, 'sem restricao de posse nao ha nota');
}

console.log('== plano: a atribuicao e otima, nao gulosa ==');
{
  /* Armadilha classica do guloso: o par de maior valor isolado e (gordo, Savage),
     mas Savage e o unico charm que rende no magro tambem. O otimo aqui e' comparar
     as duas combinacoes inteiras, nao pegar o melhor par primeiro. Este caso e'
     construido pra que a soma otima seja verificavel a mao. */
  const h = { id:'x', packBase:4, boss: null,
    monsters: [mon('a', 500, 900, {}), mon('b', 500, 900, { ice:-90 })] };
  const p = planOf(h, { ctx: { dps: 400 } });   // dps baixo: o elemental sai do ruido
  const keys = p.rows.map(r => r.major && r.major.key);
  ok(new Set(keys.filter(Boolean)).size === keys.filter(Boolean).length, 'sem charm repetido');
  const totalPlan = p.rows.reduce((s, r) => s + (r.major ? r.major.gain * r.creature.share : 0), 0);
  /* melhor alternativa possivel: testar toda permutacao de 2 charms nas 2 criaturas */
  const cands = PLAN_CHARMS.filter(c => c.category === 'major');
  let best = 0;
  const cr = M.huntCreatures(h);
  for (const x of cands) for (const y of cands) {
    if (x.key === y.key) continue;
    const gx = M.charmValue(x, x.values.length - 1, cr[0], ctx({ dps: 400 })).gain;
    const gy = M.charmValue(y, y.values.length - 1, cr[1], ctx({ dps: 400 })).gain;
    if (gx == null || gy == null) continue;
    best = Math.max(best, gx * cr[0].share + gy * cr[1].share);
  }
  ok(totalPlan >= best - 1e-9, `o plano (${totalPlan.toFixed(6)}) devia igualar o otimo por forca bruta (${best.toFixed(6)})`);
}

console.log('== plano: slot e limite de CRIATURAS com charm, e o Menor pega carona ==');
{
  const h = { id:'x', packBase:4, boss: mon('a', 300, 900, {}),
    monsters: [mon('a', 300, 900, {}), mon('b', 300, 900, {}), mon('c', 300, 900, {})] };
  const p = planOf(h, { slots: 2 });
  ok(p.slotsUsed <= 2, `com 2 slots o plano nao pode ocupar ${p.slotsUsed} criaturas`);
  /* Menor na criatura que JA tem Maior nao gasta slot novo -- por isso ele desce
     pelas criaturas ja escolhidas antes de abrir uma nova. */
  const withBoth = p.rows.filter(r => r.major && r.minor).length;
  ok(withBoth >= 1, 'o Menor devia pegar carona numa criatura que ja tem Maior');
  const onlyMinor = p.rows.filter(r => !r.major && r.minor).length;
  ok(p.slotsUsed === withBoth + onlyMinor + p.rows.filter(r => r.major && !r.minor).length,
    'slotsUsed devia contar criaturas com qualquer charm');
}

console.log('== plano: Fatal Hold vai onde rende, o resto dos Menores segue a ordem declarada ==');
{
  const h = { id:'x', packBase:4, boss: mon('big', 1000, 900, {}),
    monsters: [mon('small', 100, 900, {}), mon('big', 1000, 900, {})] };
  const p = planOf(h);
  const fh = p.rows.find(r => r.minor && r.minor.key === 'fatal_hold');
  ok(fh && fh.creature.id === 'big', 'Fatal Hold e dano: vai na criatura de maior peso');
  const rest = p.rows.filter(r => r.minor && r.minor.key !== 'fatal_hold').map(r => r.minor.key);
  ok(rest.length > 0, 'os outros Menores tambem deviam ser atribuidos');
  ok(M.MINOR_ORDER.indexOf(rest[0]) > M.MINOR_ORDER.indexOf('fatal_hold'),
    'os de utilidade vem depois do de dano na ordem declarada');
}

console.log('== plano: migalha entra marcada (Charm Point e teto, nao moeda) ==');
{
  /* proc elemental trava em min(2x level, 5% do HP): num bicho magro contra um dano
     por golpe alto isso e' ruido. O charm ainda entra -- ponto sobrando nao compra
     nada -- mas marcado, pra nao virar recomendacao de fechar bestiary por nada. */
  const h = { id:'x', packBase:4, boss: null, monsters: [mon('a', 100, 900, {}), mon('b', 100, 900, {})] };
  const p = planOf(h, { ctx: { dps: 1e7 }, owned: ['poison', 'enflame'] });
  const assigned = p.rows.filter(r => r.major);
  ok(assigned.length > 0, 'charm irrelevante ainda e atribuido: ponto que sobra nao vale nada');
  ok(assigned.every(r => r.major.marginal === true), 'e todos deviam vir marcados como migalha');
  const fat = planOf(h, { ctx: { dps: 100 }, owned: ['poison', 'enflame'] });
  ok(fat.rows.some(r => r.major && !r.major.marginal), 'com dano por golpe baixo o mesmo charm deixa de ser migalha');
}

console.log('== plano: as notas de decisao (tier barato, alternativa barata, elemental) ==');
{
  const h = { id:'x', packBase:4, boss: mon('a', 300, 900, {}), monsters: [mon('a', 300, 900, {})] };
  const p = planOf(h, { ctx: { cc: 80, cd: 100 } });
  const m = p.rows[0].major;
  ok(m.key === 'savage_blow', 'contexto de crit alto: Savage Blow ganha');
  /* T2 da +40% de crit damage por 2000 pontos; T3 da +44% por 6000 */
  ok(m.tierNote && m.tierNote.tier === 2, 'devia avisar que o T2 quase empata');
  ok(m.tierNote.points === 2000 && m.points === 6000, 'com os custos dos dois tiers na mao');
  ok(m.tierNote.gain >= m.gain * 0.9, 'a nota so aparece quando o tier menor entrega >=90%');
  const eb = p.rows[0].elem;
  ok(eb && eb.times > 1, 'devia dizer quantos acertos/s o elemental precisa pra empatar');
  ok(eb.gain > 0 && eb.name, 'e qual elemental e o candidato');
}

console.log('== plano: sem DPS colado o elemental entra por RESISTENCIA, nao sai do plano ==');
{
  /* Nao saber QUANTO o elemental rende nao e' nao saber ONDE ele rende mais: a
     resistencia do bicho ordena isso sozinha. Deixar a criatura vazia escondia
     resposta que existia -- era o bug do plano vindo com uma linha so. */
  const h = { id:'x', packBase:4, boss: mon('a', 300, 900, {}),
    monsters: [mon('a', 300, 900, {}), mon('b', 300, 900, { fire:-50, ice:20 })] };
  /* um percentual so (Savage Blow) pra sobrar criatura: com dois, todo mundo recebe
     charm medido e o preenchimento por resistencia nem precisa acontecer. */
  const p = planOf(h, { ctx: { dps: 0 }, owned: ['savage_blow', 'enflame', 'poison', 'fatal_hold'] });
  ok(p.needsDps === true, 'sem DPS o plano devia sinalizar que falta dado');
  ok(p.rows.every(r => r.major), 'e ainda assim nenhuma criatura fica sem Maior');
  ok(p.rows.find(r => r.creature.id === 'a').major.key === 'savage_blow',
    'o percentual, que tem numero, vai pra criatura de maior peso');
  const b = p.rows.find(r => r.creature.id === 'b').major;
  ok(b.element === 'fire', `o bicho fraco a fogo devia receber o charm de fogo, recebeu ${b.element}`);
  ok(b.blind === true, 'marcado como posto no escuro: falta o numero');
  ok(b.gain === null, 'e sem ganho inventado');
  ok(near(b.mult, 1.5), `devia expor o quanto o bicho apanha (1.5x), veio ${b.mult}`);
  const keys = p.rows.map(r => r.major.key);
  ok(new Set(keys).size === keys.length, 'e a exclusividade continua valendo');
}

console.log('== plano: no escuro, elemento IMUNE nunca e atribuido ==');
{
  const h = { id:'x', packBase:4, boss: null,
    monsters: [mon('a', 300, 900, { fire:100, earth:100, ice:100, energy:100, death:100, holy:100 })] };
  const p = planOf(h, { ctx: { dps: 0 }, owned: ['poison','enflame','freeze','zap','curse','divine_wrath'] });
  ok(!p.rows[0].major, 'monstro imune a todos os elementos disponiveis nao recebe elemental nenhum');
  ok(p.rows[0].majorNote === 'none', 'e a UI recebe o motivo');
}

console.log('== plano: no escuro, empate de resistencia vai pro charm mais barato ==');
{
  /* resist 0 em tudo: Wound/Poison custam 1200, Divine Wrath custa 3000. Sem ganho
     pra comparar, o desempate honesto e' o custo. */
  const h = { id:'x', packBase:4, boss: null, monsters: [mon('a', 300, 900, {})] };
  const p = planOf(h, { ctx: { dps: 0 }, owned: ['divine_wrath','poison'] });
  ok(p.rows[0].major.key === 'poison', `empate devia ir pro barato, foi ${p.rows[0].major.key}`);
}

console.log('== plano: no escuro o slot continua sendo respeitado ==');
{
  const h = { id:'x', packBase:4, boss: null,
    monsters: [mon('a', 300, 900, {}), mon('b', 300, 900, {}), mon('c', 300, 900, {})] };
  const p = planOf(h, { ctx: { dps: 0 }, slots: 2 });
  ok(p.slotsUsed <= 2, `com 2 slots o preenchimento por resistencia nao pode passar disso (deu ${p.slotsUsed})`);
}

console.log('== plano: roda nas 79 hunts reais sem quebrar invariante ==');
{
  const HUNTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hunts.json'), 'utf8'));
  const CH = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'charms.json'), 'utf8'));
  let bad = [], threatOk = 0;
  for (const h of HUNTS) {
    const p = M.huntCharmPlan(h, ctx(), { charms: CH, slots: 25 });
    const majors = p.rows.filter(r => r.major).map(r => r.major.key);
    const minors = p.rows.filter(r => r.minor).map(r => r.minor.key);
    if (new Set(majors).size !== majors.length) bad.push(h.id + ' (Maior repetido)');
    if (new Set(minors).size !== minors.length) bad.push(h.id + ' (Menor repetido)');
    if (p.rows.some(r => r.major && r.major.gain == null)) bad.push(h.id + ' (Maior sem numero)');
    const shares = p.rows.reduce((s, r) => s + r.creature.share, 0);
    if (!near(shares, 1, 1e-6)) bad.push(h.id + ' (fatias somam ' + shares.toFixed(4) + ')');
    const t = M.huntThreat(h);
    if (t.known && near(t.rows.reduce((s, r) => s + r.share, 0), 1, 1e-9)) threatOk++;
  }
  ok(bad.length === 0, `invariante quebrada em: ${bad.slice(0, 5).join(', ')}`);
  ok(threatOk === HUNTS.length, `as ${HUNTS.length} hunts deviam ter ameaca conhecida somando 100% (deu ${threatOk})`);
}

/* --------------------------------------------------------------------- 5. DADOS */
console.log('== dados: o extrator trouxe o resist do bundle pro repo ==');
{
  const D = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
  const MONS = D('monsters.json'), HUNTS = D('hunts.json'), CH = D('charms.json');

  ok(MONS.swamp_troll && MONS.swamp_troll.resist.earth === 15 && MONS.swamp_troll.resist.fire === -5,
    'swamp_troll devia ter resist earth +15 / fire -5, igual ao bundle');
  /* O bundle tem DUAS tabelas de monstro e faz merge RASO: a tabela por nome
     substitui o objeto `resist` inteiro, nao mistura campo a campo. A tarantula e o
     caso que denuncia -- a base ainda tem earth:100, e o jogo NAO usa esse valor.
     Se o extrator um dia "consertar" isso mesclando campo a campo, ele passa a
     mostrar imunidades que o jogo nao tem. */
  ok(MONS.tarantula.resist.earth === undefined,
    'tarantula: o override por nome tirou a imunidade a earth, e ele que vale');
  ok(MONS.tarantula.resist.fire === -15, 'tarantula apanha 15% a mais de fogo');
  ok(MONS.solid_frozen_horror.resist.ice === 100, 'solid_frozen_horror e imune a gelo (imunidade existe no dado)');
  ok(Object.keys(MONS).length > 300, `monsters.json devia trazer o bestiary inteiro (veio ${Object.keys(MONS).length})`);

  let semResist = 0, comResist = 0;
  for (const h of HUNTS) for (const m of h.monsters) (m.resist ? comResist++ : semResist++);
  ok(semResist === 0, `${semResist} monstros de hunt ficaram sem resist`);
  ok(comResist > 100, 'as hunts deviam ter resist em todos os monstros');

  const gs = HUNTS.find(h => h.id === 'giant-spider');
  ok(gs.monsters.map(m => m.spawn).join('/') === '55/30/15', 'giant-spider tem spawn weight 55/30/15 no bundle');
  ok(HUNTS.filter(h => h.monsters.some(m => m.spawn != null)).length === 1,
    'so a hunt que tem weights no bundle devia gravar spawn (o resto divide igual)');

  ok(CH.length === 24, `a wiki do jogo diz 24 charms, vieram ${CH.length}`);
  const sb = CH.find(c => c.key === 'savage_blow');
  ok(sb && sb.values.join('/') === '20/40/44' && sb.points.join('/') === '800/1200/4000',
    'savage_blow: +20/40/44% de crit damage por 800/1200/4000 pontos');
  ok(CH.find(c => c.key === 'freeze').element === 'ice', 'freeze e o charm de gelo');
  ok(CH.find(c => c.key === 'fatal_hold').echoes.join('/') === '100/150/225', 'fatal_hold e Menor: custa echoes');
  const majors = CH.filter(c => c.category === 'major');
  const totalMax = majors.reduce((s, c) => s + c.points.reduce((a, b) => a + b, 0), 0);
  ok(totalMax === 48900, `maximizar todos os Maiores custa 48.900 pontos na wiki, deu ${totalMax}`);
}

console.log('== dados: o que o browser carrega e o mesmo que esta em data/ ==');
{
  const sb2 = { window: {}, console };
  sb2.window.window = sb2.window;
  vm.createContext(sb2);
  for (const f of ['hunts.js', 'charms.js']) vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sb2, { filename: f });
  const dh = fs.readFileSync(path.join(__dirname, '..', 'data', 'hunts.json'), 'utf8');
  const dc = fs.readFileSync(path.join(__dirname, '..', 'data', 'charms.json'), 'utf8');
  ok(JSON.stringify(sb2.window.HUNTS) === JSON.stringify(JSON.parse(dh)), 'public/hunts.js fora de sincronia com data/hunts.json');
  ok(JSON.stringify(sb2.window.CHARMS) === JSON.stringify(JSON.parse(dc)), 'public/charms.js fora de sincronia com data/charms.json');
}

/* ------------------------------------------------------------------- resultado */
console.log('== Carnage: acerta quem estiver colado, nao 2 sempre ==');
{
  /* pack base 4: waves de 4,4,5,5,6,6,7,7,8. Quando o k-esimo de n morre, cada uma
     das 2 casas do alcance tem bicho com chance (n-k)/7. Soma n(n-1)/7 por wave. */
  const waves = [4, 4, 5, 5, 6, 6, 7, 7, 8];
  const want = waves.reduce((s, n) => s + n * (n - 1) / 7, 0) / waves.reduce((s, n) => s + n, 0);
  ok(near(M.carnageNeighbors({ packBase: 4 }), want, 1e-9), `pack 4 devia dar ${want.toFixed(3)} vizinhos, deu ${M.carnageNeighbors({ packBase: 4 })}`);
  ok(M.carnageNeighbors({ packBase: 4 }) < 1, 'em media o estouro acerta menos de 1 bicho num pack de 4');
  ok(M.carnageNeighbors({ packBase: 9 }) > M.carnageNeighbors({ packBase: 4 }), 'pack maior, mais vizinhos');
  ok(M.carnageNeighbors({ packBase: 9 }) <= 2, 'e nunca passa das 2 casas do anel');

  /* com Avatar a ~50%, na 2a criatura a Low Blow passa o Carnage (antes, com 2
     vizinhos fixos, o Carnage ganhava por mais do dobro) */
  const realHunts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hunts.json'), 'utf8'));
  const realCharms = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'charms.json'), 'utf8'));
  const h = realHunts.find(x => x.id === 'asura-citadel');
  const plan = M.huntCharmPlan(h, ctx({ level: 900, cc: 7.7, cd: 52.5, up: 0.5, dps: 100000, aps: 1.2 }),
    { owned: realCharms.map(c => c.key), slots: 25, charms: realCharms });
  const byRank = plan.rows.slice().sort((a, b) => b.creature.share - a.creature.share).map(r => r.major && r.major.key);
  ok(byRank[0] === 'savage_blow' && byRank[1] === 'low_blow' && byRank[2] === 'carnage',
    `Asura Citadel no 900 com Avatar: Savage > Low Blow > Carnage, veio ${byRank.join(' > ')}`);
}

console.log('== regra da casa: Savage fixa, Gut/Scavenge/Fatal Hold sempre, golpe medio decide o resto ==');
{
  const realHunts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hunts.json'), 'utf8'));
  const realCharms = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'charms.json'), 'utf8'));
  const sbx = { window: {}, console }; sbx.window.window = sbx.window; require('vm').createContext(sbx);
  require('vm').runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'loot.js'), 'utf8'), sbx);
  const LOOT = sbx.window.LOOT;
  const owned = realCharms.map(c => c.key);

  /* sem a regra, crit 30% e sem Avatar: a matematica escolhe Low Blow (bloco acima).
     COM a regra, a Savage entra mesmo assim. */
  const h1 = { id:'x', packBase:4, boss: mon('a', 300, 900, {}), monsters: [mon('a', 300, 900, {})] };
  const free = M.huntCharmPlan(h1, ctx({ cc: 30, cd: 150 }), { owned, charms: realCharms });
  const rule = M.huntCharmPlan(h1, ctx({ cc: 30, cd: 150 }), { owned, charms: realCharms, must: M.MUST_MAJOR });
  ok(free.rows[0].major.key === 'low_blow', 'sem a regra, a conta pura escolhe Low Blow aqui');
  ok(rule.rows[0].major.key === 'savage_blow', 'com a regra, a Savage Blow entra sempre');

  /* hunt de 4 criaturas: os tres Menores fixos estao la */
  const bony = realHunts.find(h => /bony/i.test(h.name));
  const c900 = ctx({ level: 900, cc: 7.7, cd: 52.5, up: 0.5, dps: 100000, aps: 1.2 });
  const p = M.huntCharmPlan(bony, c900, { owned, charms: realCharms, loot: LOOT, must: M.MUST_MAJOR });
  const minors = p.rows.map(r => r.minor && r.minor.key);
  for (const k of ['fatal_hold', 'gut', 'scavenge'])
    ok(minors.includes(k), `${k} e fixo e devia estar no plano da ${bony.name} (veio ${minors.join(',')})`);
  ok(p.rows.some(r => r.major && r.major.key === 'savage_blow'), 'e a Savage tambem');

  /* golpe medio pequeno (runa): mais golpes por bicho, o elemental passa o Carnage */
  const big = M.huntCharmPlan(bony, c900, { owned, charms: realCharms, loot: LOOT, must: M.MUST_MAJOR });
  const small = M.huntCharmPlan(bony, Object.assign({}, c900, { hit: 2000 }), { owned, charms: realCharms, loot: LOOT, must: M.MUST_MAJOR });
  const els = pl => pl.rows.filter(r => r.major && realCharms.find(c => c.key === r.major.key).element).length;
  ok(els(small) > els(big), `com golpe de 2k devia ter mais elemental no plano (${els(small)} vs ${els(big)})`);
  ok(!small.rows.some(r => r.major && r.major.key === 'carnage'), 'e o Carnage sai');

  /* a virada em golpes bate com a conta na mao */
  const carn = realCharms.find(c => c.key === 'carnage'), enf = realCharms.find(c => c.key === 'enflame');
  const cr = { hp: 60000, hpFight: 60000, resist: {} };
  const want = (0.22 * Math.min(0.15 * 60000, 6 * 900) * M.carnageNeighbors(bony)) / (0.11 * Math.min(2 * 900, 0.05 * 60000));
  ok(near(M.carnageBreakeven(cr, { level: 900 }, carn, enf, bony), want, 1e-9), `virada devia ser ${want.toFixed(2)} golpes`);
}

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
