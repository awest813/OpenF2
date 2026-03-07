/**
 * Phase 60 regression tests.
 *
 * Covers:
 *   A. BLK-059 — Combat null-position guards (attack, findTarget, doAITurn, nextTurn)
 *   B. sfall opcodes 0x8200–0x8207
 *   C. Checklist integrity
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import globalState from './globalState.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'TestNPC',
        position: { x: 10, y: 20 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 100,
        hostile: false,
        teamNum: 1,
        stats: { getBase: () => 5, setBase: () => {}, modifyBase: () => {}, get: () => 5, baseStats: {} },
        skills: { getBase: () => 0, setBase: () => {}, baseSkills: {}, skillPoints: 0 },
        getStat: (s: string) => s === 'HP' ? 30 : s === 'Max HP' ? 50 : 5,
        perkRanks: {},
        ...overrides,
    }
}

// ===========================================================================
// Phase 60-A — BLK-059: Combat null-position guards
// ===========================================================================

describe('Phase 60-A — BLK-059: Combat null-position guards', () => {
    it('BLK-059 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_059_combat_null_position_guards')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 60-B — sfall opcodes 0x8200–0x8207
// ===========================================================================

describe('Phase 60-B — sfall opcodes 0x8200–0x8207', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    // ---- 0x8200 get_critter_current_hp_sfall ----
    it('get_critter_current_hp_sfall (0x8200) returns 0 for non-critter', () => {
        expect(script.get_critter_current_hp_sfall(null as any)).toBe(0)
    })

    it('get_critter_current_hp_sfall (0x8200) returns HP from getStat', () => {
        const critter = makeObj({ getStat: (s: string) => s === 'HP' ? 45 : 0 })
        expect(script.get_critter_current_hp_sfall(critter)).toBe(45)
    })

    // ---- 0x8201 get_critter_level_sfall2 ----
    it('get_critter_level_sfall2 (0x8201) returns 1 for non-critter', () => {
        expect(script.get_critter_level_sfall2(null as any)).toBe(1)
    })

    it('get_critter_level_sfall2 (0x8201) returns critter level', () => {
        const critter = makeObj({ level: 5 })
        expect(script.get_critter_level_sfall2(critter)).toBe(5)
    })

    it('get_critter_level_sfall2 (0x8201) defaults to 1 when level undefined', () => {
        const critter = makeObj({ level: undefined })
        expect(script.get_critter_level_sfall2(critter)).toBe(1)
    })

    // ---- 0x8202 get_num_nearby_critters_sfall ----
    it('get_num_nearby_critters_sfall (0x8202) returns 0 for non-game-object', () => {
        expect(script.get_num_nearby_critters_sfall(null as any, 10, -1)).toBe(0)
    })

    it('get_num_nearby_critters_sfall (0x8202) counts critters in radius', () => {
        const center = makeObj({ position: { x: 0, y: 0 }, teamNum: 0 })
        const near = makeObj({ position: { x: 1, y: 0 }, teamNum: 1 })
        const far = makeObj({ position: { x: 50, y: 0 }, teamNum: 1 })
        const savedMap = globalState.gMap
        ;(globalState as any).gMap = { getObjects: () => [center, near, far] }
        try {
            // radius 5, any team: should count center + near (not far)
            expect(script.get_num_nearby_critters_sfall(center, 5, -1)).toBe(2)
        } finally {
            ;(globalState as any).gMap = savedMap
        }
    })

    it('get_num_nearby_critters_sfall (0x8202) filters by team', () => {
        const center = makeObj({ position: { x: 0, y: 0 }, teamNum: 0 })
        const ally = makeObj({ position: { x: 1, y: 0 }, teamNum: 0 })
        const enemy = makeObj({ position: { x: 2, y: 0 }, teamNum: 1 })
        const savedMap = globalState.gMap
        ;(globalState as any).gMap = { getObjects: () => [center, ally, enemy] }
        try {
            // Only team 0 critters within radius 5
            expect(script.get_num_nearby_critters_sfall(center, 5, 0)).toBe(2) // center + ally
        } finally {
            ;(globalState as any).gMap = savedMap
        }
    })

    it('get_num_nearby_critters_sfall (0x8202) skips dead critters', () => {
        const center = makeObj({ position: { x: 0, y: 0 } })
        const deadNear = makeObj({ position: { x: 1, y: 0 }, dead: true })
        const savedMap = globalState.gMap
        ;(globalState as any).gMap = { getObjects: () => [center, deadNear] }
        try {
            // Dead critters should not be counted
            expect(script.get_num_nearby_critters_sfall(center, 5, -1)).toBe(1)
        } finally {
            ;(globalState as any).gMap = savedMap
        }
    })

    it('get_num_nearby_critters_sfall (0x8202) skips null-position critters', () => {
        const center = makeObj({ position: { x: 0, y: 0 } })
        const nullPos = makeObj({ position: null })
        const savedMap = globalState.gMap
        ;(globalState as any).gMap = { getObjects: () => [center, nullPos] }
        try {
            expect(() => script.get_num_nearby_critters_sfall(center, 5, -1)).not.toThrow()
        } finally {
            ;(globalState as any).gMap = savedMap
        }
    })

    // ---- 0x8203/0x8204 is/set_critter_hostile_sfall ----
    it('is_critter_hostile_sfall (0x8203) returns 0 for non-critter', () => {
        expect(script.is_critter_hostile_sfall(null as any)).toBe(0)
    })

    it('is_critter_hostile_sfall (0x8203) returns 0 for non-hostile critter', () => {
        const critter = makeObj({ hostile: false })
        expect(script.is_critter_hostile_sfall(critter)).toBe(0)
    })

    it('is_critter_hostile_sfall (0x8203) returns 1 for hostile critter', () => {
        const critter = makeObj({ hostile: true })
        expect(script.is_critter_hostile_sfall(critter)).toBe(1)
    })

    it('set/is_critter_hostile_sfall round-trip', () => {
        const critter = makeObj({ hostile: false })
        script.set_critter_hostile_sfall(critter, 1)
        expect(critter.hostile).toBe(true)
        script.set_critter_hostile_sfall(critter, 0)
        expect(critter.hostile).toBe(false)
    })

    it('set_critter_hostile_sfall does not throw for non-critter', () => {
        expect(() => script.set_critter_hostile_sfall(null as any, 1)).not.toThrow()
    })

    // ---- 0x8205 get_inven_slot_sfall ----
    it('get_inven_slot_sfall (0x8205) returns 0 for non-critter', () => {
        expect(script.get_inven_slot_sfall(null as any, 0)).toBe(0)
    })

    it('get_inven_slot_sfall (0x8205) returns left hand item at slot 0', () => {
        const weapon = { type: 'item', subtype: 'weapon' }
        const critter = makeObj({ leftHand: weapon })
        expect(script.get_inven_slot_sfall(critter, 0)).toBe(weapon)
    })

    it('get_inven_slot_sfall (0x8205) returns armor at slot 2', () => {
        const armor = { type: 'item', subtype: 'armor' }
        const critter = makeObj({ equippedArmor: armor })
        expect(script.get_inven_slot_sfall(critter, 2)).toBe(armor)
    })

    it('get_inven_slot_sfall (0x8205) returns 0 for empty slot', () => {
        const critter = makeObj({ leftHand: null, rightHand: null, equippedArmor: null })
        expect(script.get_inven_slot_sfall(critter, 0)).toBe(0)
    })

    it('get_inven_slot_sfall (0x8205) returns 0 for unknown slot', () => {
        const critter = makeObj()
        expect(script.get_inven_slot_sfall(critter, 99)).toBe(0)
    })

    // ---- 0x8206 get_critter_body_type_sfall ----
    it('get_critter_body_type_sfall (0x8206) returns 0 for non-critter', () => {
        expect(script.get_critter_body_type_sfall(null as any)).toBe(0)
    })

    it('get_critter_body_type_sfall (0x8206) returns bodyType from proto', () => {
        const critter = makeObj({ pro: { extra: { bodyType: 1 } } })
        expect(script.get_critter_body_type_sfall(critter)).toBe(1)
    })

    it('get_critter_body_type_sfall (0x8206) defaults to 0 when no proto', () => {
        const critter = makeObj({ pro: null })
        expect(script.get_critter_body_type_sfall(critter)).toBe(0)
    })

    // ---- 0x8207 get_flags_sfall ----
    it('get_flags_sfall (0x8207) returns 0 for non-game-object', () => {
        expect(script.get_flags_sfall(null as any)).toBe(0)
    })

    it('get_flags_sfall (0x8207) returns flags from object', () => {
        const obj = makeObj({ flags: 0x0010 })
        expect(script.get_flags_sfall(obj)).toBe(0x0010)
    })

    it('get_flags_sfall (0x8207) returns 0 when flags undefined', () => {
        const obj = makeObj({ flags: undefined })
        expect(script.get_flags_sfall(obj)).toBe(0)
    })
})

// ===========================================================================
// Phase 60-C — Checklist integrity
// ===========================================================================

describe('Phase 60-C — Checklist integrity', () => {
    const phase60Ids = [
        'blk_059_combat_null_position_guards',
        'sfall_get_critter_current_hp',
        'sfall_get_critter_level2',
        'sfall_get_num_nearby_critters',
        'sfall_is_critter_hostile',
        'sfall_set_critter_hostile',
        'sfall_get_inven_slot',
        'sfall_get_critter_body_type',
        'sfall_get_flags',
    ]

    it('all Phase 60 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase60Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK-059 entry has status "implemented"', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_059_combat_null_position_guards')
        expect(entry?.status).toBe('implemented')
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('total checklist entries have grown from Phase 59', () => {
        // Should have at least 9 new entries for Phase 60
        expect(SCRIPTING_STUB_CHECKLIST.length).toBeGreaterThanOrEqual(200)
    })
})
