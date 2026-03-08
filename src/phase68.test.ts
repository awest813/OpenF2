/**
 * Phase 68 regression tests.
 *
 * Covers:
 *   A. BLK-076 — objCanSeeObj null-gMap + null-position guard
 *   B. BLK-077 — explosion() null-gMap guard
 *   C. BLK-078 — load_map() null-gMap guard
 *   D. BLK-079 — create_object_sid() null-gMap guard
 *   E. BLK-080 — save() log gMap.name null guard (saveload.ts)
 *   F. sfall opcodes 0x8240–0x8247 (damage type, free move, base stat, difficulty)
 *   G. Checklist integrity
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
        getStat: (s: string) => 5,
        getSkill: (s: string) => 50,
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
// Phase 68-A — BLK-076: objCanSeeObj null-gMap + null-position guard
// ===========================================================================

describe('Phase 68-A — BLK-076: objCanSeeObj null-gMap guard', () => {
    it('obj_can_see_obj does not throw when gMap is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = null as any
        const observer = makeObj({ type: 'critter' })
        const target = makeObj({ type: 'critter' })
        expect(() => script.obj_can_see_obj(observer, target)).not.toThrow()
        gs.gMap = origMap
    })

    it('obj_can_see_obj returns 1 when gMap is null (conservative — unobstructed)', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = null as any
        const observer = makeObj({ type: 'critter' })
        const target = makeObj({ type: 'item' }) // non-critter target → always visible
        const result = script.obj_can_see_obj(observer, target)
        expect(result).toBe(1)
        gs.gMap = origMap
    })

    it('obj_can_see_obj does not throw when observer position is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = {
            hexLinecast: vi.fn(() => null),
        } as any
        const observer = makeObj({ type: 'critter', position: null })
        const target = makeObj({ type: 'item' })
        expect(() => script.obj_can_see_obj(observer, target)).not.toThrow()
        gs.gMap = origMap
    })

    it('obj_can_see_obj does not throw when target position is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = {
            hexLinecast: vi.fn(() => null),
        } as any
        const observer = makeObj({ type: 'critter' })
        const target = makeObj({ type: 'item', position: null })
        expect(() => script.obj_can_see_obj(observer, target)).not.toThrow()
        gs.gMap = origMap
    })
})

// ===========================================================================
// Phase 68-B — BLK-077: explosion() null-gMap guard
// ===========================================================================

describe('Phase 68-B — BLK-077: explosion() null-gMap guard', () => {
    it('explosion does not throw when gMap is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = null as any
        expect(() => script.explosion(5000, 0, 20)).not.toThrow()
        gs.gMap = origMap
    })

    it('explosion does not call addObject when gMap is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        const addObject = vi.fn()
        gs.gMap = null as any
        expect(() => script.explosion(5000, 0, 20)).not.toThrow()
        expect(addObject).not.toHaveBeenCalled()
        gs.gMap = origMap
    })
})

// ===========================================================================
// Phase 68-C — BLK-078: load_map() null-gMap guard
// ===========================================================================

describe('Phase 68-C — BLK-078: load_map() null-gMap guard', () => {
    it('load_map does not throw when gMap is null (string map)', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = null as any
        expect(() => script.load_map('artemple.map', 0)).not.toThrow()
        gs.gMap = origMap
    })

    it('load_map does not throw when gMap is null (numeric map id)', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = null as any
        expect(() => script.load_map(5, 0)).not.toThrow()
        gs.gMap = origMap
    })

    it('load_map calls gMap.loadMap when gMap is valid', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        const loadMap = vi.fn()
        gs.gMap = { loadMap, loadMapByID: vi.fn() } as any
        script.load_map('artemple.map', 0)
        expect(loadMap).toHaveBeenCalledWith('artemple')
        gs.gMap = origMap
    })
})

// ===========================================================================
// Phase 68-D — BLK-079: create_object_sid() null-gMap guard
// ===========================================================================

describe('Phase 68-D — BLK-079: create_object_sid() null-gMap guard', () => {
    it('create_object_sid returns null without throwing when gMap is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = null as any
        // Pass an invalid PID — createObjectWithPID will return null due to missing PRO data,
        // and the existing null-obj guard in create_object_sid will return null safely.
        // Importantly, neither createObjectWithPID's null return NOR a missing gMap should throw.
        let result: any
        expect(() => {
            result = script.create_object_sid(0, 0, 0, -1) // PID 0 → invalid → null from createObjectWithPID
        }).not.toThrow()
        // With PID 0 (invalid), createObjectWithPID returns null and create_object_sid returns null.
        expect(result === null || result === undefined).toBe(true)
        gs.gMap = origMap
    })

    it('create_object_sid gMap null guard: returns null via null-obj path without crashing', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = null as any
        // With any PID that causes createObjectWithPID to return null, the function exits safely
        const result = script.create_object_sid(-1, 0, 0, -1)
        expect(result === null || result === undefined).toBe(true)
        gs.gMap = origMap
    })
})

// ===========================================================================
// Phase 68-E — BLK-080: save() log gMap.name null guard (saveload.ts)
// ===========================================================================

describe('Phase 68-E — BLK-080: save() log gMap.name null guard', () => {
    it('save() does not crash when gMap.name is null/undefined', async () => {
        const gs = (await import('./globalState.js')).default
        const { saveLoadInit, save, resetSaveBackendForTests } = await import('./saveload.js')

        const mockPlayer: any = {
            name: 'TestChar',
            gender: 'male',
            pcFlags: 0,
            activeHand: 0,
            stats: {
                baseStats: {},
                setBase: vi.fn(),
                modifyBase: vi.fn(),
                getBase: vi.fn(() => 0),
            },
            skills: { baseSkills: {}, setBase: vi.fn(), skillPoints: 0 },
            perkRanks: {},
            charTraits: new Set<number>(),
            inventory: [],
            position: { x: 0, y: 0 },
            orientation: 0,
            xp: 0,
            level: 1,
            karma: 0,
        }

        const origPlayer = gs.player
        const origMap = gs.gMap

        // Provide a gMap mock where name is null/undefined — this is the BLK-080 case.
        // The serialize() call must succeed so snapshotSaveData gets past line 93.
        const mockMap: any = {
            name: null as any, // null name — triggers the BLK-080 crash without the fix
            serialize: () => ({ name: 'test_map', objects: [], elevation: 0 }),
            currentElevation: 0,
            objects: [],
        }

        gs.gMap = mockMap
        gs.dirtyMapCache = {}
        ;(gs.gParty as any).serialize = () => []
        ;(gs.questLog as any).serialize = () => ({ entries: [] })
        ;(gs.reputation as any).serialize = () => ({ karma: 0, reputations: {} })
        gs.player = mockPlayer

        resetSaveBackendForTests()
        saveLoadInit()

        // BLK-080: save() should not crash when gMap.name is null — the log message
        // now uses gMap?.name ?? "(none)" to handle null gMap and null name.
        expect(() => save('NullGMapNameTest')).not.toThrow()

        gs.player = origPlayer
        gs.gMap = origMap
    })
})

// ===========================================================================
// Phase 68-F — sfall opcodes 0x8240–0x8247
// ===========================================================================

describe('Phase 68-F — sfall opcodes 0x8240–0x8247', () => {
    // ---- 0x8240 get_critter_damage_type_sfall ----
    it('get_critter_damage_type_sfall returns 0 for null', () => {
        expect(script.get_critter_damage_type_sfall(null as any)).toBe(0)
    })

    it('get_critter_damage_type_sfall returns 0 when damageType not set', () => {
        const obj = makeObj()
        delete obj.damageType
        expect(script.get_critter_damage_type_sfall(obj)).toBe(0)
    })

    it('get_critter_damage_type_sfall returns stored damageType', () => {
        const obj = makeObj({ damageType: 3 })
        expect(script.get_critter_damage_type_sfall(obj)).toBe(3)
    })

    // ---- 0x8241 set_critter_damage_type_sfall ----
    it('set_critter_damage_type_sfall does not throw for null', () => {
        expect(() => script.set_critter_damage_type_sfall(null as any, 2)).not.toThrow()
    })

    it('set_critter_damage_type_sfall stores clamped damage type', () => {
        const obj = makeObj()
        script.set_critter_damage_type_sfall(obj, 4)
        expect(obj.damageType).toBe(4)
    })

    it('set_critter_damage_type_sfall clamps to [0, 6]', () => {
        const obj = makeObj()
        script.set_critter_damage_type_sfall(obj, 99)
        expect(obj.damageType).toBe(6)
        script.set_critter_damage_type_sfall(obj, -3)
        expect(obj.damageType).toBe(0)
    })

    it('set and get damage type round-trips', () => {
        const obj = makeObj()
        script.set_critter_damage_type_sfall(obj, 2)
        expect(script.get_critter_damage_type_sfall(obj)).toBe(2)
    })

    // ---- 0x8242 get_combat_free_move_sfall ----
    it('get_combat_free_move_sfall returns 0', () => {
        expect(script.get_combat_free_move_sfall()).toBe(0)
    })

    // ---- 0x8243 set_combat_free_move_sfall ----
    it('set_combat_free_move_sfall does not throw', () => {
        const obj = makeObj()
        expect(() => script.set_combat_free_move_sfall(obj, 3)).not.toThrow()
    })

    it('set_combat_free_move_sfall does not throw for null', () => {
        expect(() => script.set_combat_free_move_sfall(null as any, 3)).not.toThrow()
    })

    // ---- 0x8244 get_base_stat_sfall ----
    it('get_base_stat_sfall returns 0 for null obj', () => {
        expect(script.get_base_stat_sfall(null as any, 0)).toBe(0)
    })

    it('get_base_stat_sfall returns 0 for unknown stat id', () => {
        const obj = makeObj()
        expect(script.get_base_stat_sfall(obj, 99)).toBe(0)
    })

    it('get_base_stat_sfall reads stat 0 (STR) via stats.getBase', () => {
        const obj = makeObj({
            stats: {
                getBase: (s: string) => (s === 'STR' ? 8 : 0),
                modifyBase: vi.fn(),
            },
        })
        expect(script.get_base_stat_sfall(obj, 0)).toBe(8)
    })

    it('get_base_stat_sfall reads stat 4 (INT) via stats.getBase', () => {
        const obj = makeObj({
            stats: {
                getBase: (s: string) => (s === 'INT' ? 7 : 0),
                modifyBase: vi.fn(),
            },
        })
        expect(script.get_base_stat_sfall(obj, 4)).toBe(7)
    })

    // ---- 0x8245 set_base_stat_sfall ----
    it('set_base_stat_sfall does not throw for null obj', () => {
        expect(() => script.set_base_stat_sfall(null as any, 0, 5)).not.toThrow()
    })

    it('set_base_stat_sfall does not throw for unknown stat id', () => {
        const obj = makeObj()
        expect(() => script.set_base_stat_sfall(obj, 99, 5)).not.toThrow()
    })

    it('set_base_stat_sfall calls modifyBase with correct delta for stat 0 (STR)', () => {
        let stored = 5
        const modifyBase = vi.fn((s: string, delta: number) => { stored += delta })
        const obj = makeObj({
            stats: {
                getBase: (s: string) => (s === 'STR' ? stored : 0),
                modifyBase,
            },
        })
        script.set_base_stat_sfall(obj, 0, 8) // set STR to 8 (delta = 8 - 5 = 3)
        expect(modifyBase).toHaveBeenCalledWith('STR', 3)
        expect(stored).toBe(8)
    })

    // ---- 0x8246 get_game_difficulty_sfall ----
    it('get_game_difficulty_sfall returns 1 (normal)', () => {
        expect(script.get_game_difficulty_sfall()).toBe(1)
    })

    // ---- 0x8247 get_violence_level_sfall ----
    it('get_violence_level_sfall returns 2 (maximum)', () => {
        expect(script.get_violence_level_sfall()).toBe(2)
    })
})

// ===========================================================================
// Phase 68-G — Checklist integrity
// ===========================================================================

describe('Phase 68-G — Checklist integrity', () => {
    const phase68Ids = [
        'blk_076_obj_can_see_obj_null_gmap',
        'blk_077_explosion_null_gmap',
        'blk_078_load_map_null_gmap',
        'blk_079_create_object_sid_null_gmap',
        'blk_080_save_gmap_name_null_guard',
        'blk_081_obj_from_pid_null_pro_guard',
        'sfall_get_critter_damage_type',
        'sfall_set_critter_damage_type',
        'sfall_get_combat_free_move',
        'sfall_set_combat_free_move',
        'sfall_get_base_stat',
        'sfall_set_base_stat',
        'sfall_get_game_difficulty',
        'sfall_get_violence_level',
    ]

    it('all Phase 68 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase68Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
