---
name: updating-game-data
description: Use when baiakidle.com (Baiak Idle) released an update — new hunts, bosses, monsters, loot, charms, skill-tree or XP-rate changes — and the Idlezada site data must be refreshed, or when checking whether the site is still in sync with the live game.
---

# Updating Idlezada game data

## Overview
Almost everything comes from the game's JS bundle through one script. What the bundle
does not carry (live XP rates, world-boss HP) is read by hand. Game rules the bundle does
not encode as data (crit, charms) live in the game's own wiki, which ships inside the
bundle. Scripts are loud on purpose: an `ERRO:` means the bundle changed shape — fix the
extractor's regex, never hand-edit the generated data.

## Procedure
1. Branch off `main` (`feat/atualizacao-jogo-<data>`). Merging to `main` deploys
   (`.github/workflows/deploy.yml`); a pushed branch does not.
2. `node tools/extract-game-data.js --dry`, then without `--dry`. Read every line it prints:

| Output | Meaning / what to do |
|---|---|
| `+ hunt nova: X` | Built with the original formulas. Check its level and monsters in the game. |
| `~ hunt X: <what>` | The game changed an input; the hunt was recomputed (level-only → just the level). |
| `- hunt X saiu do jogo` | Confirm in the game before accepting. |
| `! hunt X com monstro fora do bestiary -- mantida` | The bundle's hunt points to a key missing from its own bestiary. Not an extractor bug: the recorded hunt keeps its old numbers. Tell the user; it resolves when the game ships the monster. |
| `N salas de boss · novas: …` | New room bosses (HP ×4.5, XP ×2.5, elements calibrated). |
| `! criatura/boss sem loot no bundle` | Known gap; the Loot tab says so on the hunt. |
| `! ARVORE MUDOU NO JOGO` | `data/trees.json` is NOT rewritten. Edit it by hand from the listed diffs, then run `node tools/check-builds.js` — calibration assertions may need a deliberate update (README, "Verifying the optimizer"). |

3. **By hand**, when the game changed them:
   - **XP rates:** open `https://baiakidle.com/#/wiki/dados-do-servidor` in a browser. The
     values are filled in live, so they are not in the bundle, whose defaults differ. Update
     `data/xprates.json`.
   - **World bosses** (`mapId:"worldboss"`): the HP scales with players on the server.
     Edit `data/bosses.json` only from an in-game number.
   - Rerun the extractor: it regenerates `public/trees.js` and `public/xprates.js` from
     the JSON.
4. **Rules** (crit, charms, carnage, boss charms): `node tools/extract-wiki.js --grep "<term>"`,
   or `--out <dir>` to read whole articles. Where each rule lives:

| Rule | Change here | Pinned by |
|---|---|---|
| Crit base (+50%) | `CRIT_BASE` in `public/hunt-model.js`, `critBase` in `tools/model.js` | `check-hunt-model` asserts the value |
| Charm values / costs | nothing — `data/charms.json` comes from the bundle | `check-hunt-model` (24 charms, 48,900 pts) |
| Carnage reach, elemental cap | `carnageNeighbors` / `charmGain` in `public/hunt-model.js` | `check-hunt-model` |
| Boss room ×4.5 HP, ×2.5 XP | `ROOM_HP_MULT` / `BOSS_XP_MULT` in the extractor | — |

   `data/xprates.json` `combat.*` is a note for people, no code reads it. The optimizer's
   crit weight in `engine.js` is heuristic on purpose (measured; see its comment); do not
   "fix" it along with the rule without re-measuring the 108 builds. Update the README
   section that quotes the rule.
5. **Verify**: every script must end with 0 failures —
   `check-builds`, `check-builds-view`, `check-hunt-model`, `check-hunts-view`,
   `check-loot`, `check-loot-view`, `check-bosses-view` (`node tools/<name>.js`).
   Counts come from the data, so new content alone does not break them; a failure is a real
   change to look at.
6. `node tools/bump-front-version.js` on any change under `public/`. Without it, browsers
   keep serving the old `hunts.js` / `loot.js`.
7. Open `public/index.html` and let the user validate the UI (do not screenshot it yourself).
   Write the round in `docs/changelog/<YYYY-MM-DD>-<slug>.md` (what changed, why, what was
   measured, open decisions); a second round on the same day appends to that day's file.
   Commit and open a **draft** PR; merge only with the user's OK.

## Common mistakes
- Accepting `avail:"test"` as "not in the game": hunts already on the site carry it too.
  It is copied into the data and has no other effect.
- Adding the bundle's hidden boss lists (entries with no `avail` and no `mapId`): the
  client never shows them.
- Re-recording every hunt "to be safe": untouched hunts keep their game-recorded gold,
  which is what `check-loot` proves the loot scale against.
- Forgetting step 6, then "fixing" a bug that is only the browser cache.
