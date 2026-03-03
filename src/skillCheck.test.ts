/**
 * Regression tests for the skill check system.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    rollSkillCheck,
    rollSkillCheckWithDifficulty,
    SkillCheckDifficulty,
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
