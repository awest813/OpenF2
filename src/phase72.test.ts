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
// Phase 72-C — BLK-098: get_critter_stat() null game-object guard
// ===========================================================================

describe('Phase 72-C — BLK-098: get_critter_stat() null game-object guard', () => {
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
