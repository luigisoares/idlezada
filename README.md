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
│  ├─ loot.js            # loot + sell prices (window.LOOT) — generated from data/loot.json
│  ├─ styles.css
│  ├─ simuladorbuild.html# interactive simulator (Simulator tab)
│  └─ stamina.html       # stamina calculator (Stamina tab)
├─ data/trees.json       # source data for the trees (not published)
├─ data/monsters.json    # whole bestiary: hp/exp/armor/resist + dmg/abilities (not published)
├─ data/loot.json        # whole bestiary's loot: item / chance / max (not published)
├─ data/prices.json      # sell price in gold of every item (not published)
├─ tools/                # verification (not published, no dependencies)
│  ├─ check-builds.js    # run after touching any weight: node tools/check-builds.js
│  ├─ check-hunt-model.js# run after touching hunt-model.js or re-extracting
│  ├─ check-hunts-view.js# runs the Hunts tab against a fake DOM (catches render breaks)
│  ├─ check-builds-view.js # same, for the Builds tab (catches init + marker breaks)
│  ├─ check-loot.js      # loot model + the gold cross-check that pins the chance scale
│  ├─ check-loot-view.js # runs the Loot tab against a fake DOM
│  ├─ extract-game-data.js # pulls resists, damage, charms, loot + prices out of the bundle
│  └─ model.js           # combat model used to compare objectives
├─ docs/                 # internal specs (not published)
└─ .github/workflows/deploy.yml
```

## Run locally

Open `public/index.html` in a browser (double-click). No server, no dependencies.

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

### Perks to prioritize

Each card has a collapsible list of the tree's **notables** (Avatar of Steel, Executioner,
Cleaving Strikes, Gift of Life...). Checking one *prioritizes* it: the optimizer gives it a
minimum cost/benefit ratio (`PERK_BOOST`) so it competes with the small nodes, but still refuses
it when the points would gut the rest of the build. Marking Avatar of Steel + Executioner on a
knight, for instance, brings in only the Executioner at level 500 — the Avatar's 300 points would
drop attack from 60% to 26% — and brings in both from level 900, where the Avatar costs 8 points
of attack and returns roughly +42% damage.

When a perk is left out because it did not pay off, the card offers a checkbox to **take it
anyway** (`forcePerks`), which shapes the rest of the build around it. The one wall that stays up
is level: if the cheapest path to the node costs more than your whole budget, no amount of
forcing helps, and the card says so instead of offering a control that cannot work.

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

**The wave-10 boss is one of the pack creatures** — in all 79 hunts the bundle's
`bossKey` points at a monster already in the list, same key and same bestiary entry,
just ×3 HP. So there is no "charm for the boss" decision separate from that
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
that number, and it does, **exactly, on all 79 hunts** — `check-loot.js` runs the
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

## Re-extracting game data

`data/monsters.json`, `data/charms.json`, `data/loot.json`, `data/prices.json` and the
`resist` / `spawn` / `threat` / `boss.key` fields inside `data/hunts.json` come from the
game bundle:

```
node tools/extract-game-data.js           # downloads the current bundle
node tools/extract-game-data.js --dry     # shows what would change
node tools/check-hunt-model.js            # then verify the model
node tools/check-hunts-view.js            # ...and that the tab still renders
node tools/check-loot.js                  # loot: the gold cross-check must stay exact
node tools/check-loot-view.js             # ...and that the Loot tab still renders
```

It rewrites `public/hunts.js`, `public/charms.js` and `public/loot.js` from the JSON and
never touches the HP / XP / gold already recorded. The bundle is minified and its variable names
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
