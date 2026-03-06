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
| Arroyo | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase26 + phase27/30/32 + phase35 full-route scaffold |
| Klamath | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase26 + phase27/30/32 + phase35 full-route scaffold |
| Den | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase26 + phase27/30/32 + phase35 full-route scaffold |
| Modoc | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34 + phase27/30/32 + phase35 full-route scaffold |
| Vault City | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34 + phase27/30/32 + phase35 full-route scaffold |
| Gecko | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34 + phase27/30/32 + phase35 full-route scaffold |
| Broken Hills | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34 + phase27/30/32 + phase35 full-route scaffold |
| New Reno | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34 + phase27/30/32 + phase35 full-route scaffold |
| NCR | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34 + phase27/30/32 + phase35 full-route scaffold |
| Redding | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34 + phase27/30/32 + phase35 full-route scaffold |
| San Francisco | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34 + phase27/30/32 + phase35 full-route scaffold |
| Navarro | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34 + phase27/30/32 + phase35 full-route scaffold |
| Enclave / Oil Rig | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | CERTIFIED | Certified via phase34/35 ending-route scaffold and persistence checks |

---

## Certification rules

1. A region cannot be marked `CERTIFIED` if any required system tag remains failing.
2. Any VM stub/unsupported procedure hit on a critical-path script is an automatic `BLOCKED`.
3. Blockers are only closed with:
   - deterministic reproduction notes,
   - corresponding automated regression coverage,
   - checklist status update in this file.
4. End-to-end release gate requires all regions certified and final Oil Rig ending flow completion.
