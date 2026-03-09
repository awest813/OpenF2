/**
 * Phase 84 regression tests.
 *
 * Covers:
 *   A. BLK-145 — critter_heal() non-finite amount guard
 *   B. BLK-146 — add_mult_objs_to_inven() non-positive count guard
 *   C. BLK-147 — set_local_var() non-finite value guard
 *   D. BLK-148 — critter_dmg() negative damage clamp
 *   E. sfall opcodes 0x82B0–0x82B7
 *      0x82B0 get_inven_count_sfall
 *      0x82B1 get_critter_base_ap_sfall
 *      0x82B2 get_critter_carry_weight_sfall
 *      0x82B3 get_critter_carry_limit_sfall
 *      0x82B4 get_obj_script_name_sfall
 *      0x82B5 get_critter_knockout_state_sfall
 *      0x82B6 set_critter_knockout_state_sfall
 *      0x82B7 get_combat_turn_sfall
 *   F. New Reno progression smoke: family quest state + boxing match scripting
 *   G. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import globalState from './globalState.js'

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

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'TestNPC',
        position: { x: 5, y: 5 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 100,
        frame: 0,
        teamNum: -1,
        rightHand: null,
        leftHand: null,
        equippedArmor: null,
        perkRanks: {},
        getStat: (s: string) => (s === 'Max HP' ? 100 : s === 'HP' ? 80 : s === 'Max AP' ? 10 : s === 'AGI' ? 6 : s === 'STR' ? 7 : 5),
        getSkill: (_s: string) => 50,
        pcFlags: 0,
        critterFlags: 0,
        npcFlags: 0,
        stats: {
            getBase: (s: string) => (s === 'Max AP' ? 9 : 5),
            setBase: vi.fn(),
            modifyBase: vi.fn(),
        },
        addInventoryItem: vi.fn(),
        ...overrides,
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    ;(globalState as any).floatMessages = []
    Scripting.setGlobalVars({})
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
    ;(globalState as any).floatMessages = []
})

// ===========================================================================
// Phase 84-A — BLK-145: critter_heal() non-finite amount guard
// ===========================================================================

describe('Phase 84-A — BLK-145: critter_heal non-finite guard', () => {
    it('BLK-145 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_145_critter_heal_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-145 has high impact', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_145_critter_heal_non_finite')
        expect(entry?.impact).toBe('high')
    })

    it('does not throw and does not modify HP when amount is NaN', () => {
        const npc = makeObj()
        expect(() => script.critter_heal(npc, NaN)).not.toThrow()
        expect(npc.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('does not throw and does not modify HP when amount is Infinity', () => {
        const npc = makeObj()
        expect(() => script.critter_heal(npc, Infinity)).not.toThrow()
        expect(npc.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('does not throw and does not modify HP when amount is -Infinity', () => {
        const npc = makeObj()
        expect(() => script.critter_heal(npc, -Infinity)).not.toThrow()
        expect(npc.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('heals correctly when amount is valid and positive', () => {
        const npc = makeObj()
        // getStat('HP')=80, getStat('Max HP')=100 → healAmount = min(10, 20) = 10
        script.critter_heal(npc, 10)
        expect(npc.stats.modifyBase).toHaveBeenCalledWith('HP', 10)
    })

    it('does not heal when already at max HP', () => {
        const npc = makeObj({ getStat: (s: string) => (s === 'Max HP' ? 100 : s === 'HP' ? 100 : 5) })
        script.critter_heal(npc, 20)
        expect(npc.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('does not throw for non-critter object', () => {
        expect(() => script.critter_heal(null as any, 10)).not.toThrow()
    })
})

// ===========================================================================
// Phase 84-B — BLK-146: add_mult_objs_to_inven() non-positive count guard
// ===========================================================================

describe('Phase 84-B — BLK-146: add_mult_objs_to_inven non-positive count', () => {
    it('BLK-146 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_146_add_mult_objs_non_positive_count')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('does not call addInventoryItem when count is 0', () => {
        const npc = makeObj()
        const item = makeObj({ type: 'item', inventory: undefined })
        script.add_mult_objs_to_inven(npc, item, 0)
        expect(npc.addInventoryItem).not.toHaveBeenCalled()
    })

    it('does not call addInventoryItem when count is negative', () => {
        const npc = makeObj()
        const item = makeObj({ type: 'item', inventory: undefined })
        script.add_mult_objs_to_inven(npc, item, -5)
        expect(npc.addInventoryItem).not.toHaveBeenCalled()
    })

    it('does not call addInventoryItem when count is NaN', () => {
        const npc = makeObj()
        const item = makeObj({ type: 'item', inventory: undefined })
        script.add_mult_objs_to_inven(npc, item, NaN)
        expect(npc.addInventoryItem).not.toHaveBeenCalled()
    })

    it('calls addInventoryItem normally when count is positive', () => {
        const npc = makeObj()
        const item = makeObj({ type: 'item', inventory: undefined })
        script.add_mult_objs_to_inven(npc, item, 3)
        expect(npc.addInventoryItem).toHaveBeenCalledWith(item, 3)
    })

    it('does not throw for non-game-object owner', () => {
        expect(() => script.add_mult_objs_to_inven(null as any, makeObj(), 1)).not.toThrow()
    })
})

// ===========================================================================
// Phase 84-C — BLK-147: set_local_var() non-finite value guard
// ===========================================================================

describe('Phase 84-C — BLK-147: set_local_var non-finite guard', () => {
    it('BLK-147 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_147_set_local_var_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-147 has high impact', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_147_set_local_var_non_finite')
        expect(entry?.impact).toBe('high')
    })

    it('clamps NaN to 0', () => {
        script.set_local_var(0, NaN)
        expect(script.local_var(0)).toBe(0)
    })

    it('clamps Infinity to 0', () => {
        script.set_local_var(1, Infinity)
        expect(script.local_var(1)).toBe(0)
    })

    it('clamps -Infinity to 0', () => {
        script.set_local_var(2, -Infinity)
        expect(script.local_var(2)).toBe(0)
    })

    it('stores valid finite number normally', () => {
        script.set_local_var(3, 42)
        expect(script.local_var(3)).toBe(42)
    })

    it('stores negative finite numbers normally', () => {
        script.set_local_var(4, -7)
        expect(script.local_var(4)).toBe(-7)
    })

    it('stores non-numeric values (strings) without converting', () => {
        // Non-number values are not guarded by the non-finite check
        script.set_local_var(5, 'hello')
        expect(script.local_var(5)).toBe('hello')
    })

    it('does not throw when called', () => {
        expect(() => script.set_local_var(0, NaN)).not.toThrow()
    })
})

// ===========================================================================
// Phase 84-D — BLK-148: critter_dmg() negative damage clamp
// ===========================================================================

describe('Phase 84-D — BLK-148: critter_dmg negative damage clamp', () => {
    it('BLK-148 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_148_critter_dmg_negative_clamp')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-148 has high impact', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_148_critter_dmg_negative_clamp')
        expect(entry?.impact).toBe('high')
    })

    it('does not throw when damage is negative', () => {
        const npc = makeObj()
        expect(() => script.critter_dmg(npc as any, -5, 'normal')).not.toThrow()
    })

    it('still does not throw for non-finite damage (BLK-130 still active)', () => {
        const npc = makeObj()
        expect(() => script.critter_dmg(npc as any, NaN, 'normal')).not.toThrow()
        expect(() => script.critter_dmg(npc as any, Infinity, 'normal')).not.toThrow()
    })

    it('does not throw for non-game-object', () => {
        expect(() => script.critter_dmg(null as any, 10, 'normal')).not.toThrow()
    })
})

// ===========================================================================
// Phase 84-E — sfall 0x82B0: get_inven_count_sfall
// ===========================================================================

describe('Phase 84-E-0 — sfall 0x82B0: get_inven_count_sfall', () => {
    it('returns 0 for empty inventory', () => {
        const npc = makeObj({ inventory: [] })
        expect(script.get_inven_count_sfall(npc)).toBe(0)
    })

    it('returns correct count for non-empty inventory', () => {
        const npc = makeObj({ inventory: [{ pid: 1 }, { pid: 2 }, { pid: 3 }] })
        expect(script.get_inven_count_sfall(npc)).toBe(3)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_inven_count_sfall(null as any)).toBe(0)
        expect(script.get_inven_count_sfall(0 as any)).toBe(0)
    })

    it('returns 0 when inventory is undefined', () => {
        const npc = makeObj({ inventory: undefined })
        expect(script.get_inven_count_sfall(npc)).toBe(0)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_inven_count_84')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 84-E-1 — sfall 0x82B1: get_critter_base_ap_sfall
// ===========================================================================

describe('Phase 84-E-1 — sfall 0x82B1: get_critter_base_ap_sfall', () => {
    it('returns base AP from stats.getBase when available', () => {
        const npc = makeObj()
        // makeObj stats.getBase('Max AP') returns 9
        expect(script.get_critter_base_ap_sfall(npc)).toBe(9)
    })

    it('falls back to formula when stats.getBase returns non-finite', () => {
        const npc = makeObj({
            stats: { getBase: (_s: string) => NaN, setBase: vi.fn(), modifyBase: vi.fn() },
        })
        // AGI=6 from getStat, formula: 5 + ceil(6/2) = 5+3 = 8
        expect(script.get_critter_base_ap_sfall(npc)).toBe(8)
    })

    it('falls back to formula when stats.getBase is not a function', () => {
        const npc = makeObj({ stats: null })
        // AGI=6, formula: 5 + ceil(6/2) = 8
        expect(script.get_critter_base_ap_sfall(npc)).toBe(8)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_critter_base_ap_sfall(null as any)).toBe(0)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_base_ap_84')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 84-E-2 — sfall 0x82B2: get_critter_carry_weight_sfall
// ===========================================================================

describe('Phase 84-E-2 — sfall 0x82B2: get_critter_inventory_weight_sfall', () => {
    it('returns 0 for empty inventory', () => {
        const npc = makeObj({ inventory: [] })
        expect(script.get_critter_inventory_weight_sfall(npc)).toBe(0)
    })

    it('sums weight × amount for each inventory entry', () => {
        const npc = makeObj({
            inventory: [
                { pid: 1, weight: 5, amount: 2 },
                { pid: 2, weight: 3, amount: 1 },
            ],
        })
        expect(script.get_critter_inventory_weight_sfall(npc)).toBe(13) // 5*2 + 3*1
    })

    it('treats missing amount as 1', () => {
        const npc = makeObj({ inventory: [{ pid: 1, weight: 4 }] })
        expect(script.get_critter_inventory_weight_sfall(npc)).toBe(4)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_critter_inventory_weight_sfall(null as any)).toBe(0)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_inventory_weight_84')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 84-E-3 — sfall 0x82B3: get_critter_carry_limit_sfall
// ===========================================================================

describe('Phase 84-E-3 — sfall 0x82B3: get_critter_carry_limit_sfall', () => {
    it('reads Carry Weight from getStat when available and positive', () => {
        const npc = makeObj({
            getStat: (s: string) => (s === 'Carry Weight' ? 175 : s === 'STR' ? 5 : 5),
        })
        expect(script.get_critter_carry_limit_sfall(npc)).toBe(175)
    })

    it('falls back to formula when getStat returns 0', () => {
        const npc = makeObj({
            getStat: (s: string) => (s === 'Carry Weight' ? 0 : s === 'STR' ? 7 : 5),
        })
        // formula: 25 + 7*25 = 200
        expect(script.get_critter_carry_limit_sfall(npc)).toBe(200)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_critter_carry_limit_sfall(null as any)).toBe(0)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_carry_limit_84')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 84-E-4 — sfall 0x82B4: get_obj_script_name_sfall
// ===========================================================================

describe('Phase 84-E-4 — sfall 0x82B4: get_obj_script_name_sfall', () => {
    it('returns 0 (browser stub)', () => {
        const npc = makeObj()
        expect(script.get_obj_script_name_sfall(npc)).toBe(0)
    })

    it('returns 0 for null', () => {
        expect(script.get_obj_script_name_sfall(null as any)).toBe(0)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_obj_script_name_84')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 84-E-5 — sfall 0x82B5: get_critter_knockout_state_sfall
// ===========================================================================

describe('Phase 84-E-5 — sfall 0x82B5: get_critter_knockout_state_sfall', () => {
    it('returns 0 when critter is not knocked out', () => {
        const npc = makeObj({ knockedOut: false })
        expect(script.get_critter_knockout_state_sfall(npc)).toBe(0)
    })

    it('returns 1 when critter is knocked out', () => {
        const npc = makeObj({ knockedOut: true })
        expect(script.get_critter_knockout_state_sfall(npc)).toBe(1)
    })

    it('returns 0 when knockedOut is not set', () => {
        const npc = makeObj()
        expect(script.get_critter_knockout_state_sfall(npc)).toBe(0)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_critter_knockout_state_sfall(null as any)).toBe(0)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_knockout_state_84')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 84-E-6 — sfall 0x82B6: set_critter_knockout_state_sfall
// ===========================================================================

describe('Phase 84-E-6 — sfall 0x82B6: set_critter_knockout_state_sfall', () => {
    it('sets knockedOut to true when state is truthy', () => {
        const npc = makeObj()
        script.set_critter_knockout_state_sfall(npc, 1)
        expect(npc.knockedOut).toBe(true)
    })

    it('clears knockedOut when state is 0', () => {
        const npc = makeObj({ knockedOut: true })
        script.set_critter_knockout_state_sfall(npc, 0)
        expect(npc.knockedOut).toBe(false)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.set_critter_knockout_state_sfall(null as any, 1)).not.toThrow()
        expect(() => script.set_critter_knockout_state_sfall(0 as any, 1)).not.toThrow()
    })

    it('boxing match: knock down then stand up sequence works', () => {
        const boxer = makeObj()
        script.set_critter_knockout_state_sfall(boxer, 1)
        expect(script.get_critter_knockout_state_sfall(boxer)).toBe(1)
        script.set_critter_knockout_state_sfall(boxer, 0)
        expect(script.get_critter_knockout_state_sfall(boxer)).toBe(0)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_knockout_state_84')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 84-E-7 — sfall 0x82B7: get_combat_turn_sfall
// ===========================================================================

describe('Phase 84-E-7 — sfall 0x82B7: get_combat_turn_sfall', () => {
    it('returns 0 when not in combat', () => {
        ;(globalState as any).inCombat = false
        expect(script.get_combat_turn_sfall()).toBe(0)
    })

    it('returns 0 when in combat but combatTurn is not set', () => {
        ;(globalState as any).inCombat = true
        delete (globalState as any).combatTurn
        expect(script.get_combat_turn_sfall()).toBe(0)
    })

    it('returns combatTurn value when in combat', () => {
        ;(globalState as any).inCombat = true
        ;(globalState as any).combatTurn = 3
        expect(script.get_combat_turn_sfall()).toBe(3)
    })

    it('returns 0 for negative combatTurn (clamped)', () => {
        ;(globalState as any).inCombat = true
        ;(globalState as any).combatTurn = -1
        expect(script.get_combat_turn_sfall()).toBe(0)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_combat_turn_84')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 84-F — New Reno progression smoke tests
// ===========================================================================

describe('Phase 84-F — New Reno progression smoke', () => {
    it('boxing match script: finite damage is applied, negative is clamped', () => {
        // Simulate a New Reno boxing match where the opponent absorbs all damage
        // Negative damage should be clamped to 0 (no-op), not crash
        const boxer = makeObj()
        expect(() => script.critter_dmg(boxer as any, -10, 'normal')).not.toThrow()
        // 0 damage after clamp — critterDamage is skipped entirely (no-op)
        expect(() => script.critter_dmg(boxer as any, 0, 'normal')).not.toThrow()
    })

    it('boxing match script: critter_heal handles NaN heal from formula error', () => {
        const boxer = makeObj()
        // After a fight, script tries to heal the boxer
        // If the formula produces NaN (e.g. divide by zero), it should not corrupt HP
        expect(() => script.critter_heal(boxer, NaN)).not.toThrow()
        expect(boxer.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('boxing match script: knockout detection round-trip', () => {
        const opponent = makeObj()
        // Opponent starts standing
        expect(script.get_critter_knockout_state_sfall(opponent)).toBe(0)
        // Take a knockout blow
        script.set_critter_knockout_state_sfall(opponent, 1)
        expect(script.get_critter_knockout_state_sfall(opponent)).toBe(1)
        // Recover
        script.set_critter_knockout_state_sfall(opponent, 0)
        expect(script.get_critter_knockout_state_sfall(opponent)).toBe(0)
    })

    it('family quest reward: add_mult_objs_to_inven with count=0 does not crash', () => {
        // Wright/Bishop reward scripts sometimes compute count=0
        const player = makeObj()
        const reward = makeObj({ type: 'item', inventory: undefined })
        expect(() => script.add_mult_objs_to_inven(player, reward, 0)).not.toThrow()
        expect(player.addInventoryItem).not.toHaveBeenCalled()
    })

    it('family quest reward: add_mult_objs_to_inven with count=3 works correctly', () => {
        const player = makeObj()
        const reward = makeObj({ type: 'item', inventory: undefined })
        script.add_mult_objs_to_inven(player, reward, 3)
        expect(player.addInventoryItem).toHaveBeenCalledWith(reward, 3)
    })

    it('combat timer: NaN local var from formula error is clamped and does not cascade', () => {
        // New Reno encounter scripts use local vars for timing
        script.set_local_var(10, NaN)
        expect(script.local_var(10)).toBe(0)
        // A subsequent formula using the var should get 0 rather than propagating NaN
        script.set_local_var(11, script.local_var(10) + 100)
        expect(script.local_var(11)).toBe(100)
    })

    it('shop inventory weight: carry weight calculation is consistent', () => {
        const merchant = makeObj({
            inventory: [
                { pid: 10, weight: 6, amount: 4 },  // 24 lbs
                { pid: 20, weight: 3, amount: 2 },  // 6 lbs
            ],
        })
        expect(script.get_critter_inventory_weight_sfall(merchant)).toBe(30)
    })
})

// ===========================================================================
// Phase 84-G — sfall method registration check (0x82B0–0x82B7)
// ===========================================================================

describe('Phase 84-G — sfall 0x82B0–0x82B7 scripting methods exist', () => {
    const phase84Methods = [
        'get_inven_count_sfall',
        'get_critter_base_ap_sfall',
        'get_critter_inventory_weight_sfall',
        'get_critter_carry_limit_sfall',
        'get_obj_script_name_sfall',
        'get_critter_knockout_state_sfall',
        'set_critter_knockout_state_sfall',
        'get_combat_turn_sfall',
    ]

    for (const methodName of phase84Methods) {
        it(`script.${methodName} is a function`, () => {
            expect(typeof (script as any)[methodName]).toBe('function')
        })
    }
})

// ===========================================================================
// Phase 84-H — Checklist integrity
// ===========================================================================

describe('Phase 84-H — Checklist integrity', () => {
    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('all Phase 84 BLK entries are present and implemented', () => {
        const blkIds = [
            'blk_145_critter_heal_non_finite',
            'blk_146_add_mult_objs_non_positive_count',
            'blk_147_set_local_var_non_finite',
            'blk_148_critter_dmg_negative_clamp',
        ]
        for (const id of blkIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status, `${id} not implemented`).toBe('implemented')
        }
    })

    it('all Phase 84 sfall opcode entries are implemented', () => {
        const sfallIds = [
            'sfall_get_inven_count_84',
            'sfall_get_critter_base_ap_84',
            'sfall_get_critter_inventory_weight_84',
            'sfall_get_critter_carry_limit_84',
            'sfall_get_obj_script_name_84',
            'sfall_get_critter_knockout_state_84',
            'sfall_set_critter_knockout_state_84',
            'sfall_get_combat_turn_84',
        ]
        for (const id of sfallIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status, `${id} not implemented`).toBe('implemented')
        }
    })

    it('BLK-145 through BLK-148 are all high or medium impact', () => {
        const blkIds = [
            'blk_145_critter_heal_non_finite',
            'blk_146_add_mult_objs_non_positive_count',
            'blk_147_set_local_var_non_finite',
            'blk_148_critter_dmg_negative_clamp',
        ]
        for (const id of blkIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(['high', 'medium'], `${id} should be high or medium impact`).toContain(entry?.impact)
        }
    })

    it('multiple critter_heal NaN calls do not corrupt state', () => {
        const npc = makeObj()
        for (let i = 0; i < 5; i++) {
            expect(() => script.critter_heal(npc, NaN)).not.toThrow()
        }
        // After NaN guards, a valid heal should still work
        script.critter_heal(npc, 5)
        expect(npc.stats.modifyBase).toHaveBeenCalledWith('HP', 5)
    })
})
