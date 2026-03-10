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
// B. BLK-186: get_critter_skill() missing getSkill() method guard
// ---------------------------------------------------------------------------

describe('Phase 92-B — BLK-186: get_critter_skill() missing getSkill method guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
    })

    it('returns 0 without throwing when critter has no getSkill method', () => {
        const protoOnlyNpc = makeCritterNoGetSkill()
        expect(protoOnlyNpc.getSkill).toBeUndefined()
        expect(() => script.get_critter_skill(protoOnlyNpc, 3 /* Unarmed */)).not.toThrow()
        expect(script.get_critter_skill(protoOnlyNpc, 3)).toBe(0)
    })

    it('returns skill value normally when critter has getSkill', () => {
        const npc = makeCritter()
        expect(typeof npc.getSkill).toBe('function')
        expect(script.get_critter_skill(npc, 3)).toBe(30)
    })

    it('returns 0 for a null object', () => {
        expect(() => script.get_critter_skill(NULL_OBJ, 3)).not.toThrow()
        expect(script.get_critter_skill(NULL_OBJ, 3)).toBe(0)
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
// F. sfall opcodes 0x82E8–0x82EF
// ---------------------------------------------------------------------------

describe('Phase 92-F — sfall opcodes 0x82E8–0x82EF', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
    })

    it('0x82E8 get_critter_level_sfall returns critter level', () => {
        const npc = makeCritter({ level: 5 })
        expect(script.get_critter_level_sfall(npc)).toBe(5)
    })

    it('0x82E8 get_critter_level_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_level_sfall(NULL_OBJ)).toBe(0)
    })

    it('0x82E9 set_critter_level_sfall sets level clamped to [1,99]', () => {
        const npc = makeCritter({ level: 3 })
        script.set_critter_level_sfall(npc, 10)
        expect(npc.level).toBe(10)
    })

    it('0x82E9 set_critter_level_sfall does not throw for non-critter', () => {
        expect(() => script.set_critter_level_sfall(NULL_OBJ, 5)).not.toThrow()
    })

    it('0x82EA get_critter_age_sfall returns 0 by default', () => {
        const npc = makeCritter()
        expect(script.get_critter_age_sfall(npc)).toBe(0)
    })

    it('0x82EA get_critter_age_sfall returns stored age', () => {
        const npc = makeCritter()
        ;(npc as any).age = 42
        expect(script.get_critter_age_sfall(npc)).toBe(42)
    })

    it('0x82EA get_critter_age_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_age_sfall(NULL_OBJ)).toBe(0)
    })

    it('0x82EB set_critter_age_sfall stores the value', () => {
        const npc = makeCritter()
        script.set_critter_age_sfall(npc, 25)
        expect((npc as any).age).toBe(25)
    })

    it('0x82EB set_critter_age_sfall coerces non-finite to 0', () => {
        const npc = makeCritter()
        script.set_critter_age_sfall(npc, NaN)
        expect((npc as any).age).toBe(0)
    })

    it('0x82EC get_critter_kill_type_sfall2 returns killType', () => {
        const npc = makeCritter({ killType: 3 })
        expect(script.get_critter_kill_type_sfall2(npc)).toBe(3)
    })

    it('0x82EC get_critter_kill_type_sfall2 returns 0 for non-critter', () => {
        expect(script.get_critter_kill_type_sfall2(NULL_OBJ)).toBe(0)
    })

    it('0x82ED set_critter_kill_type_sfall2 sets killType', () => {
        const npc = makeCritter({ killType: 1 })
        script.set_critter_kill_type_sfall2(npc, 7)
        expect((npc as any).killType).toBe(7)
    })

    it('0x82EE get_party_size_sfall returns 0 when no party', () => {
        globalState.gParty = null as any
        expect(script.get_party_size_sfall()).toBe(0)
    })

    it('0x82EE get_party_size_sfall returns party member count', () => {
        globalState.gParty = { getPartyMembers: () => [makeCritter(), makeCritter()] } as any
        expect(script.get_party_size_sfall()).toBe(2)
        globalState.gParty = null as any
    })

    it('0x82EF get_max_level_sfall always returns 99', () => {
        expect(script.get_max_level_sfall()).toBe(99)
    })
})

// ---------------------------------------------------------------------------
// G. Arroyo end-sequence integration smoke tests
// ---------------------------------------------------------------------------

describe('Phase 92-G — Arroyo end-sequence integration smoke tests', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
        globalState.gMap = null as any
    })

    /**
     * Simulate the end-of-arroyo kill-check sequence:
     *   1. kill_critter() on a valid rat (should set dead=true)
     *   2. kill_critter() on null (should not throw)
     *   3. tile_distance() with NaN tile (should return 9999)
     *   4. get_pc_stat(0) with null skills (should return 0)
     *   5. get_critter_skill() on proto-only NPC (should return 0)
     *   6. rm_mult_objs_from_inven() on no-inventory container (should return 0)
     *   7. sfall level/party queries
     */
    it('end-of-arroyo kill and reward sequence completes without throwing', () => {
        const rat = makeCritter({ level: 2, killType: 4 })
        const protoNpc = makeCritterNoGetSkill()
        const chest = makeContainerNoInventory()
        const item = makeCritter()

        globalState.player = {
            skills: null,
            level: 3,
            xp: 4500,
            getStat: () => 5,
        } as any
        globalState.gParty = null as any

        expect(() => {
            // 1. kill rat
            script.kill_critter(rat, 0)
            // 2. kill null — arroyo script passes 0 for "no target"
            script.kill_critter(NULL_OBJ, 0)
            // 3. tile distance with invalid tile
            const d = script.tile_distance(NaN, 100)
            expect(d).toBe(9999)
            // 4. get_pc_stat when skills missing
            expect(script.get_pc_stat(0)).toBe(0)
            // 5. skill query on proto-only NPC
            expect(script.get_critter_skill(protoNpc, 3)).toBe(0)
            // 6. rm from uninitialised container
            expect(script.rm_mult_objs_from_inven(chest, item, 2)).toBe(0)
            // 7. sfall level/party/max-level
            expect(script.get_critter_level_sfall(rat)).toBe(2)
            expect(script.get_party_size_sfall()).toBe(0)
            expect(script.get_max_level_sfall()).toBe(99)
        }).not.toThrow()

        expect(rat.dead).toBe(true)

        globalState.player = null as any
    })

    it('sfall age and kill-type round-trip', () => {
        const elder = makeCritter({ killType: 0 })
        script.set_critter_age_sfall(elder, 80)
        expect(script.get_critter_age_sfall(elder)).toBe(80)
        script.set_critter_kill_type_sfall2(elder, 5)
        expect(script.get_critter_kill_type_sfall2(elder)).toBe(5)
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
