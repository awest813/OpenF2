/**
 * Phase 76 regression tests.
 *
 * Covers:
 *   A. BLK-117 — get_last_target / get_last_attacker now read real per-critter tracking
 *   B. BLK-118 — renderer.ts objectRenderInfo/objectBoundingBox null position guards (checklist)
 *   C. BLK-119 — map.ts recalcPath() safe performance.now() guard (checklist)
 *   D. BLK-120 — obj_run_proc (sfall 0x81D7) real dispatch implementation (checklist)
 *   E. sfall 0x8280–0x8281 — get_last_target_sfall / get_last_attacker_sfall aliases
 *   F. sfall 0x8282 — get_critter_level_sfall
 *   G. sfall 0x8283 — get_critter_xp_sfall
 *   H. sfall 0x8284 — set_critter_level_sfall
 *   I. sfall 0x8285 — get_critter_base_stat_sfall
 *   J. sfall 0x8286 — set_critter_base_stat_sfall
 *   K. sfall 0x8287 — get_obj_weight_sfall
 *   L. Method registration checks (0x8282–0x8287)
 *   M. Checklist integrity
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
            getBase: (s: string) => 5,
            setBase: (_s: string, _v: number) => {},
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
// Phase 76-A — BLK-117: last-target / last-attacker per-critter tracking
// ===========================================================================

describe('Phase 76-A — BLK-117: get_last_target / get_last_attacker real tracking', () => {
    it('BLK-117 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-117')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('get_last_target returns 0 for critter with no target set', () => {
        const critter = makeObj()
        // No lastCombatTarget set — should return 0
        const result = script.get_last_target_sfall(critter)
        expect(result).toBe(0)
    })

    it('get_last_target returns the stored target', () => {
        const target = makeObj({ name: 'Target' })
        const attacker = makeObj({ name: 'Attacker', lastCombatTarget: target })
        const result = script.get_last_target_sfall(attacker)
        expect(result).toBe(target)
    })

    it('get_last_attacker returns 0 for critter with no attacker set', () => {
        const critter = makeObj()
        const result = script.get_last_attacker_sfall(critter)
        expect(result).toBe(0)
    })

    it('get_last_attacker returns the stored attacker', () => {
        const attacker = makeObj({ name: 'Attacker' })
        const victim = makeObj({ name: 'Victim', lastCombatAttacker: attacker })
        const result = script.get_last_attacker_sfall(victim)
        expect(result).toBe(attacker)
    })

    it('get_last_target returns 0 for non-object (null)', () => {
        expect(script.get_last_target_sfall(null as any)).toBe(0)
    })

    it('get_last_attacker returns 0 for non-object (0)', () => {
        expect(script.get_last_attacker_sfall(0 as any)).toBe(0)
    })

    it('does not throw on any input', () => {
        expect(() => script.get_last_target_sfall(makeObj())).not.toThrow()
        expect(() => script.get_last_attacker_sfall(makeObj())).not.toThrow()
        expect(() => script.get_last_target_sfall(null as any)).not.toThrow()
        expect(() => script.get_last_attacker_sfall(0 as any)).not.toThrow()
    })
})

// ===========================================================================
// Phase 76-B — BLK-118: renderer.ts null position guards
// ===========================================================================

describe('Phase 76-B — BLK-118: renderer null position guards (checklist)', () => {
    it('BLK-118 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-118')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 76-C — BLK-119: map.ts performance.now() guard
// ===========================================================================

describe('Phase 76-C — BLK-119: map.ts recalcPath() safe performance.now() (checklist)', () => {
    it('BLK-119 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-119')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 76-D — BLK-120: obj_run_proc real dispatch
// ===========================================================================

describe('Phase 76-D — BLK-120: obj_run_proc real dispatch (checklist)', () => {
    it('BLK-120 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-120')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 76-E — sfall 0x8280–0x8281: get_last_target_sfall / get_last_attacker_sfall
// ===========================================================================

describe('Phase 76-E — sfall 0x8280/0x8281: last target/attacker aliases', () => {
    it('get_last_target_sfall is a function on script', () => {
        expect(typeof (script as any).get_last_target_sfall).toBe('function')
    })

    it('get_last_attacker_sfall is a function on script', () => {
        expect(typeof (script as any).get_last_attacker_sfall).toBe('function')
    })

    it('get_last_target_sfall and get_last_attacker_sfall match expected values', () => {
        const target = makeObj({ name: 'T' })
        const attacker = makeObj({ name: 'A', lastCombatTarget: target })
        const victim = makeObj({ name: 'V', lastCombatAttacker: attacker })
        expect(script.get_last_target_sfall(attacker)).toBe(target)
        expect(script.get_last_attacker_sfall(victim)).toBe(attacker)
    })
})

// ===========================================================================
// Phase 76-F — sfall 0x8282: get_critter_level_sfall
// ===========================================================================

describe('Phase 76-F — sfall 0x8282: get_critter_level_sfall', () => {
    it('returns 0 for non-critter object', () => {
        expect(script.get_critter_level_sfall(makeObj({ type: 'item' }))).toBe(0)
    })

    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_level_sfall(0 as any)).toBe(0)
    })

    it('returns 1 (default) for critter without level property', () => {
        const critter = makeObj()
        // No level property set, defaults to 1
        expect(script.get_critter_level_sfall(critter)).toBe(1)
    })

    it('returns stored level when set', () => {
        const critter = makeObj({ level: 5 })
        expect(script.get_critter_level_sfall(critter)).toBe(5)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_level_sfall(makeObj())).not.toThrow()
        expect(() => script.get_critter_level_sfall(0 as any)).not.toThrow()
    })
})

// ===========================================================================
// Phase 76-G — sfall 0x8283: get_critter_xp_sfall
// ===========================================================================

describe('Phase 76-G — sfall 0x8283: get_critter_current_xp_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_current_xp_sfall(0 as any)).toBe(0)
    })

    it('returns 0 for non-critter object', () => {
        expect(script.get_critter_current_xp_sfall(makeObj({ type: 'item' }))).toBe(0)
    })

    it('returns 0 for critter without xp property', () => {
        const critter = makeObj()
        expect(script.get_critter_current_xp_sfall(critter)).toBe(0)
    })

    it('returns stored xp value', () => {
        const critter = makeObj({ xp: 1200 })
        expect(script.get_critter_current_xp_sfall(critter)).toBe(1200)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_current_xp_sfall(makeObj())).not.toThrow()
    })
})

// ===========================================================================
// Phase 76-H — sfall 0x8284: set_critter_level_sfall
// ===========================================================================

describe('Phase 76-H — sfall 0x8284: set_critter_level_sfall', () => {
    it('sets level on a critter', () => {
        const critter = makeObj()
        script.set_critter_level_sfall(critter, 7)
        expect((critter as any).level).toBe(7)
    })

    it('floors non-integer level to integer', () => {
        const critter = makeObj()
        script.set_critter_level_sfall(critter, 3.9)
        expect((critter as any).level).toBe(3)
    })

    it('does not set level on non-critter (no-op)', () => {
        const item = makeObj({ type: 'item' })
        script.set_critter_level_sfall(item, 5)
        // No level property should be set on a non-critter
        expect((item as any).level).toBeUndefined()
    })

    it('does not set level for invalid level (no-op)', () => {
        const critter = makeObj()
        script.set_critter_level_sfall(critter, 0)   // level < 1
        expect((critter as any).level).toBeUndefined()
        script.set_critter_level_sfall(critter, -1)
        expect((critter as any).level).toBeUndefined()
        script.set_critter_level_sfall(critter, NaN)
        expect((critter as any).level).toBeUndefined()
    })

    it('does not throw on non-game-object', () => {
        expect(() => script.set_critter_level_sfall(0 as any, 5)).not.toThrow()
    })

    it('does not throw on valid critter', () => {
        expect(() => script.set_critter_level_sfall(makeObj(), 3)).not.toThrow()
    })
})

// ===========================================================================
// Phase 76-I — sfall 0x8285: get_critter_base_stat_sfall
// ===========================================================================

describe('Phase 76-I — sfall 0x8285: get_critter_base_stat_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_base_stat_sfall(0 as any, 0)).toBe(0)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_critter_base_stat_sfall(makeObj({ type: 'item' }), 0)).toBe(0)
    })

    it('returns base stat value from stats.getBase()', () => {
        const critter = makeObj({
            stats: {
                getBase: (s: string) => s === 'STR' ? 8 : 5,
                setBase: () => {},
                modifyBase: () => {},
            },
        })
        // Stat 0 = STR in Fallout 2 statMap
        const result = script.get_critter_base_stat_sfall(critter, 0)
        expect(result).toBe(8)
    })

    it('returns 0 for unknown stat index', () => {
        const critter = makeObj()
        expect(script.get_critter_base_stat_sfall(critter, 999)).toBe(0)
    })

    it('does not throw for valid inputs', () => {
        expect(() => script.get_critter_base_stat_sfall(makeObj(), 0)).not.toThrow()
    })
})

// ===========================================================================
// Phase 76-J — sfall 0x8286: set_critter_base_stat_sfall
// ===========================================================================

describe('Phase 76-J — sfall 0x8286: set_critter_base_stat_sfall', () => {
    it('calls stats.setBase() with correct stat name and value', () => {
        let capturedStat: string | null = null
        let capturedValue: number | null = null
        const critter = makeObj({
            stats: {
                getBase: () => 5,
                setBase: (s: string, v: number) => {
                    capturedStat = s
                    capturedValue = v
                },
                modifyBase: () => {},
            },
        })
        // Stat 0 = Strength
        script.set_critter_base_stat_sfall(critter, 0, 9)
        expect(capturedStat).toBe('STR') // statMap[0] === 'STR'
        expect(capturedValue).toBe(9)
    })

    it('does not call setBase for unknown stat (no-op)', () => {
        let called = false
        const critter = makeObj({
            stats: {
                getBase: () => 5,
                setBase: () => { called = true },
                modifyBase: () => {},
            },
        })
        script.set_critter_base_stat_sfall(critter, 999, 5)
        expect(called).toBe(false)
    })

    it('does not call setBase for non-finite value (no-op)', () => {
        let called = false
        const critter = makeObj({
            stats: {
                getBase: () => 5,
                setBase: () => { called = true },
                modifyBase: () => {},
            },
        })
        script.set_critter_base_stat_sfall(critter, 0, NaN)
        expect(called).toBe(false)
        script.set_critter_base_stat_sfall(critter, 0, Infinity)
        expect(called).toBe(false)
    })

    it('does not throw on non-game-object', () => {
        expect(() => script.set_critter_base_stat_sfall(0 as any, 0, 5)).not.toThrow()
    })

    it('does not throw on non-critter', () => {
        expect(() => script.set_critter_base_stat_sfall(makeObj({ type: 'item' }), 0, 5)).not.toThrow()
    })
})

// ===========================================================================
// Phase 76-K — sfall 0x8287: get_obj_weight_sfall
// ===========================================================================

describe('Phase 76-K — sfall 0x8287: get_obj_weight_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_obj_weight_sfall(0 as any)).toBe(0)
    })

    it('returns 0 for object with no weight data', () => {
        expect(script.get_obj_weight_sfall(makeObj())).toBe(0)
    })

    it('returns weight from pro.extra.weight', () => {
        const obj = makeObj({ pro: { extra: { weight: 5 } } })
        expect(script.get_obj_weight_sfall(obj)).toBe(5)
    })

    it('returns weight from direct weight property when pro not present', () => {
        const obj = makeObj({ weight: 12 })
        expect(script.get_obj_weight_sfall(obj)).toBe(12)
    })

    it('prefers pro.extra.weight over direct weight', () => {
        const obj = makeObj({ pro: { extra: { weight: 3 } }, weight: 99 })
        expect(script.get_obj_weight_sfall(obj)).toBe(3)
    })

    it('does not throw', () => {
        expect(() => script.get_obj_weight_sfall(makeObj())).not.toThrow()
        expect(() => script.get_obj_weight_sfall(0 as any)).not.toThrow()
    })
})

// ===========================================================================
// Phase 76-L — sfall method registration check (0x8282–0x8287)
// ===========================================================================

describe('Phase 76-L — sfall 0x8282–0x8287 scripting methods exist', () => {
    const phase76Methods = [
        'get_last_target_sfall',
        'get_last_attacker_sfall',
        'get_critter_level_sfall',
        'get_critter_current_xp_sfall',
        'set_critter_level_sfall',
        'get_critter_base_stat_sfall',
        'set_critter_base_stat_sfall',
        'get_obj_weight_sfall',
    ]

    for (const methodName of phase76Methods) {
        it(`script.${methodName} is a function`, () => {
            expect(typeof (script as any)[methodName]).toBe('function')
        })
    }
})

// ===========================================================================
// Phase 76-M — Checklist integrity
// ===========================================================================

describe('Phase 76-M — Checklist integrity', () => {
    const phase76Ids = [
        'BLK-117',
        'BLK-118',
        'BLK-119',
        'BLK-120',
        'sfall_get_critter_level',
        'sfall_get_critter_xp_82',
        'sfall_set_critter_level',
        'sfall_get_critter_base_stat_82',
        'sfall_set_critter_base_stat_82',
        'sfall_get_obj_weight',
    ]

    it('all Phase 76 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase76Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
