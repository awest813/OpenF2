/**
 * Phase 64 regression tests.
 *
 * Covers:
 *   A. BLK-068 — combatEvent script_overrides detection
 *   B. BLK-069 — destroy_object null guard
 *   C. BLK-070 — set_flags_sfall (0x8222)
 *   D. sfall opcodes 0x8220–0x8227
 *   E. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'

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
        inventory: [],
        dead: false,
        pid: 100,
        perkRanks: {},
        getStat: (s: string) => s === 'PER' ? 8 : 5,
        getSkill: (s: string) => 60,
        ...overrides,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
})

// ===========================================================================
// Phase 64-A — BLK-068: combatEvent script_overrides detection
// ===========================================================================

describe('Phase 64-A — BLK-068: combatEvent script_overrides detection', () => {
    it('combatEvent returns true when combat_p_proc calls script_overrides', async () => {
        const { Scripting: S } = await import('./scripting.js')
        const script = new (S as any).Script()
        // Simulate a critter with a combat_p_proc that calls script_overrides
        script.combat_p_proc = vi.fn(function (this: typeof script) {
            this.script_overrides()
        })
        script.scriptName = 'test_combat'

        const obj: any = {
            _script: script,
            type: 'critter',
        }

        const result = S.combatEvent(obj, 'turnBegin')
        expect(result).toBe(true) // script_overrides was called → override is set
    })

    it('combatEvent returns false when combat_p_proc does NOT call script_overrides', async () => {
        const { Scripting: S } = await import('./scripting.js')
        const script = new (S as any).Script()
        script.combat_p_proc = vi.fn() // just runs, no script_overrides
        script.scriptName = 'test_combat_no_override'

        const obj: any = {
            _script: script,
            type: 'critter',
        }

        const result = S.combatEvent(obj, 'turnBegin')
        expect(result).toBe(false)
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_068_combat_event_override_detection')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 64-B — BLK-069: destroy_object null guard
// ===========================================================================

describe('Phase 64-B — BLK-069: destroy_object null guard', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    it('does not throw when obj is null', () => {
        expect(() => script.destroy_object(null as any)).not.toThrow()
    })

    it('does not throw when gMap is null', async () => {
        const gs = (await import('./globalState.js')).default
        const orig = gs.gMap
        ;(gs as any).gMap = null
        expect(() => script.destroy_object(makeObj())).not.toThrow()
        gs.gMap = orig
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_069_destroy_object_null_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 64-C — BLK-070: set_flags_sfall
// ===========================================================================

describe('Phase 64-C — BLK-070: set_flags_sfall (0x8222)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    it('does not throw for null obj', () => {
        expect(() => script.set_flags_sfall(null as any, 7)).not.toThrow()
    })

    it('sets flags property on object', () => {
        const obj = makeObj()
        script.set_flags_sfall(obj, 0b11)
        expect(obj.flags).toBe(0b11)
    })

    it('does not require pro.extra to exist', () => {
        const obj = makeObj({ pro: undefined })
        script.set_flags_sfall(obj, 5)
        expect(obj.flags).toBe(5)
    })

    it('is readable back via get_flags_sfall', () => {
        const obj = makeObj()
        script.set_flags_sfall(obj, 12)
        expect(script.get_flags_sfall(obj)).toBe(12)
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_070_set_flags_sfall')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 64-D — sfall opcodes 0x8220–0x8227
// ===========================================================================

describe('Phase 64-D — sfall opcodes 0x8220–0x8227', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    // ---- 0x8220 get_cursor_mode_sfall ----
    it('get_cursor_mode_sfall returns 0 (no-op in browser)', () => {
        expect(script.get_cursor_mode_sfall()).toBe(0)
    })

    // ---- 0x8221 set_cursor_mode_sfall ----
    it('set_cursor_mode_sfall does not throw', () => {
        expect(() => script.set_cursor_mode_sfall(2)).not.toThrow()
    })

    // ---- 0x8222 set_flags_sfall ----
    it('set_flags_sfall sets flags on valid object', () => {
        const obj = makeObj()
        script.set_flags_sfall(obj, 15)
        expect(obj.flags).toBe(15)
    })

    it('set_flags_sfall does not throw for null', () => {
        expect(() => script.set_flags_sfall(null as any, 7)).not.toThrow()
    })

    // ---- 0x8223 critter_skill_level_sfall ----
    it('critter_skill_level_sfall returns 0 for null', () => {
        expect(script.critter_skill_level_sfall(null as any, 0)).toBe(0)
    })

    it('critter_skill_level_sfall returns 0 for unknown skill id', () => {
        const critter = makeObj()
        expect(script.critter_skill_level_sfall(critter, 999)).toBe(0)
    })

    it('critter_skill_level_sfall returns skill value for valid critter', () => {
        const critter = makeObj({ getSkill: () => 75 })
        expect(script.critter_skill_level_sfall(critter, 0)).toBe(75) // Small Guns
    })

    // ---- 0x8224 get_active_weapon_sfall ----
    it('get_active_weapon_sfall returns 0 for null', () => {
        expect(script.get_active_weapon_sfall(null as any)).toBe(0)
    })

    it('get_active_weapon_sfall returns 0 when no weapon equipped', () => {
        const critter = makeObj()
        expect(script.get_active_weapon_sfall(critter)).toBe(0)
    })

    it('get_active_weapon_sfall returns rightHand when activeHand is 0', () => {
        const weapon = { pid: 42, type: 'item', subtype: 'weapon' }
        const critter = makeObj({ activeHand: 0, rightHand: weapon })
        expect(script.get_active_weapon_sfall(critter)).toBe(weapon)
    })

    it('get_active_weapon_sfall returns leftHand when activeHand is 1', () => {
        const weapon = { pid: 99, type: 'item', subtype: 'weapon' }
        const critter = makeObj({ activeHand: 1, leftHand: weapon })
        expect(script.get_active_weapon_sfall(critter)).toBe(weapon)
    })

    // ---- 0x8225 get_inven_ap_cost_sfall ----
    it('get_inven_ap_cost_sfall returns 0 (stub)', () => {
        expect(script.get_inven_ap_cost_sfall(makeObj(), makeObj())).toBe(0)
    })

    // ---- 0x8226 obj_can_see_tile_sfall ----
    it('obj_can_see_tile_sfall returns 0 for null obj', () => {
        expect(script.obj_can_see_tile_sfall(null as any, 0)).toBe(0)
    })

    it('obj_can_see_tile_sfall returns 1 for tile within perception range', () => {
        // critter at tile (0,0), perception=8 → range = 40 tiles
        // tile at position (3,3) → distance < 40
        const critter = makeObj({ position: { x: 0, y: 0 }, getStat: () => 8 })
        // tileNum 603 = 3*200 + 3 = hex at (3,3)
        expect(script.obj_can_see_tile_sfall(critter, 3 * 200 + 3)).toBe(1)
    })

    // ---- 0x8227 get_map_enter_position_sfall ----
    it('get_map_enter_position_sfall returns -1 (not implemented)', () => {
        expect(script.get_map_enter_position_sfall(0)).toBe(-1)
        expect(script.get_map_enter_position_sfall(1)).toBe(-1)
        expect(script.get_map_enter_position_sfall(2)).toBe(-1)
    })
})

// ===========================================================================
// Phase 64-E — Checklist integrity
// ===========================================================================

describe('Phase 64-E — Checklist integrity', () => {
    const phase64Ids = [
        'blk_068_combat_event_override_detection',
        'blk_069_destroy_object_null_guard',
        'blk_070_set_flags_sfall',
        'sfall_get_cursor_mode',
        'sfall_set_cursor_mode',
        'sfall_set_flags',
        'sfall_critter_skill_level',
        'sfall_get_active_weapon',
        'sfall_get_inven_ap_cost',
        'sfall_obj_can_see_tile',
        'sfall_get_map_enter_position',
    ]

    it('all Phase 64 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase64Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK entries have status "implemented"', () => {
        const blkIds = [
            'blk_068_combat_event_override_detection',
            'blk_069_destroy_object_null_guard',
            'blk_070_set_flags_sfall',
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
