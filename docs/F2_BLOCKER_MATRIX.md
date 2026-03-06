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

---

## Latest phase runs

- Phase 26 early-campaign route suite (`src/phase26.test.ts`) passed with no new critical blockers opened.
- UI2 interaction fidelity suites (`src/ui2/ui2.test.ts`, `src/ui2/panelParity.test.ts`) passed after barter exchange-commit fix.
- World-map reliability suites (`src/phase28.test.ts`, `src/worldmapEncounter.test.ts`) passed with saved-position normalization coverage.
- Save/load hardening suite (`src/saveload.test.ts`) passed with worldPosition + script-global roundtrip coverage.
- Combat fidelity suite (`src/combat.integration.test.ts`) passed after AP subtraction guard hardening.

## Closure checklist (required)

Before moving a blocker to `CLOSED`, confirm:

- [ ] Root cause identified in code and linked in Notes
- [ ] Fix merged in source with deterministic behavior
- [ ] Regression test added/updated and passing
- [ ] Region checklist status updated in `docs/F2_CRITICAL_PATH.md`
- [ ] Any related VM checklist status updated (when applicable)
