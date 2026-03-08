/**
 * Phase 70 regression tests.
 *
 * Covers:
 *   A. BLK-086 — canSee() null position guard
 *   B. BLK-087 — isWithinPerception() null position guard (via objCanSeeObj / obj_can_see_obj)
 *   C. BLK-088 — metarule3(106) filter null position guard
 *   D. BLK-089 — num_critters_in_radius() null position guard
 *   E. BLK-090 — updateCritter() null position guard (toTileNum fallback)
 *   F. sfall opcodes 0x8250–0x8257
 *   G. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import globalState from './globalState.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return { ...actual, uiStartCombat: vi.fn(), uiEndCombat: vi.fn(), uiLog: vi.fn() }
})

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
        getStat: (s: string) => 5,
        getSkill: (s: string) => 50,
        pcFlags: 0,
        stats: {
            getBase: (s: string) => 0,
            modifyBase: (_s: string, _v: number) => {},
        },
        ...overrides,
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
})

// ===========================================================================
// Phase 70-A — BLK-086: canSee() null position guard
// ===========================================================================

describe('Phase 70-A — BLK-086: canSee() null position guard', () => {
    it('obj_can_see_obj does not throw when obj.position is null', () => {
        const obj = makeObj({ position: null })
        const target = makeObj({ position: { x: 10, y: 10 } })
        expect(() => script.obj_can_see_obj(obj, target)).not.toThrow()
    })

    it('obj_can_see_obj does not throw when target.position is null', () => {
        const obj = makeObj({ position: { x: 5, y: 5 } })
        const target = makeObj({ position: null })
        expect(() => script.obj_can_see_obj(obj, target)).not.toThrow()
    })

    it('obj_can_see_obj does not throw when both positions are null', () => {
        const obj = makeObj({ position: null })
        const target = makeObj({ position: null })
        expect(() => script.obj_can_see_obj(obj, target)).not.toThrow()
    })

    it('BLK-086 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_086_can_see_null_position')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 70-B — BLK-087: isWithinPerception() null position guard
// ===========================================================================

describe('Phase 70-B — BLK-087: isWithinPerception() null position guard', () => {
    it('obj_can_see_obj does not throw when obj is non-critter and target.position is null', () => {
        const obj = makeObj({ position: { x: 5, y: 5 } })
        const target = makeObj({ type: 'item', position: null })
        // Non-critter target skips isWithinPerception, goes direct to gMap check
        expect(() => script.obj_can_see_obj(obj, target)).not.toThrow()
    })

    it('obj_can_see_obj does not throw when critter target.position is null', () => {
        const obj = makeObj({ position: { x: 5, y: 5 } })
        const target = makeObj({ type: 'critter', position: null })
        expect(() => script.obj_can_see_obj(obj, target)).not.toThrow()
    })

    it('obj_can_see_obj does not throw when critter obj.position is null', () => {
        const obj = makeObj({ type: 'critter', position: null })
        const target = makeObj({ type: 'critter', position: { x: 10, y: 10 } })
        expect(() => script.obj_can_see_obj(obj, target)).not.toThrow()
    })

    it('BLK-087 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_087_is_within_perception_null_position')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 70-C — BLK-088: metarule3(106) filter null position guard
// ===========================================================================

describe('Phase 70-C — BLK-088: metarule3(106) filter null position guard', () => {
    it('metarule3(106) does not throw when map objects have null positions', async () => {
        const gs = (await import('./globalState.js')).default
        const origGMap = gs.gMap

        // Simulate a map with critters, one of which has a null position
        const critterWithPos = makeObj({ type: 'critter', isPlayer: false, position: { x: 0, y: 0 } })
        const critterNullPos = makeObj({ type: 'critter', isPlayer: false, position: null })
        ;(gs as any).gMap = {
            getObjects: (_elev: number) => [critterWithPos, critterNullPos],
        }
        ;(gs as any).currentElevation = 0

        // metarule3(106): tile=0, lastCritter=0 (get first critter at tile)
        expect(() => (script as any).metarule3(106, 0, 0, 0, 0)).not.toThrow()

        gs.gMap = origGMap
    })

    it('metarule3(106) returns only critters with matching position', async () => {
        const gs = (await import('./globalState.js')).default
        const origGMap = gs.gMap

        const tileNum = 0 // tile (0,0) → tileNum = 0*200 + 0 = 0
        const critterAtTile = makeObj({ type: 'critter', isPlayer: false, position: { x: 0, y: 0 } })
        const critterNullPos = makeObj({ type: 'critter', isPlayer: false, position: null })
        const critterOther = makeObj({ type: 'critter', isPlayer: false, position: { x: 10, y: 10 } })
        ;(gs as any).gMap = {
            getObjects: (_elev: number) => [critterAtTile, critterNullPos, critterOther],
        }
        ;(gs as any).currentElevation = 0

        const result = (script as any).metarule3(106, tileNum, 0, 0, 0)
        // Should return critterAtTile (first at tile 0,0), not the null-position one
        expect(result).toBe(critterAtTile)

        gs.gMap = origGMap
    })

    it('BLK-088 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_088_metarule3_106_null_position')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 70-D — BLK-089: num_critters_in_radius() null position guard
// ===========================================================================

describe('Phase 70-D — BLK-089: num_critters_in_radius() null position guard', () => {
    it('num_critters_in_radius does not throw when critters have null positions', async () => {
        const gs = (await import('./globalState.js')).default
        const origGMap = gs.gMap

        const critterNullPos = makeObj({ type: 'critter', dead: false, position: null })
        const critterWithPos = makeObj({ type: 'critter', dead: false, position: { x: 1, y: 0 } })
        ;(gs as any).gMap = {
            getObjects: (_elev: number) => [critterNullPos, critterWithPos],
        }

        expect(() => script.num_critters_in_radius(0, 0, 5)).not.toThrow()

        gs.gMap = origGMap
    })

    it('num_critters_in_radius counts only critters with valid positions', async () => {
        const gs = (await import('./globalState.js')).default
        const origGMap = gs.gMap

        // tile 0 = position {x:0, y:0}; radius 3
        const critterNullPos = makeObj({ type: 'critter', dead: false, position: null })
        const critterInRange = makeObj({ type: 'critter', dead: false, position: { x: 1, y: 0 } })
        const critterOutRange = makeObj({ type: 'critter', dead: false, position: { x: 100, y: 100 } })
        ;(gs as any).gMap = {
            getObjects: (_elev: number) => [critterNullPos, critterInRange, critterOutRange],
        }

        const count = script.num_critters_in_radius(0, 0, 3)
        // null-pos critter is skipped; critterInRange is counted; critterOutRange is not
        expect(count).toBe(1)

        gs.gMap = origGMap
    })

    it('BLK-089 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_089_num_critters_in_radius_null_position')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 70-E — BLK-090: updateCritter() null position guard
// ===========================================================================

describe('Phase 70-E — BLK-090: updateCritter() null position guard', () => {
    it('updateCritter does not throw when critter.position is null', () => {
        const critter = makeObj({ type: 'critter', isPlayer: false, position: null }) as any
        critter.critter_p_proc = vi.fn()
        const s = new Scripting.Script()
        s.critter_p_proc = vi.fn()
        expect(() => Scripting.updateCritter(s, critter)).not.toThrow()
    })

    it('updateCritter sets self_tile to 0 when critter.position is null', () => {
        const critter = makeObj({ type: 'critter', isPlayer: false, position: null }) as any
        const s = new Scripting.Script()
        s.critter_p_proc = vi.fn()
        Scripting.updateCritter(s, critter)
        expect(s.self_tile).toBe(0)
    })

    it('updateCritter sets correct self_tile when critter has a valid position', () => {
        const critter = makeObj({ type: 'critter', isPlayer: false, position: { x: 3, y: 2 } }) as any
        const s = new Scripting.Script()
        s.critter_p_proc = vi.fn()
        Scripting.updateCritter(s, critter)
        // toTileNum({x:3, y:2}) = 2*200 + 3 = 403
        expect(s.self_tile).toBe(403)
    })

    it('BLK-090 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_090_update_critter_null_position')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 70-F — sfall opcodes 0x8250–0x8257
// ===========================================================================

describe('Phase 70-F — sfall opcodes 0x8250–0x8257', () => {
    // ---- 0x8250 get_object_art_fid_sfall ----
    it('get_object_art_fid_sfall returns 0 for a plain game object without frmType/frmPID', () => {
        const obj = makeObj()
        expect(script.get_object_art_fid_sfall(obj)).toBe(0)
    })

    it('get_object_art_fid_sfall returns correct fid when frmType and frmPID are set', () => {
        const obj = makeObj({ frmType: 1, frmPID: 42 })
        // (1 << 24) | 42 = 16777258
        expect(script.get_object_art_fid_sfall(obj)).toBe((1 << 24) | 42)
    })

    it('get_object_art_fid_sfall returns 0 for null', () => {
        expect(script.get_object_art_fid_sfall(null)).toBe(0)
    })

    it('get_object_art_fid_sfall returns 0 for plain number', () => {
        expect(script.get_object_art_fid_sfall(0 as any)).toBe(0)
    })

    // ---- 0x8251 set_object_art_fid_sfall ----
    it('set_object_art_fid_sfall updates frmType and frmPID on object', () => {
        const obj = makeObj()
        const fid = (2 << 24) | 99 // frmType=2, frmPID=99
        expect(() => script.set_object_art_fid_sfall(obj, fid)).not.toThrow()
        expect(obj.frmType).toBe(2)
        expect(obj.frmPID).toBe(99)
    })

    it('set_object_art_fid_sfall does not throw for null obj', () => {
        expect(() => script.set_object_art_fid_sfall(null as any, 42)).not.toThrow()
    })

    // ---- 0x8252 get_item_subtype_sfall ----
    it('get_item_subtype_sfall returns correct index for weapon', () => {
        const obj = makeObj({ type: 'item', subtype: 'weapon' })
        expect(script.get_item_subtype_sfall(obj)).toBe(3)
    })

    it('get_item_subtype_sfall returns correct index for ammo', () => {
        const obj = makeObj({ type: 'item', subtype: 'ammo' })
        expect(script.get_item_subtype_sfall(obj)).toBe(4)
    })

    it('get_item_subtype_sfall returns correct index for armor', () => {
        const obj = makeObj({ type: 'item', subtype: 'armor' })
        expect(script.get_item_subtype_sfall(obj)).toBe(2)
    })

    it('get_item_subtype_sfall returns -1 for critter', () => {
        const obj = makeObj({ type: 'critter' })
        expect(script.get_item_subtype_sfall(obj)).toBe(-1)
    })

    it('get_item_subtype_sfall returns -1 for null', () => {
        expect(script.get_item_subtype_sfall(null as any)).toBe(-1)
    })

    // ---- 0x8253 get_combat_target_sfall ----
    it('get_combat_target_sfall returns 0 for critter with no target set', () => {
        const obj = makeObj({ type: 'critter' })
        expect(script.get_combat_target_sfall(obj)).toBe(0)
    })

    it('get_combat_target_sfall returns combatTarget when set', () => {
        const target = makeObj()
        const obj = makeObj({ type: 'critter', combatTarget: target })
        expect(script.get_combat_target_sfall(obj)).toBe(target)
    })

    it('get_combat_target_sfall returns 0 for null', () => {
        expect(script.get_combat_target_sfall(null as any)).toBe(0)
    })

    // ---- 0x8254 set_combat_target_sfall ----
    it('set_combat_target_sfall stores target on critter', () => {
        const obj = makeObj({ type: 'critter' })
        const target = makeObj()
        expect(() => script.set_combat_target_sfall(obj, target)).not.toThrow()
        expect(obj.combatTarget).toBe(target)
    })

    it('set_combat_target_sfall clears target when given 0', () => {
        const obj = makeObj({ type: 'critter' })
        script.set_combat_target_sfall(obj, 0)
        expect(obj.combatTarget).toBeNull()
    })

    it('set_combat_target_sfall does not throw for null obj', () => {
        expect(() => script.set_combat_target_sfall(null as any, 0)).not.toThrow()
    })

    // ---- 0x8255 combat_is_initialized_sfall ----
    it('combat_is_initialized_sfall returns 0 when not in combat', async () => {
        const gs = (await import('./globalState.js')).default
        const orig = gs.inCombat
        ;(gs as any).inCombat = false
        expect(script.combat_is_initialized_sfall()).toBe(0)
        ;(gs as any).inCombat = orig
    })

    it('combat_is_initialized_sfall returns 1 when in combat', async () => {
        const gs = (await import('./globalState.js')).default
        const orig = gs.inCombat
        ;(gs as any).inCombat = true
        expect(script.combat_is_initialized_sfall()).toBe(1)
        ;(gs as any).inCombat = orig
    })

    // ---- 0x8256 get_attack_type_sfall ----
    it('get_attack_type_sfall returns 0 for any critter (primary slot)', () => {
        const obj = makeObj({ type: 'critter' })
        expect(script.get_attack_type_sfall(obj, 0)).toBe(0)
    })

    it('get_attack_type_sfall returns 0 for secondary slot', () => {
        const obj = makeObj({ type: 'critter' })
        expect(script.get_attack_type_sfall(obj, 1)).toBe(0)
    })

    it('get_attack_type_sfall returns 0 for null', () => {
        expect(script.get_attack_type_sfall(null as any, 0)).toBe(0)
    })

    // ---- 0x8257 get_map_script_idx_sfall ----
    it('get_map_script_idx_sfall returns -1', () => {
        expect(script.get_map_script_idx_sfall()).toBe(-1)
    })

    it('get_map_script_idx_sfall does not throw', () => {
        expect(() => script.get_map_script_idx_sfall()).not.toThrow()
    })
})

// ===========================================================================
// Phase 70-G — Checklist integrity
// ===========================================================================

describe('Phase 70-G — Checklist integrity', () => {
    const phase70Ids = [
        'blk_086_can_see_null_position',
        'blk_087_is_within_perception_null_position',
        'blk_088_metarule3_106_null_position',
        'blk_089_num_critters_in_radius_null_position',
        'blk_090_update_critter_null_position',
        'sfall_get_object_art_fid',
        'sfall_set_object_art_fid',
        'sfall_get_item_subtype',
        'sfall_get_combat_target_8253',
        'sfall_set_combat_target_8254',
        'sfall_combat_is_initialized',
        'sfall_get_attack_type',
        'sfall_get_map_script_idx',
    ]

    it('all Phase 70 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase70Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
