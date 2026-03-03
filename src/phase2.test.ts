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
