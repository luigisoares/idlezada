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
    set innerHTML(v) { this._html = String(v); },
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
  return { slots: doc.getElementById('slots').kids, E: sandbox.window.Engine, store };
}

/* rank do Battle Tactics dentro do share code que o card gerou */
function codedRank(E, voc, el) {
  const back = E.decode(el.querySelector('[data-role=code]').value);
  return back ? (back.ranks[E.tacticsNodeId(voc)] || 0) : null;
}
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

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
