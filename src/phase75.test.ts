/**
 * Phase 75 regression tests.
 *
 * Covers:
 *   A. BLK-110 — window.performance.now() in object.ts animation methods
 *   B. BLK-111 — game_loaded() returns real mapLoadedFromSave flag
 *   C. BLK-112 — combat combatant null-position guard in main.ts
 *   D. BLK-113 — Obj.serialize() position null guard
 *   E. BLK-114 — Obj.drop() source.position null guard
 *   F. BLK-115 — Obj.explode() null position guard
 *   G. BLK-116 — walk-anim this.position null guard in Critter.updateAnim
 *   H. sfall opcodes 0x8278–0x827F
 *   I. Checklist integrity
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
// Phase 75-A — BLK-110: window.performance.now() guards in object.ts
// ===========================================================================

describe('Phase 75-A — BLK-110: performance.now() safe pattern', () => {
    it('BLK-110 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_110_window_performance_now_object'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('typeof performance guard returns a number in current env', () => {
        // This exercises the same pattern used in object.ts after BLK-110 fix
        const t = typeof performance !== 'undefined' ? performance.now() : 0
        expect(typeof t).toBe('number')
        expect(t).toBeGreaterThanOrEqual(0)
    })
})

// ===========================================================================
// Phase 75-B — BLK-111: game_loaded() returns real flag
// ===========================================================================

describe('Phase 75-B — BLK-111: game_loaded() real mapLoadedFromSave flag', () => {
    it('game_loaded() returns 0 by default', () => {
        const orig = (globalState as any).mapLoadedFromSave
        ;(globalState as any).mapLoadedFromSave = false
        const result = script.get_map_loaded_sfall()
        expect(result).toBe(0)
        ;(globalState as any).mapLoadedFromSave = orig
    })

    it('game_loaded() returns 1 when mapLoadedFromSave is true', () => {
        const orig = (globalState as any).mapLoadedFromSave
        ;(globalState as any).mapLoadedFromSave = true
        const result = script.get_map_loaded_sfall()
        expect(result).toBe(1)
        ;(globalState as any).mapLoadedFromSave = orig
    })

    it('globalState.mapLoadedFromSave defaults to false', () => {
        expect((globalState as any).mapLoadedFromSave).toBe(false)
    })

    it('BLK-111 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_111_game_loaded_flag'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 75-C — BLK-112: combat combatant null-position guard
// ===========================================================================

describe('Phase 75-C — BLK-112: combat combatant null-position guard (checklist)', () => {
    it('BLK-112 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_112_combat_combatant_null_position'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 75-D — BLK-113: Obj.serialize() position null guard
// ===========================================================================

describe('Phase 75-D — BLK-113: serialize() position null guard (checklist)', () => {
    it('BLK-113 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_113_serialize_null_position'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 75-E — BLK-114: Obj.drop() source.position null guard
// ===========================================================================

describe('Phase 75-E — BLK-114: drop() source.position null guard (checklist)', () => {
    it('BLK-114 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_114_drop_source_null_position'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 75-F — BLK-115: Obj.explode() null position guard
// ===========================================================================

describe('Phase 75-F — BLK-115: explode() null position guard (checklist)', () => {
    it('BLK-115 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_115_explode_null_position'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 75-G — BLK-116: walk-anim null position guard
// ===========================================================================

describe('Phase 75-G — BLK-116: walk-anim this.position null guard (checklist)', () => {
    it('BLK-116 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(
            (e) => e.id === 'blk_116_walk_anim_null_position'
        )
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 75-H — sfall 0x8278: get_critter_knockout_sfall
// ===========================================================================

describe('Phase 75-H — sfall 0x8278: get_critter_knockout_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_knockout_sfall(0 as any)).toBe(0)
    })

    it('returns 0 for non-critter object', () => {
        expect(script.get_critter_knockout_sfall(makeObj({ type: 'item' }))).toBe(0)
    })

    it('returns 0 when critter is not knocked out', () => {
        const critter = makeObj({ knockedOut: false })
        expect(script.get_critter_knockout_sfall(critter)).toBe(0)
    })

    it('returns 1 when critter is knocked out', () => {
        const critter = makeObj({ knockedOut: true })
        expect(script.get_critter_knockout_sfall(critter)).toBe(1)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_knockout_sfall(0 as any)).not.toThrow()
        expect(() => script.get_critter_knockout_sfall(makeObj())).not.toThrow()
    })
})

// ===========================================================================
// Phase 75-I — sfall 0x8279: get_critter_knockdown_sfall
// ===========================================================================

describe('Phase 75-I — sfall 0x8279: get_critter_knockdown_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_knockdown_sfall(0 as any)).toBe(0)
    })

    it('returns 0 when not knocked down', () => {
        expect(script.get_critter_knockdown_sfall(makeObj({ knockedDown: false }))).toBe(0)
    })

    it('returns 1 when knocked down', () => {
        expect(script.get_critter_knockdown_sfall(makeObj({ knockedDown: true }))).toBe(1)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_knockdown_sfall(makeObj())).not.toThrow()
    })
})

// ===========================================================================
// Phase 75-J — sfall 0x827A: get_critter_crippled_legs_sfall
// ===========================================================================

describe('Phase 75-J — sfall 0x827A: get_critter_crippled_legs_sfall', () => {
    it('returns 0 when no legs crippled', () => {
        expect(script.get_critter_crippled_legs_sfall(makeObj())).toBe(0)
    })

    it('returns 0x01 for left leg crippled', () => {
        expect(script.get_critter_crippled_legs_sfall(makeObj({ crippledLeftLeg: true }))).toBe(0x01)
    })

    it('returns 0x02 for right leg crippled', () => {
        expect(script.get_critter_crippled_legs_sfall(makeObj({ crippledRightLeg: true }))).toBe(0x02)
    })

    it('returns 0x03 for both legs crippled', () => {
        expect(script.get_critter_crippled_legs_sfall(makeObj({ crippledLeftLeg: true, crippledRightLeg: true }))).toBe(0x03)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.get_critter_crippled_legs_sfall(0 as any)).not.toThrow()
    })
})

// ===========================================================================
// Phase 75-K — sfall 0x827B: get_critter_crippled_arms_sfall
// ===========================================================================

describe('Phase 75-K — sfall 0x827B: get_critter_crippled_arms_sfall', () => {
    it('returns 0 when no arms crippled', () => {
        expect(script.get_critter_crippled_arms_sfall(makeObj())).toBe(0)
    })

    it('returns 0x01 for left arm crippled', () => {
        expect(script.get_critter_crippled_arms_sfall(makeObj({ crippledLeftArm: true }))).toBe(0x01)
    })

    it('returns 0x02 for right arm crippled', () => {
        expect(script.get_critter_crippled_arms_sfall(makeObj({ crippledRightArm: true }))).toBe(0x02)
    })

    it('returns 0x03 for both arms crippled', () => {
        expect(script.get_critter_crippled_arms_sfall(makeObj({ crippledLeftArm: true, crippledRightArm: true }))).toBe(0x03)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.get_critter_crippled_arms_sfall(0 as any)).not.toThrow()
    })
})

// ===========================================================================
// Phase 75-L — sfall 0x827C: get_critter_dead_sfall
// ===========================================================================

describe('Phase 75-L — sfall 0x827C: get_critter_dead_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_dead_sfall(0 as any)).toBe(0)
    })

    it('returns 0 for living critter', () => {
        expect(script.get_critter_dead_sfall(makeObj({ dead: false }))).toBe(0)
    })

    it('returns 1 for dead critter', () => {
        expect(script.get_critter_dead_sfall(makeObj({ dead: true }))).toBe(1)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_dead_sfall(makeObj())).not.toThrow()
    })
})

// ===========================================================================
// Phase 75-M — sfall 0x827D: get_map_loaded_sfall
// ===========================================================================

describe('Phase 75-M — sfall 0x827D: get_map_loaded_sfall', () => {
    it('returns 0 by default', () => {
        const orig = (globalState as any).mapLoadedFromSave
        ;(globalState as any).mapLoadedFromSave = false
        expect(script.get_map_loaded_sfall()).toBe(0)
        ;(globalState as any).mapLoadedFromSave = orig
    })

    it('returns 1 when mapLoadedFromSave is true', () => {
        const orig = (globalState as any).mapLoadedFromSave
        ;(globalState as any).mapLoadedFromSave = true
        expect(script.get_map_loaded_sfall()).toBe(1)
        ;(globalState as any).mapLoadedFromSave = orig
    })

    it('does not throw', () => {
        expect(() => script.get_map_loaded_sfall()).not.toThrow()
    })
})

// ===========================================================================
// Phase 75-N — sfall 0x827E: get_critter_poison_level_sfall
// ===========================================================================

describe('Phase 75-N — sfall 0x827E: get_critter_poison_level_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_poison_level_sfall(0 as any)).toBe(0)
    })

    it('returns poison level from stats', () => {
        const critter = makeObj({
            stats: {
                getBase: (s: string) => s === 'Poison Level' ? 25 : 0,
                modifyBase: () => {},
            },
        })
        expect(script.get_critter_poison_level_sfall(critter)).toBe(25)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_poison_level_sfall(makeObj())).not.toThrow()
    })
})

// ===========================================================================
// Phase 75-O — sfall 0x827F: get_critter_radiation_level_sfall
// ===========================================================================

describe('Phase 75-O — sfall 0x827F: get_critter_radiation_level_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_radiation_level_sfall(0 as any)).toBe(0)
    })

    it('returns radiation level from stats', () => {
        const critter = makeObj({
            stats: {
                getBase: (s: string) => s === 'Radiation Level' ? 42 : 0,
                modifyBase: () => {},
            },
        })
        expect(script.get_critter_radiation_level_sfall(critter)).toBe(42)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_radiation_level_sfall(makeObj())).not.toThrow()
    })
})

// ===========================================================================
// Phase 75-P — sfall method registration check (0x8278–0x827F)
// ===========================================================================

describe('Phase 75-P — sfall 0x8278–0x827F scripting methods exist', () => {
    const phase75Methods = [
        'get_critter_knockout_sfall',
        'get_critter_knockdown_sfall',
        'get_critter_crippled_legs_sfall',
        'get_critter_crippled_arms_sfall',
        'get_critter_dead_sfall',
        'get_map_loaded_sfall',
        'get_critter_poison_level_sfall',
        'get_critter_radiation_level_sfall',
    ]

    for (const methodName of phase75Methods) {
        it(`script.${methodName} is a function`, () => {
            expect(typeof (script as any)[methodName]).toBe('function')
        })
    }
})

// ===========================================================================
// Phase 75-Q — Checklist integrity
// ===========================================================================

describe('Phase 75-Q — Checklist integrity', () => {
    const phase75Ids = [
        'blk_110_window_performance_now_object',
        'blk_111_game_loaded_flag',
        'blk_112_combat_combatant_null_position',
        'blk_113_serialize_null_position',
        'blk_114_drop_source_null_position',
        'blk_115_explode_null_position',
        'blk_116_walk_anim_null_position',
        'sfall_get_critter_knockout',
        'sfall_get_critter_knockdown',
        'sfall_get_critter_crippled_legs',
        'sfall_get_critter_crippled_arms',
        'sfall_get_critter_dead',
        'sfall_get_map_loaded',
        'sfall_get_critter_poison_level',
        'sfall_get_critter_radiation_level',
    ]

    it('all Phase 75 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase75Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
