/**
 * Machine-readable checklist of all known Fallout 2 scripting stubs and
 * unsupported opcodes/procedures in the OpenF2 engine.
 *
 * Each entry records:
 *   - `id`         : unique key (opcode hex or procedure name)
 *   - `kind`       : 'opcode' | 'procedure' | 'metarule'
 *   - `description`: human-readable explanation
 *   - `status`     : 'stub' | 'partial' | 'implemented'
 *   - `frequency`  : rough call frequency from Fallout 2 data ('high'|'medium'|'low')
 *   - `impact`     : progression impact if missing ('blocker'|'high'|'medium'|'low')
 *
 * Runtime instrumentation is provided via `recordStubHit` / `drainStubHits`.
 * These are automatically called by the `stub()` helper in scripting.ts.
 * They are deterministic FIFO queues — safe to use in tests.
 */

// ---------------------------------------------------------------------------
// Checklist entries
// ---------------------------------------------------------------------------

export type StubStatus = 'stub' | 'partial' | 'implemented'
export type StubFrequency = 'high' | 'medium' | 'low'
export type StubImpact = 'blocker' | 'high' | 'medium' | 'low'

export interface StubEntry {
    id: string
    kind: 'opcode' | 'procedure' | 'metarule'
    description: string
    status: StubStatus
    frequency: StubFrequency
    impact: StubImpact
}

/**
 * SCRIPTING_STUB_CHECKLIST — single source of truth for all known gaps.
 *
 * Sorted by impact DESC, frequency DESC.
 */
export const SCRIPTING_STUB_CHECKLIST: readonly StubEntry[] = Object.freeze([
    // -----------------------------------------------------------------------
    // Procedures — high frequency / high impact
    // -----------------------------------------------------------------------
    {
        id: 'proto_data',
        kind: 'procedure',
        description:
            'Read proto data fields (e.g. weight, size, DR, name) for any object PID. Used pervasively in map and critter scripts.',
        status: 'partial',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'use_obj',
        kind: 'procedure',
        description: 'Player uses an object. Delegates to object use flow (`obj.use`) and uses source_obj when it is a critter; falls back to player.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'use_obj_on_obj',
        kind: 'procedure',
        description: 'Use one object on another (e.g. key on lock, stimpack on critter). Prefers target `use_obj_on_p_proc`; falls back to `use_p_proc`.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'use_obj_on_p_proc',
        kind: 'procedure',
        description: 'Procedure triggered on a target object when another item is used on it (e.g. key on lock, stimpack on critter). Sets source_obj to the applied item.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'push_p_proc',
        kind: 'procedure',
        description: 'Procedure triggered on an NPC when the player pushes them. Sets source_obj to the pusher. Returns _didOverride to suppress default bump.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'is_dropping_p_proc',
        kind: 'procedure',
        description: 'Procedure triggered on an item when it is about to be dropped. Sets source_obj to the dropper. Returns _didOverride to cancel the drop.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'tile_is_visible',
        kind: 'procedure',
        description: 'Returns whether a tile is currently visible to the player (not in fog of war). Always returns 1 (partial).',
        status: 'partial',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'reg_anim_animate',
        kind: 'procedure',
        description: 'Play a one-shot scripted animation on an object. Used extensively for NPC reactions and environmental effects.',
        status: 'partial',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'reg_anim_func',
        kind: 'procedure',
        description: 'Register a function callback in the animation queue (ANIM_BEGIN/ANIM_COMPLETE signals). Used to chain animation sequences.',
        status: 'partial',
        frequency: 'high',
        impact: 'medium',
    },

    // -----------------------------------------------------------------------
    // Metarule sub-cases
    // -----------------------------------------------------------------------
    {
        id: 'metarule_17',
        kind: 'metarule',
        description: 'METARULE_IS_AREA_KNOWN(17): check if a world-map area has been discovered. Returns 0 (stub). Affects NPC dialogue and map quest flags.',
        status: 'partial',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'metarule_46',
        kind: 'metarule',
        description: 'METARULE_CURRENT_TOWN(46): return the current city/town ID. Returns currentMapID. Used by town-reputation and encounter scripts.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule_18',
        kind: 'metarule',
        description: 'METARULE_CRITTER_ON_DRUGS(18): check if a critter is under drug influence. Returns 0 (partial).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Procedures — medium frequency / medium impact
    // -----------------------------------------------------------------------
    {
        id: 'anim',
        kind: 'procedure',
        description: 'Trigger an arbitrary scripted animation on an object. Handles rotation (1000) and frame-set (1010) but otherwise stubs.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'inven_cmds',
        kind: 'procedure',
        description: 'Execute inventory command on a critter. INVEN_CMD_INDEX_PTR (13) returns inventory entry by index; other commands remain stubbed.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'critter_inven_obj_worn',
        kind: 'procedure',
        description: 'critter_inven_obj with INVEN_TYPE_WORN (0): get currently worn armor. Returns equippedArmor field.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'gsay_message',
        kind: 'procedure',
        description: 'Display a floating dialogue message (no option, just [Done]). Calls uiSetDialogueReply with the looked-up message string.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'gdialog_set_barter_mod',
        kind: 'procedure',
        description: 'Set a one-time barter modifier for the current dialogue. Stored in _barterMod on the script object.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // sfall opcodes — implemented
    // -----------------------------------------------------------------------
    {
        id: 'get_critter_base_stat',
        kind: 'opcode',
        description: 'sfall 0x8166: get_critter_base_stat(critter, stat) — read a base SPECIAL/derived stat for any critter (not just PC). Uses the same statMap as get_critter_stat.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_critter_base_stat',
        kind: 'opcode',
        description: 'sfall 0x8167: set_critter_base_stat(critter, stat, value) — write a base SPECIAL/derived stat for any critter. Mirrors set_pc_base_stat but for arbitrary critters.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'in_combat',
        kind: 'opcode',
        description: 'sfall 0x8168: in_combat() → 1 when the engine is in combat, 0 otherwise. Used by scripts to gate combat-only logic.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_current_town',
        kind: 'opcode',
        description: 'sfall 0x8169: get_current_town() → current map/area ID. Sfall-style shortcut for metarule(46, 0). Used by town-scoped NPC dialogue.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'critter_is_dead',
        kind: 'opcode',
        description: 'sfall 0x816A: critter_is_dead(obj) → 1 if the critter\'s HP <= 0, 0 otherwise. Used by combat and scripted encounter checks.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_dialogue_active',
        kind: 'opcode',
        description: 'sfall 0x816B: get_dialogue_active() → 1 if a dialogue is currently open, 0 otherwise. Used to guard dialogue-only script branches.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'abs_value',
        kind: 'opcode',
        description: 'sfall 0x816C: abs_value(x) → |x|. Returns the absolute value of a number. Used by scripts performing distance/difference calculations.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'string_length',
        kind: 'opcode',
        description: 'sfall 0x816D: string_length(str) → length of string as integer. Used by scripts doing string manipulation or validation.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'pow',
        kind: 'opcode',
        description: 'sfall 0x816E: pow(base, exp) → base^exp. Exponentiation for script formula calculations.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'obj_is_valid',
        kind: 'opcode',
        description: 'sfall 0x816F: obj_is_valid(obj) → 1 if obj is a valid game object, 0 otherwise. Used as a safe null-check before using objects in scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_critter_kills',
        kind: 'opcode',
        description: 'sfall 0x8170: get_critter_kills(kill_type) → number of kills of given kill type. Used by karma/perk calculations and scripted kill-count checks.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'set_critter_kills',
        kind: 'opcode',
        description: 'sfall 0x8171: set_critter_kills(kill_type, amount) — overwrite kill count for a type. Used by scripted tests and quest reward scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_critter_body_type',
        kind: 'opcode',
        description: 'sfall 0x8172: get_critter_body_type(obj) → body-type index (0=biped, 1=quadruped, 2=robotic, …). Used by combat AI and animation gating scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'floor2',
        kind: 'opcode',
        description: 'sfall 0x8173: floor2(x) → Math.floor(x). Integer floor used by drug-duration and formula scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'obj_count_by_pid',
        kind: 'opcode',
        description: 'sfall 0x8174: obj_count_by_pid(pid) → number of live objects on the current map with matching PID. Used by scripted encounter clean-up.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Procedures — lower frequency / lower impact
    // -----------------------------------------------------------------------
    {
        id: 'obj_can_hear_obj',
        kind: 'procedure',
        description: 'Check whether obj can hear target (vs. line-of-sight version). Implemented as short-range proximity hearing (<= 12 hexes).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'has_trait_worn',
        kind: 'procedure',
        description: 'has_trait TRAIT_OBJECT supports INVEN_TYPE_WORN (0), OBJECT_AI_PACKET (5), and OBJECT_TEAM_NUM (6) for critters.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'critter_add_trait_weight',
        kind: 'procedure',
        description: 'critter_add_trait OBJECT_CUR_WEIGHT (669): set critter\'s carry weight. Silently ignored.',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'gfade_out',
        kind: 'procedure',
        description: 'gfade_out(time): screen fade-out over `time` game ticks. Logged but not visually implemented (no FMV/fade pipeline yet).',
        status: 'partial',
        frequency: 'high',
        impact: 'low',
    },
    {
        id: 'gfade_in',
        kind: 'procedure',
        description: 'gfade_in(time): screen fade-in over `time` game ticks. Logged but not visually implemented.',
        status: 'partial',
        frequency: 'high',
        impact: 'low',
    },
    {
        id: 'play_gmovie',
        kind: 'procedure',
        description: 'play_gmovie(id): play an FMV cut-scene by ID. Logged but skipped (no FMV pipeline in browser build).',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
])

// ---------------------------------------------------------------------------
// Runtime stub-hit telemetry
// ---------------------------------------------------------------------------

export interface StubHit {
    /** Procedure / metarule / opcode name that was called as a stub. */
    name: string
    /** ISO timestamp of the hit. */
    timestamp: number
    /** Optional extra context string (e.g. script name, args). */
    context?: string
}

/** FIFO queue of stub hits accumulated since last drain. */
const _stubHits: StubHit[] = []

/**
 * Record that a stub was called at runtime.
 *
 * Called by the `stub()` helper in `scripting.ts` — not intended for direct
 * use outside of scripting internals.
 */
export function recordStubHit(name: string, context?: string): void {
    _stubHits.push({ name, timestamp: Date.now(), context })
}

/**
 * Return and clear all stub hits accumulated since the last drain.
 *
 * Safe to call from tests: returns a snapshot and resets the buffer.
 */
export function drainStubHits(): StubHit[] {
    const hits = [..._stubHits]
    _stubHits.length = 0
    return hits
}

/**
 * Return the current stub hit count without clearing the buffer.
 */
export function stubHitCount(): number {
    return _stubHits.length
}

/**
 * Return the number of stubs in each status category.
 *
 * Useful for CI dashboards and progress tracking.
 */
export function stubChecklistSummary(): { stub: number; partial: number; implemented: number } {
    const summary = { stub: 0, partial: 0, implemented: 0 }
    for (const entry of SCRIPTING_STUB_CHECKLIST) summary[entry.status]++
    return summary
}
