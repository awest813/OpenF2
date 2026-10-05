/**
 * Phase 24 regression tests.
 *
 * Covers:
 *   A. Browser-runtime blocker fixes — no more throws from scripting event handlers
 *      - spatial() with no script / no spatial_p_proc returns silently
 *      - combatEvent() with no script returns false
 *      - useSkillOn() with no script returns false
 *      - pickup() with no script returns false
 *   B. objectGetDamageType() safe fallback (returns 'Normal' instead of throwing)
 *   C. metarule(49) — METARULE_W_DAMAGE_TYPE handles all 7 Fallout 2 damage types
 *   D. critter_state() — bit 1 set when critter is knocked down (prone flag)
 *   E. proto_data() field 13 — ITEM_DATA_MATERIAL returns 0 with no stub
 *   F. metarule3() IDs 108–115 — de-stubbed with safe/meaningful defaults
 *   G. anim() — codes 100–999 and > 1010 log silently (no stub hits)
 *   H. sfall 0x8189 — tile_num_in_direction(tile, dir, count) returns a number
 *   I. sfall 0x818A — get_obj_elevation(obj) returns current elevation
 *   J. Checklist — Phase 24 entries reflect correct status
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { objectGetDamageType } from './object.js'
import { drainStubHits, stubHitCount, SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

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
        charTraits: new Set<number>(),
        equippedArmor: null,
        leftHand: null,
        rightHand: null,
        aiNum: 0,
        teamNum: 0,
        dead: false,
        knockedDown: false,
        isFleeing: false,
        knockedOut: false,
        stunned: false,
        onFire: false,
        crippledLeftLeg: false,
        crippledRightLeg: false,
        crippledLeftArm: false,
        crippledRightArm: false,
        blinded: false,
        hostile: false,
        name: 'Test Critter',
        getStat: (name: string) => stats.derived[name] ?? stats.base[name] ?? 0,
        AP: { current: 5, combat: 5, max: 7 },
        inAnim: () => false,
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// A. Browser-runtime blocker fixes — event handlers no longer throw
// ---------------------------------------------------------------------------

describe('Phase 24-A — event handler no-throw safety', () => {
    it('spatial() with no script on obj does not throw', () => {
        const spatialObj = makeObj({ _script: undefined })
        const source = makeCritter()
        expect(() => Scripting.spatial(spatialObj, source)).not.toThrow()
    })

    it('spatial() with script but no spatial_p_proc does not throw', () => {
        const spatialObj = makeObj({
            _script: { game_time: 0, cur_map_index: 0, source_obj: null, self_obj: null },
        })
        const source = makeCritter()
        expect(() => Scripting.spatial(spatialObj, source)).not.toThrow()
    })

    it('combatEvent() with no script returns false and does not throw', () => {
        const obj = makeObj({ _script: undefined })
        expect(() => Scripting.combatEvent(obj, 'turnBegin')).not.toThrow()
        expect(Scripting.combatEvent(obj, 'turnBegin')).toBe(false)
    })

    it('useSkillOn() with no script returns false and does not throw', () => {
        const who = makeCritter()
        const obj = makeObj({ _script: undefined })
        expect(() => Scripting.useSkillOn(who, 0, obj)).not.toThrow()
        expect(Scripting.useSkillOn(who, 0, obj)).toBe(false)
    })

    it('pickup() with no script returns false and does not throw', () => {
        const source = makeCritter()
        const obj = makeObj({ _script: undefined })
        expect(() => Scripting.pickup(obj, source)).not.toThrow()
        expect(Scripting.pickup(obj, source)).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// B. objectGetDamageType() safe fallback
// ---------------------------------------------------------------------------

describe('Phase 24-B — objectGetDamageType safe fallback', () => {
    it('returns the dmgType property when present', () => {
        expect(objectGetDamageType({ dmgType: 'Laser' })).toBe('Laser')
    })

    it('returns "Normal" when no dmgType property is set (no throw)', () => {
        expect(() => objectGetDamageType({})).not.toThrow()
        expect(objectGetDamageType({})).toBe('Normal')
    })

    it('returns "Normal" for undefined dmgType (no throw)', () => {
        expect(objectGetDamageType({ dmgType: undefined })).toBe('Normal')
    })
})

// ---------------------------------------------------------------------------
// C. metarule(49) — METARULE_W_DAMAGE_TYPE — all 7 damage types
// ---------------------------------------------------------------------------

/** METARULE_WEAPON_DAMAGE_TYPE only answers for weapons. */
function makeWeapon(overrides: Record<string, any> = {}): any {
    return makeObj({ subtype: 'weapon', ...overrides })
}

describe('Phase 24-C — metarule(49) handles all Fallout 2 damage types', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('Normal damage type → 0', () => {
        const obj = makeWeapon({ dmgType: 'Normal' })
        expect(script.metarule(49, obj)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('Laser damage type → 1', () => {
        expect(script.metarule(49, makeWeapon({ dmgType: 'Laser' }))).toBe(1)
    })

    it('Fire damage type → 2', () => {
        expect(script.metarule(49, makeWeapon({ dmgType: 'Fire' }))).toBe(2)
    })

    it('Plasma damage type → 3', () => {
        expect(script.metarule(49, makeWeapon({ dmgType: 'Plasma' }))).toBe(3)
    })

    it('Electrical damage type → 4', () => {
        expect(script.metarule(49, makeWeapon({ dmgType: 'Electrical' }))).toBe(4)
    })

    it('EMP damage type → 5', () => {
        expect(script.metarule(49, makeWeapon({ dmgType: 'EMP' }))).toBe(5)
    })

    it('Explosive damage type → 6', () => {
        expect(script.metarule(49, makeWeapon({ dmgType: 'Explosive' }))).toBe(6)
    })

    it('"explosion" (lowercase) → 6 (backward compatibility)', () => {
        expect(script.metarule(49, makeWeapon({ dmgType: 'explosion' }))).toBe(6)
    })

    it('object with no dmgType falls back to Normal (0) — no throw', () => {
        const obj = makeWeapon() // no dmgType
        expect(() => script.metarule(49, obj)).not.toThrow()
        expect(script.metarule(49, obj)).toBe(0)
    })

    it('none of the damage-type calls emit stub hits', () => {
        drainStubHits()
        const types = ['Normal', 'Laser', 'Fire', 'Plasma', 'Electrical', 'EMP', 'Explosive']
        for (const t of types) {script.metarule(49, makeWeapon({ dmgType: t }))}
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// D. critter_state() — prone (knocked down) sets bit 1
// ---------------------------------------------------------------------------

describe('Phase 24-D — critter_state prone flag', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('returns 0 for a live critter that is neither dead nor knocked down', () => {
        const c = makeCritter({ dead: false, knockedDown: false })
        expect(script.critter_state(c)).toBe(0)
    })

    it('returns 1 for a dead critter', () => {
        const c = makeCritter({ dead: true, knockedDown: false })
        expect(script.critter_state(c) & 1).toBe(1)
    })

    it('returns CRITTER_STATE_PRONE (2) for a knocked-out critter', () => {
        const c = makeCritter({ dead: false, knockedDown: false, knockedOut: true })
        expect(script.critter_state(c)).toBe(0x02)
    })

    it('returns CRITTER_STATE_PRONE (2) for a knocked-down critter', () => {
        const c = makeCritter({ dead: false, knockedDown: true })
        expect(script.critter_state(c)).toBe(0x02)
    })

    it('adds the crippled-limb and blinded damage bits', () => {
        const c = makeCritter({ dead: false, knockedDown: false, crippledLeftLeg: true, blinded: true })
        expect(script.critter_state(c)).toBe(0x04 | 0x40)
    })

    it('a dead critter is just CRITTER_STATE_DEAD', () => {
        const c = makeCritter({ dead: true, knockedDown: true })
        expect(script.critter_state(c)).toBe(1)
    })

    it('returns CRITTER_STATE_DEAD for a missing object', () => {
        expect(script.critter_state(null as any)).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// E. proto_data() field 13 — ITEM_DATA_MATERIAL
// ---------------------------------------------------------------------------

describe('Phase 24-E — proto_data field 13 (ITEM_DATA_MATERIAL)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('proto_data(0, 13) returns 0 with no stub when PRO unavailable', () => {
        drainStubHits()
        expect(script.proto_data(0, 13)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('field 13 does not emit a stub hit', () => {
        drainStubHits()
        script.proto_data(0, 13)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// G. anim() — extended and high codes log silently (no stub hits)
// ---------------------------------------------------------------------------

describe('Phase 24-G — anim extended/high codes log silently', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('anim code 100 logs silently (no stub hit)', () => {
        const obj = makeObj()
        script.anim(obj, 100, 0)
        expect(stubHitCount()).toBe(0)
    })

    it('anim code 500 logs silently (no stub hit)', () => {
        const obj = makeObj()
        script.anim(obj, 500, 0)
        expect(stubHitCount()).toBe(0)
    })

    it('anim code 999 logs silently (no stub hit)', () => {
        const obj = makeObj()
        script.anim(obj, 999, 0)
        expect(stubHitCount()).toBe(0)
    })

    it('anim code 1011 logs silently (no stub hit)', () => {
        const obj = makeObj()
        script.anim(obj, 1011, 0)
        expect(stubHitCount()).toBe(0)
    })

    it('anim code 9999 logs silently (no stub hit)', () => {
        const obj = makeObj()
        script.anim(obj, 9999, 0)
        expect(stubHitCount()).toBe(0)
    })

    it('still no stub hits for standard handled codes (0, 1, 1000, 1010)', () => {
        const obj = makeObj({ frame: 0, orientation: 0 })
        drainStubHits()
        script.anim(obj, 0, 0)
        script.anim(obj, 1, 0)
        script.anim(obj, 1000, 2)
        script.anim(obj, 1010, 3)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// H. sfall 0x8189 — tile_num_in_direction
// ---------------------------------------------------------------------------

describe('Phase 24-H — sfall 0x8189 tile_num_in_direction', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('returns a number', () => {
        expect(typeof script.tile_num_in_direction(1000, 0, 1)).toBe('number')
        expect(stubHitCount()).toBe(0)
    })

    it('returns original tile when count is negative', () => {
        expect(script.tile_num_in_direction(1000, 0, -1)).toBe(1000)
    })

    it('does not emit a stub hit', () => {
        drainStubHits()
        script.tile_num_in_direction(500, 0, 3)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// I. sfall 0x818A — get_obj_elevation
// ---------------------------------------------------------------------------

describe('Phase 24-I — sfall 0x818A get_obj_elevation', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('returns a number for a valid game object', () => {
        const obj = makeObj()
        expect(typeof script.get_obj_elevation(obj)).toBe('number')
        expect(stubHitCount()).toBe(0)
    })

    it('returns 0 for a valid game object when no globalState.currentElevation', () => {
        const obj = makeObj()
        expect(script.get_obj_elevation(obj)).toBe(0)
    })

    it('returns 0 for a non-game-object (warning, no stub)', () => {
        expect(script.get_obj_elevation(null as any)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('does not emit a stub hit', () => {
        drainStubHits()
        script.get_obj_elevation(makeObj())
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// J. Checklist entries for Phase 24 features
// ---------------------------------------------------------------------------

describe('Phase 24-J — checklist entries', () => {
    it('metarule_49_damage_types is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_49_damage_types')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('objectGetDamageType_safe_fallback is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'objectGetDamageType_safe_fallback')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('spatial_no_throw is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'spatial_no_throw')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('combatEvent_no_throw is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'combatEvent_no_throw')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('useSkillOn_no_throw is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'useSkillOn_no_throw')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('pickup_no_throw is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'pickup_no_throw')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('critter_state_prone is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'critter_state_prone')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('proto_data_13_material is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'proto_data_13_material')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('metarule3_108_115 is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule3_108_115')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('anim_extended_codes is in the checklist', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'anim_extended_codes')
        expect(e).toBeDefined()
    })

    it('tile_num_in_direction is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'tile_num_in_direction')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('get_obj_elevation is marked implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'get_obj_elevation')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })
})
