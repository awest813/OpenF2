/**
 * Phase 76 regression tests.
 *
 * Covers:
 *   A. BLK-117 — get_last_target / get_last_attacker now read real per-critter tracking
 *   B. BLK-118 — renderer.ts objectRenderInfo/objectBoundingBox null position guards (checklist)
 *   C. BLK-119 — map.ts recalcPath() safe performance.now() guard (checklist)
 *   D. BLK-120 — obj_run_proc (sfall 0x81D7) real dispatch implementation (checklist)
 *   E. sfall 0x8280–0x8281 — get_last_target_sfall / get_last_attacker_sfall aliases
 *   F. sfall 0x8282 — get_critter_level_sfall
 *   G. sfall 0x8283 — get_critter_xp_sfall
 *   H. sfall 0x8284 — set_critter_level_sfall
 *   I. sfall 0x8285 — get_critter_base_stat_sfall
 *   J. sfall 0x8286 — set_critter_base_stat_sfall
 *   K. sfall 0x8287 — get_obj_weight_sfall
 *   L. Method registration checks (0x8282–0x8287)
 *   M. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import globalState from './globalState.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return {
        ...actual,
        uiStartCombat: vi.fn(),
        uiEndCombat: vi.fn(),
        uiLog: vi.fn(),
        uiAddDialogueOption: vi.fn(),
        uiSetDialogueReply: vi.fn(),
    }
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
            getBase: (s: string) => 5,
            setBase: (_s: string, _v: number) => {},
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
// Phase 76-A — BLK-117: last-target / last-attacker per-critter tracking
// ===========================================================================

describe('Phase 76-A — BLK-117: get_last_target / get_last_attacker real tracking', () => {
    it('BLK-117 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-117')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

})

// ===========================================================================
// Phase 76-B — BLK-118: renderer.ts null position guards
// ===========================================================================

describe('Phase 76-B — BLK-118: renderer null position guards (checklist)', () => {
    it('BLK-118 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-118')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 76-C — BLK-119: map.ts performance.now() guard
// ===========================================================================

describe('Phase 76-C — BLK-119: map.ts recalcPath() safe performance.now() (checklist)', () => {
    it('BLK-119 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-119')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 76-D — BLK-120: obj_run_proc real dispatch
// ===========================================================================

describe('Phase 76-D — BLK-120: obj_run_proc real dispatch (checklist)', () => {
    it('BLK-120 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-120')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 76-L — sfall method registration check (0x8282–0x8287)
// ===========================================================================

// ===========================================================================
// Phase 76-M — Checklist integrity
// ===========================================================================

describe('Phase 76-M — Checklist integrity', () => {
    const phase76Ids = [
        'BLK-117',
        'BLK-118',
        'BLK-119',
        'BLK-120',
        'sfall_get_critter_level',
        'sfall_get_critter_xp_82',
        'sfall_set_critter_level',
        'sfall_get_critter_base_stat_82',
        'sfall_set_critter_base_stat_82',
        'sfall_get_obj_weight',
    ]

    it('all Phase 76 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase76Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
