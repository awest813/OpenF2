# Fallout 2 Script VM Audit Matrix (Phase 1)

This matrix tracks procedure/opcode fidelity for Fallout 2 critical-path certification.

## Method

- Source-of-truth inventory: `src/scriptingChecklist.ts`
- Runtime gap telemetry:
  - `recordStubHit` / `drainStubHits`
  - VM unsupported operation telemetry in `src/vm.ts`
- Coverage mapping:
  - targeted regression suites (`phase*.test.ts`, campaign/worldmap/save/combat tests)

Legend:
- Critical-path relevance: `YES` / `PARTIAL` / `NO`
- Test coverage: `YES` (named test) / `PARTIAL` (indirect) / `NO`
- Priority:
  - `P0` campaign blocker
  - `P1` high gameplay fidelity impact
  - `P2` medium/low impact follow-up

| Procedure/Opcode | Kind | Current status | Main-quest scripts? | Common town scripts? | Current test coverage | Priority | Notes / next action |
|---|---|---|---|---|---|---|---|
| `proto_data` | procedure | partial | YES | YES | PARTIAL (`phase21.test.ts`, `phase22.test.ts`) | P0 | Continue filling remaining members used by quest scripts; add member-specific regressions per fix. |
| `use_obj` | procedure | implemented | YES | YES | YES (`phase11.test.ts`, `phase24.test.ts`) | P0 | Keep as baseline critical interaction path. |
| `use_obj_on_obj` | procedure | implemented | YES | YES | YES (`phase11.test.ts`) | P0 | Maintain stable item-on-target flow for key quest locks/triggers. |
| `use_obj_on_p_proc` | procedure | implemented | YES | YES | YES (`phase11.test.ts`) | P0 | Verify against town-specific item scripts during region certification. |
| `tile_is_visible` | procedure | partial | PARTIAL | YES | PARTIAL (`phase11.test.ts`, `phase22.test.ts`) | P1 | Current behavior is always-visible; replace with real visibility/fog query when map visibility state is available. |
| `reg_anim_animate` | procedure | partial | PARTIAL | YES | YES (`phase14.test.ts`) | P1 | Silent/log-only for many animation codes; upgrade for quest-visible scripted animation beats. |
| `reg_anim_func` | procedure | partial | PARTIAL | YES | YES (`phase14.test.ts`) | P1 | Callback semantics remain simplified; tighten ANIM_BEGIN/COMPLETE sequencing behavior. |
| `anim` | procedure | partial | YES | YES | YES (`phase19.test.ts`, `phase24.test.ts`) | P1 | Standard/mid/extended ranges largely no-op/logged; prioritize codes used by critical-path quest scripts. |
| `metarule_46` | metarule | partial | YES | YES | PARTIAL (`phase11.test.ts`) | P1 | Returns `currentMapID`; validate parity for town-ID semantics across multi-map hubs. |
| `metarule3_103` | metarule | implemented | YES | YES | YES (`phase22.test.ts`) | P1 | Implemented via active combat roster membership + global fallback. |
| `metarule3_104` | metarule | partial | PARTIAL | YES | YES (`phase22.test.ts`) | P1 | LOS currently always-true; replace with line-of-sight query once available in VM context. |
| `metarule3_102` | metarule | partial | PARTIAL | YES | YES (`phase22.test.ts`) | P2 | Walkability currently always-true; integrate map/path blocking query. |
| `get_game_mode` (0x817E) | opcode | partial | NO | PARTIAL | YES (`phase20.test.ts`) | P2 | Returns 0; implement mode bitmask register only if content requires it. |
| `set_global_script_repeat` (0x817F) | opcode | partial | NO | PARTIAL | YES (`phase20.test.ts`) | P2 | No-op currently; implement global script ticker when evidence shows progression dependency. |
| `get_script_return_value` (0x818F) | opcode | partial | NO | NO | YES (`phase25.test.ts`) | P2 | Hook-script support not present; keep monitored but lower campaign risk. |

## Current top implementation queue

1. `proto_data` member completion for remaining quest-relevant fields.
2. `anim`/`reg_anim_*` fidelity in branches that visibly alter progression scripts.
3. `metarule_46` parity validation across town/map transitions.
4. Visibility/LOS/walkability (`tile_is_visible`, `metarule3_104`, `metarule3_102`) once map-state APIs are wired into scripting.
