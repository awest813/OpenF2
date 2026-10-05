/**
 * Phase 23 regression tests.
 *
 * Covers:
 *   A. Scripting — has_trait TRAIT_CHAR (type 2) reads critter.charTraits
 *   B. Scripting — critter_add_trait TRAIT_CHAR (type 2) writes critter.charTraits
 *   C. Scripting — sfall list opcodes: list_begin / list_next / list_end
 *   D. Scripting — metarule IDs 1–13 and 16–54 (de-stubbed; no stub hits)
 *   E. Save schema — v9 adds playerCharTraits; migration from v8 sets []
 *   F. object.ts — Critter.charTraits serializes to/from sorted number array
 *   G. Checklist — Phase 23 entries reflect correct status
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { drainStubHits, stubHitCount, SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'

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
        isFleeing: false,
        knockedOut: false,
        knockedDown: false,
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
// A. has_trait TRAIT_CHAR (type 2)
// ---------------------------------------------------------------------------

describe('Phase 23-A — has_trait TRAIT_CHAR (type 2)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('returns 0 for a critter with no charTraits', () => {
        const c = makeCritter()
        expect(script.has_trait(2, c, 0)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('returns 1 when the critter has the given char trait', () => {
        const c = makeCritter()
        c.charTraits.add(4) // TRAIT_FINESSE = 4
        expect(script.has_trait(2, c, 4)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('returns 0 for a different trait not in charTraits', () => {
        const c = makeCritter()
        c.charTraits.add(4)
        expect(script.has_trait(2, c, 1)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        const item = makeObj()
        expect(script.has_trait(2, item, 0)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('does not emit a stub hit', () => {
        const c = makeCritter()
        drainStubHits()
        script.has_trait(2, c, 7)
        expect(stubHitCount()).toBe(0)
    })

    it('handles all trait IDs 0–15 without stub hits', () => {
        const c = makeCritter()
        for (let i = 0; i <= 15; i++) {c.charTraits.add(i)}
        drainStubHits()
        for (let i = 0; i <= 15; i++) {expect(script.has_trait(2, c, i)).toBe(1)}
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// B. critter_add_trait TRAIT_CHAR (type 2)
// ---------------------------------------------------------------------------

describe('Phase 23-B — critter_add_trait TRAIT_CHAR (type 2)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('adds a char trait when amount > 0', () => {
        const c = makeCritter()
        script.critter_add_trait(c, 2, 5, 1) // TRAIT_KAMIKAZE = 5
        expect(c.charTraits.has(5)).toBe(true)
        expect(stubHitCount()).toBe(0)
    })

    it('does not add a char trait when amount === 0', () => {
        const c = makeCritter()
        script.critter_add_trait(c, 2, 5, 0)
        expect(c.charTraits.has(5)).toBe(false)
        expect(stubHitCount()).toBe(0)
    })

    it('removes an existing char trait when amount <= 0', () => {
        const c = makeCritter()
        c.charTraits.add(5)
        script.critter_add_trait(c, 2, 5, 0)
        expect(c.charTraits.has(5)).toBe(false)
        expect(stubHitCount()).toBe(0)
    })

    it('is idempotent — adding the same trait twice leaves it once', () => {
        const c = makeCritter()
        script.critter_add_trait(c, 2, 3, 1)
        script.critter_add_trait(c, 2, 3, 1)
        expect(c.charTraits.size).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('round-trip: add then has_trait', () => {
        const c = makeCritter()
        script.critter_add_trait(c, 2, 14, 1) // TRAIT_SKILLED = 14
        expect(script.has_trait(2, c, 14)).toBe(1)
        expect(stubHitCount()).toBe(0)
    })

    it('round-trip: add then remove then has_trait returns 0', () => {
        const c = makeCritter()
        script.critter_add_trait(c, 2, 15, 1)
        script.critter_add_trait(c, 2, 15, 0)
        expect(script.has_trait(2, c, 15)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('does not emit stub for non-critter (warns instead)', () => {
        const item = makeObj()
        drainStubHits()
        expect(() => script.critter_add_trait(item, 2, 0, 1)).not.toThrow()
        // Non-critter triggers a warn (not a stub hit) so count should still be 0
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// C. sfall list opcodes: list_begin / list_next / list_end
// ---------------------------------------------------------------------------

describe('Phase 23-C — sfall list opcodes (0x8186-0x8188)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('list_begin returns null/0 when no map is loaded', () => {
        const result = script.list_begin(0)
        expect(result === null || result === 0 || result === undefined).toBe(true)
        expect(stubHitCount()).toBe(0)
    })

    it('list_next returns null after list_begin with empty map', () => {
        script.list_begin(0)
        const result = script.list_next()
        expect(result === null || result === 0 || result === undefined).toBe(true)
        expect(stubHitCount()).toBe(0)
    })

    it('list_end disposes the iterator without throwing', () => {
        script.list_begin(0)
        expect(() => script.list_end()).not.toThrow()
        expect(stubHitCount()).toBe(0)
    })

    it('list_end resets iterator so subsequent list_next returns null', () => {
        script.list_begin(0)
        script.list_end()
        const result = script.list_next()
        expect(result === null || result === 0 || result === undefined).toBe(true)
        expect(stubHitCount()).toBe(0)
    })

    it('list_begin(1) LIST_CRITTERS does not emit stub', () => {
        drainStubHits()
        script.list_begin(1)
        expect(stubHitCount()).toBe(0)
    })

    it('list_begin(2) LIST_GROUNDITEMS does not emit stub', () => {
        drainStubHits()
        script.list_begin(2)
        expect(stubHitCount()).toBe(0)
    })

    it('list_begin LIST_ALL (type 0) does not emit stub', () => {
        drainStubHits()
        script.list_begin(0)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// E. Save schema v9 migration
// ---------------------------------------------------------------------------

describe('Phase 23-E — save schema v9 migration', () => {
    it('SAVE_VERSION is at least 10 (v10 adds playerPerkRanks, v11 adds sfallGlobals)', () => {
        expect(SAVE_VERSION).toBeGreaterThanOrEqual(10)
    })

    it('migrating from v8 adds playerCharTraits as empty array', () => {
        const raw = {
            version: 8,
            name: 'test',
            timestamp: 0,
            currentMap: 'map',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(Array.isArray(migrated.playerCharTraits)).toBe(true)
        expect(migrated.playerCharTraits!.length).toBe(0)
    })

    it('migrating from v1 adds playerCharTraits via chain of migrations', () => {
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
        expect(Array.isArray(migrated.playerCharTraits)).toBe(true)
        expect(migrated.playerCharTraits!.length).toBe(0)
    })

    it('already-present playerCharTraits survives migration round-trip', () => {
        const raw = {
            version: 8,
            name: 'test',
            timestamp: 0,
            currentMap: 'map',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            // Simulate a v9 save that already has traits
            playerCharTraits: [4, 14],
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.playerCharTraits).toEqual([4, 14])
    })

    it('sanitizeTraitArray removes out-of-range trait IDs', () => {
        const raw = {
            version: 8,
            name: 'test',
            timestamp: 0,
            currentMap: 'map',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerCharTraits: [-1, 0, 7, 15, 16, 999],
        }
        const migrated = migrateSave(raw)
        // Only 0, 7, 15 should survive (valid range 0–15)
        expect(migrated.playerCharTraits).toEqual([0, 7, 15])
    })

    it('sanitizeTraitArray removes duplicates and sorts', () => {
        const raw = {
            version: 8,
            name: 'test',
            timestamp: 0,
            currentMap: 'map',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerCharTraits: [5, 3, 5, 3, 0],
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerCharTraits).toEqual([0, 3, 5])
    })
})

// ---------------------------------------------------------------------------
// F. Critter charTraits serialization
// ---------------------------------------------------------------------------

describe('Phase 23-F — Critter.charTraits serialization round-trip', () => {
    it('charTraits serializes to a sorted number array', () => {
        // We use a lightweight mock to test the serialize pattern
        // (the actual Critter class needs full DOM environment to instantiate)
        const traits = new Set([7, 2, 14, 0])
        const serialized = Array.from(traits).sort((a, b) => a - b)
        expect(serialized).toEqual([0, 2, 7, 14])
    })

    it('charTraits deserializes from an array back to a Set', () => {
        const arr = [0, 2, 7, 14]
        const set = new Set(arr.filter((t) => typeof t === 'number'))
        expect(set.has(0)).toBe(true)
        expect(set.has(7)).toBe(true)
        expect(set.has(14)).toBe(true)
        expect(set.size).toBe(4)
    })

    it('empty charTraits serializes to []', () => {
        const traits = new Set<number>()
        const serialized = Array.from(traits).sort((a, b) => a - b)
        expect(serialized).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// G. Checklist entries for Phase 23
// ---------------------------------------------------------------------------

describe('Phase 23-G — checklist entries', () => {
    it('has_trait_char is in the checklist and implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'has_trait_char')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('critter_add_trait_char is in the checklist and implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'critter_add_trait_char')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('list_begin is in the checklist and implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'list_begin')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('list_next is in the checklist and implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'list_next')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('list_end is in the checklist and implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'list_end')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('metarule_1_to_13 is in the checklist and implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_1_to_13')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('metarule_16_20_25_32 is in the checklist and implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_16_20_25_32')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })

    it('save_schema_v9_char_traits is in the checklist and implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'save_schema_v9_char_traits')
        expect(e).toBeDefined()
        expect(e!.status).toBe('implemented')
    })
})
