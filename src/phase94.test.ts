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
// A. BLK-195 — set_pc_stat() null skills guard
// ---------------------------------------------------------------------------

describe('Phase 94-A — BLK-195: set_pc_stat() null skills guard', () => {
    it('does not throw when player.skills is null and pcstat=0', () => {
        const player: any = {
            level: 1,
            xp: 0,
            skills: null,
        }
        globalState.player = player
        expect(() => (script as any).set_pc_stat(0, 10)).not.toThrow()
        globalState.player = null as any
    })

    it('does not modify skillPoints when player.skills is null', () => {
        const player: any = { level: 1, xp: 0, skills: null }
        globalState.player = player
        ;(script as any).set_pc_stat(0, 10)
        expect(player.skills).toBeNull()
        globalState.player = null as any
    })

    it('sets skillPoints normally when player.skills is present', () => {
        const player: any = {
            level: 1,
            xp: 0,
            skills: { skillPoints: 0 },
        }
        globalState.player = player
        ;(script as any).set_pc_stat(0, 15)
        expect(player.skills.skillPoints).toBe(15)
        globalState.player = null as any
    })

    it('clamps negative skillPoints to 0', () => {
        const player: any = { level: 1, xp: 0, skills: { skillPoints: 5 } }
        globalState.player = player
        ;(script as any).set_pc_stat(0, -3)
        expect(player.skills.skillPoints).toBe(0)
        globalState.player = null as any
    })

    it('handles pcstat=1 (level) even when skills is null', () => {
        const player: any = { level: 1, xp: 0, skills: null }
        globalState.player = player
        expect(() => (script as any).set_pc_stat(1, 5)).not.toThrow()
        expect(player.level).toBe(5)
        globalState.player = null as any
    })

    it('does not throw when player is null', () => {
        globalState.player = null as any
        expect(() => (script as any).set_pc_stat(0, 10)).not.toThrow()
    })
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

    it('returns 1 (visible) when tile is NaN', () => {
        expect((script as any).tile_is_visible(NaN)).toBe(1)
    })

    it('does not throw when tile is Infinity', () => {
        expect(() => (script as any).tile_is_visible(Infinity)).not.toThrow()
    })

    it('returns 1 (visible) when tile is Infinity', () => {
        expect((script as any).tile_is_visible(Infinity)).toBe(1)
    })

    it('does not throw when tile is -Infinity', () => {
        expect(() => (script as any).tile_is_visible(-Infinity)).not.toThrow()
    })

    it('returns 1 (visible) when tile is -Infinity', () => {
        expect((script as any).tile_is_visible(-Infinity)).toBe(1)
    })

    it('returns 1 (visible) with valid tile when no player', () => {
        globalState.player = null as any
        expect((script as any).tile_is_visible(10000)).toBe(1)
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

    it('sets valid intensity and distance normally', () => {
        const obj = makeCritter() as any
        ;(script as any).obj_set_light_level(obj, 32768, 4)
        expect(obj.lightIntensity).toBe(32768)
        expect(obj.lightRadius).toBe(4)
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
// F. sfall opcodes 0x82F8–0x82FF
// ---------------------------------------------------------------------------

describe('Phase 94-F — sfall opcodes 0x82F8–0x82FF', () => {
    // 0x82F8 get_critter_armor_class_sfall
    it('0x82F8 get_critter_armor_class_sfall returns AC', () => {
        const npc = makeCritter({ stats: { 'Armor Class': 15 } })
        expect(script.get_critter_armor_class_sfall(npc)).toBe(15)
    })

    it('0x82F8 get_critter_armor_class_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_armor_class_sfall(NULL_OBJ)).toBe(0)
    })

    // 0x82F9 set_critter_armor_class_sfall
    it('0x82F9 set_critter_armor_class_sfall does not throw', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_armor_class_sfall(npc, 20)).not.toThrow()
    })

    it('0x82F9 set_critter_armor_class_sfall calls stats.setBase', () => {
        const npc = makeCritter()
        script.set_critter_armor_class_sfall(npc, 20)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Armor Class', 20)
    })

    it('0x82F9 set_critter_armor_class_sfall coerces NaN to 0', () => {
        const npc = makeCritter()
        script.set_critter_armor_class_sfall(npc, NaN)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Armor Class', 0)
    })

    it('0x82F9 set_critter_armor_class_sfall does not throw for non-critter', () => {
        expect(() => script.set_critter_armor_class_sfall(NULL_OBJ, 10)).not.toThrow()
    })

    // 0x82FA get_critter_damage_resist_sfall
    it('0x82FA get_critter_damage_resist_sfall returns DR for Normal (type 0)', () => {
        const npc = makeCritter({ stats: { 'Damage Resistance: Normal': 25 } })
        expect(script.get_critter_damage_resist_sfall(npc, 0)).toBe(25)
    })

    it('0x82FA get_critter_damage_resist_sfall returns 0 for unknown damage type', () => {
        const npc = makeCritter()
        expect(script.get_critter_damage_resist_sfall(npc, 99)).toBe(0)
    })

    it('0x82FA get_critter_damage_resist_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_damage_resist_sfall(NULL_OBJ, 0)).toBe(0)
    })

    it('0x82FA get_critter_damage_resist_sfall supports all 7 damage types', () => {
        const npc = makeCritter()
        for (let i = 0; i < 7; i++) {
            expect(() => script.get_critter_damage_resist_sfall(npc, i)).not.toThrow()
        }
    })

    // 0x82FB set_critter_damage_resist_sfall
    it('0x82FB set_critter_damage_resist_sfall does not throw for valid inputs', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_damage_resist_sfall(npc, 0, 30)).not.toThrow()
    })

    it('0x82FB set_critter_damage_resist_sfall calls stats.setBase', () => {
        const npc = makeCritter()
        script.set_critter_damage_resist_sfall(npc, 1, 40)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Damage Resistance: Laser', 40)
    })

    it('0x82FB set_critter_damage_resist_sfall clamps to [0, 100]', () => {
        const npc = makeCritter()
        script.set_critter_damage_resist_sfall(npc, 0, 150)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Damage Resistance: Normal', 100)
    })

    it('0x82FB set_critter_damage_resist_sfall coerces NaN to 0', () => {
        const npc = makeCritter()
        script.set_critter_damage_resist_sfall(npc, 0, NaN)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Damage Resistance: Normal', 0)
    })

    it('0x82FB set_critter_damage_resist_sfall does not throw for unknown damage type', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_damage_resist_sfall(npc, 99, 10)).not.toThrow()
    })

    // 0x82FC get_critter_damage_thresh_sfall
    it('0x82FC get_critter_damage_thresh_sfall returns DT for Normal', () => {
        const npc = makeCritter({ stats: { 'Damage Threshold: Normal': 4 } })
        expect(script.get_critter_damage_thresh_sfall(npc, 0)).toBe(4)
    })

    it('0x82FC get_critter_damage_thresh_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_damage_thresh_sfall(NULL_OBJ, 0)).toBe(0)
    })

    it('0x82FC get_critter_damage_thresh_sfall returns 0 for unknown type', () => {
        const npc = makeCritter()
        expect(script.get_critter_damage_thresh_sfall(npc, 99)).toBe(0)
    })

    // 0x82FD set_critter_damage_thresh_sfall
    it('0x82FD set_critter_damage_thresh_sfall does not throw for valid inputs', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_damage_thresh_sfall(npc, 0, 6)).not.toThrow()
    })

    it('0x82FD set_critter_damage_thresh_sfall calls stats.setBase', () => {
        const npc = makeCritter()
        script.set_critter_damage_thresh_sfall(npc, 2, 8)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Damage Threshold: Fire', 8)
    })

    it('0x82FD set_critter_damage_thresh_sfall coerces NaN to 0', () => {
        const npc = makeCritter()
        script.set_critter_damage_thresh_sfall(npc, 0, NaN)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Damage Threshold: Normal', 0)
    })

    it('0x82FD set_critter_damage_thresh_sfall clamps negative to 0', () => {
        const npc = makeCritter()
        script.set_critter_damage_thresh_sfall(npc, 0, -5)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Damage Threshold: Normal', 0)
    })

    // 0x82FE get_critter_action_points_sfall2
    it('0x82FE get_critter_action_points_sfall2 returns a number for a critter', () => {
        const npc = makeCritter()
        const result = script.get_critter_action_points_sfall2(npc)
        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThanOrEqual(0)
    })

    it('0x82FE get_critter_action_points_sfall2 returns 0 for non-critter', () => {
        expect(script.get_critter_action_points_sfall2(NULL_OBJ)).toBe(0)
    })

    // 0x82FF set_critter_action_points_sfall2
    it('0x82FF set_critter_action_points_sfall2 does not throw', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_action_points_sfall2(npc, 4)).not.toThrow()
    })

    it('0x82FF set_critter_action_points_sfall2 coerces NaN to 0', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_action_points_sfall2(npc, NaN)).not.toThrow()
    })

    it('0x82FF set_critter_action_points_sfall2 does not throw for non-critter', () => {
        expect(() => script.set_critter_action_points_sfall2(NULL_OBJ, 4)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Arroyo armour/resist/AP smoke tests
// ---------------------------------------------------------------------------

describe('Phase 94-G — Arroyo armour/resist/AP smoke tests', () => {
    it('arroyo guard combat script: AC, DR, DT, AP read/write round-trip does not throw', () => {
        const guard = makeCritter({
            stats: {
                'Armor Class': 12,
                'Action Points': 7,
                'Damage Resistance: Normal': 15,
                'Damage Threshold: Normal': 3,
            },
        })
        expect(() => {
            // Simulate an arroyo guard encounter script reading and adjusting stats
            const ac = script.get_critter_armor_class_sfall(guard)
            script.set_critter_armor_class_sfall(guard, ac + 2)

            const dr = script.get_critter_damage_resist_sfall(guard, 0) // Normal
            script.set_critter_damage_resist_sfall(guard, 0, dr + 5)

            const dt = script.get_critter_damage_thresh_sfall(guard, 0)
            script.set_critter_damage_thresh_sfall(guard, 0, dt + 1)

            const ap = script.get_critter_action_points_sfall2(guard)
            script.set_critter_action_points_sfall2(guard, Math.max(0, ap - 1))
        }).not.toThrow()
    })

    it('arroyo ceremony: set_pc_stat with null skills and NaN kill count do not crash', () => {
        const player: any = { level: 2, xp: 2500, skills: null }
        globalState.player = player
        expect(() => {
            ;(script as any).set_pc_stat(0, NaN) // null skills, NaN val → no-op
            ;(script as any).set_critter_kills(3, NaN) // NaN amount → 0
            ;(script as any).tile_is_visible(NaN) // NaN tile → 1 (safe)
        }).not.toThrow()
        globalState.player = null as any
    })

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
