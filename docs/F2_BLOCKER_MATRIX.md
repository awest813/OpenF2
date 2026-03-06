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

---

## Closure checklist (required)

Before moving a blocker to `CLOSED`, confirm:

- [ ] Root cause identified in code and linked in Notes
- [ ] Fix merged in source with deterministic behavior
- [ ] Regression test added/updated and passing
- [ ] Region checklist status updated in `docs/F2_CRITICAL_PATH.md`
- [ ] Any related VM checklist status updated (when applicable)
