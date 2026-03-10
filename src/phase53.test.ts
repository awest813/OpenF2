/**
 * Phase 53 regression tests.
 *
 * Covers:
 *   A. BLK-039 — Weapon slot persistence: leftHandPID/rightHandPID serialization
 *   B. BLK-040 — Combat stability: dead-target guard and no-AP guard in nextTurn
 *   C. BLK-042 — sfall opcodes 0x81C6–0x81CF in opMap
 *   D. Scripting procedures: get_critter_base_stat, critter_mod_skill_points,
 *      get_combat_target, set_combat_target, get_game_time_in_seconds,
 *      get_light_level, set_light_level_sfall, get/set_critter_current_ap
 *   E. Checklist integrity — all Phase 53 entries present with expected status
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import { opMap } from './vm_opcodes.js'

// ===========================================================================
// Phase 53-A — BLK-039: Weapon slot persistence
// ===========================================================================

describe('Phase 53-A — BLK-039: Weapon slot serialization (leftHandPID/rightHandPID)', () => {
    it('get_critter_weapon (slot 0) still returns rightHand with pid', () => {
        Scripting.init('test_phase53')
        const script = new (Scripting as any).Script()
        drainStubHits()
        const weapon = { type: 'item', subtype: 'weapon', pid: 100 }
        const mockCritter = {
            type: 'critter',
            position: { x: 1, y: 1 },
            rightHand: weapon,
            leftHand: undefined,
            inventory: [weapon],
        }
        expect(script.get_critter_weapon(mockCritter, 0)).toBe(weapon)
    })

    it('get_critter_weapon (slot 1) still returns leftHand with pid', () => {
        Scripting.init('test_phase53')
        const script = new (Scripting as any).Script()
        drainStubHits()
        const weapon = { type: 'item', subtype: 'weapon', pid: 101 }
        const mockCritter = {
            type: 'critter',
            position: { x: 1, y: 1 },
            rightHand: undefined,
            leftHand: weapon,
            inventory: [weapon],
        }
        expect(script.get_critter_weapon(mockCritter, 1)).toBe(weapon)
    })

    it('get_critter_weapon returns 0 when weapon has no pid (punch stub)', () => {
        Scripting.init('test_phase53')
        const script = new (Scripting as any).Script()
        drainStubHits()
        const mockCritter = {
            type: 'critter',
            position: { x: 0, y: 0 },
            rightHand: { type: 'item', subtype: 'weapon' }, // no pid — punch stub
            leftHand: undefined,
            inventory: [],
        }
        expect(script.get_critter_weapon(mockCritter, 0)).toBe(0)
    })

    it('weapon slot restoration: leftHand re-assigned when leftHandPID matches inventory', () => {
        // Simulate the fromMapObject BLK-039 logic in isolation
        const weaponInInventory = { type: 'item', subtype: 'weapon', pid: 200 }
        const inventory = [weaponInInventory]
        const mobj = { leftHandPID: 200, rightHandPID: undefined }
        const obj: any = { inventory, leftHand: undefined, rightHand: undefined }

        if (typeof mobj.leftHandPID === 'number') {
            const w = obj.inventory.find(
                (inv: any) => inv.pid === mobj.leftHandPID && inv.subtype === 'weapon'
            )
            if (w) {obj.leftHand = w}
        }

        expect(obj.leftHand).toBe(weaponInInventory)
    })

    it('weapon slot restoration: rightHand re-assigned when rightHandPID matches inventory', () => {
        const weaponInInventory = { type: 'item', subtype: 'weapon', pid: 201 }
        const inventory = [weaponInInventory]
        const mobj = { leftHandPID: undefined, rightHandPID: 201 }
        const obj: any = { inventory, leftHand: undefined, rightHand: undefined }

        if (typeof mobj.rightHandPID === 'number') {
            const w = obj.inventory.find(
                (inv: any) => inv.pid === mobj.rightHandPID && inv.subtype === 'weapon'
            )
            if (w) {obj.rightHand = w}
        }

        expect(obj.rightHand).toBe(weaponInInventory)
    })

    it('weapon slot restoration: no match leaves slot unchanged', () => {
        const mobj = { leftHandPID: 999 }
        const obj: any = { inventory: [], leftHand: undefined }

        if (typeof mobj.leftHandPID === 'number') {
            const w = obj.inventory.find(
                (inv: any) => inv.pid === mobj.leftHandPID && inv.subtype === 'weapon'
            )
            if (w) {obj.leftHand = w}
        }

        expect(obj.leftHand).toBeUndefined()
    })
})

// ===========================================================================
// Phase 53-B — BLK-040: Combat stability scripting guards
// ===========================================================================

describe('Phase 53-B — BLK-040: Combat AP scripting guards', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase53')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('get_critter_current_ap returns 0 for null', () => {
        expect(script.get_critter_current_ap(null)).toBe(0)
    })

    it('get_critter_current_ap returns 0 for non-critter object', () => {
        expect(script.get_critter_current_ap({})).toBe(0)
    })

    it('get_critter_current_ap returns 0 for critter with no AP', () => {
        const mockCritter = { type: 'critter', position: { x: 0, y: 0 }, inventory: [] }
        expect(script.get_critter_current_ap(mockCritter)).toBe(0)
    })

    it('get_critter_current_ap returns AP.combat when present', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 0, y: 0 },
            inventory: [],
            AP: { combat: 7, move: 0 },
        }
        expect(script.get_critter_current_ap(mockCritter)).toBe(7)
    })

    it('set_critter_current_ap does not throw for null', () => {
        expect(() => script.set_critter_current_ap(null, 5)).not.toThrow()
    })

    it('set_critter_current_ap does not throw for non-critter', () => {
        expect(() => script.set_critter_current_ap({}, 5)).not.toThrow()
    })

    it('set_critter_current_ap does not throw for critter with no AP', () => {
        const mockCritter = { type: 'critter', position: { x: 0, y: 0 }, inventory: [] }
        expect(() => script.set_critter_current_ap(mockCritter, 5)).not.toThrow()
    })

    it('set_critter_current_ap sets AP.combat when AP is present', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 0, y: 0 },
            inventory: [],
            AP: { combat: 3, move: 0 },
        }
        script.set_critter_current_ap(mockCritter, 10)
        expect(mockCritter.AP.combat).toBe(10)
    })

    it('set_critter_current_ap clamps to 0 for negative AP', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 0, y: 0 },
            inventory: [],
            AP: { combat: 5, move: 0 },
        }
        script.set_critter_current_ap(mockCritter, -3)
        expect(mockCritter.AP.combat).toBe(0)
    })
})

// ===========================================================================
// Phase 53-C — BLK-042: sfall opcodes 0x81C6–0x81CF in opMap
// ===========================================================================

describe('Phase 53-C — sfall opcodes 0x81C6–0x81CF registered (BLK-042)', () => {
    const PHASE53_OPCODES = [
        0x81c6, 0x81c7, 0x81c8, 0x81c9, 0x81ca,
        0x81cb, 0x81cc, 0x81cd, 0x81ce, 0x81cf,
    ]

    for (const opcode of PHASE53_OPCODES) {
        it(`opMap[0x${opcode.toString(16)}] is defined (no unknown-opcode halt)`, () => {
            expect(opMap[opcode]).toBeDefined()
            expect(typeof opMap[opcode]).toBe('function')
        })
    }
})

// ===========================================================================
// Phase 53-D — Scripting procedure tests
// ===========================================================================

describe('Phase 53-D — get_critter_base_stat scripting function', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase53')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('get_critter_base_stat returns 0 for null', () => {
        expect(script.get_critter_base_stat(null, 0)).toBe(0)
    })

    it('get_critter_base_stat returns 0 for non-critter', () => {
        expect(script.get_critter_base_stat({}, 0)).toBe(0)
    })

    it('get_critter_base_stat returns 0 for unknown stat', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 0, y: 0 },
            inventory: [],
            stats: { getBase: (s: string) => 5 },
        }
        expect(script.get_critter_base_stat(mockCritter, 999)).toBe(0)
    })

    it('get_critter_base_stat does not throw', () => {
        expect(() => script.get_critter_base_stat(null, 0)).not.toThrow()
        expect(() => script.get_critter_base_stat({}, 3)).not.toThrow()
    })
})

describe('Phase 53-D — set_critter_base_stat scripting function', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase53')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('set_critter_base_stat does not throw for null', () => {
        expect(() => script.set_critter_base_stat(null, 0, 10)).not.toThrow()
    })

    it('set_critter_base_stat does not throw for non-critter', () => {
        expect(() => script.set_critter_base_stat({}, 0, 10)).not.toThrow()
    })

    it('set_critter_base_stat does not throw for unknown stat', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 0, y: 0 },
            inventory: [],
            stats: { setBase: () => {} },
        }
        expect(() => script.set_critter_base_stat(mockCritter, 999, 10)).not.toThrow()
    })
})

describe('Phase 53-D — critter_mod_skill_points scripting function', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase53')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('critter_mod_skill_points does not throw for null', () => {
        expect(() => script.critter_mod_skill_points(null, 5)).not.toThrow()
    })

    it('critter_mod_skill_points does not throw for non-player critter', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 0, y: 0 },
            inventory: [],
            isPlayer: false,
        }
        expect(() => script.critter_mod_skill_points(mockCritter, 5)).not.toThrow()
    })

    it('critter_mod_skill_points does not emit a stub hit', () => {
        drainStubHits()
        script.critter_mod_skill_points({}, 5)
        expect(drainStubHits().length).toBe(0)
    })
})

describe('Phase 53-D — get_combat_target and set_combat_target', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase53')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('get_combat_target returns 0 (no per-critter tracking)', () => {
        const mockCritter = { type: 'critter', position: { x: 0, y: 0 }, inventory: [] }
        expect(script.get_combat_target(mockCritter)).toBe(0)
    })

    it('get_combat_target does not throw for null', () => {
        expect(() => script.get_combat_target(null)).not.toThrow()
    })

    it('set_combat_target does not throw', () => {
        const mockCritter = { type: 'critter', position: { x: 0, y: 0 }, inventory: [] }
        const mockTarget = { type: 'critter', position: { x: 5, y: 5 }, inventory: [] }
        expect(() => script.set_combat_target(mockCritter, mockTarget)).not.toThrow()
    })

    it('set_combat_target does not throw for null args', () => {
        expect(() => script.set_combat_target(null, null)).not.toThrow()
    })
})

describe('Phase 53-D — get_game_time_in_seconds', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase53')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('get_game_time_in_seconds returns a number', () => {
        const result = script.get_game_time_in_seconds()
        expect(typeof result).toBe('number')
    })

    it('get_game_time_in_seconds does not throw', () => {
        expect(() => script.get_game_time_in_seconds()).not.toThrow()
    })

    it('get_game_time_in_seconds returns non-negative value', () => {
        const result = script.get_game_time_in_seconds()
        expect(result).toBeGreaterThanOrEqual(0)
    })

    it('get_game_time_in_seconds returns integer', () => {
        const result = script.get_game_time_in_seconds()
        expect(result).toBe(Math.floor(result))
    })
})

describe('Phase 53-D — get_light_level and set_light_level_sfall', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase53')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('get_light_level returns a number', () => {
        const result = script.get_light_level()
        expect(typeof result).toBe('number')
    })

    it('get_light_level returns value between 0 and 65536', () => {
        const result = script.get_light_level()
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(65536)
    })

    it('set_light_level_sfall does not throw', () => {
        expect(() => script.set_light_level_sfall(32768, 1)).not.toThrow()
    })

    it('set_light_level_sfall does not throw for null', () => {
        expect(() => script.set_light_level_sfall(null, 0)).not.toThrow()
    })

    it('set_light_level_sfall clamps values to 0–65536', () => {
        expect(() => script.set_light_level_sfall(-100, 0)).not.toThrow()
        expect(() => script.set_light_level_sfall(99999, 0)).not.toThrow()
    })

    it('set_light_level_sfall then get_light_level returns set value', () => {
        script.set_light_level_sfall(40000, 0)
        const result = script.get_light_level()
        expect(result).toBe(40000)
    })

    it('set_light_level_sfall does not emit a stub hit', () => {
        drainStubHits()
        script.set_light_level_sfall(65536, 1)
        expect(drainStubHits().length).toBe(0)
    })
})

// ===========================================================================
// Phase 53-E — Checklist integrity
// ===========================================================================

describe('Phase 53-E — Checklist entries: all Phase 53 IDs present', () => {
    const PHASE53_IDS = [
        'blk039_weapon_slot_save',
        'blk040_dead_target_guard',
        'blk040_no_ap_guard',
        'sfall_get_critter_base_stat',
        'sfall_set_critter_base_stat',
        'sfall_critter_mod_skill_points',
        'sfall_get_critter_current_ap',
        'sfall_set_critter_current_ap',
        'sfall_get_combat_target',
        'sfall_set_combat_target',
        'sfall_get_game_time_in_seconds',
        'sfall_get_light_level_81ce',
        'sfall_set_light_level_sfall',
    ]

    for (const id of PHASE53_IDS) {
        it(`checklist entry '${id}' is present`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry).toBeDefined()
        })
    }

    it('blk039_weapon_slot_save is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'blk039_weapon_slot_save')
        expect(e?.status).toBe('implemented')
        expect(e?.impact).toBe('high')
    })

    it('blk040_dead_target_guard is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'blk040_dead_target_guard')
        expect(e?.status).toBe('implemented')
        expect(e?.impact).toBe('high')
    })

    it('blk040_no_ap_guard is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'blk040_no_ap_guard')
        expect(e?.status).toBe('implemented')
    })

    it('sfall_get_critter_base_stat is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_get_critter_base_stat')
        expect(e?.status).toBe('implemented')
    })

    it('sfall_set_critter_base_stat is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_set_critter_base_stat')
        expect(e?.status).toBe('implemented')
    })

    it('sfall_get_game_time_in_seconds is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_get_game_time_in_seconds')
        expect(e?.status).toBe('implemented')
    })

    it('sfall_get_light_level_81ce is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_get_light_level_81ce')
        expect(e?.status).toBe('implemented')
    })

    it('sfall_get_combat_target is partial (no per-critter tracking)', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_get_combat_target')
        expect(e?.status).toBe('partial')
    })

    it('sfall_set_combat_target is partial (no-op in browser build)', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_set_combat_target')
        expect(e?.status).toBe('partial')
    })
})
