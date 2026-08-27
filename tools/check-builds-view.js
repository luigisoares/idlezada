/* ============================================================================
   check-builds-view.js — roda a ABA Builds de verdade, num DOM de mentira.

       node tools/check-builds-view.js        (sai != 0 se algo falhar)

   O check-builds.js prova o otimizador; este prova que a TELA fala com ele sem
   explodir -- e que o marker do Battle Tactics faz o que o clique promete. Mesmo
   idioma do check-hunts-view.js: sem jsdom, um stub que implementa so o que o
   public/app.js toca, guardando os handlers pra dar pra simular clique.

   O que ele pega, e que `node --check` nao pega: TDZ (const usado antes da linha
   dele -- o catch do loadState engole o erro e as builds salvas somem em silencio),
   funcao que sumiu do export do Engine, e o share code saindo diferente do que a
   linha do marker mostra.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PUB = path.join(__dirname, '..', 'public');

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

/* ------------------------------------------------------------------ DOM stub */
const camel = k => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function makeEl(tag) {
  return {
    tag, _html: '', _q: {}, className: '', textContent: '', value: '',
    hidden: false, checked: false, disabled: false, dataset: {}, handlers: {}, kids: [],
    get innerHTML() { return this._html; },
    /* como no DOM de verdade, escrever innerHTML descarta os filhos. Sem isso o
       render() da tela (que faz innerHTML='' e reanexa) DUPLICAVA os cards no stub,
       e um teste que re-renderiza acabava lendo o card velho. */
    set innerHTML(v) { this._html = String(v); this.kids.length = 0; },
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    setAttribute(k, v) { this['attr_' + k] = v; },
    appendChild(c) { this.kids.push(c); return c; },
    /* o mesmo seletor devolve sempre o mesmo stub: e' o que faz o listener registrado
       no render sobreviver ate o clique, como acontece num DOM de verdade. */
    querySelector(sel) { return this._q[sel] || (this._q[sel] = makeEl('stub')); },
    /* [data-x] e' lido do proprio HTML: assim o dataset dos stubs e' o que a tela
       realmente escreveu, e nao o que o teste imaginou. */
    querySelectorAll(sel) {
      const m = /^\[data-([a-z-]+)\]$/.exec(sel);
      if (!m) return [];
      const out = [], re = new RegExp('data-' + m[1] + '="([^"]*)"', 'g');
      let x;
      while ((x = re.exec(this._html))) { const e = makeEl('stub'); e.dataset[camel(m[1])] = x[1]; out.push(e); }
      return out;
    },
    fire(ev, e) { for (const fn of this.handlers[ev] || []) fn(e || {}); },
    closest() { return null; },
  };
}
/* clique no chip de build escondida: o handler e' delegado na faixa */
const showClick = i => ({
  target: { closest: sel => (sel === '[data-show]' ? { dataset: { show: String(i) } } : null) },
});
/* clique do stepper: o handler e' delegado no container e le ev.target.closest */
const stepClick = delta => ({
  target: { closest: s => (s === '[data-tac]' ? { dataset: { tac: String(delta) } } : null) },
});

function run(saved) {
  const store = {};
  if (saved) store['idlezada.builds.v3'] = JSON.stringify(saved);
  const els = {};
  const doc = {
    getElementById: id => (els[id] = els[id] || makeEl(id)),
    createElement: t => makeEl(t),
    querySelectorAll: () => [],
  };
  const sandbox = {
    console, document: doc, window: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
    },
    frames: { sim: makeEl('iframe'), stamina: makeEl('iframe') },
    /* o save da tela e' debounced (setTimeout de 200ms). Aqui ele roda na hora: o teste
       quer olhar o localStorage logo depois do clique, e nao ha event loop pra esperar. */
    setTimeout: fn => { fn(); return 0; },
    clearTimeout: () => {},
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = doc;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  for (const f of ['trees.js', 'engine.js', 'app.js'])
    vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sandbox, { filename: f });
  return { slots: doc.getElementById('slots').kids, slotsEl: doc.getElementById('slots'),
    hidden: doc.getElementById('hidden-builds'), E: sandbox.window.Engine, store };
}

/* rank do Battle Tactics dentro do share code que o card gerou */
function codedRank(E, voc, el) {
  const back = E.decode(el.querySelector('[data-role=code]').value);
  return back ? (back.ranks[E.tacticsNodeId(voc)] || 0) : null;
}
/* o stub nao parseia HTML: `querySelector` devolve um stub em branco, entao o que
   a tela escreveu so existe no innerHTML. Estes leem de la, como o shownRank. */
const attrOf = (el, role, attr) => {
  const re = new RegExp(attr + '="([^"]*)"[^>]*data-role="' + role + '"');
  const m = re.exec(el.innerHTML);
  return m ? m[1] : null;
};
const labelOf = el => { const m = /value="([^"]*)"[^>]*data-role="label"/.exec(el.innerHTML); return m ? m[1] : null; };
const levelOf = el => attrOf(el, 'level', 'value');
const shownLabels = app => app.slots.map(labelOf);

const shownRank = el => {
  const m = /data-role="tac-n">(\d+)</.exec(el.innerHTML);
  return m ? Number(m[1]) : null;
};
/* o numero que o stepper mostra depois de um clique. Vem de dentro da linha, e nao do
   card: o stub devolve um objeto por seletor, entao consultar do lugar errado devolve
   outro elemento -- do mesmo jeito que no DOM de verdade o [data-role=tac-n] mora
   dentro do [data-role=tac-row]. */
const stepper = el => el.querySelector('[data-role=tac-row]').querySelector('[data-role=tac-n]').textContent;

console.log('== builds view: a tela abre, e o marker do Battle Tactics faz o que promete ==');
{
  /* 1. ABRIR COM ESTADO SALVO -- e o estado tem que CHEGAR na tela. sanitizeSlot roda
        dentro do loadState(), no init do modulo: um helper novo declarado depois dele
        com `const` da TDZ, o catch de 'storage corrompido' engole o erro, e a tela abre
        nos slots padrao -- as builds salvas somem sem nenhum sinal de que houve erro. */
  const salvo = { tab: 'builds', slots: [
    { label: 'A', voc: 'knight',   level: 900,  obj: 'dano', element: 'physical', perks: [], perksOpen: true,  forcePerks: false },
    { label: 'B', voc: 'druid',    level: 500,  obj: 'xp',   element: 'none',     perks: [], perksOpen: false, forcePerks: false },
    { label: 'C', voc: 'sorcerer', level: 1500, obj: 'aoe',  element: 'none',     perks: [], perksOpen: false, forcePerks: false },
  ] };
  const app = run(salvo);
  ok(app.slots.length === 3, `a tela renderizou ${app.slots.length} cards, esperava 3`);

  /* 2. DEFAULT POR OBJETIVO na linha do marker: build de boss vem limpa, quem farma
        sozinho ja vem com o degrau -- e o que a linha mostra e' o que o share code
        carrega (a tela e o motor lendo o mesmo E.defaultTactics). */
  ok(shownRank(app.slots[0]) === 0, `knight/dano abriu com o marker em r${shownRank(app.slots[0])}, esperava r0`);
  ok(shownRank(app.slots[1]) === 3, `druid/xp abriu com o marker em r${shownRank(app.slots[1])}, esperava r3`);
  ok(shownRank(app.slots[2]) === 3, `sorcerer/aoe abriu com o marker em r${shownRank(app.slots[2])}, esperava r3`);
  ok(codedRank(app.E, 'knight', app.slots[0]) === 0,
    'knight/dano: o share code trouxe Battle Tactics sem ninguem pedir');
  ok(codedRank(app.E, 'druid', app.slots[1]) === 3,
    `druid/xp: a linha diz r3 e o share code tem r${codedRank(app.E, 'druid', app.slots[1])}`);

  /* 3. O CLIQUE CHEGA NA BUILD. Nao basta o numero da tela mudar: o que vale e' o share
        code, que e' o que a pessoa cola no jogo. */
  const card = app.slots[0], perks = card.querySelector('[data-role=perks]');
  for (let i = 0; i < 5; i++) perks.fire('click', stepClick(1));
  ok(stepper(card) === 5, `depois de 5 cliques no +, a linha mostra ${stepper(card)}`);
  ok(codedRank(app.E, 'knight', card) === 5,
    `knight/dano/900 pediu r5 no stepper e o share code veio com r${codedRank(app.E, 'knight', card)}`);

  // o - volta, e o r0 e' um pedido legitimo (nao um "sem opiniao")
  for (let i = 0; i < 5; i++) perks.fire('click', stepClick(-1));
  ok(codedRank(app.E, 'knight', card) === 0,
    `voltando pro r0 o share code ainda traz r${codedRank(app.E, 'knight', card)}`);
  perks.fire('click', stepClick(-1));
  ok(stepper(card) === 0, `o stepper passou abaixo de zero (${stepper(card)})`);

  /* 4. O TETO E' O maxRank DA ARVORE, nao um numero solto na tela. */
  const teto = app.E.nd('knight', app.E.tacticsNodeId('knight')).maxRank;
  for (let i = 0; i < teto + 4; i++) perks.fire('click', stepClick(1));
  ok(stepper(card) === teto, `o stepper passou do maxRank: ${stepper(card)} > r${teto}`);
  ok(codedRank(app.E, 'knight', card) <= teto,
    `o share code veio com r${codedRank(app.E, 'knight', card)}, acima do maxRank r${teto}`);

  /* 5. O QUE VOCE PEDIU NAO E' SOBRESCRITO. Antes do primeiro clique o marker segue o
        objetivo; depois dele o numero e' seu, e e' isso que vai pro localStorage. */
  const gravado = JSON.parse(app.store['idlezada.builds.v3']).slots;
  ok(gravado[0].tactics === teto, `o rank escolhido nao foi pro localStorage (${gravado[0].tactics})`);
  ok(gravado[1].tactics == null,
    'o card que ninguem tocou gravou um rank explicito e parou de seguir o objetivo');
}

console.log('== o 4o slot (paladino) entra sem levar as builds salvas junto ==');
{
  /* A versao passada exigia `slots.length === 3` e, quando nao batia, caia nos
     padroes. Ganhar um slot novo teria APAGADO as tres builds de todo mundo, em
     silencio -- o mesmo estrago da nota do tacticsNode, por outro caminho. */
  const tres = { tab: 'builds', slots: [
    { label: 'MeuEK', voc: 'knight',   level: 900, obj: 'dano', element: 'physical', perks: [], perksOpen: false, forcePerks: false },
    { label: 'MeuED', voc: 'druid',    level: 800, obj: 'xp',   element: 'none',     perks: [], perksOpen: false, forcePerks: false },
    { label: 'MeuMS', voc: 'sorcerer', level: 700, obj: 'aoe',  element: 'none',     perks: [], perksOpen: false, forcePerks: false },
  ] };
  const app = run(tres);
  ok(app.slots.length === 3, `com o paladino escondido a tela mostra 3, mostrou ${app.slots.length}`);
  ok(labelOf(app.slots[0]) === 'MeuEK', `a build salva 1 sumiu: veio "${labelOf(app.slots[0])}"`);
  ok(labelOf(app.slots[1]) === 'MeuED', `a build salva 2 sumiu: veio "${labelOf(app.slots[1])}"`);
  ok(labelOf(app.slots[2]) === 'MeuMS', `a build salva 3 sumiu: veio "${labelOf(app.slots[2])}"`);
  ok(levelOf(app.slots[0]) === '900', `o level da build 1 veio ${levelOf(app.slots[0])}`);
  ok(levelOf(app.slots[1]) === '800', `o level da build 2 veio ${levelOf(app.slots[1])}`);
  ok(codedRank(app.E, 'knight', app.slots[0]) != null, 'a build salva continua gerando share code');

  /* o paladino existe no state mesmo fora da grade -- e o chip prova isso. A tela
     nao grava no init (so em interacao), entao o storage so e conferido DEPOIS de
     um clique de verdade. */
  ok(app.hidden.innerHTML.includes('Royal Paladin'), 'o paladino devia estar la como chip');
  app.hidden.fire('click', showClick(3));
  const gravado = JSON.parse(app.store['idlezada.builds.v3']).slots;
  ok(gravado.length === 4, `o state devia ter 4 slots, tem ${gravado.length}`);
  ok(gravado[0].label === 'MeuEK', 'e as builds salvas foram junto pro storage');
  ok(gravado[0].level === 900, 'com o level original');
  ok(gravado[3].label === 'Royal Paladin', 'e o 4o e o paladino');

  /* o save de 4 volta inteiro, sem duplicar nem trocar de lugar */
  const volta = run(JSON.parse(app.store['idlezada.builds.v3']));
  ok(volta.slots.length === 4, `save de 4 com o paladino visivel mostra 4, mostrou ${volta.slots.length}`);
  ok(labelOf(volta.slots[0]) === 'MeuEK', 'as builds de uso continuam la');
  ok(labelOf(volta.slots[3]) === 'Royal Paladin', 'e o paladino no mesmo lugar');
}

console.log('== o chip traz o paladino pra fileira dos outros tres ==');
{
  const app = run(null);
  ok(app.slots.length === 3, 'comeca com 3 na tela');
  ok(app.hidden.innerHTML.includes('Royal Paladin'), 'e o paladino aparece como chip de escondido');
  ok(app.hidden.innerHTML.includes('data-show="3"'), 'o chip aponta pro indice 3');
  ok(app.slotsEl.className === 'slots n3', `a grade devia estar em n3, esta "${app.slotsEl.className}"`);

  /* clicar no chip traz o card pra grade, lado a lado */
  app.hidden.fire('click', showClick(3));
  ok(app.slots.length === 4, `depois do chip deviam ser 4 cards, sao ${app.slots.length}`);
  ok(labelOf(app.slots[3]) === 'Royal Paladin', 'e o 4o e o paladino');
  ok(app.slotsEl.className === 'slots n4', `a grade devia virar n4, esta "${app.slotsEl.className}"`);
  ok(app.hidden.innerHTML === '', 'sem nada escondido, a faixa de chips some');
  ok(JSON.parse(app.store['idlezada.builds.v3']).slots[3].shown === true, 'e o mostrar foi gravado');

  /* o card trazido e um card inteiro: tem objetivo, code e botao de simulador */
  const code = app.slots[3].querySelector('[data-role=code]').value;
  ok(typeof code === 'string' && code.length > 0, 'o paladino trazido devia ter share code');
  ok(app.E.decode(code) != null, 'e o code tem que decodificar');
}

console.log('== o ✕ do card esconde de volta, sem apagar a build ==');
{
  const app = run(null);
  app.hidden.fire('click', showClick(3));
  /* mexe no level do paladino antes de esconder: o dado tem que sobreviver */
  app.slots[3].querySelector('[data-role=level]').fire('input', { target: { value: '150' } });
  app.slots[3].querySelector('[data-role=hide]').fire('click');

  ok(app.slots.length === 3, `esconder devia voltar pra 3 cards, ficaram ${app.slots.length}`);
  ok(app.slotsEl.className === 'slots n3', 'e a grade volta pra n3');
  ok(app.hidden.innerHTML.includes('Royal Paladin'), 'e o chip volta pra faixa');
  const gravado = JSON.parse(app.store['idlezada.builds.v3']).slots;
  ok(gravado.length === 4, 'esconder NAO apaga o slot');
  ok(gravado[3].shown === false, 'so marca como escondido');
  ok(gravado[3].level === 150, `e o level que voce digitou fica guardado (veio ${gravado[3].level})`);

  /* e volta como estava */
  app.hidden.fire('click', showClick(3));
  ok(levelOf(app.slots[3]) === '150', `ao trazer de volta, o level devia ser 150, veio ${levelOf(app.slots[3])}`);
}

console.log('== esconder uma das tres tambem funciona ==');
{
  const app = run(null);
  app.slots[0].querySelector('[data-role=hide]').fire('click');
  ok(app.slots.length === 2, `deviam sobrar 2 cards, sobraram ${app.slots.length}`);
  ok(app.slotsEl.className === 'slots n2', 'a grade acompanha');
  ok(app.hidden.innerHTML.includes('Knight') && app.hidden.innerHTML.includes('Royal Paladin'),
    'e os dois escondidos viram chips');
}

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
