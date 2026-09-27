# Rodada de 2026-09-26 — atualização do jogo, loot de boss, charms e revamp

Registro do que mudou, **por que**, e o que foi medido. O "como fazer de novo" está no
skill `.claude/skills/updating-game-data/SKILL.md`; o detalhe técnico de cada regra está
no `README.md`.

## Fonte

- Bundle do jogo: `https://baiakidle.com/assets/index-cdvlGIjW.js` (PWA de 25/09).
- Wiki do jogo: vem **dentro do bundle**, em markdown (artigos com frontmatter
  `title:`/`category:`). Foi de lá que saíram as regras de crítico, charms e boss.

## Dados

| O quê | Antes | Depois |
|---|---|---|
| Hunts | 79 | 87 (Moonstone Crater, Forbidden Gardens, Asura Citadel, Thalassara Surroundings, Radiant Skyhold/Ascendancy + Devoted) |
| Bosses (salas + world) | 101 | 106 (Rakesh Moonfang, The Moonsnow Magnolia, Mimar Haffar, Maior Domus, Phosphorus) |
| Monstros no bestiary | 359 | 472 |
| Itens pesquisáveis na aba Loot | 864 | 1.433 (896 de hunt + os que só caem de boss) |

Mudanças do jogo em hunts antigas: Minion of Versperoth passou a dar XP (0 → 4000;
Cliffstrider +~16% XP/clear); maggot-cave, bloatedmanmaggot-cave, wanderingpillar-cave e
draklightsource-cave subiram de level 1200 → 1500; Bloated Man Maggot perdeu o Bloodjaw.

Ficaram de fora de propósito: 59 bosses de listas do bundle que o cliente nunca mostra
(sem `avail` e sem `mapId`); o HP dos world bosses (o servidor escala por jogador).
`avail:"test"` foi copiado pro dado sem efeito — 10 hunts que o site já mostrava têm ele.

## Extrator (`tools/extract-game-data.js`)

- Cria hunt nova com as mesmas contas das 79 originais (conferido: reproduz todas com ±1
  de arredondamento).
- Recalcula hunt gravada só quando um insumo mudou (monstros, HP/XP, pack, boss, peso de
  spawn); só o level mudou → só o level. Intocada fica como estava (o gold dela é a prova
  do `check-loot`). Monstro sumido do bestiary → a hunt gravada é mantida, com aviso.
- Sincroniza salas de boss; fórmula de elementos calibrada contra os 101 do guia (melee
  ×0,6, golpe com alvo ×1,1, área ×0,3 — 100 exatos, 1 com 1 ponto de erro).
- Publica o loot dos bosses em `LOOT.b`, lido pela key do monstro (`oberon` →
  `grand_master_oberon`).

## Regras do jogo corrigidas no modelo

| Regra | Antes | Agora | Fonte |
|---|---|---|---|
| Crítico | 2× + crit dmg | **1,5×** + crit dmg | wiki: "Crítico: +50% de base (+ Crit Damage)" |
| Carnage | acerta 2 vizinhos sempre | vizinhos vivos de verdade: **0,73** num pack de 4 | wiki: 4 casas coladas; geometria do anel |
| Dano por golpe (elementais) | DPS ÷ atk speed | **golpe médio** informado pelo jogador | proc é por acerto, runa e magia inclusive |
| Uptime do Avatar | só da árvore | árvore, ou o valor do jogador (forja/poção) | wiki: Transcendence nas pernas |
| Charm em boss de sala | — | não existe | wiki: "Bosses não recebem charm" |

Medido e **não** aplicado: precificar crit chance pelo valor do jogo no otimizador de
builds deu +0,04% líquido nas 108 builds (−3,4% a +5,4% por build, ruído do greedy).
Mudar 70 share codes por zero não valeu; a medição está comentada no `engine.js`.

## Charms (aba Hunts)

- Regra da casa: **Savage Blow, Fatal Hold, Gut e Scavenge sempre**; Adrenaline Burst de
  reserva; Low Blow só onde vale. Passada pela tela (`must`); o modelo sozinho segue a conta.
- Com Avatar (~43–55% de uptime no 900), Savage Blow T3 ≈ +15–16% contra Low Blow T3 ≈ +3%.
- Elemental × Carnage: no 900, ~198 de dano por golpe contra ~867 por morte → o elemental
  ganha quando o bicho leva mais de ~4–5 golpes. Com golpe de 2k (runa), a Bony Sea Devil
  troca Low Blow/Carnage por Wound/Divine Wrath/Enflame a +11–12% cada.
- Scavenge/Gut vão pras criaturas que rendem mais gold por clear no loot real.
- Todos os charms começam marcados como possuídos (`idlezada.charmCfg.v2`; da v1 só os slots).

## Builds

- Perk marcado é garantido e a lista é fechada (não marcado fica de fora, salvo
  pré-requisito ou caminho do Battle Tactics). Antes marcar só priorizava.
- Resumo lista todo perk alocado (Battle Healing, que só dá atributo, sumia), com "locked".
- **+ XP focus**: qualquer objetivo com foco em XP por cima (druid Avatar +22% exp, XP/h
  +11% no 900).
- Level padrão 900.

## Front (V3)

- Uma família (Manrope), verde-escuro + dourado, elementos como cor de dado. A V2 com fonte
  pixel e a faixa de 7 barras foi rejeitada.
- Hunts: coluna de ajustes, pódio, **Hit with / Protect from**, ordenação pelo cabeçalho,
  busca, filtro "só as que eu entro", cards no celular, plano de charms limpo.
- Bosses: barra de dano segmentada, loot por boss, busca por item, ordenar por loot.
- Cache-busting: `?v=N` em todo CSS/JS do `index.html` e `FRONT_V` no `app.js`.

## Ferramentas pra próxima atualização

- Skill `.claude/skills/updating-game-data/SKILL.md`: o passo a passo, o que cada linha do
  extrator significa, o que é feito à mão e onde mora cada regra. Validado com um agente
  sem contexto antes (sabia o básico pelo README, travava em XP rates, árvores, wiki e
  cache) e depois (resolveu os cinco casos do cenário de teste).
- `tools/extract-wiki.js`: lê a wiki do jogo embutida no bundle (`--grep`, `--out`).
- `tools/bump-front-version.js`: sobe o `?v=` e o `FRONT_V` juntos.
- O extrator compara as árvores de talento do bundle com `data/trees.json` (só avisa) e
  regenera `public/trees.js` e `public/xprates.js` a partir dos JSON editados à mão.
- Os testes de loot tiram as contagens do próprio dado: hunt nova não quebra teste.
- As XP rates **não** estão no bundle: a página de dados do servidor é preenchida ao vivo
  (`{{rates:exp}}`), então elas são lidas no navegador.

## Testes

7 scripts, todos verdes no fim da rodada (`check-bosses-view.js` é novo).

## Pendências (decisão do jogador)

- "Protect from" destacar o maior dano elemental, com o físico à parte (quase toda hunt dá
  Physical em primeiro).
- Gut: +12% relativo (assumido) ou +12 pontos percentuais.
