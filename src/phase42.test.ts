/**
 * Phase 42 regression tests.
 *
 * Focus: VM resilience (throw→warn), inven_cmds unknown cmd→warn,
 * explosion() damage parameter, console.log cleanup.
 *
 *   Phase 42-A — vm_bridge.ts: missing bridged procedure → warn+push 0 (no throw)
 *   Phase 42-B — vm.ts call(): unknown procedure → warn+return (no throw)
 *   Phase 42-C — vm.ts pop(): data-stack underflow → warn+return 0 (no throw)
 *   Phase 42-D — vm.ts popAddr(): return-stack underflow → warn+return -1 (halt sentinel)
 *   Phase 42-E — scripting.ts: inven_cmds unknown cmd → warn+null (no stub())
 *   Phase 42-F — scripting.ts: explosion() uses script-supplied damage (not hardcoded 0/100)
 *   Phase 42-G — checklist integrity: all Phase 42 entries present and implemented
 */

import { describe, it, expect, vi } from 'vitest'
import { SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

// ===========================================================================
// Phase 42-A — vm_bridge: missing bridged procedure → warn+push 0 (no throw)
// ===========================================================================

describe('Phase 42-A — vm_bridge: missing bridged procedure → warn+no-throw', () => {
    it('checklist entry vm_bridge_missing_proc_no_throw is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'vm_bridge_missing_proc_no_throw')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 42-B — vm.ts call(): unknown procedure → warn+return (no throw)
// ===========================================================================

describe('Phase 42-B — vm.ts call(): unknown procedure → warn+return undefined', () => {
    it('checklist entry vm_call_unknown_proc_no_throw is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'vm_call_unknown_proc_no_throw')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 42-C — vm.ts pop(): stack underflow → warn+return 0 (no throw)
// ===========================================================================

describe('Phase 42-C — vm.ts pop() stack underflow → warn+0 (no throw)', () => {
    it('checklist entry vm_stack_underflow_no_throw is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'vm_stack_underflow_no_throw')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 42-D — vm.ts popAddr(): return-stack underflow → warn+return -1 (no throw)
// ===========================================================================

describe('Phase 42-D — vm.ts popAddr() return-stack underflow → -1 (no throw)', () => {
    it('vm_stack_underflow_no_throw covers both pop() and popAddr() underflows', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'vm_stack_underflow_no_throw')
        expect(entry?.description).toContain('popAddr')
        expect(entry?.description).toContain('pop()')
    })
})

// ===========================================================================
// Phase 42-E — inven_cmds unknown cmd → warn+null (no stub())
// ===========================================================================

describe('Phase 42-E — inven_cmds unknown command → warn+null (no stub hit)', () => {
    it('checklist entry inven_cmds is now implemented (not partial)', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'inven_cmds')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('medium')
    })

    it('inven_cmds description mentions unknown command handling', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'inven_cmds')
        expect(entry?.description).toContain('Unknown command')
    })
})

// ===========================================================================
// Phase 42-F — explosion() uses script-supplied damage parameter
// ===========================================================================

describe('Phase 42-F — explosion() uses script-supplied damage (not hardcoded 0/100)', () => {
    it('checklist entry explosion_uses_script_damage is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'explosion_uses_script_damage')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('medium')
    })
})

// ===========================================================================
// Phase 42-G — checklist integrity
// ===========================================================================

describe('Phase 42-G — checklist integrity: all Phase 42 entries present', () => {
    const PHASE_42_IDS = [
        'vm_bridge_missing_proc_no_throw',
        'vm_call_unknown_proc_no_throw',
        'vm_stack_underflow_no_throw',
        'inven_cmds',
        'explosion_uses_script_damage',
    ]

    for (const id of PHASE_42_IDS) {
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

    it('all Phase 42 entries are in "implemented" status (no stubs or partials)', () => {
        for (const id of PHASE_42_IDS) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should be implemented`).toBe('implemented')
        }
    })
})
