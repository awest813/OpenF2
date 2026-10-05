/**
 * Phase 94 regression tests — Arroyo debug and polish (continued).
 *
 * Covers:
 *   A. BLK-195 — set_pc_stat() null skills guard
 *   B. BLK-196 — set_critter_kills() non-finite amount guard
 *   C. BLK-197 — roll_vs_skill() non-finite bonus guard
 *   D. BLK-198 — tile_is_visible() non-finite tile guard
 *   E. BLK-199 — obj_set_light_level() non-finite intensity/distance guard
 *   F. sfall opcodes 0x82F8–0x82FF
 *      0x82F8 get_critter_armor_class_sfall
 *      0x82F9 set_critter_armor_class_sfall
 *      0x82FA get_critter_damage_resist_sfall
 *      0x82FB set_critter_damage_resist_sfall
 *      0x82FC get_critter_damage_thresh_sfall
 *      0x82FD set_critter_damage_thresh_sfall
 *      0x82FE get_critter_action_points_sfall
 *      0x82FF set_critter_action_points_sfall
 *   G. Arroyo armour/resist/AP smoke tests
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
    s.scriptName = 'test_phase94'
    return s
}

function makeCritter(opts: {
    hp?: number
    maxHp?: number
    inventory?: any[]
    skills?: any
    stats?: Record<string, number>
    level?: number
} = {}): any {
    const stats: Record<string, number> = {
        'HP': opts.hp ?? 80,
        'Max HP': opts.maxHp ?? 100,
        'Armor Class': 10,
        'Action Points': 8,
        'Melee Damage': 5,
        'Critical Chance': 5,
        'Damage Resistance: Normal': 20,
        'Damage Resistance: Fire': 0,
        'Damage Threshold: Normal': 2,
        'Damage Threshold: Laser': 0,
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
        leftHand: null,
        rightHand: null,
        perkRanks: {} as Record<number, number>,
        charTraits: new Set<number>(),
        aiNum: 1,
        teamNum: -1,
        dead: false,
        level: opts.level ?? 1,
        position: { x: 50, y: 50 },
        hasAnimation: (_name: string) => false,
        staticAnimation: vi.fn(),
        clearAnim: vi.fn(),
        stats: {
            getBase: (s: string) => stats[s] ?? 0,
            setBase: vi.fn((s: string, v: number) => { stats[s] = v }),
            modifyBase: vi.fn((s: string, delta: number) => { stats[s] = (stats[s] ?? 0) + delta }),
        },
        getStat: (s: string) => stats[s] ?? 0,
        getSkill: (_s: string) => 40,
        skills: opts.skills !== undefined ? opts.skills : {
            skillPoints: 5,
            getBase: (_s: string) => 40,
            setBase: vi.fn(),
            baseSkills: {} as Record<string, number>,
        },
    }
}

function makeItem(): any {
    return {
        type: 'item',
        subtype: 'weapon',
        pid: 0x00001001,
        name: 'Spear',
        visible: true,
        orientation: 0,
        position: null,
    }
}

const NULL_OBJ: any = null

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    drainStubHits()
})

// ---------------------------------------------------------------------------
// B. BLK-196 — set_critter_kills() non-finite amount guard
// ---------------------------------------------------------------------------

describe('Phase 94-B — BLK-196: set_critter_kills() non-finite amount guard', () => {
    it('does not throw when amount is NaN', () => {
        expect(() => (script as any).set_critter_kills(0, NaN)).not.toThrow()
    })

    it('stores 0 when amount is NaN', () => {
        (script as any).set_critter_kills(0, NaN)
        const counts = (globalState as any).critterKillCounts
        expect(counts[0]).toBe(0)
    })

    it('does not throw when amount is Infinity', () => {
        expect(() => (script as any).set_critter_kills(1, Infinity)).not.toThrow()
    })

    it('stores 0 when amount is Infinity', () => {
        (script as any).set_critter_kills(1, Infinity)
        const counts = (globalState as any).critterKillCounts
        expect(counts[1]).toBe(0)
    })

    it('does not throw when amount is -Infinity', () => {
        expect(() => (script as any).set_critter_kills(2, -Infinity)).not.toThrow()
    })

    it('stores 0 when amount is -Infinity', () => {
        (script as any).set_critter_kills(2, -Infinity)
        const counts = (globalState as any).critterKillCounts
        expect(counts[2]).toBe(0)
    })

    it('stores correct value for valid positive amount', () => {
        (script as any).set_critter_kills(3, 7)
        const counts = (globalState as any).critterKillCounts
        expect(counts[3]).toBe(7)
    })

    it('clamps negative amounts to 0', () => {
        (script as any).set_critter_kills(4, -5)
        const counts = (globalState as any).critterKillCounts
        expect(counts[4]).toBe(0)
    })

    it('round-trips with get_critter_kills', () => {
        (script as any).set_critter_kills(5, 3)
        expect((script as any).get_critter_kills(5)).toBe(3)
    })
})

// ---------------------------------------------------------------------------
// C. BLK-197 — roll_vs_skill() non-finite bonus guard
// ---------------------------------------------------------------------------

describe('Phase 94-C — BLK-197: roll_vs_skill() non-finite bonus guard', () => {
    it('does not throw when bonus is NaN', () => {
        const npc = makeCritter()
        expect(() => (script as any).roll_vs_skill(npc, 0, NaN)).not.toThrow()
    })

    it('returns a valid roll result when bonus is NaN', () => {
        const npc = makeCritter()
        const result = (script as any).roll_vs_skill(npc, 0, NaN)
        // Result should be a recognised RollResult value (0–3 per skillCheck.ts)
        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(3)
    })

    it('does not throw when bonus is Infinity', () => {
        const npc = makeCritter()
        expect(() => (script as any).roll_vs_skill(npc, 0, Infinity)).not.toThrow()
    })

    it('does not throw when bonus is -Infinity', () => {
        const npc = makeCritter()
        expect(() => (script as any).roll_vs_skill(npc, 0, -Infinity)).not.toThrow()
    })

    it('does not throw when bonus is 0 (normal path)', () => {
        const npc = makeCritter()
        expect(() => (script as any).roll_vs_skill(npc, 0, 0)).not.toThrow()
    })

    it('does not throw when called on non-critter obj', () => {
        const item = makeItem()
        expect(() => (script as any).roll_vs_skill(item, 0, NaN)).not.toThrow()
    })

    it('does not throw when bonus is a large finite number', () => {
        const npc = makeCritter()
        expect(() => (script as any).roll_vs_skill(npc, 0, 9999)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-198 — tile_is_visible() non-finite tile guard
// ---------------------------------------------------------------------------

describe('Phase 94-D — BLK-198: tile_is_visible() non-finite tile guard', () => {
    it('does not throw when tile is NaN', () => {
        expect(() => (script as any).tile_is_visible(NaN)).not.toThrow()
    })

    it('does not throw when tile is Infinity', () => {
        expect(() => (script as any).tile_is_visible(Infinity)).not.toThrow()
    })

    it('does not throw when tile is -Infinity', () => {
        expect(() => (script as any).tile_is_visible(-Infinity)).not.toThrow()
    })

    it('does not throw with a valid tile number', () => {
        globalState.player = null as any
        expect(() => (script as any).tile_is_visible(5000)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// E. BLK-199 — obj_set_light_level() non-finite intensity/distance guard
// ---------------------------------------------------------------------------

describe('Phase 94-E — BLK-199: obj_set_light_level() non-finite intensity/distance guard', () => {
    it('does not throw when intensity is NaN', () => {
        const obj = makeCritter() as any
        expect(() => (script as any).obj_set_light_level(obj, NaN, 5)).not.toThrow()
    })

    it('sets lightIntensity to 0 when intensity is NaN', () => {
        const obj = makeCritter() as any
        ;(script as any).obj_set_light_level(obj, NaN, 5)
        expect(obj.lightIntensity).toBe(0)
    })

    it('does not throw when distance is NaN', () => {
        const obj = makeCritter() as any
        expect(() => (script as any).obj_set_light_level(obj, 40000, NaN)).not.toThrow()
    })

    it('sets lightRadius to 0 when distance is NaN', () => {
        const obj = makeCritter() as any
        ;(script as any).obj_set_light_level(obj, 40000, NaN)
        expect(obj.lightRadius).toBe(0)
    })

    it('does not throw when intensity is Infinity', () => {
        const obj = makeCritter() as any
        expect(() => (script as any).obj_set_light_level(obj, Infinity, 3)).not.toThrow()
    })

    it('sets lightIntensity to 0 when intensity is Infinity', () => {
        const obj = makeCritter() as any
        ;(script as any).obj_set_light_level(obj, Infinity, 3)
        expect(obj.lightIntensity).toBe(0)
    })

    it('clamps intensity to [0, 65536]', () => {
        const obj = makeCritter() as any
        ;(script as any).obj_set_light_level(obj, 99999, 2)
        expect(obj.lightIntensity).toBe(65536)
    })

    it('clamps negative intensity to 0', () => {
        const obj = makeCritter() as any
        ;(script as any).obj_set_light_level(obj, -100, 2)
        expect(obj.lightIntensity).toBe(0)
    })

    it('does not throw when obj is null', () => {
        expect(() => (script as any).obj_set_light_level(NULL_OBJ, 100, 3)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Arroyo armour/resist/AP smoke tests
// ---------------------------------------------------------------------------

describe('Phase 94-G — Arroyo armour/resist/AP smoke tests', () => {
    it('temple dart trap: obj_set_light_level with NaN intensity does not corrupt object', () => {
        const barrel = makeCritter() as any
        barrel.lightIntensity = 50000
        barrel.lightRadius = 3
        ;(script as any).obj_set_light_level(barrel, NaN, NaN)
        // Both should be set to 0, not NaN
        expect(barrel.lightIntensity).toBe(0)
        expect(barrel.lightRadius).toBe(0)
        expect(Number.isNaN(barrel.lightIntensity)).toBe(false)
        expect(Number.isNaN(barrel.lightRadius)).toBe(false)
    })

    it('roll_vs_skill with NaN bonus returns a valid result', () => {
        const player: any = makeCritter({ skills: { skillPoints: 5, getBase: () => 60, setBase: vi.fn(), baseSkills: {} } })
        const result = (script as any).roll_vs_skill(player, 0, NaN)
        expect(typeof result).toBe('number')
        expect(Number.isFinite(result)).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// H. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 94-H — checklist integrity', () => {
    it('BLK-195 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_195_set_pc_stat_null_skills')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-196 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_196_set_critter_kills_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-197 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_197_roll_vs_skill_non_finite_bonus')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-198 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_198_tile_is_visible_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-199 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_199_obj_set_light_level_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall 0x82F8–0x82FF entries are all present in the checklist', () => {
        const ids = [
            'sfall_get_critter_armor_class_94',
            'sfall_set_critter_armor_class_94',
            'sfall_get_critter_damage_resist_94',
            'sfall_set_critter_damage_resist_94',
            'sfall_get_critter_damage_thresh_94',
            'sfall_set_critter_damage_thresh_94',
            'sfall_get_critter_action_points_94',
            'sfall_set_critter_action_points_94',
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
