# idlezada — mini-projeto unificado de builds (design)

Data: 2026-08-18 · Status: aprovado · **Sem commits, tudo local.**

## Objetivo

Unificar os três arquivos soltos (`simuladorbuild.html`, `trees.json`, `stamina.html`) num
mini-projeto de front-end estático, e adicionar o recurso principal: um **gerador de build
automático** que, dado *vocação + level + objetivo*, monta a árvore sozinho e entrega o
**share code copiável**, compatível byte-a-byte com o Baiak Idle.

Restrições dadas pelo usuário:
- Estático, sem build, abre no `file://` (duplo-clique). Sem framework, sem servidor.
- **Sem commits.** Tudo local.
- `stamina.html` **não é editado** — entra só na navegação.
- Usar **localStorage** como "backend" pra não perder o estado ao recarregar.
- Nos casters, **escolher o elemento de dano** (só os presentes na árvore da vocação).

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `trees.js` | `window.TREES = {…}` — fonte única dos dados das 5 árvores (alvo do re-sync). Gerado de `trees.json`. |
| `engine.js` | Motor validado (cópia verbatim): custo, `reach`/`valid`, `aggregate`, `encode`/`decode` + o novo `autobuild()` + perfis de peso. Sem DOM. |
| `index.html` | Home = gerador de 3 builds. Abas no topo: **Builds · Simulador · Stamina**. |
| `app.js` | Wiring da tela de 3 builds + localStorage. |
| `styles.css` | Estilos compartilhados (segue a paleta escura atual). |
| `simuladorbuild.html` | Simulador interativo. Edição mínima: passa a puxar `trees.js` (dado single-source). Engine inline mantido. Entra como aba via `<iframe>`. |
| `stamina.html` | Intocado. Entra como aba via `<iframe>`. |

`encode`/`decode` ficam idênticos aos atuais → share code continua compatível. Sem `fetch`
(quebra no `file://`): dados entram por `<script src="trees.js">`.

## Tela de 3 builds (home)

Três colunas (empilham no mobile), uma por personagem:
- Rótulo editável (default: Knight / Elder Druid / Master Sorcerer).
- Seletor de vocação (default Knight / Druid / Sorcerer, trocável).
- Input de level (= orçamento de pontos, 1 ponto/level).
- Objetivo: **Dano · Avatar · Tank · XP · Atk Speed**.
- Seletor de **Elemento** (só aparece no Dano quando a vocação tem 2+ elementos de dano).
- Saída: pontos usados / level, resumo de stats (reusa `aggregate`), o share code + botão Copiar,
  e "Abrir no simulador" (troca pra aba Simulador com `#CODE` no iframe).
- Rebuild instantâneo ao mudar qualquer campo. Estado persiste em localStorage
  (`idlezada.builds.v1`): por slot `{label, voc, level, objective, element}` + aba ativa.

## Otimizador `autobuild(voc, level, objective, opts)`

Greedy com custo-benefício e **abertura de caminho amortizada**:
- Cada objetivo é um perfil de pesos por stat. `valor(nó) = Σ peso[stat] × quantidade`
  (soma sub-mapas de `absorbPct`/`elementDmgPct`; specials via `peso[special.key]`).
- A cada iteração: entre os nós não-maxados, escolhe o de melhor razão. Para nós já
  conectados a razão é `valor(próximo ponto)/custo(próximo ponto)`; para nós bloqueados,
  amortiza o valor do alvo pelo custo do caminho mais barato até ele (assim o Avatar puxa a
  cadeia inteira). Aloca 1 ponto no primeiro passo do melhor caminho e re-avalia.
- Só aloca nós conectados (reusa `canAlloc`) → resultado sempre passa em `valid()` e gera
  código legítimo. Para quando nada mais benéfico cabe no orçamento.
- `damageElements(voc)`: detecta na árvore os elementos de dano presentes (chaves de
  `per.elementDmgPct`), pra alimentar o seletor e o peso do elemento escolhido.

Perfis (ajustáveis em `engine.js`):

| Objetivo | Prioriza |
|---|---|
| Dano | atk% / dano de magia / dano do elemento escolhido (ou todos) / crit chance+dano / atk speed; specials de dano (execute, double-shot, chain, slash) |
| Avatar | alvo = nó Avatar (abre caminho mais barato até tier 11); sobra vai pra dano |
| Tank | HP% / absorção (todos) / def / armadura / regen; specials dodge, gift_of_life, battle_instinct |
| XP | exp% (altíssimo) + tactics + dano leve pra matar rápido |
| Atk Speed | atk speed (altíssimo) + dano/crit leve |

## Fora de escopo (YAGNI)

Sem salvar builds em arquivo, sem backend real, sem editar a árvore visual na home, sem tocar
no stamina, sem re-sync automático (script separado, se pedido depois).
