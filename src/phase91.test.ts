/**
 * Phase 91 regression tests — Arroyo end-sequence debug and polish (continued).
 *
 * Covers:
 *   A. BLK-180 — use_obj() missing use() method guard
 *   B. BLK-181 — reg_anim_animate_forever() missing singleAnimation() guard
 *   C. BLK-182 — animate_move_obj_to_tile() missing walkTo() guard
 *   D. BLK-183 — critter_mod_skill() null skills guard
 *   E. BLK-184 — set_critter_skill_points() null skills guard
 *   F. sfall opcodes 0x82E0–0x82E7
 *      0x82E0 get_critter_poison_sfall
 *      0x82E1 set_critter_poison_sfall
 *      0x82E2 get_critter_radiation_sfall
 *      0x82E3 set_critter_radiation_sfall
 *      0x82E4 get_critter_heal_rate_sfall
 *      0x82E5 set_critter_heal_rate_sfall
 *      0x82E6 get_critter_sequence_sfall
 *      0x82E7 set_critter_sequence_sfall
 *   G. Arroyo end-sequence integration smoke tests
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

function makeCritter(opts: {
    hp?: number
    inventory?: any[]
    stats?: Record<string, number>
    isPlayer?: boolean
    skills?: any
    position?: { x: number; y: number } | null
} = {}) {
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
        isPlayer: opts.isPlayer ?? false,
        gender: 'male',
        equippedArmor: null,
        leftHand: null as any,
        rightHand: null as any,
        perkRanks: {} as Record<number, number>,
        charTraits: new Set<number>(),
        aiNum: 1,
        teamNum: -1,
        dead: false,
        position: opts.position !== undefined ? opts.position : { x: 50, y: 50 },
        hasAnimation: (_name: string) => false,
        staticAnimation: vi.fn(),
        clearAnim: vi.fn(),
        stats: {
            getBase: (s: string) => stats[s] ?? 5,
            setBase: vi.fn((s: string, v: number) => { stats[s] = v }),
            modifyBase: vi.fn((s: string, delta: number) => { stats[s] = (stats[s] ?? 0) + delta }),
        },
        getStat: (s: string) => stats[s] ?? 5,
        getSkill: (_s: string) => 30,
        skills: opts.skills !== undefined ? opts.skills : {
            skillPoints: 0,
            getBase: (_s: string) => 30,
            setBase: vi.fn(),
            baseSkills: {} as Record<string, number>,
        },
    }
}

/** Critter with null skills (partially initialised NPC). */
function makeCritterNullSkills(): any {
    return makeCritter({ skills: null })
}

/** A misc item with no use() method — simulates an exit-grid placeholder object. */
function makeMiscItemNoUse(): any {
    return {
        type: 'item',
        subtype: 'misc',
        pid: 0x00003000,
        name: 'ExitTrigger',
        inventory: [],
        visible: true,
        orientation: 0,
        position: { x: 90, y: 95 },
    }
}

/** A misc item with a use() method — simulates a useable misc item. */
function makeMiscItemWithUse(): any {
    const used: any[] = []
    return {
        type: 'item',
        subtype: 'misc',
        pid: 0x00003001,
        name: 'PipBoy',
        inventory: [],
        visible: true,
        orientation: 0,
        position: { x: 92, y: 95 },
        use: vi.fn((source: any) => { used.push(source); return true }),
        _used: used,
    }
}

/** An NPC with no singleAnimation method — simulates a freshly-created critter. */
function makeCritterNoSingleAnimation(): any {
    const c = makeCritter()
    delete (c as any).singleAnimation
    return c
}

/** An NPC with singleAnimation method. */
function makeCritterWithSingleAnimation(): any {
    const calls: any[][] = []
    const c = makeCritter()
    ;(c as any).singleAnimation = vi.fn((loop: boolean, cb: any) => {
        calls.push([loop, cb])
        if (cb) { try { cb() } catch (_) {} }
    })
    ;(c as any)._animCalls = calls
    return c
}

/** A misc item with no walkTo method — simulates a non-walking object. */
function makeMiscItemNoWalkTo(): any {
    return {
        type: 'item',
        subtype: 'misc',
        pid: 0x00003002,
        name: 'Waypoint',
        inventory: [],
        visible: true,
        orientation: 0,
        position: { x: 85, y: 90 },
    }
}

/** A critter with walkTo method — simulates a moveable NPC. */
function makeCritterWithWalkTo(): any {
    const c = makeCritter()
    const paths: any[][] = []
    ;(c as any).walkTo = vi.fn((tile: any, run: boolean) => {
        paths.push([tile, run])
        return true
    })
    ;(c as any)._paths = paths
    return c
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    drainStubHits()
})

// ---------------------------------------------------------------------------
// A. BLK-180 — use_obj() missing use() method guard
// ---------------------------------------------------------------------------

describe('Phase 91-A — BLK-180: use_obj() missing use() method guard', () => {
    it('does not throw when obj has no use() method', () => {
        const item = makeMiscItemNoUse()
        expect(() => script.use_obj(item as any)).not.toThrow()
    })

    it('does not throw when obj is an exit-grid-style misc item', () => {
        const grid = makeMiscItemNoUse()
        expect(() => script.use_obj(grid as any)).not.toThrow()
    })

    it('calls use() normally when the method is present', () => {
        const item = makeMiscItemWithUse()
        expect(() => script.use_obj(item as any)).not.toThrow()
        expect(item.use).toHaveBeenCalled()
    })

    it('does not throw when obj is null', () => {
        expect(() => script.use_obj(null as any)).not.toThrow()
    })

    it('does not throw when obj is undefined', () => {
        expect(() => script.use_obj(undefined as any)).not.toThrow()
    })

    it('does not throw when called multiple times on non-use objects', () => {
        const item = makeMiscItemNoUse()
        expect(() => {
            script.use_obj(item as any)
            script.use_obj(item as any)
        }).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// B. BLK-181 — reg_anim_animate_forever() missing singleAnimation() guard
// ---------------------------------------------------------------------------

describe('Phase 91-B — BLK-181: reg_anim_animate_forever() singleAnimation guard', () => {
    it('does not throw when obj has no singleAnimation() method', () => {
        const npc = makeCritterNoSingleAnimation()
        expect(() => script.reg_anim_animate_forever(npc as any, 0)).not.toThrow()
    })

    it('does not throw when obj has no singleAnimation() for anim=1', () => {
        const npc = makeCritterNoSingleAnimation()
        expect(() => script.reg_anim_animate_forever(npc as any, 1)).not.toThrow()
    })

    it('does not throw when obj is null', () => {
        expect(() => script.reg_anim_animate_forever(null as any, 0)).not.toThrow()
    })

    it('calls singleAnimation normally when the method is present', () => {
        const npc = makeCritterWithSingleAnimation()
        expect(() => script.reg_anim_animate_forever(npc as any, 0)).not.toThrow()
        expect((npc as any).singleAnimation).toHaveBeenCalled()
    })

    it('does not throw when called on non-critter game object without singleAnimation', () => {
        const item = makeMiscItemNoUse()
        expect(() => script.reg_anim_animate_forever(item as any, 0)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// C. BLK-182 — animate_move_obj_to_tile() missing walkTo() guard
// ---------------------------------------------------------------------------

describe('Phase 91-C — BLK-182: animate_move_obj_to_tile() walkTo guard', () => {
    it('does not throw when obj has no walkTo() method', () => {
        const item = makeMiscItemNoWalkTo()
        expect(() => script.animate_move_obj_to_tile(item as any, 14000, 0)).not.toThrow()
    })

    it('does not throw when obj is null', () => {
        expect(() => script.animate_move_obj_to_tile(null as any, 14000, 0)).not.toThrow()
    })

    it('does not throw with invalid tile number', () => {
        const item = makeMiscItemNoWalkTo()
        expect(() => script.animate_move_obj_to_tile(item as any, NaN, 0)).not.toThrow()
    })

    it('calls walkTo normally when the method is present', () => {
        const npc = makeCritterWithWalkTo()
        expect(() => script.animate_move_obj_to_tile(npc as any, 14000, 0)).not.toThrow()
        expect((npc as any).walkTo).toHaveBeenCalled()
    })

    it('does not throw with isRun=1 when walkTo is absent', () => {
        const item = makeMiscItemNoWalkTo()
        expect(() => script.animate_move_obj_to_tile(item as any, 14000, 1)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-183 — critter_mod_skill() null skills guard
// ---------------------------------------------------------------------------

describe('Phase 91-D — BLK-183: critter_mod_skill() null skills guard', () => {
    it('does not throw when critter.skills is null', () => {
        const npc = makeCritterNullSkills()
        expect(() => script.critter_mod_skill(npc as any, 3 /* SKILL_UNARMED */, 5)).not.toThrow()
    })

    it('does not throw when critter.skills is undefined', () => {
        const npc = makeCritter()
        delete (npc as any).skills
        expect(() => script.critter_mod_skill(npc as any, 3, 5)).not.toThrow()
    })

    it('returns 0 when critter.skills is null', () => {
        const npc = makeCritterNullSkills()
        expect(script.critter_mod_skill(npc as any, 3, 10)).toBe(0)
    })

    it('applies skill modification normally when skills is present', () => {
        const baseSkills: Record<string, number> = {}
        const npc = makeCritter({
            skills: {
                skillPoints: 0,
                getBase: (s: string) => baseSkills[s] ?? 30,
                setBase: vi.fn((s: string, v: number) => { baseSkills[s] = v }),
                baseSkills,
            },
        })
        script.critter_mod_skill(npc as any, 3 /* SKILL_UNARMED */, 10)
        expect(npc.skills.setBase).toHaveBeenCalled()
    })

    it('does not throw with non-finite amount when skills is null', () => {
        const npc = makeCritterNullSkills()
        expect(() => script.critter_mod_skill(npc as any, 3, NaN)).not.toThrow()
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001001, name: 'Spear' }
        expect(() => script.critter_mod_skill(item, 3, 5)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// E. BLK-184 — set_critter_skill_points() null skills guard
// ---------------------------------------------------------------------------

describe('Phase 91-E — BLK-184: set_critter_skill_points() null skills guard', () => {
    it('does not throw when critter.skills is null', () => {
        const npc = makeCritterNullSkills()
        expect(() => script.set_critter_skill_points(npc as any, 3, 25)).not.toThrow()
    })

    it('does not throw when critter.skills is undefined', () => {
        const npc = makeCritter()
        delete (npc as any).skills
        expect(() => script.set_critter_skill_points(npc as any, 3, 25)).not.toThrow()
    })

    it('sets skill normally when skills is present', () => {
        const setBase = vi.fn()
        const npc = makeCritter({
            skills: {
                skillPoints: 0,
                getBase: (_s: string) => 30,
                setBase,
                baseSkills: {},
            },
        })
        script.set_critter_skill_points(npc as any, 3, 50)
        expect(setBase).toHaveBeenCalledWith(expect.any(String), 50)
    })

    it('does not throw with non-finite value when skills is null', () => {
        const npc = makeCritterNullSkills()
        expect(() => script.set_critter_skill_points(npc as any, 3, Infinity)).not.toThrow()
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001002, name: 'Knife' }
        expect(() => script.set_critter_skill_points(item, 3, 20)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// F. sfall opcodes 0x82E0–0x82E7
// ---------------------------------------------------------------------------

describe('Phase 91-F — sfall 0x82E0: get_critter_poison_sfall', () => {
    it('returns 0 for a critter with default poison level', () => {
        const npc = makeCritter()
        expect(script.get_critter_poison_sfall(npc as any)).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001003, name: 'X' }
        expect(script.get_critter_poison_sfall(item)).toBe(0)
    })

    it('returns stored poison level after set_critter_poison_sfall', () => {
        const npc = makeCritter()
        script.set_critter_poison_sfall(npc as any, 12)
        expect(script.get_critter_poison_sfall(npc as any)).toBe(12)
    })
})

describe('Phase 91-F — sfall 0x82E1: set_critter_poison_sfall', () => {
    it('does not throw for a valid critter and value', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_poison_sfall(npc as any, 5)).not.toThrow()
    })

    it('clamps negative value to 0 (calls modifyBase with 0)', () => {
        const npc = makeCritter()
        script.set_critter_poison_sfall(npc as any, -10)
        // existing impl uses modifyBase(stat, clamped - current) = modifyBase('Poison Level', 0 - 0 = 0)
        expect(npc.stats.modifyBase).toHaveBeenCalledWith('Poison Level', 0)
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001004, name: 'Y' }
        expect(() => script.set_critter_poison_sfall(item, 5)).not.toThrow()
    })
})

describe('Phase 91-F — sfall 0x82E2: get_critter_radiation_sfall', () => {
    it('returns 0 for a critter with default radiation level', () => {
        const npc = makeCritter()
        expect(script.get_critter_radiation_sfall(npc as any)).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001005, name: 'Z' }
        expect(script.get_critter_radiation_sfall(item)).toBe(0)
    })

    it('returns stored radiation level after set_critter_radiation_sfall', () => {
        const npc = makeCritter()
        script.set_critter_radiation_sfall(npc as any, 50)
        expect(script.get_critter_radiation_sfall(npc as any)).toBe(50)
    })
})

describe('Phase 91-F — sfall 0x82E3: set_critter_radiation_sfall', () => {
    it('does not throw for a valid critter and value', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_radiation_sfall(npc as any, 25)).not.toThrow()
    })

    it('clamps negative value to 0 (calls modifyBase with 0)', () => {
        const npc = makeCritter()
        script.set_critter_radiation_sfall(npc as any, -5)
        // existing impl uses modifyBase(stat, clamped - current) = modifyBase('Radiation Level', 0 - 0 = 0)
        expect(npc.stats.modifyBase).toHaveBeenCalledWith('Radiation Level', 0)
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001006, name: 'W' }
        expect(() => script.set_critter_radiation_sfall(item, 10)).not.toThrow()
    })
})

describe('Phase 91-F — sfall 0x82E4: get_critter_heal_rate_sfall', () => {
    it('returns heal rate for a normal critter', () => {
        const npc = makeCritter({ stats: { 'Healing Rate': 3 } })
        expect(script.get_critter_heal_rate_sfall(npc as any)).toBe(3)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001007, name: 'V' }
        expect(script.get_critter_heal_rate_sfall(item)).toBe(0)
    })

    it('returns stored heal rate after set_critter_heal_rate_sfall', () => {
        const npc = makeCritter()
        script.set_critter_heal_rate_sfall(npc as any, 7)
        expect(script.get_critter_heal_rate_sfall(npc as any)).toBe(7)
    })
})

describe('Phase 91-F — sfall 0x82E5: set_critter_heal_rate_sfall', () => {
    it('does not throw for a valid critter and value', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_heal_rate_sfall(npc as any, 4)).not.toThrow()
    })

    it('clamps negative value to 0', () => {
        const npc = makeCritter()
        script.set_critter_heal_rate_sfall(npc as any, -1)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Healing Rate', 0)
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001008, name: 'U' }
        expect(() => script.set_critter_heal_rate_sfall(item, 2)).not.toThrow()
    })
})

describe('Phase 91-F — sfall 0x82E6: get_critter_sequence_sfall', () => {
    it('returns sequence stat for a normal critter', () => {
        const npc = makeCritter({ stats: { 'Sequence': 8 } })
        expect(script.get_critter_sequence_sfall(npc as any)).toBe(8)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001009, name: 'T' }
        expect(script.get_critter_sequence_sfall(item)).toBe(0)
    })

    it('returns stored sequence after set_critter_sequence_sfall', () => {
        const npc = makeCritter()
        script.set_critter_sequence_sfall(npc as any, 12)
        expect(script.get_critter_sequence_sfall(npc as any)).toBe(12)
    })
})

describe('Phase 91-F — sfall 0x82E7: set_critter_sequence_sfall', () => {
    it('does not throw for a valid critter and value', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_sequence_sfall(npc as any, 6)).not.toThrow()
    })

    it('clamps negative value to 0', () => {
        const npc = makeCritter()
        script.set_critter_sequence_sfall(npc as any, -3)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Sequence', 0)
    })

    it('handles NaN by storing 0', () => {
        const npc = makeCritter()
        script.set_critter_sequence_sfall(npc as any, NaN)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Sequence', 0)
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x0000100A, name: 'S' }
        expect(() => script.set_critter_sequence_sfall(item, 10)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Arroyo end-sequence integration smoke tests
// ---------------------------------------------------------------------------

describe('Phase 91-G — Arroyo end-sequence integration smoke tests', () => {
    /**
     * Simulates the arroyo.int map_exit_p_proc calling use_obj() on an exit
     * grid object that has no use() method in the browser build.  Must not crash.
     */
    it('Exit grid: use_obj on misc item without use() is a safe no-op', () => {
        const exitGrid = makeMiscItemNoUse()
        expect(() => script.use_obj(exitGrid as any)).not.toThrow()
    })

    /**
     * Simulates the Elder NPC's idle animation loop starting via
     * reg_anim_animate_forever() when the NPC was spawned without singleAnimation.
     */
    it('Elder idle animation: reg_anim_animate_forever on NPC without singleAnimation', () => {
        const elder = makeCritterNoSingleAnimation()
        expect(() => script.reg_anim_animate_forever(elder as any, 0)).not.toThrow()
    })

    /**
     * Simulates the elder approaching the player for the blessing ceremony via
     * animate_move_obj_to_tile() when a misc waypoint object is passed instead.
     */
    it('Elder approach: animate_move_obj_to_tile on object without walkTo', () => {
        const waypoint = makeMiscItemNoWalkTo()
        expect(() => script.animate_move_obj_to_tile(waypoint as any, 14000, 0)).not.toThrow()
    })

    /**
     * Simulates the arroyo village guard NPC having critter_mod_skill() called
     * during map_enter_p_proc before skills component is initialised.
     */
    it('Village guard: critter_mod_skill with null skills does not crash', () => {
        const guard = makeCritterNullSkills()
        expect(() => script.critter_mod_skill(guard as any, 3, 15)).not.toThrow()
        expect(script.critter_mod_skill(guard as any, 3, 10)).toBe(0)
    })

    /**
     * Simulates set_critter_skill_points() on a fresh NPC before skills init.
     */
    it('Arroyo NPC: set_critter_skill_points with null skills does not crash', () => {
        const npc = makeCritterNullSkills()
        expect(() => script.set_critter_skill_points(npc as any, 3, 40)).not.toThrow()
    })

    /**
     * Simulates the Arroyo elder checking if the player is poisoned/irradiated
     * before the departure blessing using the new sfall opcodes.
     */
    it('Elder departure check: poison and radiation queries work for player critter', () => {
        const poisonStats: Record<string, number> = {
            'Poison Level': 5,
            'Radiation Level': 3,
            'Healing Rate': 7,
            'Sequence': 4,
        }
        const player: any = {
            type: 'critter', pid: 0, name: 'Chosen One', isPlayer: true,
            inventory: [], xp: 0, level: 1,
            skills: null, perkRanks: {},
            getStat: (s: string) => poisonStats[s] ?? 0,
            stats: {
                getBase: (s: string) => poisonStats[s] ?? 0,
                setBase: vi.fn((s: string, v: number) => { poisonStats[s] = v }),
                modifyBase: vi.fn((s: string, delta: number) => { poisonStats[s] = (poisonStats[s] ?? 0) + delta }),
            },
        }
        // get_critter_poison_sfall uses stats.getBase('Poison Level')
        expect(script.get_critter_poison_sfall(player)).toBe(5)
        // get_critter_radiation_sfall uses stats.getBase('Radiation Level')
        expect(script.get_critter_radiation_sfall(player)).toBe(3)
        // get_critter_heal_rate_sfall uses getStat('Healing Rate')
        expect(script.get_critter_heal_rate_sfall(player)).toBe(7)
    })

    /**
     * Full Arroyo end-sequence: each step must complete without throwing.
     *   1. NPC spawned without singleAnimation → reg_anim_animate_forever is safe
     *   2. Guard NPC with null skills → critter_mod_skill is safe
     *   3. Exit grid without use() → use_obj is safe
     *   4. sfall poison check on player returns 0
     *   5. sfall sequence set/get round-trip
     */
    it('Full end-of-arroyo sequence: animation → skill → exit → sfall queries', () => {
        const elder = makeCritterNoSingleAnimation()
        const guard = makeCritterNullSkills()
        const exitGrid = makeMiscItemNoUse()
        const player: any = {
            type: 'critter', pid: 0, name: 'Chosen One', isPlayer: true,
            inventory: [], xp: 0, level: 1,
            skills: null, perkRanks: {},
            getStat: (_s: string) => 0,
            stats: { getBase: (_s: string) => 0, setBase: vi.fn(), modifyBase: vi.fn() },
        }

        expect(() => {
            script.reg_anim_animate_forever(elder as any, 0) // elder idle anim
            script.critter_mod_skill(guard as any, 3, 10)    // guard skill init
            script.use_obj(exitGrid as any)                   // exit grid trigger
        }).not.toThrow()

        expect(script.get_critter_poison_sfall(player)).toBe(0)

        const npc = makeCritter()
        script.set_critter_sequence_sfall(npc as any, 9)
        expect(script.get_critter_sequence_sfall(npc as any)).toBe(9)
    })
})

// ---------------------------------------------------------------------------
// H. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 91-H — checklist integrity', () => {
    it('BLK-180 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_180_use_obj_missing_use_method')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-181 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_181_reg_anim_animate_forever_no_single_anim')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-182 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_182_animate_move_obj_to_tile_no_walk_to')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-183 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_183_critter_mod_skill_null_skills')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-184 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_184_set_critter_skill_points_null_skills')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall 0x82E0–0x82E7 entries are all present in the checklist', () => {
        const ids = [
            'sfall_get_critter_poison_91',
            'sfall_set_critter_poison_91',
            'sfall_get_critter_radiation_91',
            'sfall_set_critter_radiation_91',
            'sfall_get_critter_heal_rate_91',
            'sfall_set_critter_heal_rate_91',
            'sfall_get_critter_sequence_91',
            'sfall_set_critter_sequence_91',
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
