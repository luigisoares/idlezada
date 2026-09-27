/* ============================================================================
   extract-wiki.js — le a WIKI DO JOGO, que vem embutida no bundle em markdown.

       node tools/extract-wiki.js                     # baixa o bundle, lista os artigos
       node tools/extract-wiki.js --grep "Crítico"    # mostra os trechos com o termo
       node tools/extract-wiki.js --out pasta         # salva cada artigo em pasta/NN-titulo.md
       node tools/extract-wiki.js caminho/bundle.js   # usa um bundle ja baixado

   Por que existe: a wiki e' a fonte das REGRAS que o bundle nao carrega como dado --
   combate (critico +50% de base, onslaught +60%), charms ("bosses nao recebem charm",
   Carnage nas 4 casas coladas), XP rates do servidor (data/xprates.json), custos. O
   calculo de combate roda no servidor; o que sabemos dele vem daqui.

   Nao escreve nada no repo. Os artigos sao strings longas com frontmatter
   (title:/category:) ou markdown (## / **). Os em ingles vem duplicados.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = 'https://baiakidle.com';
const argv = process.argv.slice(2);
const flag = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const grep = flag('--grep'), outDir = flag('--out');
const srcArg = argv.find((a, i) => !a.startsWith('--') && !['--grep', '--out'].includes(argv[i - 1]));

async function loadSource() {
  if (srcArg && fs.existsSync(srcArg)) return fs.readFileSync(srcArg, 'utf8');
  const html = await (await fetch(SITE)).text();
  const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  if (!m) throw new Error('nao achei o <script> do bundle no index de baiakidle.com');
  console.error(`bundle: ${SITE}${m[1]}`);
  return (await fetch(SITE + m[1])).text();
}

function articles(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const q = s[i];
    if (q !== '"' && q !== '`') continue;
    let j = i + 1;
    while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; }
    const t = s.slice(i + 1, j);
    if (t.length > 800 && /(^|\n)(title: |## )|\*\*/.test(t.replace(/\\n/g, '\n')))
      out.push(t.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\`/g, '`'));
    i = j;
  }
  return out;
}
const titleOf = t => ((t.match(/(^|\n)title: ([^\n]+)/) || [])[2]) || ((t.match(/#+ ([^\n]{3,80})/) || [])[1]) || '(sem titulo)';

loadSource().then(src => {
  const arts = articles(src);
  if (grep) {
    const re = new RegExp(grep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    for (const [i, t] of arts.entries()) {
      t.split('\n').forEach((line, n, all) => {
        if (re.test(line)) console.log(`[${i} ${titleOf(t)}] ${all.slice(Math.max(0, n - 1), n + 2).join(' / ').slice(0, 400)}`);
      });
    }
    return;
  }
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    arts.forEach((t, i) => fs.writeFileSync(path.join(outDir,
      `${String(i).padStart(3, '0')}-${titleOf(t).toLowerCase().replace(/[^a-z0-9à-ú]+/gi, '-').slice(0, 50)}.md`), t));
    console.log(`${arts.length} artigos em ${outDir}`);
    return;
  }
  arts.forEach((t, i) => console.log(`${String(i).padStart(3)}  ${t.length.toString().padStart(6)}  ${titleOf(t)}`));
  console.log(`\n${arts.length} artigos. --grep "termo" pra procurar, --out pasta pra salvar.`);
}).catch(e => { console.error('ERRO: ' + e.message); process.exit(1); });
