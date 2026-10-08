# 2026-10-08 — atualização de dados do jogo

## O que mudou
- Extração do bundle `index-DIZN3Xsh.js` (472 monstros, 87 hunts, 24 charms, 100 salas de boss).
- **Maggot Cave**: saiu `oozing_corpus`, entrou `sopping_carcass`. A hunt foi recalculada (XP/HP/gold por clear).
- Loot: entradas novas de loot publicadas (261 criaturas + 106 bosses).
- Árvores de talento e charms: iguais ao bundle.

## Em aberto
- **Darklight / Emitter**: o site do jogo não mostra mais o Darklight Emitter, mas o bundle
  ao vivo ainda o lista em `draklightsource-cave` (Darklight Source) e
  `wanderingpillar-cave` (Wandering Pillar). Por isso o extrator mantém o Emitter nas duas hunts.
  Confirmar no jogo; se ele saiu mesmo, a remoção precisa vir de outra fonte que não o array `monsters` da hunt.
- XP rates (`data/xprates.json`) e HP dos world bosses não foram revisados à mão nesta rodada.

## Verificação
check-builds 3351/0 · check-builds-view 69/0 · check-hunt-model 161/0 · check-hunts-view 80/0 ·
check-loot 136/0 · check-loot-view 115/0 · check-bosses-view 19/0. Front v21 → v22.
