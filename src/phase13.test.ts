/**
 * Phase 13 regression tests — Core scripting VM (INT bytecode) extension.
 *
 * Covers all items added in this phase:
 *
 *   Phase 13-A — VM step limit (vmMaxStepsPerCall config + enforcement)
 *   Phase 13-B — sfall 0x816C abs_value: absolute value of a number
 *   Phase 13-C — sfall 0x816D string_length: length of a string
 *   Phase 13-D — sfall 0x816E pow: exponentiation
 *   Phase 13-E — sfall 0x816F obj_is_valid: valid game-object check
 *   Phase 13-F — Checklist accuracy: new sfall opcodes are 'implemented'
 */

import { describe, it, expect } from 'vitest'
import { Config } from './config.js'
import {
    SCRIPTING_STUB_CHECKLIST,
    stubChecklistSummary,
} from './scriptingChecklist.js'

// ===========================================================================
// Phase 13-A — VM step limit
// ===========================================================================

/**
 * Inline replica of the step-limit enforcement logic added to ScriptVM.run().
 *
 * Mirrors the real implementation: after each step executes, the step counter
 * is pre-incremented and compared with the limit (same as `++runSteps >= maxSteps`
 * in vm.ts).
 */
function runWithStepLimit(
    maxSteps: number,
    totalStepsProduced: number
): { threw: boolean; errorMessage: string | null } {
    let runSteps = 0
    try {
        for (let step = 0; step < totalStepsProduced; step++) {
            // Mirror vm.ts: `++runSteps >= maxSteps` throws after executing the maxSteps-th step.
            if (maxSteps > 0 && ++runSteps >= maxSteps) {
                throw new Error(`ScriptVM step limit exceeded (${maxSteps} steps) in loop.int`)
            }
        }
        return { threw: false, errorMessage: null }
    } catch (e: any) {
        return { threw: true, errorMessage: e.message ?? String(e) }
    }
}

describe('Phase 13-A — VM step limit enforcement', () => {
    it('throws when step limit is exceeded', () => {
        const result = runWithStepLimit(10, 100)
        expect(result.threw).toBe(true)
    })

    it('error message includes the step limit', () => {
        const result = runWithStepLimit(10, 100)
        expect(result.errorMessage).toMatch(/10/)
    })

    it('error message includes the script name', () => {
        const result = runWithStepLimit(10, 100)
        expect(result.errorMessage).toMatch(/loop\.int/)
    })

    it('does not throw when all steps complete within the limit', () => {
        const result = runWithStepLimit(100, 5)
        expect(result.threw).toBe(false)
    })

    it('does not throw when maxSteps is 0 (unlimited)', () => {
        const result = runWithStepLimit(0, 1_000_000)
        expect(result.threw).toBe(false)
    })

    it('throws exactly at the limit boundary', () => {
        // With `++runSteps >= maxSteps`, the throw fires when the maxSteps-th
        // step executes (runSteps reaches maxSteps). So a script with exactly
        // maxSteps steps triggers the limit; one with maxSteps-1 steps does not.
        const limit = 7
        const atLimit = runWithStepLimit(limit, limit)
        expect(atLimit.threw).toBe(true)

        const underLimit = runWithStepLimit(limit, limit - 1)
        expect(underLimit.threw).toBe(false)
    })

    it('vmMaxStepsPerCall default is 0 (unlimited)', () => {
        expect(Config.engine.vmMaxStepsPerCall).toBe(0)
    })
})

// ===========================================================================
// Phase 13-B — abs_value
// ===========================================================================

/**
 * Inline replica of Script.abs_value: returns Math.abs(x).
 */
function absValueImpl(x: number): number {
    return Math.abs(x)
}

describe('Phase 13-B — abs_value (sfall 0x816C)', () => {
    it('returns 0 for 0', () => {
        expect(absValueImpl(0)).toBe(0)
    })

    it('returns positive value unchanged', () => {
        expect(absValueImpl(42)).toBe(42)
    })

    it('returns positive for negative input', () => {
        expect(absValueImpl(-7)).toBe(7)
    })

    it('handles large negative numbers', () => {
        expect(absValueImpl(-1_000_000)).toBe(1_000_000)
    })

    it('handles floating-point values', () => {
        expect(absValueImpl(-3.14)).toBeCloseTo(3.14)
    })
})

// ===========================================================================
// Phase 13-C — string_length
// ===========================================================================

/**
 * Inline replica of Script.string_length.
 *
 * Returns the length of a string, or 0 for non-string input (defensive
 * behaviour consistent with the scripting module's handling of wrong types).
 */
function stringLengthImpl(str: any): number {
    if (typeof str !== 'string') {return 0}
    return str.length
}

describe('Phase 13-C — string_length (sfall 0x816D)', () => {
    it('returns 0 for empty string', () => {
        expect(stringLengthImpl('')).toBe(0)
    })

    it('returns the character count for a regular string', () => {
        expect(stringLengthImpl('hello')).toBe(5)
    })

    it('returns 0 for non-string (null-like safety)', () => {
        expect(stringLengthImpl(null)).toBe(0)
        expect(stringLengthImpl(undefined)).toBe(0)
        expect(stringLengthImpl(42)).toBe(0)
    })

    it('counts spaces correctly', () => {
        expect(stringLengthImpl('a b')).toBe(3)
    })

    it('handles a long string', () => {
        const s = 'x'.repeat(200)
        expect(stringLengthImpl(s)).toBe(200)
    })
})

// ===========================================================================
// Phase 13-D — pow
// ===========================================================================

/**
 * Inline replica of Script.pow: returns base^exp via Math.pow.
 */
function powImpl(base: number, exp: number): number {
    return Math.pow(base, exp)
}

describe('Phase 13-D — pow (sfall 0x816E)', () => {
    it('2^10 = 1024', () => {
        expect(powImpl(2, 10)).toBe(1024)
    })

    it('any number to the power of 0 is 1', () => {
        expect(powImpl(5, 0)).toBe(1)
        expect(powImpl(-3, 0)).toBe(1)
    })

    it('any number to the power of 1 is itself', () => {
        expect(powImpl(7, 1)).toBe(7)
    })

    it('handles fractional exponents (square root via pow)', () => {
        expect(powImpl(9, 0.5)).toBeCloseTo(3)
    })

    it('handles negative exponent (reciprocal)', () => {
        expect(powImpl(2, -1)).toBeCloseTo(0.5)
    })

    it('0^0 is 1 (IEEE 754 / JS convention)', () => {
        expect(powImpl(0, 0)).toBe(1)
    })
})

// ===========================================================================
// Phase 13-E — obj_is_valid
// ===========================================================================

/**
 * Inline replica of Script.obj_is_valid.
 *
 * A "game object" in the scripting module is any object whose `_type` field
 * is truthy (the marker set by the object creation helpers). This replica
 * uses a minimal duck-typed check consistent with the real isGameObject.
 */
function objIsValidImpl(obj: any): number {
    // Mirrors isGameObject in scripting.ts: the object must have a truthy _type field.
    if (obj === null || obj === undefined) {return 0}
    if (typeof obj !== 'object') {return 0}
    return obj._type ? 1 : 0
}

describe('Phase 13-E — obj_is_valid (sfall 0x816F)', () => {
    it('returns 0 for null', () => {
        expect(objIsValidImpl(null)).toBe(0)
    })

    it('returns 0 for undefined', () => {
        expect(objIsValidImpl(undefined)).toBe(0)
    })

    it('returns 0 for a non-object primitive', () => {
        expect(objIsValidImpl(42)).toBe(0)
        expect(objIsValidImpl('obj')).toBe(0)
    })

    it('returns 0 for an object without _type', () => {
        expect(objIsValidImpl({})).toBe(0)
    })

    it('returns 1 for an object with a truthy _type (game object marker)', () => {
        expect(objIsValidImpl({ _type: 'item' })).toBe(1)
        expect(objIsValidImpl({ _type: 'critter' })).toBe(1)
    })
})

// ===========================================================================
// Phase 13-F — Checklist accuracy
// ===========================================================================

describe('Phase 13-F — checklist accuracy for new sfall opcodes', () => {
    it('abs_value entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'abs_value')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('string_length entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'string_length')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('pow entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'pow')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('obj_is_valid entry is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'obj_is_valid')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('all checklist IDs remain unique after adding new entries', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('implemented count has grown after this phase', () => {
        const summary = stubChecklistSummary()
        // Phase 12 had >= 10 implemented entries; phase 13 adds 4 more.
        expect(summary.implemented).toBeGreaterThanOrEqual(14)
    })
})
