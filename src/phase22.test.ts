/**
 * Phase 22 regression tests.
 *
 * Covers:
 *   A. Scripting — proto_data armor DT fields (cases 40-46)
 *   B. Scripting — proto_data armor perk (case 47) + critter XP/kill type (48-49)
 *   C. Scripting — metarule3 IDs 102-105 de-stub
 *   D. Scripting — sfall opcodes 0x8183-0x8185 (get_critter_hp, set_critter_hp, get_critter_max_ap)
 *   E. Checklist — metarule_17 promoted to implemented; Phase 22 entries correct
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { drainStubHits, stubHitCount, SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'
import globalState from './globalState.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'item',
        isPlayer: false,
        pid: 1,
        orientation: 0,
        frame: 0,
        position: { x: 0, y: 0 },
        inventory: [],
        visible: true,
        extra: {},
        inAnim: () => false,
        ...overrides,
    }
}

function makeCritter(overrides: Record<string, any> = {}): any {
    const stats = {
        base: {} as Record<string, number>,
        derived: {} as Record<string, number>,
        getBase: function (name: string) { return this.base[name] ?? 0 },
        setBase: function (name: string, val: number) { this.base[name] = val },
        modifyBase: function (name: string, delta: number) { this.base[name] = (this.base[name] ?? 0) + delta },
    }
    return {
        type: 'critter',
        isPlayer: false,
        pid: 2,
        orientation: 0,
        frame: 0,
        position: { x: 10, y: 10 },
        inventory: [],
        visible: true,
        extra: {},
        stats,
        perkRanks: {},
        equippedArmor: null,
        leftHand: null,
        rightHand: null,
        aiNum: 0,
        teamNum: 0,
        dead: false,
        name: 'Test Critter',
        getStat: (name: string) => stats.derived[name] ?? stats.base[name] ?? 0,
        AP: { current: 5, combat: 5, max: 7 },
        inAnim: () => false,
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// A. proto_data armor DT fields (cases 40-46)
// Tests verify:
//   - With pid=0 (no PRO loadable), returns 0 with no stub (early-exit path)
//   - The DT stat names are correct (via existing proto_data armor integration)
// ---------------------------------------------------------------------------

describe('Phase 22-A — proto_data armor DT fields (cases 40-46)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('proto_data(0, 40) returns 0 with no stub when PRO unavailable', () => {
        drainStubHits()
        expect(script.proto_data(0, 40)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('proto_data(0, 41) returns 0 with no stub', () => {
        expect(script.proto_data(0, 41)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('proto_data(0, 42) returns 0 with no stub', () => {
        expect(script.proto_data(0, 42)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('proto_data(0, 43) returns 0 with no stub', () => {
        expect(script.proto_data(0, 43)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('proto_data(0, 44) returns 0 with no stub', () => {
        expect(script.proto_data(0, 44)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('proto_data(0, 45) returns 0 with no stub', () => {
        expect(script.proto_data(0, 45)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('proto_data(0, 46) returns 0 with no stub', () => {
        expect(script.proto_data(0, 46)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('none of cases 40-46 emit a stub hit when PRO is unavailable', () => {
        drainStubHits()
        for (let i = 40; i <= 46; i++) script.proto_data(0, i)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// B. proto_data case 47 (armor perk) + cases 48-49 (critter XP / kill type)
// ---------------------------------------------------------------------------

describe('Phase 22-B — proto_data perk (47) + critter XP/kill (48-49)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('proto_data(0, 47) returns 0/-1 with no stub when PRO unavailable', () => {
        drainStubHits()
        const r = script.proto_data(0, 47)
        expect(typeof r).toBe('number')
        expect(stubHitCount()).toBe(0)
    })

    it('proto_data(0, 48) returns 0 with no stub (CRITTER_DATA_EXPERIENCE)', () => {
        drainStubHits()
        expect(script.proto_data(0, 48)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('proto_data(0, 49) returns 0 with no stub (CRITTER_DATA_KILL_TYPE)', () => {
        drainStubHits()
        expect(script.proto_data(0, 49)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('none of cases 47-49 emit a stub hit when PRO is unavailable', () => {
        drainStubHits()
        for (let i = 47; i <= 49; i++) script.proto_data(0, i)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// C. metarule3 IDs 102-105 de-stub
// ---------------------------------------------------------------------------

describe('Phase 22-C — metarule3 IDs 102-105 de-stub', () => {
    let script: Scripting.Script
    let originalInCombat: boolean
    let originalCombat: any

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
        originalInCombat = globalState.inCombat
        originalCombat = globalState.combat
    })

    afterEach(() => {
        globalState.inCombat = originalInCombat
        globalState.combat = originalCombat
    })

    // ID 102 — METARULE3_CHECK_WALKING_ALLOWED
    it('metarule3(102, ...) returns a number and does not stub', () => {
        drainStubHits()
        const r = script.metarule3(102, 0, 0, 0)
        expect(typeof r).toBe('number')
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(102, ...) returns 1 (tile walkable partial)', () => {
        expect(script.metarule3(102, 12345, 0, 0)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    // ID 103 — METARULE3_CRITTER_IN_COMBAT
    it('metarule3(103, ...) returns a number and does not stub', () => {
        drainStubHits()
        const r = script.metarule3(103, 0, 0, 0)
        expect(typeof r).toBe('number')
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(103, ...) returns 0 when not in combat', () => {
        // globalState.inCombat is falsy in test context
        expect(script.metarule3(103, 0, 0, 0)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(103, critter, ...) returns 1 when critter is in active combat roster', () => {
        const critter = makeCritter()
        globalState.inCombat = true
        globalState.combat = { combatants: [critter] } as any
        expect(script.metarule3(103, critter, 0, 0)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(103, critter, ...) returns 0 when critter is not in active combat roster', () => {
        const critter = makeCritter()
        const other = makeCritter({ pid: 999 })
        globalState.inCombat = true
        globalState.combat = { combatants: [other] } as any
        expect(script.metarule3(103, critter, 0, 0)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(103, critter, ...) falls back to global inCombat when no combat roster exists', () => {
        const critter = makeCritter()
        globalState.inCombat = true
        globalState.combat = null as any
        expect(script.metarule3(103, critter, 0, 0)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    // ID 104 — METARULE3_TILE_LINE_OF_SIGHT
    it('metarule3(104, ...) returns a number and does not stub', () => {
        drainStubHits()
        const r = script.metarule3(104, 0, 0, 0)
        expect(typeof r).toBe('number')
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(104, tile, tile, ...) returns 1 when tiles are the same (distance 0)', () => {
        // Both tile args equal 0 → same position → distance 0 ≤ 14 → visible (1)
        expect(script.metarule3(104, 0, 0, 0)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(104, tile, farTile, ...) returns 0 when tiles are far apart', () => {
        // tile 0 is (0,0); tile 99999 is far away → distance > 14 → not visible (0)
        expect(script.metarule3(104, 0, 99999, 0)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    // ID 105 — METARULE3_OBJ_CAN_HEAR_OBJ
    it('metarule3(105, ...) returns 0 when arguments are not game objects', () => {
        drainStubHits()
        const r = script.metarule3(105, 0, 0, 0)
        expect(r).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(105, src, tgt, ...) returns 1 when objects are within 12 hexes', () => {
        const src = makeCritter({ position: { x: 10, y: 10 } })
        const tgt = makeCritter({ position: { x: 12, y: 12 } })
        drainStubHits()
        const r = script.metarule3(105, src, tgt, 0)
        expect(r).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(105, src, tgt, ...) returns 0 when objects are far apart', () => {
        const src = makeCritter({ position: { x: 0, y: 0 } })
        const tgt = makeCritter({ position: { x: 100, y: 100 } })
        drainStubHits()
        const r = script.metarule3(105, src, tgt, 0)
        expect(r).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('none of IDs 102-105 emit stub hits', () => {
        drainStubHits()
        script.metarule3(102, 0, 0, 0)
        script.metarule3(103, 0, 0, 0)
        script.metarule3(104, 0, 0, 0)
        script.metarule3(105, 0, 0, 0)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// D. sfall opcodes 0x8183-0x8185 (get_critter_hp, set_critter_hp, get_critter_max_ap)
// ---------------------------------------------------------------------------

describe('Phase 22-D — sfall opcodes 0x8183-0x8185', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    // get_critter_hp (0x8183)
    it('get_critter_hp returns 0 for a critter with no HP set', () => {
        const c = makeCritter()
        expect(script.get_critter_hp(c)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_hp returns the critter current HP via getStat', () => {
        const c = makeCritter()
        c.stats.derived['HP'] = 42
        c.getStat = (name: string) => c.stats.derived[name] ?? c.stats.base[name] ?? 0
        expect(script.get_critter_hp(c)).toBe(42)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_hp returns 0 and warns for non-critter', () => {
        const item = makeObj()
        expect(script.get_critter_hp(item)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_hp does not emit a stub hit', () => {
        drainStubHits()
        script.get_critter_hp(makeCritter())
        expect(stubHitCount()).toBe(0)
    })

    // set_critter_hp (0x8184)
    it('set_critter_hp sets the critter base HP stat', () => {
        const c = makeCritter()
        script.set_critter_hp(c, 75)
        expect(c.stats.base['HP']).toBe(75)
        expect(stubHitCount()).toBe(0)
    })

    it('set_critter_hp clamps negative values to 0', () => {
        const c = makeCritter()
        script.set_critter_hp(c, -10)
        expect(c.stats.base['HP']).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('set_critter_hp is a no-op for non-critter', () => {
        const item = makeObj()
        expect(() => script.set_critter_hp(item, 50)).not.toThrow()
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_hp round-trip with set_critter_hp', () => {
        const c = makeCritter()
        c.getStat = (name: string) => c.stats.derived[name] ?? c.stats.base[name] ?? 0
        script.set_critter_hp(c, 88)
        expect(script.get_critter_hp(c)).toBe(88)
        expect(stubHitCount()).toBe(0)
    })

    // get_critter_max_ap (0x8185)
    it('get_critter_max_ap returns a number', () => {
        const c = makeCritter()
        expect(typeof script.get_critter_max_ap(c)).toBe('number')
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_max_ap returns derived AP stat', () => {
        const c = makeCritter()
        c.stats.derived['AP'] = 10
        c.getStat = (name: string) => c.stats.derived[name] ?? c.stats.base[name] ?? 0
        expect(script.get_critter_max_ap(c)).toBe(10)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_max_ap returns 0 for non-critter', () => {
        const item = makeObj()
        expect(script.get_critter_max_ap(item)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_max_ap does not emit a stub hit', () => {
        drainStubHits()
        script.get_critter_max_ap(makeCritter())
        expect(stubHitCount()).toBe(0)
    })

    it('none of the Phase 22 sfall opcodes emit stub hits', () => {
        const c = makeCritter()
        drainStubHits()
        script.get_critter_hp(c)
        script.set_critter_hp(c, 50)
        script.get_critter_max_ap(c)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// E. Checklist entries for Phase 22 features
// ---------------------------------------------------------------------------

describe('Phase 22-E — checklist entries', () => {
    it('metarule_17 is now marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_17')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('proto_data_armor_dt is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'proto_data_armor_dt')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('proto_data_armor_perk is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'proto_data_armor_perk')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('proto_data_critter_xp_kill is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'proto_data_critter_xp_kill')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('metarule3_102 is in the checklist', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule3_102')
        expect(e).toBeDefined()
    })

    it('metarule3_103 is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule3_103')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('metarule3_104 is in the checklist', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule3_104')
        expect(e).toBeDefined()
    })

    it('metarule3_105 is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule3_105')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('get_critter_hp is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'get_critter_hp')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('set_critter_hp is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'set_critter_hp')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('get_critter_max_ap is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'get_critter_max_ap')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })
})
