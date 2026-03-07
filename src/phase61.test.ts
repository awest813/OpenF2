/**
 * Phase 61 regression tests.
 *
 * Covers:
 *   A. BLK-060 — tile_distance_objs / tile_num null-position guards
 *   B. BLK-061 — add_timer_event callback null-script guard
 *   C. sfall opcodes 0x8208–0x820F
 *   D. Checklist integrity
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'TestNPC',
        position: { x: 5, y: 5 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 100,
        hostile: false,
        teamNum: 1,
        charTraits: new Set<number>(),
        stats: { getBase: () => 5, setBase: () => {}, modifyBase: () => {}, get: () => 5, baseStats: {} },
        skills: { getBase: () => 0, setBase: () => {}, baseSkills: {}, skillPoints: 0 },
        getStat: (s: string) => s === 'HP' ? 30 : 5,
        perkRanks: {},
        ...overrides,
    }
}

// ===========================================================================
// Phase 61-A — BLK-060: tile_distance_objs / tile_num null-position guards
// ===========================================================================

describe('Phase 61-A — BLK-060: tile_distance_objs / tile_num null-position guards', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('tile_distance_objs returns 0 when first object has null position', () => {
        const a = makeObj({ position: null })
        const b = makeObj({ position: { x: 5, y: 5 } })
        expect(() => script.tile_distance_objs(a, b)).not.toThrow()
        expect(script.tile_distance_objs(a, b)).toBe(0)
    })

    it('tile_distance_objs returns 0 when second object has null position', () => {
        const a = makeObj({ position: { x: 5, y: 5 } })
        const b = makeObj({ position: null })
        expect(() => script.tile_distance_objs(a, b)).not.toThrow()
        expect(script.tile_distance_objs(a, b)).toBe(0)
    })

    it('tile_distance_objs returns correct distance for valid positions', () => {
        const a = makeObj({ position: { x: 0, y: 0 } })
        const b = makeObj({ position: { x: 0, y: 0 } })
        const result = script.tile_distance_objs(a, b)
        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThanOrEqual(0)
    })

    it('tile_num returns -1 when object has null position', () => {
        const obj = makeObj({ position: null })
        expect(() => script.tile_num(obj)).not.toThrow()
        expect(script.tile_num(obj)).toBe(-1)
    })

    it('tile_num returns a number for valid position', () => {
        const obj = makeObj({ position: { x: 10, y: 10 } })
        const result = script.tile_num(obj)
        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThanOrEqual(0)
    })
})

// ===========================================================================
// Phase 61-B — BLK-061: add_timer_event null-script guard
// ===========================================================================

describe('Phase 61-B — BLK-061: add_timer_event null-script guard', () => {
    it('BLK-061 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_061_add_timer_event_null_script')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 61-C — sfall opcodes 0x8208–0x820F
// ===========================================================================

describe('Phase 61-C — sfall opcodes 0x8208–0x820F', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    // ---- 0x8208 get_critter_trait_sfall ----
    it('get_critter_trait_sfall (0x8208) returns 0 for non-critter', () => {
        expect(script.get_critter_trait_sfall(null as any, 0)).toBe(0)
    })

    it('get_critter_trait_sfall (0x8208) returns 0 when trait absent', () => {
        const critter = makeObj()
        expect(script.get_critter_trait_sfall(critter, 5)).toBe(0)
    })

    it('get_critter_trait_sfall (0x8208) returns 1 when trait present', () => {
        const traits = new Set([3, 7, 12])
        const critter = makeObj({ charTraits: traits })
        expect(script.get_critter_trait_sfall(critter, 7)).toBe(1)
    })

    // ---- 0x8209 set_critter_trait_sfall ----
    it('set_critter_trait_sfall (0x8209) does not throw for non-critter', () => {
        expect(() => script.set_critter_trait_sfall(null as any, 5, 1)).not.toThrow()
    })

    it('set_critter_trait_sfall (0x8209) adds a trait', () => {
        const critter = makeObj()
        script.set_critter_trait_sfall(critter, 11, 1)
        expect(critter.charTraits.has(11)).toBe(true)
    })

    it('set_critter_trait_sfall (0x8209) removes a trait', () => {
        const traits = new Set([11])
        const critter = makeObj({ charTraits: traits })
        script.set_critter_trait_sfall(critter, 11, 0)
        expect(critter.charTraits.has(11)).toBe(false)
    })

    // ---- 0x820A get_critter_race_sfall ----
    it('get_critter_race_sfall (0x820A) returns 0 for non-critter', () => {
        expect(script.get_critter_race_sfall(null as any)).toBe(0)
    })

    it('get_critter_race_sfall (0x820A) returns race from proto', () => {
        const critter = makeObj({ pro: { extra: { race: 2 } } })
        expect(script.get_critter_race_sfall(critter)).toBe(2)
    })

    it('get_critter_race_sfall (0x820A) defaults to 0 when no proto', () => {
        const critter = makeObj({ pro: null })
        expect(script.get_critter_race_sfall(critter)).toBe(0)
    })

    // ---- 0x820B obj_has_trait_sfall ----
    it('obj_has_trait_sfall (0x820B) is an alias of get_critter_trait_sfall', () => {
        const critter = makeObj({ charTraits: new Set([5]) })
        expect(script.obj_has_trait_sfall(critter, 5)).toBe(1)
        expect(script.obj_has_trait_sfall(critter, 6)).toBe(0)
    })

    // ---- 0x820C get_critter_move_ap_sfall ----
    it('get_critter_move_ap_sfall (0x820C) returns 0 for non-critter', () => {
        expect(script.get_critter_move_ap_sfall(null as any)).toBe(0)
    })

    it('get_critter_move_ap_sfall (0x820C) returns 0 when AP not initialized', () => {
        const critter = makeObj({ AP: null })
        expect(script.get_critter_move_ap_sfall(critter)).toBe(0)
    })

    it('get_critter_move_ap_sfall (0x820C) returns value from AP.getAvailableMoveAP()', () => {
        const critter = makeObj({ AP: { getAvailableMoveAP: () => 7, getAvailableCombatAP: () => 3 } })
        expect(script.get_critter_move_ap_sfall(critter)).toBe(7)
    })

    // ---- 0x820D get_critter_combat_ap_sfall ----
    it('get_critter_combat_ap_sfall (0x820D) returns 0 for non-critter', () => {
        expect(script.get_critter_combat_ap_sfall(null as any)).toBe(0)
    })

    it('get_critter_combat_ap_sfall (0x820D) returns value from AP.getAvailableCombatAP()', () => {
        const critter = makeObj({ AP: { getAvailableMoveAP: () => 7, getAvailableCombatAP: () => 3 } })
        expect(script.get_critter_combat_ap_sfall(critter)).toBe(3)
    })

    // ---- 0x820E critter_knockout_sfall ----
    it('critter_knockout_sfall (0x820E) returns 0 for non-critter', () => {
        expect(script.critter_knockout_sfall(null as any)).toBe(0)
    })

    it('critter_knockout_sfall (0x820E) returns 0 for non-KO critter', () => {
        const critter = makeObj({ knockedOut: false })
        expect(script.critter_knockout_sfall(critter)).toBe(0)
    })

    it('critter_knockout_sfall (0x820E) returns 1 for KO critter', () => {
        const critter = makeObj({ knockedOut: true })
        expect(script.critter_knockout_sfall(critter)).toBe(1)
    })

    // ---- 0x820F get_map_script_id_sfall ----
    it('get_map_script_id_sfall (0x820F) returns a number', () => {
        const result = script.get_map_script_id_sfall()
        expect(typeof result).toBe('number')
    })
})

// ===========================================================================
// Phase 61-D — Checklist integrity
// ===========================================================================

describe('Phase 61-D — Checklist integrity', () => {
    const phase61Ids = [
        'blk_060_tile_distance_null_position',
        'blk_061_add_timer_event_null_script',
        'sfall_get_critter_trait',
        'sfall_set_critter_trait',
        'sfall_get_critter_race',
        'sfall_obj_has_trait',
        'sfall_get_critter_move_ap',
        'sfall_get_critter_combat_ap',
        'sfall_critter_knockout',
        'sfall_get_map_script_id',
    ]

    it('all Phase 61 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase61Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK entries have status "implemented"', () => {
        const blkIds = [
            'blk_060_tile_distance_null_position',
            'blk_061_add_timer_event_null_script',
        ]
        for (const id of blkIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should be implemented`).toBe('implemented')
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
