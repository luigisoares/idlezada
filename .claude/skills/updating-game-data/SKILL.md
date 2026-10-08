---
name: updating-game-data
description: Use when baiakidle.com (Baiak Idle) released an update — new hunts, bosses, monsters, loot, charms, skill-tree or XP-rate changes — and the Idlezada site data must be refreshed; when checking whether the site is still in sync with the live game; or when the user says something on the site differs from the game (a monster that is not in a hunt anymore, wrong HP, wrong element to hit or to protect from).
---

# Updating Idlezada game data

## Overview
The game has three layers, and the site must match the **last** one:

1. **Portal bundle** (`baiakidle.com/assets/index-*.js`): the static data (bestiary, hunts,
   loot, charms, trees, boss rooms) and the game's wiki. The extractor reads this one.
2. **Game client** (`baiakidle.com/jogar/assets/game-*.js`): same static data, plus the
   code that applies the server overrides. It is the place to read *how* the game uses a
   value (e.g. `K8e` applies the hunt override; `KF` applies `monsterMult`).
3. **Server overrides**, edited in the game's admin panel and sent to the client. Several
   are **public, no login**, at `https://baiakidle.com/api/trpc/adminConfig.<name>`:

| Endpoint | What it overrides | Used by |
|---|---|---|
| `stages` | hunts: monsters, weights, bossKey, minLevel, maxAlive, avail (the client gets it as the websocket `huntgate` message) | extractor applies it; `check-live` compares |
| `monsterMult` | global % for `monster` / `stageBoss` / `boss`: hp, exp, atk, def | `check-live` compares against the repo constants |
| `bossDifficultyConfig`, `nightmareConfig`, `events`, `features`, `dungeonCatalog` | other systems | read when a question touches them |

Scripts are loud on purpose: an `ERRO:` means the bundle or the endpoint changed shape.
Fix the extractor; never hand-edit generated data.

## Procedure
1. Branch off `main` (`feat/atualizacao-jogo-<data>`). Merging to `main` deploys
   (`.github/workflows/deploy.yml`); a pushed branch does not.
2. `node tools/check-live.js`: the site against the live server (hunts and multipliers).
   Exit 0 means already in sync.
3. `node tools/extract-game-data.js --dry`, then without `--dry`. It downloads the bundle
   **and** `adminConfig.stages`. Read every line it prints:

| Output | Meaning / what to do |
|---|---|
| `servidor <id>: …` | The server overrides the bundle for that hunt (monsters, level, pack, weights, boss). Applied automatically; this is the truth the player sees. |
| `+ hunt nova: X` | Built with the original formulas. Check its level and monsters in the game. |
| `~ hunt X: <what>` | An input changed; the hunt was recomputed (level-only → just the level). |
| `- hunt X saiu do jogo` | Confirm in the game before accepting. |
| `! hunt X com monstro fora do bestiary -- mantida` | The hunt points to a key missing from the bestiary. The recorded hunt keeps its old numbers. Tell the user. |
| `! sem resist` / `! sem dano (threat)` | A monster without resistances or damage. Usually an extractor bug (see Common mistakes), not a game gap. Investigate. |
| `N salas de boss · novas: …` | New room bosses (HP ×4.5, XP ×2.5, elements calibrated). |
| `! criatura/boss sem loot no bundle` | Known gap; the Loot tab says so on the hunt. |
| `! ARVORE MUDOU NO JOGO` | `data/trees.json` is NOT rewritten. Edit it by hand from the diffs, then `node tools/check-builds.js` (README, "Verifying the optimizer"). |

4. **By hand**, when the game changed them:
   - **XP rates:** `https://baiakidle.com/#/wiki/dados-do-servidor` in a browser (filled
     live, not in the bundle). Update `data/xprates.json`.
   - **World bosses** (`mapId:"worldboss"`): HP scales with players. Edit
     `data/bosses.json` only from an in-game number.
   - **Multipliers** that `check-live` flags: decide with the user. Constants live in
     `HUNT_HP_MULT` / `PHASE_BOSS_HP` / `PHASE_BOSS_XP` / `ROOM_HP_MULT` / `BOSS_XP_MULT`
     (extractor) and `data/xprates.json`. Known open item: the server says
     `stageBoss.exp = 200`, while the site uses ×2.5, which was confirmed in the game earlier.
   - Rerun the extractor: it regenerates `public/trees.js` and `public/xprates.js`.
5. **Rules** (crit, charms, carnage): `node tools/extract-wiki.js --grep "<term>"`, or
   `--out <dir>` for whole articles.

| Rule | Change here | Pinned by |
|---|---|---|
| Crit base (+50%) | `CRIT_BASE` in `public/hunt-model.js`, `critBase` in `tools/model.js` | `check-hunt-model` |
| Charm values / costs | nothing — `data/charms.json` comes from the bundle | `check-hunt-model` (24 charms, 48,900 pts) |
| Carnage reach, elemental cap | `carnageNeighbors` / `charmGain` in `public/hunt-model.js` | `check-hunt-model` |
| Boss room ×4.5 HP, ×2.5 XP | `ROOM_HP_MULT` / `BOSS_XP_MULT` in the extractor | `check-live` (boss.hp) |
| **Element to hit**: tie (≤0.5%) goes to the elemental; physical only when strictly best | `huntElements` in `public/hunt-model.js`, `hitHtml` in `public/bosses-view.js` | `check-hunt-model` |
| **Elements to protect from**: up to 3, drop anything under 5% of incoming damage | `PROTECT_MAX` / `PROTECT_MIN` in `public/hunts-view.js` | — |

   `def` in `monsterMult` scales **armor only** and `atk` is uniform: neither changes which
   element to hit or protect from. `data/xprates.json` `combat.*` is a note for people. The
   optimizer's crit weight in `engine.js` is heuristic on purpose; do not "fix" it without
   re-measuring the 108 builds.
6. **Verify**: 0 failures in `check-builds`, `check-builds-view`, `check-hunt-model`,
   `check-hunts-view`, `check-loot`, `check-loot-view`, `check-bosses-view`, and
   `check-live` exits 0 (`node tools/<name>.js`). A test that pins a concrete level or
   count can break when the server moves a hunt: update the number deliberately and say so.
7. `node tools/bump-front-version.js` on any change under `public/`.
8. Open `public/index.html` for the user to validate (no screenshot yourself). Write the
   round in `docs/changelog/<YYYY-MM-DD>-<slug>.md`; a second round the same day appends.
   Commit and open a **draft** PR; merge only with the user's OK. Before pushing a new round
   to an existing PR, run `gh pr view <n> --json state`: if it was merged, open a new branch
   from `origin/main` and a new draft PR.

## Validating against the game
When the user sends an in-game print (hunt modal, bestiary): compare HP and Exp of each
creature with `data/hunts.json` (the hunt HP already includes `monster.hp` 200%).
Different numbers mean a data bug. A missing or extra creature means a server override:
check `adminConfig.stages`.

To find how the game uses a value, search the **game client** (`/jogar/`), not the portal:
the portal bundle has the i18n strings but not the game UI.

## Common mistakes
- **Trusting the bundle's hunt list.** The server overrides it (that is how the Darklight
  Emitter left Darklight Source while still in both bundles). The extractor applies
  `stages`; never strip a monster by hand.
- **Helpers turned into `{}`.** The bestiary override uses game helpers
  (`{...N(key,.82,.54),..._(key,1.28)}` rescale damage, ability chance and HP). They must be
  evaluated through `bundleResolver`, not `evalLiteral` (which turns any call into `{}`).
  Symptom: endgame monsters with old HP/damage or no resistance.
- Reading the portal bundle to understand game behavior: the game UI is in `/jogar/`.
- Adding the bundle's hidden boss lists (no `avail`, no `mapId`): the client never shows them.
- Re-recording every hunt "to be safe": untouched hunts keep their game-recorded gold,
  which `check-loot` proves the loot scale against.
- Forgetting step 7, then "fixing" a bug that is only the browser cache.
