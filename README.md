# Idlezada

Static tools for an idle RPG — a build generator for the 5 vocation trees, an
interactive skill-tree simulator, and a stamina planner. Plain HTML/JS, **no build step**.

## Structure

```
idlezada/
├─ public/               # what gets deployed
│  ├─ index.html         # home: 3-build generator
│  ├─ app.js             # builds screen UI + localStorage
│  ├─ engine.js          # engine: cost/validation/aggregate/encode-decode + autobuild
│  ├─ trees.js           # data for the 5 trees (window.TREES) — generated from data/trees.json
│  ├─ styles.css
│  ├─ simuladorbuild.html# interactive simulator (Simulator tab)
│  └─ stamina.html       # stamina calculator (Stamina tab)
├─ data/trees.json       # source data for the trees (not published)
├─ tools/                # verification (not published, no dependencies)
│  ├─ check-builds.js    # run after touching any weight: node tools/check-builds.js
│  └─ model.js           # combat model used to compare objectives
├─ docs/                 # internal specs (not published)
└─ .github/workflows/deploy.yml
```

## Run locally

Open `public/index.html` in a browser (double-click). No server, no dependencies.

## Objectives (build generator)

Pick a level and an objective; the tree is auto-allocated and a copyable share code is produced.
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
- **XP** — exp gains + tactics + light damage to keep kills fast.
- **Atk Speed** — attack speed + light damage/crit.

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

## Verifying the optimizer

`PROFILES` in `engine.js` is a table of weights, and a wrong weight produces a build
that looks plausible and is quietly bad. After changing any weight — or re-syncing
`trees.json` — run:

```
node tools/check-builds.js      # exits non-zero if anything fails
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
