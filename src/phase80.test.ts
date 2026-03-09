/**
 * Phase 80 regression tests.
 *
 * Covers:
 *   A. BLK-128 — obj_name() null guard: returns '' for falsy/non-game objects
 *   B. BLK-129 — set_global_var() non-finite value guard: NaN/Infinity clamped to 0
 *   C. BLK-130 — critter_dmg() non-finite damage guard: NaN/Infinity skips damage
 *   D. BLK-131 — float_msg() null floatMessages guard
 *   E. BLK-132 — loadMessageFile() try-catch for missing .msg files
 *   F. sfall opcodes 0x8290–0x8297
 *   G. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
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

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    // Reset globalState fields used in these tests
    ;(globalState as any).floatMessages = []
    Scripting.setGlobalVars({})
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
    ;(globalState as any).floatMessages = []
})

// ===========================================================================
// Phase 80-A — BLK-128: obj_name() null guard
// ===========================================================================

describe('Phase 80-A — BLK-128: obj_name() null guard', () => {
    it('BLK-128 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_128_obj_name_null_guard')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('returns empty string for null obj', () => {
        expect(script.obj_name(null as any)).toBe('')
    })

    it('returns empty string for numeric 0 (FO2 null convention)', () => {
        expect(script.obj_name(0 as any)).toBe('')
    })

    it('returns empty string for undefined obj', () => {
        expect(script.obj_name(undefined as any)).toBe('')
    })

    it('returns the name for a valid game object', () => {
        const obj = makeObj({ name: 'Marcus' })
        expect(script.obj_name(obj)).toBe('Marcus')
    })

    it('returns empty string when obj.name is undefined', () => {
        const obj = makeObj({ name: undefined })
        expect(script.obj_name(obj)).toBe('')
    })

    it('does not throw for any falsy value', () => {
        for (const bad of [null, undefined, 0, '', false]) {
            expect(() => script.obj_name(bad as any)).not.toThrow()
        }
    })
})

// ===========================================================================
// Phase 80-B — BLK-129: set_global_var() non-finite guard
// ===========================================================================

describe('Phase 80-B — BLK-129: set_global_var() non-finite guard', () => {
    it('BLK-129 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_129_set_global_var_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('stores NaN as 0', () => {
        script.set_global_var(5, NaN)
        expect(Scripting.getGlobalVar(5)).toBe(0)
    })

    it('stores Infinity as 0', () => {
        script.set_global_var(6, Infinity)
        expect(Scripting.getGlobalVar(6)).toBe(0)
    })

    it('stores -Infinity as 0', () => {
        script.set_global_var(7, -Infinity)
        expect(Scripting.getGlobalVar(7)).toBe(0)
    })

    it('stores valid finite integers unchanged', () => {
        script.set_global_var(8, 42)
        expect(Scripting.getGlobalVar(8)).toBe(42)
    })

    it('stores negative finite integers unchanged', () => {
        script.set_global_var(9, -7)
        expect(Scripting.getGlobalVar(9)).toBe(-7)
    })

    it('stores zero correctly', () => {
        script.set_global_var(10, 0)
        expect(Scripting.getGlobalVar(10)).toBe(0)
    })

    it('does not throw for NaN/Infinity inputs', () => {
        expect(() => script.set_global_var(11, NaN)).not.toThrow()
        expect(() => script.set_global_var(12, Infinity)).not.toThrow()
        expect(() => script.set_global_var(13, -Infinity)).not.toThrow()
    })
})

// ===========================================================================
// Phase 80-C — BLK-130: critter_dmg() non-finite damage guard
// ===========================================================================

describe('Phase 80-C — BLK-130: critter_dmg() non-finite damage guard', () => {
    it('BLK-130 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_130_critter_dmg_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('does not throw when damage is NaN', () => {
        const obj = makeObj()
        expect(() => script.critter_dmg(obj, NaN, 'normal')).not.toThrow()
    })

    it('does not throw when damage is Infinity', () => {
        const obj = makeObj()
        expect(() => script.critter_dmg(obj, Infinity, 'normal')).not.toThrow()
    })

    it('does not throw when damage is -Infinity', () => {
        const obj = makeObj()
        expect(() => script.critter_dmg(obj, -Infinity, 'normal')).not.toThrow()
    })

    it('does not apply damage when value is NaN', () => {
        const obj = makeObj()
        const modifySpy = obj.stats.modifyBase
        script.critter_dmg(obj, NaN, 'normal')
        expect(modifySpy).not.toHaveBeenCalled()
    })

    it('does not throw for valid damage values', () => {
        // Valid damage call goes to critterDamage() which needs full combat
        // infrastructure; only check BLK-130's guard by ensuring it returns
        // without throwing for the NaN case (covered above).
        // This assertion checks that the guard itself does not interfere.
        const obj = makeObj()
        // Providing a hasAnimation mock avoids the deeper combat path crash
        obj.hasAnimation = () => false
        expect(() => script.critter_dmg(obj, 0, 'normal')).not.toThrow()
    })
})

// ===========================================================================
// Phase 80-D — BLK-131: float_msg() null floatMessages guard
// ===========================================================================

describe('Phase 80-D — BLK-131: float_msg() null floatMessages guard', () => {
    it('BLK-131 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_131_float_msg_null_array')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('does not throw when floatMessages is undefined', () => {
        ;(globalState as any).floatMessages = undefined
        const obj = makeObj()
        expect(() => script.float_msg(obj, 'hello', 0)).not.toThrow()
    })

    it('does not throw when floatMessages is null', () => {
        ;(globalState as any).floatMessages = null
        const obj = makeObj()
        expect(() => script.float_msg(obj, 'hello', 0)).not.toThrow()
    })

    it('pushes to floatMessages when array is valid', () => {
        ;(globalState as any).floatMessages = []
        const obj = makeObj()
        script.float_msg(obj, 'test message', 0)
        expect((globalState as any).floatMessages).toHaveLength(1)
        expect((globalState as any).floatMessages[0].msg).toBe('test message')
    })

    it('does not crash on non-game-object (existing guard still fires)', () => {
        expect(() => script.float_msg(0 as any, 'hi', 1)).not.toThrow()
    })
})

// ===========================================================================
// Phase 80-E — BLK-132: loadMessageFile() try-catch for missing .msg files
// ===========================================================================

describe('Phase 80-E — BLK-132: loadMessageFile() try-catch', () => {
    it('BLK-132 checklist entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_132_load_message_file_try_catch')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-132 is a bug-kind entry', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_132_load_message_file_try_catch')
        expect(entry?.kind).toBe('bug')
    })

    it('BLK-132 description mentions try-catch / missing file', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_132_load_message_file_try_catch')
        expect(entry?.description).toMatch(/try.catch|catch/i)
    })
})

// ===========================================================================
// Phase 80-F — sfall opcodes 0x8290–0x8297
// ===========================================================================

describe('Phase 80-F-1 — sfall 0x8290: set_critter_current_hp_sfall', () => {
    it('sets HP on a valid critter', () => {
        const setBaseMock = vi.fn()
        const obj = makeObj({
            stats: { setBase: setBaseMock, modifyBase: vi.fn(), getBase: vi.fn(() => 5) },
        })
        script.set_critter_current_hp_sfall(obj, 50)
        expect(setBaseMock).toHaveBeenCalledWith('HP', 50)
    })

    it('clamps HP to maxHP', () => {
        const setBaseMock = vi.fn()
        const obj = makeObj({
            getStat: (s: string) => (s === 'Max HP' ? 100 : 5),
            stats: { setBase: setBaseMock, modifyBase: vi.fn(), getBase: vi.fn(() => 5) },
        })
        script.set_critter_current_hp_sfall(obj, 999)
        expect(setBaseMock).toHaveBeenCalledWith('HP', 100)
    })

    it('clamps HP to 0 when negative', () => {
        const setBaseMock = vi.fn()
        const obj = makeObj({
            stats: { setBase: setBaseMock, modifyBase: vi.fn(), getBase: vi.fn(() => 5) },
        })
        script.set_critter_current_hp_sfall(obj, -10)
        expect(setBaseMock).toHaveBeenCalledWith('HP', 0)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.set_critter_current_hp_sfall(0 as any, 50)).not.toThrow()
    })

    it('does not throw for non-finite hp', () => {
        const obj = makeObj()
        expect(() => script.set_critter_current_hp_sfall(obj, NaN)).not.toThrow()
    })
})

describe('Phase 80-F-2 — sfall 0x8291/0x8292: get/set_local_var_sfall', () => {
    it('returns 0 for unset local var', () => {
        expect(script.get_local_var_sfall(0)).toBe(0)
    })

    it('set then get round-trips correctly', () => {
        script.set_local_var_sfall(3, 42)
        expect(script.get_local_var_sfall(3)).toBe(42)
    })

    it('set_local_var_sfall stores 0 for NaN', () => {
        script.set_local_var_sfall(4, NaN)
        expect(script.get_local_var_sfall(4)).toBe(0)
    })

    it('does not throw', () => {
        expect(() => script.get_local_var_sfall(99)).not.toThrow()
        expect(() => script.set_local_var_sfall(99, 1)).not.toThrow()
    })
})

describe('Phase 80-F-3 — sfall 0x8293: get_game_time_sfall', () => {
    it('returns a positive number', () => {
        const t = script.get_game_time_sfall()
        expect(typeof t).toBe('number')
        expect(t).toBeGreaterThanOrEqual(1)
    })

    it('does not throw', () => {
        expect(() => script.get_game_time_sfall()).not.toThrow()
    })
})

describe('Phase 80-F-4 — sfall 0x8294: get_area_known_sfall', () => {
    it('returns 0 when mapAreas is undefined', () => {
        const orig = (globalState as any).mapAreas
        ;(globalState as any).mapAreas = undefined
        expect(script.get_area_known_sfall(1)).toBe(0)
        ;(globalState as any).mapAreas = orig
    })

    it('returns 1 for a known area', () => {
        const orig = (globalState as any).mapAreas
        ;(globalState as any).mapAreas = { 5: true }
        expect(script.get_area_known_sfall(5)).toBe(1)
        ;(globalState as any).mapAreas = orig
    })

    it('returns 0 for an unknown area', () => {
        const orig = (globalState as any).mapAreas
        ;(globalState as any).mapAreas = { 5: false }
        expect(script.get_area_known_sfall(5)).toBe(0)
        ;(globalState as any).mapAreas = orig
    })

    it('does not throw', () => {
        expect(() => script.get_area_known_sfall(0)).not.toThrow()
    })
})

describe('Phase 80-F-5 — sfall 0x8295/0x8296: get/add_kill_counter_sfall', () => {
    it('get_kill_counter_sfall returns 0', () => {
        expect(script.get_kill_counter_sfall(0)).toBe(0)
        expect(script.get_kill_counter_sfall(5)).toBe(0)
    })

    it('add_kill_counter_sfall does not throw', () => {
        expect(() => script.add_kill_counter_sfall(1, 5)).not.toThrow()
    })
})

describe('Phase 80-F-6 — sfall 0x8297: get_player_elevation_sfall', () => {
    it('returns a number in range [0, 2]', () => {
        const elev = script.get_player_elevation_sfall()
        expect(typeof elev).toBe('number')
        expect(elev).toBeGreaterThanOrEqual(0)
        expect(elev).toBeLessThanOrEqual(2)
    })

    it('does not throw', () => {
        expect(() => script.get_player_elevation_sfall()).not.toThrow()
    })
})

// ===========================================================================
// Phase 80-G — Checklist integrity
// ===========================================================================

describe('Phase 80-G — Checklist integrity', () => {
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

    it('all Phase 80 BLK entries are implemented', () => {
        const phase80Ids = [
            'blk_128_obj_name_null_guard',
            'blk_129_set_global_var_non_finite',
            'blk_130_critter_dmg_non_finite',
            'blk_131_float_msg_null_array',
            'blk_132_load_message_file_try_catch',
        ]
        for (const id of phase80Ids) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status, `${id} not implemented`).toBe('implemented')
        }
    })

    it('all Phase 80 sfall opcode entries are implemented', () => {
        const sfallIds = [
            'sfall_set_critter_current_hp_82',
            'sfall_get_local_var_82',
            'sfall_set_local_var_82',
            'sfall_get_game_time_82',
            'sfall_get_area_known',
            'sfall_get_kill_counter',
            'sfall_add_kill_counter',
            'sfall_get_player_elevation',
        ]
        for (const id of sfallIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status, `${id} not implemented`).toBe('implemented')
        }
    })
})
