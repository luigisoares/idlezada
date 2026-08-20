/* ============================================================================
   model.js — modelo de combate pra COMPARAR builds entre si. Nao faz parte do app.

   O jogo nao publica a formula de dano (a aba Hunts trabalha com o DPS que o
   usuario cola da Session), entao aqui vive um modelo explicito. Ele serve pra
   responder "o objetivo A rende mais que o B?", nunca pra prever DPS absoluto.

   PREMISSAS — cada uma e' uma chance de estar errado. As marcadas [medido] saem
   dos dados do repo; as outras sao suposicoes, e a funcao aceita override pra
   voce testar a sensibilidade delas:

     pack = 4        [medido] packBase de data/hunts.json: 4 em 78 das 79 hunts
                     (a excecao e' Dragon Lair, com 3).
     adj = 2         adjacentes ao alvo num pack de 4, pro cleave alcancar.
     critBase = 2    um crit acerta por 2x + critDmg. O multiplicador real e'
                     desconhecido; testar em 1.5 e 3 nao muda a ordem dos objetivos.
     baseAps = 1.0   ataques por segundo com 0% de atk speed. Importa porque define
                     a velocidade com que o Avatar dispara.
     avatarDur = 15  segundos da forma Avatar (do texto do proprio no), sem reset
                     se disparar de novo dentro dela -- se resetar, o uptime real
                     e' MAIOR que o daqui.
     execFrac = 0.25 execute (+X% abaixo de 25% do HP) rende 25% do bonus na media.

   O QUE O MODELO NAO CONSEGUE RANKEAR: def e armor. Nao existe dano de monstro em
   nenhum arquivo de data/, logo nao ha como converter "+63 def" em EHP. Eles saem
   como pontos crus em `def` e ficam FORA do indice `ehp`, que so considera HP%,
   absorb e dodge. Isso subestima Tank e Puller em um grau desconhecido.
   ============================================================================ */
'use strict';

const DEFAULTS = { pack:4, adj:2, critBase:2, baseAps:1.0, avatarDur:15, execFrac:0.25 };

/* recebe o Engine ja carregado e devolve metrics(voc, level, objetivo, [cfg]). */
module.exports = function (E) {
  return function metrics(voc, level, obj, cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    const build = E.autobuild(voc, level, obj, { element: (cfg && cfg.element) || 'all' });
    const a = E.aggregate(voc, build.ranks);
    const S = a.bonus, sp = a.spec, el = a.elem.elementDmgPct || {};

    // multiplicador de dano: atk / spell / dano do elemento somam no mesmo bolo
    const dmgMult = 1 + ((S.atkPct||0) + (S.spellDmgPct||0) + (el.physical||0))/100;
    const hits = c.baseAps * (1 + (S.attackSpeedPct||0)/100);

    // uptime do Avatar sai do proprio engine, pra nao divergir do otimizador
    const up = E.avatarUptime ? E.avatarUptime(voc, build.ranks) : 0;
    const pc = Math.min(1, (S.critChance||0)/100);
    const cd = (S.critDmg||0)/100;
    // fora da forma crita por chance; dentro dela crita sempre
    const critMult = (1-up)*(1 + pc*(c.critBase-1 + cd)) + up*(c.critBase + cd);

    const single = dmgMult * hits * critMult
      * (1 + (sp.precision||0)/100)
      * (1 + c.execFrac*(sp.execute||0)/100);

    // multi-target: chain limitado pelos alvos que existem, cleave pelos adjacentes
    const chainMult = 1 + 0.6*Math.min(sp.chain||0, c.pack-1);
    const slashMult = 1 + ((sp.slash||0)/100)*Math.min(c.adj, c.pack-1);
    const packThru = single * chainMult * slashMult;

    const absKeys = E.ELORD.filter(e => a.absorb[e]);
    const absAvg = absKeys.length ? absKeys.reduce((x,e)=>x+a.absorb[e],0)/absKeys.length : 0;
    const ehp = (1 + (S.hpPct||0)/100)
      / (1 - absAvg/100)
      / (1 - Math.min(0.9, (sp.dodge||0)/100));

    return {
      obj, spent:build.spent, single, packThru, ehp, up, absAvg,
      hp:(S.hpPct||0), def:(S.defFlat||0)+(S.armorFlat||0),
      cc:(S.critChance||0), cdmg:(S.critDmg||0),
      slash:(sp.slash||0), chain:(sp.chain||0), bi:(sp.battle_instinct||0),
      heal:(S.spellHealPct||0), exp:(S.expPct||0),
    };
  };
};
module.exports.DEFAULTS = DEFAULTS;
