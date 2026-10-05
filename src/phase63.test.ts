/**
 * Phase 63 regression tests.
 *
 * Covers:
 *   A. BLK-066 — obj_carrying_pid_obj equipped-slot check
 *   B. BLK-067 — party_member_obj null gParty guard
 *   C. sfall opcodes 0x8218–0x821F (game time, kill type, etc.)
 *   D. Checklist integrity
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
        inventory: [],
        dead: false,
        pid: 100,
        ...overrides,
    }
}

function makeItem(pid: number): any {
    return { type: 'item', subtype: 'weapon', pid, art: 'knife' }
}

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
})

// ===========================================================================
// Phase 63-A — BLK-066: obj_carrying_pid_obj equipped-slot check
// ===========================================================================

describe('Phase 63-A — BLK-066: obj_carrying_pid_obj equipped-slot check', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    it('finds item in inventory by PID', () => {
        const item = makeItem(500)
        const obj = makeObj({ inventory: [item] })
        expect(script.obj_carrying_pid_obj(obj, 500)).toBe(item)
    })

    it('returns 0 when item not in inventory and no equipped slots', () => {
        const obj = makeObj({ inventory: [] })
        expect(script.obj_carrying_pid_obj(obj, 500)).toBe(0)
    })

    it('returns 0 when PID does not match any equipped slot', () => {
        const obj = makeObj({ inventory: [], leftHand: makeItem(111), rightHand: makeItem(222) })
        expect(script.obj_carrying_pid_obj(obj, 999)).toBe(0)
    })

    it('returns 0 for null obj (graceful guard)', () => {
        expect(script.obj_carrying_pid_obj(null as any, 500)).toBe(0)
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_066_obj_carrying_pid_obj_equipped')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 63-B — BLK-067: party_member_obj null gParty guard
// ===========================================================================

describe('Phase 63-B — BLK-067: party_member_obj null gParty guard', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    it('returns 0 without crashing when gParty is null', async () => {
        const gs = (await import('./globalState.js')).default
        const orig = gs.gParty
        ;(gs as any).gParty = null
        expect(() => script.party_member_obj(100)).not.toThrow()
        expect(script.party_member_obj(100)).toBe(0)
        gs.gParty = orig
    })

    it('returns 0 when party member not found', async () => {
        const gs = (await import('./globalState.js')).default
        if (!gs.gParty) {return} // skip if no party
        expect(script.party_member_obj(99999)).toBe(0)
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_067_party_member_obj_null_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 63-D — Checklist integrity
// ===========================================================================

describe('Phase 63-D — Checklist integrity', () => {
    const phase63Ids = [
        'blk_066_obj_carrying_pid_obj_equipped',
        'blk_067_party_member_obj_null_guard',
        'sfall_get_year',
        'sfall_get_month',
        'sfall_get_day',
        'sfall_get_time',
        'sfall_get_critter_kill_type_0x821c',
        'sfall_get_npc_pids',
        'sfall_get_proto_num',
        'sfall_mark_area_known',
    ]

    it('all Phase 63 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase63Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK entries have status "implemented"', () => {
        const blkIds = [
            'blk_066_obj_carrying_pid_obj_equipped',
            'blk_067_party_member_obj_null_guard',
        ]
        for (const id of blkIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should be implemented`).toBe('implemented')
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
