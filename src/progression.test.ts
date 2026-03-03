/**
 * Tests for the XP-to-level progression formula used by give_exp_points.
 *
 * Fallout 2 level thresholds: level N requires N*(N-1)/2 * 1000 XP.
 *   Level 2:  1000 XP
 *   Level 3:  3000 XP
 *   Level 4:  6000 XP
 *   Level 5: 10000 XP
 */

import { describe, it, expect } from 'vitest'

/**
 * Returns the XP required to reach `level` (from 0 XP).
 * Mirrors the formula used in give_exp_points in scripting.ts.
 */
function xpRequiredForLevel(level: number): number {
    // Level 1 needs 0 XP; level N needs N*(N-1)/2 * 1000
    if (level <= 1) return 0
    return (level * (level - 1) / 2) * 1000
}

/**
 * Simulate give_exp_points: returns new { xp, level } after awarding `amount` XP.
 * Mirrors the loop in scripting.ts give_exp_points.
 */
function awardXp(startXp: number, startLevel: number, amount: number): { xp: number; level: number } {
    let xp = startXp + amount
    let level = startLevel
    while (xp >= xpRequiredForLevel(level + 1)) {
        level++
    }
    return { xp, level }
}

describe('xpRequiredForLevel', () => {
    it('level 1 requires 0 XP', () => {
        expect(xpRequiredForLevel(1)).toBe(0)
    })

    it('level 2 requires 1000 XP', () => {
        expect(xpRequiredForLevel(2)).toBe(1000)
    })

    it('level 3 requires 3000 XP', () => {
        expect(xpRequiredForLevel(3)).toBe(3000)
    })

    it('level 4 requires 6000 XP', () => {
        expect(xpRequiredForLevel(4)).toBe(6000)
    })

    it('level 5 requires 10000 XP', () => {
        expect(xpRequiredForLevel(5)).toBe(10000)
    })
})

describe('awardXp (give_exp_points simulation)', () => {
    it('does not level up below threshold', () => {
        const result = awardXp(0, 1, 500)
        expect(result.level).toBe(1)
        expect(result.xp).toBe(500)
    })

    it('levels up to 2 when XP reaches 1000', () => {
        const result = awardXp(0, 1, 1000)
        expect(result.level).toBe(2)
        expect(result.xp).toBe(1000)
    })

    it('levels up to 2 when XP passes 1000', () => {
        const result = awardXp(900, 1, 200)
        expect(result.level).toBe(2)
        expect(result.xp).toBe(1100)
    })

    it('levels up multiple levels in one award', () => {
        const result = awardXp(0, 1, 6000)
        expect(result.level).toBe(4)
        expect(result.xp).toBe(6000)
    })

    it('does not level up again immediately after a level-up', () => {
        const result = awardXp(0, 1, 1001)
        expect(result.level).toBe(2)
        expect(result.xp).toBe(1001)
    })

    it('retains XP accumulation across multiple award calls', () => {
        let state = { xp: 0, level: 1 }
        state = awardXp(state.xp, state.level, 500)
        state = awardXp(state.xp, state.level, 600)
        expect(state.level).toBe(2)
        expect(state.xp).toBe(1100)
    })
})
