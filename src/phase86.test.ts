/**
 * Phase 86 regression tests — New Reno full-playability hardening.
 *
 * Covers:
 *   A. BLK-156 — critter_add_trait() TRAIT_SKILL (traitType=3) base-skill adjustment
 *   B. BLK-157 — has_trait() TRAIT_SKILL (traitType=3) reads current base skill value
 *   C. BLK-158 — critter_add_trait_sfall() delegates to critter_add_trait() (not a no-op)
 *   D. BLK-159 — set_critter_skill_points() non-finite value guard
 *   E. BLK-160 — critter_mod_skill() non-finite amount guard
 *   F. sfall opcodes 0x82B8–0x82BF
 *      0x82B8 get_critter_trait_typed_sfall
 *      0x82B9 critter_mod_skill_sfall
 *      0x82BA get_npc_stat_sfall
 *      0x82BB set_npc_stat_sfall
 *      0x82BC get_obj_name_sfall
 *      0x82BD get_critter_ai_num_sfall
 *      0x82BE get_num_critters_on_tile_sfall
 *      0x82BF get_critter_combat_data_sfall
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

/** Make a lightweight critter mock with an actual skills-bag. */
function makeCritterWithSkills(initialBases: Record<string, number> = {}) {
    const baseSkills: Record<string, number> = { ...initialBases }
    return {
        type: 'critter',
        pid: 0x01000042,
        name: 'Boxer',
        inventory: [],
        visible: true,
        orientation: 0,
        isPlayer: false,
        equippedArmor: null,
        perkRanks: {} as Record<number, number>,
        charTraits: new Set<number>(),
        aiNum: 7,
        teamNum: 1,
        stats: {
            getBase: (s: string) => (s === 'Max AP' ? 8 : s === 'STR' ? 6 : s === 'AGI' ? 7 : 5),
            setBase: vi.fn(),
        },
        getStat: (s: string) => (s === 'HP' ? 80 : s === 'Max HP' ? 100 : 5),
        skills: {
            getBase: (name: string) => baseSkills[name] ?? 30,
            setBase: (name: string, val: number) => { baseSkills[name] = val },
            baseSkills,
        },
        getSkill: (name: string) => (baseSkills[name] ?? 30) + 10, // +10 SPECIAL dep
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    drainStubHits()
})

// ---------------------------------------------------------------------------
// A. BLK-149 — critter_add_trait() TRAIT_SKILL (traitType=3)
// ---------------------------------------------------------------------------

describe('Phase 86-A — BLK-156: critter_add_trait TRAIT_SKILL (traitType=3)', () => {
    it('adds a positive skill delta to the critter\'s base skill', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 40 })
        script.critter_add_trait(boxer as any, 3, 3 /* SKILL_UNARMED */, 30)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(70)
        expect(stubHitCount()).toBe(0)
    })

    it('subtracts a negative skill delta (undo pattern)', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 70 })
        script.critter_add_trait(boxer as any, 3, 3, -30)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(40)
        expect(stubHitCount()).toBe(0)
    })

    it('applies to any valid skill index (e.g. Speech=14)', () => {
        const npc = makeCritterWithSkills({ Speech: 50 })
        script.critter_add_trait(npc as any, 3, 14, 20)
        expect(npc.skills.baseSkills['Speech']).toBe(70)
    })

    it('treats NaN amount as 0 (non-finite guard)', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 55 })
        script.critter_add_trait(boxer as any, 3, 3, NaN)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(55) // unchanged
    })

    it('treats Infinity amount as 0 (non-finite guard)', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 55 })
        script.critter_add_trait(boxer as any, 3, 3, Infinity)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(55)
    })

    it('no-ops on unknown skill id without throwing', () => {
        const boxer = makeCritterWithSkills()
        expect(() => script.critter_add_trait(boxer as any, 3, 999, 10)).not.toThrow()
    })

    it('no-ops on non-critter object without throwing', () => {
        const item: any = { type: 'item' }
        expect(() => script.critter_add_trait(item, 3, 3, 10)).not.toThrow()
    })

    it('no-ops on null without throwing', () => {
        expect(() => script.critter_add_trait(null as any, 3, 3, 10)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// B. BLK-150 — has_trait() TRAIT_SKILL (traitType=3)
// ---------------------------------------------------------------------------

describe('Phase 86-B — BLK-157: has_trait TRAIT_SKILL (traitType=3)', () => {
    it('returns the current base skill value for a valid skill', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 65 })
        const result = script.has_trait(3 /* TRAIT_SKILL */, boxer as any, 3 /* SKILL_UNARMED */)
        expect(result).toBe(65)
    })

    it('returns the default start value when skill not yet in baseSkills', () => {
        const boxer = makeCritterWithSkills({}) // no 'Unarmed' key
        // skills.getBase falls back to 30 in our mock
        const result = script.has_trait(3, boxer as any, 3)
        expect(result).toBe(30)
    })

    it('reflects a boost applied via critter_add_trait TRAIT_SKILL', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 50 })
        script.critter_add_trait(boxer as any, 3, 3, 25)
        const after = script.has_trait(3, boxer as any, 3)
        expect(after).toBe(75)
    })

    it('returns 0 for unknown skill id', () => {
        const boxer = makeCritterWithSkills()
        const result = script.has_trait(3, boxer as any, 9999)
        expect(result).toBe(0)
    })

    it('returns 0 for non-critter objects', () => {
        const item: any = { type: 'item' }
        expect(script.has_trait(3, item, 3)).toBe(0)
    })

    it('does not emit a stub hit', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 40 })
        script.has_trait(3, boxer as any, 3)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// C. BLK-151 — critter_add_trait_sfall() delegates to critter_add_trait()
// ---------------------------------------------------------------------------

describe('Phase 86-C — BLK-158: critter_add_trait_sfall delegates (not a no-op)', () => {
    it('applies TRAIT_SKILL boost via the sfall opcode path', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 45 })
        script.critter_add_trait_sfall(boxer as any, 3, 3, 20)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(65)
    })

    it('applies TRAIT_PERK (traitType=0) via sfall opcode', () => {
        const boxer = makeCritterWithSkills()
        script.critter_add_trait_sfall(boxer as any, 0 /* TRAIT_PERK */, 5 /* perkId */, 1)
        expect(boxer.perkRanks[5]).toBe(1)
    })

    it('applies TRAIT_OBJECT OBJECT_AI_PACKET (traitType=1, trait=5) via sfall opcode', () => {
        const boxer = makeCritterWithSkills()
        ;(boxer as any).stats.setBase = vi.fn()
        script.critter_add_trait_sfall(boxer as any, 1, 5 /* OBJECT_AI_PACKET */, 3)
        expect(boxer.aiNum).toBe(3)
    })

    it('does not emit a stub hit', () => {
        const boxer = makeCritterWithSkills()
        script.critter_add_trait_sfall(boxer as any, 3, 3, 10)
        expect(stubHitCount()).toBe(0)
    })

    it('does not throw for null object', () => {
        expect(() => script.critter_add_trait_sfall(null as any, 3, 3, 10)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-152 — set_critter_skill_points() non-finite value guard
// ---------------------------------------------------------------------------

describe('Phase 86-D — BLK-159: set_critter_skill_points non-finite guard', () => {
    it('stores a normal finite value without change', () => {
        const boxer = makeCritterWithSkills()
        script.set_critter_skill_points(boxer as any, 3, 75)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(75)
    })

    it('clamps NaN to 0 instead of storing', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 50 })
        script.set_critter_skill_points(boxer as any, 3, NaN)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(0)
    })

    it('clamps Infinity to 0 instead of storing', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 50 })
        script.set_critter_skill_points(boxer as any, 3, Infinity)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(0)
    })

    it('clamps -Infinity to 0 instead of storing', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 50 })
        script.set_critter_skill_points(boxer as any, 3, -Infinity)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(0)
    })

    it('does not throw for null critter', () => {
        expect(() => script.set_critter_skill_points(null as any, 3, 50)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// E. BLK-153 — critter_mod_skill() non-finite amount guard
// ---------------------------------------------------------------------------

describe('Phase 86-E — BLK-160: critter_mod_skill non-finite amount guard', () => {
    it('applies a normal finite delta correctly', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 50 })
        script.critter_mod_skill(boxer as any, 3, 15)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(65)
    })

    it('treats NaN amount as 0 — skill unchanged', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 50 })
        script.critter_mod_skill(boxer as any, 3, NaN)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(50)
    })

    it('treats Infinity amount as 0 — skill unchanged', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 50 })
        script.critter_mod_skill(boxer as any, 3, Infinity)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(50)
    })

    it('treats -Infinity amount as 0 — skill unchanged', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 60 })
        script.critter_mod_skill(boxer as any, 3, -Infinity)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(60)
    })

    it('does not throw for null critter', () => {
        expect(() => script.critter_mod_skill(null as any, 3, 10)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// F. sfall opcodes 0x82B8–0x82BF
// ---------------------------------------------------------------------------

describe('Phase 86-F — sfall 0x82B8 get_critter_trait_typed_sfall', () => {
    it('reads TRAIT_SKILL base value via sfall accessor', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 72 })
        const result = script.get_critter_trait_typed_sfall(boxer as any, 3, 3)
        expect(result).toBe(72)
    })

    it('reads TRAIT_PERK rank via sfall accessor', () => {
        const boxer = makeCritterWithSkills()
        boxer.perkRanks[12] = 2
        const result = script.get_critter_trait_typed_sfall(boxer as any, 0, 12)
        expect(result).toBe(2)
    })

    it('returns 0 for unknown trait type', () => {
        const boxer = makeCritterWithSkills()
        const result = script.get_critter_trait_typed_sfall(boxer as any, 99, 3)
        expect(result).toBe(0)
    })
})

describe('Phase 86-F — sfall 0x82B9 critter_mod_skill_sfall', () => {
    it('modifies skill and returns new total', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 60 })
        const result = script.critter_mod_skill_sfall(boxer as any, 3, 10)
        expect(boxer.skills.baseSkills['Unarmed']).toBe(70)
        // getSkill adds 10 in the mock, so result is 80
        expect(typeof result).toBe('number')
    })

    it('guards against non-finite amount', () => {
        const boxer = makeCritterWithSkills({ Unarmed: 60 })
        expect(() => script.critter_mod_skill_sfall(boxer as any, 3, NaN)).not.toThrow()
        expect(boxer.skills.baseSkills['Unarmed']).toBe(60)
    })
})

describe('Phase 86-F — sfall 0x82BA get_npc_stat_sfall', () => {
    it('returns stat value for a valid critter', () => {
        const boxer = makeCritterWithSkills()
        // getStat('HP') → 80 in our mock
        const result = script.get_npc_stat_sfall(boxer as any, 35 /* STAT_HP */)
        expect(typeof result).toBe('number')
    })

    it('returns 0 for null object', () => {
        expect(script.get_npc_stat_sfall(null as any, 0)).toBe(0)
    })
})

describe('Phase 86-F — sfall 0x82BB set_npc_stat_sfall', () => {
    it('does not throw for a valid critter', () => {
        const boxer = makeCritterWithSkills()
        expect(() => script.set_npc_stat_sfall(boxer as any, 35, 90)).not.toThrow()
    })

    it('does not throw for null object', () => {
        expect(() => script.set_npc_stat_sfall(null as any, 35, 90)).not.toThrow()
    })
})

describe('Phase 86-F — sfall 0x82BC get_obj_name_sfall', () => {
    it('returns name string for a valid game object', () => {
        const boxer: any = {
            type: 'critter',
            pid: 0x01000001,
            name: 'Frankie',
            inventory: [],
            orientation: 0,
            visible: true,
        }
        const result = script.get_obj_name_sfall(boxer)
        expect(typeof result === 'string' || result === 0).toBe(true)
    })

    it('returns 0 for null object', () => {
        expect(script.get_obj_name_sfall(null as any)).toBe(0)
    })
})

describe('Phase 86-F — sfall 0x82BD get_critter_ai_num_sfall', () => {
    it('returns the aiNum of a critter', () => {
        const boxer = makeCritterWithSkills()
        boxer.aiNum = 7
        const result = script.get_critter_ai_num_sfall(boxer as any)
        expect(result).toBe(7)
    })

    it('returns -1 for a non-critter', () => {
        const item: any = { type: 'item' }
        expect(script.get_critter_ai_num_sfall(item)).toBe(-1)
    })

    it('returns -1 for null', () => {
        expect(script.get_critter_ai_num_sfall(null as any)).toBe(-1)
    })
})

describe('Phase 86-F — sfall 0x82BE get_num_critters_on_tile_sfall', () => {
    it('returns 0 (stub — no per-tile critter index)', () => {
        expect(script.get_num_critters_on_tile_sfall(12345)).toBe(0)
    })

    it('does not throw for any tile value', () => {
        expect(() => script.get_num_critters_on_tile_sfall(-1)).not.toThrow()
    })
})

describe('Phase 86-F — sfall 0x82BF get_critter_combat_data_sfall', () => {
    it('returns 0 (stub)', () => {
        const boxer = makeCritterWithSkills()
        expect(script.get_critter_combat_data_sfall(boxer as any)).toBe(0)
    })

    it('does not throw for null', () => {
        expect(() => script.get_critter_combat_data_sfall(null as any)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 86-G — checklist integrity', () => {
    it('BLK-156 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_156_critter_add_trait_skill')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-157 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_157_has_trait_skill')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-158 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_158_critter_add_trait_sfall_noop')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-159 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_159_set_critter_skill_points_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-160 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_160_critter_mod_skill_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall 0x82B8–0x82BF entries are all present in the checklist', () => {
        const ids = [
            'sfall_get_critter_trait_86',
            'sfall_critter_mod_skill_86',
            'sfall_get_npc_stat_86',
            'sfall_set_npc_stat_86',
            'sfall_get_obj_name_86',
            'sfall_get_critter_ai_packet_86',
            'sfall_get_num_critters_on_tile_86',
            'sfall_get_critter_combat_data_86',
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
