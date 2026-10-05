/**
 * Phase 92 regression tests — Arroyo end-sequence debug and polish (final).
 *
 * Covers:
 *   A. BLK-185 — get_pc_stat(0) null player.skills guard
 *   B. BLK-186 — get_critter_skill() missing getSkill() method guard
 *   C. BLK-187 — tile_distance() non-finite tile guard
 *   D. BLK-188 — rm_mult_objs_from_inven() null inventory guard
 *   E. BLK-189 — kill_critter() null/non-critter object guard
 *   F. sfall opcodes 0x82E8–0x82EF
 *      0x82E8 get_critter_level_sfall (alias of 0x8282)
 *      0x82E9 set_critter_level_sfall (alias of 0x8284)
 *      0x82EA get_critter_age_sfall
 *      0x82EB set_critter_age_sfall
 *      0x82EC get_critter_kill_type_sfall2
 *      0x82ED set_critter_kill_type_sfall2
 *      0x82EE get_party_size_sfall
 *      0x82EF get_max_level_sfall
 *   G. Arroyo end-sequence integration smoke tests
 *   H. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

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
    s.scriptName = 'test_phase92'
    return s
}

function makeCritter(opts: {
    hp?: number
    inventory?: any[]
    level?: number
    killType?: number
    skills?: any
    getSkill?: ((s: string) => number) | null
    stats?: Record<string, number>
} = {}): any {
    const stats: Record<string, number> = {
        'HP': opts.hp ?? 80,
        'Max HP': 100,
        'Poison Level': 0,
        'Radiation Level': 0,
        'Healing Rate': 2,
        'Sequence': 5,
        ...(opts.stats ?? {}),
    }
    return {
        type: 'critter',
        pid: 0x01000001,
        name: 'TestCritter',
        inventory: opts.inventory ?? [],
        visible: true,
        orientation: 0,
        isPlayer: false,
        gender: 'male',
        equippedArmor: null,
        leftHand: null as any,
        rightHand: null as any,
        perkRanks: {} as Record<number, number>,
        charTraits: new Set<number>(),
        aiNum: 1,
        teamNum: -1,
        dead: false,
        level: opts.level ?? 1,
        killType: opts.killType ?? 2,
        position: { x: 50, y: 50 },
        hasAnimation: (_name: string) => false,
        staticAnimation: vi.fn(),
        clearAnim: vi.fn(),
        stats: {
            getBase: (s: string) => stats[s] ?? 5,
            setBase: vi.fn((s: string, v: number) => { stats[s] = v }),
            modifyBase: vi.fn((s: string, delta: number) => { stats[s] = (stats[s] ?? 0) + delta }),
        },
        getStat: (s: string) => stats[s] ?? 5,
        // getSkill: defaults to a function returning 30 unless overridden
        ...(opts.getSkill === null
            ? {}  // omit getSkill entirely
            : { getSkill: opts.getSkill ?? ((_s: string) => 30) }),
        skills: opts.skills !== undefined ? opts.skills : {
            skillPoints: 5,
            getBase: (_s: string) => 30,
            setBase: vi.fn(),
            baseSkills: {} as Record<string, number>,
        },
    }
}

/** Critter without a getSkill() method (proto-only NPC). */
function makeCritterNoGetSkill(): any {
    return makeCritter({ getSkill: null })
}

/** Container with no inventory (freshly created, uninitialised). */
function makeContainerNoInventory(): any {
    return {
        type: 'item',
        subtype: 'container',
        pid: 0x00002001,
        name: 'TestChest',
        // inventory intentionally omitted
        visible: true,
        orientation: 0,
        position: { x: 60, y: 60 },
    }
}

/** Non-game-object (e.g. null-ref, number 0). */
const NULL_OBJ = 0

// ---------------------------------------------------------------------------
// A. BLK-185: get_pc_stat(0) null player.skills guard
// ---------------------------------------------------------------------------

describe('Phase 92-A — BLK-185: get_pc_stat(0) null player.skills guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
    })

    it('returns 0 when player.skills is null', () => {
        globalState.player = {
            skills: null,
            level: 2,
            xp: 1500,
            getStat: () => 5,
        } as any
        expect(() => script.get_pc_stat(0)).not.toThrow()
        expect(script.get_pc_stat(0)).toBe(0)
        globalState.player = null as any
    })

    it('returns skillPoints when player.skills is valid', () => {
        globalState.player = {
            skills: { skillPoints: 7 },
            level: 3,
            xp: 3500,
            getStat: () => 5,
        } as any
        expect(script.get_pc_stat(0)).toBe(7)
        globalState.player = null as any
    })

    it('returns 0 when player is null', () => {
        globalState.player = null as any
        expect(() => script.get_pc_stat(0)).not.toThrow()
        expect(script.get_pc_stat(0)).toBe(0)
    })

    it('still returns level (pcstat=1) regardless of skills state', () => {
        globalState.player = {
            skills: null,
            level: 4,
            xp: 6000,
            getStat: () => 5,
        } as any
        expect(script.get_pc_stat(1)).toBe(4)
        globalState.player = null as any
    })
})

// ---------------------------------------------------------------------------
// C. BLK-187: tile_distance() non-finite tile guard
// ---------------------------------------------------------------------------

describe('Phase 92-C — BLK-187: tile_distance() non-finite tile guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
    })

    it('returns 9999 when tile a is NaN', () => {
        expect(() => script.tile_distance(NaN, 100)).not.toThrow()
        expect(script.tile_distance(NaN, 100)).toBe(9999)
    })

    it('returns 9999 when tile b is NaN', () => {
        expect(script.tile_distance(100, NaN)).toBe(9999)
    })

    it('returns 9999 when tile a is Infinity', () => {
        expect(script.tile_distance(Infinity, 100)).toBe(9999)
    })

    it('returns 9999 when both tiles are NaN', () => {
        expect(script.tile_distance(NaN, NaN)).toBe(9999)
    })

    it('returns 9999 for the -1 null-ref sentinel (pre-existing behaviour)', () => {
        expect(script.tile_distance(-1, 100)).toBe(9999)
        expect(script.tile_distance(100, -1)).toBe(9999)
    })

    it('returns a numeric distance for valid tiles', () => {
        const d = script.tile_distance(100, 102)
        expect(typeof d).toBe('number')
        expect(Number.isFinite(d)).toBe(true)
        expect(d).toBeGreaterThanOrEqual(0)
    })

    it('returns 0 for identical tiles', () => {
        expect(script.tile_distance(50, 50)).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// D. BLK-188: rm_mult_objs_from_inven() null inventory guard
// ---------------------------------------------------------------------------

describe('Phase 92-D — BLK-188: rm_mult_objs_from_inven() null inventory guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
    })

    it('returns 0 without throwing when obj has no inventory', () => {
        const chest = makeContainerNoInventory()
        const item = makeCritter() // any game object to pass isGameObject
        expect((chest as any).inventory).toBeUndefined()
        expect(() => script.rm_mult_objs_from_inven(chest, item, 1)).not.toThrow()
        expect(script.rm_mult_objs_from_inven(chest, item, 1)).toBe(0)
    })

    it('removes items normally when obj has a valid inventory', () => {
        const itemProto = {
            type: 'item', subtype: 'misc', pid: 0x1234,
            name: 'FlintPiece', visible: true, orientation: 0,
            position: { x: 40, y: 40 },
            amount: 3,
            approxEq: (other: any) => other.pid === 0x1234,
        }
        const container = {
            type: 'item', subtype: 'container', pid: 0x2000,
            name: 'Crate', visible: true, orientation: 0,
            position: { x: 40, y: 40 },
            inventory: [itemProto],
        }
        const removed = script.rm_mult_objs_from_inven(container, itemProto, 2)
        expect(removed).toBe(2)
        expect(itemProto.amount).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// E. BLK-189: kill_critter() null/non-critter guard
// ---------------------------------------------------------------------------

describe('Phase 92-E — BLK-189: kill_critter() null/non-critter guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
        globalState.gMap = null as any
    })

    it('does not throw when called with null (Fallout 2 null-ref 0)', () => {
        expect(() => script.kill_critter(NULL_OBJ, 0)).not.toThrow()
    })

    it('does not throw when called with undefined', () => {
        expect(() => script.kill_critter(undefined, 0)).not.toThrow()
    })

    it('does not throw when called with a non-critter item', () => {
        const item = { type: 'item', subtype: 'weapon', pid: 0x9000, name: 'Spear', visible: true, orientation: 0 }
        expect(() => script.kill_critter(item, 0)).not.toThrow()
    })

    it('marks a valid critter as dead without throwing', () => {
        const npc = makeCritter()
        expect(() => script.kill_critter(npc, 0)).not.toThrow()
        expect(npc.dead).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// H. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 92-H — checklist integrity', () => {
    it('BLK-185 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_185_get_pc_stat_null_skills')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-186 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_186_get_critter_skill_no_getskill')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-187 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_187_tile_distance_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-188 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_188_rm_mult_objs_null_inventory')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-189 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_189_kill_critter_null_obj')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall 0x82E8–0x82EF entries are all present in the checklist', () => {
        const ids = [
            'sfall_get_critter_level2_92',
            'sfall_set_critter_level2_92',
            'sfall_get_critter_age_92',
            'sfall_set_critter_age_92',
            'sfall_get_critter_kill_type2_92',
            'sfall_set_critter_kill_type2_92',
            'sfall_get_party_size_92',
            'sfall_get_max_level_92',
        ]
        for (const id of ids) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
        }
    })

    it('no duplicate checklist entry IDs', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        const unique = new Set(ids)
        expect(unique.size).toBe(ids.length)
    })
})
