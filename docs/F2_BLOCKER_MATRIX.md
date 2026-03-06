# Fallout 2 Critical Path Blocker Matrix

Use this matrix to track only blockers that impact campaign completion or fidelity on the critical path.

Severity guidance:
- `CRITICAL`: blocks or corrupts campaign progression
- `HIGH`: major fidelity issue with high risk of progression failure
- `MEDIUM`: noticeable fidelity gap with workaround

Status guidance:
- `OPEN`
- `IN_PROGRESS`
- `FIXED_PENDING_TEST`
- `CLOSED`

---

| ID | Severity | Region | Map/Script | Procedure/Opcode | Symptom | Repro Steps | Expected Behavior | Automated Test Coverage | Owner | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BLK-001 | HIGH | Global/VM | `src/scripting.ts` | `tile_num_in_direction` + scripting type paths | TypeScript compile failed due duplicate function implementation and invalid type usages in scripting bridge methods. | `npx tsc --noEmit` produced TS2393/TS2345/TS2339 errors. | VM scripting module compiles cleanly with one canonical `tile_num_in_direction` implementation and type-safe logging/object narrowing. | `npx tsc --noEmit`, `src/phase24.test.ts` | @engine | CLOSED | Fixed by removing duplicate method, correcting log/warn argument typing, and narrowing `source_obj` union. |
| BLK-002 | HIGH | Global/VM | `metarule3` runtime | `metarule3_103` | `METARULE3_CRITTER_IN_COMBAT` answered from global flag only, not per-critter participation. | Call `metarule3(103, critter, ...)` during combat with critter absent from combat roster. | Return 1 only for critters in active combatant list (fallback to global flag only when roster unavailable). | `src/phase22.test.ts` (new roster and fallback assertions) | @engine | CLOSED | Checklist entry promoted to implemented after regression coverage. |
| BLK-003 | HIGH | Interaction/UI2 | barter session loop | `BarterPanel._tryOffer` | Accepted offers cleared barter tables without committing exchanged items into working inventories, causing item loss in repeated barter rounds. | Move one item from each side to tables and click OFFER in UI2 barter panel. | Accepted offers transfer merchant-table items into player inventory and player-table items into merchant inventory; tables then clear. | `src/ui2/ui2.test.ts`, `src/ui2/panelParity.test.ts` | @engine | CLOSED | Added inventory merge-on-accept behavior + regression coverage for accepted/refused flows. |
| BLK-004 | HIGH | World Map | world-map session restore | `Worldmap.init` starting position | World-map session always initialized at Arroyo hotspot, ignoring saved world travel position and risking travel-state discontinuity after load. | Provide saved world position, initialize world map, observe cursor starts at default area instead of saved point. | World-map initialization restores saved position (clamped to bounds) and keeps global worldPosition synchronized during movement. | `src/phase28.test.ts`, `src/worldmapEncounter.test.ts` | @engine | CLOSED | Added normalization helper + runtime sync to global worldPosition for save continuity. |
| BLK-005 | HIGH | Save/Load | runtime persistence integration | `saveload` world-position/script globals path | Runtime save/load resilience suite had no integration assertion proving `save()` persisted worldPosition and `load()` restored worldPosition + script globals together. | Save slot with non-default world position and marker GVAR; mutate runtime values; load slot. | Loaded state restores saved worldPosition and scripted global variable markers. | `src/saveload.test.ts` | @engine | CLOSED | Added in-memory backend integration regressions for worldPosition persistence + load restoration. |
| BLK-006 | HIGH | Combat | AP accounting | `ActionPoints.subtractCombatAP/subtractMoveAP` | Negative AP spend inputs could increase AP due subtraction of negative values, allowing AP-gain exploit in malformed call paths. | Call `subtractCombatAP(-n)` or `subtractMoveAP(-n)` on live ActionPoints object. | Non-positive AP spend values are treated as no-op and cannot increase AP. | `src/combat.integration.test.ts` | @engine | CLOSED | Added guards for `value <= 0` in AP subtraction methods and regression test coverage. |
| BLK-007 | HIGH | Quest Consequences | reputation/global-var branch continuity | consequence gate evaluation + persistence | No dedicated regression suite verified that cross-town consequence gates (karma/reputation + GVAR conditions) stay consistent after save/load. | Apply consequence actions (quest globals + reputation changes), save, load, re-evaluate branch gates. | Consequence-driven branch gates remain stable and deterministic across save/load. | `src/phase31.test.ts` | @engine | CLOSED | Added consequence harness covering NCR/Vault City/Broken Hills gate unlock/revoke + persistence. |
| BLK-008 | HIGH | Cinematics | slide timing robustness | `CinematicPlayer._showSlide` duration handling | Invalid slide durations (negative/NaN) could produce undefined playback timing behavior in ending/intro sequences. | Play cinematic sequence with malformed slide duration values. | Invalid durations fall back to deterministic default timing; valid durations still honored. | `src/phase32.test.ts`, `src/phase3.test.ts` | @engine | CLOSED | Added duration validation fallback to default 4000 ms plus regression tests. |
| BLK-009 | HIGH | Certification | artifact consistency | critical-path docs/checkpoints consistency | No automated check ensured region checklist, blocker matrix, and phase checkpoint artifacts stayed synchronized and structurally complete. | Run consistency assertions against docs for required regions, blocker states, and phase 0-8 checkpoint completeness. | Certification artifacts stay in sync and fail loudly in CI when structure drifts. | `src/phase33.test.ts` | @engine | CLOSED | Added certification artifact integrity suite for region list + blocker/checkpoint consistency. |
| BLK-010 | HIGH | Combat | called-shot robustness | `Combat.getHitChance` region handling | Unknown called-shot region keys could produce NaN hit calculations and throw, risking runtime combat interruption in scripts/modded inputs. | Call hit/roll with an unrecognized region string. | Unknown regions safely fall back to torso modifiers without throwing. | `src/phase30.test.ts`, `src/combat.integration.test.ts` | @engine | CLOSED | Added torso-fallback handling in hit-chance computation + regression coverage. |
| BLK-011 | HIGH | Region Certification | mid/late campaign continuity | mid/late route progression scaffold | No focused regression covered Modoc→Oil Rig critical-route gating and persistence as a single progression chain. | Execute staged progression through mid/late region gates and roundtrip save/load before final Oil Rig unlock. | Mid/late route globals, map-area discoveries, and final-route unlock remain stable and deterministic. | `src/phase34.test.ts` | @engine | CLOSED | Added mid/late campaign scaffold harness with gating + persistence assertions. |
| BLK-012 | HIGH | Release Gate | end-to-end campaign scaffold validation | full-playthrough harness | No single regression proved the full critical route could traverse early + mid/late scaffolds through Oil Rig ending trigger with save/load continuity. | Execute full route scaffold, save/load before and after ending trigger, verify Oil Rig endpoint and ending flag persistence. | End-to-end scaffold run reaches ending flow and persists ending trigger state across save/load. | `src/phase35.test.ts` | @engine | CLOSED | Added full critical-path scaffold run and release-gate sanity checks. |

---

## Latest phase runs

- Phase 26 early-campaign route suite (`src/phase26.test.ts`) passed with no new critical blockers opened.
- UI2 interaction fidelity suites (`src/ui2/ui2.test.ts`, `src/ui2/panelParity.test.ts`) passed after barter exchange-commit fix.
- World-map reliability suites (`src/phase28.test.ts`, `src/worldmapEncounter.test.ts`) passed with saved-position normalization coverage.
- Save/load hardening suite (`src/saveload.test.ts`) passed with worldPosition + script-global roundtrip coverage.
- Combat fidelity suite (`src/combat.integration.test.ts`) passed after AP subtraction guard hardening.
- Quest consequence suite (`src/phase31.test.ts`) passed for karma/reputation/global-var gate persistence.
- Cinematic timing suite (`src/phase32.test.ts`) passed with malformed-duration guard coverage.
- Certification scaffolding suite (`src/phase33.test.ts`) passed for docs/checkpoint/blocker consistency.
- Phase 27/29/30 suites (`src/phase27.test.ts`, `src/phase29.test.ts`, `src/phase30.test.ts`) passed for interaction lifecycle, long-campaign save/load drift checks, and combat region fallback safety.
- Full project regression run (`npm test`) passed: 53 files / 1817 tests.
- Mid/late route scaffold suite (`src/phase34.test.ts`) passed for Modoc→Oil Rig gate/persistence continuity.
- Full-route scaffold suite (`src/phase35.test.ts`) passed for early→late→ending flow continuity.

## Closure checklist (required)

Before moving a blocker to `CLOSED`, confirm:

- [ ] Root cause identified in code and linked in Notes
- [ ] Fix merged in source with deterministic behavior
- [ ] Regression test added/updated and passing
- [ ] Region checklist status updated in `docs/F2_CRITICAL_PATH.md`
- [ ] Any related VM checklist status updated (when applicable)
