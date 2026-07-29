# Fallout 2 Campaign Parity — Issue List

**Scope:** everything standing between the current `main` and *"a player can start a new
game, play the Fallout 2 main campaign start to finish, and see an ending"* with fidelity
to the original.

**Method:** every issue below is grounded in a specific file/line or a reproducible
command against commit `cbcb8d1`. Re-verified on `main` (same HEAD) during the
full-parity planning pass. Claims that could not be verified from source are
marked `[UNVERIFIED]` rather than asserted.

**Companion plan:** see `docs/F2_FULL_PARITY_PLAN.md` for sequenced workstreams,
definition of done, and certification rules that replace the scaffold gate.

## Baseline measured at `cbcb8d1` (re-verified)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | **5103 passed / 61 failed** (117 files passed / 5 failed) |
| Converted game assets present in repo | none (`maps/` holds only `nullmap.json` + images sidecar; no `data/`, `art/`, `proto/`) |
| Checklist statuses | 807/807 marked `implemented` (0 stub/partial) — see **P3-2** |
| Open HIGH/CRITICAL blockers in matrix | 0 (all CLOSED) — but certification is scaffold-based; see **P0-5** |
| `src/` size | ~99.5k lines TypeScript |

> ⚠️ The README badge claims *5026/5100 passing*, and `docs/F2_RELEASE_GATE.md`
> previously claimed *120 files, 5089 tests* and `READY`. Measured suite is
> 5103/5164 with 61 failures. See **P0-5** / **P3-3**.

---

## Tier 0 — Campaign cannot be started or finished at all

These are hard blockers. Nothing downstream matters until they are closed.

### P0-1 — There is no new-game flow: no main menu, no character creation

**Status:** Partially addressed on the full-parity branch (Slice C). Cold boot without a
`?map` query opens `MainMenuPanel` → `CharacterCreationPanel` → `enterWorldMap('artemple')`
with SPECIAL/tags/traits applied to `globalState.player` and the debug 1337-caps loadout
cleared. Remaining: Credits/Quit, derived-stat preview polish, intro cinematic, post-chargen
autosave.

**Evidence (historical @ `cbcb8d1`)**
- `src/init.ts` — previously boot went straight to `gMap.loadMap(...)`.
- Player was hardcoded with debug SPECIAL / 1337 caps.

**Acceptance.** From a cold browser load: main menu → New Game → character creation
(SPECIAL/tags/traits/name/age/gender, all validated against F2 rules) → Temple of Trials
loads with the created character driving combat, dialogue, and skill checks.

---

### P0-2 — The gameplay runtime and the ECS character model are two disconnected systems

This is the single largest architectural blocker in the codebase.

**Evidence**
- Gameplay path: `globalState.player` is a `Player extends Critter` using
  `char.ts` `StatSet`/`SkillSet`. `combat.ts:198` reads `a.getStat('Sequence')`;
  `scripting.ts:1397` mutates `player.xp` directly.
- UI/progression path: `src/main.ts:315` — `createPlayerEntity({ name: 'VAULT DWELLER' })`
  creates a **separate** ECS entity stored as `globalState.playerEntityId`.
- `src/ui2/gamePanel.ts:149-164` — the in-game HUD reads HP, inventory and **combat AP**
  from `EntityManager.get(this.playerEntityId, …)`, i.e. from the ECS entity, while
  combat spends AP on `globalState.player.AP`.
- `src/ui2/characterScreen.ts:9-12` — the character sheet reads `EntityManager` and writes
  through `character/leveling.js` (`spendSkillPoint`) and `character/perks.js`
  (`grantPerk`). None of that reaches `globalState.player`.
- `src/inventory.ts:47-48, 74-79` — weight limits are enforced against ECS components;
  the gameplay inventory (`Obj.addInventoryItem`, `src/object.ts:637`) has **no weight
  check at all**.
- `awardXP()` (`src/character/leveling.ts:21`) is referenced **only** from tests —
  gameplay XP goes through `scripting.ts:1397` instead.

**Consequence.** The HUD shows an HP bar unrelated to the character taking damage. Perks
and skill points bought on the character sheet have no gameplay effect. Carry weight is
unenforced in real play. Two level-up formulas coexist.

**Acceptance.** One character model. Either the ECS becomes the source of truth and
`Critter`/`combat.ts`/`scripting.ts` read through it, or the ECS player entity becomes a
thin projection of `globalState.player`. HUD HP/AP, character sheet, perks, skill points,
carry weight, and XP must all read and write the same state, proven by a test that damages
the player in combat and asserts the HUD and character sheet both change.

---

### P0-3 — Skilldex has only 2 of 8 usable skills

**Status:** Partially addressed (Slice D). All 8 Skilldex skills are listed in legacy + UI2
Skilldex panels; IDs map to FO2 `action_being_used` values; Sneak toggles `pcFlags` SNK_MODE;
First Aid/Doctor have Critter heal fallback + uses/day; Lockpick/Repair/Steal/Traps/Science
dispatch `Scripting.useSkillOn`. Remaining fidelity: Steal container UI, trap failure damage,
Doctor cripple repair, Science terminal UX.

**Evidence (historical @ `cbcb8d1`)**
- Skills enum previously only `Lockpick` / `Repair`; Sneak UI could not set SNK_MODE.

**Acceptance.** All 8 Skilldex skills selectable and usable on valid targets, each running
the F2 success/failure roll and consuming the right resources (First Aid/Doctor uses per
day, Steal detection roll → reaction/combat, Traps disarm → damage on failure).

---

### P0-4 — The real campaign scripts have never been executed; asset-dependent tests hard-fail

**Evidence**
- `npm test` → 59 of the 61 failures are `src/phase100.test.ts` (43) and
  `src/phase107.test.ts` (16).
- Both call `loadIntFile(name)` which returns `null` when
  `path.resolve(__dirname, '..', 'data', 'scripts', name + '.int')` is absent
  (`src/phase100.test.ts:87-90`), and then assert `expect(result).not.toBeNull()`
  (`src/phase107.test.ts:117-124`).
- `data/` does not exist in the repo, and `setup.py` (the converter) requires a licensed
  Fallout 2 install.

**Gap.** Two problems in one. (a) Tests that require unavailable assets **fail** instead of
skipping, so the suite is permanently red and real regressions hide in the noise.
(b) More importantly, there is **no evidence anywhere in CI that a single real Fallout 2
`.int` script has ever been parsed and run** by this engine.

**Acceptance.** Asset-dependent suites `skip` with a clear reason when assets are absent,
so a clean checkout is green. Separately, an opt-in CI lane (or documented local
command) converts a real install and runs the Arroyo/Klamath/Modoc/New Reno script
corpus, reporting parse failures and unsupported-opcode hits as a tracked number.

---

### P0-5 — Certification documents claim "READY" on the strength of synthetic harnesses

**Evidence**
- `docs/F2_RELEASE_GATE.md:36` — `- [x] Full playthrough to ending completed`, status
  `READY`, citing `src/phase35.test.ts`.
- `src/phase35.test.ts:19-60` — that "full playthrough" is
  `class FullPlaythroughHarness` whose `runEarlyCampaign()` sets
  `scriptGlobalVars[9001] = 1` and `currentMap = 'denbus1'` as plain assignments. No map
  loads, no script runs, no combat.
- `src/campaignSmoke.test.ts:60-75` — the "campaign smoke" map-enter script is a fake VM
  executing `push 40; push 2; add` and asserting the result is 42.
- `docs/F2_CRITICAL_PATH.md:42-54` — all 13 regions marked `CERTIFIED`, every system tag
  ticked, sourced to the same scaffolds.

**Gap.** The release gate is measuring its own scaffolding. Every region is "certified"
against a harness that cannot fail for engine reasons.

**Acceptance.** Redefine certification so a region is only `CERTIFIED` when its real maps
load, its real scripts execute through `ScriptVM` without unsupported-opcode hits on the
critical path, and its quest gates advance under a scripted playthrough. Reset all 13
regions to `NOT_STARTED` and re-earn them. Until then the gate status must read
`NOT_READY`.

---

## Tier 1 — Core systems missing or too shallow for parity

### P1-1 — Combat AI uses 2 of ~20 AI.txt fields

**Evidence.** `AI.init()` parses AI.TXT into `AI.aiTxt` (`src/combat.ts:98-123`), but
`grep -oE "info\.[a-z_]+" src/combat.ts` returns exactly two fields: `info.chance` and
`info.min_hp` (`src/combat.ts:942`).

**Gap.** Unused: `attack_who`, `best_weapon`, `distance`, `disposition`, `run_away_mode`,
`area_attack_mode`, `hurt_too_much`, `chem_use`/`chem_primary_desire`, `secondary_freq`,
`called_freq`, `min_to_hit`. The current AI is: pick nearest living enemy, flee under
`min_hp`, creep, attack. No weapon selection, no cover, no stimpak use, no burst
positioning, no aimed shots, no coward/berserk/defensive disposition, no ranged-vs-melee
preference.

**Acceptance.** AI turn resolution consumes the full packet. Regression tests per
disposition/`attack_who`/`run_away_mode` combination using real AI.TXT rows.

---

### P1-2 — Perks and traits are largely absent

**Status.** Partial (Slice F). `src/character/traits.ts` has all **16** FO2 traits.
`src/character/perks.ts` expanded to ~46 campaign-relevant perks (Educated id 11;
FO2 script alias 18 / legacy 47 via `educatedPerkRanks`). Full FO2 catalog (~119) and
every combat/world-map effect hook still incomplete. Perk picker projects through Critter
(`recordCritterPerkGrant`) after P0-2 deepen.

**Acceptance.** Full perk and trait tables with correct prerequisites and effects applied
to the live character model, level-up perk picker reachable from gameplay, and
`Config.engine`-independent tests for each effect that touches a formula.

---

### P1-3 — Party/companion system is a bare list

**Status.** Partial (Slice G). `src/party.ts` tracks follow/wait, distance, disposition,
and other combat-control fields per member; `src/partyDefs.ts` embeds FO2-aligned
companion rows (Sulik/Vic/Myron/Marcus/…) with level tiers; `metarule(19/25)` report
follow + waiting flags; save schema **v21** persists `partyControls`. Still open:
trade-with-companion UI, full combat AI honouring disposition/attack_who, world-map
formation, and loading a real `party.txt` from assets (parser ready via `parsePartyTxt`).

**Acceptance.** Companions recruit, follow across maps and into encounters, level with the
player per `party.txt` tiers, obey combat-control settings, and survive save/load with
inventory and level intact.

---

### P1-4 — Radiation and poison are recorded but inert

**Status.** Partial (Slice F). `src/character/radiationPoison.ts` applies threshold HP
loss and poison DoT on the 10 Hz game tick; Pip-Boy Status shows rad/poison **levels**;
`radiation_add` respects Rad-X resistance; RadAway/Antidote adjust levels via the drug
table. Still open: full SPECIAL penalties at rad bands, healing-rate over time, save/load
of exposure clocks.

**Acceptance.** Radiation and poison tick against `globalState.gameTickTime` with F2
thresholds and effects, are visible in the Pip-Boy status tab, respond to the correct
items, and persist across save/load.

---

### P1-5 — No drug, addiction, or timed-effect system

**Status.** Partial (Slice F). `src/character/timedEffects.ts` tables Buffout, Mentats,
Psycho, Jet, Rad-X, RadAway, Antidote, Nuka-Cola, stimpaks; `use` / `useObjOn` call
`applyDrugToCritter`; expiry + withdrawal tick from `main.ts`. Still open: alcohol set,
Chem Reliant/Resistant multipliers, Jet quest hook, save/load of active effects.

**Acceptance.** A timed-modifier subsystem with per-drug tables, addiction rolls,
withdrawal onset/penalties, and save/load persistence of active effects and addictions.

---

### P1-6 — No Highwayman car

**Evidence.** `grep -rniE "highwayman|\bcar\b"` finds only `globalState.carFuel` /
`save.carFuel` (`saveload.ts:396`) and the sfall fuel opcodes. Nothing consumes fuel,
nothing drives.

**Gap.** No car acquisition, no world-map travel speed bonus, no fuel consumption or
refuelling, no trunk inventory, no car placement/parking per town map, no car-stolen
plot event.

**Acceptance.** Car acquirable in the Den, drivable on the world map with correct
speed/fuel model, trunk usable as persistent storage, parked instance appears on town
maps, all persisted.

---

### P1-7 — No town reputation, karma titles, or reputation flags

**Evidence.** `grep -rniE "town_rep|TOWN_REP"` → 0 hits. `src/quest/reputation.ts` is 98
lines of generic reputation.

**Gap.** No per-town reputation values or thresholds (Idolized/Liked/Neutral/Antipathy/
Hated), no karma titles, no special reputation flags (Childkiller, Berserker, Slaver,
Grave Digger, Chosen One, Betrayer), and no reaction-modifier wiring from reputation into
dialogue gates or merchant prices.

**Acceptance.** Per-town rep and global karma tracked, titles derived, flags set by the
correct actions, all surfaced in the Pip-Boy status screen and consumed by dialogue
reaction checks and barter pricing.

---

### P1-8 — No endgame: no ending selection, no ending slides

**Evidence.** `grep -rniE "endgame|ENDGAME"` → 0 hits. `src/cinematic.ts` (198 lines) is a
generic slide player: `{ imagePath, caption, duration }`, no Fallout content.

**Gap.** No `ENDGAME.TXT` parsing, no per-town ending-slide selection driven by quest
globals and reputation, no narrator VO, no credits, no "game over / you died" path.
`docs/F2_RELEASE_GATE.md` requires "Ending slides/cinematic handoff completes" — there is
nothing to hand off to.

**Acceptance.** Reaching the Oil Rig ending trigger selects the correct slide set from
quest/reputation state, plays them with narration, and rolls credits back to the main
menu.

---

### P1-9 — No movie playback and no speech audio; audio pipeline is Windows-only and partial

**Evidence**
- `play_gmovie` / `metarule(5/MOVIE)` exist as log-only no-ops (`scripting.ts`); there is no FMV decoder or browser video player wired to them.
- `setup.py` converts DAT extraction, images, PROs, and maps (`export_images`,
  `export_pros`, `export_maps`) — no audio, no movies, no `.int` scripts, no `.msg` text.
- `ASSETS.md:55` — "**Audio** is NOT automated. Run separately: `python convertAudio.py
  INSTALL_DIR` (requires `acm2wav.exe`)."
- `convertAudio.py:23-27` — hard-requires `acm2wav.exe` and an `SFX/` directory; covers
  SFX and music only.

**Gap.** No intro movie, no Vault City/Enclave cutscene movies, no ending movie, no
character speech (`.ACM` dialogue VO). The audio converter cannot run on Linux/macOS
without Wine.

**Acceptance.** Movies transcoded to a browser-playable container and played at their F2
trigger points; speech `.ACM` converted and played during dialogue; a cross-platform
converter path (or a documented, tested Wine/`ffmpeg` route) covering SFX, music, speech,
and movies.

---

### P1-10 — Two parallel UI stacks with divergent behavior

**Evidence.** Legacy DOM UI: `src/ui.ts` (1614 lines) driving the `<div>` tree in
`play.html` (`#inventoryBox`, `#barterBox`, `#lootBox`, `#worldMapContainer`,
`#elevatorBox`, `#calledShotBox`). New UI: `src/ui2/*` (17 WebGL panels). The switch is
`Config.ui.forceUI2OnlyGameplayPanels` (`src/player.ts:111-115`).

**Gap.** Inventory, barter, loot, world map, elevator, and called-shot each exist twice.
Bug fixes land in one and not the other, and which one runs depends on a config flag.
`play.html` is still titled `DarkFO`.

**Acceptance.** One UI stack. Delete the other, remove the config flag, strip the dead
`play.html` markup, and re-point the parity tests at the survivor.

---

### P1-11 — Pip-Boy is missing holodisks, archives, automaps, and rest

**Status.** Partial (Slice G). `src/character/rest.ts` advances `gameTickTime` with
timed-event firing, Healing Rate over rest, and chem/rad/poison simulation; Pip-Boy has
REST + DATA (archives) tabs; `src/character/holodisks.ts` is an in-memory archive with
serialize helpers. Still open: FO2 automap per visited level, encounter interrupts while
resting, richer Archives/Status layout, holodisk items from real protos.

**Acceptance.** Holodisks collectible and readable, archives populated by quest/rumor
state, automap rendered per visited level, and an alarm-clock rest UI that advances
`gameTickTime` (with encounter/healing/interrupt rules) and fires due timed events.

---

## Tier 2 — Fidelity gaps and correctness bugs

### P2-1 — `get_tile_fid` always returns 0 *(reproducible test failure)*

**Status:** Addressed (Slice A lut fixture + Slice E). `get_tile_fid` / `get_tile_fid_sfall`
resolve floor names via `lut/tiles.lst` or `data/art/tiles/tiles.lst`. `set_tile_fid` /
`set_tile_fid_sfall` now patch the live map floor grid so get/set round-trip (renderer
texture re-upload may still lag — checklist `partial`).

**Evidence (historical @ `cbcb8d1`)**
Previously returned 0 against a populated floor grid (`phase38` / `phase57`).

### P2-2 — No screen fades
`grep -rniE "fadeIn|fadeOut"` → 0 hits. Fallout 2 fades on every map change, dialogue
entry/exit, death, and cutscene. Their absence is immediately visible and also masks
loading hitches.

### P2-3 — Carry weight is unenforced in real gameplay
`Obj.addInventoryItem` (`src/object.ts:637`) has no weight check. The only enforcement
(`src/inventory.ts:50, 79`) is on the disconnected ECS path (**P0-2**). Follows P0-2.

### P2-4 — No character-model-level derived-stat parity audit
Two derived-stat implementations exist: `src/char.ts` (`StatSet`) and
`src/ecs/derivedStats.ts`. They are not cross-checked against each other or against F2
tables. Whichever survives P0-2 needs a table-driven parity test (AC, AP, carry weight,
healing rate, crit chance, DT/DR, party limit).

### P2-5 — Reaction/disposition system is thin
`grep -c "reaction"` → 13 non-test hits. F2 dialogue branches on a reaction value derived
from Charisma, reputation, karma, appearance (armor), and prior actions. Needs the full
model before dialogue gating can be faithful.

### P2-6 — Combat details unverified against original `[UNVERIFIED]`
Burst-fire cone geometry, knockback distances, called-shot crit tables, explosion falloff,
death-animation selection (including Bloody Mess), and critical-effect messages exist in
some form (`criticalEffects.ts`, `combat/damageFormula.ts`) but have not been diffed
against original tables in this review. Needs a dedicated audit issue.

### P2-7 — World-map encounter placement is simplified
`src/worldmap.ts:372-380` — comment states FO2 supports a richer
`Player(Perception)` distance formula for encounter placement, but only static spacing is
implemented. Also no special encounters (`grep "specialEncounter"` → 0 hits).

---

## Tier 3 — Process and validation

### P3-1 — CI green does not mean the engine works
The suite is 5164 tests but the tests that touch real game data cannot run, and the
highest-level "campaign" tests are self-referential scaffolds (**P0-4**, **P0-5**). Needed:
an asset-gated integration lane that boots the engine headless, loads `artemple`, runs its
real map script, and walks the player to the first exit grid.

### P3-2 — `scriptingChecklist.ts` reports 807/808 entries "implemented"
`grep -o "status: *'[a-z_]*'" src/scriptingChecklist.ts | sort | uniq -c` → 807
`implemented`, 0 `stub`, 0 `partial`. Meanwhile `README.md:58` calls the script runtime
"Partial (largest remaining gap)". Many entries describe deliberate no-ops as
"implemented" (e.g. `scripting.ts:4026` `set_tile_fid` logs and returns;
`scripting.ts:4529` "hook scripts are not implemented"). The checklist needs a status that
distinguishes *behaviorally complete* from *safely stubbed*, or it cannot be used to
measure progress.

### P3-3 — README and release-gate metrics are stale/incorrect
README badge says 5026/5100; `F2_RELEASE_GATE.md:50` says 120 files / 5089 tests; measured
is 5103/5164 across 122 files with 61 failures. Regenerate metrics from a real run and
wire that into CI so they cannot drift.

### P3-4 — No documented, runnable end-to-end play test
`README.md:322` says `python -m http.server` then open `play.html?artemple`. There is no
scripted or recorded playthrough to detect regressions in the actual game loop.

---

## Suggested sequencing

```
P0-2 (unify character model)  ─┬─→ P0-1 (new game + char creation) ─→ P0-3 (skilldex)
                               ├─→ P1-2 (perks/traits)
                               └─→ P2-3, P2-4

P0-4 (assets in CI) ──→ P0-5 (honest certification) ──→ P3-1, P3-2, P3-3

then: P1-1 (AI) → P1-3 (party) → P1-4/P1-5 (rad/poison/drugs) → P1-11 (rest, holodisks)
      → P1-7 (reputation) → P1-6 (car) → P1-9 (movies/speech) → P1-8 (endgame)
      → P1-10 (UI consolidation) → Tier 2 fidelity audits
```

**Rationale.** P0-2 is upstream of most gameplay work — building character creation,
perks, or carry weight on top of two divergent models means building each twice. P0-4/P0-5
are independent and should run in parallel, because until real assets are exercised in CI
there is no way to know whether any Tier 1 fix actually works on the real campaign.

## Honest assessment of remaining effort

The engine has a real map loader, a real script VM, a real combat loop, a working world
map with `worldmap.txt` parsing, and functioning save/load with map-state caching
(`globalState.dirtyMapCache`, `map.ts:321-360`) and script local-variable persistence
(`scripting.ts:_serialize` → `{ name, lvars }`). That is substantial and non-trivial work.

What is missing is not polish. There is no way to create a character, no way to use six of
the eight Skilldex skills, no ending, and no evidence that any real Fallout 2 script has
ever run. The current documentation states the opposite of all four. Closing Tier 0 alone
is a large body of work; Tier 0 + Tier 1 is what "playable start to finish" actually
requires.
