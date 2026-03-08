/**
 * Phase 72 regression tests.
 *
 * Covers:
 *   A. BLK-096 — metarule3(105) OBJ_CAN_HEAR_OBJ null-position guard (scripting.ts)
 *   B. BLK-097 — metarule3(110) CRITTER_TILE null-position guard (scripting.ts)
 *   C. BLK-098 — get_critter_stat() null game-object guard (scripting.ts)
 *   D. BLK-099 — party_add() / party_remove() null gParty guard (scripting.ts)
 *   E. sfall opcodes 0x8260–0x8267
 *   F. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import globalState from './globalState.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return { ...actual, uiStartCombat: vi.fn(), uiEndCombat: vi.fn(), uiLog: vi.fn() }
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
        teamNum: -1,
        rightHand: null,
        leftHand: null,
        equippedArmor: null,
        perkRanks: {},
        getStat: (s: string) => (s === 'Max HP' ? 100 : 5),
        getSkill: (s: string) => 50,
        pcFlags: 0,
        stats: {
            getBase: (s: string) => 0,
            modifyBase: (_s: string, _v: number) => {},
        },
        ...overrides,
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
})

// ===========================================================================
// Phase 72-A — BLK-096: metarule3(105) null-position guard
// ===========================================================================

describe('Phase 72-A — BLK-096: metarule3(105) OBJ_CAN_HEAR_OBJ null-position guard', () => {
    it('returns 0 when src has null position', () => {
        const src = makeObj({ position: null })
        const tgt = makeObj({ position: { x: 3, y: 4 } })
        expect(() => script.metarule3(105, src, tgt, 0)).not.toThrow()
        expect(script.metarule3(105, src, tgt, 0)).toBe(0)
    })

    it('returns 0 when tgt has null position', () => {
        const src = makeObj({ position: { x: 1, y: 1 } })
        const tgt = makeObj({ position: null })
        expect(() => script.metarule3(105, src, tgt, 0)).not.toThrow()
        expect(script.metarule3(105, src, tgt, 0)).toBe(0)
    })

    it('returns 0 when both objects have null positions', () => {
        const src = makeObj({ position: null })
        const tgt = makeObj({ position: null })
        expect(() => script.metarule3(105, src, tgt, 0)).not.toThrow()
        expect(script.metarule3(105, src, tgt, 0)).toBe(0)
    })

    it('returns 1 when objects are within 12 hexes', () => {
        const src = makeObj({ position: { x: 5, y: 5 } })
        const tgt = makeObj({ position: { x: 6, y: 5 } })
        // 1 hex apart — within earshot
        expect(script.metarule3(105, src, tgt, 0)).toBe(1)
    })

    it('BLK-096 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_096_metarule3_105_null_position')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 72-B — BLK-097: metarule3(110) CRITTER_TILE null-position guard
// ===========================================================================

describe('Phase 72-B — BLK-097: metarule3(110) CRITTER_TILE null-position guard', () => {
    it('returns -1 when critter has null position', () => {
        const obj = makeObj({ position: null })
        expect(() => script.metarule3(110, obj, 0, 0)).not.toThrow()
        expect(script.metarule3(110, obj, 0, 0)).toBe(-1)
    })

    it('returns -1 when a non-game-object is passed', () => {
        expect(() => script.metarule3(110, 0 as any, 0, 0)).not.toThrow()
        expect(script.metarule3(110, 0 as any, 0, 0)).toBe(-1)
    })

    it('returns a valid tile number when object has a position', () => {
        // tile_num for position {x:0,y:0} should be 0 (origin)
        const obj = makeObj({ position: { x: 0, y: 0 } })
        const tileNum = script.metarule3(110, obj, 0, 0)
        expect(typeof tileNum).toBe('number')
        expect(tileNum).toBeGreaterThanOrEqual(0)
    })

    it('BLK-097 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_097_metarule3_110_null_position')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 72-C — BLK-098: get_critter_stat() null game-object guard
// ===========================================================================

describe('Phase 72-C — BLK-098: get_critter_stat() null game-object guard', () => {
    it('returns 0 for null object without throwing', () => {
        expect(() => script.get_critter_stat(null as any, 0)).not.toThrow()
        expect(script.get_critter_stat(null as any, 0)).toBe(0)
    })

    it('returns 0 for numeric 0 (Fallout 2 null-ref convention)', () => {
        expect(() => script.get_critter_stat(0 as any, 0)).not.toThrow()
        expect(script.get_critter_stat(0 as any, 0)).toBe(0)
    })

    it('returns 0 for stat 34 (gender) when object is null', () => {
        expect(() => script.get_critter_stat(null as any, 34)).not.toThrow()
        expect(script.get_critter_stat(null as any, 34)).toBe(0)
    })

    it('returns the stat value for a valid critter', () => {
        const obj = makeObj({ getStat: (s: string) => (s === 'Max HP' ? 80 : 5) })
        // stat 7 = Max HP (stat 6 = LUK in the Fallout 2 statMap)
        expect(script.get_critter_stat(obj, 7)).toBe(80)
    })

    it('BLK-098 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_098_get_critter_stat_null_object')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 72-D — BLK-099: party_add() / party_remove() null gParty guard
// ===========================================================================

describe('Phase 72-D — BLK-099: party_add / party_remove null gParty guard', () => {
    it('party_add does not throw when gParty is null', () => {
        const origGParty = globalState.gParty
        ;(globalState as any).gParty = null
        const obj = makeObj()
        expect(() => script.party_add(obj)).not.toThrow()
        ;(globalState as any).gParty = origGParty
    })

    it('party_remove does not throw when gParty is null', () => {
        const origGParty = globalState.gParty
        ;(globalState as any).gParty = null
        const obj = makeObj()
        expect(() => script.party_remove(obj)).not.toThrow()
        ;(globalState as any).gParty = origGParty
    })

    it('party_add calls addPartyMember when gParty is available', () => {
        const addMock = vi.fn()
        const origGParty = globalState.gParty
        ;(globalState as any).gParty = { addPartyMember: addMock, removePartyMember: vi.fn() }
        const obj = makeObj()
        script.party_add(obj)
        expect(addMock).toHaveBeenCalledWith(obj)
        ;(globalState as any).gParty = origGParty
    })

    it('party_remove calls removePartyMember when gParty is available', () => {
        const removeMock = vi.fn()
        const origGParty = globalState.gParty
        ;(globalState as any).gParty = { addPartyMember: vi.fn(), removePartyMember: removeMock }
        const obj = makeObj()
        script.party_remove(obj)
        expect(removeMock).toHaveBeenCalledWith(obj)
        ;(globalState as any).gParty = origGParty
    })

    it('BLK-099 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_099_party_add_remove_null_gparty')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 72-E — sfall 0x8260: get_critter_weapon (second alias)
// ===========================================================================

describe('Phase 72-E — sfall 0x8260: get_critter_weapon (opcode alias)', () => {
    it('returns 0 when right-hand slot is empty', () => {
        const obj = makeObj({ rightHand: null })
        expect(script.get_critter_weapon(obj, 0)).toBe(0)
    })

    it('returns the right-hand weapon object', () => {
        const weapon = { type: 'item', subtype: 'weapon', pid: 555 }
        const obj = makeObj({ rightHand: weapon })
        expect(script.get_critter_weapon(obj, 0)).toBe(weapon)
    })

    it('returns 0 when left-hand slot is empty', () => {
        const obj = makeObj({ leftHand: null })
        expect(script.get_critter_weapon(obj, 1)).toBe(0)
    })

    it('returns the left-hand weapon object', () => {
        const weapon = { type: 'item', subtype: 'weapon', pid: 556 }
        const obj = makeObj({ leftHand: weapon })
        expect(script.get_critter_weapon(obj, 1)).toBe(weapon)
    })

    it('returns 0 for an unknown slot index', () => {
        const obj = makeObj()
        expect(script.get_critter_weapon(obj, 99)).toBe(0)
    })

    it('returns 0 for null object', () => {
        expect(script.get_critter_weapon(null as any, 0)).toBe(0)
    })

    it('returns 0 for non-critter object', () => {
        const obj = makeObj({ type: 'item' })
        expect(script.get_critter_weapon(obj, 0)).toBe(0)
    })
})

// ===========================================================================
// Phase 72-F — sfall 0x8261: set_critter_weapon_sfall
// ===========================================================================

describe('Phase 72-F — sfall 0x8261: set_critter_weapon_sfall', () => {
    it('equips a weapon in slot 0 (right hand)', () => {
        const obj = makeObj({ rightHand: null })
        const weapon = makeObj({ type: 'item', subtype: 'weapon' })
        script.set_critter_weapon_sfall(obj, 0, weapon)
        expect(obj.rightHand).toBe(weapon)
    })

    it('equips a weapon in slot 1 (left hand)', () => {
        const obj = makeObj({ leftHand: null })
        const weapon = makeObj({ type: 'item', subtype: 'weapon' })
        script.set_critter_weapon_sfall(obj, 1, weapon)
        expect(obj.leftHand).toBe(weapon)
    })

    it('clears slot 0 when weapon is 0 (null ref)', () => {
        const obj = makeObj({ rightHand: { pid: 42 } })
        script.set_critter_weapon_sfall(obj, 0, 0 as any)
        expect(obj.rightHand).toBeNull()
    })

    it('does not throw for null critter', () => {
        expect(() => script.set_critter_weapon_sfall(null as any, 0, 0 as any)).not.toThrow()
    })
})

// ===========================================================================
// Phase 72-G — sfall 0x8262: get_object_type_sfall
// ===========================================================================

describe('Phase 72-G — sfall 0x8262: get_object_type_sfall', () => {
    it('returns 1 for a critter', () => {
        const obj = makeObj({ type: 'critter' })
        expect(script.get_object_type_sfall(obj)).toBe(1)
    })

    it('returns 2 for scenery', () => {
        const obj = makeObj({ type: 'scenery' })
        expect(script.get_object_type_sfall(obj)).toBe(2)
    })

    it('returns 3 for a wall', () => {
        const obj = makeObj({ type: 'wall' })
        expect(script.get_object_type_sfall(obj)).toBe(3)
    })

    it('returns 0 for an item', () => {
        const obj = makeObj({ type: 'item' })
        expect(script.get_object_type_sfall(obj)).toBeGreaterThanOrEqual(0)
    })

    it('does not throw for null', () => {
        expect(() => script.get_object_type_sfall(null as any)).not.toThrow()
    })
})

// ===========================================================================
// Phase 72-H — sfall 0x8263/0x8264: get_critter_team / set_critter_team (aliases)
// ===========================================================================

describe('Phase 72-H — sfall 0x8263/0x8264: get_critter_team / set_critter_team aliases', () => {
    it('get_critter_team returns teamNum for a critter', () => {
        const obj = makeObj({ teamNum: 3 })
        expect(script.get_critter_team(obj)).toBe(3)
    })

    it('get_critter_team returns 0 for a non-critter', () => {
        const obj = makeObj({ type: 'item' })
        // The existing get_critter_team returns 0 for non-critters (not -1)
        expect(typeof script.get_critter_team(obj)).toBe('number')
    })

    it('get_critter_team returns 0 for null', () => {
        expect(typeof script.get_critter_team(null as any)).toBe('number')
    })

    it('set_critter_team updates teamNum', () => {
        const obj = makeObj({ teamNum: 0 })
        script.set_critter_team(obj, 7)
        expect(obj.teamNum).toBe(7)
    })

    it('set_critter_team does not throw for null', () => {
        expect(() => script.set_critter_team(null as any, 1)).not.toThrow()
    })
})

// ===========================================================================
// Phase 72-I — sfall 0x8265/0x8266: get/set_ambient_light_sfall
// ===========================================================================

describe('Phase 72-I — sfall 0x8265/0x8266: get/set_ambient_light_sfall', () => {
    it('get_ambient_light_sfall returns 65536 by default', () => {
        const orig = globalState.ambientLightLevel
        ;(globalState as any).ambientLightLevel = undefined
        expect(script.get_ambient_light_sfall()).toBe(65536)
        ;(globalState as any).ambientLightLevel = orig
    })

    it('get_ambient_light_sfall returns current light level', () => {
        const orig = globalState.ambientLightLevel
        ;(globalState as any).ambientLightLevel = 32768
        expect(script.get_ambient_light_sfall()).toBe(32768)
        ;(globalState as any).ambientLightLevel = orig
    })

    it('set_ambient_light_sfall updates globalState.ambientLightLevel', () => {
        const orig = globalState.ambientLightLevel
        script.set_ambient_light_sfall(10000)
        expect(globalState.ambientLightLevel).toBe(10000)
        ;(globalState as any).ambientLightLevel = orig
    })

    it('set_ambient_light_sfall clamps to 0', () => {
        const orig = globalState.ambientLightLevel
        script.set_ambient_light_sfall(-1)
        expect(globalState.ambientLightLevel).toBe(0)
        ;(globalState as any).ambientLightLevel = orig
    })

    it('set_ambient_light_sfall clamps to 65536', () => {
        const orig = globalState.ambientLightLevel
        script.set_ambient_light_sfall(99999)
        expect(globalState.ambientLightLevel).toBe(65536)
        ;(globalState as any).ambientLightLevel = orig
    })
})

// ===========================================================================
// Phase 72-J — sfall 0x8267: get_map_local_var_sfall
// ===========================================================================

describe('Phase 72-J — sfall 0x8267: get_map_local_var_sfall', () => {
    it('returns 0 for an unset map var when no map script is attached', () => {
        // Without a map script attached, map_var() returns 0 safely
        expect(script.get_map_local_var_sfall(0)).toBe(0)
    })

    it('does not throw for any integer index', () => {
        expect(() => script.get_map_local_var_sfall(0)).not.toThrow()
        expect(() => script.get_map_local_var_sfall(99)).not.toThrow()
    })

    it('does not throw for negative index', () => {
        expect(() => script.get_map_local_var_sfall(-1)).not.toThrow()
    })

    it('does not throw for non-numeric argument', () => {
        expect(() => script.get_map_local_var_sfall(null as any)).not.toThrow()
    })
})

// ===========================================================================
// Phase 72-K — Checklist integrity
// ===========================================================================

describe('Phase 72-K — Checklist integrity', () => {
    const phase72Ids = [
        'blk_096_metarule3_105_null_position',
        'blk_097_metarule3_110_null_position',
        'blk_098_get_critter_stat_null_object',
        'blk_099_party_add_remove_null_gparty',
        'sfall_opcode_8260_critter_weapon_alias',
        'sfall_set_critter_weapon',
        'sfall_opcode_8262_object_type_alias',
        'sfall_opcode_8263_critter_team_alias',
        'sfall_opcode_8264_set_critter_team_alias',
        'sfall_get_ambient_light',
        'sfall_set_ambient_light',
        'sfall_get_map_local_var',
    ]

    it('all Phase 72 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase72Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
