/* ============================================================================
   check-loot-view.js — roda a ABA Loot de verdade, num DOM de mentira.

       node tools/check-loot-view.js        (sai != 0 se algo falhar)

   O check-loot.js prova a conta; este prova que a TELA usa a conta sem explodir.
   Sem jsdom: o stub implementa so o que public/loot-view.js toca, e guarda os
   handlers, pra dar pra simular a digitacao na busca, o clique na estrela e o
   clique que abre a hunt.

   O que ele pega, e que `node --check` nao pega: variavel que nao existe, campo
   que o modelo deixou de exportar, coluna que vira undefined/NaN na tela, a
   busca parcial deixando de resolver, e a estrela abrindo a hunt sem querer.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PUB = path.join(__dirname, '..', 'public');

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

/* ------------------------------------------------------------------ DOM stub */
function makeEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', hidden: true, checked: false,
    disabled: false, className: '', dataset: {}, handlers: {},
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    setAttribute(k, v) { this['attr_' + k] = v; },
    fire(ev, e) { for (const fn of this.handlers[ev] || []) fn(e || {}); },
  };
}
/* evento com o `closest` que os handlers esperam. `sels` mapeia seletor -> no,
   pra simular um alvo que casa com mais de um closest (a estrela DENTRO da linha). */
const evt = sels => ({ target: { closest: s => (s in sels ? sels[s] : null) } });
const clickRow = id => evt({ '.lt-row': { dataset: { hunt: id } } });
/* a estrela vive dentro da linha: o alvo casa com os dois seletores, e o handler
   tem que decidir pela estrela. E' exatamente o caso que ja quebrou uma vez. */
const clickStarInRow = (name, huntId) => evt({
  '[data-fav]': { dataset: { fav: name } },
  '.lt-row': { dataset: { hunt: huntId } },
});

function run(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.storage || {});
  const els = {};
  const get = id => (els[id] = els[id] || makeEl(id));
  ['loot-table','loot-search','loot-items','loot-level','loot-sort','loot-info',
   'loot-note','loot-favs','loot-star'].forEach(get);
  els['loot-sort'].value = opts.sort || 'clear';
  els['loot-search'].value = opts.search || '';

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
  for (const f of ['hunts.js', 'loot.js', ...(opts.bosses ? ['bosses.js'] : []), 'hunt-model.js', 'loot-view.js']) {
    vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sandbox, { filename: f });
  }
  const type = q => { els['loot-search'].value = q; els['loot-search'].fire('input'); };
  if (opts.search) type(opts.search);
  return { els, store, type, win: sandbox.window,
    html: () => els['loot-table'].innerHTML,
    favs: () => els['loot-favs'].innerHTML,
    saved: () => { try { return JSON.parse(store['idlezada.lootFavs.v1']); } catch(e){ return null; } },
    click: id => els['loot-table'].fire('click', clickRow(id)),
    starRow: (name, huntId) => els['loot-table'].fire('click', clickStarInRow(name, huntId)),
    go: name => els['loot-favs'].fire('click', evt({ '[data-go]': { dataset: { go: name } } })),
    unfav: name => els['loot-favs'].fire('click', evt({ '[data-fav]': { dataset: { fav: name } } })) };
}

const BUILDS = JSON.stringify({ slots: [
  { label: 'EK', voc: 'knight', level: 350, obj: 'dps', element: 'ice', perks: [], forcePerks: false },
] });
const favStore = list => ({ 'idlezada.lootFavs.v1': JSON.stringify(list) });
const clean = h => !/undefined|NaN/.test(h);

console.log('== a aba nao depende de DPS nenhum ==');
{
  /* a primeira versao lia o DPS da aba Hunts. Ele saiu: esta aba responde
     "qual bicho solta mais", nao "quao rapido". */
  const src = fs.readFileSync(path.join(PUB, 'loot-view.js'), 'utf8');
  ok(!/huntDps/.test(src), 'loot-view.js nao pode mais ler o DPS da aba Hunts');
  ok(!/per hour|Per hour|\/hora|goldHour|perHour/.test(src), 'nao pode ter sobrado coluna por hora');
  const r = run({ search: 'stone skin amulet', storage: { 'idlezada.huntDps.v1': JSON.stringify({ total: 3200000 }) } });
  ok(!/DPS/i.test(r.els['loot-info'].innerHTML), 'a barra nao devia falar de DPS');
  ok(!/—<\/span>/.test(r.html().split('lt-head')[0] || ''), 'nao devia sobrar coluna vazia de DPS');
}

console.log('== sem favorito e sem busca: ranking pelo valor da tabela de loot ==');
{
  const r = run({ storage: favStore([]) });
  const h = r.html();
  ok(h.includes('lt-row-g'), 'sem busca e sem estrela, cai no modo gold');
  const nh = r.win.HUNTS.length;
  ok((h.match(/lt-item/g) || []).length === nh, `deviam ser as ${nh} hunts, vieram ${(h.match(/lt-item/g) || []).length}`);
  ok(h.includes('Coins / clear') && h.includes('Drops / clear') && h.includes('Total / clear'),
    'o cabecalho devia separar moeda, drop e total');
  ok(!h.includes('1M HP'), 'a coluna por 1M de HP saiu junto com o DPS');
  ok(clean(h), 'a tabela do modo gold nao devia ter undefined/NaN');
  ok(r.els['loot-info'].innerHTML.includes('star items'), 'a barra devia sugerir favoritar');
  ok(r.favs() === '', 'sem favorito, a faixa de chips fica vazia');
  const ni = r.win.HuntModel.lootItems(r.win.HUNTS, r.win.LOOT).length;
  ok((r.els['loot-items'].innerHTML.match(/<option/g) || []).length === ni, `os ${ni} itens de hunt no datalist`);
}

console.log('== buscar um item: hunts, criatura, chance, por clear e clears/1 ==');
{
  const r = run({ search: 'stone skin amulet' });
  const h = r.html();
  ok((h.match(/lt-item/g) || []).length === 19, `19 hunts dropam o amuleto, vieram ${(h.match(/lt-item/g) || []).length}`);
  ok(h.includes('Drops from') && h.includes('Per clear') && h.includes('Clears / 1'), 'as tres colunas que sobraram');
  ok(h.includes('8.86%'), 'a chance do Burster Spectre devia aparecer');
  ok(h.includes('kills'), 'e quantas mortes por clear');
  ok(clean(h), 'o ranking do item nao devia ter undefined/NaN');
  ok(r.els['loot-info'].innerHTML.includes('sells for 500g'), 'a barra devia dar o preco de venda');
  ok(r.els['loot-info'].innerHTML.includes('19 hunt'), 'e em quantas hunts cai');
  /* default = mais por clear. A Rotten Man-Maggot lidera desde que o extrator aplica
     o multiplicador de chance de loot do jogo nas hunts de lv1500 (x8.8 nela); antes
     era a Dark Thais (1,602) na frente do Gazer (1,536). */
  ok(/Rotten man-maggot/.test(h.split('lt-item')[1] || ''), 'default ordena por quantidade por clear');
}

console.log('== ordenar por melhor chance poe o bicho de maior % na frente ==');
{
  const r = run({ search: 'stone skin amulet', sort: 'chance' });
  r.els['loot-sort'].fire('change');
  const first = r.html().split('lt-item')[1] || '';
  ok(/Gazer/.test(first), `por chance o Gazer lidera (Burster Spectre 8,86%), veio ${(first.match(/class="hn">([^<]+)/) || [])[1]}`);

  const r2 = run({ search: 'stone skin amulet', sort: 'level' });
  r2.els['loot-sort'].fire('change');
  ok(/Werebadge/.test(r2.html().split('lt-item')[1] || ''), 'por level, a hunt de lvl 90 vem primeiro');
}

console.log('== favoritar pela barra guarda, marca e vira chip ==');
{
  const r = run({ search: 'stone skin amulet', storage: favStore([]) });
  ok(r.els['loot-star'].innerHTML === '☆', 'comeca sem estrela');
  ok(r.els['loot-star'].disabled === false, 'com item resolvido, o botao funciona');
  r.els['loot-star'].fire('click');
  ok(r.els['loot-star'].innerHTML === '★', 'clicar devia marcar');
  ok(r.saved() && r.saved()[0] === 'stone skin amulet', 'e persistir o NOME do catalogo');
  ok(r.favs().includes('stone skin amulet'), 'e virar chip na faixa');
  r.els['loot-star'].fire('click');
  ok(r.saved().length === 0, 'clicar de novo desfavorita');
  ok(r.favs() === '', 'e o chip some');
}

console.log('== sem item resolvido a estrela da barra fica inerte ==');
{
  const r = run();
  ok(r.els['loot-star'].disabled === true, 'sem busca, o botao devia estar desabilitado');
  r.els['loot-star'].fire('click');
  ok(!r.saved() || r.saved().length === 0, 'e clicar nele nao pode favoritar nada');

  const r2 = run({ search: 'xyzzy' });
  ok(r2.els['loot-star'].disabled === true, 'busca que nao casa tambem deixa a estrela inerte');
}

console.log('== a busca parcial favorita o item RESOLVIDO, nao o texto digitado ==');
{
  const r = run({ search: 'stone skin', storage: favStore([]) });
  r.els['loot-star'].fire('click');
  ok(r.saved()[0] === 'stone skin amulet',
    `devia guardar o nome do catalogo, guardou ${JSON.stringify(r.saved())}`);
}

console.log('== favoritar na lista de uma hunt, sem abrir/fechar a hunt junto ==');
{
  const r = run({ search: 'stone skin amulet', storage: favStore([]) });
  r.click('hydra-cave');
  ok(r.html().includes('class="ltd"'), 'a hunt abriu');
  r.starRow('hydra head', 'hydra-cave');
  ok(r.saved() && r.saved().indexOf('hydra head') >= 0, 'a estrela da linha devia favoritar o item');
  ok(r.html().includes('class="ltd"'), 'e a hunt tem que CONTINUAR aberta — a estrela nao e clique de linha');
  ok(r.html().includes('ltd-row hit'), 'o favorito devia ficar destacado na lista da hunt');
}

console.log('== primeira visita ja vem com a lista semeada ==');
{
  const r = run();                       // nada no storage: primeira visita
  const DEF = ['stone skin amulet', 'butterfly ring', 'platinum amulet', 'wooden spellbook'];
  ok(r.html().includes('lt-row-b'), 'quem nunca mexeu devia cair direto em Minha lista');
  ok((r.favs().match(/lfav-go/g) || []).length === DEF.length, `os ${DEF.length} chips na faixa`);
  for (const n of DEF) ok(r.favs().includes(n), `${n} devia estar na lista default`);
  ok(r.saved() === null, 'a semente NAO grava sozinha: so grava quando voce mexe');

  /* cada item da semente tem que existir e cair em alguma hunt -- senao a tela
     abre com um chip que nao leva a lugar nenhum */
  const HM = r.win.HuntModel, HUNTS = r.win.HUNTS, LOOT = r.win.LOOT;
  for (const n of DEF) {
    const src = HM.lootSources(n, HUNTS, LOOT);
    ok(src.length > 0, `"${n}" da semente nao cai em hunt nenhuma`);
  }
  ok(r.els['loot-info'].innerHTML.includes('4 items'), 'a barra devia contar os 4');
}

console.log('== esvaziar a lista FICA esvaziada: a semente nao ressuscita ==');
{
  /* Sem a distincao entre "nunca gravou" e "gravou vazio", tirar o ultimo item
     faria a semente voltar no proximo render. */
  const r = run();
  for (const n of ['stone skin amulet', 'butterfly ring', 'platinum amulet', 'wooden spellbook']) r.unfav(n);
  ok(r.saved() && r.saved().length === 0, 'a lista vazia devia ter sido gravada');
  ok(r.html().includes('lt-row-g'), 'e a tela cai no ranking de gold');

  /* recarregar a pagina com a lista vazia gravada nao pode trazer a semente */
  const depois = run({ storage: r.store });
  ok(depois.favs() === '', 'ao recarregar, a lista continua vazia');
  ok(depois.html().includes('lt-row-g'), 'e nao volta pra Minha lista');
}

console.log('== busca vazia com favoritos = MINHA LISTA ==');
{
  const lista = ['stone skin amulet', 'boots of haste', 'royal helmet'];
  const r = run({ storage: favStore(lista) });
  const h = r.html();
  ok(h.includes('lt-row-b'), 'com favoritos, a busca vazia vira Minha lista');
  ok(!h.includes('lt-row-g'), 'e nao o ranking de gold');
  ok(h.includes('Covers') && h.includes('Of your list'), 'o cabecalho devia falar de cobertura');
  ok(r.els['loot-info'].innerHTML.includes('My list'), 'a barra devia dizer que e a lista');
  ok(r.els['loot-info'].innerHTML.includes('3 items'), 'e o tamanho dela');
  ok(clean(h), 'Minha lista nao devia ter undefined/NaN');
  ok((r.favs().match(/lfav-go/g) || []).length === 3, 'os tres chips na faixa');

  /* a primeira linha tem que ser a de maior cobertura */
  const HM = r.win.HuntModel;
  const melhor = HM.lootBasket(lista, r.win.HUNTS, r.win.LOOT)[0];
  ok(new RegExp(melhor.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(h.split('lt-item')[1] || ''),
    `a hunt de maior cobertura (${melhor.name}) devia liderar`);
  ok(h.includes(`/ ${lista.length}`), 'a coluna devia mostrar cobertura sobre o total da lista');
}

console.log('== o chip navega, o ✕ desfavorita ==');
{
  const r = run({ storage: favStore(['stone skin amulet', 'boots of haste']) });
  r.go('boots of haste');
  ok(r.els['loot-search'].value === 'boots of haste', 'o chip devia jogar o item na busca');
  ok(!r.html().includes('lt-row-b'), 'e sair de Minha lista pro ranking do item');
  ok(r.favs().includes('lfav on'), 'o chip do item que esta na tela devia estar marcado');

  r.go('');
  ok(r.els['loot-search'].value === '', '"show my list" devia limpar a busca');
  ok(r.html().includes('lt-row-b'), 'e voltar pra Minha lista');

  r.unfav('stone skin amulet');
  ok(r.saved().length === 1 && r.saved()[0] === 'boots of haste', 'o ✕ devia remover so aquele item');
  ok(r.html().includes('lt-row-b'), 'com um favorito restante, continua em Minha lista');

  r.unfav('boots of haste');
  ok(r.saved().length === 0, 'removeu o ultimo');
  ok(r.html().includes('lt-row-g'), 'sem nenhum favorito, volta pro ranking de gold');
}

console.log('== favorito que nao cai em hunt nenhuma nao quebra a lista ==');
{
  const r = run({ storage: favStore(['item que nao existe']) });
  ok(r.html().includes('lt-empty'), 'devia explicar que nada da lista cai');
  ok(clean(r.html()), 'sem undefined/NaN');
  ok((r.favs().match(/lfav-go/g) || []).length === 1, 'o chip continua la pra dar pra remover');
}

console.log('== favoritos guardados vem sujos: cai na semente, nao quebra ==');
{
  const lixo = v => run({ storage: { 'idlezada.lootFavs.v1': v } });
  ok(lixo('nao e json').saved() === null && lixo('nao e json').html().includes('lt-row-b'),
    'json invalido devia cair na lista default');
  ok(lixo('{"a":1}').html().includes('lt-row-b'), 'objeto em vez de array, idem');
  const r = run({ storage: { 'idlezada.lootFavs.v1': '["stone skin amulet", 42, null]' } });
  ok(r.html().includes('lt-row-b'), 'array com lixo dentro: usa o que presta');
  ok((r.favs().match(/lfav-go/g) || []).length === 1, 'e descarta o que nao e nome');
}

console.log('== busca parcial resolve, e diz o que resolveu ==');
{
  const r = run({ search: 'stone skin' });
  ok((r.html().match(/lt-item/g) || []).length === 19, '"stone skin" devia achar o amuleto');
  ok(r.els['loot-note'].innerHTML.includes('stone skin amulet'), 'a nota devia dizer qual item entrou');

  ok((run({ search: 'BOOTS OF HASTE' }).html().match(/lt-item/g) || []).length > 0, 'a busca ignora caixa');

  const r3 = run({ search: 'xyzzy nao existe' });
  ok(r3.html().includes('lt-empty'), 'busca sem resultado devia explicar, nao ficar em branco');
  ok(!/lt-row/.test(r3.html()), 'e nao listar hunt nenhuma');
  ok(r3.html().includes('Nothing named'), 'o estado vazio devia nomear o que nao achou');
}

console.log('== as sugestoes sao clicaveis e trocam a busca ==');
{
  const r = run({ search: 'amulet' });
  const note = r.els['loot-note'].innerHTML;
  ok(note.includes('lsug'), `com varios itens casando, deviam vir sugestoes, veio: ${note}`);
  const m = note.match(/data-go="([^"]+)"/);
  ok(!!m, 'a sugestao devia carregar o nome do item');
  if (m) {
    r.els['loot-note'].fire('click', evt({ '[data-go]': { dataset: { go: m[1] } } }));
    ok(r.els['loot-search'].value === m[1], 'clicar na sugestao devia jogar o nome na busca');
    ok((r.html().match(/lt-item/g) || []).length > 0, 'e re-renderizar o ranking do item escolhido');
  }
}

console.log('== abrir uma hunt mostra o loot INTEIRO dela ==');
{
  const r = run({ search: 'stone skin amulet' });
  r.click('hydra-cave');
  const h = r.html();
  ok(h.includes('class="ltd"'), 'o detalhe da hunt devia abrir');
  ok(h.includes('gold coin') && h.includes('hydra head'), 'com as moedas e os drops');
  ok(h.includes('total / clear'), 'o resumo devia dar o total por clear');
  ok(!/gold \/ hour|clears \/ hour/.test(h), 'e NAO as linhas que dependiam de DPS');
  ok(h.includes('Clears / 1'), 'a lista da hunt tambem mostra quantos clears por unidade');
  ok((h.match(/lstar/g) || []).length > 5, 'toda linha do loot devia ter estrela');
  ok(clean(h), 'o detalhe nao devia ter undefined/NaN');
  r.click('hydra-cave');
  ok(!r.html().includes('class="ltd"'), 'clicar de novo devia fechar');
}

console.log('== hunt com criatura sem tabela de loot AVISA ==');
{
  /* lista vazia de proposito: so o modo gold lista todas as hunts, e a hunt com
     criatura sem loot pode nao cobrir nenhum favorito. */
  const base = run({ storage: favStore([]) });
  const HM = base.win.HuntModel, HUNTS = base.win.HUNTS, LOOT = base.win.LOOT;
  const alvo = HUNTS.find(x => HM.huntLoot(x, LOOT).missing.length);
  ok(!!alvo, 'devia existir hunt com criatura sem loot');
  if (alvo) {
    const r = run({ storage: favStore([]) });
    r.click(alvo.id);
    ok(r.html().includes('ltd-warn'), `a hunt ${alvo.name} devia mostrar o aviso`);
    ok(r.html().includes('no loot table'), 'e explicar o que o aviso quer dizer');
  }
}

console.log('== o level marca a hunt fora do alcance, sem esconder ==');
{
  const r = run({ search: 'stone skin amulet' });
  r.els['loot-level'].value = '100';
  r.els['loot-level'].fire('input');
  const h = r.html();
  ok(h.includes(' locked'), 'hunt acima do level devia vir marcada');
  ok((h.match(/lt-item/g) || []).length === 19, 'mas nenhuma sai da lista: o ranking continua inteiro');
  ok(h.includes('class="hl bad">350'), 'o level da hunt inalcancavel devia estar marcado');
  ok(r.els['loot-info'].innerHTML.includes('at or below level 100'), 'a barra devia contar quantas dao pra fazer');

  /* o mesmo vale em Minha lista */
  const r2 = run({ storage: favStore(['stone skin amulet']) });
  r2.els['loot-level'].value = '100';
  r2.els['loot-level'].fire('input');
  ok(r2.html().includes(' locked'), 'Minha lista tambem marca hunt fora do alcance');
}

console.log('== o level default vem do maior personagem da aba Builds ==');
{
  ok(run().els['loot-level'].value === '900', 'sem builds salvas, o default e 900');
  ok(run({ storage: { 'idlezada.builds.v3': BUILDS } }).els['loot-level'].value === '350',
    'com uma build de 350, o level default devia ser 350');
}

console.log('== trocar de busca fecha os detalhes abertos ==');
{
  const r = run({ search: 'stone skin amulet' });
  r.click('hydra-cave');
  ok(r.html().includes('class="ltd"'), 'abriu');
  r.type('boots of haste');
  ok(!r.html().includes('class="ltd"'), 'trocar o item devia fechar o que estava aberto');
}

console.log('== bosses na busca de item ==');
{
  /* item que so cai de boss: antes da busca conhecer bosses, isso dava "nada" */
  const r = run({ bosses: true, search: 'moonsilver bow' });
  ok(r.html().includes('only bosses do'), 'item so de boss devia dizer que so boss dropa');
  ok(r.html().includes('Phosphorus') && r.html().includes('1.00%'), 'e listar o Phosphorus com a chance de 1%');
  ok(r.els['loot-info'].innerHTML.includes('by 1 boss'), 'a barra de info conta o boss');
  const n = (r.els['loot-items'].innerHTML.match(/<option/g) || []).length;
  const soHunt = r.win.HuntModel.lootItems(r.win.HUNTS, r.win.LOOT).length;
  ok(n > soHunt, `com bosses, o datalist devia passar dos ${soHunt} itens de hunt, veio ${n}`);

  /* item de hunt E de boss: as hunts vem primeiro, os bosses numa tabela propria */
  const r2 = run({ bosses: true, search: 'crystal coin' });
  const h = r2.html();
  ok(h.includes('lt-row') && h.includes('Bosses that drop it'), 'hunts e bosses aparecem juntos');
  ok(h.indexOf('lt-row') < h.indexOf('Bosses that drop it'), 'as hunts vem antes dos bosses');
  ok(!/class="lb-row lt-row/.test(h), 'linha de boss nao e linha de hunt (o clique nao abre nada)');
}

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
