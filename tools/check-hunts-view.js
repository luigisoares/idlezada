/* ============================================================================
   check-hunts-view.js — roda a ABA Hunts de verdade, num DOM de mentira.

       node tools/check-hunts-view.js        (sai != 0 se algo falhar)

   O check-hunt-model.js prova a conta; este prova que a TELA usa a conta sem
   explodir. Sem jsdom: o stub abaixo implementa so o que public/hunts-view.js
   toca (getElementById, innerHTML, addEventListener, localStorage, closest) e
   guarda os handlers, pra dar pra simular o clique que abre uma hunt.

   O que ele pega, e que `node --check` nao pega: variavel que nao existe, funcao
   chamada antes de ser inicializada, campo que o modelo deixou de exportar, e o
   HTML do plano vindo vazio.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PUB = path.join(__dirname, '..', 'public');

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

/* ------------------------------------------------------------------ DOM stub */
function makeEl(id) {
  const el = {
    id, innerHTML: '', textContent: '', value: '', hidden: true, checked: false,
    dataset: {}, handlers: {},
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    setAttribute(k, v) { this['attr_' + k] = v; },
    fire(ev, e) { for (const fn of this.handlers[ev] || []) fn(e || {}); },
  };
  return el;
}
/* evento de clique com o `closest` que o handler espera */
const clickOn = (sel, node) => ({ target: { closest: s => (s === sel ? node : null) } });

function run(opts) {
  const store = Object.assign({}, opts.storage || {});
  const els = {};
  const get = id => (els[id] = els[id] || makeEl(id));
  ['hunts-table','hunt-level','hunt-chars','hunt-sort','hunt-rate','hunt-reco',
   'hunt-dps','hunt-dpsinfo','charm-cfg-toggle','charm-cfg','navtabs','hunt-party',
   'hunt-q','hunt-only','hunt-avatar','hunt-hit'].forEach(get);
  els['hunt-level'].value = String(opts.level || 500);
  els['hunt-sort'].value = 'xph';
  els['hunt-dps'].value = '';

  const sandbox = {
    console,
    window: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: { getElementById: id => els[id] || null },
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  for (const f of ['trees.js', 'engine.js', 'hunts.js', 'charms.js', ...(opts.loot ? ['loot.js'] : []), 'hunt-model.js', 'hunts-view.js']) {
    vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sandbox, { filename: f });
  }
  return { els, store, win: sandbox.window };
}

/* um slot da aba Builds, que e' de onde a aba Hunts tira o personagem */
const BUILDS = JSON.stringify({ slots: [
  { label: 'EK', voc: 'knight', level: 500, obj: 'dps', element: 'ice', perks: [], forcePerks: false },
] });
const DPS_TEXT = 'Session\nEK\n120.000/s';

console.log('== a aba carrega e desenha a tabela ==');
let ctxRun;
{
  const r = run({ storage: { 'idlezada.builds.v3': BUILDS } });
  ctxRun = r;
  ok(r.els['hunts-table'].innerHTML.includes('ht-row'), 'a tabela de hunts devia ter linhas');
  ok(r.els['hunt-reco'].innerHTML.includes('reco-item'), 'o card de recomendacao devia listar hunts');
  ok(r.els['hunt-rate'].textContent.includes('XP rate'), 'a linha de rate devia estar preenchida');
  ok(r.els['hunt-chars'].innerHTML.includes('charpick'), 'o chip do personagem do slot devia aparecer');
}

console.log('== o painel "meus charms" comeca recolhido e sabe o que falta ==');
{
  const t = ctxRun.els['charm-cfg-toggle'];
  ok(t.innerHTML.includes('my charms'), 'o botao do painel devia estar rotulado');
  ok(t.innerHTML.includes('all 24'), `default devia ser TODOS os charms (Low Blow e Carnage inclusive), veio: ${t.innerHTML}`);
  ok(t.innerHTML.includes('25 slots'), 'default de slots devia ser 25 (Charm Expansion)');
  ok(ctxRun.els['charm-cfg'].hidden === true, 'o painel devia comecar fechado');
  ok(t.attr_ariaExpanded === undefined, 'aria-expanded e atributo, nao propriedade');
}

console.log('== abrir o painel desenha os chips e o seletor de slots ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': BUILDS } });
  r.els['charm-cfg-toggle'].fire('click');
  const html = r.els['charm-cfg'].innerHTML;
  ok(r.els['charm-cfg'].hidden === false, 'o clique devia abrir o painel');
  ok(html.includes('data-charm="savage_blow"'), 'devia ter chip do Savage Blow');
  ok(html.includes('data-slots="6"'), 'devia ter a opcao de 6 slots (VIP)');
  const on = (html.match(/cchip on/g) || []).length;
  ok(on === 24 + 1, `24 charms possuidos + 1 slot selecionado deviam estar marcados, vieram ${on}`);

  /* desmarcar um charm persiste e re-renderiza */
  r.els['charm-cfg'].fire('click', clickOn('button', { dataset: { charm: 'savage_blow' } }));
  const saved = JSON.parse(r.store['idlezada.charmCfg.v2']);
  ok(saved.owned.indexOf('savage_blow') < 0, 'desmarcar o Savage Blow devia sair do localStorage');
  ok(r.els['charm-cfg-toggle'].innerHTML.includes('1 missing'), 'o contador do botao devia virar 1');
}

console.log('== abrir uma hunt desenha o PLANO ==');
{
  const r = run({ storage: { 'idlezada.builds.v3': BUILDS } });
  r.els['hunt-dps'].value = DPS_TEXT;
  r.els['hunt-dps'].fire('input');
  r.els['hunts-table'].fire('click', clickOn('.ht-row', { dataset: { hunt: 'minotaur' } }));
  const html = r.els['hunts-table'].innerHTML;
  ok(html.includes('class="pl"'), 'o detalhe devia trazer o bloco do plano');
  ok(html.includes('Hit with'), 'o plano devia dizer com que elemento bater');
  ok(html.includes('Protect from'), 'o plano devia dizer de que se proteger');
  ok(html.includes('Savage Blow'), 'o plano da Minotaur devia usar Savage Blow');
  ok(html.includes('wave-10 boss too'), 'a criatura que faz de boss devia estar marcada como tal');
  ok(html.includes('Fatal Hold'), 'o Menor de dano devia entrar no plano');
  ok(html.includes('kills'), 'cada linha devia mostrar o custo de bestiary');
  ok(html.includes('all charms on this monster'), 'o ranking completo devia existir, fechado');
  ok(!html.includes('undefined') && !html.includes('NaN'),
    'o HTML do plano nao devia ter undefined/NaN');
  ok(html.indexOf('class="pl"') < html.indexOf('htd-head'),
    'o plano vem ANTES da lista de monstros (e a resposta, nao o apendice)');
}

console.log('== sem personagem selecionado o plano explica, nao quebra ==');
{
  const r = run({ storage: {} });
  r.els['hunts-table'].fire('click', clickOn('.ht-row', { dataset: { hunt: 'minotaur' } }));
  const html = r.els['hunts-table'].innerHTML;
  ok(html.includes('pl-hint'), 'sem char, o detalhe devia pedir um personagem');
  ok(!html.includes('class="pl"'), 'e nao devia desenhar um plano vazio');
}

console.log('== charm desmarcado sai do plano ==');
{
  const cfg = JSON.stringify({ owned: ['freeze', 'poison', 'fatal_hold', 'gut'], slots: 25 });
  const r = run({ storage: { 'idlezada.builds.v3': BUILDS, 'idlezada.charmCfg.v2': cfg } });
  r.els['hunt-dps'].value = DPS_TEXT;
  r.els['hunt-dps'].fire('input');
  r.els['hunts-table'].fire('click', clickOn('.ht-row', { dataset: { hunt: 'minotaur' } }));
  const plan = r.els['hunts-table'].innerHTML.split('htd-head')[0];
  ok(!plan.includes('Savage Blow'), 'Savage Blow desmarcado nao pode aparecer no plano');
  ok(plan.includes('Freeze') || plan.includes('Poison'), 'os charms marcados deviam aparecer');
  ok(!plan.includes('Scavenge'), 'Scavenge desmarcado nao pode aparecer no plano');
}

/* ---------------------------------------------------- regressoes de DPS colado */
/* Os tres bugs que faziam o plano vir com uma linha so (print do usuario):
     1. o rotulo do personagem entrava truncado ("Luigi" -> "UIGI");
     2. o DPS proprio so casava pela sigla da vocacao, entao vinha 0;
     3. com DPS 0 os elementais eram DESCARTADOS em vez de entrarem por resistencia. */
const SESSION_NAME = 'Session\n05:27:35\nLuigi\n450.000/s · 63.410.078\nED\n300.000/s · 40.000.000';
const withChar = extra => Object.assign({ 'idlezada.builds.v3': JSON.stringify({ slots: [
  { label: 'Luigi', voc: 'knight', level: 900, obj: 'dps', element: 'ice', perks: [], forcePerks: false }] }) }, extra || {});

console.log('== dps: nome de personagem nao pode entrar truncado ==');
{
  const r = run({ level: 900, storage: withChar() });
  r.els['hunt-dps'].value = SESSION_NAME;
  r.els['hunt-dps'].fire('input');
  const info = r.els['hunt-dpsinfo'].textContent;
  ok(info.includes('LUIGI 450,000'), `o rotulo devia sair inteiro, veio: ${info}`);
  ok(!info.includes('UIGI 450,000') || info.includes('LUIGI 450,000'), 'e nao truncado nas ultimas 4 letras');
  ok(info.includes('Party DPS 750,000'), 'o total da party continua somando os dois');
}

console.log('== dps: o do personagem casa por sigla, por nome, ou sendo o unico ==');
{
  const byName = run({ level: 900, storage: withChar() });
  byName.els['hunt-dps'].value = SESSION_NAME;
  byName.els['hunt-dps'].fire('input');
  ok(byName.els['hunt-dpsinfo'].textContent.includes('Luigi: crit'), 'a linha do personagem devia aparecer');
  ok(!byName.els['hunt-dpsinfo'].textContent.includes('no own DPS'),
    'com o nome do personagem no paste, o DPS dele nao pode vir vazio');

  const byVoc = run({ level: 900, storage: withChar() });
  byVoc.els['hunt-dps'].value = 'Session\nEK\n450.000/s';
  byVoc.els['hunt-dps'].fire('input');
  ok(!byVoc.els['hunt-dpsinfo'].textContent.includes('no own DPS'), 'a sigla da vocacao tambem casa');

  const solo = run({ level: 900, storage: withChar() });
  solo.els['hunt-dps'].value = 'Session\nWhatever\n450.000/s';
  solo.els['hunt-dps'].fire('input');
  ok(solo.els['hunt-dpsinfo'].textContent.includes('only entry'),
    'entrada unica vale como o proprio jogador, e a barra diz de onde veio');
}

console.log('== dps: o texto guardado e re-parseado (paste antigo se conserta sozinho) ==');
{
  /* perChar salvo com a chave truncada do parse velho; o texto e a fonte da verdade */
  const stale = JSON.stringify({ total: 450000, perChar: { UIGI: 450000 }, text: SESSION_NAME });
  const r = run({ level: 900, storage: withChar({ 'idlezada.huntDps.v1': stale }) });
  ok(r.els['hunt-dpsinfo'].textContent.includes('LUIGI 450,000'),
    'ao carregar, o texto devia ser re-parseado com a regra nova');
}

console.log('== plano: SEM dps colado, todo bicho ainda recebe charm (por resistencia) ==');
{
  /* sem Low Blow e Carnage de proposito: com eles a segunda criatura recebe Low Blow
     (percentual, calculavel sem DPS) e o caminho "por resistencia" nem roda */
  const semLB = JSON.stringify({ owned: JSON.parse(require('fs').readFileSync(path.join(PUB, '..', 'data', 'charms.json'), 'utf8'))
    .map(c => c.key).filter(k => k !== 'low_blow' && k !== 'carnage'), slots: 25 });
  const r = run({ level: 900, storage: withChar({ 'idlezada.charmCfg.v2': semLB }) });
  r.els['hunts-table'].fire('click', clickOn('.ht-row', { dataset: { hunt: 'infernalmdemon-cave' } }));
  const plan = r.els['hunts-table'].innerHTML.split('htd-head')[0];
  const dashes = (plan.match(/pl-none/g) || []).length;
  ok(dashes === 0, `nenhuma criatura devia ficar com "—" no Maior, ficaram ${dashes}`);
  /* a linha fica limpa (so nome + tier); o porque do charm sem numero vai no title */
  ok(plan.includes('placed by resistance: paste your DPS for the %'), 'o charm posto por resistencia explica no title que falta o DPS');
  ok(!plan.includes('taken · no %'), 'e a linha nao carrega mais o texto extra');
  ok(plan.includes('placed by <b>resistance</b> only'), 'e a nota devia explicar o criterio');
  ok(plan.includes('Savage Blow'), 'os percentuais continuam entrando com numero');
}

console.log('== revamp: cabecalho ordena, busca e "so as que eu entro" filtram ==');
{
  const H = JSON.parse(require('fs').readFileSync(path.join(PUB, '..', 'data', 'hunts.json'), 'utf8'));
  const ids = html => [...html.matchAll(/class="ht-row[^"]*" data-hunt="([^"]+)"/g)].map(m => m[1]);
  const r = run({ storage: { 'idlezada.builds.v3': BUILDS }, level: 900 });

  /* clicar no cabecalho "Gold / clear" troca o ranking pra gold, como o select */
  r.els['hunts-table'].fire('click', { target: { closest: s => (s === '.th' ? { dataset: { sort: 'gold' } } : null) } });
  ok(r.els['hunt-sort'].value === 'gold', `o cabecalho devia levar o select pra gold, ficou ${r.els['hunt-sort'].value}`);
  const byGold = H.slice().sort((a, b) => b.goldPerClear - a.goldPerClear)[0].id;
  ok(ids(r.els['hunts-table'].innerHTML)[0] === byGold, `a primeira linha devia ser a de mais gold (${byGold})`);
  ok(r.els['hunts-table'].innerHTML.includes('th num on'), 'o cabecalho ativo devia vir marcado');

  /* toda linha responde as duas perguntas de elemento: com o que bater, do que se
     defender -- e a defesa agrupa no maximo 2 elementos */
  const tbl = r.els['hunts-table'].innerHTML;
  const hits = (tbl.match(/class="he"/g) || []).length, prots = (tbl.match(/class="hp"/g) || []).length;
  ok(hits === H.length && prots === H.length, `cada hunt devia ter Hit with e Protect from (${hits}/${prots} de ${H.length})`);
  ok(tbl.includes('Hit with') && tbl.includes('Protect from'), 'o cabecalho devia nomear as duas colunas');
  const maxProt = Math.max(...[...tbl.matchAll(/class="hp">(.*?)<\/span>\s*<span class="num/gs)]
    .map(m => (m[1].match(/class="el /g) || []).length));
  ok(maxProt <= 2, `Protect from devia agrupar no maximo 2 elementos, veio ${maxProt}`);

  /* busca por MONSTRO, nao so pelo nome da hunt */
  r.els['hunt-q'].value = 'minotaur';
  r.els['hunt-q'].fire('input');
  const found = ids(r.els['hunts-table'].innerHTML);
  ok(found.length > 0 && found.every(id => {
    const h = H.find(x => x.id === id);
    return /minotaur/i.test(h.name) || h.monsters.some(m => /minotaur/i.test(m.name));
  }), `a busca "minotaur" devia listar so hunts com minotauro (veio ${found.join(',')})`);

  r.els['hunt-q'].value = 'zzz-nada';
  r.els['hunt-q'].fire('input');
  ok(r.els['hunts-table'].innerHTML.includes('ht-empty'), 'busca sem resultado devia dizer isso, nao sumir com a tabela');

  /* "so as que eu entro" tira as de level acima, e o podio nao muda */
  r.els['hunt-q'].value = '';
  const podio = r.els['hunt-reco'].innerHTML;
  r.els['hunt-only'].checked = true;
  r.els['hunt-only'].fire('change');
  const left = ids(r.els['hunts-table'].innerHTML);
  ok(left.length === H.filter(h => h.minLevel <= 900).length, `no 900 deviam sobrar ${H.filter(h => h.minLevel <= 900).length} hunts, sobraram ${left.length}`);
  ok(!r.els['hunts-table'].innerHTML.includes('ht-row locked'), 'nenhuma trancada com o filtro ligado');
  ok(r.els['hunt-reco'].innerHTML === podio, 'filtro de tela nao mexe no podio');
}

console.log('== charms: config antiga (v1) so passa os slots; o resto vira "tenho todos" ==');
{
  const v1 = JSON.stringify({ owned: ['freeze'], slots: 6 });
  const r = run({ storage: { 'idlezada.builds.v3': BUILDS, 'idlezada.charmCfg.v1': v1 } });
  const t = r.els['charm-cfg-toggle'].innerHTML;
  ok(t.includes('all 24') && t.includes('6 slots'), `v1 devia herdar os 6 slots e virar todos os charms, veio ${t}`);
}

console.log('== Avatar: uptime proprio e a nota Savage x Low Blow ==');
{
  const AV = JSON.stringify({ slots: [{ label: 'EK', voc: 'knight', level: 900, obj: 'avatar', element: 'physical', perks: [] }] });
  const r = run({ storage: { 'idlezada.builds.v3': AV }, level: 900 });
  r.els['hunt-dps'].value = DPS_TEXT; r.els['hunt-dps'].fire('input');
  r.els['hunts-table'].fire('click', clickOn('.ht-row', { dataset: { hunt: 'minotaur' } }));
  const html = r.els['hunts-table'].innerHTML;
  ok(html.includes('<b>Savage Blow</b> gives') && html.includes('<b>Low Blow</b> only'),
    'com Avatar, o plano explica Savage x Low Blow');
  const tree = +(r.els['hunt-dpsinfo'].textContent.match(/Avatar (\d+)% uptime/) || [])[1];
  ok(tree > 0, `o uptime da arvore aparece na barra (veio ${r.els['hunt-dpsinfo'].textContent})`);

  r.els['hunt-avatar'].value = '80'; r.els['hunt-avatar'].fire('input');
  ok(r.els['hunt-dpsinfo'].textContent.includes('Avatar 80% uptime (yours)'), 'o uptime digitado vale e e marcado como seu');
  ok(r.store['idlezada.avatarUptime.v1'] === '80', 'e fica guardado');
  const note = up => (r.els['hunts-table'].innerHTML.match(/Savage Blow<\/b> gives \+([\d.]+)%.*?Low Blow<\/b> only \+([\d.]+)%/) || []).slice(1).map(Number);
  const [sv80, lb80] = note();
  r.els['hunt-avatar'].value = '0'; r.els['hunt-avatar'].fire('input');
  ok(!r.els['hunts-table'].innerHTML.includes('<b>Low Blow</b> only'), 'sem Avatar (0%), a nota some');
  ok(sv80 > lb80 * 3, `com 80% de Avatar a Savage devia render bem mais que a Low Blow (${sv80} vs ${lb80})`);
}

console.log('== plano limpo: sem pilula de elemento, minors de gold com o valor ==');
{
  const AV = JSON.stringify({ slots: [{ label: 'EK', voc: 'knight', level: 900, obj: 'avatar', element: 'physical', perks: [] }] });
  const r = run({ storage: { 'idlezada.builds.v3': AV }, level: 900, loot: true });
  r.els['hunt-dps'].value = DPS_TEXT; r.els['hunt-dps'].fire('input');
  const bony = JSON.parse(require('fs').readFileSync(path.join(PUB, '..', 'data', 'hunts.json'), 'utf8')).find(h => /bony/i.test(h.name));
  r.els['hunts-table'].fire('click', clickOn('.ht-row', { dataset: { hunt: bony.id } }));
  const plan = r.els['hunts-table'].innerHTML.split('htd-more')[0];
  ok(!/pl-charm[^>]*>\s*<span class="el /.test(plan), 'o charm no plano nao abre com pilula de elemento');
  ok(plan.includes('Scavenge') && plan.includes('gold / clear'), 'Scavenge entra com o gold por clear que rende');
  ok(plan.includes('Gut') , 'e o Gut tambem, na criatura em que vale mais');
  ok(plan.includes('pl-row boss'), 'a linha da criatura que faz de boss continua marcada');
}

console.log('== golpe medio: guardado, e muda o plano de Carnage pra elemental ==');
{
  const AV = JSON.stringify({ slots: [{ label: 'EK', voc: 'knight', level: 900, obj: 'avatar', element: 'physical', perks: [] }] });
  const r = run({ storage: { 'idlezada.builds.v3': AV }, level: 900, loot: true });
  r.els['hunt-dps'].value = DPS_TEXT; r.els['hunt-dps'].fire('input');
  const bony = JSON.parse(require('fs').readFileSync(path.join(PUB, '..', 'data', 'hunts.json'), 'utf8')).find(h => /bony/i.test(h.name));
  r.els['hunts-table'].fire('click', clickOn('.ht-row', { dataset: { hunt: bony.id } }));
  ok(r.els['hunts-table'].innerHTML.includes('the elemental wins once you need more than'), 'o "por que" traz a virada Carnage x elemental');
  r.els['hunt-hit'].value = '2000'; r.els['hunt-hit'].fire('input');
  ok(r.store['idlezada.avgHit.v1'] === '2000', 'o golpe medio fica guardado');
  const plan = r.els['hunts-table'].innerHTML.split('htd-more')[0];
  ok(!plan.includes('<b>Carnage</b>'), 'com golpe de 2k o Carnage sai do plano');
  ok(plan.includes('with your average hit'), 'e a nota diz que usou o seu golpe');
}

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
