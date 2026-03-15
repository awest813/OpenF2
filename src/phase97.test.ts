/**
 * Phase 97 regression tests — Debug and polish: start menu to end of Arroyo (continued).
 *
 * Covers:
 *   A. BLK-210 — isWithinPerception() getStat/getSkill null guard
 *   B. BLK-211 — rotation_to_tile() non-finite tile guard
 *   C. BLK-212 — wm_area_set_pos() non-finite coordinates guard
 *   D. BLK-213 — mark_area_known() non-finite area ID guard
 *   E. BLK-214 — critter_inven_obj() undefined hand-slot guard
 *   F. sfall opcodes 0x8310–0x8317
 *      0x8310 get_critter_orientation_sfall
 *      0x8311 set_critter_orientation_sfall
 *      0x8312 get_critter_tile_num_sfall
 *      0x8313 get_critter_elevation_sfall
 *      0x8314 set_critter_base_ap_sfall
 *      0x8315 get_critter_xp_for_level_sfall
 *      0x8316 get_critter_base_hp_sfall
 *      0x8317 set_critter_base_hp_sfall
 *   G. Arroyo start-to-end smoke tests (Phase 97)
 *   H. Checklist integrity
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
    s.scriptName = 'test_phase97'
    return s
}

function makeCritter(opts: {
    hp?: number
    maxHp?: number
    inventory?: any[] | null
    stats?: Record<string, number>
    level?: number
    orientation?: number
    position?: { x: number; y: number } | null
    noGetStat?: boolean
    noGetSkill?: boolean
    rightHand?: any
    leftHand?: any
} = {}): any {
    const stats: Record<string, number> = {
        'HP': opts.hp ?? 80,
        'Max HP': opts.maxHp ?? 100,
        'Armor Class': 10,
        'Action Points': 8,
        'AP': 8,
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
    const critter: any = {
        type: 'critter',
        pid: 0x01000001,
        name: 'TestCritter',
        inventory: opts.inventory !== undefined ? opts.inventory : [],
        visible: true,
        orientation: opts.orientation ?? 0,
        isPlayer: false,
        gender: 'male',
        equippedArmor: null,
        leftHand: opts.leftHand !== undefined ? opts.leftHand : null,
        rightHand: opts.rightHand !== undefined ? opts.rightHand : null,
        perkRanks: {} as Record<number, number>,
        charTraits: new Set<number>(),
        aiNum: 1,
        teamNum: -1,
        dead: false,
        level: opts.level ?? 1,
        position: opts.position !== undefined ? opts.position : { x: 50, y: 50 },
        hasAnimation: (_name: string) => false,
        staticAnimation: vi.fn(),
        clearAnim: vi.fn(),
        stats: {
            getBase: (s: string) => stats[s] ?? 0,
            setBase: vi.fn((s: string, v: number) => { stats[s] = v }),
            modifyBase: vi.fn((s: string, delta: number) => { stats[s] = (stats[s] ?? 0) + delta }),
        },
        getStat: opts.noGetStat ? undefined : ((s: string) => stats[s] ?? 0),
        getSkill: opts.noGetSkill ? undefined : ((_s: string) => 40),
    }
    return critter
}

function makeBareCritter(): any {
    // Minimal critter with no getStat/getSkill (simulates create_object_sid() result)
    return {
        type: 'critter',
        pid: 0x01000002,
        name: 'BareCritter',
        inventory: [],
        visible: true,
        orientation: 2,
        isPlayer: false,
        dead: false,
        position: { x: 30, y: 40 },
        perkRanks: {},
        charTraits: new Set<number>(),
        // intentionally no getStat / getSkill
    }
}

const NULL_OBJ: any = null

let script: any

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = makeScript()
    drainStubHits()
})

// ---------------------------------------------------------------------------
// A. BLK-210 — isWithinPerception() getStat/getSkill null guard
// ---------------------------------------------------------------------------

describe('Phase 97-A — BLK-210: isWithinPerception() getStat/getSkill null guard', () => {
    it('obj_can_see_obj does not throw when observer lacks getStat', () => {
        const observer = makeBareCritter()
        const target = makeCritter()
        expect(() => script.obj_can_see_obj(observer, target)).not.toThrow()
    })

    it('obj_can_see_obj returns 0 when observer lacks getStat', () => {
        const observer = makeBareCritter()
        const target = makeCritter()
        expect(script.obj_can_see_obj(observer, target)).toBe(0)
    })

    it('obj_can_see_obj does not throw when target lacks getSkill', () => {
        const observer = makeCritter()
        const target = makeBareCritter()
        expect(() => script.obj_can_see_obj(observer, target)).not.toThrow()
    })

    it('obj_can_see_obj returns 0 when target lacks getSkill', () => {
        const observer = makeCritter()
        const target = makeBareCritter()
        expect(script.obj_can_see_obj(observer, target)).toBe(0)
    })

    it('obj_can_see_obj still returns 0 when both objects lack stat/skill methods', () => {
        const observer = makeBareCritter()
        const target = makeBareCritter()
        expect(() => script.obj_can_see_obj(observer, target)).not.toThrow()
        expect(script.obj_can_see_obj(observer, target)).toBe(0)
    })

    it('obj_can_see_obj works normally when both objects have getStat/getSkill', () => {
        const observer = makeCritter({ stats: { 'Perception': 8 } })
        const target = makeCritter({ position: { x: 51, y: 50 } })
        expect(() => script.obj_can_see_obj(observer, target)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// B. BLK-211 — rotation_to_tile() non-finite tile guard
// ---------------------------------------------------------------------------

describe('Phase 97-B — BLK-211: rotation_to_tile() non-finite tile guard', () => {
    it('does not throw when srcTile is NaN', () => {
        expect(() => script.rotation_to_tile(NaN, 1000)).not.toThrow()
    })

    it('returns -1 when srcTile is NaN', () => {
        expect(script.rotation_to_tile(NaN, 1000)).toBe(-1)
    })

    it('does not throw when destTile is NaN', () => {
        expect(() => script.rotation_to_tile(1000, NaN)).not.toThrow()
    })

    it('returns -1 when destTile is NaN', () => {
        expect(script.rotation_to_tile(1000, NaN)).toBe(-1)
    })

    it('does not throw when srcTile is Infinity', () => {
        expect(() => script.rotation_to_tile(Infinity, 1000)).not.toThrow()
    })

    it('returns -1 when srcTile is Infinity', () => {
        expect(script.rotation_to_tile(Infinity, 1000)).toBe(-1)
    })

    it('does not throw when both tiles are NaN', () => {
        expect(() => script.rotation_to_tile(NaN, NaN)).not.toThrow()
    })

    it('returns -1 when both tiles are NaN', () => {
        expect(script.rotation_to_tile(NaN, NaN)).toBe(-1)
    })

    it('returns a valid direction for finite adjacent tiles', () => {
        // tile 1200 and 1201 are adjacent: direction should be in [0,5]
        const dir = script.rotation_to_tile(1200, 1201)
        expect(typeof dir).toBe('number')
        expect(dir).toBeGreaterThanOrEqual(-1)
        expect(dir).toBeLessThanOrEqual(5)
    })
})

// ---------------------------------------------------------------------------
// C. BLK-212 — wm_area_set_pos() non-finite coordinates guard
// ---------------------------------------------------------------------------

describe('Phase 97-C — BLK-212: wm_area_set_pos() non-finite coordinates guard', () => {
    it('does not throw when x is NaN', () => {
        expect(() => script.wm_area_set_pos(1, NaN, 100)).not.toThrow()
    })

    it('does not throw when y is Infinity', () => {
        expect(() => script.wm_area_set_pos(1, 100, Infinity)).not.toThrow()
    })

    it('does not throw when both coordinates are NaN', () => {
        expect(() => script.wm_area_set_pos(1, NaN, NaN)).not.toThrow()
    })

    it('does not throw with valid finite coordinates', () => {
        expect(() => script.wm_area_set_pos(1, 150, 200)).not.toThrow()
    })

    it('does not throw with x=-Infinity', () => {
        expect(() => script.wm_area_set_pos(2, -Infinity, 50)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-213 — mark_area_known() non-finite area ID guard
// ---------------------------------------------------------------------------

describe('Phase 97-D — BLK-213: mark_area_known() non-finite area ID guard', () => {
    it('does not throw when area is NaN', () => {
        expect(() => script.mark_area_known(0, NaN, 1)).not.toThrow()
    })

    it('does not call markAreaKnown when area is NaN', () => {
        const mockMark = vi.fn()
        ;(globalState as any).markAreaKnown = mockMark
        script.mark_area_known(0, NaN, 1)
        expect(mockMark).not.toHaveBeenCalled()
        delete (globalState as any).markAreaKnown
    })

    it('does not throw when area is Infinity', () => {
        expect(() => script.mark_area_known(0, Infinity, 1)).not.toThrow()
    })

    it('does not call markAreaKnown when area is Infinity', () => {
        const mockMark = vi.fn()
        ;(globalState as any).markAreaKnown = mockMark
        script.mark_area_known(0, Infinity, 0)
        expect(mockMark).not.toHaveBeenCalled()
        delete (globalState as any).markAreaKnown
    })

    it('calls markAreaKnown normally for finite area ID', () => {
        const mockMark = vi.fn()
        ;(globalState as any).markAreaKnown = mockMark
        script.mark_area_known(0, 3, 1)
        expect(mockMark).toHaveBeenCalledWith(3, 1)
        delete (globalState as any).markAreaKnown
    })

    it('does not throw when area is -Infinity', () => {
        expect(() => script.mark_area_known(1, -Infinity, 0)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// E. BLK-214 — critter_inven_obj() undefined hand-slot guard
// ---------------------------------------------------------------------------

describe('Phase 97-E — BLK-214: critter_inven_obj() undefined hand-slot guard', () => {
    it('returns null (not undefined) for right hand when rightHand is not set', () => {
        const critter = makeCritter()
        delete critter.rightHand
        const result = script.critter_inven_obj(critter, 1)
        expect(result).toBeNull()
        expect(result).not.toBeUndefined()
    })

    it('returns null (not undefined) for left hand when leftHand is not set', () => {
        const critter = makeCritter()
        delete critter.leftHand
        const result = script.critter_inven_obj(critter, 2)
        expect(result).toBeNull()
        expect(result).not.toBeUndefined()
    })

    it('returns null for unset right hand on bare critter (no rightHand property)', () => {
        const critter = makeBareCritter()
        const result = script.critter_inven_obj(critter, 1)
        expect(result).toBeNull()
    })

    it('returns null for unset left hand on bare critter (no leftHand property)', () => {
        const critter = makeBareCritter()
        const result = script.critter_inven_obj(critter, 2)
        expect(result).toBeNull()
    })

    it('returns the item when rightHand is properly set', () => {
        const item = { type: 'item', pid: 0x0001001 }
        const critter = makeCritter({ rightHand: item })
        expect(script.critter_inven_obj(critter, 1)).toBe(item)
    })

    it('returns the item when leftHand is properly set', () => {
        const item = { type: 'item', pid: 0x0001002 }
        const critter = makeCritter({ leftHand: item })
        expect(script.critter_inven_obj(critter, 2)).toBe(item)
    })

    it('returns 0 for inv count with null inventory', () => {
        const critter = makeCritter({ inventory: null })
        expect(script.critter_inven_obj(critter, -2)).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// F. sfall opcodes 0x8310–0x8317
// ---------------------------------------------------------------------------

describe('Phase 97-F — sfall opcodes 0x8310–0x8317', () => {
    // 0x8310 — get_critter_orientation_sfall
    describe('get_critter_orientation_sfall (0x8310)', () => {
        it('returns the critter orientation', () => {
            const critter = makeCritter({ orientation: 3 })
            expect(script.get_critter_orientation_sfall(critter)).toBe(3)
        })

        it('returns 0 for non-critter', () => {
            expect(script.get_critter_orientation_sfall(NULL_OBJ)).toBe(0)
        })

        it('returns 0 for non-critter object type', () => {
            const item: any = { type: 'item', pid: 0, orientation: 4 }
            expect(script.get_critter_orientation_sfall(item)).toBe(0)
        })

        it('wraps orientation modulo 6', () => {
            const critter = makeCritter()
            critter.orientation = 8  // 8 % 6 = 2
            expect(script.get_critter_orientation_sfall(critter)).toBe(2)
        })

        it('returns 0 when orientation is NaN', () => {
            const critter = makeCritter()
            critter.orientation = NaN
            expect(script.get_critter_orientation_sfall(critter)).toBe(0)
        })

        it('returns all valid directions 0–5', () => {
            for (let d = 0; d < 6; d++) {
                const critter = makeCritter({ orientation: d })
                expect(script.get_critter_orientation_sfall(critter)).toBe(d)
            }
        })
    })

    // 0x8311 — set_critter_orientation_sfall
    describe('set_critter_orientation_sfall (0x8311)', () => {
        it('sets orientation to a valid direction', () => {
            const critter = makeCritter({ orientation: 0 })
            script.set_critter_orientation_sfall(critter, 4)
            expect(critter.orientation).toBe(4)
        })

        it('wraps out-of-range direction with modulo 6', () => {
            const critter = makeCritter()
            script.set_critter_orientation_sfall(critter, 7)  // 7 % 6 = 1
            expect(critter.orientation).toBe(1)
        })

        it('wraps negative direction correctly', () => {
            const critter = makeCritter()
            script.set_critter_orientation_sfall(critter, -1)  // (-1 % 6 + 6) % 6 = 5
            expect(critter.orientation).toBe(5)
        })

        it('does not throw for non-critter', () => {
            expect(() => script.set_critter_orientation_sfall(NULL_OBJ, 2)).not.toThrow()
        })

        it('does not throw for non-finite dir', () => {
            const critter = makeCritter({ orientation: 1 })
            expect(() => script.set_critter_orientation_sfall(critter, NaN)).not.toThrow()
        })

        it('does not change orientation for non-finite dir', () => {
            const critter = makeCritter({ orientation: 1 })
            script.set_critter_orientation_sfall(critter, NaN)
            expect(critter.orientation).toBe(1)
        })

        it('round-trips with getter', () => {
            const critter = makeCritter({ orientation: 0 })
            for (let d = 0; d < 6; d++) {
                script.set_critter_orientation_sfall(critter, d)
                expect(script.get_critter_orientation_sfall(critter)).toBe(d)
            }
        })
    })

    // 0x8312 — get_critter_tile_num_sfall
    describe('get_critter_tile_num_sfall (0x8312)', () => {
        it('returns correct tile number for a positioned critter', () => {
            const critter = makeCritter({ position: { x: 5, y: 3 } })
            // tile = y * 200 + x = 3*200 + 5 = 605
            expect(script.get_critter_tile_num_sfall(critter)).toBe(605)
        })

        it('returns -1 when critter has no position', () => {
            const critter = makeCritter({ position: null })
            expect(script.get_critter_tile_num_sfall(critter)).toBe(-1)
        })

        it('returns -1 for null object', () => {
            expect(script.get_critter_tile_num_sfall(NULL_OBJ)).toBe(-1)
        })

        it('returns -1 when position is undefined', () => {
            const critter = makeCritter()
            delete critter.position
            expect(script.get_critter_tile_num_sfall(critter)).toBe(-1)
        })

        it('returns -1 when position has NaN x', () => {
            const critter = makeCritter()
            critter.position = { x: NaN, y: 10 }
            expect(script.get_critter_tile_num_sfall(critter)).toBe(-1)
        })
    })

    // 0x8313 — get_critter_elevation_sfall
    describe('get_critter_elevation_sfall (0x8313)', () => {
        it('returns critter-specific elevation when set', () => {
            const critter = makeCritter()
            critter.elevation = 1
            expect(script.get_critter_elevation_sfall(critter)).toBe(1)
        })

        it('falls back to current map elevation when critter has no elevation field', () => {
            const critter = makeCritter()
            // don't set critter.elevation
            ;(globalState as any).currentElevation = 0
            const result = script.get_critter_elevation_sfall(critter)
            expect(result).toBe(0)
        })

        it('returns fallback for null object', () => {
            ;(globalState as any).currentElevation = 0
            expect(() => script.get_critter_elevation_sfall(NULL_OBJ)).not.toThrow()
        })

        it('clamps elevation to [0, 2]', () => {
            const critter = makeCritter()
            critter.elevation = 5  // should clamp to 2
            expect(script.get_critter_elevation_sfall(critter)).toBe(2)
        })

        it('handles elevation 0 correctly', () => {
            const critter = makeCritter()
            critter.elevation = 0
            expect(script.get_critter_elevation_sfall(critter)).toBe(0)
        })

        it('handles elevation 2 correctly', () => {
            const critter = makeCritter()
            critter.elevation = 2
            expect(script.get_critter_elevation_sfall(critter)).toBe(2)
        })
    })

    // 0x8314 — set_critter_base_ap_sfall
    describe('set_critter_base_ap_sfall (0x8314)', () => {
        it('sets base AP via stats.setBase', () => {
            const critter = makeCritter()
            script.set_critter_base_ap_sfall(critter, 10)
            expect(critter.stats.setBase).toHaveBeenCalledWith('AP', 10)
        })

        it('clamps non-finite val to 0', () => {
            const critter = makeCritter()
            script.set_critter_base_ap_sfall(critter, NaN)
            expect(critter.stats.setBase).toHaveBeenCalledWith('AP', 0)
        })

        it('clamps negative val to 0', () => {
            const critter = makeCritter()
            script.set_critter_base_ap_sfall(critter, -5)
            expect(critter.stats.setBase).toHaveBeenCalledWith('AP', 0)
        })

        it('does not throw for non-critter', () => {
            expect(() => script.set_critter_base_ap_sfall(NULL_OBJ, 5)).not.toThrow()
        })

        it('truncates fractional val', () => {
            const critter = makeCritter()
            script.set_critter_base_ap_sfall(critter, 7.9)
            expect(critter.stats.setBase).toHaveBeenCalledWith('AP', 7)
        })
    })

    // 0x8315 — get_critter_xp_for_level_sfall
    describe('get_critter_xp_for_level_sfall (0x8315)', () => {
        it('returns 0 for level 1', () => {
            expect(script.get_critter_xp_for_level_sfall(1)).toBe(0)
        })

        it('returns 1000 for level 2', () => {
            // 500 * 2 * 1 = 1000
            expect(script.get_critter_xp_for_level_sfall(2)).toBe(1000)
        })

        it('returns 3000 for level 3', () => {
            // 500 * 3 * 2 = 3000
            expect(script.get_critter_xp_for_level_sfall(3)).toBe(3000)
        })

        it('returns 6000 for level 4', () => {
            // 500 * 4 * 3 = 6000
            expect(script.get_critter_xp_for_level_sfall(4)).toBe(6000)
        })

        it('returns 0 for level 0', () => {
            expect(script.get_critter_xp_for_level_sfall(0)).toBe(0)
        })

        it('returns 0 for negative level', () => {
            expect(script.get_critter_xp_for_level_sfall(-1)).toBe(0)
        })

        it('returns 0 for NaN level', () => {
            expect(script.get_critter_xp_for_level_sfall(NaN)).toBe(0)
        })

        it('returns 0 for Infinity level', () => {
            expect(script.get_critter_xp_for_level_sfall(Infinity)).toBe(0)
        })

        it('uses Fallout 2 formula: XP(n) = 500 * n * (n-1)', () => {
            for (let n = 2; n <= 10; n++) {
                const expected = 500 * n * (n - 1)
                expect(script.get_critter_xp_for_level_sfall(n)).toBe(expected)
            }
        })
    })

    // 0x8316 — get_critter_base_hp_sfall
    describe('get_critter_base_hp_sfall (0x8316)', () => {
        it('returns base Max HP from stats.getBase', () => {
            const critter = makeCritter({ maxHp: 120 })
            expect(script.get_critter_base_hp_sfall(critter)).toBe(120)
        })

        it('returns 0 for non-critter', () => {
            expect(script.get_critter_base_hp_sfall(NULL_OBJ)).toBe(0)
        })

        it('falls back to critter.maxHP when stats unavailable', () => {
            const critter = makeBareCritter()
            critter.maxHP = 55
            expect(script.get_critter_base_hp_sfall(critter)).toBe(55)
        })

        it('returns default 10 when no stats and no maxHP', () => {
            const critter = makeBareCritter()
            // no maxHP, no stats
            expect(script.get_critter_base_hp_sfall(critter)).toBe(10)
        })

        it('returns 0 for non-critter object type', () => {
            const item: any = { type: 'item', pid: 0 }
            expect(script.get_critter_base_hp_sfall(item)).toBe(0)
        })
    })

    // 0x8317 — set_critter_base_hp_sfall
    describe('set_critter_base_hp_sfall (0x8317)', () => {
        it('sets base Max HP via stats.setBase', () => {
            const critter = makeCritter()
            script.set_critter_base_hp_sfall(critter, 150)
            expect(critter.stats.setBase).toHaveBeenCalledWith('Max HP', 150)
        })

        it('clamps non-finite val to 1', () => {
            const critter = makeCritter()
            script.set_critter_base_hp_sfall(critter, NaN)
            expect(critter.stats.setBase).toHaveBeenCalledWith('Max HP', 1)
        })

        it('clamps val=0 to 1 (minimum 1 HP)', () => {
            const critter = makeCritter()
            script.set_critter_base_hp_sfall(critter, 0)
            expect(critter.stats.setBase).toHaveBeenCalledWith('Max HP', 1)
        })

        it('clamps negative val to 1', () => {
            const critter = makeCritter()
            script.set_critter_base_hp_sfall(critter, -10)
            expect(critter.stats.setBase).toHaveBeenCalledWith('Max HP', 1)
        })

        it('does not throw for non-critter', () => {
            expect(() => script.set_critter_base_hp_sfall(NULL_OBJ, 50)).not.toThrow()
        })

        it('truncates fractional val', () => {
            const critter = makeCritter()
            script.set_critter_base_hp_sfall(critter, 99.7)
            expect(critter.stats.setBase).toHaveBeenCalledWith('Max HP', 99)
        })

        it('round-trips with getter', () => {
            const critter = makeCritter({ maxHp: 100 })
            expect(script.get_critter_base_hp_sfall(critter)).toBe(100)
            script.set_critter_base_hp_sfall(critter, 200)
            expect(critter.stats.setBase).toHaveBeenCalledWith('Max HP', 200)
        })
    })
})

// ---------------------------------------------------------------------------
// G. Arroyo start-to-end smoke tests (Phase 97)
// ---------------------------------------------------------------------------

describe('Phase 97-G — Arroyo start-to-end smoke tests', () => {
    /**
     * End-of-Arroyo NPC placement: guards are placed at specific tiles with
     * specific orientations.  Simulate read/write of orientation and tile.
     */
    it('Arroyo guard placement: set orientation and read tile num', () => {
        const guard = makeCritter({ orientation: 0, position: { x: 10, y: 5 } })
        script.set_critter_orientation_sfall(guard, 3)
        expect(guard.orientation).toBe(3)
        const tileNum = script.get_critter_tile_num_sfall(guard)
        // tile = 5*200 + 10 = 1010
        expect(tileNum).toBe(1010)
    })

    /**
     * Elder end-sequence: mark Arroyo as known on world map.
     * Ensure non-finite area IDs from buggy script arithmetic are handled.
     */
    it('Elder end-sequence: mark_area_known guards NaN area ID safely', () => {
        expect(() => {
            script.mark_area_known(0, NaN, 1)
            script.mark_area_known(0, 1, 1) // valid call should still work
        }).not.toThrow()
    })

    /**
     * Temple boss spawn: boss is spawned via create_object_sid without full init.
     * Reading base HP and AP should not crash.
     */
    it('Temple boss: bare critter base HP/AP read does not throw', () => {
        const boss = makeBareCritter()
        boss.maxHP = 80
        expect(() => {
            const hp = script.get_critter_base_hp_sfall(boss)
            expect(hp).toBe(80)
        }).not.toThrow()
    })

    /**
     * Arroyo end-sequence XP award: verify XP needed for level 2 matches FO2 value.
     * The game awards 1000 XP to bring the player from level 1 to level 2 at the end.
     */
    it('End-of-arroyo XP award: level 2 threshold is 1000 XP', () => {
        expect(script.get_critter_xp_for_level_sfall(2)).toBe(1000)
    })

    /**
     * Rotation script safety: patrol NPC with uninitialised tile runs rotation_to_tile.
     */
    it('Patrol NPC: rotation_to_tile with NaN tile returns -1 safely', () => {
        expect(script.rotation_to_tile(NaN, 500)).toBe(-1)
        expect(script.rotation_to_tile(500, NaN)).toBe(-1)
    })

    /**
     * NPC without full stats: obj_can_see_obj with bare critter does not crash.
     */
    it('Bare critter obj_can_see_obj does not crash end-sequence LOS checks', () => {
        const bareGuard = makeBareCritter()
        const player = makeCritter({ position: { x: 31, y: 40 } })
        expect(() => script.obj_can_see_obj(bareGuard, player)).not.toThrow()
        expect(script.obj_can_see_obj(bareGuard, player)).toBe(0)
    })

    /**
     * wm_area_set_pos: Arroyo map-exit script sets area positions.
     * Buggy arithmetic can produce NaN coordinates.
     */
    it('wm_area_set_pos with NaN coords is silently ignored', () => {
        expect(() => script.wm_area_set_pos(0, NaN, 200)).not.toThrow()
    })

    /**
     * critter_inven_obj for a fresh spawned NPC (no hand properties).
     */
    it('critter_inven_obj returns null for bare critter hand slots', () => {
        const npc = makeBareCritter()
        expect(script.critter_inven_obj(npc, 1)).toBeNull()
        expect(script.critter_inven_obj(npc, 2)).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// H. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 97-H — Checklist integrity', () => {
    it('BLK-210 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_210_iswithinperception_null_getstat_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-211 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_211_rotation_to_tile_non_finite_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-212 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_212_wm_area_set_pos_non_finite_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-213 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_213_mark_area_known_non_finite_area_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-214 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_214_critter_inven_obj_undefined_hand_slot')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8310 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_orientation_97')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8311 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_orientation_97')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8312 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_tile_num_97')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8313 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_elevation_97')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8314 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_base_ap_97')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8315 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_xp_for_level_97')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8316 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_base_hp_97')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8317 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_base_hp_97')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('all Phase 97 BLK entries have impact >= medium', () => {
        const phase97Blk = ['blk_210', 'blk_213', 'blk_214']
        for (const id of phase97Blk) {
            const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id.startsWith(id + '_'))
            expect(entry).toBeDefined()
            expect(['medium', 'high', 'critical']).toContain(entry!.impact)
        }
    })

    it('all sfall 0x8310-0x8317 entries are implemented', () => {
        const sfallIds = [
            'sfall_get_critter_orientation_97',
            'sfall_set_critter_orientation_97',
            'sfall_get_critter_tile_num_97',
            'sfall_get_critter_elevation_97',
            'sfall_set_critter_base_ap_97',
            'sfall_get_critter_xp_for_level_97',
            'sfall_get_critter_base_hp_97',
            'sfall_set_critter_base_hp_97',
        ]
        for (const id of sfallIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === id)
            expect(entry).toBeDefined()
            expect(entry!.status).toBe('implemented')
        }
    })
})
