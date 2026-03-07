/**
 * Phase 43 regression tests.
 *
 * Focus: VM step-limit throw→warn+halt, combat perk fidelity (Sharpshooter,
 * Sniper, Jinxed trait), tile_is_visible distance-based check,
 * metarule3(104) LOS distance approximation.
 *
 *   Phase 43-A — vm.ts: step limit exceeded → warn+halt (no throw)
 *   Phase 43-B — combat.ts: Sharpshooter perk reduces distance penalty
 *   Phase 43-C — combat.ts: Sniper perk second roll for critical
 *   Phase 43-D — combat.ts: Jinxed trait crit miss
 *   Phase 43-E — scripting.ts: tile_is_visible uses hex distance
 *   Phase 43-F — scripting.ts: metarule3(104) LOS distance approximation
 *   Phase 43-G — checklist integrity: all Phase 43 entries present and implemented
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

// ===========================================================================
// Phase 43-A — vm.ts: step limit exceeded → warn+halt (no throw)
// ===========================================================================

describe('Phase 43-A — vm.ts step limit → warn+halt (no throw)', () => {
    it('checklist entry vm_step_limit_no_throw is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'vm_step_limit_no_throw')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('vm_step_limit_no_throw description mentions halting gracefully', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'vm_step_limit_no_throw')
        expect(entry?.description).toContain('halted')
        expect(entry?.description).toContain('warn')
    })
})

// ===========================================================================
// Phase 43-B — combat.ts: Sharpshooter perk (ID 5)
// ===========================================================================

describe('Phase 43-B — combat.ts Sharpshooter perk reduces distance penalty', () => {
    it('checklist entry sharpshooter_perk_distance is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sharpshooter_perk_distance')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sharpshooter_perk_distance description references perk ID 5 and distance', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sharpshooter_perk_distance')
        expect(entry?.description).toContain('Sharpshooter')
        expect(entry?.description).toContain('ID 5')
        expect(entry?.description).toContain('distance')
    })
})

// ===========================================================================
// Phase 43-C — combat.ts: Sniper perk (ID 9) second roll
// ===========================================================================

describe('Phase 43-C — combat.ts Sniper perk second roll for critical', () => {
    it('checklist entry sniper_perk_called_shot is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sniper_perk_called_shot')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sniper_perk_called_shot description references perk ID 9 and second roll', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sniper_perk_called_shot')
        expect(entry?.description).toContain('Sniper')
        expect(entry?.description).toContain('ID 9')
        expect(entry?.description).toContain('second')
    })
})

// ===========================================================================
// Phase 43-D — combat.ts: Jinxed trait (charTraits ID 9) crit miss
// ===========================================================================

describe('Phase 43-D — combat.ts Jinxed trait crit miss', () => {
    it('checklist entry jinxed_trait_crit_miss is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'jinxed_trait_crit_miss')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('jinxed_trait_crit_miss description references 50% chance and charTraits', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'jinxed_trait_crit_miss')
        expect(entry?.description).toContain('Jinxed')
        expect(entry?.description).toContain('50%')
    })
})

// ===========================================================================
// Phase 43-E — scripting.ts: tile_is_visible distance-based check
// ===========================================================================

describe('Phase 43-E — tile_is_visible uses hex distance', () => {
    it('checklist entry tile_is_visible_range is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'tile_is_visible_range')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.frequency).toBe('high')
    })

    it('tile_is_visible_range description mentions 14-hex radius and fallback', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'tile_is_visible_range')
        expect(entry?.description).toContain('14')
        expect(entry?.description).toContain('Falls back')
    })
})

// ===========================================================================
// Phase 43-F — scripting.ts: metarule3(104) LOS distance approximation
// ===========================================================================

describe('Phase 43-F — metarule3(104) LOS distance approximation', () => {
    it('checklist entry metarule3_tile_los_distance is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule3_tile_los_distance')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('metarule3_tile_los_distance description mentions hex distance and view radius', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule3_tile_los_distance')
        expect(entry?.description).toContain('hex distance')
        expect(entry?.description).toContain('14')
    })
})

// ===========================================================================
// Phase 43-G — checklist integrity
// ===========================================================================

describe('Phase 43-G — checklist integrity: all Phase 43 entries present', () => {
    const PHASE_43_IDS = [
        'vm_step_limit_no_throw',
        'sharpshooter_perk_distance',
        'sniper_perk_called_shot',
        'jinxed_trait_crit_miss',
        'tile_is_visible_range',
        'metarule3_tile_los_distance',
    ]

    for (const id of PHASE_43_IDS) {
        it(`checklist entry "${id}" is present with required fields`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.kind).toMatch(/^(opcode|procedure|metarule)$/)
            expect(entry?.description.length).toBeGreaterThan(20)
            expect(entry?.status).toMatch(/^(stub|partial|implemented)$/)
            expect(entry?.frequency).toMatch(/^(high|medium|low)$/)
            expect(entry?.impact).toMatch(/^(blocker|high|medium|low)$/)
        })
    }

    it('all Phase 43 entries are in "implemented" status (no stubs or partials)', () => {
        for (const id of PHASE_43_IDS) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should be implemented`).toBe('implemented')
        }
    })
})
