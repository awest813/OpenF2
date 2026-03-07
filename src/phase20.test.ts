/**
 * Phase 20 regression tests.
 *
 * Covers:
 *   A. Scripting — metarule de-stubs: IDs 30, 35, 44, 47, 55
 *   B. Scripting — metarule3 de-stubs: IDs 101 (constrained random), 107 (tile visible)
 *   C. Scripting — has_trait TRAIT_OBJECT new cases: 1, 2, 3, 667, 668
 *   D. Scripting — critter_add_trait TRAIT_OBJECT new cases: 667, 668
 *   E. Scripting — sfall opcodes 0x817D–0x817F (get_critter_name, get_game_mode, set_global_script_repeat)
 *   F. Checklist — Phase 20 entries reflect correct status
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { drainStubHits, stubHitCount, SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

// ---------------------------------------------------------------------------
// Helper: build minimal mock objects
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
    }
    return {
        type: 'critter',
        isPlayer: false,
        pid: 2,
        orientation: 0,
        frame: 0,
        position: { x: 0, y: 0 },
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
        inAnim: () => false,
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// A. metarule de-stubs: IDs 30, 35, 44, 47, 55
// ---------------------------------------------------------------------------

describe('Phase 20-A — metarule de-stubs (IDs 30, 35, 44, 47, 55)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('metarule(30, unloaded_weapon) returns 0 — weapon has no ammo loaded', () => {
        const weapon = makeObj({ extra: { ammoLoaded: 0 } })
        expect(script.metarule(30, weapon)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule(30, loaded_weapon) returns 1 — weapon has ammo loaded', () => {
        const weapon = makeObj({ extra: { ammoLoaded: 6 } })
        expect(script.metarule(30, weapon)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule(30, null) returns 0 — non-game-object is treated as unloaded', () => {
        expect(script.metarule(30, null)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule(35, 0) returns 1 — normal combat difficulty', () => {
        expect(script.metarule(35, 0)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule(44, critter) returns 0 — no drug system', () => {
        const critter = makeCritter()
        expect(script.metarule(44, critter)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule(47, unknown_area) returns 0 — unknown area is undiscovered', () => {
        expect(script.metarule(47, 9999)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule(55, 0) returns 1 — normal game difficulty', () => {
        expect(script.metarule(55, 0)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule 30/35/44/47/55 do not emit stub hits', () => {
        const weapon = makeObj({ extra: {} })
        drainStubHits()
        script.metarule(30, weapon)
        script.metarule(35, 0)
        script.metarule(44, weapon)
        script.metarule(47, 0)
        script.metarule(55, 0)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// B. metarule3 de-stubs: IDs 101 (random range), 107 (tile visible)
// ---------------------------------------------------------------------------

describe('Phase 20-B — metarule3 de-stubs (IDs 101, 107)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('metarule3(101, 5, 10, 0) returns a number in [5..10]', () => {
        for (let i = 0; i < 20; i++) {
            const r = script.metarule3(101, 5, 10, 0)
            expect(r).toBeGreaterThanOrEqual(5)
            expect(r).toBeLessThanOrEqual(10)
        }
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(101, 0, 0, 0) returns exactly 0', () => {
        expect(script.metarule3(101, 0, 0, 0)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(101, 3, 3, 0) always returns 3 (single-value range)', () => {
        for (let i = 0; i < 10; i++) {
            expect(script.metarule3(101, 3, 3, 0)).toBe(3)
        }
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3(107, tile, elev, 0) returns 1 — tile is visible (partial)', () => {
        expect(script.metarule3(107, 12345, 0, 0)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('metarule3 IDs 101 and 107 do not emit stubs', () => {
        drainStubHits()
        script.metarule3(101, 1, 5, 0)
        script.metarule3(107, 0, 0, 0)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// C. has_trait TRAIT_OBJECT new cases: 1 (right hand), 2 (left hand), 3 (inv count),
//    667 (is_flat), 668 (no_block)
// ---------------------------------------------------------------------------

describe('Phase 20-C — has_trait TRAIT_OBJECT new cases (1, 2, 3, 667, 668)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('has_trait(1, critter, 1) returns 0 when no rightHand equipped', () => {
        const c = makeCritter({ rightHand: null })
        expect(script.has_trait(1, c, 1)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait(1, critter, 1) returns 1 when rightHand is equipped', () => {
        const weapon = makeObj({ type: 'item' })
        const c = makeCritter({ rightHand: weapon })
        expect(script.has_trait(1, c, 1)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait(1, critter, 2) returns 0 when no leftHand equipped', () => {
        const c = makeCritter({ leftHand: null })
        expect(script.has_trait(1, c, 2)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait(1, critter, 2) returns 1 when leftHand is equipped', () => {
        const weapon = makeObj({ type: 'item' })
        const c = makeCritter({ leftHand: weapon })
        expect(script.has_trait(1, c, 2)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait(1, critter, 3) returns inventory length', () => {
        const items = [makeObj(), makeObj(), makeObj()]
        const c = makeCritter({ inventory: items })
        expect(script.has_trait(1, c, 3)).toBe(3)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait(1, critter, 3) returns 0 for empty inventory', () => {
        const c = makeCritter({ inventory: [] })
        expect(script.has_trait(1, c, 3)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait(1, obj, 667) returns 0 when isFlat not set', () => {
        const obj = makeObj({ extra: {} })
        expect(script.has_trait(1, obj, 667)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait(1, obj, 667) returns 1 when extra.isFlat is true', () => {
        const obj = makeObj({ extra: { isFlat: true } })
        expect(script.has_trait(1, obj, 667)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait(1, obj, 668) returns 0 when noBlock not set', () => {
        const obj = makeObj({ extra: {} })
        expect(script.has_trait(1, obj, 668)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait(1, obj, 668) returns 1 when extra.noBlock is true', () => {
        const obj = makeObj({ extra: { noBlock: true } })
        expect(script.has_trait(1, obj, 668)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('none of the new has_trait cases emit stub hits', () => {
        const weapon = makeObj({ type: 'item' })
        const c = makeCritter({ rightHand: weapon, leftHand: weapon, inventory: [weapon] })
        const obj = makeObj({ extra: { isFlat: true, noBlock: false } })
        drainStubHits()
        script.has_trait(1, c, 1)
        script.has_trait(1, c, 2)
        script.has_trait(1, c, 3)
        script.has_trait(1, obj, 667)
        script.has_trait(1, obj, 668)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// D. critter_add_trait TRAIT_OBJECT new cases: 667 (is_flat), 668 (no_block)
// ---------------------------------------------------------------------------

describe('Phase 20-D — critter_add_trait TRAIT_OBJECT new cases (667, 668)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('critter_add_trait(obj, 1, 667, 1) sets extra.isFlat = true', () => {
        const c = makeCritter()
        script.critter_add_trait(c, 1, 667, 1)
        expect((c as any).extra.isFlat).toBe(true)
        expect(stubHitCount()).toBe(0)
    })

    it('critter_add_trait(obj, 1, 667, 0) sets extra.isFlat = false', () => {
        const c = makeCritter({ extra: { isFlat: true } })
        script.critter_add_trait(c, 1, 667, 0)
        expect((c as any).extra.isFlat).toBe(false)
        expect(stubHitCount()).toBe(0)
    })

    it('critter_add_trait(obj, 1, 668, 1) sets extra.noBlock = true', () => {
        const c = makeCritter()
        script.critter_add_trait(c, 1, 668, 1)
        expect((c as any).extra.noBlock).toBe(true)
        expect(stubHitCount()).toBe(0)
    })

    it('critter_add_trait(obj, 1, 668, 0) sets extra.noBlock = false', () => {
        const c = makeCritter({ extra: { noBlock: true } })
        script.critter_add_trait(c, 1, 668, 0)
        expect((c as any).extra.noBlock).toBe(false)
        expect(stubHitCount()).toBe(0)
    })

    it('critter_add_trait initialises extra if absent', () => {
        const c = makeCritter()
        delete (c as any).extra
        script.critter_add_trait(c, 1, 667, 1)
        expect((c as any).extra.isFlat).toBe(true)
    })

    it('critter_add_trait TRAIT_OBJECT 667/668 do not emit stubs', () => {
        const c = makeCritter()
        drainStubHits()
        script.critter_add_trait(c, 1, 667, 1)
        script.critter_add_trait(c, 1, 668, 1)
        expect(stubHitCount()).toBe(0)
    })

    it('has_trait round-trip: set via critter_add_trait, read via has_trait', () => {
        const c = makeCritter()
        script.critter_add_trait(c, 1, 667, 1)
        expect(script.has_trait(1, c, 667)).toBe(1)
        script.critter_add_trait(c, 1, 668, 1)
        expect(script.has_trait(1, c, 668)).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// E. sfall opcodes 0x817D–0x817F
// ---------------------------------------------------------------------------

describe('Phase 20-E — sfall opcodes 0x817D–0x817F', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('get_critter_name returns the name of a game object', () => {
        const c = makeCritter({ name: 'Marcus' })
        expect(script.get_critter_name(c)).toBe('Marcus')
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_name returns empty string for a null argument', () => {
        expect(script.get_critter_name(null)).toBe('')
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_name returns empty string when obj has no name', () => {
        const obj = makeObj()
        delete obj.name
        expect(script.get_critter_name(obj)).toBe('')
        expect(stubHitCount()).toBe(0)
    })

    it('get_game_mode returns 0 (no mode-flags in engine)', () => {
        expect(script.get_game_mode()).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('set_global_script_repeat does not throw and emits no stub', () => {
        expect(() => script.set_global_script_repeat(100)).not.toThrow()
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_name returns empty string for item with no name', () => {
        const item = makeObj()
        delete item.name
        expect(script.get_critter_name(item)).toBe('')
    })

    it('get_critter_name works for item with a name', () => {
        const item = makeObj({ name: 'Combat Knife' })
        expect(script.get_critter_name(item)).toBe('Combat Knife')
    })
})

// ---------------------------------------------------------------------------
// F. Checklist — Phase 20 entries reflect correct status
// ---------------------------------------------------------------------------

describe('Phase 20-F — checklist entries for Phase 20 features', () => {
    it('metarule_30 is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_30')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('metarule_35 is marked partial', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_35')
        expect(e).toBeDefined()
        expect(e!.status).toBe('partial')
    })

    it('metarule_44 is marked partial', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_44')
        expect(e).toBeDefined()
        expect(e!.status).toBe('partial')
    })

    it('metarule_47 is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_47')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('metarule_55 is marked partial', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_55')
        expect(e).toBeDefined()
        expect(e!.status).toBe('partial')
    })

    it('metarule3_101 is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule3_101')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('metarule3_107 is marked partial', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule3_107')
        expect(e).toBeDefined()
        expect(e!.status).toBe('partial')
    })

    it('has_trait_hands_count is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'has_trait_hands_count')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('has_trait_flat_noblock is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'has_trait_flat_noblock')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('critter_add_trait_flat_noblock is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'critter_add_trait_flat_noblock')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('get_critter_name is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'get_critter_name')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('get_game_mode is marked implemented (upgraded in Phase 45)', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'get_game_mode')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('set_global_script_repeat is marked partial', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'set_global_script_repeat')
        expect(e).toBeDefined()
        expect(e!.status).toBe('partial')
    })
})
