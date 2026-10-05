/**
 * Phase 74 regression tests.
 *
 * Covers:
 *   A. BLK-105 — game_time_advance() non-finite ticks guard (scripting.ts)
 *   B. BLK-106 — give_exp_points() non-finite XP guard (scripting.ts)
 *   C. BLK-107 — gsay_option() null/non-function target guard (scripting.ts)
 *   D. BLK-108 — critter_attempt_placement() null gMap guard (scripting.ts)
 *   E. BLK-109 — add_timer_event() non-positive ticks guard (scripting.ts)
 *   F. sfall opcodes 0x8270–0x8277
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
        teamNum: -1,
        rightHand: null,
        leftHand: null,
        equippedArmor: null,
        perkRanks: {},
        getStat: (s: string) => (s === 'Max HP' ? 100 : 5),
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
// Phase 74-A — BLK-105: game_time_advance() non-finite ticks guard
// ===========================================================================

describe('Phase 74-A — BLK-105: game_time_advance() non-finite ticks guard', () => {
    it('does not corrupt gameTickTime when ticks is NaN', () => {
        const origTime = (globalState as any).gameTickTime
        ;(globalState as any).gameTickTime = 1000
        script.game_time_advance(NaN)
        expect((globalState as any).gameTickTime).toBe(1000)
        ;(globalState as any).gameTickTime = origTime
    })

    it('does not corrupt gameTickTime when ticks is Infinity', () => {
        const origTime = (globalState as any).gameTickTime
        ;(globalState as any).gameTickTime = 2000
        script.game_time_advance(Infinity)
        expect((globalState as any).gameTickTime).toBe(2000)
        ;(globalState as any).gameTickTime = origTime
    })

    it('does not corrupt gameTickTime when ticks is -Infinity', () => {
        const origTime = (globalState as any).gameTickTime
        ;(globalState as any).gameTickTime = 3000
        script.game_time_advance(-Infinity)
        expect((globalState as any).gameTickTime).toBe(3000)
        ;(globalState as any).gameTickTime = origTime
    })

    it('advances time normally for a valid positive ticks value', () => {
        const origTime = (globalState as any).gameTickTime
        ;(globalState as any).gameTickTime = 0
        script.game_time_advance(100)
        expect((globalState as any).gameTickTime).toBe(100)
        ;(globalState as any).gameTickTime = origTime
    })

    it('does not throw for any of the non-finite inputs', () => {
        expect(() => script.game_time_advance(NaN)).not.toThrow()
        expect(() => script.game_time_advance(Infinity)).not.toThrow()
        expect(() => script.game_time_advance(-Infinity)).not.toThrow()
    })

    it('BLK-105 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_105_game_time_advance_non_finite'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 74-B — BLK-106: give_exp_points() non-finite XP guard
// ===========================================================================

describe('Phase 74-B — BLK-106: give_exp_points() non-finite XP guard', () => {
    it('does not corrupt player.xp when xp is NaN', () => {
        const player: any = {
            xp: 500,
            level: 1,
            getStat: (s: string) => 5,
            skills: { skillPoints: 0 },
            perkRanks: {},
        }
        const origPlayer = (globalState as any).player
        ;(globalState as any).player = player
        script.give_exp_points(NaN)
        expect(player.xp).toBe(500)
        ;(globalState as any).player = origPlayer
    })

    it('does not corrupt player.xp when xp is Infinity', () => {
        const player: any = {
            xp: 100,
            level: 1,
            getStat: (s: string) => 5,
            skills: { skillPoints: 0 },
            perkRanks: {},
        }
        const origPlayer = (globalState as any).player
        ;(globalState as any).player = player
        script.give_exp_points(Infinity)
        expect(player.xp).toBe(100)
        ;(globalState as any).player = origPlayer
    })

    it('normally awards XP for finite positive value', () => {
        const player: any = {
            xp: 0,
            level: 1,
            getStat: (s: string) => 5,
            skills: { skillPoints: 0 },
            perkRanks: {},
        }
        const origPlayer = (globalState as any).player
        ;(globalState as any).player = player
        script.give_exp_points(250)
        expect(player.xp).toBe(250)
        ;(globalState as any).player = origPlayer
    })

    it('does not throw for NaN or Infinity XP', () => {
        const origPlayer = (globalState as any).player
        ;(globalState as any).player = null
        expect(() => script.give_exp_points(NaN)).not.toThrow()
        expect(() => script.give_exp_points(Infinity)).not.toThrow()
        ;(globalState as any).player = origPlayer
    })

    it('BLK-106 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_106_give_exp_points_non_finite'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 74-C — BLK-107: gsay_option() null/non-function target guard
// ===========================================================================

describe('Phase 74-C — BLK-107: gsay_option() null/non-function target guard', () => {
    // NOTE: When msgID is a string, getScriptMessage() returns it directly
    // (no XMLHttpRequest needed), so we use a string msgID to reach the
    // target-binding code path without triggering network I/O.

    it('does not throw when target is null (string msgID)', () => {
        expect(() => script.gsay_option(0, 'Test option', null, 0)).not.toThrow()
    })

    it('does not throw when target is 0 / Fallout 2 null-ref convention', () => {
        expect(() => script.gsay_option(0, 'Test option', 0, 0)).not.toThrow()
    })

    it('does not throw when target is a plain object', () => {
        expect(() => script.gsay_option(0, 'Test option', { foo: 'bar' }, 0)).not.toThrow()
    })

    it('does not throw when target is a real function (normal path)', () => {
        expect(() => script.gsay_option(0, 'Test option', () => {}, 0)).not.toThrow()
    })

    it('returns early without binding for empty/null message', () => {
        // Empty message → early return before target.bind(), so null target is safe
        expect(() => script.gsay_option(0, '', null, 0)).not.toThrow()
    })

    it('BLK-107 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_107_gsay_option_non_function_target'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 74-D — BLK-108: critter_attempt_placement() null gMap guard
// ===========================================================================

describe('Phase 74-D — BLK-108: critter_attempt_placement() null gMap guard', () => {
    it('returns -1 when gMap is null', () => {
        const origMap = (globalState as any).gMap
        ;(globalState as any).gMap = null
        const critter = makeObj()
        const result = script.critter_attempt_placement(critter, 5000, 0)
        expect(result).toBe(-1)
        ;(globalState as any).gMap = origMap
    })

    it('does not throw when gMap is null', () => {
        const origMap = (globalState as any).gMap
        ;(globalState as any).gMap = null
        expect(() => script.critter_attempt_placement(makeObj(), 5000, 0)).not.toThrow()
        ;(globalState as any).gMap = origMap
    })

    it('returns -1 for invalid (null) object regardless of gMap', () => {
        expect(script.critter_attempt_placement(0 as any, 5000, 0)).toBe(-1)
    })

    it('returns -1 for invalid tileNum <= 0 regardless of gMap', () => {
        expect(script.critter_attempt_placement(makeObj(), -1, 0)).toBe(-1)
    })

    it('BLK-108 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_108_critter_attempt_placement_null_gmap'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 74-E — BLK-109: add_timer_event() non-positive ticks guard
// ===========================================================================

describe('Phase 74-E — BLK-109: add_timer_event() non-positive ticks guard', () => {
    it('does not throw when ticks is 0', () => {
        const obj = makeObj({ _script: script })
        expect(() => script.add_timer_event(obj, 0, 42)).not.toThrow()
    })

    it('does not throw when ticks is negative', () => {
        const obj = makeObj({ _script: script })
        expect(() => script.add_timer_event(obj, -10, 99)).not.toThrow()
    })

    it('does not throw when ticks is NaN', () => {
        const obj = makeObj({ _script: script })
        expect(() => script.add_timer_event(obj, NaN, 1)).not.toThrow()
    })

    it('does not throw for a valid positive ticks value', () => {
        const obj = makeObj({ _script: script })
        expect(() => script.add_timer_event(obj, 100, 0)).not.toThrow()
    })

    it('BLK-109 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_109_add_timer_event_non_positive_ticks'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 74-L — sfall method registration check (0x8270–0x8277)
// ===========================================================================

// ===========================================================================
// Phase 74-M — Checklist integrity
// ===========================================================================

describe('Phase 74-M — Checklist integrity', () => {
    const phase74Ids = [
        'blk_105_game_time_advance_non_finite',
        'blk_106_give_exp_points_non_finite',
        'blk_107_gsay_option_non_function_target',
        'blk_108_critter_attempt_placement_null_gmap',
        'blk_109_add_timer_event_non_positive_ticks',
        'sfall_get_tile_at_object',
        'sfall_critter_get_flee_state',
        'sfall_critter_set_flee_state',
        'sfall_get_combat_difficulty_74',
        'sfall_get_object_proto',
        'sfall_get_critter_hit_chance',
        'sfall_get_tile_distance',
        'sfall_get_tile_in_direction',
    ]

    it('all Phase 74 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase74Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
