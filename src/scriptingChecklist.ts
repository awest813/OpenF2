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
        description: 'Read proto data fields (e.g. weight, size, DR, name) for any object PID. Used pervasively in map and critter scripts.',
        status: 'stub',
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
        description: 'Use one object on another (e.g. key on lock, stimpack on critter). Triggers target `use_p_proc` with source object context.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'tile_is_visible',
        kind: 'procedure',
        description: 'Returns whether a tile is currently visible to the player (not in fog of war). Always returns 1 (stub).',
        status: 'stub',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'reg_anim_animate',
        kind: 'procedure',
        description: 'Play a one-shot scripted animation on an object. Used extensively for NPC reactions and environmental effects.',
        status: 'stub',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'reg_anim_func',
        kind: 'procedure',
        description: 'Register a function callback in the animation queue (ANIM_BEGIN/ANIM_COMPLETE signals). Used to chain animation sequences.',
        status: 'stub',
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
        status: 'stub',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'metarule_46',
        kind: 'metarule',
        description: 'METARULE_CURRENT_TOWN(46): return the current city/town ID. Returns 0 (stub). Used by town-reputation and encounter scripts.',
        status: 'stub',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule_18',
        kind: 'metarule',
        description: 'METARULE_CRITTER_ON_DRUGS(18): check if a critter is under drug influence. Returns 0 (stub). Low progression impact.',
        status: 'stub',
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
        description: 'Execute inventory command on a critter (INVEN_CMD_INDEX_PTR and others). Fully stubbed — returns null.',
        status: 'stub',
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
        description: 'Display a floating dialogue message (no option, just [Done]). UI hookup bitrotted — message is silently dropped.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'gdialog_set_barter_mod',
        kind: 'procedure',
        description: 'Set a one-time barter modifier for the current dialogue. Stubbed — modifier is ignored.',
        status: 'stub',
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

    // -----------------------------------------------------------------------
    // Procedures — lower frequency / lower impact
    // -----------------------------------------------------------------------
    {
        id: 'obj_can_hear_obj',
        kind: 'procedure',
        description: 'Check whether obj can hear target (vs. line-of-sight version). Always returns 0.',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'has_trait_worn',
        kind: 'procedure',
        description: 'has_trait TRAIT_OBJECT / INVEN_TYPE_WORN (case 0): check worn armor trait. Falls through to stub.',
        status: 'stub',
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
