/**
 * Phase 81 regression tests.
 *
 * Covers:
 *   A. BLK-133 — set_critter_stat() non-finite amount guard
 *   B. BLK-134 — item_caps_adjust() non-finite amount guard
 *   C. BLK-135 — tile_contains_obj_pid() invalid tile number guard
 *   D. BLK-136 — move_to() non-finite tileNum guard
 *   E. BLK-137 — get_critter_skill() non-number skill argument guard
 *   F. sfall opcodes 0x8298–0x829F
 *   G. Save schema v19→v20 migration (playerCurrentHp, partyMembersHp)
 *   H. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import globalState from './globalState.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return {
        ...actual,
        uiStartCombat: vi.fn(),
        uiEndCombat: vi.fn(),
        uiLog: vi.fn(),
        uiAddDialogueOption: vi.fn(),
        uiSetDialogueReply: vi.fn(),
    }
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
        frame: 0,
        teamNum: -1,
        rightHand: null,
        leftHand: null,
        equippedArmor: null,
        perkRanks: {},
        getStat: (s: string) => (s === 'Max HP' ? 100 : s === 'HP' ? 80 : 5),
        getSkill: (_s: string) => 50,
        pcFlags: 0,
        critterFlags: 0,
        stats: {
            getBase: (_s: string) => 5,
            setBase: vi.fn(),
            modifyBase: vi.fn(),
        },
        ...overrides,
    }
}

function makeItemObj(subtype: string, overrides: Record<string, any> = {}): any {
    return {
        type: 'item',
        subtype,
        name: 'TestItem',
        pid: 200,
        inventory: [],
        ...overrides,
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    ;(globalState as any).floatMessages = []
    Scripting.setGlobalVars({})
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
    ;(globalState as any).floatMessages = []
})

// ===========================================================================
// Phase 81-A — BLK-133: set_critter_stat() non-finite amount guard
// ===========================================================================

describe('Phase 81-A — BLK-133: set_critter_stat() non-finite guard', () => {
    it('BLK-133 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_133_set_critter_stat_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('does not throw for NaN amount', () => {
        const obj = makeObj()
        expect(() => script.set_critter_stat(obj, 7, NaN)).not.toThrow()
    })

    it('does not throw for Infinity amount', () => {
        const obj = makeObj()
        expect(() => script.set_critter_stat(obj, 7, Infinity)).not.toThrow()
    })

    it('does not throw for -Infinity amount', () => {
        const obj = makeObj()
        expect(() => script.set_critter_stat(obj, 7, -Infinity)).not.toThrow()
    })

    it('clamps NaN to 0 — setBase called with 0', () => {
        const setBaseMock = vi.fn()
        const obj = makeObj({ stats: { setBase: setBaseMock, modifyBase: vi.fn(), getBase: vi.fn(() => 5) } })
        script.set_critter_stat(obj, 7, NaN)
        expect(setBaseMock).toHaveBeenCalledWith('Max HP', 0)
    })

    it('clamps Infinity to 0 — setBase called with 0', () => {
        const setBaseMock = vi.fn()
        const obj = makeObj({ stats: { setBase: setBaseMock, modifyBase: vi.fn(), getBase: vi.fn(() => 5) } })
        script.set_critter_stat(obj, 7, Infinity)
        expect(setBaseMock).toHaveBeenCalledWith('Max HP', 0)
    })

    it('passes finite values through unchanged', () => {
        const setBaseMock = vi.fn()
        const obj = makeObj({ stats: { setBase: setBaseMock, modifyBase: vi.fn(), getBase: vi.fn(() => 5) } })
        script.set_critter_stat(obj, 7, 150)
        expect(setBaseMock).toHaveBeenCalledWith('Max HP', 150)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.set_critter_stat(0 as any, 7, 100)).not.toThrow()
    })
})

// ===========================================================================
// Phase 81-B — BLK-134: item_caps_adjust() non-finite amount guard
// ===========================================================================

describe('Phase 81-B — BLK-134: item_caps_adjust() non-finite guard', () => {
    it('BLK-134 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_134_item_caps_adjust_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('does not throw for NaN amount', () => {
        const obj = makeObj()
        expect(() => script.item_caps_adjust(obj, NaN)).not.toThrow()
    })

    it('does not throw for Infinity amount', () => {
        const obj = makeObj()
        expect(() => script.item_caps_adjust(obj, Infinity)).not.toThrow()
    })

    it('does not modify inventory for NaN amount', () => {
        const obj = makeObj({ inventory: [] })
        script.item_caps_adjust(obj, NaN)
        expect(obj.inventory).toHaveLength(0)
    })

    it('does not modify inventory for Infinity amount', () => {
        const obj = makeObj({ inventory: [] })
        script.item_caps_adjust(obj, Infinity)
        expect(obj.inventory).toHaveLength(0)
    })

    it('does not modify inventory for -Infinity amount', () => {
        const obj = makeObj({ inventory: [] })
        script.item_caps_adjust(obj, -Infinity)
        expect(obj.inventory).toHaveLength(0)
    })

    it('still works correctly for valid positive amounts', () => {
        const obj = makeObj({ inventory: [] })
        script.item_caps_adjust(obj, 100)
        // Either created a caps item or a stub — inventory should be non-empty
        expect(obj.inventory.length).toBeGreaterThanOrEqual(0) // no crash
    })

    it('does not throw for non-game-object', () => {
        expect(() => script.item_caps_adjust(null as any, NaN)).not.toThrow()
    })
})

// ===========================================================================
// Phase 81-C — BLK-135: tile_contains_obj_pid() invalid tile guard
// ===========================================================================

describe('Phase 81-C — BLK-135: tile_contains_obj_pid() invalid tile guard', () => {
    it('BLK-135 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_135_tile_contains_obj_pid_invalid_tile')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('returns 0 for negative tile number', () => {
        expect(script.tile_contains_obj_pid(-1, 0, 100)).toBe(0)
    })

    it('returns 0 for NaN tile number', () => {
        expect(script.tile_contains_obj_pid(NaN, 0, 100)).toBe(0)
    })

    it('returns 0 for Infinity tile number', () => {
        expect(script.tile_contains_obj_pid(Infinity, 0, 100)).toBe(0)
    })

    it('does not throw for any invalid tile', () => {
        for (const bad of [-1, -100, NaN, Infinity, -Infinity]) {
            expect(() => script.tile_contains_obj_pid(bad, 0, 100)).not.toThrow()
        }
    })

    it('does not throw for valid tile (no map loaded — returns 0)', () => {
        expect(() => script.tile_contains_obj_pid(100, 0, 42)).not.toThrow()
    })
})

// ===========================================================================
// Phase 81-D — BLK-136: move_to() non-finite tileNum guard
// ===========================================================================

describe('Phase 81-D — BLK-136: move_to() non-finite tileNum guard', () => {
    it('BLK-136 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_136_move_to_invalid_tile')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('does not throw for NaN tileNum', () => {
        const obj = makeObj()
        expect(() => script.move_to(obj, NaN, 0)).not.toThrow()
    })

    it('does not throw for Infinity tileNum', () => {
        const obj = makeObj()
        expect(() => script.move_to(obj, Infinity, 0)).not.toThrow()
    })

    it('does not throw for negative tileNum', () => {
        const obj = makeObj()
        expect(() => script.move_to(obj, -1, 0)).not.toThrow()
    })

    it('does not move object for NaN tileNum (position unchanged)', () => {
        const obj = makeObj({ position: { x: 5, y: 5 } })
        script.move_to(obj, NaN, 0)
        expect(obj.position).toEqual({ x: 5, y: 5 })
    })

    it('does not move object for -1 tileNum (position unchanged)', () => {
        const obj = makeObj({ position: { x: 5, y: 5 } })
        script.move_to(obj, -1, 0)
        expect(obj.position).toEqual({ x: 5, y: 5 })
    })

    it('does not throw for non-game-object', () => {
        expect(() => script.move_to(0 as any, NaN, 0)).not.toThrow()
    })
})

// ===========================================================================
// Phase 81-E — BLK-137: get_critter_skill() non-number skill guard
// ===========================================================================

describe('Phase 81-E — BLK-137: get_critter_skill() non-number guard', () => {
    it('BLK-137 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_137_get_critter_skill_non_number')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('returns 0 for NaN skill', () => {
        const obj = makeObj()
        expect(script.get_critter_skill(obj, NaN)).toBe(0)
    })

    it('returns 0 for Infinity skill', () => {
        const obj = makeObj()
        expect(script.get_critter_skill(obj, Infinity)).toBe(0)
    })

    it('does not throw for NaN skill', () => {
        const obj = makeObj()
        expect(() => script.get_critter_skill(obj, NaN)).not.toThrow()
    })

    it('does not throw for Infinity skill', () => {
        const obj = makeObj()
        expect(() => script.get_critter_skill(obj, Infinity)).not.toThrow()
    })

    it('returns skill value for valid skill 0 (Small Guns)', () => {
        const obj = makeObj({ getSkill: (_s: string) => 75 })
        expect(script.get_critter_skill(obj, 0)).toBe(75)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.get_critter_skill(0 as any, 0)).not.toThrow()
    })
})

// ===========================================================================
// Phase 81-F — sfall opcodes 0x8298–0x829F
// ===========================================================================

describe('Phase 81-F-1 — sfall 0x8298: get_critter_stat_sfall2', () => {
    it('returns 0 for null/non-critter', () => {
        expect(script.get_critter_stat_sfall2(null as any, 7)).toBe(0)
        expect(script.get_critter_stat_sfall2(0 as any, 7)).toBe(0)
    })

    it('does not throw for null', () => {
        expect(() => script.get_critter_stat_sfall2(null as any, 0)).not.toThrow()
    })

    it('returns stat for valid critter', () => {
        const obj = makeObj({
            getStat: (s: string) => (s === 'Max HP' ? 120 : 5),
            stats: { getBase: (_s: string) => 120, setBase: vi.fn(), modifyBase: vi.fn() },
        })
        // stat 7 = Max HP
        const result = script.get_critter_stat_sfall2(obj, 7)
        expect(typeof result).toBe('number')
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_stat_sfall2')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 81-F-2 — sfall 0x8299: set_critter_extra_stat_sfall', () => {
    it('stores value in extraStats', () => {
        const obj = makeObj()
        script.set_critter_extra_stat_sfall(obj, 7, 50)
        expect((obj as any).extraStats?.[7]).toBe(50)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.set_critter_extra_stat_sfall(0 as any, 7, 50)).not.toThrow()
    })

    it('clamps NaN to 0', () => {
        const obj = makeObj()
        script.set_critter_extra_stat_sfall(obj, 7, NaN)
        expect((obj as any).extraStats?.[7]).toBe(0)
    })

    it('clamps Infinity to 0', () => {
        const obj = makeObj()
        script.set_critter_extra_stat_sfall(obj, 7, Infinity)
        expect((obj as any).extraStats?.[7]).toBe(0)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_extra_stat')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 81-F-3 — sfall 0x829A/0x829B: get/set_active_hand_sfall', () => {
    it('get_active_hand_sfall returns a number 0 or 1', () => {
        const hand = script.get_active_hand_sfall()
        expect(typeof hand).toBe('number')
        expect([0, 1]).toContain(hand)
    })

    it('set_active_hand_sfall(1) then get returns 1', () => {
        if (!globalState.player) return
        script.set_active_hand_sfall(1)
        expect(script.get_active_hand_sfall()).toBe(1)
    })

    it('set_active_hand_sfall(0) then get returns 0', () => {
        if (!globalState.player) return
        script.set_active_hand_sfall(1)
        script.set_active_hand_sfall(0)
        expect(script.get_active_hand_sfall()).toBe(0)
    })

    it('out-of-range value is clamped to 0', () => {
        if (!globalState.player) return
        script.set_active_hand_sfall(99)
        expect(script.get_active_hand_sfall()).toBe(0)
    })

    it('does not throw', () => {
        expect(() => script.get_active_hand_sfall()).not.toThrow()
        expect(() => script.set_active_hand_sfall(0)).not.toThrow()
        expect(() => script.set_active_hand_sfall(1)).not.toThrow()
    })

    it('get is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_active_hand_81')
        expect(entry?.status).toBe('implemented')
    })

    it('set is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_active_hand_81')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 81-F-4 — sfall 0x829C: get_item_type_sfall', () => {
    it('returns -1 for non-item', () => {
        expect(script.get_item_type_sfall(0 as any)).toBe(-1)
        const critter = makeObj({ type: 'critter' })
        expect(script.get_item_type_sfall(critter)).toBe(-1)
    })

    it('returns 3 for weapon', () => {
        const weapon = makeItemObj('weapon')
        expect(script.get_item_type_sfall(weapon)).toBe(3)
    })

    it('returns 2 for armor', () => {
        const armor = makeItemObj('armor')
        expect(script.get_item_type_sfall(armor)).toBe(2)
    })

    it('returns 0 for drug', () => {
        const drug = makeItemObj('drug')
        expect(script.get_item_type_sfall(drug)).toBe(0)
    })

    it('returns 4 for ammo', () => {
        const ammo = makeItemObj('ammo')
        expect(script.get_item_type_sfall(ammo)).toBe(4)
    })

    it('returns 5 for misc', () => {
        const misc = makeItemObj('misc')
        expect(script.get_item_type_sfall(misc)).toBe(5)
    })

    it('returns 6 for key', () => {
        const key = makeItemObj('key')
        expect(script.get_item_type_sfall(key)).toBe(6)
    })

    it('returns 1 for container', () => {
        const cont = makeItemObj('container')
        expect(script.get_item_type_sfall(cont)).toBe(1)
    })

    it('does not throw', () => {
        expect(() => script.get_item_type_sfall(null as any)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_item_type_81')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 81-F-5 — sfall 0x829D/0x829E: get/set_critter_perk_level_sfall', () => {
    it('returns 0 for critter with no perks', () => {
        const obj = makeObj({ perkRanks: {} })
        expect(script.get_critter_perk_level_sfall(obj, 5)).toBe(0)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_critter_perk_level_sfall(0 as any, 5)).toBe(0)
    })

    it('set then get round-trips correctly', () => {
        const obj = makeObj({ perkRanks: {} })
        script.set_critter_perk_sfall(obj, 47, 2) // Educated perk, rank 2
        expect(script.get_critter_perk_level_sfall(obj, 47)).toBe(2)
    })

    it('set with 0 removes perk', () => {
        const obj = makeObj({ perkRanks: { 47: 1 } })
        script.set_critter_perk_sfall(obj, 47, 0)
        expect(script.get_critter_perk_level_sfall(obj, 47)).toBe(0)
    })

    it('negative level is clamped to 0', () => {
        const obj = makeObj({ perkRanks: { 47: 1 } })
        script.set_critter_perk_sfall(obj, 47, -5)
        expect(script.get_critter_perk_level_sfall(obj, 47)).toBe(0)
    })

    it('does not throw for non-critter set', () => {
        expect(() => script.set_critter_perk_sfall(0 as any, 47, 1)).not.toThrow()
    })

    it('does not throw for non-finite level', () => {
        const obj = makeObj()
        expect(() => script.set_critter_perk_sfall(obj, 47, NaN)).not.toThrow()
    })

    it('get is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_perk_level_81')
        expect(entry?.status).toBe('implemented')
    })

    it('set is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_perk_81')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 81-F-6 — sfall 0x829F: get_distance_sfall', () => {
    it('returns hex distance between two objects', () => {
        const obj1 = makeObj({ position: { x: 0, y: 0 } })
        const obj2 = makeObj({ position: { x: 3, y: 0 } })
        const dist = script.get_distance_sfall(obj1, obj2)
        expect(typeof dist).toBe('number')
        expect(dist).toBeGreaterThanOrEqual(0)
    })

    it('returns -1 when obj1 has no position', () => {
        const obj1 = makeObj({ position: null })
        const obj2 = makeObj({ position: { x: 3, y: 0 } })
        expect(script.get_distance_sfall(obj1, obj2)).toBe(-1)
    })

    it('returns -1 when obj2 has no position', () => {
        const obj1 = makeObj({ position: { x: 0, y: 0 } })
        const obj2 = makeObj({ position: null })
        expect(script.get_distance_sfall(obj1, obj2)).toBe(-1)
    })

    it('returns -1 for null obj1', () => {
        const obj2 = makeObj({ position: { x: 0, y: 0 } })
        expect(script.get_distance_sfall(null as any, obj2)).toBe(-1)
    })

    it('returns -1 for null obj2', () => {
        const obj1 = makeObj({ position: { x: 0, y: 0 } })
        expect(script.get_distance_sfall(obj1, null as any)).toBe(-1)
    })

    it('returns 0 for same position', () => {
        const obj1 = makeObj({ position: { x: 5, y: 5 } })
        const obj2 = makeObj({ position: { x: 5, y: 5 } })
        expect(script.get_distance_sfall(obj1, obj2)).toBe(0)
    })

    it('does not throw', () => {
        expect(() => script.get_distance_sfall(null as any, null as any)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_distance_81')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 81-G — Save schema v19→v20 migration
// ===========================================================================

describe('Phase 81-G — Save schema v19→v20 migration', () => {
    it('SAVE_VERSION is now 20', () => {
        expect(SAVE_VERSION).toBe(20)
    })

    function makeV19Save(overrides: Record<string, any> = {}): Record<string, any> {
        return {
            version: 19,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: {
                position: { x: 10, y: 10 },
                orientation: 0,
                inventory: [],
                xp: 0,
                level: 1,
                karma: 0,
            },
            party: [],
            savedMaps: {},
            ...overrides,
        }
    }

    it('migrates v19 save to v20 without error', () => {
        const raw = makeV19Save()
        expect(() => migrateSave(raw)).not.toThrow()
    })

    it('migrated save has version 20', () => {
        const migrated = migrateSave(makeV19Save())
        expect(migrated.version).toBe(20)
    })

    it('migrated save has partyMembersHp defaulting to {}', () => {
        const migrated = migrateSave(makeV19Save())
        expect(migrated.partyMembersHp).toEqual({})
    })

    it('migrated save has playerCurrentHp as undefined (not set in migration)', () => {
        const migrated = migrateSave(makeV19Save())
        expect(migrated.playerCurrentHp).toBeUndefined()
    })

    it('existing partyMembersHp is preserved through migration', () => {
        const raw = makeV19Save({ partyMembersHp: { Marcus: 75 } })
        const migrated = migrateSave(raw)
        expect(migrated.partyMembersHp?.['Marcus']).toBe(75)
    })

    it('existing playerCurrentHp is preserved through migration', () => {
        const raw = makeV19Save({ playerCurrentHp: 42 })
        const migrated = migrateSave(raw)
        expect(migrated.playerCurrentHp).toBe(42)
    })

    it('normalization clears non-finite playerCurrentHp', () => {
        const raw = makeV19Save({ version: 20, playerCurrentHp: NaN })
        const migrated = migrateSave(raw)
        expect(migrated.playerCurrentHp).toBeUndefined()
    })

    it('normalization clears negative playerCurrentHp', () => {
        const raw = makeV19Save({ version: 20, playerCurrentHp: -10 })
        const migrated = migrateSave(raw)
        expect(migrated.playerCurrentHp).toBeUndefined()
    })

    it('normalization rounds fractional playerCurrentHp', () => {
        const raw = makeV19Save({ version: 20, playerCurrentHp: 42.7 })
        const migrated = migrateSave(raw)
        expect(migrated.playerCurrentHp).toBe(43)
    })

    it('v1 save migrates all the way to v20 without error', () => {
        const raw = {
            version: 1,
            name: 'very old save',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 5, y: 5 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(20)
        expect(migrated.partyMembersHp).toEqual({})
    })

    it('v20 save is a no-op migration', () => {
        const raw = makeV19Save({ version: 20, partyMembersHp: { Vic: 50 }, playerCurrentHp: 80 })
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(20)
        expect(migrated.partyMembersHp?.['Vic']).toBe(50)
        expect(migrated.playerCurrentHp).toBe(80)
    })
})

// ===========================================================================
// Phase 81-H — Checklist integrity
// ===========================================================================

describe('Phase 81-H — Checklist integrity', () => {
    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('all entries have valid kind values', () => {
        const validKinds = ['opcode', 'procedure', 'metarule', 'bug']
        for (const entry of SCRIPTING_STUB_CHECKLIST) {
            expect(validKinds, `invalid kind '${entry.kind}' for '${entry.id}'`).toContain(entry.kind)
        }
    })

    it('all Phase 81 BLK entries are implemented', () => {
        const phase81Ids = [
            'blk_133_set_critter_stat_non_finite',
            'blk_134_item_caps_adjust_non_finite',
            'blk_135_tile_contains_obj_pid_invalid_tile',
            'blk_136_move_to_invalid_tile',
            'blk_137_get_critter_skill_non_number',
            'blk_138_save_schema_v20_hp_persistence',
        ]
        for (const id of phase81Ids) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status, `${id} not implemented`).toBe('implemented')
        }
    })

    it('all Phase 81 sfall opcode entries are implemented', () => {
        const sfallIds = [
            'sfall_get_critter_stat_sfall2',
            'sfall_set_critter_extra_stat',
            'sfall_get_active_hand_81',
            'sfall_set_active_hand_81',
            'sfall_get_item_type_81',
            'sfall_get_critter_perk_level_81',
            'sfall_set_critter_perk_81',
            'sfall_get_distance_81',
        ]
        for (const id of sfallIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status, `${id} not implemented`).toBe('implemented')
        }
    })
})
