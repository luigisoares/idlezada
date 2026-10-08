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

---

# Terceira rodada — override do servidor e regras de elemento

## Override do servidor (o Emitter)
O painel admin do jogo grava as hunts no servidor, e o cliente (`/jogar/assets/game-*.js`,
mensagem `huntgate`) aplica isso por cima do bundle. A mesma lista é pública em
`/api/trpc/adminConfig.stages`. O extrator agora baixa essa lista e aplica monstros, pesos,
boss, level mínimo, pack e avail, como o servidor faz.

- **Darklight Source:** sem o Darklight Emitter (confere com o print do jogo).
- **Level mínimo:** o servidor mudou o level de 29 hunts (ex.: Darklight/Maggot/Wandering
  Pillar 1500 → 1200, Behemoth 100 → 15, Vexclaw 210 → 450, Gazer 350 → 190).
- Depois da extração, 0 das 87 hunts diverge do servidor em monstros e level.
- HP/EXP conferidos com o print da Darklight Source: Walking Pillar 97.280/61.965,
  Matter 77.184/56.737, Source 80.768/57.286, Striker 76.032/56.610 — todos batem.

## Multiplicadores do servidor (`adminConfig.monsterMult`)
monstro HP 200 / ATK 200 / DEF 150; stageBoss HP 300 / ATK 200 / DEF 300 / EXP 200;
boss HP 150 / ATK 200 / DEF 300.
- HP ×2 e boss de fase HP ×3 já eram usados. `def` só escala a **armadura** (não a resistência
  elemental), e ATK ×2 é uniforme: nenhum dos dois muda o elemento de bater ou de defender.
- **Em aberto:** stageBoss EXP 200 (×2) contra o ×2,5 que o site usa no boss da wave 10.
  O ×2,5 foi confirmado no jogo antes (xprates.json), então não mexi; vale reconferir.

## Regras de elemento
- **Bater:** empate (até 0,5%) vai pro elemental. Physical só é recomendado quando é
  estritamente o melhor. Vale na tabela de hunts, no plano da hunt e no card de boss.
  Mudou em 2 hunts: Elf (physical → earth) e Stone Refiner (physical → ice).
- **Defender:** até 3 elementos (antes, no máximo 2). Elemento abaixo de 5% do dano fica de fora.
- Teste novo em `check-hunt-model` trava as duas regras do bater.

## Verificação
Todos os checks com 0 falhas (`check-loot-view`: o teste que fixava "hunt de level 350"
passou pra 500, porque Gazer e Bulltaur caíram de level no servidor). Front v23 → v24.
