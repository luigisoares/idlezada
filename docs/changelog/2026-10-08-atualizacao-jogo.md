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

---

# Segunda rodada — dano, ameaça e resistência dos monstros de endgame

## O bug
O override por monstro do jogo (`C1`) monta as entradas de endgame com helpers:
`{...N(key,.82,.54),..._(key,1.28)}`. O `N` reescala o dano corpo a corpo, o dano dos golpes e a
chance deles, e o `_` reescala o HP. O extrator avaliava a tabela com `evalLiteral`, que
transforma qualquer helper em `{}`. Resultado: o site mostrava o dano/HP **de antes do rebalanceamento**
e alguns monstros ficavam **sem resistência**.

## Correção
`mergedMonsterTable` passa a avaliar as três tabelas (`base`, `porNome`, `porKey`) com o
`bundleResolver`, que executa os helpers reais do bundle. Nenhum número foi copiado na mão.

## Efeito medido
- Resistência que estava vazia e agora vem do jogo: `sopping_carcass` (Maggot Cave, que entrou na
  rodada anterior **sem resist**), `devoted_radiant_acolyte`, `devoted_radiant_paragon` e
  `devoted_radiant_warden`. Monstros com resist: 467 → 471.
- Dano/golpes corrigidos em 78 monstros. A ameaça por elemento ("de que me proteger") mudou em 61
  monstros de hunt (Gnomprona 1–3, Bloated/Maggot, Darklight/Wandering Pillar, Radiant + Devoted).
- HP recalculado nessas 11 hunts (ex.: Darklight Emitter 55.000 → 70.400 na hunt).
- Elementos dos bosses: `mimar_haffar` (agora energy 41 / death 39 / physical 20) e `phosphorus`
  (ajuste fino).
- Conferência com a fórmula do jogo: Emitter corpo a corpo 900×0.82 = 738, chance do golpe 35×0.54 ≈ 19.

Checks: todos com 0 falhas. Front v22 → v23.
