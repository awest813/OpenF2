/**
 * Regression tests for the skill check system.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    rollSkillCheck,
    rollSkillCheckWithDifficulty,
    SkillCheckDifficulty,
    RollResult,
    toRollResult,
    rollResultIsSuccess,
    rollResultIsCritical,
} from './skillCheck.js'

afterEach(() => {
    vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// rollSkillCheck
// ---------------------------------------------------------------------------

describe('rollSkillCheck', () => {
    it('returns success when roll is within threshold', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)  // roll = 1
        expect(rollSkillCheck(50).success).toBe(true)
    })

    it('returns failure when roll exceeds threshold', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99)  // roll = 100
        expect(rollSkillCheck(50).success).toBe(false)
    })

    it('succeeds when roll exactly equals threshold', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.49)  // roll = floor(0.49*100)+1 = 50
        expect(rollSkillCheck(50).success).toBe(true)
    })

    it('clamps threshold to minimum 5', () => {
        const result = rollSkillCheck(0, -100)
        expect(result.threshold).toBe(5)
    })

    it('clamps threshold to maximum 95', () => {
        const result = rollSkillCheck(300, 100)
        expect(result.threshold).toBe(95)
    })

    it('applies positive modifier to skill value', () => {
        const result = rollSkillCheck(50, 20)
        expect(result.threshold).toBe(70)
    })

    it('applies negative modifier to skill value', () => {
        const result = rollSkillCheck(50, -20)
        expect(result.threshold).toBe(30)
    })

    it('returns roll in range 1–100', () => {
        for (let i = 0; i < 20; i++) {
            const { roll } = rollSkillCheck(50)
            expect(roll).toBeGreaterThanOrEqual(1)
            expect(roll).toBeLessThanOrEqual(100)
        }
    })

    it('reports the roll value that was used', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.39)  // roll = 40
        const result = rollSkillCheck(50)
        expect(result.roll).toBe(40)
    })

    it('reports the clamped threshold', () => {
        const result = rollSkillCheck(60)
        expect(result.threshold).toBe(60)
    })
})

// ---------------------------------------------------------------------------
// rollSkillCheckWithDifficulty
// ---------------------------------------------------------------------------

describe('rollSkillCheckWithDifficulty', () => {
    it('VeryEasy adds +40 to skill', () => {
        const result = rollSkillCheckWithDifficulty(50, 'VeryEasy')
        expect(result.threshold).toBe(90)
    })

    it('Easy adds +20 to skill', () => {
        const result = rollSkillCheckWithDifficulty(50, 'Easy')
        expect(result.threshold).toBe(70)
    })

    it('Normal adds 0 modifier', () => {
        const result = rollSkillCheckWithDifficulty(50, 'Normal')
        expect(result.threshold).toBe(50)
    })

    it('Hard subtracts 20 from skill', () => {
        const result = rollSkillCheckWithDifficulty(50, 'Hard')
        expect(result.threshold).toBe(30)
    })

    it('VeryHard subtracts 40 from skill', () => {
        const result = rollSkillCheckWithDifficulty(50, 'VeryHard')
        expect(result.threshold).toBe(10)
    })

    it('extraModifier stacks with difficulty modifier', () => {
        const result = rollSkillCheckWithDifficulty(50, 'Normal', 10)
        expect(result.threshold).toBe(60)
    })

    it('extraModifier can be negative', () => {
        const result = rollSkillCheckWithDifficulty(50, 'Easy', -10)
        expect(result.threshold).toBe(60)
    })

    it('SkillCheckDifficulty constants match expected values', () => {
        expect(SkillCheckDifficulty.VeryEasy).toBe(40)
        expect(SkillCheckDifficulty.Easy).toBe(20)
        expect(SkillCheckDifficulty.Normal).toBe(0)
        expect(SkillCheckDifficulty.Hard).toBe(-20)
        expect(SkillCheckDifficulty.VeryHard).toBe(-40)
    })
})

// ---------------------------------------------------------------------------
// RollResult constants
// ---------------------------------------------------------------------------

describe('RollResult constants', () => {
    it('CRITICAL_FAILURE is 0', () => { expect(RollResult.CRITICAL_FAILURE).toBe(0) })
    it('FAILURE is 1',          () => { expect(RollResult.FAILURE).toBe(1) })
    it('SUCCESS is 2',          () => { expect(RollResult.SUCCESS).toBe(2) })
    it('CRITICAL_SUCCESS is 3', () => { expect(RollResult.CRITICAL_SUCCESS).toBe(3) })
})

// ---------------------------------------------------------------------------
// toRollResult
// ---------------------------------------------------------------------------

describe('toRollResult', () => {
    it('returns SUCCESS when roll succeeds but is not a critical', () => {
        // threshold=50, roll=25 (> 5, so not critical); success
        const result = toRollResult({ success: true, roll: 25, threshold: 50 })
        expect(result).toBe(RollResult.SUCCESS)
    })

    it('returns CRITICAL_SUCCESS when roll is within 10% of threshold', () => {
        // threshold=50 → critThreshold=5; roll=5
        const result = toRollResult({ success: true, roll: 5, threshold: 50 })
        expect(result).toBe(RollResult.CRITICAL_SUCCESS)
    })

    it('returns CRITICAL_SUCCESS when roll equals 1 (minimum critical threshold)', () => {
        // Even very low threshold (5) → critThreshold=1; roll=1
        const result = toRollResult({ success: true, roll: 1, threshold: 5 })
        expect(result).toBe(RollResult.CRITICAL_SUCCESS)
    })

    it('returns FAILURE when roll fails and is below 96', () => {
        const result = toRollResult({ success: false, roll: 80, threshold: 50 })
        expect(result).toBe(RollResult.FAILURE)
    })

    it('returns CRITICAL_FAILURE when roll is 96 or higher on a failure', () => {
        const result = toRollResult({ success: false, roll: 96, threshold: 50 })
        expect(result).toBe(RollResult.CRITICAL_FAILURE)
    })

    it('returns CRITICAL_FAILURE on roll of 100', () => {
        const result = toRollResult({ success: false, roll: 100, threshold: 50 })
        expect(result).toBe(RollResult.CRITICAL_FAILURE)
    })
})

// ---------------------------------------------------------------------------
// rollResultIsSuccess
// ---------------------------------------------------------------------------

describe('rollResultIsSuccess', () => {
    it('returns true for SUCCESS', () => {
        expect(rollResultIsSuccess(RollResult.SUCCESS)).toBe(true)
    })

    it('returns true for CRITICAL_SUCCESS', () => {
        expect(rollResultIsSuccess(RollResult.CRITICAL_SUCCESS)).toBe(true)
    })

    it('returns false for FAILURE', () => {
        expect(rollResultIsSuccess(RollResult.FAILURE)).toBe(false)
    })

    it('returns false for CRITICAL_FAILURE', () => {
        expect(rollResultIsSuccess(RollResult.CRITICAL_FAILURE)).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// rollResultIsCritical
// ---------------------------------------------------------------------------

describe('rollResultIsCritical', () => {
    it('returns true for CRITICAL_SUCCESS', () => {
        expect(rollResultIsCritical(RollResult.CRITICAL_SUCCESS)).toBe(true)
    })

    it('returns true for CRITICAL_FAILURE', () => {
        expect(rollResultIsCritical(RollResult.CRITICAL_FAILURE)).toBe(true)
    })

    it('returns false for SUCCESS', () => {
        expect(rollResultIsCritical(RollResult.SUCCESS)).toBe(false)
    })

    it('returns false for FAILURE', () => {
        expect(rollResultIsCritical(RollResult.FAILURE)).toBe(false)
    })
})
