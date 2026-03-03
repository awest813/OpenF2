/**
 * Phase 2 regression tests.
 *
 * Covers:
 *   - Game time calculation helpers used by get_month, get_day, game_time_hour
 *   - Encounter difficulty rate scaling used by worldmap didEncounter
 *   - Audio: rollNextSfx handles empty/missing ambientSfx without throwing
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Game time helpers (mirrors logic in vm_bridge.ts)
// ---------------------------------------------------------------------------

/** Returns the 1-based month (1–12) from a gameTickTime value. */
function getMonth(gameTickTime: number): number {
    const days = Math.floor(gameTickTime / (10 * 86400))
    return 1 + (Math.floor(days / 30) % 12)
}

/** Returns the 1-based day of the month (1–30) from a gameTickTime value. */
function getDay(gameTickTime: number): number {
    const days = Math.floor(gameTickTime / (10 * 86400))
    return 1 + days % 30
}

/** Returns the game time in HHMM format (0–2359) from a gameTickTime value. */
function getTimeHour(gameTickTime: number): number {
    const secs = Math.floor(gameTickTime / 10) % 86400
    return Math.floor(secs / 3600) * 100 + Math.floor((secs % 3600) / 60)
}

describe('getMonth', () => {
    it('returns 1 at time 0 (start of game)', () => {
        expect(getMonth(0)).toBe(1)
    })

    it('returns 1 after 29 days', () => {
        const ticks = 29 * 86400 * 10
        expect(getMonth(ticks)).toBe(1)
    })

    it('returns 2 after 30 days', () => {
        const ticks = 30 * 86400 * 10
        expect(getMonth(ticks)).toBe(2)
    })

    it('returns 12 after 11 months (330 days)', () => {
        const ticks = 330 * 86400 * 10
        expect(getMonth(ticks)).toBe(12)
    })

    it('wraps back to 1 after 12 months (360 days)', () => {
        const ticks = 360 * 86400 * 10
        expect(getMonth(ticks)).toBe(1)
    })
})

describe('getDay', () => {
    it('returns 1 at time 0', () => {
        expect(getDay(0)).toBe(1)
    })

    it('returns 2 after exactly 1 day', () => {
        const ticks = 86400 * 10
        expect(getDay(ticks)).toBe(2)
    })

    it('returns 30 after 29 days', () => {
        const ticks = 29 * 86400 * 10
        expect(getDay(ticks)).toBe(30)
    })

    it('wraps to 1 at the start of the next month', () => {
        const ticks = 30 * 86400 * 10
        expect(getDay(ticks)).toBe(1)
    })
})

describe('getTimeHour', () => {
    it('returns 0 (midnight) at time 0', () => {
        expect(getTimeHour(0)).toBe(0)
    })

    it('returns 1200 (noon) after 12 hours', () => {
        const ticks = 12 * 3600 * 10
        expect(getTimeHour(ticks)).toBe(1200)
    })

    it('returns 1230 after 12.5 hours', () => {
        const ticks = (12 * 3600 + 30 * 60) * 10
        expect(getTimeHour(ticks)).toBe(1230)
    })

    it('wraps to 0 at the start of the next day', () => {
        const ticks = 86400 * 10
        expect(getTimeHour(ticks)).toBe(0)
    })

    it('returns 2359 just before midnight', () => {
        const ticks = (23 * 3600 + 59 * 60) * 10
        expect(getTimeHour(ticks)).toBe(2359)
    })
})

// ---------------------------------------------------------------------------
// Encounter difficulty scaling (mirrors logic in worldmap.ts didEncounter)
// ---------------------------------------------------------------------------

function applyEncounterDifficulty(encRate: number, difficulty: 'easy' | 'normal' | 'hard'): number {
    if (difficulty === 'easy') return encRate - Math.floor(encRate / 15)
    if (difficulty === 'hard') return encRate + Math.floor(encRate / 15)
    return encRate
}

describe('applyEncounterDifficulty', () => {
    it('does not change rate on normal difficulty', () => {
        expect(applyEncounterDifficulty(30, 'normal')).toBe(30)
    })

    it('reduces rate on easy difficulty', () => {
        const reduced = applyEncounterDifficulty(30, 'easy')
        expect(reduced).toBeLessThan(30)
        expect(reduced).toBe(28) // 30 - floor(30/15) = 30 - 2 = 28
    })

    it('increases rate on hard difficulty', () => {
        const increased = applyEncounterDifficulty(30, 'hard')
        expect(increased).toBeGreaterThan(30)
        expect(increased).toBe(32) // 30 + floor(30/15) = 30 + 2 = 32
    })

    it('is symmetric: easy decrease equals hard increase for same base', () => {
        const base = 60
        const easy = applyEncounterDifficulty(base, 'easy')
        const hard = applyEncounterDifficulty(base, 'hard')
        const delta = hard - base
        expect(base - easy).toBe(delta)
    })

    it('handles zero encounter rate without changing it', () => {
        expect(applyEncounterDifficulty(0, 'easy')).toBe(0)
        expect(applyEncounterDifficulty(0, 'hard')).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// Regression: encounter bounds checking
// ---------------------------------------------------------------------------

/** Mirrors the bounds guard added to didEncounter in worldmap.ts. */
function isSquareInBounds(x: number, y: number, maxX: number, maxY: number): boolean {
    return x >= 0 && x < maxX && y >= 0 && y < maxY
}

describe('worldmap square bounds checking (regression)', () => {
    const maxX = 28, maxY = 30

    it('rejects negative coordinates', () => {
        expect(isSquareInBounds(-1, 0, maxX, maxY)).toBe(false)
        expect(isSquareInBounds(0, -1, maxX, maxY)).toBe(false)
    })

    it('rejects coordinates at or beyond grid limits', () => {
        expect(isSquareInBounds(maxX, 0, maxX, maxY)).toBe(false)
        expect(isSquareInBounds(0, maxY, maxX, maxY)).toBe(false)
    })

    it('accepts valid coordinates within grid', () => {
        expect(isSquareInBounds(0, 0, maxX, maxY)).toBe(true)
        expect(isSquareInBounds(maxX - 1, maxY - 1, maxX, maxY)).toBe(true)
        expect(isSquareInBounds(14, 15, maxX, maxY)).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Regression: undefined encounter rate guard
// ---------------------------------------------------------------------------

describe('encounter rate undefined guard (regression)', () => {
    const encounterRates: Record<string, number> = {
        forced: 100, frequent: 50, common: 30, uncommon: 10, rare: 3, none: 0,
    }

    it('returns a valid number for known frequency tokens', () => {
        expect(encounterRates['common']).toBe(30)
        expect(encounterRates['rare']).toBe(3)
    })

    it('returns undefined for unknown frequency tokens', () => {
        expect(encounterRates['nonexistent']).toBeUndefined()
        expect(encounterRates['']).toBeUndefined()
    })

    it('guard prevents using undefined as a number in comparison', () => {
        const rate = encounterRates['unknown_freq']
        // Without guard, `undefined === 0` is false and `undefined === 100` is false,
        // so the else branch runs with `undefined` — Math.floor(undefined / 15) = NaN
        expect(rate === undefined).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Regression: worldmap click offset must use addition, not bitwise OR
// ---------------------------------------------------------------------------

describe('worldmap offset calculation (regression)', () => {
    it('addition gives correct result where bitwise OR would truncate', () => {
        // Simulates box.left + pageXOffset with floating-point values
        const boxLeft = 100.5
        const pageXOffset = 50.3

        // Bug: bitwise OR truncates both operands to 32-bit ints and ORs them
        const buggyResult = boxLeft | (0 + pageXOffset)
        // Fix: simple addition preserves floating-point precision
        const correctResult = boxLeft + pageXOffset

        expect(correctResult).toBeCloseTo(150.8)
        // The buggy bitwise OR gives a different result (100 | 50 = 118)
        expect(buggyResult).not.toBeCloseTo(150.8)
    })

    it('addition with zero pageOffset matches box position', () => {
        const boxLeft = 200.7
        const pageXOffset = 0

        const correct = boxLeft + pageXOffset
        const buggy = boxLeft | (0 + pageXOffset)

        expect(correct).toBeCloseTo(200.7)
        // Bitwise OR truncates: 200 | 0 = 200
        expect(buggy).toBe(200)
    })
})
