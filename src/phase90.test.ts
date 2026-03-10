/**
 * Phase 90 regression tests — Arroyo debug, audit, and polish.
 *
 * Covers:
 *   A. BLK-176 — attack_complex() null self_obj guard
 *   B. BLK-177 — critter_add_trait(TRAIT_CHAR) uninitialised charTraits guard
 *   C. BLK-178 — critter_add_trait(TRAIT_SKILL) null skills guard
 *   D. BLK-179 — display_msg() null/non-string message guard
 *   E. sfall opcodes 0x82D8–0x82DF
 *      0x82D8 get_critter_body_type_sfall
 *      0x82D9 set_critter_body_type_sfall
 *      0x82DA get_critter_weapon_type_sfall
 *      0x82DB set_critter_weapon_type_sfall
 *      0x82DC get_critter_kills_sfall
 *      0x82DD set_critter_kills_sfall
 *      0x82DE get_critter_gender_sfall
 *      0x82DF set_critter_gender_sfall
 *   F. Arroyo combat/NPC smoke tests
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

function makeCritter(opts: {
    hp?: number
    inventory?: any[]
    stats?: Record<string, number>
    isPlayer?: boolean
    skills?: any
    charTraits?: Set<number>
    gender?: string
} = {}) {
    const stats: Record<string, number> = { 'HP': opts.hp ?? 80, 'Max HP': 100, ...(opts.stats ?? {}) }
    return {
        type: 'critter',
        pid: 0x01000001,
        name: 'TestCritter',
        inventory: opts.inventory ?? [],
        visible: true,
        orientation: 0,
        isPlayer: opts.isPlayer ?? false,
        gender: opts.gender ?? 'male',
        equippedArmor: null,
        leftHand: null as any,
        rightHand: null as any,
        perkRanks: {} as Record<number, number>,
        charTraits: opts.charTraits !== undefined ? opts.charTraits : new Set<number>(),
        aiNum: 1,
        teamNum: -1,
        dead: false,
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

/** Make a critter with no charTraits Set (simulates fresh create_object_sid spawn). */
function makeCritterNoCharTraits(): any {
    const c = makeCritter()
    delete (c as any).charTraits
    return c
}

/** Make a critter with null skills (simulates partially initialised player). */
function makeCritterNullSkills(): any {
    return makeCritter({ skills: null })
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    drainStubHits()
})

// ---------------------------------------------------------------------------
// A. BLK-176 — attack_complex() null self_obj guard
// ---------------------------------------------------------------------------

describe('Phase 90-A — BLK-176: attack_complex() null self_obj guard', () => {
    it('does not throw when self_obj is null', () => {
        // script.self_obj is null by default when created via new Scripting.Script()
        expect(() => script.attack_complex(null as any, 0, 1, 0, 0, 10, 0, 0)).not.toThrow()
    })

    it('does not throw when self_obj is undefined', () => {
        ;(script as any).self_obj = undefined
        expect(() => script.attack_complex(null as any, 0, 1, 0, 0, 10, 0, 0)).not.toThrow()
    })

    it('does not throw with zero numAttacks', () => {
        expect(() => script.attack_complex(null as any, 0, 0, 0, 0, 0, 0, 0)).not.toThrow()
    })

    it('does not throw with all-zero parameters', () => {
        expect(() => script.attack_complex(null as any, 0, 0, 0, 0, 0, 0, 0)).not.toThrow()
    })

    it('does not throw when called multiple times consecutively', () => {
        expect(() => {
            script.attack_complex(null as any, 0, 1, 0, 1, 5, 0, 0)
            script.attack_complex(null as any, 1, 2, 0, 2, 8, 0, 0)
        }).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// B. BLK-177 — critter_add_trait(TRAIT_CHAR) uninitialised charTraits guard
// ---------------------------------------------------------------------------

describe('Phase 90-B — BLK-177: critter_add_trait TRAIT_CHAR uninitialised charTraits', () => {
    it('does not throw when charTraits is absent from critter', () => {
        const npc = makeCritterNoCharTraits()
        expect(() => script.critter_add_trait(npc, 2, 5, 1)).not.toThrow()
    })

    it('initialises charTraits and adds the trait when absent', () => {
        const npc = makeCritterNoCharTraits()
        script.critter_add_trait(npc, 2, 3, 1)
        expect(npc.charTraits).toBeDefined()
        expect(npc.charTraits.has(3)).toBe(true)
    })

    it('initialises charTraits and does not crash on delete when absent', () => {
        const npc = makeCritterNoCharTraits()
        expect(() => script.critter_add_trait(npc, 2, 7, 0)).not.toThrow()
    })

    it('works normally when charTraits is already a Set', () => {
        const npc = makeCritter()
        script.critter_add_trait(npc, 2, 1, 1)
        expect(npc.charTraits.has(1)).toBe(true)
        script.critter_add_trait(npc, 2, 1, 0) // revoke
        expect(npc.charTraits.has(1)).toBe(false)
    })

    it('does not throw when called on non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001001, name: 'Spear' }
        expect(() => script.critter_add_trait(item, 2, 5, 1)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// C. BLK-178 — critter_add_trait(TRAIT_SKILL) null skills guard
// ---------------------------------------------------------------------------

describe('Phase 90-C — BLK-178: critter_add_trait TRAIT_SKILL null skills guard', () => {
    it('does not throw when critter.skills is null', () => {
        const npc = makeCritterNullSkills()
        expect(() => script.critter_add_trait(npc, 3, 3, 10)).not.toThrow()
    })

    it('does not throw when critter.skills is undefined', () => {
        const npc = makeCritter()
        delete (npc as any).skills
        expect(() => script.critter_add_trait(npc as any, 3, 3, 10)).not.toThrow()
    })

    it('applies skill boost normally when skills is present', () => {
        const baseSkills: Record<string, number> = {}
        const npc = makeCritter({
            skills: {
                skillPoints: 0,
                getBase: (s: string) => baseSkills[s] ?? 30,
                setBase: vi.fn((s: string, v: number) => { baseSkills[s] = v }),
                baseSkills,
            },
        })
        script.critter_add_trait(npc, 3, 3 /* SKILL_UNARMED */, 15)
        expect(npc.skills.setBase).toHaveBeenCalled()
    })

    it('does not modify skills when TRAIT_SKILL amount is non-finite', () => {
        const setBase = vi.fn()
        const npc = makeCritter({
            skills: {
                skillPoints: 0,
                getBase: (_s: string) => 30,
                setBase,
                baseSkills: {},
            },
        })
        script.critter_add_trait(npc, 3, 3, NaN)
        // setBase called with 0 delta (30 + 0 = 30)
        const calls = setBase.mock.calls
        if (calls.length > 0) {
            expect(calls[0][1]).toBe(30) // 30 + 0 = 30
        }
    })

    it('does not throw when called on non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001002, name: 'Knife' }
        expect(() => script.critter_add_trait(item, 3, 3, 10)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-179 — display_msg() null/non-string message guard
// ---------------------------------------------------------------------------

describe('Phase 90-D — BLK-179: display_msg() null/non-string message guard', () => {
    it('does not throw when msg is null', () => {
        expect(() => script.display_msg(null as any)).not.toThrow()
    })

    it('does not throw when msg is undefined', () => {
        expect(() => script.display_msg(undefined as any)).not.toThrow()
    })

    it('does not throw when msg is a number', () => {
        expect(() => script.display_msg(42 as any)).not.toThrow()
    })

    it('does not throw when msg is an object', () => {
        expect(() => script.display_msg({} as any)).not.toThrow()
    })

    it('does not throw for a valid string message', () => {
        expect(() => script.display_msg('Hello Arroyo!')).not.toThrow()
    })

    it('does not throw for an empty string', () => {
        // Empty string is a valid string — still passes the typeof guard
        expect(() => script.display_msg('')).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// E. sfall opcodes 0x82D8–0x82DF
// ---------------------------------------------------------------------------

describe('Phase 90-E — sfall 0x82D8: get_critter_body_type_sfall (alias of 0x8206)', () => {
    it('returns 0 (biped) for a critter with no pro.extra.bodyType', () => {
        const npc = makeCritter()
        expect(script.get_critter_body_type_sfall(npc as any)).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', subtype: 'weapon', pid: 0x00001001, name: 'Spear' }
        expect(script.get_critter_body_type_sfall(item)).toBe(0)
    })

    it('returns body type from pro.extra.bodyType after set_critter_body_type_sfall', () => {
        const npc = makeCritter()
        script.set_critter_body_type_sfall(npc as any, 1) // quadruped
        // get reads from pro.extra.bodyType (same field set by setter)
        expect(script.get_critter_body_type_sfall(npc as any)).toBe(1)
    })
})

describe('Phase 90-E — sfall 0x82D9: set_critter_body_type_sfall', () => {
    it('does not throw for a valid critter and type', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_body_type_sfall(npc as any, 2)).not.toThrow()
    })

    it('stores the body type in pro.extra.bodyType', () => {
        const npc = makeCritter()
        script.set_critter_body_type_sfall(npc as any, 3)
        expect((npc as any).pro?.extra?.bodyType).toBe(3)
    })

    it('defaults to 0 for a non-number type argument', () => {
        const npc = makeCritter()
        script.set_critter_body_type_sfall(npc as any, 'invalid' as any)
        expect((npc as any).pro?.extra?.bodyType).toBe(0)
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001002, name: 'Knife' }
        expect(() => script.set_critter_body_type_sfall(item, 1)).not.toThrow()
    })
})

describe('Phase 90-E — sfall 0x82DA: get_critter_weapon_type_sfall', () => {
    it('returns 0 (unarmed) when critter has no weapon equipped', () => {
        const npc = makeCritter()
        expect(script.get_critter_weapon_type_sfall(npc as any)).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001003, name: 'X' }
        expect(script.get_critter_weapon_type_sfall(item)).toBe(0)
    })

    it('returns stored weapon type from rightHand weapon', () => {
        const weapon: any = { type: 'item', subtype: 'weapon', pid: 0x01000100, _weaponType: 2 }
        const npc = makeCritter()
        ;(npc as any).rightHand = weapon
        expect(script.get_critter_weapon_type_sfall(npc as any)).toBe(2)
    })
})

describe('Phase 90-E — sfall 0x82DB: set_critter_weapon_type_sfall', () => {
    it('does not throw when critter has no weapon', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_weapon_type_sfall(npc as any, 1)).not.toThrow()
    })

    it('sets weapon type on rightHand weapon', () => {
        const weapon: any = { type: 'item', subtype: 'weapon', pid: 0x01000101, _weaponType: 0 }
        const npc = makeCritter()
        ;(npc as any).rightHand = weapon
        script.set_critter_weapon_type_sfall(npc as any, 3)
        expect(weapon._weaponType).toBe(3)
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001004, name: 'Y' }
        expect(() => script.set_critter_weapon_type_sfall(item, 2)).not.toThrow()
    })
})

describe('Phase 90-E — sfall 0x82DC: get_critter_kills_sfall', () => {
    it('returns 0 for a critter with no stored kill count', () => {
        const npc = makeCritter()
        expect(script.get_critter_kills_sfall(npc as any)).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001005, name: 'Z' }
        expect(script.get_critter_kills_sfall(item)).toBe(0)
    })

    it('returns stored kill count after set_critter_kills_sfall', () => {
        const npc = makeCritter()
        script.set_critter_kills_sfall(npc as any, 7)
        expect(script.get_critter_kills_sfall(npc as any)).toBe(7)
    })
})

describe('Phase 90-E — sfall 0x82DD: set_critter_kills_sfall', () => {
    it('does not throw for a valid critter and count', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_kills_sfall(npc as any, 3)).not.toThrow()
    })

    it('does not allow negative kill counts (clamps to 0)', () => {
        const npc = makeCritter()
        script.set_critter_kills_sfall(npc as any, -5)
        expect(script.get_critter_kills_sfall(npc as any)).toBe(0)
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001006, name: 'W' }
        expect(() => script.set_critter_kills_sfall(item, 2)).not.toThrow()
    })
})

describe('Phase 90-E — sfall 0x82DE: get_critter_gender_sfall (alias of 0x8231)', () => {
    it('returns 0 (male) for a critter with default gender', () => {
        const npc = makeCritter() // default gender 'male'
        expect(script.get_critter_gender_sfall(npc as any)).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001007, name: 'V' }
        expect(script.get_critter_gender_sfall(item)).toBe(0)
    })

    it('returns 1 (female) for a critter with gender=female', () => {
        const npc = makeCritter({ gender: 'female' })
        expect(script.get_critter_gender_sfall(npc as any)).toBe(1)
    })

    it('returns stored gender value after set_critter_gender_sfall', () => {
        const npc = makeCritter() // starts as male
        script.set_critter_gender_sfall(npc as any, 1) // set female
        // getter reads .gender property
        expect(script.get_critter_gender_sfall(npc as any)).toBe(1)
    })
})

describe('Phase 90-E — sfall 0x82DF: set_critter_gender_sfall', () => {
    it('does not throw for a valid critter and gender', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_gender_sfall(npc as any, 0)).not.toThrow()
        expect(() => script.set_critter_gender_sfall(npc as any, 1)).not.toThrow()
    })

    it('sets .gender property to female when gender=1', () => {
        const npc = makeCritter({ gender: 'male' })
        script.set_critter_gender_sfall(npc as any, 1)
        expect((npc as any).gender).toBe('female')
    })

    it('sets .gender property to male when gender=0', () => {
        const npc = makeCritter({ gender: 'female' })
        script.set_critter_gender_sfall(npc as any, 0)
        expect((npc as any).gender).toBe('male')
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001008, name: 'U' }
        expect(() => script.set_critter_gender_sfall(item, 0)).not.toThrow()
    })

    it('defaults to male (0) for a non-number gender argument', () => {
        const npc = makeCritter()
        script.set_critter_gender_sfall(npc as any, 'invalid' as any)
        expect((npc as any).gender).toBe('male')
    })
})

// ---------------------------------------------------------------------------
// F. Arroyo combat/NPC smoke tests
// ---------------------------------------------------------------------------

describe('Phase 90-F — Arroyo combat and NPC smoke tests', () => {
    /**
     * Simulates an atheatr1.int (arena/temple NPC) calling attack_complex() from
     * a map-level script where self_obj is null.  Must not crash the VM.
     */
    it('Temple NPC: attack_complex with null self_obj is a safe no-op', () => {
        expect(() => script.attack_complex(null as any, 0, 1, 0, 1, 5, 0, 0)).not.toThrow()
    })

    /**
     * Simulates the Elder granting a TRAIT_CHAR trait to the player via a fresh
     * critter object that was spawned by create_object_sid() without charTraits.
     */
    it('Elder trait grant: critter_add_trait TRAIT_CHAR on critter without charTraits', () => {
        const freshNpc = makeCritterNoCharTraits()
        expect(() => script.critter_add_trait(freshNpc, 2, 4 /* TRAIT_GIFTED */, 1)).not.toThrow()
        expect(freshNpc.charTraits).toBeDefined()
        expect(freshNpc.charTraits.has(4)).toBe(true)
    })

    /**
     * Simulates the Arroyo village guard having TRAIT_SKILL boosted when skills
     * component is not yet attached (partial NPC init during map_enter_p_proc).
     */
    it('Village guard: critter_add_trait TRAIT_SKILL with null skills does not crash', () => {
        const guard = makeCritterNullSkills()
        expect(() => script.critter_add_trait(guard, 3, 3, 20)).not.toThrow()
    })

    /**
     * Simulates the Elder's completion dialogue calling display_msg() with the
     * result of message_str() which can return null if a message key is missing.
     */
    it('Elder dialogue: display_msg with null message is a safe no-op', () => {
        expect(() => script.display_msg(null as any)).not.toThrow()
    })

    /**
     * Simulates sfall scripts querying player gender during character creation
     * opening sequence before stats are fully populated.
     */
    it('Character creation: get_critter_gender_sfall returns 0 for default male NPC', () => {
        const npc = makeCritter({ gender: 'male' })
        expect(script.get_critter_gender_sfall(npc as any)).toBe(0)
    })

    it('Character creation: set/get gender round-trip works for NPC critters', () => {
        const npc = makeCritter({ gender: 'male' })
        script.set_critter_gender_sfall(npc as any, 1)
        expect(script.get_critter_gender_sfall(npc as any)).toBe(1)
    })

    /**
     * Simulates the Elder checking how many temple rats the player killed
     * using get_critter_kills_sfall before awarding tribal warrior recognition.
     */
    it('Elder kill check: get_critter_kills_sfall returns 0 then reflects set value', () => {
        const player: any = {
            type: 'critter', pid: 0, name: 'Chosen One', isPlayer: true,
            inventory: [], xp: 0, level: 1, skills: null, perkRanks: {},
            getStat: (_s: string) => 5,
            stats: { getBase: (_s: string) => 5, setBase: vi.fn(), modifyBase: vi.fn() },
        }
        expect(script.get_critter_kills_sfall(player)).toBe(0)
        script.set_critter_kills_sfall(player, 5)
        expect(script.get_critter_kills_sfall(player)).toBe(5)
    })

    /**
     * Full Arroyo NPC init sequence:
     *   1. Critter spawned without charTraits → TRAIT_CHAR granted safely
     *   2. TRAIT_SKILL set on critter with null skills → no crash
     *   3. display_msg called with null message → no crash
     *   4. attack_complex called with null self_obj → no crash
     */
    it('Full Arroyo NPC init: trait grant → skill set → display msg → attack', () => {
        const npc = makeCritterNoCharTraits()
        expect(() => {
            script.critter_add_trait(npc, 2, 2, 1)  // grant a CHAR trait
            script.critter_add_trait(npc, 3, 0, 5)  // SKILL_SMALL_GUNS boost (no skills obj — no crash)
            script.display_msg(null as any)          // null message → no-op
            script.attack_complex(null as any, 0, 1, 0, 1, 5, 0, 0) // null self_obj → no-op
        }).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 90-G — checklist integrity', () => {
    it('BLK-176 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_176_attack_complex_null_self_obj')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-177 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_177_critter_add_trait_char_null_chartraits')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-178 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_178_critter_add_trait_skill_null_skills')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-179 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_179_display_msg_null_message')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall 0x82D8–0x82DF entries are all present in the checklist', () => {
        const ids = [
            'sfall_get_critter_body_type_90',
            'sfall_set_critter_body_type_90',
            'sfall_get_critter_weapon_type_90',
            'sfall_set_critter_weapon_type_90',
            'sfall_get_critter_kills_90',
            'sfall_set_critter_kills_90',
            'sfall_get_critter_gender_90',
            'sfall_set_critter_gender_90',
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
