/* ============================================================================
   bump-front-version.js — sobe a versao de cache do front, nos dois lugares juntos.

       node tools/bump-front-version.js        # N -> N+1

   Todo CSS/JS do public/index.html (e o trees/engine do simuladorbuild.html) vai
   com ?v=N, e o app.js poe o mesmo N no src dos iframes (FRONT_V). Sem subir, o
   navegador de quem ja abriu o site continua servindo o arquivo velho do cache --
   inclusive os de dado (hunts.js, loot.js...). Rode em TODA mudanca de public/.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
const idx = path.join(PUB, 'index.html'), sim = path.join(PUB, 'simuladorbuild.html'), app = path.join(PUB, 'app.js');

const a = fs.readFileSync(app, 'utf8');
const m = a.match(/const FRONT_V = '(\d+)';/);
if (!m) { console.error("ERRO: nao achei const FRONT_V = 'N'; em public/app.js"); process.exit(1); }
const from = +m[1], to = from + 1;

let hits = 0;
for (const f of [idx, sim]) {
  const s = fs.readFileSync(f, 'utf8');
  const t = s.replace(/\?v=(\d+)"/g, (x, n) => { hits++; if (+n !== from) console.warn(`aviso: ${path.basename(f)} tinha ?v=${n}, esperado ${from}`); return `?v=${to}"`; });
  fs.writeFileSync(f, t);
}
fs.writeFileSync(app, a.replace(m[0], `const FRONT_V = '${to}';`));
console.log(`versao do front ${from} -> ${to} (${hits} includes + FRONT_V)`);
