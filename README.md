# Idlezada

Static tools for an idle RPG — a build generator for the 5 vocation trees, an
interactive skill-tree simulator, and a stamina planner. Plain HTML/JS, **no build step**.

## Structure

```
idlezada/
├─ public/               # what gets deployed
│  ├─ index.html         # home: build generator (3 in use + a hideable 4th)
│  ├─ app.js             # builds screen UI + localStorage
│  ├─ engine.js          # engine: cost/validation/aggregate/encode-decode + autobuild
│  ├─ trees.js           # data for the 5 trees (window.TREES) — generated from data/trees.json
│  ├─ hunt-model.js      # hunts: element to hit, element to fear, charm plan, loot per clear
│  ├─ hunts.js           # hunt data (window.HUNTS) — generated from data/hunts.json
│  ├─ charms.js          # charm table (window.CHARMS) — generated from data/charms.json
│  ├─ loot-view.js       # loot screen: item → creature + hunt, starred list, drop tables
│  ├─ loot.js            # loot + sell prices (window.LOOT: m=creatures, b=bosses, p=prices) — generated
│  ├─ bosses-view.js     # bosses screen: real HP, damage bar, loot per boss, favorites
│  ├─ bosses.js          # boss data (window.BOSSES) — generated from data/bosses.json
│  ├─ xprates.js         # live server XP rates (window.XPRATES) — generated from data/xprates.json
│  ├─ styles.css
│  ├─ simuladorbuild.html# interactive simulator (Simulator tab)
│  └─ stamina.html       # stamina calculator (Stamina tab)
├─ data/trees.json       # source data for the trees (not published)
├─ data/monsters.json    # whole bestiary: hp/exp/armor/resist + dmg/abilities (not published)
├─ data/loot.json        # whole bestiary's loot: item / chance / max (not published)
├─ data/prices.json      # sell price in gold of every item (not published)
├─ data/bosses.json      # room bosses (from the bundle) + world bosses (by hand)
├─ data/xprates.json     # live XP rates, read by hand from the in-game wiki page
├─ tools/                # verification (not published, no dependencies)
│  ├─ check-builds.js    # run after touching any weight: node tools/check-builds.js
│  ├─ check-hunt-model.js# run after touching hunt-model.js or re-extracting
│  ├─ check-hunts-view.js# runs the Hunts tab against a fake DOM (catches render breaks)
│  ├─ check-builds-view.js # same, for the Builds tab (catches init + marker breaks)
│  ├─ check-loot.js      # loot model + the gold cross-check that pins the chance scale
│  ├─ check-loot-view.js # runs the Loot tab against a fake DOM
│  ├─ check-bosses-view.js # runs the Bosses tab against a fake DOM (loot included)
│  ├─ extract-game-data.js # the one data script: bundle + server overrides → monsters, loot, prices, charms, hunts, bosses
│  ├─ check-live.js        # compares the site with the live server (hunt overrides, monster multipliers)
│  ├─ extract-wiki.js    # reads the game's wiki (shipped inside the bundle): the source of the rules
│  ├─ bump-front-version.js # raises the ?v= cache version everywhere at once
│  └─ model.js           # combat model used to compare objectives
├─ docs/                 # internal specs + docs/changelog/ (one entry per update round)
├─ .claude/skills/updating-game-data/ # the step-by-step for refreshing the data
└─ .github/workflows/deploy.yml
```

## Run locally

Open `public/index.html` in a browser (double-click). No server, no dependencies (fonts come
from Google Fonts and fall back to system fonts offline).

## Look and feel

One stylesheet (`public/styles.css`) themes every tab, and the simulator and stamina pages
carry the same tokens in their own `<style>`. The look is the site's original identity —
dark green and gold — refined: one type family (Manrope, tabular numbers) for everything,
gold as the only action color, and the seven element colors used strictly as data. Fonts
load from Google Fonts with system fallbacks, so the page still works offline, just plainer.

Every hunt answers the two element questions in plain chips: **Hit with** (the element the
whole pack takes the most damage from, as extra damage over a neutral hit) and **Protect
from** (the biggest damage sources grouped until they cover ~70% of what you take, two
at most). The Hunts tab is a settings rail (character, level, party, Session paste, my
charms, rank / find / "only hunts I can enter") next to a podium with the top three and a
table you can sort by clicking its headers. Search and the level filter are screen-only —
they never touch the ranking or the podium. Under 720px each row becomes a card.

**Cache:** every CSS/JS include in `index.html` carries `?v=N`, and `FRONT_V` in `app.js`
does the same for the simulator and stamina iframes. Bump both together on a front-end
change, or browsers keep serving the old files.

## Objectives (build generator)

Pick a level and an objective; the tree is auto-allocated and a copyable share code is produced.
There are four builds: the three vocations in use, plus a **Royal Paladin that starts hidden** —
the slot for a vocation you are still levelling. Hidden builds are not gone, they are chips above the
grid; click one and the card joins the others in the same row (the grid widens to four). The `✕` on
any card hides it back, keeping everything you had typed. What is shown is saved.

Growing from three slots to four had to be a migration, not a length check: the old
`slots.length === 3` guard fell back to the defaults when it did not match, so simply adding a slot
would have wiped everyone's saved builds in silence. `check-builds-view.js` covers it.
**Only the objectives that the vocation's tree can actually deliver are offered** — Healer and
Heal + Dmg appear for the druid alone (no other tree has spell healing), XP is absent for the knight,
Atk Speed for the druid, and AoE / Puller for the paladin and the monk. The objectives are grouped by
the scenario they win in (single target / pack / defense), because Avatar leads a boss fight and
falls behind on a pack of four, and AoE is the reverse.



- **Damage** — attack / spell / elemental / crit. For casters you can choose the damage element.
- **Crit** — stacks crit chance and crit damage together.
- **Avatar** — opens the cheapest path to the tier-11 Avatar node, then stacks **attack speed and
  crit damage**: inside the form every hit crits, so attack speed pays twice (more guaranteed crits,
  and the form re-triggers per hit, raising uptime). Only this objective chases that node — with the
  node's raw value the other damage objectives all collapsed into the same build.
- **AoE** — multi-target: chain/cleave specials + elemental burst notables. For casters you can
  choose the damage element.
- **Tank** — boss-oriented: HP / absorb / defense / regen plus **Gift of Life**, which is worth more
  than its point cost in a long fight (it survives a lethal hit every 60s, so it is an extra life bar
  several times over — something a "size of the HP bar" index cannot see).
- **Puller** — holds a *pull* instead of one monster: cleave + battle instinct (def per monster in
  melee) + absorb + leech.
- **Healer** — spell healing as the product and mana as the fuel, plus regen, absorb and Gift of
  Life. Only the druid tree has spell healing; other vocations fall back to self-sustain and the
  card says so.
- **Heal + Dmg** — the hybrid: healing and damage in the same build. Weighted 0.65 toward damage on
  purpose — the druid's healing branch saturates around +61%, so a straight 50/50 just produces a
  healer with leftovers.
- **XP** — `xp/h = exp% × kills/h`, so the objective has **two** sides and buys both. Exp saturates
  cheap and early (55 points on the sorcerer for the tree's +10% ceiling, 165 on the druid for +22%),
  which means everything after that is a damage build — so it is weighted as a *real* one, on the
  same scale as Damage, instead of the skewed "light damage" it used to carry (crit damage at a
  third of crit chance, when the two multiply). **Loot is worth zero here**: it does not level anyone
  up, and on the druid it was the objective's second biggest expense — Fortune + Lucky Charm ate 165
  points at level 1000 *after* exp had already maxed the ceiling. The loot ranks that remain are
  mandatory path (Herbalist requires Fortune, Windfall requires Lucky Charm), and the monk's Guiding
  Presence gives exp and loot in the same node.

  XP is also **the one objective besides Avatar that chases the Avatar node**, and the exception is
  deliberate. The rule zeroing that node everywhere else exists because Damage / Crit / AoE / Atk
  Speed are *styles* of hitting: let them all buy the same tier-11 node and they collapse into one
  build, and the preset stops answering what was asked. XP is not a style, it is a metric — there is
  no "XP of crit" versus "XP of attack speed" to collapse — so there is nothing to protect, and at
  43–55% measured uptime the node is too big to leave on the table. It pays for itself only when the
  budget is there: it stays out at level 500 on every vocation and comes in from roughly level 900.

  **Consequence worth knowing:** from around level 1500, XP shows a *higher* damage index than the
  Damage button on the paladin, sorcerer and monk (6.03 vs 4.49 on the paladin at 1500). That is not
  a bug and not XP being secretly better — it is Damage deliberately declining the Avatar node so it
  stays a distinct build. If you want raw damage *with* the Avatar, that is the Avatar button.
- **Atk Speed** — attack speed + light damage/crit.

### "+ XP": any objective with an XP focus on top

Druid and sorcerer players wanted Avatar *and* XP in the same build — the Avatar's
guaranteed crits, while still levelling fast. XP used to be one button among the others, so
it was one or the other. Now every card whose tree has exp (all but the knight) shows a
**+ XP focus** switch under the objectives: on, the build keeps the chosen objective's whole
profile and adds the XP profile's one XP-specific weight (`expPct`), so the exp nodes are
bought first and everything else follows the objective. It is not a 50/50 blend on purpose
— that would dilute exactly what the objective is (the Avatar node, its attack speed).
Off, nothing changes. The Battle Tactics default follows the farming side (r3) unless you
touched the marker, and the Hunts tab builds the same tree.

Measured at level 900 with the `tools/model.js` index: druid Avatar goes from +0% to +22%
exp with the same 43% Avatar uptime, XP/h index 2.84 → 3.16 (+11%); sorcerer Avatar gets
+10% exp at the same 46% uptime, 3.97 → 4.10 — ahead of the plain XP objective (3.95).

### Battle Tactics: a step you choose, not a step everyone pays for

Every card's perk list opens with a **Battle Tactics marker** — a stepper from 0 to 10 that
sets the rank the build should reach. It is a guarantee in both directions: the optimizer
chases the node until it gets there and stops aiming at it the moment it does, so a build
never overshoots the rank you asked for and never stalls halfway up the ladder.

The node is not a linear stat, even though its in-tree description makes it look like one —
the game's combat-AI screen spells out the rest: *"the perfect behavior (aim, positioning,
kiting) exists from level 1 and the % is the chance of nailing it on each decision — level
provides half the quality (up to 2000) and the Battle Tactics node the other half (each rank
is also worth +100 levels; **tactics level 3 unlocks the infinite kite without a tank**)."*

Rank costs are triangular (`cost·r(r+1)/2`), so the step is cheap and everything past it is not:

| rank | 1 | 2 | **3** | 4 | 10 |
|---|---|---|---|---|---|
| points spent | 2 | 6 | **12** | 20 | 110 |

**The default follows the scenario, not the vocation.** Objectives that farm on their own —
XP, AoE, Puller — start at **r3**, the step the game's own text describes. Boss and support
objectives start at **r0** and pay the 12 points only if you ask. Touch the stepper once and
your number takes over: switching objectives afterwards no longer overwrites it.

This replaces a fixed engine-wide cap of 3 ranks that applied to *every* objective. The cap
was right about the ceiling and wrong about the floor: kiting is worth 12 points to a character
farming a pack alone, and worth nothing to a build that exists to hit one boss with a tank
holding it. Measured across the same 144 combos, handing those points back is **+0.58%** on the
average damage index, and it refunds exactly the two builds the cap taxed hardest —
**knight/tank/900 +5.9%** and **paladin/atkspeed/500 +5.1%**, which had lost 5.6% and 4.8% to it.

⚠️ Freeing points is not automatically damage-positive: the greedy re-spends them and can land
somewhere the single-target model values less. **knight/dano/900 drops 4.6%** because the 12
points came back as Cleaving Strikes I plus one lost rank on six damage nodes — a trade
`tools/model.js` scores as a loss because it measures one target.

Below the marker, `tactics` keeps its 2.0 weight in every profile, now doing exactly one job:
keeping the node worth more than nothing so the dead-weight prune cannot undo what the marker
just bought.

**Asking for more than the level pays.** The path plus the ranks has a minimum price
(`tacticsMinCost`), and r10 alone costs 110 points. When it does not fit, the build says so —
*"Level too low for Battle Tactics r7 …"* — and reports what it did reach instead of silently
delivering less.

### Perks to lock

Each card has a collapsible list of the tree's **notables** (Avatar of Steel, Executioner,
Cleaving Strikes, Gift of Life...). **Checking one locks it**: the optimizer takes that perk
first, whatever it costs, and builds the rest of the tree around it (`forcePerks`, always on
from the UI). The walls that stay up are level ones, and the card names them: the path to the
node alone costs more than your points, or the locked perks do not fit *together* — in which
case unlock one or raise the level.

**Locking is also a closed list.** As soon as one perk is checked, the perks you left
unchecked stay out: locking Executioner + Avatar of Steel on a knight tank no longer brings
Gift of Life along just because the Tank objective values it. The only unchecked perks that
can still come in are the ones a checked perk needs on the way (Cleaving Strikes III pulls
I and II) and the one in front of Battle Tactics on the monk when the marker asks for it.
With nothing checked the optimizer picks freely, exactly as before. Swept over every perk ×
objective at level 900: no unchecked perk that could be removed without breaking the tree.

It used to be two steps: checking only *prioritized* (`PERK_BOOST`, a minimum cost/benefit
ratio that still let the optimizer refuse), and forcing was a second checkbox that appeared
inside the warning only after the perk had already been dropped. In practice a knight tank at
900 with Cleaving Strikes III checked came back without it. Measured at level 900, checking
alone dropped the perk in 13 of 337 perk × objective combos; locked, 0 of ~1,100 (singles,
pairs and random sets of 3–6 that fit). `PERK_BOOST` still exists in the engine for scripts
that ask for it, and `check-builds-view.js` pins the knight case.

The share-code format round-trips: paste a code into the simulator (or the game) and back.

## Hunts: which element, which charm

The Hunts tab answers three questions, all from `public/hunt-model.js`: which
element to **hit** with, which element to **protect** from, and which charm to bind
to which creature.

**Which element the pack takes best.** Every monster carries the game's own
`resist` table (positive resists, negative *takes more*, 100 is immunity). The
hunt's number is not an average of the monsters — it is the harmonic mean weighted
by HP, `Σhp / Σ(hp/mult)`, which is what clear *time* actually is. The weights
reproduce the game's stage structure exactly (waves 1–9 grow the pack 4,4,5,5,6,6,7,7,8
= 52 spawns, wave 10 is the boss at ×3 HP) — `check-hunt-model.js` asserts they sum
back to the `hpPerClear` already stored in `data/hunts.json`. One immune monster
disqualifies the element for the whole hunt: the clear never ends, no matter how
badly the rest takes it. The tree's `element_pierce` shaves positive resist only.

**Which element punishes you.** Every monster also carries the game's own damage
data: `dmg:[min,max]` for the melee and `abilities:[{element,min,max,chance,interval}]`
for the specials. `monsterThreat` turns that into damage per second by element, and
`huntThreat` splits the hunt by *share of the damage you take* — weighted by the same
HP weight as above, because damage taken from a monster is (time it stays alive) ×
(its dps), and time alive is proportional to its HP. The wave-10 boss hits at ×1.5.
Monsters with a `healing` ability are listed separately: that changes how you fight,
not what you protect against. The melee cadence is not in the bundle; 2000 ms is
assumed (the dominant ability interval, and what monsters that declare their own
melee as an ability use) and it cancels out of the *share*, which is what the tab
shows.

**Which charm goes on which creature.** This is an *assignment*, not a ranking: a
charm lives on one creature (the wiki: "escolha o charm, escolha a criatura"), so
putting Savage Blow on monster A costs you not having it on B. `huntCharmPlan`
solves the whole hunt at once under the game's real rules — 1 major + 1 minor per
creature, each charm used once, majors gated behind that creature's full bestiary,
and `slots` (2 free / 6 VIP / 25 with the Charm Expansion) capping how many
creatures hold a charm at all. It is an exact DP over (creature × mask of used
charms), not a greedy pass: the charm that pays most on the fat monster is often the
only one that pays on the thin one.

**The wave-10 boss is almost always one of the pack creatures** — in 86 of the 87 hunts
the bundle's `bossKey` points at a monster already in the list, same key and same bestiary
entry, just ×3 HP. The exception is Thalassara Surroundings (Sep 2026 update), whose boss
is a Moonspawn Juggernaut that never spawns in the pack; there it is simply one more
creature with a single kill per clear. So there is no "charm for the boss" decision separate from that
creature's, and `huntCreatures` merges the two appearances into one row (keeping them
apart internally, since the elemental proc caps at 5% of the *target's* HP and the
boss fights with three times more). The wiki's "bosses receive no charm" is read as
the dedicated boss rooms, which are a separate system.

Charm Points are a **ceiling, not a currency** — the cap is computed from your
bestiary and resetting refunds everything, and closing the whole bestiary (59,200)
covers maxing every major (48,900). So a weak charm is still free value and the plan
assigns it; what it does *not* do is pretend it is worth grinding for, so anything
under 0.1% of the clear is flagged as a crumb. The real cost is the bestiary grind,
which is why every row shows it.

Charms you do not own are unchecked in the collapsible **my charms** panel (Low Blow
and Carnage by default) and stay out of the plan — but if one of them would beat what
the plan picked, that gets one note, once, naming the creature. The character comes
from the Builds tab slots: crit chance, crit damage, Avatar uptime and
`element_pierce` are read off that build via `Engine.valueCtx`.

Charms split into two kinds, and only one of them needs your DPS:

- **Percentage** (Savage Blow, Low Blow, Fatal Hold) — they move the multiplier, so
  they rank with no DPS at all. **Savage Blow is the Avatar payoff**: at 0% uptime it
  is worth ~2.5%, at the ~49% uptime a level-500 knight actually gets it is ~14%, and
  inside the form ~20% — because every hit crits there, the +44% crit damage always
  lands. Low Blow is the mirror image: at full Avatar uptime it is worth exactly
  **zero**, since you already crit every hit. Between the two there is no fixed
  winner: +9% crit *chance* beats +44% crit *damage* while your crit chance is low
  (at 30%/+150% it is +12.9% against +7.5%), and Savage Blow overtakes it as that
  chance climbs. The plan follows the arithmetic, not the reputation.
- **Flat damage** (the 7 elementals, Carnage) — `min(2×level, 5% of target HP)` per
  proc, which only becomes a percentage once the pasted Session DPS gives a damage
  per hit (`dps / aps`, the `model.js` premise). Without DPS they show no number
  instead of a fake one. Note these scale with *level*, not with your gear, so for a
  high-DPS character they are close to noise next to Savage Blow.

  Not knowing *how much* an elemental is worth is not the same as not knowing *where*
  it is worth most, though — resistance orders that on its own. So with no DPS the
  plan still places elementals, by resistance, flagged `blind`: the row shows how much
  that creature takes of the element (`×1.35 taken`) and says the percentage is
  missing. Leaving those creatures blank hid an answer the data already had.

  The per-character DPS is matched against the pasted Session by vocation tag
  (EK/RP/MS/ED/MK), then by the build slot's label, then by being the only entry, then
  by the party total — and the info bar names which one it used, because "party total"
  inflates damage-per-hit and therefore *understates* the flat-damage charms. The
  label line is anchored with `/m`, otherwise a character name arrives truncated to
  its last four letters and never matches anything.

Overpower and Overflux are listed with **no estimate at all**: they key off your max
HP / max mana, and nothing in `data/` has those absolute values — the tree gives
percentages. Two known ways the model runs *low* on the elementals are documented at
the top of `hunt-model.js` (spell casts also proc them; the proc is assumed not to
crit).

### Critical hits, Avatar, and Low Blow vs Savage Blow

A crit adds **+50%** on top of the hit, plus your crit damage — the game's own wiki says so
twice ("Critical: +50% base (+ Crit Damage)" in the server data, and again in the Forge
attributes). The charm model used to assume +100% (a crit hitting for 2×); `CRIT_BASE` in
`hunt-model.js` and `critBase` in `tools/model.js` now carry 1.5.

That is what answers "is Low Blow still worth it on an Avatar build?". Inside the Avatar
form every hit already crits, so Low Blow's extra crit chance only counts outside it, while
Savage Blow's extra crit damage counts on every crit, the Avatar's included. At level 900
on the Avatar builds: Savage Blow T3 **+15–16%**, Low Blow T3 **+2.6–3.3%** (knight, druid,
sorcerer, paladin; tree uptime 43–55%). Without Avatar it flips — Low Blow wins. Since each
charm sits on one creature, Low Blow can still be the right pick for the *second* creature
of a hunt, and the plan solves that; with Avatar in the build it now says the trade in one
line.

- **"The boss has a lot of HP, so an elemental charm should hit harder?"** No, for two
  reasons from the game's wiki. Boss rooms cannot hold charms at all ("Bosses não recebem
  charm"); only hunt creatures can, and the wave-10 boss is one of them with ×3 HP. And an
  elemental proc is `min(2× your level, 5% of the target's HP)`: at level 900 it caps at
  **1,800** damage once the target has more than 36k HP, so extra HP adds nothing. On
  Asura Citadel at 900 (knight Avatar, 100k DPS) the plan is Savage Blow +15.3% on the
  main creature, Low Blow +3.0% on the second, Carnage +2.4% on the third; the best
  elemental is +0.14%.
- **Carnage only hits who is standing next to the dead one.** The burst goes to the 4
  tiles touching it; with the pack around you, one of those is you and one is outside the
  ring, so at most 2 monsters can be hit — whether the dead one was in front of you or on
  a diagonal. The model used to assume 2 every time. `carnageNeighbors` now counts, kill
  by kill, how many are still alive: when the k-th of a wave of n dies, each of the 2 tiles
  holds a monster with chance (n−k)/7. Averaged over waves 1–9 that is **0.73** for a pack
  of 4, not 2 — which is why Low Blow now beats Carnage on the second creature. It assumes
  the pack stays on you; kiting, they trail in a line and Carnage hits even less.
- **House rule (Hunts tab): Savage Blow, Fatal Hold, Gut and Scavenge are always in the
  plan** when the hunt has creatures for them; Adrenaline Burst is the reserve. Low Blow
  is *not* fixed — it goes in only where it beats Carnage and the elementals. The rule is
  passed in by the view (`must`), so `huntCharmPlan` on its own still follows the math
  alone (with 30% crit and no Avatar, Low Blow does beat Savage, and the tests keep that).
- **Carnage × elemental is decided by how many hits a creature takes.** At the level cap
  both are fixed numbers: an elemental adds ~chance × min(2×level, 5% HP) **per hit**,
  Carnage adds chance × min(15% HP, 6×level) × neighbours **per kill**. At 900 that is
  ~198 per hit against ~867 per kill, so the elemental wins once a creature needs more
  than ~4–5 of your hits. Hitting with runes from range means many small hits — many
  procs. The model used to take your hit as DPS ÷ attack speed (all auto-attack), which
  makes hits huge and few; the rail now takes **your average hit** (the damage number
  you see, runes and spells included), and "Why these charms" states the break-even for
  the creature holding Carnage or the elemental. On Bony Sea Devil at 900: with an 83k
  hit the plan keeps Low Blow and Carnage; with a 2k hit it switches to Wound, Divine
  Wrath and Enflame at +11–12% each.
- **Minor charms by what they are worth.** Fatal Hold (the only one that is damage) goes
  where it speeds up the clear most; then Scavenge (+20% of the coins) and Gut (+12% of
  the other drops' chance, read as relative) go to the creatures where they add the most
  gold per clear, counted on the hunt's real loot table and shown in the plan; utility
  minors fill what is left. The creature's share of the clear (HP-weighted, boss ×3 included)
  is what decides who gets the best charm — the one you spend the most time hitting.
- **Avatar uptime** comes from the tree alone. Forge Transcendence (legs) and the potion of
  transcendence add chance that is not in the repo, so the Hunts rail takes your own number;
  empty uses the tree's. The higher it is, the less Low Blow is worth.
- **My charms** now start with every charm owned (Low Blow and Carnage used to start
  unchecked). The saved setting moved to `idlezada.charmCfg.v2`; from v1 only the slot count
  carries over, because the owned list there was built on the old default.
- **Why the optimizer did not change with it.** Pricing crit chance the game's way in
  `engine.js` (and, to be exact, as a multiplier over the damage stack) was measured over
  the 108 build combos: net **+0.04%** on the damage index, individual builds from −3.4% to
  +5.4% — greedy noise, not a gain. Changing 70 share codes for nothing was not worth it, so
  the heuristic weight stays, with the measurement written next to it.

## Loot: which creature drops it, and where it comes out most

The Loot tab is the same list of hunts asked a different question, so it reuses the
same table and the same tones on purpose — only the columns change. It has three modes,
and what is in the search box decides which:

- **an item** → every hunt that drops it, with the creature and chance it comes from,
  how many come out per clear, and how many clears one unit costs;
- **empty, with starred items** → *my list*: hunts ranked by how much of your list they
  cover, tie-broken by what that slice is worth per clear;
- **empty, nothing starred** → hunts ranked by what their whole loot table is worth.

Star an item from the search bar or from any row of an opened hunt's drop table — the
list lives in `localStorage` and shows up as chips you can click to jump between items.

**There is no DPS here, deliberately.** The question this tab answers is *which creature
drops it and where*, which is chance and quantity per clear. Clear speed belongs to the
Hunts tab, and dragging it over here only bought a column that depended on having pasted
a Session somewhere else. Sorting is by quantity per clear, by **best drop chance** (the
single highest-percentage creature), or by level.

Everything comes from `loot:[{name, chance, max}]` in the game bundle: `chance` is per
100,000 (750 = 0.75%) and `max` marks a stackable, whose quantity rolls 1..max. Three
assumptions ride on that — the scale of the chance, the mean of `max`, and that a clear
kills `spawnCount(packBase)` monsters by spawn weight plus one boss — and none of them
can be checked in the client, because combat runs on the server.

So they are checked against the repo instead. `data/hunts.json` already carried
`goldPerClear` for every hunt, recorded from the game long before there was a loot table
here. Summing the coins out of the loot with those three assumptions has to reproduce
that number, and it does, **exactly, on all 79 hunts recorded that way** (the 8 hunts
added in the Sep 2026 update were built by the extractor with this same formula, so for
those the check is consistency, not proof) — `check-loot.js` runs the
equality. Get any of the three wrong and it fails immediately.

**Deaths, not HP.** `packWeights` weighs each monster by the HP it represents, because
there what is being measured is time spent hitting (element, charms). Loot is not that:
a 100 HP monster and a 10,000 HP monster each drop once. Hence a separate
`killsPerClear`, rather than a flag on `packWeights` — two different questions about the
same pack, and conflating them was the one way to get this wrong.

**Same item twice on one creature is normal**, not dirty data: a stack caps at 100, so a
monster that drops 297 gold comes as three rows. They are independent rolls, so the
expected values *add* — which is exactly what makes the gold cross-check land. For the
screen they fold into one source per creature, tagged with how many rolls it was.

**A list is not a sum.** `lootBasket` is not `lootSources` run N times and added up:
quantity does not add across different items (an amulet plus a coin is not two of
anything). What adds is *coverage* — how many of your list drop there — and *gold*, in
that order.

**Prices** resolve the way the game resolves them: the item catalog's own `value` wins,
and only where it is missing do the three loose tables apply, in order. The cascade is
not decorative — the catalog holds 80 prices the tables lack (`gold coin` among them) and
disagrees with them on 36 more. Flattening it into one object would give wrong gold on
~116 items. All 864 reachable items end up priced.

Two things the tab deliberately cannot tell you. Item **rarity**
(Common/Uncommon/Rare/Epic/Legendary/Mythical) is a separate roll — the quality an item
takes *when* it drops — served by the server, not in the bundle. And two creatures that
appear in hunts (`minion_of_versperoth`, `bloodjaw`) have no loot table in the bundle at
all; the hunts holding them say so in the detail instead of presenting a silent total.

## Boss loot

Every boss carries its drop table from the game bundle — the same `loot:[{name, chance, max}]`
the hunts use, same scale (chance per 100,000, a stackable rolls 1 to max), but **per kill**
instead of per clear, since a boss room is one fight. `public/loot.js` publishes it under
`b` (boss id → rows), read through the monster key (the id is not always the key: "oberon"
fights as `grand_master_oberon`). All 106 bosses have one.

- **Bosses tab:** each card has a Loot button showing the average gold per kill; open it for
  the full list with chance, quantity and sell price, most valuable first. Search also
  matches items ("moonsilver bow" finds Phosphorus), and you can sort by loot value.
- **Loot tab:** searching an item lists the bosses that drop it in their own table below
  the hunts (chance and quantity per kill), and items that only drop from bosses are now
  searchable — 1,433 items instead of 896.

What the bundle does not carry, and so is not here: item rarity and the reward bag, both
served by the server.

## Re-extracting game data

**The full procedure — what each line of output means, what is done by hand, how to ship —
is the `updating-game-data` skill in `.claude/skills/`.** This section is the reference
behind it.

`data/monsters.json`, `data/charms.json`, `data/loot.json`, `data/prices.json`, the room
bosses in `data/bosses.json` and the hunts in `data/hunts.json` come from the game bundle.
The hunts also take the server override (`/api/trpc/adminConfig.stages`, public): the game
admin changes monsters and levels there, on top of the bundle.

```
node tools/check-live.js                  # is the site in sync with the live server?
node tools/extract-game-data.js           # downloads the current bundle + server stages
node tools/extract-game-data.js --dry     # shows what would change
node tools/check-hunt-model.js            # then verify the model
node tools/check-hunts-view.js            # ...and that the tab still renders
node tools/check-loot.js                  # loot: the gold cross-check must stay exact
node tools/check-loot-view.js             # ...and that the Loot tab still renders
node tools/check-bosses-view.js           # ...and the Bosses tab, loot included
```

It rewrites `public/hunts.js`, `public/charms.js`, `public/loot.js` and `public/bosses.js`
from the JSON, and regenerates `public/trees.js` and `public/xprates.js` from the two JSON
files that are edited by hand. It also **compares the skill trees** in the bundle with
`data/trees.json` and prints `! ARVORE MUDOU NO JOGO` with the differences — it never
rewrites the trees, because the optimizer is calibrated on them. What it does with each kind of record:

- **New hunt** in the bundle → built from scratch with the same formulas that produced the
  original 79 (bestiary HP ×2, `spawnCount(packBase)` kills by spawn weight + 1 boss,
  boss XP ×2.5 and HP ×3, gold from the coin rows of the loot table). Rebuilding the 79 this
  way reproduces every one of them to within ±1 of rounding.
- **Recorded hunt whose inputs changed** (monster list, a monster's HP or XP, pack size,
  boss) → rebuilt the same way, and the script prints what changed. Only the level changed →
  only the level is updated.
- **Recorded hunt with nothing changed** → left alone, so its recorded gold stays an
  independent proof for `check-loot.js`.
- **Room bosses** (`avail:"on"`, no `mapId`) → added or rewritten from the bundle: HP ×4.5,
  XP ×2.5, and damage elements weighted melee ×0.6 / targeted ×1.1 / area ×0.3 (max ×
  chance), a weighting calibrated against the 101 bosses the community guide provided —
  it reproduces 100 of them exactly and the other within 1 point.
  **World bosses** (`mapId:"worldboss"`) are left alone: their HP scales with players on
  the server and the bundle's number is not the one you fight. Two other boss lists in the
  bundle (59 entries without `avail`) are never shown by the game client, so they stay out.
- `avail:"test"` on a hunt is copied into the data and nothing else: 10 hunts the site
  already showed carry it too, so it does not mean the hunt is out of the game. The bundle is minified and its variable names
change every build, so the script locates the monster tables by the *expression* that
merges them and **fails loudly** rather than writing wrong data if the game changes shape.

## Verifying the optimizer

`PROFILES` in `engine.js` is a table of weights, and a wrong weight produces a build
that looks plausible and is quietly bad. After changing any weight — or re-syncing
`trees.json` — run:

```
node tools/check-builds.js      # exits non-zero if anything fails
node tools/check-builds-view.js # ...and that the Builds tab still renders and clicks
```

No dependencies: it loads `trees.js` + `engine.js` into a `window` shim, the same way
the browser does. Three blocks:

- **Invariants** — every build passes `valid()`, stays inside the point budget, and its
  share code round-trips back to the identical build. A failure here is a bug.
- **Behavior** — each objective delivers what its button promises (the healer actually
  builds healing, the Crit objective actually builds crit, and so on).
- **Calibration** — the conclusions of the comparative analysis, measured through
  `tools/model.js`. These encode **assumptions**, not laws — the model's premises are
  documented at the top of that file, including the one thing it cannot rank (def and
  armor, since no monster damage exists anywhere in `data/`). If you retune weights
  deliberately, updating these is legitimate.

## Deploy (Cloudflare Pages via GitHub Actions)

Each push to `main` runs `.github/workflows/deploy.yml`:
`wrangler pages deploy public --project-name=idlezada`.

One-time setup (Cloudflare / GitHub side):

1. Create the Pages project:
   ```
   npx wrangler pages project create idlezada --production-branch=main
   ```
2. Add the repo secrets:
   ```
   gh secret set CLOUDFLARE_API_TOKEN     # API token with Cloudflare Pages: Edit
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

Production URL: `https://idlezada.pages.dev`

## Data / re-sync

`public/trees.js` is generated from `data/trees.json`. When the tree data changes,
regenerate `trees.js` from the updated JSON — the engine is data-agnostic and reads
any tree in the same format.
