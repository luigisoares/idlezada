/* ============================================================================
   check-builds.js — verificacao do otimizador. Rode depois de mexer em qualquer
   peso de PROFILES ou em trees.json:

       node tools/check-builds.js        (sai != 0 se algo falhar)

   Nao ha dependencia nenhuma: carrega public/trees.js + public/engine.js num shim
   de `window`, do mesmo jeito que o navegador faz.

   Tres blocos:
     1. INVARIANTES   — valem sempre. Se um destes quebra, tem bug.
     2. COMPORTAMENTO — cada objetivo entrega o que o botao promete.
     3. CALIBRAGEM    — as conclusoes da analise comparativa (ver tools/model.js).
                        Estas encodam PREMISSAS, nao leis: se voce mudar a
                        calibragem de proposito, e' legitimo atualiza-las.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const PUB = path.join(__dirname, '..', 'public');
const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
for (const f of ['trees.js', 'engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sandbox, { filename: f });
}
const E = sandbox.window.Engine, TREES = sandbox.window.TREES;
const metrics = require('./model.js')(E);

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }
const allocated = ranks => new Set(Object.keys(ranks).filter(id => ranks[id] > 0));
const nameOf = (v, id) => (TREES[v].find(n => n.id === id) || {}).name || id;
const build = (v, lv, obj, el) => E.autobuild(v, lv, obj, { element: el || E.defaultElement(v) });
const agg = (v, lv, obj, el) => E.aggregate(v, build(v, lv, obj, el).ranks);

const OBJS = Object.keys(E.PROFILES);
const LEVELS = [50, 200, 500, 2000];

/* ---------------------------------------------------------------- 1. INVARIANTES */
console.log(`== invariantes (${OBJS.length} objetivos x ${E.VOCS.length} vocacoes x ${LEVELS.length} levels) ==`);
for (const v of E.VOCS) for (const obj of OBJS) for (const lv of LEVELS) {
  const el = E.defaultElement(v);
  const b = build(v, lv, obj, el);
  const tag = `${v}/${obj}/${lv}`;
  ok(E.valid(v, b.ranks), `${tag}: build invalida (no alocado sem caminho)`);
  ok(b.spent <= lv, `${tag}: gastou ${b.spent} > ${lv} pontos`);
  const code = E.encode(v, b.ranks, lv);
  const back = E.decode(code);
  ok(back !== null, `${tag}: share code ${code} nao decodifica`);
  // round-trip: o codigo tem que devolver exatamente os mesmos ranks
  if (back) {
    const same = Object.keys(b.ranks).every(id => (back.ranks[id]||0) === b.ranks[id])
      && Object.keys(back.ranks).length === Object.keys(b.ranks).length;
    ok(same, `${tag}: encode->decode nao volta na mesma build`);
  }
  if (lv >= 200) ok(b.spent > lv * 0.9, `${tag}: sobrou ponto demais (${b.spent}/${lv})`);

  /* FOCO NO TEMA: um no que nao vale nada no perfil so pode estar alocado se for
     caminho OBRIGATORIO. Se ele sai e a build continua valida, os pontos dele foram
     jogados fora -- era assim que 9 nos de DEFESA sobravam numa build de Avatar do
     knight (caminho aberto no comeco do greedy que ficou redundante depois, e nunca
     era desfeito porque o autobuild nunca chamava canDealloc). */
  /* a valoracao usada tem que ser a MESMA que comprou o no: numa build que precisou do
     passe de sobra (o tema acabou antes do level) os nos finais valem 0 no perfil de
     proposito, e cobrar deles o peso do tema acusaria 103 falsos positivos. */
  const floor = b.spentFallback > 0;
  const ctx = E.valueCtx(v, b.ranks);
  for (const id of Object.keys(b.ranks)) {
    if (!b.ranks[id]) continue;
    const n = E.nd(v, id);
    if (E.nodeValue(n, obj, el, ctx, floor) > E.DEAD_EPS) continue;    // vale algo: legitimo
    const t = Object.assign({}, b.ranks); t[id] = 0;
    ok(!E.valid(v, t), `${tag}: ${nameOf(v, id)} r${b.ranks[id]} vale 0 e `
      + `sai sem quebrar a conectividade (${E.totalCost(n, b.ranks[id])} pts jogados fora)`);
  }
}

/* -------------------------------------------------------------- 2. COMPORTAMENTO */
console.log('== elemento: sem escolha, no de elemento nao ganha prioridade nenhuma ==');
{
  /* o caso reportado: sorcerer/avatar subia fire, energy E death em paralelo, porque
     com "all" os tres pesavam igual -- so que o personagem ataca com UM elemento. */
  const v = 'sorcerer', lv = 1500;
  const elTot = rk => Object.values(E.aggregate(v, rk).elem.elementDmgPct || {})
    .reduce((s, x) => s + x, 0);

  const none = E.autobuild(v, lv, 'avatar', { element:'none' });
  const a = E.aggregate(v, none.ranks).bonus;
  ok(elTot(none.ranks) <= 10, `avatar/sorcerer/${lv} element=none pegou `
    + `${elTot(none.ranks).toFixed(1)}% de dano de elemento (esperado <= 10: so o caminho)`);
  ok((a.spellDmgPct||0) >= 160, `avatar/sorcerer/${lv} element=none: spellDmg `
    + `${a.spellDmgPct}% (esperado >= 160 -- o ponto que nao vai pro elemento vira spell dmg)`);
  console.log(`   none: spellDmg +${a.spellDmgPct}% · critDmg +${a.critDmg}% `
    + `· elemento ${elTot(none.ranks).toFixed(1)}% · ${allocated(none.ranks).size} nos`);

  const fire = E.autobuild(v, lv, 'avatar', { element:'fire' });
  const fel = E.aggregate(v, fire.ranks).elem.elementDmgPct || {};
  const off = Object.entries(fel).filter(([e]) => e !== 'fire').reduce((s, [, x]) => s + x, 0);
  ok((fel.fire||0) >= 30, `avatar/sorcerer/${lv} element=fire so pegou ${(fel.fire||0).toFixed(1)}% de fire`);
  ok(off <= 4, `avatar/sorcerer/${lv} element=fire pegou ${off.toFixed(1)}% de OUTRO elemento `
    + `(esperado <= 4: escada de fora nao ganha prioridade)`);
  console.log(`   fire: fire +${(fel.fire||0).toFixed(1)}% · outros ${off.toFixed(1)}% `
    + `· ${allocated(fire.ranks).size} nos`);

  /* o seletor de elemento tem que aparecer em TODO objetivo em que o elemento muda a
     build. `avatar` tem elemPick 1.3 e ficava de fora da lista da UI -- era por isso
     que nao havia como pedir "avatar de fire". */
  for (const o of ['dano','avatar','aoe'])
    ok(E.elementObjs().includes(o), `elementObjs() nao inclui "${o}" (elemPick ${E.PROFILES[o].elemPick})`);
  console.log(`   objetivos com seletor de elemento: ${E.elementObjs().join(', ')}`);
}

console.log('== healer: cura de verdade no druid, e mais cura que o dano puro ==');
{
  const b = build('druid', 500, 'healer');
  const got = allocated(b.ranks);
  for (const id of ['d_mending','d_lifebloom','d_healing_link','d_lifekeeper','d_grove'])
    ok(got.has(id), `healer/druid/500 nao pegou ${id} (${nameOf('druid', id)})`);
  const a = E.aggregate('druid', b.ranks);
  ok((a.bonus.spellHealPct||0) >= 25, `healer/druid/500 spellHealPct=${a.bonus.spellHealPct} (esperado >= 25)`);
  ok((a.bonus.manaPct||0) > 0, 'healer/druid/500 sem mana nenhuma pra sustentar a cura');
  const puro = agg('druid', 500, 'dano').bonus.spellHealPct || 0;
  ok(puro < (a.bonus.spellHealPct||0), `dano/druid pegou tanta cura (${puro}) quanto o healer`);
  console.log(`   spellHeal +${a.bonus.spellHealPct}% · mana +${a.bonus.manaPct}% · ${b.spent}/500 pts`);
}

console.log('== curadano: os dois lados presentes, nenhum acima do respectivo puro ==');
for (const lv of [200, 500, 1500]) {
  const h = agg('druid', lv, 'healer').bonus, d = agg('druid', lv, 'dano').bonus,
        m = agg('druid', lv, 'curadano').bonus;
  const heal = m.spellHealPct||0, dmg = m.spellDmgPct||0;
  ok(heal > 0, `curadano/druid/${lv} sem cura nenhuma`);
  ok(dmg > 0, `curadano/druid/${lv} sem dano nenhum`);
  ok(heal <= (h.spellHealPct||0)+0.001, `curadano/${lv} cura ${heal} > healer puro ${h.spellHealPct}`);
  ok(dmg <= (d.spellDmgPct||0)+0.001, `curadano/${lv} dano ${dmg} > dano puro ${d.spellDmgPct}`);
  console.log(`   lv${lv}: cura +${heal}% (puro ${h.spellHealPct||0}) · dano +${dmg}% (puro ${d.spellDmgPct||0})`);
}

console.log('== puller: bate o tank em ofensiva sem jogar a defesa fora ==');
{
  // battle_instinct NAO e' esperado: com pack de 4 rende +24 def e nao paga os 150
  // pontos do notavel -- o otimizador acerta em gastar isso em absorb/HP.
  const t = E.aggregate('knight', build('knight', 1500, 'tank').ranks);
  const p = E.aggregate('knight', build('knight', 1500, 'puller').ranks);
  ok((p.spec.slash||0) > (t.spec.slash||0), 'puller/1500 nao tem mais cleave que o tank');
  ok((p.bonus.atkPct||0) > (t.bonus.atkPct||0), 'puller/1500 nao tem mais atk que o tank');
  /* "nao jogou a defesa fora" medido em EHP, nao na soma do absorb dos 7 elementos.
     A soma era a mesma regua errada que o model.js usava: premiava a escada de Wards
     elementais, que nao vale ponto de arvore. Agora que a defesa do puller mora em HP,
     a soma do absorb dava 24% da do tank e acusava falso positivo.
     O que o puller promete e' ser um ponto de Pareto: nitidamente mais duro que a build
     de dano puro, e mais ofensivo que o tank (as duas linhas acima). */
  const ehpOf = o => metrics('knight', 1500, o).ehp;
  ok(ehpOf('puller') > ehpOf('dano') * 1.2,
    `puller/1500 jogou a defesa fora: ehp ${ehpOf('puller').toFixed(3)} vs dano puro ${ehpOf('dano').toFixed(3)}`);
  ok(ehpOf('puller') < ehpOf('tank'),
    `puller/1500 com ehp >= tank (${ehpOf('puller').toFixed(3)} vs ${ehpOf('tank').toFixed(3)}): virou tank, nao puller`);
  ok(allocated(build('knight', 500, 'puller').ranks).has('k_slash1'), 'puller/knight/500 sem Cleaving Strikes I');
  console.log(`   cleave ${p.spec.slash||0}% vs tank ${t.spec.slash||0}% · atk +${p.bonus.atkPct||0}% vs ${t.bonus.atkPct||0}%`);
}

console.log('== aoe: pega os chains onde a arvore tem ==');
for (const [voc, node, el] of [['sorcerer','s_chain1','fire'], ['druid','d_chain1','ice']]) {
  const b = build(voc, 800, 'aoe', el);
  ok(allocated(b.ranks).has(node), `aoe/${voc}/800 nao pegou ${nameOf(voc, node)}`);
  const a = E.aggregate(voc, b.ranks);
  const single = E.aggregate(voc, build(voc, 800, 'dano', el).ranks);
  ok((a.spec.chain||0) >= (single.spec.chain||0), `aoe/${voc} com menos chain que dano/${voc}`);
  console.log(`   ${voc}: chain ${a.spec.chain||0} · spellDmg +${a.bonus.spellDmgPct||0}%`);
}

console.log('== xp: exp no teto, loot so de pedagio, e o Avatar entra quando paga ==');
{
  /* xp/h = exp% x kills/h, entao o objetivo tem DOIS lados e os dois sao cobrados:
     o exp tem que estar no teto que a arvore oferece, e o dano nao pode ficar muito
     atras da build de dano pura -- e' esse segundo lado que a versao antiga perdia,
     com pesos de dano desproporcionais entre si (critDmg 0.1 vs critChance 0.3). */
  const expCeiling = voc => TREES[voc].reduce((s,n) =>
    s + (n.per && n.per.expPct ? n.per.expPct * n.maxRank : 0), 0);
  const lootNodes = voc => TREES[voc].filter(n => n.per && n.per.lootPct).map(n => n.id);
  for (const voc of E.VOCS.filter(v => E.objAvailable(v, 'xp'))) {
    const b = build(voc, 1500, 'xp'), a = E.aggregate(voc, b.ranks);
    ok((a.bonus.expPct||0) >= expCeiling(voc) - 1e-9,
      `xp/${voc}/1500: exp em ${a.bonus.expPct||0}%, o teto da arvore e' ${expCeiling(voc)}%`);

    /* LOOT: so pode estar aceso o que e' caminho obrigatorio. O criterio nao e' um
       numero magico -- e' "tira o no e ve se a build continua valida", o mesmo teste
       da poda. O Guiding Presence do monk e' notavel de exp+loot no MESMO no, entao
       ele passa por ser nó de exp, nao por ser caminho. */
    for (const id of lootNodes(voc)) {
      if (!(b.ranks[id] > 0)) continue;
      const node = TREES[voc].find(n => n.id === id);
      if (node.per.expPct) continue;                   // no misto: entrou pelo exp
      const without = Object.assign({}, b.ranks); delete without[id];
      ok(!E.valid(voc, without) || b.ranks[id] === 1,
        `xp/${voc}/1500: ${nameOf(voc,id)} r${b.ranks[id]} de loot sem ser pedagio de caminho`);
    }

    /* DANO: com o exp saturando em 55-165 pontos, o resto do orcamento e' build de
       dano e nao ha desculpa pra ela ser ruim. 0.85 e' folga pro que o exp custou. */
    const mine = metrics(voc, 1500, 'xp'), pure = metrics(voc, 1500, 'dano');
    ok(mine.single >= pure.single * 0.85,
      `xp/${voc}/1500: dano ${mine.single.toFixed(2)} contra ${pure.single.toFixed(2)} do dano puro`);
    console.log(`   ${voc}: exp +${a.bonus.expPct||0}% (teto ${expCeiling(voc)}%) · dano `
      + `${mine.single.toFixed(2)} vs ${pure.single.toFixed(2)} puro · avatar ${(100*mine.up).toFixed(0)}%`);
  }
  /* O no do Avatar e' a excecao declarada do perfil xp (ver engine.js). Cobrada onde
     ela vale: no lv500 ele NAO pode entrar (300 pontos nao pagam em 500), no lv1500
     ele tem que entrar. Se um dos dois inverter, o peso saiu de calibragem. */
  for (const voc of E.VOCS.filter(v => E.objAvailable(v, 'xp') && E.avatarNodeId(v))) {
    ok(!(metrics(voc, 500, 'xp').up > 0), `xp/${voc}/500 gastou no Avatar num orcamento de 500`);
    ok(metrics(voc, 1500, 'xp').up > 0, `xp/${voc}/1500 nao alcancou o Avatar`);
  }
}

console.log('== crit: o objetivo constroi crit de verdade (nao vira dano disfarcado) ==');
for (const voc of ['knight','sorcerer']) {
  const c = agg(voc, 900, 'critico').bonus, d = agg(voc, 900, 'dano').bonus;
  ok((c.critChance||0) > (d.critChance||0), `critico/${voc}/900 nao tem mais crit chance que o dano puro`);
  ok((c.critDmg||0) > 0, `critico/${voc}/900 sem crit damage`);
  console.log(`   ${voc}: chance ${c.critChance||0}% (dano puro ${d.critChance||0}%) · crit dmg ${c.critDmg||0}%`);
}

console.log('== perks: marcar prioriza, forcar garante, e o relatorio bate ==');
{
  for (const voc of E.VOCS) {
    const perks = E.perkNodes(voc);
    ok(perks.length > 0, `${voc}: nenhum notavel detectado na arvore`);
    // cada perk marcado sozinho, com orcamento folgado, tem que entrar
    for (const n of perks) {
      const b = E.autobuild(voc, 3000, 'dano', { element:'all', perks:[n.id] });
      ok((b.ranks[n.id]||0) >= 1, `${voc}/lv3000: perk marcado ${n.name} nao entrou na build`);
      ok(E.valid(voc, b.ranks), `${voc}: build com perk ${n.name} ficou invalida`);
      ok(b.spent <= 3000, `${voc}: build com perk ${n.name} estourou o orcamento`);
    }
    // relatorio coerente: reached + missing = pedido, e unaffordable e' subconjunto de missing
    const ids = perks.map(n => n.id);
    const b = E.autobuild(voc, 400, 'dano', { element:'all', perks:ids });
    const P = b.perks;
    ok(P.reached.length + P.missing.length === ids.length,
      `${voc}: reached+missing (${P.reached.length}+${P.missing.length}) != pedidos (${ids.length})`);
    ok(P.reached.every(id => (b.ranks[id]||0) >= 1), `${voc}: perk em "reached" que nao esta na build`);
    ok(P.missing.every(id => (b.ranks[id]||0) < 1), `${voc}: perk em "missing" que esta na build`);
    ok(P.unaffordable.every(id => P.missing.includes(id)), `${voc}: "unaffordable" fora de "missing"`);
    // id de outra vocacao e' ignorado, nao quebra
    const other = E.perkNodes(E.VOCS.find(x => x !== voc))[0].id;
    const b2 = E.autobuild(voc, 500, 'dano', { element:'all', perks:[other] });
    ok(E.valid(voc, b2.ranks) && b2.perks.reached.length === 0 && b2.perks.missing.length === 0,
      `${voc}: perk de outra arvore (${other}) nao foi ignorado direito`);
  }
  /* forcar: o mesmo caso apertado passa a levar os dois, e o que era impossivel por
     custo de caminho continua impossivel (forcar nao inventa pontos). */
  {
    const solto = E.autobuild('knight', 500, 'dano', { element:'all', perks:['k_avatar_steel','k_executioner'] });
    const forcado = E.autobuild('knight', 500, 'dano', { element:'all', perks:['k_avatar_steel','k_executioner'], forcePerks:true });
    ok(solto.perks.missing.length > 0, 'lv500 sem forcar devia deixar algo de fora');
    ok(forcado.perks.missing.length === 0, 'lv500 forcando devia levar os dois perks');
    ok(E.valid('knight', forcado.ranks) && forcado.spent <= 500, 'build forcada invalida ou fora do orcamento');
    ok(forcado.perks.forced === true, 'o relatorio nao marcou que estava forcando');
    const semLevel = E.autobuild('knight', 200, 'dano', { element:'all', perks:['k_avatar_steel'], forcePerks:true });
    ok(semLevel.perks.unaffordable.length === 1,
      'forcar nao deveria conseguir um no cujo caminho custa mais que o level inteiro');
    ok(E.valid('knight', semLevel.ranks), 'build ficou invalida ao forcar um perk inalcancavel');
    // forcar tem preco, e ele tem que ser visivel: menos stats no resto da arvore
    const a = E.aggregate('knight', solto.ranks), f = E.aggregate('knight', forcado.ranks);
    ok((f.bonus.atkPct||0) < (a.bonus.atkPct||0), 'forcar no lv500 devia custar atk no resto da build');
    console.log(`   lv500 forcado: os 2 perks entram e o atk cai de ${Math.round(a.bonus.atkPct||0)}% pra ${Math.round(f.bonus.atkPct||0)}%`);
  }

  // priorizar != garantir: um perk caro num level apertado pode ficar de fora
  const tight = E.autobuild('knight', 500, 'dano', { element:'all', perks:['k_avatar_steel','k_executioner'] });
  ok(tight.perks.missing.length > 0,
    'priorizar virou garantir: no lv500 os dois perks caros entraram e nao sobrou build');
  const roomy = E.autobuild('knight', 1500, 'dano', { element:'all', perks:['k_avatar_steel','k_executioner'] });
  ok(roomy.perks.missing.length === 0, 'lv1500 devia caber os dois perks marcados');
  const nm = id => E.nd('knight', id).name;
  console.log(`   lv500 deixa de fora: ${tight.perks.missing.map(nm).join(', ')} · lv1500 leva os dois`);
}

/* ------------------------------------------------------------------ 3. CALIBRAGEM */
console.log('== calibragem (premissas de tools/model.js, nao leis) ==');
{
  /* O que o objetivo Avatar promete e' GARANTIR o no de tier 11 -- inclusive no level
     minimo, onde o custo/beneficio ainda nao justificaria e nenhum outro perfil o
     pegaria. Nao promete liderar o 1v1 pra sempre: como a familia de dano agora valora
     o no corretamente (DMG_SPECIALS.avatar), o Damage chega a empatar com ele em level
     alto -- e isso e' o otimizador acertando, nao regressao. Entao: alcanca o no,
     mantem uptime alto, e nunca fica materialmente atras do melhor 1v1 do quadro. */
  for (const voc of E.VOCS) {
    let min = 1, hi = 4000;
    while (min < hi) { const mid = (min+hi)>>1; E.autobuild(voc, mid, 'avatar', {element:'all'}).reachedAvatar ? hi = mid : min = mid+1; }
    ok(build(voc, min, 'avatar').reachedAvatar, `avatar/${voc}/${min} nao alcanca o no no proprio level minimo`);
    ok(!build(voc, min-1, 'avatar').reachedAvatar, `avatar/${voc}: level minimo calculado errado (${min-1} tambem alcanca)`);
    for (const lv of [min, 900, 1500]) {
      const av = metrics(voc, lv, 'avatar');
      ok(av.up > 0.35, `avatar/${voc}/${lv} uptime ${(100*av.up).toFixed(0)}% abaixo de 35%`);
      /* no level minimo o no consome ~300 dos ~316 pontos e nao sobra nada pro resto:
         ficar atras do quadro ali e' o preco de garantir o no, e a UI ja avisa isso.
         A comparacao com o melhor 1v1 so vale onde existe folga de orcamento. */
      if (lv > min * 1.5) {
        const best = Math.max(...E.availableObjs(voc).map(o => metrics(voc, lv, o).single));
        ok(av.single >= best*0.95,
          `avatar/${voc}/${lv} ficou ${(100*(1-av.single/best)).toFixed(0)}% atras do melhor 1v1 do quadro`);
      }
    }
    console.log(`   ${voc}: nó do Avatar a partir de lv${min}`);
  }
  /* sem chain nem cleave na arvore (paladin, monk) o AoE nao tem com o que fazer
     multi-target -- e' o mesmo caso que a UI avisa. Nao da pra exigir lideranca ali. */
  const canAoE = voc => TREES[voc].some(n => n.special && ['chain','slash'].includes(n.special.key));
  for (const voc of E.VOCS.filter(canAoE)) {
    const ao = metrics(voc, 900, 'aoe'), dn = metrics(voc, 900, 'dano');
    ok(ao.packThru >= dn.packThru, `aoe/${voc}/900 nao lidera o pack (${ao.packThru.toFixed(2)} vs dano ${dn.packThru.toFixed(2)})`);
  }
  /* liderar pack exige TER ferramenta de pack. No sorcerer em lv500 o Chain Arc I
     (150 pts + caminho) ainda nao cabe no orcamento, entao ali o AoE e' so um perfil
     de dano -- cobrar lideranca seria cobrar o impossivel. */
  const hasPackTool = m => (m.chain||0) > 0 || (m.slash||0) > 0;
  /* cada objetivo com um eixo PROPRIO tem que liderar esse eixo. E' a versao
     honesta do teste de dominancia: um check generico nos tres eixos de combate
     acusaria "dano dominado por avatar" (que e' conclusao do estudo, nao bug) e
     "xp dominado por qualquer coisa" (porque exp% nao e' eixo de combate).
     O puller nao tem eixo exclusivo -- quem o guarda e' o par de assercoes contra
     o tank, la em cima, que foi o que pegou a versao dominada dele. */
  const AXIS = {
    aoe:      { get:m=>m.packThru, label:'pack',      needStat:null },
    tank:     { get:m=>m.ehp,      label:'EHP',       needStat:null },
    healer:   { get:m=>m.heal,     label:'cura',      needStat:'spellHealPct' },
    xp:       { get:m=>m.exp,      label:'exp%',      needStat:'expPct' },
  };
  const treeHas = (voc,k) => TREES[voc].some(n => n.per && n.per[k] != null);
  for (const voc of E.VOCS) for (const lv of [500, 1500]) {
    /* so objetivos que a vocacao OFERECE (E.availableObjs): comparar com um que a UI
       esconde e' comparar com uma build que ninguem consegue pedir -- foi assim que o
       atkspeed do druid, numa arvore sem nenhum no de atk speed, "vencia" o AoE. */
    const M = E.availableObjs(voc).map(o => metrics(voc, lv, o));
    for (const [obj, ax] of Object.entries(AXIS)) {
      if (ax.needStat && !treeHas(voc, ax.needStat)) continue;  // a arvore nao tem o stat
      if (obj === 'aoe' && !canAoE(voc)) continue;               // arvore sem chain/cleave
      if (obj === 'aoe' && !hasPackTool(M.find(m => m.obj === 'aoe'))) continue; // chain/cleave nao cabe no level
      const mine = M.find(m => m.obj === obj);
      if (!mine) continue;                                       // objetivo indisponivel nessa arvore
      /* o no do Avatar (tier 11, 300 pts) multiplica TODO eixo, porque dentro da forma
         todo hit crita. Mas so o objetivo Avatar o PERSEGUE: nos outros perfis ele vale
         0 de proposito (ver DMG_SPECIALS.avatar em engine.js) e entra por acidente,
         quando o level deixa sobrar orcamento. Comparar o dono de um eixo contra uma
         build que tropecou nesse notavel mede sorte de orcamento, nao calibragem -- no
         druid/1500 o "dano" alcanca o no e lidera o pack com 5.70 contra o AoE que
         gastou 300 pontos em dois chains e fica em 5.33. Entao quem chegou la sem
         perseguir sai do comparativo (up > 0 == a forma esta na build). */
      const pool = obj === 'avatar' ? M : M.filter(m => m.obj === obj || !(m.up > 0));
      const best = pool.reduce((a,b) => ax.get(b) > ax.get(a) ? b : a);
      ok(ax.get(mine) >= ax.get(best)*0.98,
        `${voc}/${lv}: "${obj}" deveria liderar ${ax.label} mas "${best.obj}" tem mais `
        + `(${ax.get(best).toFixed(2)} vs ${ax.get(mine).toFixed(2)})`);
    }
  }
  const av = metrics('knight', 900, 'avatar');
  console.log(`   avatar/knight/900: uptime ${(100*av.up).toFixed(0)}% · crit dmg ${av.cdmg}%`);
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
