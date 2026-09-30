/* ============================================================================
   check-bosses-view.js — roda a aba Bosses contra um DOM falso.

       node tools/check-bosses-view.js      (sai != 0 se algo falhar)

   A aba nao tinha verificacao nenhuma ate ganhar o LOOT dos bosses. Cobre o que
   a tela promete: todo card renderiza, o botao de loot abre a tabela de drop com
   chance e preco, a busca acha boss pelo ITEM, e a ordenacao por valor do loot
   poe na frente quem rende mais gold por morte. Sem loot.js a aba continua de pe.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PUB = path.join(__dirname, '..', 'public');

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function makeEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', checked: false, dataset: {}, handlers: {},
    parentElement: { classList: { add() {}, remove() {} } },
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    fire(ev, e) { for (const fn of this.handlers[ev] || []) fn(e || {}); },
  };
}
/* clique delegado: o handler pergunta `closest(seletor)` pra cada tipo de botao */
const click = (sel, node) => ({ target: { closest: s => (s === sel ? node : null) } });

function run(opts) {
  opts = opts || {};
  const els = {};
  const get = id => (els[id] = els[id] || makeEl(id));
  ['bosses-grid','boss-search','boss-sort','boss-favs','boss-suggest','favs-label','boss-count'].forEach(get);
  els['boss-sort'].value = opts.sort || 'name';
  const store = {};
  const sandbox = { console, window: {},
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { getElementById: id => els[id] || null } };
  sandbox.window.window = sandbox.window;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  const files = opts.noLoot ? ['bosses.js', 'bosses-view.js']
    : ['hunts.js', 'loot.js', 'hunt-model.js', 'bosses.js', 'bosses-view.js'];
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sandbox, { filename: f });
  return { els, win: sandbox.window, html: () => els['bosses-grid'].innerHTML,
    order: () => [...els['bosses-grid'].innerHTML.matchAll(/data-fav="([^"]+)"/g)].map(m => m[1]) };
}

console.log('== a aba abre e todo boss vira card ==');
const r = run();
const B = r.win.BOSSES;
{
  const cards = (r.html().match(/class="boss"/g) || []).length;
  ok(cards === B.length, `deviam ser ${B.length} cards, vieram ${cards}`);
  ok(r.els['boss-count'].textContent === `${B.length} bosses`, 'o contador bate');
  ok((r.html().match(/class="loot-toggle/g) || []).length === B.length, 'todo card tem o botao de loot');
  ok(!r.html().includes('undefined') && !r.html().includes('NaN'), 'nada de undefined/NaN nos cards');
}

console.log('== o botao de loot abre a tabela de drop ==');
{
  const r2 = run();
  ok(!r2.html().includes('bl-list'), 'fechado por padrao');
  r2.els['bosses-grid'].fire('click', click('.loot-toggle', { dataset: { loot: 'phosphorus' } }));
  const h = r2.html();
  ok(h.includes('bl-list'), 'abriu a lista do Phosphorus');
  ok(h.includes('figurine of phosphorus') && h.includes('2.0%'), 'com o item e a chance do jogo (figurine 2%)');
  ok(h.includes('425k<small> / kill</small>'), 'o botao mostra o gold medio por morte');
  ok((h.match(/class="bl-list"/g) || []).length === 1, 'so o card clicado abre');
  r2.els['bosses-grid'].fire('click', click('.loot-toggle', { dataset: { loot: 'phosphorus' } }));
  ok(!r2.html().includes('bl-list'), 'clicar de novo fecha');
}

console.log('== busca acha boss pelo item, ordenacao por valor do loot ==');
{
  const r3 = run();
  r3.els['boss-search'].value = 'moonsilver bow';
  r3.els['boss-search'].fire('input');
  ok(r3.order().length === 1 && r3.order()[0] === 'phosphorus', `"moonsilver bow" devia achar so o Phosphorus, veio ${r3.order().join(',')}`);
  /* e a busca parcial traz todo boss que solta algo com aquele nome */
  r3.els['boss-search'].value = 'moonsilver';
  r3.els['boss-search'].fire('input');
  const HM3 = r3.win.HuntModel, L3 = r3.win.LOOT;
  ok(r3.order().length > 1 && r3.order().every(id => HM3.bossLoot(id, L3).items.some(it => it.name.includes('moonsilver'))),
    `"moonsilver" devia trazer so bosses que soltam moonsilver, veio ${r3.order().join(',')}`);

  const r4 = run({ sort: 'loot' });
  const HM = r4.win.HuntModel, L = r4.win.LOOT;
  const best = B.slice().sort((a, b) => HM.bossLoot(b.id, L).gold - HM.bossLoot(a.id, L).gold)[0].id;
  ok(r4.order()[0] === best, `ordenado por loot, o primeiro devia ser ${best}, veio ${r4.order()[0]}`);
}

console.log('== sem loot.js a aba continua de pe ==');
{
  const r5 = run({ noLoot: true });
  ok((r5.html().match(/class="boss"/g) || []).length === r5.win.BOSSES.length, 'os cards renderizam sem loot');
  ok(!r5.html().includes('loot-toggle'), 'e sem botao de loot quebrado');
}

console.log('== todo card diz com que elemento bater ==');
{
  ok(B.every(b => b.resist), 'todo boss tem resist no dado');
  ok((r.html().match(/class="boss-hit"/g) || []).length === B.length, 'todo card tem o "Hit it with"');
  const cardOf = id => { const c = r.html().split('class="boss"').find(c => c.includes(`data-fav="${id}"`)); return c.slice(c.indexOf('boss-hit')); };
  /* Black Vixen: ice -40, o resto 50 -> ice sozinho no topo, destacado */
  ok(/el-ice best[^>]*>ice <b class="up">140%/.test(cardOf('black_vixen')), 'Black Vixen: ice 140% destacado');
  /* Abyssador: physical, earth e holy empatam em 100% -> tres chips, nenhum destaque */
  const ab = cardOf('abyssador');
  ok(['physical','earth','holy'].every(el => ab.includes(`el-${el}"`)) && !ab.includes(' best'), 'Abyssador: empate sem destaque');
}

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
