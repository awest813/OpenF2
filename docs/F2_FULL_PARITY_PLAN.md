# Fallout 2 Full Parity Plan

**Goal:** a player can start a new game in the browser, play the Fallout 2 main
campaign start-to-finish with original-content fidelity, and see a correct ending.

**Status of this plan:** planning artifact for `main` @ `cbcb8d1` (re-verified).
Issue inventory lives in [`F2_PARITY_ISSUES.md`](./F2_PARITY_ISSUES.md).

---

## Executive verdict

OpenF2 has a real engine foundation (map load, ScriptVM, combat loop, world map,
save/load, UI2 panels) and a large crash-hardening / opcode surface. It does **not**
yet have campaign parity.

The release gate marked `READY` and all 13 regions marked `CERTIFIED` are backed by
synthetic harnesses (`phase35`, `campaignSmoke`) that set globals by assignment and
never load real maps or scripts. Measured suite: **5103 pass / 61 fail** across 122
files; failures are almost entirely asset-absent script corpora plus `get_tile_fid`.

**Honest gate status: `NOT_READY`.** Full parity requires closing Tier 0 first, then
Tier 1 systems, then region re-certification against real assets.

---

## What “full parity” means here

In scope:

1. New Game → character creation → Temple of Trials → Arroyo → … → Oil Rig ending
2. Original `.int` / `.msg` / map / proto behavior on critical path (no unsupported
   opcode hits that break progression)
3. Core out-of-combat systems: Skilldex (8 skills), rest, party, drugs/rad/poison,
   reputation, car, Pip-Boy holodisks/automap
4. Ending slide selection from quest/rep state
5. One character model driving HUD, combat, scripts, and character sheet
6. Asset-gated CI that proves real scripts run

Out of scope until after campaign certification (matches existing freeze):

- Fallout 1 parity
- WebGPU / multiplayer / netplay
- Editor / mod-authoring expansion beyond what campaign scripts need
- QoL unrelated to progression

---

## Current status dashboard (code-verified)

| Area | Claimed in old docs | Actual |
|---|---|---|
| Region certification | All 13 `CERTIFIED` | Scaffold-only; reset to `NOT_STARTED` |
| Release gate | `READY` | `NOT_READY` |
| Script checklist | Partial gaps in README | 807/807 marked `implemented` (many safe no-ops) |
| Blocker matrix | No open HIGH/CRITICAL | True, but issues were crash/hardening focused |
| Tests | 5089 / “all green” | 5103/5164; 61 failures |
| Assets in repo | Implied playable | Only `nullmap`; no `data/scripts` |
| New game / chargen | — | Slice C: menu + chargen + Temple handoff (remaining polish) |
| Character model | Working | Critter source of truth + ECS projection (HUD/sheet); deeper writes remain |
| Skilldex | Working | 8/8 Skilldex selectable; Steal/Traps fidelity polish remains |
| Ending | Certified via scaffold | No `ENDGAME.TXT` / slide selection |
| Combat AI | Partial | Uses 2 of ~20 AI.TXT fields |
| Perks / traits | Partial | ~17 perks / 4 traits vs ~119 / 16 |

---

## Workstreams

### WS0 — Honest measurement (do first, parallel-safe)

| ID | Work | Done when |
|---|---|---|
| WS0.1 | Mark release gate `NOT_READY`; reset region checklist | Docs match reality; `phase33` updated if it asserts READY |
| WS0.2 | Asset-absent tests `skip` instead of fail | Clean checkout: `npm test` green |
| WS0.3 | Split checklist status: `implemented` vs `safe_stub` / `partial` | Counts reflect behavioral fidelity |
| WS0.4 | Refresh README / ROADMAP metrics from live run | Badge matches `npm test` |
| WS0.5 | Document opt-in real-asset lane | `docs` + script: convert install → run Arroyo corpus |

**Unblocks:** everything else cannot be trusted until measurement is honest.

---

### WS1 — Single character model (P0-2)

**Problem:** `globalState.player` (Critter/`char.ts`) drives combat/scripts; ECS
`playerEntityId` drives HUD / Pip-Boy / perk UI / inventory weight.

**Plan:**

1. Choose source of truth: prefer **Critter/`globalState.player`** for campaign speed
   (already wired into combat + scripting); make ECS a projection adapter.
2. Point `gamePanel`, `pipboy`, `characterScreen` reads at `globalState.player`
   (or a thin adapter that mirrors Critter → ECS every frame).
3. Route `awardXP` / perk grant / skill spend through the same model scripts use
   (`give_exp_points`, `playerPerksOwed`, `SkillSet`).
4. Enforce carry weight on `Obj.addInventoryItem`.
5. Regression: damage player in combat → HUD HP and character sheet HP both drop;
   spend skill point → `has_skill` / combat rolls change.

**Unblocks:** chargen (WS2), perks (WS4), carry weight (P2-3), derived-stat audit (P2-4).

---

### WS2 — New game + character creation (P0-1)

1. Main menu: New Game / Load / Options / Credits / Quit (UI2).
2. Chargen: SPECIAL (40 points, 1–10 clamps), 3 tag skills, 0–2 traits, name, age,
   gender; derived preview (HP, AP, carry, melee dmg).
3. Persist created character onto `globalState.player`; clear debug 1337 caps loadout
   for New Game (keep debug path behind flag).
4. Handoff: load Temple of Trials (`artemple`) with intro cinematic if available.
5. Save immediately after chargen as slot 0 / autosave.

**Depends on:** WS1 (otherwise chargen writes the wrong model).

---

### WS3 — Skilldex completion (P0-3)

Implement remaining skills with F2 rolls and targeting:

| Skill | Notes |
|---|---|
| Sneak | Toggle; sets pcFlags bit; perception checks |
| Steal | Target inventory UI + detection → reaction/combat |
| Traps | Disarm / set; failure damage |
| First Aid | Heal; uses/day |
| Doctor | Heal + cripple repair; uses/day |
| Science | Terminals / robots / quest checks |

Wire Skilldex UI → `main.ts` skill dispatch; remove “unimplemented skill” dead ends.

---

### WS4 — Assets + real script certification (P0-4, P0-5)

1. Extend `setup.py` (or document companion scripts) to export `.int`, `.msg`, speech,
   and movies where feasible.
2. CI lane (manual/opt-in): real install path → convert → run phase100/101/107.
3. Replace scaffold certification rules:
   - Region `CERTIFIED` only if real maps load, critical scripts run under ScriptVM,
     no progression-blocking stub hits, save/load roundtrip on that region’s gates.
4. First real-asset milestone: **Arroyo end-to-end** (Temple → village → world map).

---

### WS5 — Campaign systems (Tier 1)

Order after WS1–WS4 foundation:

| Order | Issue | System |
|---|---|---|
| 1 | P1-2 | Full perk/trait tables + picker on live model |
| 2 | P1-5 | Drugs / addiction / timed modifiers |
| 3 | P1-4 | Radiation + poison effects over game time |
| 4 | P1-11 | Pip-Boy rest, holodisks, automap, archives |
| 5 | P1-3 | Party.txt companions, follow, combat control |
| 6 | P1-7 | Town rep, karma titles, reputation flags |
| 7 | P1-1 | AI.TXT field consumption |
| 8 | P1-6 | Highwayman travel / fuel / trunk / parking |
| 9 | P1-9 | Movies + speech audio (cross-platform convert) |
| 10 | P1-8 | ENDGAME.TXT ending selection + credits |
| 11 | P1-10 | Delete legacy DOM UI; UI2 only |

---

### WS6 — Fidelity polish (Tier 2)

Parallelizable once regions are under real-asset certification:

- P2-1 fix `get_tile_fid` / floor grid wiring (already failing tests)
- Screen fades (P2-2)
- Reaction model (P2-5)
- Combat table audit vs original (P2-6)
- World-map encounter placement + specials (P2-7)
- Visibility/LOS/walkability currently always-true approximations in metarule3
- Animation queue fidelity (`reg_anim_*`) where quests gate on completion

---

## Region re-certification track

After WS4 rules land, certify in campaign order (not all-at-once):

```
Arroyo → Klamath → Den → Modoc → Vault City → Gecko
  → Broken Hills → New Reno → NCR → Redding
  → San Francisco → Navarro → Enclave/Oil Rig
```

Per region checklist (required systems unchanged):

- `scripts` `dialogue` `barter` `combat` `world_map` `cinematics` `reputation_karma_globals`

A region cannot flip to `CERTIFIED` while any Tier 0 issue remains open, or while a
critical-path script hits an unresolved `safe_stub` that alters quest globals wrongly.

---

## Definition of done — full parity

All of the following must be true:

1. [ ] Gate status `READY` under **new** certification rules (not scaffolds)
2. [ ] All 13 regions `CERTIFIED` with real-asset evidence linked
3. [ ] No open CRITICAL/HIGH items in `F2_PARITY_ISSUES.md` Tier 0–1
4. [ ] Clean checkout `npm test` green (asset suites skip when absent)
5. [ ] Opt-in real-asset suite green on a documented Fallout 2 install
6. [ ] Manual or scripted playthrough: New Game → Oil Rig ending slides
7. [ ] `npx tsc --noEmit` clean
8. [ ] README metrics match a live run

---

## Suggested execution slices

Small PRs preferred; each slice should leave tests green.

| Slice | Scope | Primary issues | Status |
|---|---|---|---|
| A | Docs honesty + skip asset tests + checklist status split | P0-5, P0-4 partial, P3-* | Done |
| B | Unify character model + HUD/sheet adapters | P0-2, P2-3 | Done (adapter) |
| C | Main menu + chargen + New Game handoff | P0-1 | Done (core flow) |
| D | Skilldex 6 missing skills | P0-3 | Done (core dispatch) |
| E | Fix `get_tile_fid`; Arroyo real-script smoke | P2-1, P0-4 | Done (tile FID + opt-in lane) |
| F | Perks/traits + drugs + rad/poison | P1-2, P1-4, P1-5 | |
| G | Rest / holodisks / party | P1-11, P1-3 | |
| H | Rep + AI + car | P1-7, P1-1, P1-6 | |
| I | Movies/speech + endgame | P1-9, P1-8 | |
| J | UI consolidation + region re-cert wave 1–N | P1-10, P0-5 | |

---

## Risks

| Risk | Mitigation |
|---|---|
| Dual character model work is invasive | Adapter-first: project Critter → ECS before deleting ECS writes |
| Real assets cannot ship in repo | Opt-in CI + skip-when-absent; never commit copyrighted data |
| Checklist “all implemented” hides gaps | Introduce `safe_stub` / re-open partials with evidence |
| Scope creep into FO1 / WebGPU / netplay | Keep freeze in `F2_CRITICAL_PATH.md` until Oil Rig certified |
| Synthetic tests give false confidence | Ban scaffold-only CERTIFIED; require ScriptVM + map load |

---

## Immediate next actions

1. ~~Land this plan + issue list; set gate to `NOT_READY`.~~
2. ~~Slice A: asset tests skip + checklist status vocabulary.~~
3. ~~Slice B: Critter → ECS projection for HUD.~~
4. ~~Slice C: main menu + chargen + Temple handoff.~~
5. ~~**Slice D:** Skilldex remaining skills.~~
6. ~~Slice E: `get_tile_fid` + Arroyo real-script smoke / opt-in asset lane.~~
7. Continue P0-2: perk grant / XP award through Critter model.
8. Slice F: perks/traits + drugs + rad/poison (Tier 1).
