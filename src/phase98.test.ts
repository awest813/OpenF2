/**
 * Phase 98 regression tests — sfall 0x8318–0x831F & BLK-215–219 guards.
 *
 * Covers:
 *   A. BLK-215 — tile_num_in_direction out-of-bounds / unplaced objects guard
 *   B. BLK-216 — critter_heal non-finite amount guard
 *   C. BLK-217 — item_caps_adjust non-finite adjustment guard
 *   D. BLK-218 — set_critter_stat invalid stat index guard
 *   E. BLK-219 — move_to non-finite coordinates guard
 *   F. sfall opcodes 0x8318–0x831F:
 *      0x8318 get_critter_current_ap_sfall
 *      0x8319 set_critter_current_ap_sfall
 *      0x831A get_critter_extra_stat_sfall
 *      0x831B set_critter_extra_stat_sfall
 *      0x831C get_critter_base_ac_sfall
 *      0x831D set_critter_base_ac_sfall
 *      0x831E get_critter_gender_sfall
 *      0x831F set_critter_gender_sfall
 *   G. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'

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

function makeScript(): any {
    const s = new (Scripting.Script as any)()
    s.scriptName = 'test_phase98'
    return s
}

function makeCritter(opts: {
    hp?: number
    maxHp?: number
    stats?: Record<string, number>
    gender?: string
    ac?: number
    ap?: number
} = {}): any {
    const stats: Record<string, number> = {
        'HP': opts.hp ?? 80,
        'Max HP': opts.maxHp ?? 100,
        'Armor Class': opts.ac ?? 10,
        'AC': opts.ac ?? 10,
        'Action Points': opts.ap ?? 8,
        'AP': opts.ap ?? 8,
        'Melee Damage': 5,
        'Critical Chance': 5,
        'Strength': 5,
        'Endurance': 5,
        'Perception': 6,
        'Luck': 5,
        'Agility': 7,
        'Charisma': 4,
        'INT': 8,
        ...(opts.stats ?? {}),
    }

    const mockStatsObj = {
        getBase: vi.fn((s: string) => stats[s] ?? 0),
        setBase: vi.fn((s: string, v: number) => { stats[s] = v }),
        modifyBase: vi.fn((s: string, delta: number) => { stats[s] = (stats[s] ?? 0) + delta }),
        get: vi.fn((s: string) => stats[s] ?? 0),
    }

    const critter: any = {
        type: 'critter',
        pid: 0x01000001,
        name: 'TestCritter',
        inventory: [] as any[],
        visible: true,
        orientation: 0,
        isPlayer: false,
        gender: opts.gender ?? 'male',
        equippedArmor: null,
        perkRanks: {} as Record<number, number>,
        charTraits: new Set<number>(),
        aiNum: 1,
        teamNum: -1,
        dead: false,
        position: { x: 50, y: 50 },
        stats: mockStatsObj,
        getStat: vi.fn((s: string) => {
            let baseVal = mockStatsObj.get(s)
            if (critter._extraStats && critter._extraStats[s] !== undefined) {
                baseVal += critter._extraStats[s]
            }
            return baseVal
        }),
        getSkill: (_s: string) => 40,
    }
    return critter
}

const NULL_OBJ: any = null
let script: any

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = makeScript()
    drainStubHits()
})

// ---------------------------------------------------------------------------
// A. BLK-215 — tile_num_in_direction out-of-bounds / unplaced objects guard
// ---------------------------------------------------------------------------

describe('Phase 98-A — BLK-215: tile_num_in_direction out-of-bounds / unplaced objects guard', () => {
    it('returns source tile when dir is NaN', () => {
        expect(script.tile_num_in_direction(1000, NaN, 2)).toBe(1000)
    })

    it('returns source tile when count is NaN', () => {
        expect(script.tile_num_in_direction(1000, 2, NaN)).toBe(1000)
    })

    it('returns source tile when tile is NaN', () => {
        expect(script.tile_num_in_direction(NaN, 2, 2)).toBe(0)
    })

    it('returns source tile when count is <= 0', () => {
        expect(script.tile_num_in_direction(1000, 2, 0)).toBe(1000)
        expect(script.tile_num_in_direction(1000, 2, -5)).toBe(1000)
    })
})

// ---------------------------------------------------------------------------
// B. BLK-216 — critter_heal non-finite amount guard
// ---------------------------------------------------------------------------

describe('Phase 98-B — BLK-216: critter_heal non-finite amount guard', () => {
    it('does not throw when amount is NaN', () => {
        const critter = makeCritter({ hp: 80, maxHp: 100 })
        expect(() => script.critter_heal(critter, NaN)).not.toThrow()
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('does not throw when amount is Infinity', () => {
        const critter = makeCritter({ hp: 80, maxHp: 100 })
        expect(() => script.critter_heal(critter, Infinity)).not.toThrow()
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// C. BLK-217 — item_caps_adjust non-finite adjustment guard
// ---------------------------------------------------------------------------

describe('Phase 98-C — BLK-217: item_caps_adjust non-finite adjustment guard', () => {
    it('does not throw when amount is NaN', () => {
        const critter = makeCritter()
        expect(() => script.item_caps_adjust(critter, NaN)).not.toThrow()
    })

    it('does not throw when amount is Infinity', () => {
        const critter = makeCritter()
        expect(() => script.item_caps_adjust(critter, Infinity)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-218 — set_critter_stat invalid stat index guard
// ---------------------------------------------------------------------------

describe('Phase 98-D — BLK-218: set_critter_stat invalid stat index guard', () => {
    it('does not throw when stat index is out of bounds', () => {
        const critter = makeCritter()
        expect(() => script.set_critter_stat(critter, 999, 10)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// E. BLK-219 — move_to non-finite coordinates guard
// ---------------------------------------------------------------------------

describe('Phase 98-E — BLK-219: move_to non-finite coordinates guard', () => {
    it('does not throw and is no-op when tileNum is NaN', () => {
        const critter = makeCritter()
        critter.position = { x: 5, y: 5 }
        expect(() => script.move_to(critter, NaN, 0)).not.toThrow()
        expect(critter.position.x).toBe(5)
    })

    it('does not throw and is no-op when tileNum is Infinity', () => {
        const critter = makeCritter()
        critter.position = { x: 5, y: 5 }
        expect(() => script.move_to(critter, Infinity, 0)).not.toThrow()
        expect(critter.position.x).toBe(5)
    })
})

// ---------------------------------------------------------------------------
// F. sfall opcodes 0x8318–0x831F
// ---------------------------------------------------------------------------

describe('Phase 98-F — sfall opcodes 0x8318–0x831F', () => {
    // 0x8318 / 0x8319 — get_critter_current_ap_sfall / set_critter_current_ap_sfall
    describe('AP getters/setters (0x8318, 0x8319)', () => {
        it('gets current AP', () => {
            const critter = makeCritter()
            critter.AP = { combat: 6, move: 2 }
            expect(script.get_critter_current_ap_sfall(critter)).toBe(6)
        })

        it('sets current AP', () => {
            const critter = makeCritter()
            critter.AP = { combat: 6, move: 2 }
            script.set_critter_current_ap_sfall(critter, 4)
            expect(critter.AP.combat).toBe(4)
        })

        it('returns 0 for non-critter getter/setter', () => {
            expect(script.get_critter_current_ap_sfall(NULL_OBJ)).toBe(0)
            expect(() => script.set_critter_current_ap_sfall(NULL_OBJ, 5)).not.toThrow()
        })
    })

    // 0x831A / 0x831B — get_critter_extra_stat_sfall / set_critter_extra_stat_sfall
    describe('derived stat modifiers (0x831A, 0x831B)', () => {
        it('gets 0 extra stat when unset', () => {
            const critter = makeCritter()
            expect(script.get_critter_extra_stat_sfall(critter, 7)).toBe(0) // STAT_max_hp = 7
        })

        it('sets and gets extra stat modifiers correctly', () => {
            const critter = makeCritter()
            script.set_critter_extra_stat_sfall(critter, 7, 15) // max hp +15
            expect(script.get_critter_extra_stat_sfall(critter, 7)).toBe(15)
        })

        it('integrates extra stat modifier into getStat()', () => {
            const critter = makeCritter({ maxHp: 100 })
            script.set_critter_extra_stat_sfall(critter, 7, 20) // STAT_max_hp = 7
            expect(critter.getStat('Max HP')).toBe(120)
        })

        it('returns 0 for non-critter', () => {
            expect(script.get_critter_extra_stat_sfall(NULL_OBJ, 7)).toBe(0)
            expect(() => script.set_critter_extra_stat_sfall(NULL_OBJ, 7, 5)).not.toThrow()
        })
    })

    // 0x831C / 0x831D — get_critter_base_ac_sfall / set_critter_base_ac_sfall
    describe('base AC modifiers (0x831C, 0x831D)', () => {
        it('gets base AC', () => {
            const critter = makeCritter({ ac: 15 })
            expect(script.get_critter_base_ac_sfall(critter)).toBe(15)
        })

        it('sets base AC', () => {
            const critter = makeCritter({ ac: 15 })
            script.set_critter_base_ac_sfall(critter, 22)
            expect(critter.stats.setBase).toHaveBeenCalledWith('AC', 22)
        })

        it('returns 0 for non-critter AC', () => {
            expect(script.get_critter_base_ac_sfall(NULL_OBJ)).toBe(0)
            expect(() => script.set_critter_base_ac_sfall(NULL_OBJ, 10)).not.toThrow()
        })
    })

    // 0x831E / 0x831F — get_critter_gender_sfall / set_critter_gender_sfall
    describe('gender modifiers (0x831E, 0x831F)', () => {
        it('gets gender (0=male, 1=female)', () => {
            const male = makeCritter({ gender: 'male' })
            const female = makeCritter({ gender: 'female' })
            expect(script.get_critter_gender_sfall(male)).toBe(0)
            expect(script.get_critter_gender_sfall(female)).toBe(1)
        })

        it('sets gender correctly', () => {
            const critter = makeCritter({ gender: 'male' })
            script.set_critter_gender_sfall(critter, 1)
            expect(critter.gender).toBe('female')
            script.set_critter_gender_sfall(critter, 0)
            expect(critter.gender).toBe('male')
        })

        it('returns 0 for non-critter gender', () => {
            expect(script.get_critter_gender_sfall(NULL_OBJ)).toBe(0)
            expect(() => script.set_critter_gender_sfall(NULL_OBJ, 1)).not.toThrow()
        })
    })
})

// ---------------------------------------------------------------------------
// G. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 98-G — Checklist integrity', () => {
    const items = [
        'blk_215_tile_num_in_direction_bounds_guard',
        'blk_216_critter_heal_non_finite_amount_guard',
        'blk_217_item_caps_adjust_non_finite_guard',
        'blk_218_set_critter_stat_invalid_index_guard',
        'blk_219_move_to_non_finite_coords_guard',
        'sfall_get_critter_current_ap_98',
        'sfall_set_critter_current_ap_98',
        'sfall_get_critter_extra_stat_98',
        'sfall_set_critter_extra_stat_98',
        'sfall_get_critter_base_ac_98',
        'sfall_set_critter_base_ac_98',
        'sfall_get_critter_gender_98',
        'sfall_set_critter_gender_98',
    ]

    items.forEach(id => {
        it(`${id} is registered and marked implemented`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === id)
            expect(entry).toBeDefined()
            expect(entry!.status).toBe('implemented')
        })
    })
})
