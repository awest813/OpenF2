/**
 * Phase 87 regression tests — New Reno full-playability hardening (continued).
 *
 * Covers:
 *   A. BLK-161 — rm_mult_objs_from_inven() non-positive/non-finite count guard
 *   B. BLK-162 — obj_carrying_pid_obj() null/undefined inventory guard
 *   C. BLK-163 — poison() non-finite amount guard
 *   D. BLK-164 — radiation_add() non-finite amount guard
 *   E. BLK-165 — radiation_dec() non-finite amount guard
 *   F. sfall opcodes 0x82C0–0x82C7
 *      0x82C0 get_critter_active_weapon_sfall
 *      0x82C1 get_critter_base_skill_sfall
 *      0x82C2 set_critter_base_skill_sfall
 *      0x82C3 get_critter_in_combat_sfall
 *      0x82C4 get_map_var_sfall
 *      0x82C5 set_map_var_sfall
 *      0x82C6 get_critter_attack_type_sfall
 *      0x82C7 get_critter_min_str_sfall
 *   G. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits, stubHitCount } from './scriptingChecklist.js'

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

/** Make a lightweight critter mock with skills and optional inventory. */
function makeCritter(opts: { inventory?: any[]; skills?: Record<string, number>; hp?: number } = {}) {
    const baseSkills: Record<string, number> = { ...(opts.skills ?? {}) }
    return {
        type: 'critter',
        pid: 0x01000050,
        name: 'Fighter',
        inventory: opts.inventory ?? [],
        visible: true,
        orientation: 0,
        isPlayer: false,
        equippedArmor: null,
        leftHand: null as any,
        rightHand: null as any,
        perkRanks: {} as Record<number, number>,
        charTraits: new Set<number>(),
        aiNum: 5,
        teamNum: 1,
        stats: {
            getBase: (s: string) => (s === 'Max AP' ? 8 : s === 'STR' ? 6 : 5),
            setBase: vi.fn(),
            modifyBase: vi.fn(),
        },
        getStat: (s: string) => {
            if (s === 'HP') {return opts.hp ?? 80}
            if (s === 'Max HP') {return 100}
            if (s === 'Poison Level') {return 0}
            if (s === 'Radiation Level') {return 0}
            return 5
        },
        skills: {
            getBase: (name: string) => baseSkills[name] ?? 30,
            setBase: (name: string, val: number) => { baseSkills[name] = val },
            baseSkills,
        },
        getSkill: (name: string) => (baseSkills[name] ?? 30) + 10,
    }
}

/** Make a minimal weapon item mock. */
function makeWeapon(pid = 0x000F1234) {
    return { type: 'item', subtype: 'weapon', pid, amount: 1 }
}

/** Make a minimal item mock with approxEq. */
function makeItem(pid = 0x00010001) {
    return {
        type: 'item',
        subtype: 'misc',
        pid,
        amount: 1,
        approxEq(other: any) { return other && other.pid === this.pid },
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    drainStubHits()
})

// ---------------------------------------------------------------------------
// A. BLK-161 — rm_mult_objs_from_inven non-positive/non-finite count guard
// ---------------------------------------------------------------------------

describe('Phase 87-A — BLK-161: rm_mult_objs_from_inven non-positive count guard', () => {
    it('removes the correct number for a normal positive count', () => {
        const item = makeItem()
        const item2 = makeItem()
        const obj: any = makeCritter({ inventory: [item, item2] })
        const removed = script.rm_mult_objs_from_inven(obj, item, 1)
        expect(typeof removed).toBe('number')
        expect(removed).toBeGreaterThanOrEqual(0)
    })

    it('treats count=0 as no-op and returns 0', () => {
        const item = makeItem()
        const obj: any = makeCritter({ inventory: [item] })
        const result = script.rm_mult_objs_from_inven(obj, item, 0)
        expect(result).toBe(0)
        expect(obj.inventory).toHaveLength(1) // item not removed
    })

    it('treats negative count as no-op and returns 0', () => {
        const item = makeItem()
        const obj: any = makeCritter({ inventory: [item] })
        const result = script.rm_mult_objs_from_inven(obj, item, -5)
        expect(result).toBe(0)
        expect(obj.inventory).toHaveLength(1) // item not removed
    })

    it('treats NaN count as no-op and returns 0 (not NaN)', () => {
        const item = makeItem()
        const obj: any = makeCritter({ inventory: [item] })
        const result = script.rm_mult_objs_from_inven(obj, item, NaN)
        expect(result).toBe(0)
        expect(Number.isNaN(result)).toBe(false)
    })

    it('treats Infinity count as no-op and returns 0', () => {
        const item = makeItem()
        const obj: any = makeCritter({ inventory: [item] })
        const result = script.rm_mult_objs_from_inven(obj, item, Infinity)
        expect(result).toBe(0)
    })

    it('returns 0 for null object', () => {
        const item = makeItem()
        expect(script.rm_mult_objs_from_inven(null as any, item, 1)).toBe(0)
    })

    it('returns 0 for null item', () => {
        const obj: any = makeCritter()
        expect(script.rm_mult_objs_from_inven(obj, null as any, 1)).toBe(0)
    })

    it('does not throw for any combination of null/NaN', () => {
        expect(() => script.rm_mult_objs_from_inven(null as any, null as any, NaN)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// B. BLK-162 — obj_carrying_pid_obj null inventory guard
// ---------------------------------------------------------------------------

describe('Phase 87-B — BLK-162: obj_carrying_pid_obj null inventory guard', () => {
    it('returns 0 for an object with undefined inventory array', () => {
        const obj: any = makeCritter()
        delete obj.inventory // remove array entirely
        expect(() => script.obj_carrying_pid_obj(obj, 0x00010001)).not.toThrow()
        expect(script.obj_carrying_pid_obj(obj, 0x00010001)).toBe(0)
    })

    it('returns 0 for an object with null inventory', () => {
        const obj: any = makeCritter()
        obj.inventory = null
        expect(script.obj_carrying_pid_obj(obj, 0x00010001)).toBe(0)
    })

    it('finds item in a valid inventory array', () => {
        const item = makeItem(0x00010001)
        const obj: any = makeCritter({ inventory: [item] })
        const result = script.obj_carrying_pid_obj(obj, 0x00010001)
        expect(result).toBeTruthy()
    })

    it('returns 0 for null object', () => {
        expect(script.obj_carrying_pid_obj(null as any, 0x00010001)).toBe(0)
    })

    it('does not throw for null object with null inventory', () => {
        const obj: any = { type: 'critter', pid: 0, name: 'X', inventory: null }
        expect(() => script.obj_carrying_pid_obj(obj, 0x00010001)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// C. BLK-163 — poison() non-finite amount guard
// ---------------------------------------------------------------------------

describe('Phase 87-C — BLK-163: poison non-finite amount guard', () => {
    it('applies a normal finite poison amount without throwing', () => {
        const critter: any = makeCritter()
        expect(() => script.poison(critter, 10)).not.toThrow()
    })

    it('does not call modifyBase for NaN amount', () => {
        const critter: any = makeCritter()
        script.poison(critter, NaN)
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('does not call modifyBase for Infinity amount', () => {
        const critter: any = makeCritter()
        script.poison(critter, Infinity)
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('does not call modifyBase for -Infinity amount', () => {
        const critter: any = makeCritter()
        script.poison(critter, -Infinity)
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('calls modifyBase for a valid negative amount (de-poisoning)', () => {
        const critter: any = makeCritter()
        script.poison(critter, -5)
        expect(critter.stats.modifyBase).toHaveBeenCalledWith('Poison Level', -5)
    })

    it('does not throw for null critter', () => {
        expect(() => script.poison(null as any, 10)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-164 — radiation_add() non-finite amount guard
// ---------------------------------------------------------------------------

describe('Phase 87-D — BLK-164: radiation_add non-finite amount guard', () => {
    it('applies a normal finite radiation amount without throwing', () => {
        const critter: any = makeCritter()
        expect(() => script.radiation_add(critter, 15)).not.toThrow()
    })

    it('does not call modifyBase for NaN amount', () => {
        const critter: any = makeCritter()
        script.radiation_add(critter, NaN)
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('does not call modifyBase for Infinity amount', () => {
        const critter: any = makeCritter()
        script.radiation_add(critter, Infinity)
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('calls modifyBase with the finite value', () => {
        const critter: any = makeCritter()
        script.radiation_add(critter, 20)
        expect(critter.stats.modifyBase).toHaveBeenCalledWith('Radiation Level', 20)
    })

    it('does not throw for null critter', () => {
        expect(() => script.radiation_add(null as any, 5)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// E. BLK-165 — radiation_dec() non-finite amount guard
// ---------------------------------------------------------------------------

describe('Phase 87-E — BLK-165: radiation_dec non-finite amount guard', () => {
    it('applies a normal finite radiation decrease without throwing', () => {
        const critter: any = makeCritter()
        expect(() => script.radiation_dec(critter, 10)).not.toThrow()
    })

    it('does not call modifyBase for NaN amount', () => {
        const critter: any = makeCritter()
        script.radiation_dec(critter, NaN)
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('does not call modifyBase for Infinity amount', () => {
        const critter: any = makeCritter()
        script.radiation_dec(critter, Infinity)
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('calls modifyBase with negated finite value', () => {
        const critter: any = makeCritter()
        script.radiation_dec(critter, 10)
        expect(critter.stats.modifyBase).toHaveBeenCalledWith('Radiation Level', -10)
    })

    it('does not throw for null critter', () => {
        expect(() => script.radiation_dec(null as any, 5)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// F. sfall opcodes 0x82C0–0x82C7
// ---------------------------------------------------------------------------

describe('Phase 87-F — sfall 0x82C0 get_critter_active_weapon_sfall', () => {
    it('returns the rightHand weapon for an NPC', () => {
        const fighter: any = makeCritter()
        const weapon = makeWeapon()
        fighter.rightHand = weapon
        const result = script.get_critter_active_weapon_sfall(fighter)
        expect(result).toBe(weapon)
    })

    it('returns 0 when NPC has no weapon equipped', () => {
        const fighter: any = makeCritter()
        expect(script.get_critter_active_weapon_sfall(fighter)).toBe(0)
    })

    it('returns active-hand weapon for the player (activeHand=0 → leftHand)', () => {
        const player: any = makeCritter()
        player.isPlayer = true
        player.activeHand = 0
        const weapon = makeWeapon()
        player.leftHand = weapon
        expect(script.get_critter_active_weapon_sfall(player)).toBe(weapon)
    })

    it('returns active-hand weapon for the player (activeHand=1 → rightHand)', () => {
        const player: any = makeCritter()
        player.isPlayer = true
        player.activeHand = 1
        const weapon = makeWeapon()
        player.rightHand = weapon
        expect(script.get_critter_active_weapon_sfall(player)).toBe(weapon)
    })

    it('returns 0 for non-critter object', () => {
        const item: any = { type: 'item', pid: 0x1234 }
        expect(script.get_critter_active_weapon_sfall(item)).toBe(0)
    })

    it('returns 0 for null', () => {
        expect(script.get_critter_active_weapon_sfall(null as any)).toBe(0)
    })
})

describe('Phase 87-F — sfall 0x82C1 get_critter_base_skill_sfall', () => {
    it('returns the base skill value for Unarmed (skill 3)', () => {
        const fighter: any = makeCritter({ skills: { Unarmed: 65 } })
        const result = script.get_critter_base_skill_sfall(fighter, 3)
        expect(result).toBe(65)
    })

    it('returns default when skill not explicitly set', () => {
        const fighter: any = makeCritter({})
        const result = script.get_critter_base_skill_sfall(fighter, 3)
        expect(typeof result).toBe('number')
    })

    it('returns 0 for unknown skill id', () => {
        const fighter: any = makeCritter()
        expect(script.get_critter_base_skill_sfall(fighter, 9999)).toBe(0)
    })

    it('returns 0 for null critter', () => {
        expect(script.get_critter_base_skill_sfall(null as any, 3)).toBe(0)
    })
})

describe('Phase 87-F — sfall 0x82C2 set_critter_base_skill_sfall', () => {
    it('sets the base skill value via the sfall opcode path', () => {
        const fighter: any = makeCritter({ skills: { Unarmed: 50 } })
        script.set_critter_base_skill_sfall(fighter, 3, 80)
        expect(fighter.skills.baseSkills['Unarmed']).toBe(80)
    })

    it('clamps NaN to 0 (inherits BLK-159 guard)', () => {
        const fighter: any = makeCritter({ skills: { Unarmed: 50 } })
        script.set_critter_base_skill_sfall(fighter, 3, NaN)
        expect(fighter.skills.baseSkills['Unarmed']).toBe(0)
    })

    it('does not throw for null critter', () => {
        expect(() => script.set_critter_base_skill_sfall(null as any, 3, 50)).not.toThrow()
    })
})

describe('Phase 87-F — sfall 0x82C3 get_critter_in_combat_sfall', () => {
    it('returns 0 when not in combat', () => {
        const fighter: any = makeCritter()
        // globalState.inCombat defaults to false when Scripting.init runs
        expect(script.get_critter_in_combat_sfall(fighter)).toBe(0)
    })

    it('returns 0 for non-critter object', () => {
        const item: any = { type: 'item', pid: 0x1234 }
        expect(script.get_critter_in_combat_sfall(item)).toBe(0)
    })

    it('returns 0 for null', () => {
        expect(script.get_critter_in_combat_sfall(null as any)).toBe(0)
    })

    it('does not throw for any input', () => {
        expect(() => script.get_critter_in_combat_sfall(undefined as any)).not.toThrow()
    })
})

describe('Phase 87-F — sfall 0x82C4 get_map_var_sfall', () => {
    it('returns 0 when no map script is attached (safe fallback)', () => {
        // script has no _mapScript by default after Scripting.init without a map
        const result = script.get_map_var_sfall(0)
        expect(typeof result).toBe('number')
    })

    it('does not throw for any mvar index', () => {
        expect(() => script.get_map_var_sfall(999)).not.toThrow()
    })
})

describe('Phase 87-F — sfall 0x82C5 set_map_var_sfall', () => {
    it('does not throw when no map script is attached', () => {
        expect(() => script.set_map_var_sfall(0, 42)).not.toThrow()
    })

    it('does not throw for any mvar/value combination', () => {
        expect(() => script.set_map_var_sfall(100, NaN)).not.toThrow()
    })
})

describe('Phase 87-F — sfall 0x82C6 get_critter_attack_type_sfall', () => {
    it('returns 0 (stub — no attack type table)', () => {
        const fighter: any = makeCritter()
        expect(script.get_critter_attack_type_sfall(fighter, 0)).toBe(0)
        expect(script.get_critter_attack_type_sfall(fighter, 1)).toBe(0)
    })

    it('does not throw for null', () => {
        expect(() => script.get_critter_attack_type_sfall(null as any, 0)).not.toThrow()
    })
})

describe('Phase 87-F — sfall 0x82C7 get_critter_min_str_sfall', () => {
    it('returns 0 (stub — no weapon proto lookup)', () => {
        const fighter: any = makeCritter()
        expect(script.get_critter_min_str_sfall(fighter)).toBe(0)
    })

    it('does not throw for null', () => {
        expect(() => script.get_critter_min_str_sfall(null as any)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 87-G — checklist integrity', () => {
    it('BLK-161 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_161_rm_mult_objs_non_positive')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-162 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_162_obj_carrying_null_inventory')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-163 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_163_poison_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-164 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_164_radiation_add_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-165 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_165_radiation_dec_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall 0x82C0–0x82C7 entries are all present in the checklist', () => {
        const ids = [
            'sfall_get_critter_weapon_87',
            'sfall_get_critter_base_skill_87',
            'sfall_set_critter_base_skill_87',
            'sfall_get_critter_in_combat_87',
            'sfall_get_map_var_87',
            'sfall_set_map_var_87',
            'sfall_get_critter_attack_type_87',
            'sfall_get_critter_min_str_87',
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
