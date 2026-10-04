# 2026-10-03 — XP por clear real, bônus de XP, comparar hunts e "sua run"

## O bug
O jogador via ~4.3M de XP por clear na Bloated Man-Maggot (lv1500, solo, VIP, evento
+25%) e o site dizia ~1.05M. Na Wandering Pillar, 5.3M contra 1.07M.

Causa: o jogo monta a tabela final de monstros com dois multiplicadores por cima do
bestiary, e o extrator só lia os overrides por nome e por key:

    i=t1[e]??1; return[e,{...a,...o,...t,...i!==1?{exp:Math.round(a.exp*i)}:{},loot:r1(e,Xp(e,a.loot))}]

- `t1`: XP por monstro nas hunts de lv1500/2000. Bloated ×3, Maggot ×3.2, Darklight
  Source ×2.55, Wandering Pillar ×3.72, Radiant Skyhold ×3.92, Ascendancy ×3.35.
- `r1`: chance de loot nas mesmas hunts (Bloated ×4.65, Maggot ×8.8...).

O extrator agora resolve esses identificadores direto do bundle (`bundleResolver`),
sem copiar os números. 8 hunts foram recalculadas; o resto ficou igual.

## Medido
Previsão no lv1500 com VIP + 25% (somados), contra o que o jogador viu:

| Hunt | Antes | Agora | In-game |
|---|---|---|---|
| Bloated Man-Maggot | 1.05M | 4.26M | ~4.3M |
| Wandering Pillar | 1.07M | 5.01M | ~5.3M |
| Infernal Demon | 2.02M | 2.02M | ~2.2M |

`check-hunts-view` fixa isso (tolerância de 10%).

## A aba Hunts, refeita
- **XP da party.** O XP de um clear é da party, e o jogo mostra esse total (os ~4.3M
  da Bloated). Ele se divide: o líder fica com 40% em trio (60% em duo) e os outros
  dividem o resto. A party são os 3 primeiros personagens visíveis na aba Builds,
  com level e árvore de lá. O líder é escolhido na tela.
- **Bônus por personagem**, somados: VIP (conta), evento ao vivo (lido de
  `baiakidle.com/api/trpc/adminConfig.events`), XP% da árvore e um "extra %" que o
  jogador digita (equipamento, guild). A fatia de cada um usa o próprio level e bônus,
  e o total da party é a soma das fatias.
- **Comparativo.** A busca ou o "+" da lista põe hunts lado a lado numa tabela:
  XP por clear, o XP que você viu, tempo por clear, XP por hora, quanto cada um
  recebe, com que elemento bater, do que se proteger e gold.
- **Sem DPS.** O XP/h sai do tempo por clear que o jogador salva. O campo de colar
  a Session, o golpe médio e o uptime do Avatar saíram; o plano de charms põe os
  elementais por resistência.
- Aba Loot: com a chance real, a Rotten Man-Maggot passou a ser a hunt que mais dropa
  Stone Skin Amulet por clear (o teste foi atualizado).
- **Favicon**: `public/favicon.svg` (ampulheta dourada no verde do site), no index, no simulador e na stamina.

## Em aberto
- **Bony Sea Devil**: a previsão é ~3.35M (VIP + evento) e o jogador lembra de "um
  pouco mais que 2.2M". O Hazardous Phantom (109k de XP) é ~50% do clear; se ele
  aparece menos que 1/4 das vezes, o sorteio de spawn não é uniforme. Precisa de uma
  medição limpa.
- **Boss da wave 10**: o servidor publica `stageBoss: {hp:300, exp:200}` em
  `adminConfig.monsterMult`. O site usa ×2.5 de XP. Se o ×2 do servidor se soma ao
  ×2.5, cada clear ganha mais ~4%. Não confirmado.
- Bônus somados ou multiplicados: o jogo não publica a regra. Pelos números acima, a
  diferença é de 1–2%.
