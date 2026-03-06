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

## Region checklist

Legend:
- Status: `NOT_STARTED` | `IN_PROGRESS` | `CERTIFIED` | `BLOCKED`
- Blockers link to `docs/F2_BLOCKER_MATRIX.md` entries.

| Region | scripts | dialogue | barter | combat | world_map | cinematics | reputation_karma_globals | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Arroyo | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 26 harness validates temple gating + quest global/map vars |
| Klamath | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 26 harness validates Klamath arrival, encounter return, Vic lead gating |
| Den | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 26 harness validates Den route unlock and post-load continuation |
| Modoc | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Multi-step town quest progression |
| Vault City | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Reputation + gate checks |
| Gecko | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Cross-town dependency with Vault City |
| Broken Hills | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Race/reputation state interactions |
| New Reno | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Family questline branching |
| NCR | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Mid/late-state faction outcomes |
| Redding | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Reputation + economy side effects |
| San Francisco | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Endgame prerequisite routes |
| Navarro | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Endgame setup gating |
| Enclave / Oil Rig | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | NOT_STARTED | Final quest chain + ending trigger |

---

## Certification rules

1. A region cannot be marked `CERTIFIED` if any required system tag remains failing.
2. Any VM stub/unsupported procedure hit on a critical-path script is an automatic `BLOCKED`.
3. Blockers are only closed with:
   - deterministic reproduction notes,
   - corresponding automated regression coverage,
   - checklist status update in this file.
4. End-to-end release gate requires all regions certified and final Oil Rig ending flow completion.
