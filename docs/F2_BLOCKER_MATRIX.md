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
| BLK-001 | CRITICAL | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | OPEN | Seed entry for first critical-path blocker |

---

## Closure checklist (required)

Before moving a blocker to `CLOSED`, confirm:

- [ ] Root cause identified in code and linked in Notes
- [ ] Fix merged in source with deterministic behavior
- [ ] Regression test added/updated and passing
- [ ] Region checklist status updated in `docs/F2_CRITICAL_PATH.md`
- [ ] Any related VM checklist status updated (when applicable)
