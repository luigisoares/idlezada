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
├─ docs/                 # internal specs (not published)
└─ .github/workflows/deploy.yml
```

## Run locally

Open `public/index.html` in a browser (double-click). No server, no dependencies.

## Objectives (build generator)

Pick a level and an objective; the tree is auto-allocated and a copyable share code is produced:

- **Damage** — attack / spell / elemental / crit. For casters you can choose the damage element.
- **Crit** — stacks crit chance and crit damage together.
- **Avatar** — opens the cheapest path to the tier-11 Avatar node, then fills with crit-leaning damage.
- **Tank** — HP / absorb / defense / regen.
- **XP** — exp gains + tactics + light damage to keep kills fast.
- **Atk Speed** — attack speed + light damage/crit.

The share-code format round-trips: paste a code into the simulator (or the game) and back.

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
