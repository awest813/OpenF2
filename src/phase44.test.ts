/**
 * Phase 44 regression tests.
 *
 * Focus: VM stack safety (undefined push guard), map_var() bare-return fix,
 * destroyObject destroy_p_proc integration, nextTurn skip-depth guard, and
 * new sfall opcodes 0x819C–0x81A2.
 *
 *   Phase 44-A — vm_bridge.ts: push(r ?? 0) — undefined stack guard
 *   Phase 44-B — scripting.ts: map_var() bare returns → return 0
 *   Phase 44-C — map.ts: destroyObject() calls destroy_p_proc
 *   Phase 44-D — combat.ts: nextTurn() skip-depth guard prevents infinite loop
 *   Phase 44-E — sfall 0x819C–0x81A2: world-map, critter level, object weight
 *   Phase 44-F — checklist integrity: all Phase 44 entries present and implemented
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

// ===========================================================================
// Phase 44-A — vm_bridge.ts: push(r ?? 0) — undefined stack guard
// ===========================================================================

describe('Phase 44-A — vm_bridge push(r ?? 0) undefined stack guard', () => {
    it('checklist entry vm_bridge_push_undefined_guard is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'vm_bridge_push_undefined_guard')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('vm_bridge_push_undefined_guard description mentions push(r ?? 0) and undefined', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'vm_bridge_push_undefined_guard')
        expect(entry?.description).toContain('push(r ?? 0)')
        expect(entry?.description).toContain('undefined')
    })
})

// ===========================================================================
// Phase 44-B — scripting.ts: map_var() bare returns → return 0
// ===========================================================================

describe('Phase 44-B — scripting.ts map_var bare returns fixed', () => {
    it('checklist entry map_var_bare_return_fix is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'map_var_bare_return_fix')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('map_var_bare_return_fix description mentions no map script and 0x80C3', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'map_var_bare_return_fix')
        expect(entry?.description).toContain('map script')
        expect(entry?.description).toContain('0x80C3')
    })
})

// ===========================================================================
// Phase 44-C — map.ts: destroyObject() calls destroy_p_proc
// ===========================================================================

describe('Phase 44-C — map.ts destroyObject calls destroy_p_proc', () => {
    it('checklist entry destroy_object_calls_destroy_p_proc is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'destroy_object_calls_destroy_p_proc')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('destroy_object_calls_destroy_p_proc description mentions Scripting.destroy and reentrance guard', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'destroy_object_calls_destroy_p_proc')
        expect(entry?.description).toContain('Scripting.destroy')
        expect(entry?.description).toContain('reentrance')
    })
})

// ===========================================================================
// Phase 44-D — combat.ts: nextTurn() skip-depth guard
// ===========================================================================

describe('Phase 44-D — combat.ts nextTurn skip-depth guard prevents infinite loop', () => {
    it('checklist entry next_turn_skip_depth_guard is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'next_turn_skip_depth_guard')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('next_turn_skip_depth_guard description mentions skipDepth and combatant count', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'next_turn_skip_depth_guard')
        expect(entry?.description).toContain('skipDepth')
        expect(entry?.description).toContain('combatant count')
    })
})

// ===========================================================================
// Phase 44-E — sfall 0x819C–0x81A2: world-map, critter level, object weight
// ===========================================================================

describe('Phase 44-E — sfall 0x819C–0x81A2 world-map/critter-level/weight opcodes', () => {
    const OPCODE_IDS = [
        'get_world_map_x',
        'get_world_map_y',
        'set_world_map_pos',
        'in_world_map',
        'get_critter_level',
        'set_critter_level',
        'get_object_weight',
    ]

    for (const id of OPCODE_IDS) {
        it(`checklist entry "${id}" is present and implemented`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status).toBe('implemented')
            expect(entry?.kind).toBe('opcode')
        })
    }

    it('get_world_map_x description references 0x819C and worldPosition', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_world_map_x')
        expect(entry?.description).toContain('0x819C')
        expect(entry?.description).toContain('worldPosition')
    })

    it('get_world_map_y description references 0x819D', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_world_map_y')
        expect(entry?.description).toContain('0x819D')
    })

    it('set_world_map_pos description references 0x819E and teleport', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_world_map_pos')
        expect(entry?.description).toContain('0x819E')
        expect(entry?.description).toContain('teleport')
    })

    it('in_world_map description references 0x819F', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'in_world_map')
        expect(entry?.description).toContain('0x819F')
    })

    it('get_critter_level description references 0x81A0 and level', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_critter_level')
        expect(entry?.description).toContain('0x81A0')
        expect(entry?.description).toContain('level')
    })

    it('set_critter_level description references 0x81A1', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_critter_level')
        expect(entry?.description).toContain('0x81A1')
    })

    it('get_object_weight description references 0x81A2 and weight', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_object_weight')
        expect(entry?.description).toContain('0x81A2')
        expect(entry?.description).toContain('weight')
    })
})

// ===========================================================================
// Phase 44-F — checklist integrity
// ===========================================================================

describe('Phase 44-F — checklist integrity: all Phase 44 entries present', () => {
    const PHASE_44_IDS = [
        'vm_bridge_push_undefined_guard',
        'map_var_bare_return_fix',
        'destroy_object_calls_destroy_p_proc',
        'next_turn_skip_depth_guard',
        'get_world_map_x',
        'get_world_map_y',
        'set_world_map_pos',
        'in_world_map',
        'get_critter_level',
        'set_critter_level',
        'get_object_weight',
    ]

    for (const id of PHASE_44_IDS) {
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

    it('all Phase 44 entries are in "implemented" status (no stubs or partials)', () => {
        for (const id of PHASE_44_IDS) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should be implemented`).toBe('implemented')
        }
    })
})
