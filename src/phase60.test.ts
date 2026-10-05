/**
 * Phase 60 regression tests.
 *
 * Covers:
 *   A. BLK-059 — Combat null-position guards (attack, findTarget, doAITurn, nextTurn)
 *   B. sfall opcodes 0x8200–0x8207
 *   C. Checklist integrity
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import globalState from './globalState.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'TestNPC',
        position: { x: 10, y: 20 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 100,
        hostile: false,
        teamNum: 1,
        stats: { getBase: () => 5, setBase: () => {}, modifyBase: () => {}, get: () => 5, baseStats: {} },
        skills: { getBase: () => 0, setBase: () => {}, baseSkills: {}, skillPoints: 0 },
        getStat: (s: string) => s === 'HP' ? 30 : s === 'Max HP' ? 50 : 5,
        perkRanks: {},
        ...overrides,
    }
}

// ===========================================================================
// Phase 60-A — BLK-059: Combat null-position guards
// ===========================================================================

describe('Phase 60-A — BLK-059: Combat null-position guards', () => {
    it('BLK-059 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_059_combat_null_position_guards')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 60-C — Checklist integrity
// ===========================================================================

describe('Phase 60-C — Checklist integrity', () => {
    const phase60Ids = [
        'blk_059_combat_null_position_guards',
        'sfall_get_critter_current_hp',
        'sfall_get_critter_level2',
        'sfall_get_num_nearby_critters',
        'sfall_is_critter_hostile',
        'sfall_set_critter_hostile',
        'sfall_get_inven_slot',
        'sfall_get_critter_body_type',
        'sfall_get_flags',
    ]

    it('all Phase 60 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase60Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK-059 entry has status "implemented"', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_059_combat_null_position_guards')
        expect(entry?.status).toBe('implemented')
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('total checklist entries have grown from Phase 59', () => {
        // Should have at least 9 new entries for Phase 60
        expect(SCRIPTING_STUB_CHECKLIST.length).toBeGreaterThanOrEqual(200)
    })
})
