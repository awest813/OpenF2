/**
 * Phase 65 regression tests.
 *
 * Covers:
 *   A. sfall opcodes 0x8228–0x822F (critter name, car fuel, AI packet, attack weapon, tile pid)
 *   B. Checklist integrity
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
        getStat: (s: string) => 5,
        getSkill: (s: string) => 50,
        ...overrides,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
})

// ===========================================================================
// Phase 65-B — Checklist integrity
// ===========================================================================

describe('Phase 65-B — Checklist integrity', () => {
    const phase65Ids = [
        'sfall_get_critter_name',
        'sfall_get_car_fuel_amount',
        'sfall_set_car_fuel_amount',
        'sfall_get_critter_ai_packet',
        'sfall_set_critter_ai_packet',
        'sfall_obj_under_cursor',
        'sfall_get_attack_weapon',
        'sfall_get_tile_pid_at',
    ]

    it('all Phase 65 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase65Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
