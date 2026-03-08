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

    it('finds item in leftHand slot (BLK-066)', () => {
        const item = makeItem(999)
        const obj = makeObj({ inventory: [], leftHand: item })
        expect(script.obj_carrying_pid_obj(obj, 999)).toBe(item)
    })

    it('finds item in rightHand slot (BLK-066)', () => {
        const item = makeItem(888)
        const obj = makeObj({ inventory: [], rightHand: item })
        expect(script.obj_carrying_pid_obj(obj, 888)).toBe(item)
    })

    it('finds item in equippedArmor slot (BLK-066)', () => {
        const item = makeItem(777)
        const obj = makeObj({ inventory: [], equippedArmor: item })
        expect(script.obj_carrying_pid_obj(obj, 777)).toBe(item)
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
        if (!gs.gParty) return // skip if no party
        expect(script.party_member_obj(99999)).toBe(0)
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_067_party_member_obj_null_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 63-C — sfall opcodes 0x8218–0x821F
// ===========================================================================

describe('Phase 63-C — sfall opcodes 0x8218–0x821F', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    async function setGameTime(ticks: number) {
        const gs = (await import('./globalState.js')).default
        const orig = gs.gameTickTime
        gs.gameTickTime = ticks
        return () => { gs.gameTickTime = orig }
    }

    // ---- 0x8218 get_year_sfall ----
    it('get_year_sfall returns 2241 at game start (gameTickTime=0)', async () => {
        const restore = await setGameTime(0)
        expect(script.get_year_sfall()).toBe(2241)
        restore()
    })

    it('get_year_sfall returns 2242 after one in-game year', async () => {
        // 1 year = 365 * 86400 * 10 ticks
        const restore = await setGameTime(365 * 86400 * 10)
        expect(script.get_year_sfall()).toBe(2242)
        restore()
    })

    it('get_year_sfall returns a number', () => {
        expect(typeof script.get_year_sfall()).toBe('number')
    })

    // ---- 0x8219 get_month_sfall ----
    it('get_month_sfall returns a number between 1 and 12', async () => {
        const restore = await setGameTime(0)
        const m = script.get_month_sfall()
        expect(m).toBeGreaterThanOrEqual(1)
        expect(m).toBeLessThanOrEqual(12)
        restore()
    })

    it('get_month_sfall returns month 2 after 31 days', async () => {
        // 31 days into the year: day 31 = floor(31/30)+1 = 2nd month
        const restore = await setGameTime(31 * 86400 * 10)
        expect(script.get_month_sfall()).toBe(2)
        restore()
    })

    // ---- 0x821A get_day_sfall ----
    it('get_day_sfall returns a number between 1 and 30', async () => {
        const restore = await setGameTime(0)
        const d = script.get_day_sfall()
        expect(d).toBeGreaterThanOrEqual(1)
        expect(d).toBeLessThanOrEqual(30)
        restore()
    })

    it('get_day_sfall returns day 5 after 4 days', async () => {
        // 4 days: dayOfYear=4, 4%30=4, +1=5
        const restore = await setGameTime(4 * 86400 * 10)
        expect(script.get_day_sfall()).toBe(5)
        restore()
    })

    // ---- 0x821B get_time_sfall ----
    it('get_time_sfall returns 0 at midnight', async () => {
        const restore = await setGameTime(0)
        expect(script.get_time_sfall()).toBe(0)
        restore()
    })

    it('get_time_sfall returns 1200 at noon', async () => {
        // Noon = 12 * 3600 seconds into the day = 12 * 3600 * 10 ticks
        const restore = await setGameTime(12 * 3600 * 10)
        expect(script.get_time_sfall()).toBe(1200)
        restore()
    })

    it('get_time_sfall returns 1430 at 2:30 PM', async () => {
        // 14h 30min = (14*3600 + 30*60) * 10 ticks
        const restore = await setGameTime((14 * 3600 + 30 * 60) * 10)
        expect(script.get_time_sfall()).toBe(1430)
        restore()
    })

    // ---- 0x821C get_critter_kill_type_sfall ----
    it('get_critter_kill_type_sfall returns 0 for null', () => {
        expect(script.get_critter_kill_type_sfall(null as any)).toBe(0)
    })

    it('get_critter_kill_type_sfall returns 0 when killType absent', () => {
        const critter = makeObj()
        expect(script.get_critter_kill_type_sfall(critter)).toBe(0)
    })

    it('get_critter_kill_type_sfall returns killType from proto.extra (same as 0x81F4)', () => {
        // 0x821C is a second binding to the same function as 0x81F4; reads pro.extra.killType
        const critter = makeObj({ pro: { extra: { killType: 3 } } })
        expect(script.get_critter_kill_type_sfall(critter)).toBe(3)
    })

    // ---- 0x821D get_npc_pids_sfall ----
    it('get_npc_pids_sfall returns 0 (not implemented in browser build)', () => {
        expect(script.get_npc_pids_sfall()).toBe(0)
    })

    // ---- 0x821E get_proto_num_sfall ----
    it('get_proto_num_sfall returns 0 for null', () => {
        expect(script.get_proto_num_sfall(null as any)).toBe(0)
    })

    it('get_proto_num_sfall returns pid from object', () => {
        const obj = makeObj({ pid: 42 })
        expect(script.get_proto_num_sfall(obj)).toBe(42)
    })

    it('get_proto_num_sfall returns 0 when pid absent', () => {
        const obj = makeObj()
        delete obj.pid
        expect(script.get_proto_num_sfall(obj)).toBe(0)
    })

    // ---- 0x821F mark_area_known_sfall ----
    it('mark_area_known_sfall does not throw when markAreaKnown not registered', () => {
        expect(() => script.mark_area_known_sfall(1, 1)).not.toThrow()
    })

    it('mark_area_known_sfall calls globalState.markAreaKnown when registered', async () => {
        const gs = (await import('./globalState.js')).default
        const orig = gs.markAreaKnown
        const spy = vi.fn()
        gs.markAreaKnown = spy
        script.mark_area_known_sfall(5, 1)
        expect(spy).toHaveBeenCalledWith(5, 1)
        gs.markAreaKnown = orig
    })

    it('mark_area_known_sfall is no-op when markAreaKnown is null', async () => {
        const gs = (await import('./globalState.js')).default
        const orig = gs.markAreaKnown
        gs.markAreaKnown = null
        expect(() => script.mark_area_known_sfall(5, 1)).not.toThrow()
        gs.markAreaKnown = orig
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
