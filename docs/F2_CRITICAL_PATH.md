# Fallout 2 Critical Path Certification

## Scope Lock

OpenF2 completion target is **Fallout 2 main campaign fidelity in browser**:

- Start new game and progress naturally from Arroyo to Oil Rig ending flow.
- Preserve original quest/state gating semantics as closely as possible.
- Treat scripting VM behavior and campaign progression correctness as primary.

### Frozen non-goals until certification completes

- Fallout 1 parity work
- Tooling/editor/mod-authoring expansion
- QoL-only polish not required for campaign completion
- New engine feature work unrelated to campaign blockers

---

## Required systems tags

Each critical region is evaluated against the same required systems:

- `scripts`
- `dialogue`
- `barter`
- `combat`
- `world_map`
- `cinematics`
- `reputation_karma_globals`

---

## Certification honesty note (2026-07-29)

Earlier revisions marked every region `CERTIFIED` and the release gate `READY` based on
synthetic scaffold harnesses (`phase26`/`phase34`/`phase35`) that assign globals and map
names without loading real Fallout 2 maps or executing real `.int` scripts.

Those scaffolds remain useful as **state-machine smoke tests**, but they do **not**
constitute campaign certification. Region status below is reset to `NOT_STARTED`.
Re-certification rules and sequencing live in:

- [`F2_FULL_PARITY_PLAN.md`](./F2_FULL_PARITY_PLAN.md)
- [`F2_PARITY_ISSUES.md`](./F2_PARITY_ISSUES.md) (P0-5)

---

## Region checklist

Legend:
- Status: `NOT_STARTED` | `IN_PROGRESS` | `CERTIFIED` | `BLOCKED`
- Blockers link to `docs/F2_BLOCKER_MATRIX.md` and `docs/F2_PARITY_ISSUES.md`.

| Region | scripts | dialogue | barter | combat | world_map | cinematics | reputation_karma_globals | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Arroyo | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| Klamath | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| Den | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| Modoc | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| Vault City | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| Gecko | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| Broken Hills | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| New Reno | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| NCR | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| Redding | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| San Francisco | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| Navarro | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |
| Enclave / Oil Rig | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Scaffold smoke exists; real-asset re-cert pending |

---

## Certification rules

1. A region cannot be marked `CERTIFIED` if any required system tag remains failing.
2. Any VM stub/unsupported procedure hit on a critical-path script is an automatic `BLOCKED`.
3. Blockers are only closed with:
   - deterministic reproduction notes,
   - corresponding automated regression coverage,
   - checklist status update in this file.
4. End-to-end release gate requires all regions certified and final Oil Rig ending flow completion.
5. **Real-asset rule:** a region is only `CERTIFIED` when its real maps load, its real
   scripts execute through `ScriptVM` without progression-blocking unsupported-opcode
   hits, and its quest gates advance under a scripted or recorded playthrough. Synthetic
   harnesses that assign globals without map/script execution are not sufficient.
