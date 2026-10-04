/* ============================================================================
   check-hunts-view.js — roda a ABA Hunts de verdade, num DOM de mentira.

       node tools/check-hunts-view.js        (sai != 0 se algo falhar)

   O check-hunt-model.js prova a conta; este prova que a TELA usa a conta sem
   explodir. Sem jsdom: o stub abaixo implementa so o que public/hunts-view.js
   toca (getElementById, innerHTML, addEventListener, localStorage, closest) e
   guarda os handlers, pra dar pra simular clique, digitacao e change.

   A aba: a party vem da aba Builds (3 primeiros visiveis, um lider), o XP por
   clear e' o da PARTY (soma das fatias), as hunts escolhidas viram colunas de um
   comparativo, e o XP/h sai do tempo por clear que o jogador salva.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PUB = path.join(__dirname, '..', 'public');
const HUNTS = JSON.parse(fs.readFileSync(path.join(PUB, '..', 'data', 'hunts.json'), 'utf8'));
const CHARMS = JSON.parse(fs.readFileSync(path.join(PUB, '..', 'data', 'charms.json'), 'utf8'));

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

/* ------------------------------------------------------------------ DOM stub */
function makeEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', hidden: false, checked: false, disabled: false,
    dataset: {}, handlers: {},
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    setAttribute(k, v) { this['attr_' + k] = v; },
    fire(ev, e) { for (const fn of this.handlers[ev] || []) fn(e || {}); },
  };
}
/* evento com o `closest` que o handler espera */
const clickOn = (sel, node) => ({ target: { closest: s => (s === sel ? node : null) } });

const IDS = ['hunts-table','hunt-chars','hunt-leader','hunt-vip','hunt-event','hunt-event-v','hunt-levelwrap',
  'hunt-level','hunt-q','hunt-sug','hunt-compare','hunt-only','hunt-list-who','charm-cfg-toggle','charm-cfg','navtabs'];
function run(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.storage || {});
  const els = {};
  IDS.forEach(id => { els[id] = makeEl(id); });
  els['hunt-level'].value = String(opts.level || 900);
  els['hunt-vip'].checked = true; els['hunt-event'].checked = true;
  els['charm-cfg'].hidden = true;
  const sandbox = {
    console, Date, Promise,
    window: {},
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { getElementById: id => els[id] || null },
  };
  if (opts.fetch) sandbox.fetch = opts.fetch;
  sandbox.window.window = sandbox.window;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  for (const f of ['trees.js', 'engine.js', 'xprates.js', 'hunts.js', 'charms.js', ...(opts.loot ? ['loot.js'] : []), 'hunt-model.js', 'hunts-view.js'])
    vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sandbox, { filename: f });
  return { els, store, win: sandbox.window };
}

/* a party que o jogador usa: tres de dano no lv1500 (nenhum pega XP% na arvore,
   entao o bonus e' so o que o teste liga) + um quarto escondido na aba Builds */
const slot = (label, voc, level, extra) => Object.assign({ label, voc, level, obj: 'dano', element: null, perks: [] }, extra || {});
const TRIO = JSON.stringify({ slots: [
  slot('Knight', 'knight', 1500), slot('Elder Druid', 'druid', 1500), slot('Master Sorcerer', 'sorcerer', 1500),
  slot('Royal Paladin', 'paladin', 1500, { shown: false }) ] });
const SOLO = JSON.stringify({ slots: [slot('Knight', 'knight', 1500)] });
const B = r => r.els['hunts-table'].innerHTML;
const C = r => r.els['hunt-compare'].innerHTML;
const ids = html => [...html.matchAll(/class="ht-row[^"]*" data-hunt="([^"]+)"/g)].map(m => m[1]);
const listXp = (html, id) => {
  const i = html.indexOf(`data-hunt="${id}"`);
  const m = html.slice(i).match(/class="num xpc" data-xp="(\d+)"/);
  return m ? +m[1] : NaN;
};
const H = id => HUNTS.find(h => h.id === id);
const pickEv = id => ({ target: { closest: s => (s === '[data-pick]' ? { dataset: { pick: id } } : null) } });

console.log('== a aba carrega: party da aba Builds, lista, comparativo vazio ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': TRIO } });
  ok(ids(B(r)).length === HUNTS.length, `a lista devia ter as ${HUNTS.length} hunts`);
  const pc = r.els['hunt-chars'].innerHTML;
  ok((pc.match(/class="pc[ "]/g) || []).length === 3, 'tres cartoes: o slot escondido na aba Builds nao aparece');
  ok(!pc.includes('Royal Paladin'), 'o Paladin com shown:false fica de fora');
  ok(pc.includes('lv 1,500'), 'o level e o da aba Builds');
  ok(pc.includes('leader · 40%') && (pc.match(/30% of the XP/g) || []).length === 2, 'trio: lider 40%, os outros 30% cada');
  ok(r.els['hunt-levelwrap'].hidden === true, 'com personagem, o campo de level some');
  ok(r.els['hunt-leader'].innerHTML.includes('Elder Druid'), 'o seletor de lider lista a party');
  ok(C(r).includes('hcmp-empty'), 'sem hunt escolhida, o comparativo diz como comecar');
  ok(!B(r).includes('undefined') && !B(r).includes('NaN'), 'a lista nao tem undefined/NaN');
}

console.log('== sem personagem: a aba funciona com o level do campo ==');
{
  const r = run({ storage: {}, level: 900 });
  ok(r.els['hunt-levelwrap'].hidden === false, 'sem personagem, o campo de level aparece');
  ok(r.els['hunt-chars'].innerHTML.includes('Builds'), 'e o topo manda pra aba Builds');
  ok(ids(B(r)).length === HUNTS.length, 'a lista continua inteira');
}

/* O que o jogador mediu in-game (03/10/2026, trio, VIP, evento de +25%): o XP DA
   PARTY por clear. Bloated ~4.3M, Wandering Pillar ~5.3M, Infernal Demon ~2.2M.
   Antes do multiplicador de XP das hunts de lv1500 o site dizia ~1.05M na Bloated.
   A previsao tem que cair a menos de 10% de cada um. */
console.log('== calibracao: XP da party por clear bate com o que o jogador viu ==');
{
  const extra = JSON.stringify({ 'knight|Knight': '25', 'druid|Elder Druid': '25', 'sorcerer|Master Sorcerer': '25' });
  const r = run({ storage: { 'idlezada.builds.v3': TRIO, 'idlezada.huntXpExtra.v1': extra } });
  for (const [id, seen] of [['bloatedmanmaggot-cave', 4.3e6], ['wanderingpillar-cave', 5.3e6], ['infernalmdemon-cave', 2.2e6]]) {
    const v = listXp(B(r), id);
    ok(Math.abs(v / seen - 1) < 0.10, `${id}: previsao ${Math.round(v / 1e4) / 100}M devia ficar a <10% dos ${seen / 1e6}M vistos`);
  }
  const h = H('bloatedmanmaggot-cave');
  ok(Math.abs(listXp(B(r), h.id) - h.xpPerClear * 0.9 * 1.35) < 3, 'trio sem XP de arvore: a soma das fatias e o clear inteiro (40+30+30)');
}

console.log('== bonus: VIP padrao, extra por personagem ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': SOLO } });
  const h = H('bloatedmanmaggot-cave');
  ok(Math.abs(listXp(B(r), h.id) - h.xpPerClear * 0.9 * 1.1) < 2, 'solo lv1500: base x 0.9 x VIP 1.1');
  ok(r.els['hunt-chars'].innerHTML.includes('+10%'), 'o cartao mostra o bonus total');
  r.els['hunt-chars'].fire('change', { target: { dataset: { extra: '0' }, value: '15' } });
  ok(JSON.parse(r.store['idlezada.huntXpExtra.v1'])['knight|Knight'] === '15', 'o extra fica guardado por personagem');
  ok(Math.abs(listXp(B(r), h.id) - h.xpPerClear * 0.9 * 1.25) < 2, 'VIP 10 + extra 15 SOMAM (x1.25)');
  ok(r.els['hunt-chars'].innerHTML.includes('+25%'), 'e o cartao soma o extra');
  r.els['hunt-vip'].checked = false; r.els['hunt-vip'].fire('change');
  ok(Math.abs(listXp(B(r), h.id) - h.xpPerClear * 0.9 * 1.15) < 2, 'desligar o VIP tira os 10%');
  ok(r.store['idlezada.huntVip.v1'] === 'false', 'e fica guardado');
}

console.log('== party: o lider escolhido leva a fatia maior ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': TRIO } });
  r.els['hunt-leader'].value = 'druid|Elder Druid'; r.els['hunt-leader'].fire('change');
  const pc = r.els['hunt-chars'].innerHTML;
  const druid = pc.slice(pc.indexOf('Elder Druid'));
  const next = druid.search(/class="pc[ "]/);
  ok(druid.indexOf('leader · 40%') >= 0 && (next < 0 || druid.indexOf('leader · 40%') < next), 'o Druid passa a ser o lider');
  ok(JSON.parse(r.store['idlezada.huntLeader.v1']) === 'druid|Elder Druid', 'o lider fica guardado');
}

console.log('== comparar: busca sugere, + fixa, a tabela lado a lado ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': TRIO } });
  r.els['hunt-q'].value = 'pillar'; r.els['hunt-q'].fire('input');
  ok(r.els['hunt-sug'].innerHTML.includes('data-pick="wanderingpillar-cave"'), 'digitar sugere a hunt');
  ok(ids(B(r)).length > 0 && ids(B(r)).every(id => /pillar/i.test(H(id).name) || H(id).monsters.some(m => /pillar/i.test(m.name))), 'e a lista filtra junto');
  r.els['hunt-sug'].fire('click', clickOn('[data-pick]', { dataset: { pick: 'wanderingpillar-cave' } }));
  ok(r.els['hunt-q'].value === '', 'escolher limpa a busca');
  r.els['hunts-table'].fire('click', pickEv('bloatedmanmaggot-cave'));
  r.els['hunts-table'].fire('click', pickEv('infernalmdemon-cave'));
  const c = C(r);
  ok((c.match(/class="hc-hunt"/g) || []).length === 3, 'tres colunas no comparativo');
  for (const k of ['XP per clear', 'XP per hour', 'Your clear', 'Each one gets', 'Hit with', 'Protect from', 'Gold per clear'])
    ok(c.includes(`>${k}</th>`), `o comparativo tem a linha "${k}"`);
  ok((c.match(/class="hc-who"/g) || []).length === 9, 'a divisao mostra os 3 personagens em cada uma das 3 hunts');
  ok(c.includes('hc-xp best'), 'a hunt de mais XP por clear vem marcada');
  ok(!c.includes('undefined') && !c.includes('NaN'), 'o comparativo nao tem undefined/NaN');
  ok(B(r).includes('class="pick on"'), 'na lista, as escolhidas ficam marcadas');
  ok(JSON.parse(r.store['idlezada.huntPicks.v1']).length === 3, 'as escolhidas ficam guardadas');
  r.els['hunt-compare'].fire('click', clickOn('[data-unpick]', { dataset: { unpick: 'infernalmdemon-cave' } }));
  ok((C(r).match(/class="hc-hunt"/g) || []).length === 2, 'o x tira a hunt do comparativo');
  r.els['hunts-table'].fire('click', pickEv('bloatedmanmaggot-cave'));
  ok((C(r).match(/class="hc-hunt"/g) || []).length === 1, 'clicar no ✓ da lista tira tambem');
}

console.log('== sua run: tempo e XP salvos viram XP/h ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': TRIO, 'idlezada.huntPicks.v1': JSON.stringify(['bloatedmanmaggot-cave', 'wanderingpillar-cave']) } });
  ok(C(r).includes('data-run-min="bloatedmanmaggot-cave"') && C(r).includes('data-run-s="bloatedmanmaggot-cave"'), 'o tempo e minutos + segundos');
  r.els['hunt-compare'].fire('change', { target: { dataset: { runMin: 'bloatedmanmaggot-cave' }, value: '4' } });
  r.els['hunt-compare'].fire('change', { target: { dataset: { runS: 'bloatedmanmaggot-cave' }, value: '30' } });
  r.els['hunt-compare'].fire('change', { target: { dataset: { runXp: 'bloatedmanmaggot-cave' }, value: '4,3' } });
  const saved = JSON.parse(r.store['idlezada.huntRuns.v1'])['bloatedmanmaggot-cave'];
  ok(saved.sec === 270 && saved.xp === 4300000, `4 m + 30 s e "4,3" (KK) viram 270s e 4.300.000 (veio ${JSON.stringify(saved)})`);
  ok(C(r).includes('value="4.3"'), 'o XP salvo volta pro campo em KK');
  ok(C(r).includes('4.3KK'), 'e aparece em KK');
  ok(listXp(B(r), 'bloatedmanmaggot-cave') === 4300000, 'na lista, o XP salvo ganha da previsao');
  const xph = Math.round(4300000 * 3600 / 270);
  ok(B(r).includes(`data-xph="${xph}"`), `XP/h = 4.3KK x 3600 / 270s = ${xph}`);
  ok(C(r).includes('hc-xph best'), 'a unica com tempo e a melhor em XP/h');
  ok(C(r).includes('yours · forecast'), 'o XP salvo aparece contra a previsao');
  ok((C(r).match(/\/h<\/em>/g) || []).length === 3, 'com tempo, cada personagem mostra o seu XP/h');
  r.els['hunt-compare'].fire('change', { target: { dataset: { runMin: 'bloatedmanmaggot-cave' }, value: '2' } });
  ok(JSON.parse(r.store['idlezada.huntRuns.v1'])['bloatedmanmaggot-cave'].sec === 150, 'trocar so os minutos mantem os segundos (2:30)');

  r.els['hunt-compare'].fire('change', { target: { dataset: { runMin: 'bloatedmanmaggot-cave' }, value: '' } });
  r.els['hunt-compare'].fire('change', { target: { dataset: { runS: 'bloatedmanmaggot-cave' }, value: '' } });
  r.els['hunt-compare'].fire('change', { target: { dataset: { runXp: 'bloatedmanmaggot-cave' }, value: '' } });
  ok(!JSON.parse(r.store['idlezada.huntRuns.v1'])['bloatedmanmaggot-cave'], 'apagar os campos esquece a hunt');

  for (const [s, want] of [['4.3', 4300000], ['5,2', 5200000], ['4.3kk', 4300000], ['850k', 850000], ['4.300.000', 4300000], ['1,25kk', 1250000]]) {
    r.els['hunt-compare'].fire('change', { target: { dataset: { runXp: 'minotaur' }, value: s } });
    ok((JSON.parse(r.store['idlezada.huntRuns.v1']).minotaur || {}).xp === want, `XP "${s}" devia virar ${want}`);
  }
}

console.log('== lista: cabecalho ordena, "so as que eu entro" filtra pelo lider ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': JSON.stringify({ slots: [slot('Knight', 'knight', 900)] }) } });
  r.els['hunts-table'].fire('click', { target: { closest: s => (s === '.th' ? { dataset: { sort: 'gold' } } : null) } });
  const byGold = HUNTS.slice().sort((a, b) => b.goldPerClear - a.goldPerClear)[0].id;
  ok(ids(B(r))[0] === byGold, `ordenar por gold poe a de mais gold primeiro (${byGold})`);
  ok(JSON.parse(r.store['idlezada.huntSort.v1']) === 'gold', 'a ordem fica guardada');
  r.els['hunt-only'].checked = true; r.els['hunt-only'].fire('change');
  ok(ids(B(r)).length === HUNTS.filter(h => h.minLevel <= 900).length, 'no 900 sobram so as de level <= 900');
  r.els['hunt-q'].value = 'zzz-nada'; r.els['hunt-q'].fire('input');
  ok(B(r).includes('ht-empty'), 'busca sem resultado diz isso');
}

console.log('== abrir uma hunt desenha o plano de charms do lider (sem DPS) ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': TRIO } });
  r.els['hunts-table'].fire('click', clickOn('.ht-row', { dataset: { hunt: 'minotaur' } }));
  const html = B(r);
  ok(html.includes('class="pl"'), 'o detalhe traz o plano');
  ok(html.includes('Savage Blow'), 'o plano usa Savage Blow');
  ok(!/paste your|your DPS/i.test(html), 'nenhuma mencao a DPS');
  ok(!html.includes('undefined') && !html.includes('NaN'), 'o plano nao tem undefined/NaN');
}

console.log('== charms: painel, desmarcar, slots ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': TRIO } });
  const t = r.els['charm-cfg-toggle'];
  ok(t.innerHTML.includes('all ' + CHARMS.length) && t.innerHTML.includes('25 slots'), 'default: todos os charms, 25 slots');
  r.els['charm-cfg-toggle'].fire('click');
  ok(r.els['charm-cfg'].innerHTML.includes('data-charm="savage_blow"'), 'abrir mostra os chips');
  r.els['charm-cfg'].fire('click', clickOn('button', { dataset: { charm: 'savage_blow' } }));
  ok(JSON.parse(r.store['idlezada.charmCfg.v2']).owned.indexOf('savage_blow') < 0, 'desmarcar fica guardado');
  r.els['hunts-table'].fire('click', clickOn('.ht-row', { dataset: { hunt: 'minotaur' } }));
  /* as linhas do plano (a nota do "por que" pode citar o desmarcado: "it would give...") */
  ok(!/pl-charm[^>]*>s*<b>Savage Blow/.test(B(r)), 'e sai do plano');
  const v1 = run({ storage: { 'idlezada.charmCfg.v1': JSON.stringify({ owned: ['freeze'], slots: 6 }) } });
  ok(v1.els['charm-cfg-toggle'].innerHTML.includes('6 slots') && v1.els['charm-cfg-toggle'].innerHTML.includes('all'), 'v1 herda so os slots');
}

/* evento ao vivo: a API publica do jogo, com um fetch de mentira */
(async () => {
  console.log('== evento de XP ao vivo entra no bonus ==');
  const now = Date.now();
  const body = { result: { data: { events: [
    { name: 'Velho', expPct: 50, enabled: true, startsAt: now - 9e7, endsAt: now - 8e7 },
    { name: 'Evento', expPct: 25, enabled: true, startsAt: now - 1e6, endsAt: now + 36e5 * 30 },
    { name: 'Skill', expPct: 0, skillPct: 25, enabled: true, startsAt: now - 1e6, endsAt: now + 1e7 },
  ] } } };
  const r = run({ storage: { 'idlezada.builds.v3': SOLO }, fetch: () => Promise.resolve({ json: () => Promise.resolve(body) }) });
  await new Promise(res => setTimeout(res, 20));
  const h = H('bloatedmanmaggot-cave');
  ok(r.els['hunt-event'].checked === false, 'o evento vem desligado por padrao');
  ok(Math.abs(listXp(B(r), h.id) - h.xpPerClear * 0.9 * 1.1) < 2, 'desligado, o evento nao entra na conta');
  r.els['hunt-event'].checked = true; r.els['hunt-event'].fire('change');
  ok(r.store['idlezada.huntEvent.v1'] === 'true', 'ligar fica guardado');
  ok(Math.abs(listXp(B(r), h.id) - h.xpPerClear * 0.9 * 1.35) < 2, 'VIP 10 + evento 25 (o de skill e o velho nao contam)');
  ok(r.els['hunt-event-v'].textContent.startsWith('+25%') && r.els['hunt-event-v'].textContent.includes('1d'), `o rotulo diz o % e quanto falta, veio: ${r.els['hunt-event-v'].textContent}`);
  r.els['hunt-event'].checked = false; r.els['hunt-event'].fire('change');
  ok(Math.abs(listXp(B(r), h.id) - h.xpPerClear * 0.9 * 1.1) < 2, 'desligar o evento tira ele');

  const off = run({ storage: {}, fetch: () => Promise.reject(new Error('offline')) });
  await new Promise(res => setTimeout(res, 20));
  ok(off.els['hunt-event-v'].textContent.includes('could not check'), 'sem rede, o rotulo diz que nao conferiu');

  console.log(`\n${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
})();
