/**
 * Phase 78 regression tests.
 *
 * Covers:
 *   A. BLK-123 — sfall hook arg buffer: sfallSetHookArgs, get_sfall_arg, set_sfall_return,
 *                get_sfall_args_count, get_sfall_arg_at, set_sfall_arg
 *   B. BLK-124 — get_game_mode_sfall reads globalState.uiMode for full bitmask
 *   C. Status upgrades: reg_anim_animate, reg_anim_func, gfade_out, gfade_in,
 *                       dialogue_reaction_opcode, set_sfall_return, get_sfall_arg
 *   D. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'

const sfallSetHookArgs = (args: any[]) => Scripting.sfallSetHookArgs(args)
const sfallGetHookReturn = () => Scripting.sfallGetHookReturn()
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

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    // Reset the hook arg buffer before each test
    sfallSetHookArgs([])
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
    // Restore globalState values changed during tests
    ;(globalState as any).inCombat = false
    ;(globalState as any).uiMode = 0
})

// ===========================================================================
// Phase 78-A — BLK-123: sfall hook arg buffer
// ===========================================================================

describe('Phase 78-A — BLK-123: sfallSetHookArgs / get_sfall_arg', () => {
    it('sfallSetHookArgs is exported from scripting module', () => {
        expect(typeof sfallSetHookArgs).toBe('function')
    })

    it('sfallGetHookReturn is exported from scripting module', () => {
        expect(typeof sfallGetHookReturn).toBe('function')
    })

    it('get_sfall_arg returns 0 when buffer is empty', () => {
        sfallSetHookArgs([])
        expect(script.get_sfall_arg()).toBe(0)
    })

    it('get_sfall_arg reads sequentially from the buffer', () => {
        sfallSetHookArgs([10, 20, 30])
        expect(script.get_sfall_arg()).toBe(10)
        expect(script.get_sfall_arg()).toBe(20)
        expect(script.get_sfall_arg()).toBe(30)
        expect(script.get_sfall_arg()).toBe(0) // exhausted
    })

    it('get_sfall_arg resets cursor on sfallSetHookArgs', () => {
        sfallSetHookArgs([5, 6])
        expect(script.get_sfall_arg()).toBe(5)
        sfallSetHookArgs([99])
        expect(script.get_sfall_arg()).toBe(99)
    })

    it('set_sfall_return stores value in the buffer', () => {
        script.set_sfall_return(42)
        expect(sfallGetHookReturn()).toBe(42)
    })

    it('set_sfall_return with 0 clears the return value', () => {
        script.set_sfall_return(99)
        script.set_sfall_return(0)
        expect(sfallGetHookReturn()).toBe(0)
    })

    it('sfallSetHookArgs resets return value to 0', () => {
        script.set_sfall_return(55)
        sfallSetHookArgs([])
        expect(sfallGetHookReturn()).toBe(0)
    })

    it('get_sfall_args_count returns number of args in the buffer', () => {
        sfallSetHookArgs([1, 2, 3])
        expect(script.get_sfall_args_count()).toBe(3)
    })

    it('get_sfall_args_count returns 0 for empty buffer', () => {
        sfallSetHookArgs([])
        expect(script.get_sfall_args_count()).toBe(0)
    })

    it('get_sfall_arg_at returns arg at given index without advancing cursor', () => {
        sfallSetHookArgs([10, 20, 30])
        expect(script.get_sfall_arg_at(0)).toBe(10)
        expect(script.get_sfall_arg_at(2)).toBe(30)
        expect(script.get_sfall_arg_at(1)).toBe(20)
    })

    it('get_sfall_arg_at returns 0 for out-of-bounds index', () => {
        sfallSetHookArgs([10])
        expect(script.get_sfall_arg_at(99)).toBe(0)
        expect(script.get_sfall_arg_at(-1)).toBe(0)
    })

    it('set_sfall_arg writes a value back to the buffer', () => {
        sfallSetHookArgs([10, 20, 30])
        script.set_sfall_arg(1, 99)
        expect(script.get_sfall_arg_at(1)).toBe(99)
    })

    it('set_sfall_arg is a no-op for out-of-bounds index', () => {
        sfallSetHookArgs([10])
        expect(() => script.set_sfall_arg(99, 42)).not.toThrow()
        expect(script.get_sfall_arg_at(0)).toBe(10) // unchanged
    })

    it('get_script_return_val_sfall returns the hook return value', () => {
        script.set_sfall_return(77)
        expect(script.get_script_return_val_sfall()).toBe(77)
    })

    it('set_script_return_val_sfall also stores into the hook return buffer', () => {
        script.set_script_return_val_sfall(88)
        expect(sfallGetHookReturn()).toBe(88)
    })

    it('does not throw on any input', () => {
        expect(() => script.get_sfall_arg()).not.toThrow()
        expect(() => script.set_sfall_return(0)).not.toThrow()
        expect(() => script.get_sfall_args_count()).not.toThrow()
        expect(() => script.get_sfall_arg_at(0)).not.toThrow()
        expect(() => script.set_sfall_arg(0, 5)).not.toThrow()
    })
})

// ===========================================================================
// Phase 78-B — BLK-124: get_game_mode_sfall reads uiMode
// ===========================================================================

describe('Phase 78-B — BLK-124: get_game_mode_sfall reads globalState.uiMode', () => {
    it('returns 0x01 (normal map) by default (no combat, no UI mode)', () => {
        ;(globalState as any).inCombat = false
        ;(globalState as any).uiMode = 0
        expect(script.get_game_mode_sfall()).toBe(0x01)
    })

    it('returns 0x03 in combat (bit 0 + bit 1)', () => {
        ;(globalState as any).inCombat = true
        ;(globalState as any).uiMode = 0
        expect(script.get_game_mode_sfall()).toBe(0x03)
    })

    it('returns 0x05 in dialogue mode (bit 0 + bit 2)', () => {
        ;(globalState as any).inCombat = false
        ;(globalState as any).uiMode = 1 // UIMode.dialogue
        expect(script.get_game_mode_sfall()).toBe(0x05)
    })

    it('returns 0x09 in barter mode (bit 0 + bit 3)', () => {
        ;(globalState as any).inCombat = false
        ;(globalState as any).uiMode = 2 // UIMode.barter
        expect(script.get_game_mode_sfall()).toBe(0x09)
    })

    it('returns 0x11 in inventory mode (bit 0 + bit 4)', () => {
        ;(globalState as any).inCombat = false
        ;(globalState as any).uiMode = 4 // UIMode.inventory
        expect(script.get_game_mode_sfall()).toBe(0x11)
    })

    it('returns 0x20 on world map (bit 5 only, no normal-map bit)', () => {
        ;(globalState as any).inCombat = false
        ;(globalState as any).uiMode = 5 // UIMode.worldMap
        expect(script.get_game_mode_sfall()).toBe(0x20)
    })

    it('does not throw', () => {
        expect(() => script.get_game_mode_sfall()).not.toThrow()
    })
})

// ===========================================================================
// Phase 78-C — Status upgrades: previously-partial entries are now implemented
// ===========================================================================

describe('Phase 78-C — Checklist status upgrades', () => {
    const upgradedEntries = [
        'reg_anim_animate',
        'reg_anim_func',
        'gfade_out',
        'gfade_in',
        'dialogue_reaction_opcode',
        'set_sfall_return',
        'get_sfall_arg',
        'sfall_get_game_mode',
    ]

    for (const id of upgradedEntries) {
        it(`'${id}' is now 'implemented' in the checklist`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `entry '${id}' not found`).toBeDefined()
            expect(entry?.status).toBe('implemented')
        })
    }
})

// ===========================================================================
// Phase 78-D — Checklist integrity
// ===========================================================================

describe('Phase 78-D — Checklist integrity', () => {
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
})
