/* ============================================================================
   CONFERE O SITE CONTRA O SERVIDOR AO VIVO -- sem login, so leitura.

   O bundle e' o ponto de partida, mas o jogo roda com o que o admin grava no
   servidor por cima dele. Este script pergunta ao servidor e aponta onde o repo
   diverge:
     - stages (hunts): monstros, level minimo, pack, pesos, boss
       (/api/trpc/adminConfig.stages -- o mesmo que o cliente recebe no "huntgate")
     - multiplicadores globais de monstro (/api/trpc/adminConfig.monsterMult),
       contra as constantes que o extrator e o xprates.json assumem

   Uso: node tools/check-live.js      (sai com codigo 1 se algo divergir)
   Divergencia nas hunts -> rode tools/extract-game-data.js, que aplica o override.
   Divergencia nos multiplicadores -> decisao de gente: ver o skill updating-game-data.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = 'https://baiakidle.com';
const DATA = path.join(__dirname, '..', 'data');

let fails = 0;
const bad = msg => { fails++; console.log('  DIVERGE: ' + msg); };

async function trpc(name) {
  const r = await fetch(`${SITE}/api/trpc/${name}`);
  if (!r.ok) throw new Error(`${name} respondeu ${r.status}`);
  return (await r.json())?.result?.data;
}

/* o que o repo assume de cada multiplicador do servidor (em %, como o servidor manda).
   Onde mora cada um: HUNT_HP_MULT / PHASE_BOSS_HP no extrator; roomBoss em
   data/xprates.json (4.5 = 3 do bundle x 1.5 do servidor). atk e def ficam de fora: atk e'
   uniforme e def so escala armadura -- nenhum muda elemento de bater/defender. */
const EXPECT = {
  'monster.hp': 200, 'monster.exp': 100,
  'stageBoss.hp': 300,
  'boss.hp': 150, 'boss.exp': 100,
};

async function main() {
  const [stages, mult] = await Promise.all([trpc('adminConfig.stages'), trpc('adminConfig.monsterMult')]);
  const hunts = JSON.parse(fs.readFileSync(path.join(DATA, 'hunts.json'), 'utf8'));

  console.log(`== hunts: ${hunts.length} no repo, ${stages.length} no servidor ==`);
  const byId = new Map(hunts.map(h => [h.id, h]));
  for (const s of stages) {
    const h = byId.get(s.id);
    if (!h) { bad(`${s.id} (${s.name}) esta no servidor e nao no site`); continue; }
    const keys = h.monsters.map(m => m.key);
    if (keys.join() !== s.monsters.join()) bad(`${s.id} monstros [${keys}] -> servidor [${s.monsters}]`);
    if (h.minLevel !== s.minLevel) bad(`${s.id} level ${h.minLevel} -> servidor ${s.minLevel}`);
    if ((h.packBase || 4) !== (s.maxAlive || 4)) bad(`${s.id} pack ${h.packBase} -> servidor ${s.maxAlive}`);
    if (s.bossKey && h.boss && h.boss.key !== s.bossKey) bad(`${s.id} boss ${h.boss.key} -> servidor ${s.bossKey}`);
    const w = Array.isArray(s.weights) && s.weights.length === s.monsters.length && new Set(s.weights).size > 1 ? s.weights : null;
    const have = h.monsters.some(m => m.spawn != null) ? h.monsters.map(m => m.spawn) : null;
    if (JSON.stringify(w) !== JSON.stringify(have)) bad(`${s.id} pesos ${JSON.stringify(have)} -> servidor ${JSON.stringify(w)}`);
    byId.delete(s.id);
  }
  for (const id of byId.keys()) bad(`${id} esta no site e nao no servidor`);
  const missingResist = hunts.flatMap(h => h.monsters.filter(m => !m.resist || !Object.keys(m.resist).length).map(m => `${h.id}/${m.key}`));
  if (missingResist.length) bad(`monstro de hunt sem resistencia: ${missingResist.join(', ')}`);

  console.log('== multiplicadores do servidor (monsterMult) ==');
  const cfg = mult && mult.config || {};
  console.log('  servidor: ' + JSON.stringify(cfg));
  for (const [k, want] of Object.entries(EXPECT)) {
    const [grp, f] = k.split('.');
    const got = cfg[grp] && cfg[grp][f];
    if (got == null) continue;   // servidor nao sobrescreve: vale o default (100)
    if (got !== want) bad(`${k} = ${got}%, o repo assume ${want}%`);
  }
  if (cfg.stageBoss && cfg.stageBoss.exp != null)
    console.log(`  nota: stageBoss.exp = ${cfg.stageBoss.exp}% -- o site usa PHASE_BOSS_XP 2.5 (confirmado no jogo); reconfira se mudar`);

  console.log(fails ? `\n${fails} divergencia(s)` : '\ntudo igual ao servidor');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
