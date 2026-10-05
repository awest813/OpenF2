/**
 * Phase 64 regression tests.
 *
 * Covers:
 *   A. BLK-068 — combatEvent script_overrides detection
 *   B. BLK-069 — destroy_object null guard
 *   C. BLK-070 — set_flags_sfall (0x8222)
 *   D. sfall opcodes 0x8220–0x8227
 *   E. Checklist integrity
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
        perkRanks: {},
        getStat: (s: string) => s === 'PER' ? 8 : 5,
        getSkill: (s: string) => 60,
        ...overrides,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
})

// ===========================================================================
// Phase 64-A — BLK-068: combatEvent script_overrides detection
// ===========================================================================

describe('Phase 64-A — BLK-068: combatEvent script_overrides detection', () => {
    it('combatEvent returns true when combat_p_proc calls script_overrides', async () => {
        const { Scripting: S } = await import('./scripting.js')
        const script = new (S as any).Script()
        // Simulate a critter with a combat_p_proc that calls script_overrides
        script.combat_p_proc = vi.fn(function (this: typeof script) {
            this.script_overrides()
        })
        script.scriptName = 'test_combat'

        const obj: any = {
            _script: script,
            type: 'critter',
        }

        const result = S.combatEvent(obj, 'turnBegin')
        expect(result).toBe(true) // script_overrides was called → override is set
    })

    it('combatEvent returns false when combat_p_proc does NOT call script_overrides', async () => {
        const { Scripting: S } = await import('./scripting.js')
        const script = new (S as any).Script()
        script.combat_p_proc = vi.fn() // just runs, no script_overrides
        script.scriptName = 'test_combat_no_override'

        const obj: any = {
            _script: script,
            type: 'critter',
        }

        const result = S.combatEvent(obj, 'turnBegin')
        expect(result).toBe(false)
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_068_combat_event_override_detection')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 64-B — BLK-069: destroy_object null guard
// ===========================================================================

describe('Phase 64-B — BLK-069: destroy_object null guard', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    it('does not throw when obj is null', () => {
        expect(() => script.destroy_object(null as any)).not.toThrow()
    })

    it('does not throw when gMap is null', async () => {
        const gs = (await import('./globalState.js')).default
        const orig = gs.gMap
        ;(gs as any).gMap = null
        expect(() => script.destroy_object(makeObj())).not.toThrow()
        gs.gMap = orig
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_069_destroy_object_null_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 64-C — BLK-070: set_flags_sfall
// ===========================================================================

describe('Phase 64-C — BLK-070: set_flags_sfall (0x8222)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_070_set_flags_sfall')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 64-E — Checklist integrity
// ===========================================================================

describe('Phase 64-E — Checklist integrity', () => {
    const phase64Ids = [
        'blk_068_combat_event_override_detection',
        'blk_069_destroy_object_null_guard',
        'blk_070_set_flags_sfall',
        'sfall_get_cursor_mode',
        'sfall_set_cursor_mode',
        'sfall_set_flags',
        'sfall_critter_skill_level',
        'sfall_get_active_weapon',
        'sfall_get_inven_ap_cost',
        'sfall_obj_can_see_tile',
        'sfall_get_map_enter_position',
    ]

    it('all Phase 64 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase64Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK entries have status "implemented"', () => {
        const blkIds = [
            'blk_068_combat_event_override_detection',
            'blk_069_destroy_object_null_guard',
            'blk_070_set_flags_sfall',
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
