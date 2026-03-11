/**
 * Phase 93 regression tests — Arroyo debug and polish (continued).
 *
 * Covers:
 *   A. BLK-190 — inven_cmds() null inventory guard
 *   B. BLK-191 — has_skill() missing getSkill() method guard
 *   C. BLK-192 — critter_attempt_placement() non-finite tile guard
 *   D. BLK-193 — drop_obj() null source inventory guard
 *   E. BLK-194 — pickup_obj() null player inventory guard
 *   F. sfall opcodes 0x82F0–0x82F7
 *      0x82F0 get_critter_hp_sfall2 (alias of get_critter_hp)
 *      0x82F1 set_critter_hp_sfall2 (alias of set_critter_hp)
 *      0x82F2 get_critter_max_hp_sfall2 (alias of get_critter_max_hp_sfall)
 *      0x82F3 set_critter_max_hp_sfall2 (alias of set_critter_max_hp_sfall)
 *      0x82F4 get_critter_melee_dmg_sfall
 *      0x82F5 set_critter_melee_dmg_sfall
 *      0x82F6 get_critter_critical_chance_sfall
 *      0x82F7 set_critter_critical_chance_sfall
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
    s.scriptName = 'test_phase93'
    return s
}

function makeCritter(opts: {
    hp?: number
    maxHp?: number
    inventory?: any[] | null
    skills?: any
    getSkill?: ((s: string) => number) | null
    stats?: Record<string, number>
    position?: { x: number; y: number } | null
    level?: number
} = {}): any {
    const stats: Record<string, number> = {
        'HP': opts.hp ?? 80,
        'Max HP': opts.maxHp ?? 100,
        'Poison Level': 0,
        'Radiation Level': 0,
        'Healing Rate': 2,
        'Sequence': 5,
        'Melee Damage': 4,
        'Critical Chance': 5,
        ...(opts.stats ?? {}),
    }
    const obj: any = {
        type: 'critter',
        pid: 0x01000001,
        name: 'TestCritter',
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
        skills: opts.skills !== undefined ? opts.skills : {
            skillPoints: 5,
            getBase: (_s: string) => 30,
            setBase: vi.fn(),
            baseSkills: {} as Record<string, number>,
        },
    }
    // Inventory: null means explicitly absent (no property); array means present
    if (opts.inventory === null) {
        // leave inventory unset (simulate freshly spawned critter)
    } else {
        obj.inventory = opts.inventory ?? []
    }
    // getSkill: null means omit entirely; function means attach it
    if (opts.getSkill === null) {
        // omit getSkill
    } else {
        obj.getSkill = opts.getSkill ?? ((_s: string) => 30)
    }
    return obj
}

/** Critter with no inventory array (freshly spawned via create_object_sid). */
function makeCritterNoInventory(): any {
    return makeCritter({ inventory: null })
}

/** Critter with no getSkill() method (proto-only NPC). */
function makeCritterNoGetSkill(): any {
    return makeCritter({ getSkill: null })
}

const NULL_OBJ = 0

// ---------------------------------------------------------------------------
// A. BLK-190: inven_cmds() null inventory guard
// ---------------------------------------------------------------------------

describe('Phase 93-A — BLK-190: inven_cmds() null inventory guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
    })

    it('returns null without throwing when critter has no inventory (INVEN_CMD_FIRST)', () => {
        const npc = makeCritterNoInventory()
        expect(npc.inventory).toBeUndefined()
        expect(() => script.inven_cmds(npc, 0, 0)).not.toThrow()
        expect(script.inven_cmds(npc, 0, 0)).toBeNull()
    })

    it('returns null without throwing when critter has no inventory (INVEN_CMD_LAST)', () => {
        const npc = makeCritterNoInventory()
        expect(() => script.inven_cmds(npc, 1, 0)).not.toThrow()
        expect(script.inven_cmds(npc, 1, 0)).toBeNull()
    })

    it('returns null without throwing when critter has no inventory (INVEN_CMD_NEXT)', () => {
        const npc = makeCritterNoInventory()
        expect(() => script.inven_cmds(npc, 3, 0)).not.toThrow()
        expect(script.inven_cmds(npc, 3, 0)).toBeNull()
    })

    it('returns null for non-critter input', () => {
        expect(() => script.inven_cmds(NULL_OBJ, 0, 0)).not.toThrow()
        expect(script.inven_cmds(NULL_OBJ, 0, 0)).toBeNull()
    })

    it('returns first item normally when critter has a valid inventory', () => {
        const item = { type: 'item', subtype: 'misc', pid: 0x1234, name: 'FlintPiece', visible: true, orientation: 0, position: { x: 10, y: 10 } }
        const npc = makeCritter({ inventory: [item] })
        expect(script.inven_cmds(npc, 0, 0)).toBe(item)
    })

    it('returns null for INVEN_CMD_FIRST when critter has empty inventory', () => {
        const npc = makeCritter({ inventory: [] })
        expect(script.inven_cmds(npc, 0, 0)).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// B. BLK-191: has_skill() missing getSkill() method guard
// ---------------------------------------------------------------------------

describe('Phase 93-B — BLK-191: has_skill() missing getSkill method guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
    })

    it('returns 0 without throwing when critter has no getSkill method', () => {
        const protoNpc = makeCritterNoGetSkill()
        expect(protoNpc.getSkill).toBeUndefined()
        expect(() => script.has_skill(protoNpc, 3 /* Unarmed */)).not.toThrow()
        expect(script.has_skill(protoNpc, 3)).toBe(0)
    })

    it('returns skill value normally when critter has getSkill', () => {
        const npc = makeCritter()
        expect(typeof npc.getSkill).toBe('function')
        expect(script.has_skill(npc, 3)).toBe(30)
    })

    it('returns 0 for a null object', () => {
        expect(() => script.has_skill(NULL_OBJ, 3)).not.toThrow()
        expect(script.has_skill(NULL_OBJ, 3)).toBe(0)
    })

    it('returns 0 for unknown skill number even without getSkill', () => {
        const protoNpc = makeCritterNoGetSkill()
        expect(() => script.has_skill(protoNpc, 999)).not.toThrow()
        expect(script.has_skill(protoNpc, 999)).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// C. BLK-192: critter_attempt_placement() non-finite tile guard
// ---------------------------------------------------------------------------

describe('Phase 93-C — BLK-192: critter_attempt_placement() non-finite tile guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
        globalState.gMap = null as any
    })

    it('returns -1 without throwing when tileNum is NaN', () => {
        const npc = makeCritter()
        expect(() => script.critter_attempt_placement(npc, NaN, 0)).not.toThrow()
        expect(script.critter_attempt_placement(npc, NaN, 0)).toBe(-1)
    })

    it('returns -1 when tileNum is Infinity', () => {
        const npc = makeCritter()
        expect(script.critter_attempt_placement(npc, Infinity, 0)).toBe(-1)
    })

    it('returns -1 when tileNum is -Infinity', () => {
        const npc = makeCritter()
        expect(script.critter_attempt_placement(npc, -Infinity, 0)).toBe(-1)
    })

    it('returns -1 when tileNum is 0 (pre-existing behaviour)', () => {
        const npc = makeCritter()
        expect(script.critter_attempt_placement(npc, 0, 0)).toBe(-1)
    })

    it('returns -1 when tileNum is negative (pre-existing behaviour)', () => {
        const npc = makeCritter()
        expect(script.critter_attempt_placement(npc, -5, 0)).toBe(-1)
    })

    it('returns -1 when obj is null', () => {
        expect(script.critter_attempt_placement(NULL_OBJ, 100, 0)).toBe(-1)
    })

    it('returns -1 when gMap is null (no crash for valid tile)', () => {
        const npc = makeCritter()
        globalState.gMap = null as any
        expect(() => script.critter_attempt_placement(npc, 100, 0)).not.toThrow()
        expect(script.critter_attempt_placement(npc, 100, 0)).toBe(-1)
    })
})

// ---------------------------------------------------------------------------
// D. BLK-193: drop_obj() null source inventory guard
// ---------------------------------------------------------------------------

describe('Phase 93-D — BLK-193: drop_obj() null source inventory guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
        globalState.gMap = null as any
    })

    it('does not throw when self_obj has no inventory array', () => {
        const item = { type: 'item', subtype: 'misc', pid: 0x1234, name: 'Flint', visible: true, orientation: 0, position: { x: 20, y: 20 } }
        const npc = makeCritterNoInventory()
        script.self_obj = npc
        expect(() => script.drop_obj(item)).not.toThrow()
    })

    it('does not throw when player has no inventory array', () => {
        const item = { type: 'item', subtype: 'misc', pid: 0x5678, name: 'Spear', visible: true, orientation: 0, position: { x: 20, y: 20 } }
        script.self_obj = null
        globalState.player = {
            type: 'critter',
            inventory: null as any,
            position: { x: 30, y: 30 },
        } as any
        expect(() => script.drop_obj(item)).not.toThrow()
        globalState.player = null as any
    })

    it('removes item from inventory normally when source has valid inventory', () => {
        const item = { type: 'item', subtype: 'misc', pid: 0x9999, name: 'Root', visible: true, orientation: 0, position: { x: 10, y: 10 } }
        const npc = makeCritter({ inventory: [item], position: { x: 40, y: 40 } })
        script.self_obj = npc
        expect(() => script.drop_obj(item)).not.toThrow()
        expect(npc.inventory).not.toContain(item)
    })

    it('does not throw for a null item', () => {
        const npc = makeCritter()
        script.self_obj = npc
        expect(() => script.drop_obj(NULL_OBJ)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// E. BLK-194: pickup_obj() null player inventory guard
// ---------------------------------------------------------------------------

describe('Phase 93-E — BLK-194: pickup_obj() null player inventory guard', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
        globalState.gMap = null as any
    })

    it('does not throw when player.inventory is null', () => {
        const item = { type: 'item', subtype: 'misc', pid: 0xAAAA, name: 'Berry', visible: true, orientation: 0, position: { x: 5, y: 5 } }
        globalState.player = {
            type: 'critter',
            inventory: null as any,
        } as any
        expect(() => script.pickup_obj(item)).not.toThrow()
        globalState.player = null as any
    })

    it('does not throw when player.inventory is undefined', () => {
        const item = { type: 'item', subtype: 'misc', pid: 0xBBBB, name: 'Nut', visible: true, orientation: 0, position: { x: 6, y: 6 } }
        globalState.player = {
            type: 'critter',
        } as any
        expect(() => script.pickup_obj(item)).not.toThrow()
        globalState.player = null as any
    })

    it('adds item to player inventory when array is valid', () => {
        const item = { type: 'item', subtype: 'misc', pid: 0xCCCC, name: 'Meat', visible: true, orientation: 0, position: { x: 7, y: 7 } }
        const inv: any[] = []
        globalState.player = {
            type: 'critter',
            inventory: inv,
        } as any
        expect(() => script.pickup_obj(item)).not.toThrow()
        expect(inv).toContain(item)
        globalState.player = null as any
    })

    it('does not throw for a null item', () => {
        globalState.player = { type: 'critter', inventory: [] } as any
        expect(() => script.pickup_obj(NULL_OBJ)).not.toThrow()
        globalState.player = null as any
    })

    it('does not throw when player is null', () => {
        const item = { type: 'item', subtype: 'misc', pid: 0xDDDD, name: 'Herb', visible: true, orientation: 0, position: { x: 8, y: 8 } }
        globalState.player = null as any
        expect(() => script.pickup_obj(item)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// F. sfall opcodes 0x82F0–0x82F7
// ---------------------------------------------------------------------------

describe('Phase 93-F — sfall opcodes 0x82F0–0x82F7', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
    })

    // 0x82F0 get_critter_hp_sfall2
    it('0x82F0 get_critter_hp_sfall2 returns critter HP', () => {
        const npc = makeCritter({ hp: 55 })
        expect(script.get_critter_hp_sfall2(npc)).toBe(55)
    })

    it('0x82F0 get_critter_hp_sfall2 returns 0 for non-critter', () => {
        expect(script.get_critter_hp_sfall2(NULL_OBJ)).toBe(0)
    })

    // 0x82F1 set_critter_hp_sfall2
    it('0x82F1 set_critter_hp_sfall2 sets HP without throwing', () => {
        const npc = makeCritter({ hp: 50 })
        expect(() => script.set_critter_hp_sfall2(npc, 70)).not.toThrow()
    })

    it('0x82F1 set_critter_hp_sfall2 does not throw for non-critter', () => {
        expect(() => script.set_critter_hp_sfall2(NULL_OBJ, 50)).not.toThrow()
    })

    // 0x82F2 get_critter_max_hp_sfall2
    it('0x82F2 get_critter_max_hp_sfall2 returns max HP', () => {
        const npc = makeCritter({ maxHp: 120 })
        expect(script.get_critter_max_hp_sfall2(npc)).toBe(120)
    })

    it('0x82F2 get_critter_max_hp_sfall2 returns 0 for non-critter', () => {
        expect(script.get_critter_max_hp_sfall2(NULL_OBJ)).toBe(0)
    })

    // 0x82F3 set_critter_max_hp_sfall2
    it('0x82F3 set_critter_max_hp_sfall2 does not throw for valid critter', () => {
        const npc = makeCritter({ maxHp: 100 })
        expect(() => script.set_critter_max_hp_sfall2(npc, 150)).not.toThrow()
    })

    it('0x82F3 set_critter_max_hp_sfall2 does not throw for non-critter', () => {
        expect(() => script.set_critter_max_hp_sfall2(NULL_OBJ, 100)).not.toThrow()
    })

    // 0x82F4 get_critter_melee_dmg_sfall
    it('0x82F4 get_critter_melee_dmg_sfall returns Melee Damage stat', () => {
        const npc = makeCritter({ stats: { 'Melee Damage': 7 } })
        expect(script.get_critter_melee_dmg_sfall(npc)).toBe(7)
    })

    it('0x82F4 get_critter_melee_dmg_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_melee_dmg_sfall(NULL_OBJ)).toBe(0)
    })

    // 0x82F5 set_critter_melee_dmg_sfall
    it('0x82F5 set_critter_melee_dmg_sfall stores the value', () => {
        const npc = makeCritter()
        script.set_critter_melee_dmg_sfall(npc, 10)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Melee Damage', 10)
    })

    it('0x82F5 set_critter_melee_dmg_sfall coerces NaN to 0', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_melee_dmg_sfall(npc, NaN)).not.toThrow()
        expect(npc.stats.setBase).toHaveBeenCalledWith('Melee Damage', 0)
    })

    it('0x82F5 set_critter_melee_dmg_sfall does not throw for non-critter', () => {
        expect(() => script.set_critter_melee_dmg_sfall(NULL_OBJ, 5)).not.toThrow()
    })

    // 0x82F6 get_critter_critical_chance_sfall
    it('0x82F6 get_critter_critical_chance_sfall returns Critical Chance stat', () => {
        const npc = makeCritter({ stats: { 'Critical Chance': 15 } })
        expect(script.get_critter_critical_chance_sfall(npc)).toBe(15)
    })

    it('0x82F6 get_critter_critical_chance_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_critical_chance_sfall(NULL_OBJ)).toBe(0)
    })

    // 0x82F7 set_critter_critical_chance_sfall
    it('0x82F7 set_critter_critical_chance_sfall stores the value clamped to [0,100]', () => {
        const npc = makeCritter()
        script.set_critter_critical_chance_sfall(npc, 25)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Critical Chance', 25)
    })

    it('0x82F7 set_critter_critical_chance_sfall clamps to 100 for values over 100', () => {
        const npc = makeCritter()
        script.set_critter_critical_chance_sfall(npc, 150)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Critical Chance', 100)
    })

    it('0x82F7 set_critter_critical_chance_sfall clamps to 0 for negative values', () => {
        const npc = makeCritter()
        script.set_critter_critical_chance_sfall(npc, -5)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Critical Chance', 0)
    })

    it('0x82F7 set_critter_critical_chance_sfall coerces NaN to 0', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_critical_chance_sfall(npc, NaN)).not.toThrow()
        expect(npc.stats.setBase).toHaveBeenCalledWith('Critical Chance', 0)
    })

    it('0x82F7 set_critter_critical_chance_sfall does not throw for non-critter', () => {
        expect(() => script.set_critter_critical_chance_sfall(NULL_OBJ, 10)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Arroyo end-sequence integration smoke tests
// ---------------------------------------------------------------------------

describe('Phase 93-G — Arroyo end-sequence integration smoke tests', () => {
    let script: any

    beforeEach(() => {
        script = makeScript()
        globalState.gMap = null as any
    })

    /**
     * Simulate the arroyo temple end sequence:
     *   1. inven_cmds on freshly-spawned critter with no inventory
     *   2. has_skill on proto-only NPC (no getSkill)
     *   3. critter_attempt_placement with NaN tile
     *   4. drop_obj from critter with no inventory
     *   5. pickup_obj with null player inventory
     *   6. sfall HP / melee / critical-chance queries
     */
    it('arroyo temple exit sequence completes without throwing', () => {
        const noInvNpc = makeCritterNoInventory()
        const noSkillNpc = makeCritterNoGetSkill()
        const normalNpc = makeCritter({ hp: 60, stats: { 'Melee Damage': 6, 'Critical Chance': 10 } })
        const item = { type: 'item', subtype: 'misc', pid: 0x3333, name: 'Antler', visible: true, orientation: 0, position: { x: 10, y: 10 } }

        globalState.player = {
            type: 'critter',
            inventory: null as any,
        } as any

        expect(() => {
            // 1. inventory command on no-inventory critter
            const first = script.inven_cmds(noInvNpc, 0, 0)
            expect(first).toBeNull()

            // 2. skill check on proto-only NPC
            expect(script.has_skill(noSkillNpc, 3)).toBe(0)

            // 3. placement with NaN tile
            expect(script.critter_attempt_placement(normalNpc, NaN, 0)).toBe(-1)

            // 4. drop from no-inventory critter
            script.self_obj = noInvNpc
            script.drop_obj(item)

            // 5. pickup with null inventory
            script.pickup_obj(item)

            // 6. sfall stat queries
            expect(script.get_critter_hp_sfall2(normalNpc)).toBe(60)
            expect(script.get_critter_melee_dmg_sfall(normalNpc)).toBe(6)
            expect(script.get_critter_critical_chance_sfall(normalNpc)).toBe(10)
        }).not.toThrow()

        globalState.player = null as any
    })

    it('sfall HP and max HP round-trip', () => {
        const npc = makeCritter({ hp: 40, maxHp: 90 })
        expect(script.get_critter_hp_sfall2(npc)).toBe(40)
        expect(script.get_critter_max_hp_sfall2(npc)).toBe(90)
        expect(() => script.set_critter_hp_sfall2(npc, 60)).not.toThrow()
        expect(() => script.set_critter_max_hp_sfall2(npc, 120)).not.toThrow()
    })

    it('sfall melee dmg and critical chance round-trip', () => {
        const npc = makeCritter()
        script.set_critter_melee_dmg_sfall(npc, 8)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Melee Damage', 8)
        script.set_critter_critical_chance_sfall(npc, 20)
        expect(npc.stats.setBase).toHaveBeenCalledWith('Critical Chance', 20)
    })
})

// ---------------------------------------------------------------------------
// H. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 93-H — checklist integrity', () => {
    it('BLK-190 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_190_inven_cmds_null_inventory')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-191 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_191_has_skill_no_getskill')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-192 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_192_critter_attempt_placement_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-193 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_193_drop_obj_null_inventory')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-194 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_194_pickup_obj_null_inventory')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall 0x82F0–0x82F7 entries are all present in the checklist', () => {
        const ids = [
            'sfall_get_critter_hp2_93',
            'sfall_set_critter_hp2_93',
            'sfall_get_critter_max_hp2_93',
            'sfall_set_critter_max_hp2_93',
            'sfall_get_critter_melee_dmg_93',
            'sfall_set_critter_melee_dmg_93',
            'sfall_get_critter_critical_chance_93',
            'sfall_set_critter_critical_chance_93',
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
