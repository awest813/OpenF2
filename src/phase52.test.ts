/**
 * Phase 52 regression tests.
 *
 * Covers:
 *   A. BLK-036 — metarule3(106) TILE_GET_NEXT_CRITTER now uses getObjects(elevation)
 *   B. BLK-037 — tile_contains_obj_pid now uses getObjects(elevation) (cross-floor fix)
 *   C. BLK-038 — sfall opcodes 0x81BE–0x81C5 in opMap (no unknown-opcode halt)
 *   D. Scripting: get_critter_weapon, critter_inven_size, get/set_critter_team,
 *      get_sfall_args_count, get_sfall_arg_at, set_sfall_arg, get_object_lighting
 *   E. Checklist integrity — all Phase 52 entries present with expected status
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import { opMap } from './vm_opcodes.js'

// ===========================================================================
// Phase 52-A — BLK-036: metarule3(106) elevation-aware critter lookup
// ===========================================================================

describe('Phase 52-A — metarule3(106) elevation-aware critter lookup (BLK-036)', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase52')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('metarule3(106) returns 0 when gMap is unavailable (no crash)', () => {
        // No globalState.gMap in test environment — should return 0 safely
        const result = script.metarule3(106, 12345, 0, 0)
        expect(result).toBe(0)
    })

    it('metarule3(106) does not throw on non-numeric tile', () => {
        expect(() => script.metarule3(106, null, 0, 0)).not.toThrow()
    })

    it('metarule3(106) does not throw on non-numeric elevation', () => {
        expect(() => script.metarule3(106, 12345, null, 0)).not.toThrow()
    })

    it('metarule3(106) does not throw on non-numeric lastCritter', () => {
        expect(() => script.metarule3(106, 12345, 0, null)).not.toThrow()
    })

    it('checklist entry metarule3_106_elevation is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule3_106_elevation')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 52-B — BLK-037: tile_contains_obj_pid cross-floor fix
// ===========================================================================

describe('Phase 52-B — tile_contains_obj_pid cross-floor fix (BLK-037)', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase52')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('tile_contains_obj_pid returns 0 when gMap unavailable (no crash)', () => {
        // In test environment there is no gMap — should return 0 cleanly
        const result = script.tile_contains_obj_pid(12345, 0, 100)
        expect(result).toBe(0)
    })

    it('tile_contains_obj_pid does not throw on elevation=2 (non-current)', () => {
        // Previously threw/returned 0 with a warning when elevation ≠ currentElevation
        expect(() => script.tile_contains_obj_pid(12345, 2, 100)).not.toThrow()
    })

    it('tile_contains_obj_pid does not emit a stub hit', () => {
        drainStubHits()
        script.tile_contains_obj_pid(0, 0, 0)
        expect(drainStubHits().length).toBe(0)
    })

    it('checklist entry tile_contains_obj_pid_elevation is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'tile_contains_obj_pid_elevation')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 52-C — BLK-038: sfall opcodes 0x81BE–0x81C5 in opMap
// ===========================================================================

describe('Phase 52-C — sfall opcodes 0x81BE–0x81C5 registered (BLK-038)', () => {
    const PHASE52_OPCODES = [0x81be, 0x81bf, 0x81c0, 0x81c1, 0x81c2, 0x81c3, 0x81c4, 0x81c5]

    for (const opcode of PHASE52_OPCODES) {
        it(`opMap[0x${opcode.toString(16)}] is defined (no unknown-opcode halt)`, () => {
            expect(opMap[opcode]).toBeDefined()
            expect(typeof opMap[opcode]).toBe('function')
        })
    }
})

// ===========================================================================
// Phase 52-D — Scripting function tests
// ===========================================================================

describe('Phase 52-D — get_critter_weapon scripting function (BLK-038)', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase52')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('get_critter_weapon with non-critter warns and returns 0', () => {
        expect(script.get_critter_weapon({}, 0)).toBe(0)
    })

    it('get_critter_weapon with null warns and returns 0', () => {
        expect(script.get_critter_weapon(null, 0)).toBe(0)
    })

    it('get_critter_weapon slot 0 returns rightHand when it has a valid pid', () => {
        const weapon = { type: 'item', subtype: 'weapon', pid: 50 }
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            rightHand: weapon,
            leftHand: undefined,
            inventory: [],
        }
        const result = script.get_critter_weapon(mockCritter, 0)
        expect(result).toBe(weapon)
    })

    it('get_critter_weapon slot 1 returns leftHand when it has a valid pid', () => {
        const offWeapon = { type: 'item', subtype: 'weapon', pid: 51 }
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            rightHand: undefined,
            leftHand: offWeapon,
            inventory: [],
        }
        const result = script.get_critter_weapon(mockCritter, 1)
        expect(result).toBe(offWeapon)
    })

    it('get_critter_weapon slot 0 returns 0 when rightHand has no pid', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            rightHand: { type: 'item', subtype: 'weapon' }, // no pid
            leftHand: undefined,
            inventory: [],
        }
        // A weapon stub without a pid should not be returned (not a real inventory item)
        expect(script.get_critter_weapon(mockCritter, 0)).toBe(0)
    })

    it('get_critter_weapon slot 0 returns 0 when rightHand is undefined', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            rightHand: undefined,
            leftHand: undefined,
            inventory: [],
        }
        expect(script.get_critter_weapon(mockCritter, 0)).toBe(0)
    })

    it('get_critter_weapon slot 2 (out of range) returns 0', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            rightHand: { type: 'item', subtype: 'weapon', pid: 50 },
            inventory: [],
        }
        expect(script.get_critter_weapon(mockCritter, 2)).toBe(0)
    })

    it('get_critter_weapon does not emit a stub hit', () => {
        drainStubHits()
        script.get_critter_weapon({}, 0)
        expect(drainStubHits().length).toBe(0)
    })
})

describe('Phase 52-D — critter_inven_size scripting function', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase52')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('critter_inven_size with non-critter returns 0', () => {
        expect(script.critter_inven_size({})).toBe(0)
    })

    it('critter_inven_size with null returns 0', () => {
        expect(script.critter_inven_size(null)).toBe(0)
    })

    it('critter_inven_size returns inventory.length for a critter with items', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            inventory: [{ pid: 1, amount: 1 }, { pid: 2, amount: 1 }, { pid: 3, amount: 1 }],
        }
        expect(script.critter_inven_size(mockCritter)).toBe(3)
    })

    it('critter_inven_size returns 0 for a critter with empty inventory', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            inventory: [],
        }
        expect(script.critter_inven_size(mockCritter)).toBe(0)
    })

    it('critter_inven_size returns 0 when inventory is undefined', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            inventory: undefined,
        }
        expect(script.critter_inven_size(mockCritter)).toBe(0)
    })

    it('critter_inven_size does not emit a stub hit', () => {
        drainStubHits()
        const mockCritter = { type: 'critter', position: { x: 0, y: 0 }, inventory: [] }
        script.critter_inven_size(mockCritter)
        expect(drainStubHits().length).toBe(0)
    })
})

describe('Phase 52-D — get/set_critter_team scripting functions', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase52')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('get_critter_team with non-critter returns 0', () => {
        expect(script.get_critter_team({})).toBe(0)
    })

    it('get_critter_team with null returns 0', () => {
        expect(script.get_critter_team(null)).toBe(0)
    })

    it('get_critter_team returns critter.teamNum', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            teamNum: 3,
            inventory: [],
        }
        expect(script.get_critter_team(mockCritter)).toBe(3)
    })

    it('get_critter_team returns 0 when teamNum is undefined', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            inventory: [],
        }
        expect(script.get_critter_team(mockCritter)).toBe(0)
    })

    it('set_critter_team with non-critter does not throw', () => {
        expect(() => script.set_critter_team({}, 5)).not.toThrow()
    })

    it('set_critter_team sets critter.teamNum', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            teamNum: 0,
            inventory: [],
        }
        script.set_critter_team(mockCritter, 7)
        expect(mockCritter.teamNum).toBe(7)
    })

    it('set_critter_team with non-numeric team sets teamNum to 0', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 5, y: 5 },
            teamNum: 5,
            inventory: [],
        }
        script.set_critter_team(mockCritter, 'invalid' as any)
        expect(mockCritter.teamNum).toBe(0)
    })

    it('get/set_critter_team round-trip: set then get returns same team', () => {
        const mockCritter = {
            type: 'critter',
            position: { x: 0, y: 0 },
            teamNum: 1,
            inventory: [],
        }
        script.set_critter_team(mockCritter, 4)
        expect(script.get_critter_team(mockCritter)).toBe(4)
    })

    it('get_critter_team does not emit a stub hit', () => {
        drainStubHits()
        const mockCritter = { type: 'critter', position: { x: 0, y: 0 }, teamNum: 1, inventory: [] }
        script.get_critter_team(mockCritter)
        expect(drainStubHits().length).toBe(0)
    })
})

describe('Phase 52-D — hook-script stubs: get_sfall_args_count, get_sfall_arg_at, set_sfall_arg', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase52')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('get_sfall_args_count returns 0', () => {
        expect(script.get_sfall_args_count()).toBe(0)
    })

    it('get_sfall_args_count does not throw', () => {
        expect(() => script.get_sfall_args_count()).not.toThrow()
    })

    it('get_sfall_arg_at returns 0 for any index', () => {
        expect(script.get_sfall_arg_at(0)).toBe(0)
        expect(script.get_sfall_arg_at(5)).toBe(0)
        expect(script.get_sfall_arg_at(99)).toBe(0)
    })

    it('get_sfall_arg_at does not throw on invalid index', () => {
        expect(() => script.get_sfall_arg_at(-1)).not.toThrow()
        expect(() => script.get_sfall_arg_at(null)).not.toThrow()
    })

    it('set_sfall_arg does not throw', () => {
        expect(() => script.set_sfall_arg(0, 42)).not.toThrow()
        expect(() => script.set_sfall_arg(null, null)).not.toThrow()
    })
})

describe('Phase 52-D — get_object_lighting scripting function', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase52')
        script = new (Scripting as any).Script()
        drainStubHits()
    })

    it('get_object_lighting returns a numeric value', () => {
        const result = script.get_object_lighting({})
        expect(typeof result).toBe('number')
    })

    it('get_object_lighting does not throw', () => {
        expect(() => script.get_object_lighting(null)).not.toThrow()
        expect(() => script.get_object_lighting({})).not.toThrow()
    })

    it('get_object_lighting returns a non-negative light level', () => {
        const result = script.get_object_lighting({})
        expect(result).toBeGreaterThanOrEqual(0)
    })
})

// ===========================================================================
// Phase 52-E — Checklist integrity
// ===========================================================================

describe('Phase 52-E — Checklist entries: all Phase 52 IDs present', () => {
    const PHASE52_IDS = [
        'metarule3_106_elevation',
        'tile_contains_obj_pid_elevation',
        'sfall_get_critter_weapon',
        'sfall_critter_inven_size',
        'sfall_get_sfall_args_count',
        'sfall_get_sfall_arg_at',
        'sfall_set_sfall_arg',
        'sfall_get_object_lighting',
        'sfall_get_critter_team',
        'sfall_set_critter_team',
    ]

    for (const id of PHASE52_IDS) {
        it(`checklist entry '${id}' is present`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry).toBeDefined()
        })
    }

    it('BLK-036 entry metarule3_106_elevation has impact=high', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule3_106_elevation')
        expect(e?.impact).toBe('high')
    })

    it('BLK-037 entry tile_contains_obj_pid_elevation has impact=high', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'tile_contains_obj_pid_elevation')
        expect(e?.impact).toBe('high')
    })

    it('sfall_get_critter_weapon is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_get_critter_weapon')
        expect(e?.status).toBe('implemented')
    })

    it('sfall_get_critter_team is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_get_critter_team')
        expect(e?.status).toBe('implemented')
    })

    it('sfall_set_critter_team is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_set_critter_team')
        expect(e?.status).toBe('implemented')
    })

    it('sfall_critter_inven_size is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_critter_inven_size')
        expect(e?.status).toBe('implemented')
    })
})
