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
| Modoc | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates Modoc gate start and persistence path |
| Vault City | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates Vault City unlock prerequisites |
| Gecko | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates Gecko ↔ Vault City dependency globals |
| Broken Hills | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates mid-route progression continuity |
| New Reno | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates region transition continuity |
| NCR | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates NCR branch step sequencing |
| Redding | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates NCR→Redding continuation |
| San Francisco | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates endgame prerequisite route |
| Navarro | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates Navarro access gating |
| Enclave / Oil Rig | ☑ | ☑ | ☐ | ☐ | ☑ | ☐ | ☑ | IN_PROGRESS | Phase 34 scaffold validates final route unlock and Oil Rig entry |

---

## Certification rules

1. A region cannot be marked `CERTIFIED` if any required system tag remains failing.
2. Any VM stub/unsupported procedure hit on a critical-path script is an automatic `BLOCKED`.
3. Blockers are only closed with:
   - deterministic reproduction notes,
   - corresponding automated regression coverage,
   - checklist status update in this file.
4. End-to-end release gate requires all regions certified and final Oil Rig ending flow completion.
