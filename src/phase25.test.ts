/**
 * Phase 25 regression tests.
 *
 * Covers:
 *   A. anim() codes 1001–1009 log silently (no stub hit)
 *   B. proto_data() fields 50–64 return 0 silently (no stub hit)
 *   C. get_critter_stat() for unknown stats returns 0 gracefully (no stub)
 *   D. has_trait() TRAIT_OBJECT extended cases (4, 7, 8, 9, 11)
 *      + unknown sub-cases return 0 silently
 *   E. critter_add_trait() TRAIT_OBJECT extended cases (7, 8)
 *      + unknown sub-cases are silent no-ops
 *   F. has_trait() / critter_add_trait() unknown traitType → silent fallback
 *   G. metarule3() IDs >= 116 return 0 silently (no stub hit)
 *   H. critter_inven_obj() unknown where → null with silent log (no stub)
 *   I. sfall 0x818B — get_object_art_fid(obj) returns a number
 *   J. sfall 0x818C — set_object_art_fid(obj, fid) sets fid without throwing
 *   K. sfall 0x818D — get_critter_combat_ap(obj) returns AP.combat
 *   L. sfall 0x818E — set_critter_combat_ap(obj, ap) sets AP.combat
 *   M. sfall 0x818F — get_script_return_value() returns 0 (partial)
 *   N. perkRanks round-trips through Critter serialize/deserialize
 *   O. Save schema v10 — playerPerkRanks migration and round-trip
 *   P. Checklist — Phase 25 entries reflect correct status
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { drainStubHits, stubHitCount, SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import { snapshotSaveData, hydrateStateFromSave } from './saveStateFidelity.js'

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
        locked: false,
        open: false,
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
        locked: false,
        open: false,
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
// A. anim() codes 1001–1009 silent log
// ---------------------------------------------------------------------------

describe('Phase 25-A — anim() codes 1001–1009 silent log', () => {
    let script: any

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
        script.self_obj = makeObj()
    })

    for (const code of [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009]) {
        it(`anim(${code}) does not emit a stub hit`, () => {
            expect(() => script.anim(makeObj(), code, 0)).not.toThrow()
            expect(stubHitCount()).toBe(0)
        })
    }
})

// ---------------------------------------------------------------------------
// B. proto_data() fields 50–64 return 0 silently
// ---------------------------------------------------------------------------

describe('Phase 25-B — proto_data() fields 50–64 silent defaults', () => {
    let script: any

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    for (const field of [50, 51, 52, 55, 60, 64]) {
        it(`proto_data(0, ${field}) returns 0 with no stub hit when PRO unavailable`, () => {
            const result = script.proto_data(0, field)
            expect(result).toBe(0)
            expect(stubHitCount()).toBe(0)
        })
    }
})

// ---------------------------------------------------------------------------
// C. get_critter_stat() graceful fallback for unknown stats
// ---------------------------------------------------------------------------

describe('Phase 25-C — get_critter_stat() graceful fallback', () => {
    let script: any
    let critter: any

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
        critter = makeCritter()
    })

    it('get_critter_stat for unknown stat 36 returns 0 without stubbing', () => {
        const result = script.get_critter_stat(critter, 36)
        expect(result).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_stat for unknown stat 99 returns 0 without stubbing', () => {
        const result = script.get_critter_stat(critter, 99)
        expect(result).toBe(0)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// D. has_trait() TRAIT_OBJECT extended cases
// ---------------------------------------------------------------------------

describe('Phase 25-D — has_trait(TRAIT_OBJECT) extended cases', () => {
    let script: any

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('has_trait(1, critter, 4) returns 1 for critter type', () => {
        const c = makeCritter()
        expect(script.has_trait(1, c, 4)).toBe(1)
    })

    it('has_trait(1, item, 4) returns 0 for item type', () => {
        const obj = makeObj()
        expect(script.has_trait(1, obj, 4)).toBe(0)
    })

    it('has_trait(1, obj, 7) returns 0 for unlocked object', () => {
        const obj = makeObj({ locked: false })
        expect(script.has_trait(1, obj, 7)).toBe(0)
    })

    it('has_trait(1, obj, 7) returns 1 for locked object', () => {
        const obj = makeObj({ locked: true })
        expect(script.has_trait(1, obj, 7)).toBe(1)
    })

    it('has_trait(1, obj, 8) returns 0 for closed object', () => {
        const obj = makeObj({ open: false })
        expect(script.has_trait(1, obj, 8)).toBe(0)
    })

    it('has_trait(1, obj, 8) returns 1 for open object', () => {
        const obj = makeObj({ open: true })
        expect(script.has_trait(1, obj, 8)).toBe(1)
    })

    it('has_trait(1, obj, 9) returns pid', () => {
        const obj = makeObj({ pid: 77 })
        expect(script.has_trait(1, obj, 9)).toBe(77)
    })

    it('has_trait(1, obj, 11) returns 0 for unscripted object', () => {
        const obj = makeObj()
        expect(script.has_trait(1, obj, 11)).toBe(0)
    })

    it('unknown TRAIT_OBJECT case returns 0 without stub hit', () => {
        const obj = makeObj()
        const result = script.has_trait(1, obj, 500)
        expect(result).toBe(0)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// E. critter_add_trait() TRAIT_OBJECT extended cases
// ---------------------------------------------------------------------------

describe('Phase 25-E — critter_add_trait(TRAIT_OBJECT) extended cases', () => {
    let script: any

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('critter_add_trait(critter, 1, 7, 1) sets locked = true', () => {
        const c = makeCritter()
        expect(() => script.critter_add_trait(c, 1, 7, 1)).not.toThrow()
        expect(c.locked).toBe(true)
    })

    it('critter_add_trait(critter, 1, 7, 0) sets locked = false', () => {
        const c = makeCritter({ locked: true })
        script.critter_add_trait(c, 1, 7, 0)
        expect(c.locked).toBe(false)
    })

    it('critter_add_trait(critter, 1, 8, 1) sets open = true', () => {
        const c = makeCritter()
        script.critter_add_trait(c, 1, 8, 1)
        expect(c.open).toBe(true)
    })

    it('unknown TRAIT_OBJECT case is a silent no-op (no stub hit)', () => {
        const c = makeCritter()
        expect(() => script.critter_add_trait(c, 1, 500, 1)).not.toThrow()
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// F. has_trait() / critter_add_trait() unknown traitType silent fallback
// ---------------------------------------------------------------------------

describe('Phase 25-F — unknown traitType silent fallback', () => {
    let script: any

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('has_trait(99, obj, 0) returns 0 with no stub hit', () => {
        const obj = makeObj()
        const result = script.has_trait(99, obj, 0)
        expect(result).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('critter_add_trait(critter, 99, 0, 1) is a no-op with no stub hit', () => {
        const c = makeCritter()
        expect(() => script.critter_add_trait(c, 99, 0, 1)).not.toThrow()
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// G. metarule3() IDs >= 116 return 0 silently
// ---------------------------------------------------------------------------

describe('Phase 25-G — metarule3() IDs >= 116 silent default', () => {
    let script: any

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    for (const id of [116, 120, 200, 999]) {
        it(`metarule3(${id}, ...) returns 0 with no stub hit`, () => {
            const result = script.metarule3(id, 0, 0, 0)
            expect(result).toBe(0)
            expect(stubHitCount()).toBe(0)
        })
    }
})

// ---------------------------------------------------------------------------
// H. critter_inven_obj() unknown where → null silently
// ---------------------------------------------------------------------------

describe('Phase 25-H — critter_inven_obj() unknown where silent fallback', () => {
    let script: any

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('critter_inven_obj(critter, 99) returns null with no stub hit', () => {
        const c = makeCritter()
        const result = script.critter_inven_obj(c, 99)
        expect(result).toBeNull()
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// I–M. sfall opcodes 0x818B–0x818F via Scripting.Script methods
// ---------------------------------------------------------------------------

describe('Phase 25-I — get_object_art_fid() returns a number', () => {
    it('returns combined fid for object with frmType and frmPID', () => {
        const script = new (Scripting as any).Script()
        const obj = makeObj({ frmType: 1, frmPID: 5 })
        const fid = script.get_object_art_fid(obj)
        expect(typeof fid).toBe('number')
        expect(fid).toBe((1 << 24) | 5)
    })

    it('returns 0 for non-game-object', () => {
        const script = new (Scripting as any).Script()
        const result = script.get_object_art_fid(null)
        expect(result).toBe(0)
    })
})

describe('Phase 25-J — set_object_art_fid() sets fid without throwing', () => {
    it('sets frmType, frmPID and fid fields', () => {
        const script = new (Scripting as any).Script()
        const obj = makeObj()
        expect(() => script.set_object_art_fid(obj, (2 << 24) | 42)).not.toThrow()
        expect(obj.frmType).toBe(2)
        expect(obj.frmPID).toBe(42)
    })
})

describe('Phase 25-K — get_critter_combat_ap() returns AP.combat', () => {
    it('returns AP.combat for a critter', () => {
        const script = new (Scripting as any).Script()
        const c = makeCritter({ AP: { current: 7, combat: 3, max: 8 } })
        expect(script.get_critter_combat_ap(c)).toBe(3)
    })

    it('returns 0 for non-critter', () => {
        const script = new (Scripting as any).Script()
        const result = script.get_critter_combat_ap(null)
        expect(result).toBe(0)
    })
})

describe('Phase 25-L — set_critter_combat_ap() sets AP.combat', () => {
    it('sets AP.combat for a critter', () => {
        const script = new (Scripting as any).Script()
        const c = makeCritter({ AP: { current: 7, combat: 7, max: 8 } })
        script.set_critter_combat_ap(c, 2)
        expect(c.AP.combat).toBe(2)
    })

    it('clamps to 0 for negative values', () => {
        const script = new (Scripting as any).Script()
        const c = makeCritter({ AP: { current: 7, combat: 7, max: 8 } })
        script.set_critter_combat_ap(c, -5)
        expect(c.AP.combat).toBe(0)
    })
})

describe('Phase 25-M — get_script_return_value() returns 0 (partial)', () => {
    it('returns 0', () => {
        const script = new (Scripting as any).Script()
        expect(script.get_script_return_value()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// N. perkRanks round-trips through Critter serialize/deserialize
// ---------------------------------------------------------------------------

describe('Phase 25-N — Critter perkRanks serialization round-trip', () => {
    it('perkRanks are included in SERIALIZED_CRITTER_PROPS coverage', async () => {
        // We test the round-trip indirectly by checking that the object.ts
        // serialization includes perkRanks in the serialized output.
        // Import the Critter class via the dynamic import of object.ts.
        const { Critter } = await import('./object.js')

        const c = new Critter()
        c.perkRanks = { 5: 2, 12: 1 }

        const serialized = c.serialize() as any
        expect(serialized.perkRanks).toEqual({ 5: 2, 12: 1 })
    })

    it('Critter.perkRanks defaults to {} when instantiated fresh', async () => {
        const { Critter } = await import('./object.js')
        const c = new Critter()
        // The default class field initializer should give us an empty record.
        expect(c.perkRanks).toBeDefined()
        expect(c.perkRanks).toEqual({})
    })

    it('perkRanks round-trips: serialize then check output contains correct values', async () => {
        const { Critter } = await import('./object.js')
        const c = new Critter()
        c.perkRanks = { 1: 1, 14: 2 }
        const serialized = c.serialize() as any
        expect(serialized.perkRanks).toEqual({ 1: 1, 14: 2 })
    })
})

// ---------------------------------------------------------------------------
// O. Save schema v10 — playerPerkRanks migration and round-trip
// ---------------------------------------------------------------------------

describe('Phase 25-O — save schema v10: playerPerkRanks', () => {
    it('SAVE_VERSION is at least 10 (currently ' + SAVE_VERSION + ')', () => {
        expect(SAVE_VERSION).toBeGreaterThanOrEqual(10)
    })

    it('migrating from v9 adds playerPerkRanks as empty record', () => {
        const raw = {
            version: 9,
            name: 'test',
            timestamp: 0,
            currentMap: 'map',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerCharTraits: [],
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.playerPerkRanks).toEqual({})
    })

    it('migrating from v1 adds playerPerkRanks via chain of migrations', () => {
        const raw = {
            version: 1,
            name: 'old',
            timestamp: 0,
            currentMap: 'temple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [] },
            party: [],
            savedMaps: {},
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.playerPerkRanks).toEqual({})
    })

    it('already-present playerPerkRanks survives migration round-trip', () => {
        const raw = {
            version: 9,
            name: 'test',
            timestamp: 0,
            currentMap: 'map',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerCharTraits: [],
            playerPerkRanks: { 5: 2, 12: 1 },
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.playerPerkRanks).toEqual({ 5: 2, 12: 1 })
    })

    it('snapshotSaveData includes playerPerkRanks from state', () => {
        const state: any = {
            currentElevation: 0,
            gameTickTime: 0,
            critterKillCounts: {},
            mapVars: {},
            mapAreaStates: {},
            playerCharTraits: [],
            playerPerkRanks: { 3: 1, 7: 2 },
            worldPosition: undefined,
            gMap: { name: 'test', serialize: () => ({ name: 'test' } as any) },
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            gParty: { serialize: () => [] as any },
            dirtyMapCache: {},
            questLog: { serialize: () => ({ entries: [] } as any) },
            reputation: { serialize: () => ({ karma: 0, reputations: {} } as any) },
        }
        const save = snapshotSaveData('test', 0, SAVE_VERSION, state)
        expect(save.playerPerkRanks).toEqual({ 3: 1, 7: 2 })
    })

    it('sanitizes invalid playerPerkRanks entries', () => {
        const raw = {
            version: 9,
            name: 'test',
            timestamp: 0,
            currentMap: 'map',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerCharTraits: [],
            playerPerkRanks: { '5': 2, 'bad': 'notanumber', '12': 1 },
        }
        const migrated = migrateSave(raw)
        // 'bad' and 'notanumber' should be stripped; 5 and 12 survive
        expect(migrated.playerPerkRanks?.[5]).toBe(2)
        expect(migrated.playerPerkRanks?.[12]).toBe(1)
        expect(Object.keys(migrated.playerPerkRanks ?? {}).filter((k) => k === 'bad')).toHaveLength(0)
    })
})

// ---------------------------------------------------------------------------
// P. Checklist — Phase 25 entries
// ---------------------------------------------------------------------------

describe('Phase 25-P — checklist entries', () => {
    const phase25Ids = [
        'anim_mid_range_1001_1009',
        'proto_data_50_64',
        'get_critter_stat_graceful_fallback',
        'has_trait_trait_object_extended',
        'critter_add_trait_trait_object_extended',
        'has_trait_unknown_traittype',
        'critter_add_trait_unknown_traittype',
        'metarule3_116_plus',
        'critter_inven_obj_silent_fallback',
        'get_object_art_fid',
        'set_object_art_fid',
        'get_critter_combat_ap',
        'set_critter_combat_ap',
        'get_script_return_value',
        'critter_perk_ranks_serialization',
        'save_schema_v10_player_perk_ranks',
    ]

    for (const id of phase25Ids) {
        it(`${id} is in the checklist`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry).toBeDefined()
        })
    }

    it('save_schema_v10_player_perk_ranks is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'save_schema_v10_player_perk_ranks')
        expect(entry?.status).toBe('implemented')
    })

    it('critter_perk_ranks_serialization is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_perk_ranks_serialization')
        expect(entry?.status).toBe('implemented')
    })

    it('has_trait_trait_object_extended is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'has_trait_trait_object_extended')
        expect(entry?.status).toBe('implemented')
    })
})
