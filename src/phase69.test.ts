/**
 * Phase 69 regression tests.
 *
 * Covers:
 *   A. BLK-082 — float_msg() window.performance.now() → safe performance.now() fallback
 *   B. BLK-083 — tile_is_visible() null player.position guard
 *   C. BLK-084 — set_exit_grids() null gameObjects guard
 *   D. BLK-085 — obj_can_hear_obj() null position guard
 *   E. sfall opcodes 0x8248–0x824F (map limits, obj validity, string ops, script id)
 *   F. Checklist integrity
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
// Phase 69-A — BLK-082: float_msg window.performance.now() guard
// ===========================================================================

describe('Phase 69-A — BLK-082: float_msg safe performance.now() fallback', () => {
    it('float_msg does not throw when self_obj is set', async () => {
        const gs = (await import('./globalState.js')).default
        const origMessages = gs.floatMessages
        ;(gs as any).floatMessages = []
        script.self_obj = makeObj() as any
        expect(() => script.float_msg(makeObj() as any, 'hello', 0)).not.toThrow()
        ;(gs as any).floatMessages = origMessages
    })

    it('float_msg pushes a message entry without crashing', async () => {
        const gs = (await import('./globalState.js')).default
        const msgs: any[] = []
        ;(gs as any).floatMessages = msgs
        script.self_obj = makeObj() as any
        script.float_msg(makeObj() as any, 'test message', 0)
        expect(msgs.length).toBe(1)
        expect(msgs[0].msg).toBe('test message')
        // startTime must be a finite number (not NaN/undefined)
        expect(typeof msgs[0].startTime).toBe('number')
        expect(Number.isFinite(msgs[0].startTime) || msgs[0].startTime === 0).toBe(true)
        ;(gs as any).floatMessages = []
    })
})

// ===========================================================================
// Phase 69-B — BLK-083: tile_is_visible null player.position guard
// ===========================================================================

describe('Phase 69-B — BLK-083: tile_is_visible null player.position guard', () => {
    it('tile_is_visible does not throw when player.position is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origPlayer = gs.player
        // Create a player-like object with null position — triggers BLK-083 without fix
        gs.player = { position: null } as any
        expect(() => script.tile_is_visible(20100)).not.toThrow()
        gs.player = origPlayer
    })

    it('tile_is_visible returns 1 (visible) when player.position is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origPlayer = gs.player
        gs.player = { position: null } as any
        const result = script.tile_is_visible(20100)
        expect(result).toBe(1)
        gs.player = origPlayer
    })

    it('tile_is_visible returns 1 when player is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origPlayer = gs.player
        gs.player = null as any
        expect(script.tile_is_visible(20100)).toBe(1)
        gs.player = origPlayer
    })
})

// ===========================================================================
// Phase 69-C — BLK-084: set_exit_grids null gameObjects guard
// ===========================================================================

describe('Phase 69-C — BLK-084: set_exit_grids null gameObjects guard', () => {
    it('set_exit_grids does not throw before any map is loaded (gameObjects=null)', () => {
        // Scripting.init clears gameObjects to null; calling set_exit_grids before
        // enterMap/updateMap should not crash.
        Scripting.init('pre_map', 0)
        const s = new Scripting.Script()
        expect(() => s.set_exit_grids(0, 1, 0, 10000, 0)).not.toThrow()
    })

    it('set_exit_grids silently no-ops when gameObjects is null', () => {
        // No observable side effect expected — just verify no throw and no state mutation.
        Scripting.init('pre_map', 0)
        const s = new Scripting.Script()
        // Should complete without throwing
        s.set_exit_grids(0, 42, 1, 99999, 3)
        // Pass: if we reach here, the guard worked
    })
})

// ===========================================================================
// Phase 69-D — BLK-085: obj_can_hear_obj null position guard
// ===========================================================================

describe('Phase 69-D — BLK-085: obj_can_hear_obj null position guard', () => {
    it('obj_can_hear_obj does not throw when a.position is null', () => {
        const a = makeObj({ position: null })
        const b = makeObj({ position: { x: 10, y: 10 } })
        expect(() => script.obj_can_hear_obj(a, b)).not.toThrow()
    })

    it('obj_can_hear_obj returns 0 when a.position is null', () => {
        const a = makeObj({ position: null })
        const b = makeObj({ position: { x: 10, y: 10 } })
        expect(script.obj_can_hear_obj(a, b)).toBe(0)
    })

    it('obj_can_hear_obj does not throw when b.position is null', () => {
        const a = makeObj({ position: { x: 10, y: 10 } })
        const b = makeObj({ position: null })
        expect(() => script.obj_can_hear_obj(a, b)).not.toThrow()
    })

    it('obj_can_hear_obj returns 0 when b.position is null', () => {
        const a = makeObj({ position: { x: 10, y: 10 } })
        const b = makeObj({ position: null })
        expect(script.obj_can_hear_obj(a, b)).toBe(0)
    })

    it('obj_can_hear_obj returns 1 for adjacent objects (within 12 hexes)', () => {
        const a = makeObj({ position: { x: 5, y: 5 } })
        const b = makeObj({ position: { x: 6, y: 5 } })
        expect(script.obj_can_hear_obj(a, b)).toBe(1)
    })

    it('obj_can_hear_obj returns 0 for objects far apart', () => {
        const a = makeObj({ position: { x: 0, y: 0 } })
        const b = makeObj({ position: { x: 50, y: 50 } })
        expect(script.obj_can_hear_obj(a, b)).toBe(0)
    })
})

// ===========================================================================
// Phase 69-E — sfall opcodes 0x8248–0x824F
// ===========================================================================

describe('Phase 69-E — sfall opcodes 0x8248–0x824F', () => {
    // ---- 0x8248 get_map_limits_sfall ----
    it('get_map_limits_sfall returns 200 for width (which=0)', () => {
        expect(script.get_map_limits_sfall(0)).toBe(200)
    })

    it('get_map_limits_sfall returns 200 for height (which=1)', () => {
        expect(script.get_map_limits_sfall(1)).toBe(200)
    })

    it('get_map_limits_sfall returns 200 for any other value', () => {
        expect(script.get_map_limits_sfall(99)).toBe(200)
    })

    // ---- 0x8249 obj_is_valid_sfall ----
    it('obj_is_valid_sfall returns 1 for a valid game object', () => {
        const obj = makeObj()
        expect(script.obj_is_valid_sfall(obj)).toBe(1)
    })

    it('obj_is_valid_sfall returns 0 for null', () => {
        expect(script.obj_is_valid_sfall(null)).toBe(0)
    })

    it('obj_is_valid_sfall returns 0 for a plain number', () => {
        expect(script.obj_is_valid_sfall(42)).toBe(0)
    })

    it('obj_is_valid_sfall returns 0 for 0', () => {
        expect(script.obj_is_valid_sfall(0)).toBe(0)
    })

    // ---- 0x824A get_string_length_sfall ----
    it('get_string_length_sfall returns correct length for a string', () => {
        expect(script.get_string_length_sfall('hello')).toBe(5)
    })

    it('get_string_length_sfall returns 0 for empty string', () => {
        expect(script.get_string_length_sfall('')).toBe(0)
    })

    it('get_string_length_sfall returns 0 for non-string input', () => {
        expect(script.get_string_length_sfall(42 as any)).toBe(0)
        expect(script.get_string_length_sfall(null as any)).toBe(0)
    })

    // ---- 0x824B get_char_code_sfall ----
    it('get_char_code_sfall returns correct code for first character', () => {
        expect(script.get_char_code_sfall('A', 0)).toBe(65)
    })

    it('get_char_code_sfall returns correct code at arbitrary position', () => {
        expect(script.get_char_code_sfall('hello', 1)).toBe(101) // 'e'
    })

    it('get_char_code_sfall returns -1 for out-of-bounds position', () => {
        expect(script.get_char_code_sfall('hi', 5)).toBe(-1)
        expect(script.get_char_code_sfall('hi', -1)).toBe(-1)
    })

    it('get_char_code_sfall returns -1 for non-string', () => {
        expect(script.get_char_code_sfall(42 as any, 0)).toBe(-1)
    })

    // ---- 0x824C string_contains_sfall ----
    it('string_contains_sfall returns 1 when needle is found', () => {
        expect(script.string_contains_sfall('Vault City', 'City')).toBe(1)
    })

    it('string_contains_sfall returns 0 when needle is absent', () => {
        expect(script.string_contains_sfall('Klamath', 'Vault')).toBe(0)
    })

    it('string_contains_sfall returns 1 for empty needle', () => {
        expect(script.string_contains_sfall('any', '')).toBe(1)
    })

    it('string_contains_sfall returns 0 for non-string haystack', () => {
        expect(script.string_contains_sfall(42 as any, 'x')).toBe(0)
    })

    it('string_contains_sfall is case-sensitive', () => {
        expect(script.string_contains_sfall('Fallout', 'fallout')).toBe(0)
        expect(script.string_contains_sfall('Fallout', 'Fallout')).toBe(1)
    })

    // ---- 0x824D string_index_of_sfall ----
    it('string_index_of_sfall returns correct first index', () => {
        expect(script.string_index_of_sfall('Fallout 2', 'out')).toBe(4)
    })

    it('string_index_of_sfall returns -1 when not found', () => {
        expect(script.string_index_of_sfall('Klamath', 'Vault')).toBe(-1)
    })

    it('string_index_of_sfall returns 0 when needle is at start', () => {
        expect(script.string_index_of_sfall('hello', 'hell')).toBe(0)
    })

    it('string_index_of_sfall returns -1 for non-string haystack', () => {
        expect(script.string_index_of_sfall(0 as any, 'x')).toBe(-1)
    })

    // ---- 0x824E get_object_script_id_sfall ----
    it('get_object_script_id_sfall returns -1 for null', () => {
        expect(script.get_object_script_id_sfall(null)).toBe(-1)
    })

    it('get_object_script_id_sfall returns -1 for object without _script', () => {
        const obj = makeObj()
        expect(script.get_object_script_id_sfall(obj)).toBe(-1)
    })

    it('get_object_script_id_sfall returns sid when _script has sid', () => {
        const obj = makeObj({ _script: { sid: 42 } })
        expect(script.get_object_script_id_sfall(obj)).toBe(42)
    })

    it('get_object_script_id_sfall returns sid from _sid field', () => {
        const obj = makeObj({ _script: { _sid: 77 } })
        expect(script.get_object_script_id_sfall(obj)).toBe(77)
    })

    it('get_object_script_id_sfall returns -1 when _script has no sid', () => {
        const obj = makeObj({ _script: {} })
        expect(script.get_object_script_id_sfall(obj)).toBe(-1)
    })

    // ---- 0x824F get_script_field_sfall ----
    it('get_script_field_sfall returns 0 for any field', () => {
        expect(script.get_script_field_sfall('fixed_param')).toBe(0)
        expect(script.get_script_field_sfall(99)).toBe(0)
    })

    it('get_script_field_sfall does not throw', () => {
        expect(() => script.get_script_field_sfall(null)).not.toThrow()
    })
})

// ===========================================================================
// Phase 69-F — Checklist integrity
// ===========================================================================

describe('Phase 69-F — Checklist integrity', () => {
    const phase69Ids = [
        'blk_082_float_msg_window_performance',
        'blk_083_tile_is_visible_null_position',
        'blk_084_set_exit_grids_null_game_objects',
        'blk_085_obj_can_hear_obj_null_position',
        'sfall_get_map_limits',
        'sfall_obj_is_valid',
        'sfall_get_string_length',
        'sfall_get_char_code',
        'sfall_string_contains',
        'sfall_string_index_of',
        'sfall_get_object_script_id',
        'sfall_get_script_field',
    ]

    it('all Phase 69 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase69Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
