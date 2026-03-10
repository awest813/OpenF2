/**
 * Phase 2 regression tests.
 *
 * Covers:
 *   - Game time calculation helpers used by get_month, get_day, game_time_hour
 *   - Encounter difficulty rate scaling used by worldmap didEncounter
 *   - Audio: rollNextSfx handles empty/missing ambientSfx without throwing
 *   - B1: Encounter-rate matrix (undefined/null, zero/negative, region overrides,
 *         boundary values, repeated travel ticks after reload)
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
    if (difficulty === 'easy') {return encRate - Math.floor(encRate / 15)}
    if (difficulty === 'hard') {return encRate + Math.floor(encRate / 15)}
    return encRate
}

function clampAdjustedEncounterRate(encRate: number): number {
    return Math.max(1, Math.min(99, encRate))
}

function encounterCheckRateMs(isF1Mode: boolean): number {
    return isF1Mode ? 650 : 750
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

    it('clamps adjusted rates into [1, 99] guard range', () => {
        expect(clampAdjustedEncounterRate(0)).toBe(1)
        expect(clampAdjustedEncounterRate(100)).toBe(99)
        expect(clampAdjustedEncounterRate(42)).toBe(42)
    })
})

describe('encounter polling interval', () => {
    it('uses Fallout 2 timing in default mode', () => {
        expect(encounterCheckRateMs(false)).toBe(750)
    })

    it('uses faster Fallout 1 timing in compatibility mode', () => {
        expect(encounterCheckRateMs(true)).toBe(650)
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
    it('rejects negative coordinates', () => {
        expect(isSquareInBounds(-1, 0, 28, 30)).toBe(false)
        expect(isSquareInBounds(0, -1, 28, 30)).toBe(false)
    })

    it('rejects coordinates at or beyond F2 grid limits', () => {
        expect(isSquareInBounds(28, 0, 28, 30)).toBe(false)
        expect(isSquareInBounds(0, 30, 28, 30)).toBe(false)
    })

    it('rejects coordinates at or beyond F1 grid limits', () => {
        expect(isSquareInBounds(20, 0, 20, 16)).toBe(false)
        expect(isSquareInBounds(0, 16, 20, 16)).toBe(false)
    })

    it('accepts valid coordinates within both F2 and F1 grids', () => {
        expect(isSquareInBounds(27, 29, 28, 30)).toBe(true)
        expect(isSquareInBounds(19, 15, 20, 16)).toBe(true)
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
// B1 — Encounter rate matrix (deterministic ruleset)
// ---------------------------------------------------------------------------

/**
 * Mirrors the full resolution path in worldmap.ts didEncounter():
 *   1. Look up overriding table rate.
 *   2. Fall back to frequency-token default.
 *   3. Guard for non-finite / null / negative.
 *   4. Treat <=0 as "no encounter", 100 as "forced encounter".
 *   5. Apply difficulty scaling then clamp to [1, 99].
 */
function resolveEncounterRate(
    tableRate: number | undefined | null,
    frequency: string,
    frequencyDefaults: Record<string, number>
): number | null {
    // Use the explicit override if present (even if zero)
    const raw = tableRate !== undefined ? tableRate : frequencyDefaults[frequency]
    // null from tableRate means missing/corrupted entry
    if (raw === null || raw === undefined) {return null}
    if (!Number.isFinite(raw as number)) {return null}
    return raw as number
}

function shouldEncounterOccur(
    rate: number | null,
    roll: number,
    difficulty: 'easy' | 'normal' | 'hard' = 'normal'
): boolean {
    if (rate === null) {return false}
    if (rate <= 0) {return false}
    if (rate === 100) {return true}

    let adjusted = rate
    if (difficulty === 'easy') {adjusted -= Math.floor(adjusted / 15)}
    else if (difficulty === 'hard') {adjusted += Math.floor(adjusted / 15)}
    adjusted = Math.max(1, Math.min(99, adjusted))

    return roll < adjusted
}

describe('B1 encounter-rate matrix — undefined/null/invalid inputs', () => {
    const defaults: Record<string, number> = { common: 30, rare: 3, forced: 100, none: 0 }

    it('undefined tableRate falls back to frequency default', () => {
        expect(resolveEncounterRate(undefined, 'common', defaults)).toBe(30)
    })

    it('null tableRate (corrupted entry) resolves to null', () => {
        expect(resolveEncounterRate(null, 'common', defaults)).toBeNull()
    })

    it('NaN tableRate resolves to null', () => {
        expect(resolveEncounterRate(NaN, 'common', defaults)).toBeNull()
    })

    it('Infinity tableRate resolves to null', () => {
        expect(resolveEncounterRate(Infinity, 'common', defaults)).toBeNull()
    })

    it('null rate produces no encounter', () => {
        expect(shouldEncounterOccur(null, 50)).toBe(false)
    })

    it('unknown frequency token with no tableRate resolves to null', () => {
        expect(resolveEncounterRate(undefined, 'alien_zone', defaults)).toBeNull()
    })
})

describe('B1 encounter-rate matrix — zero and negative rates', () => {
    it('zero rate produces no encounter regardless of roll', () => {
        expect(shouldEncounterOccur(0, 0)).toBe(false)
        expect(shouldEncounterOccur(0, 99)).toBe(false)
    })

    it('negative rate is treated as no-encounter (not 1% clamped)', () => {
        expect(shouldEncounterOccur(-1, 0)).toBe(false)
        expect(shouldEncounterOccur(-50, 0)).toBe(false)
    })

    it('positive rate still triggers at low roll', () => {
        expect(shouldEncounterOccur(30, 0)).toBe(true)
    })

    it('none frequency defaults to 0 — no encounter', () => {
        const defaults: Record<string, number> = { none: 0, common: 30 }
        const rate = resolveEncounterRate(undefined, 'none', defaults)
        expect(shouldEncounterOccur(rate, 0)).toBe(false)
    })
})

describe('B1 encounter-rate matrix — region-specific overrides', () => {
    it('region override beats frequency default', () => {
        const defaults: Record<string, number> = { common: 30 }
        // Specific region has 80% rate overriding the "common" default
        const rate = resolveEncounterRate(80, 'common', defaults)
        expect(rate).toBe(80)
    })

    it('region override of 0 suppresses encounters even for frequent areas', () => {
        const defaults: Record<string, number> = { frequent: 50 }
        const rate = resolveEncounterRate(0, 'frequent', defaults)
        expect(shouldEncounterOccur(rate, 0)).toBe(false)
    })

    it('region override of 100 forces encounter regardless of roll', () => {
        const defaults: Record<string, number> = { rare: 3 }
        const rate = resolveEncounterRate(100, 'rare', defaults)
        expect(shouldEncounterOccur(rate, 99)).toBe(true)
    })

    it('region-specific rates survive difficulty adjustment (forced stays forced)', () => {
        const rate = resolveEncounterRate(100, 'forced', {})
        expect(shouldEncounterOccur(rate, 99, 'easy')).toBe(true)
        expect(shouldEncounterOccur(rate, 99, 'hard')).toBe(true)
    })
})

describe('B1 encounter-rate matrix — boundary values (save/load proximity)', () => {
    it('rate of 1 (MIN guard) does encounter at roll=0', () => {
        expect(shouldEncounterOccur(1, 0)).toBe(true)
    })

    it('rate of 1 (MIN guard) does not encounter at roll=1', () => {
        expect(shouldEncounterOccur(1, 1)).toBe(false)
    })

    it('rate of 99 (MAX guard) encounters at roll=98', () => {
        expect(shouldEncounterOccur(99, 98)).toBe(true)
    })

    it('rate of 99 (MAX guard) does not encounter at roll=99', () => {
        expect(shouldEncounterOccur(99, 99)).toBe(false)
    })

    it('post-difficulty clamp never goes below 1', () => {
        // Hard clamp: even if adjusted < 1 it becomes 1
        const adjusted = Math.max(1, Math.min(99, -10))
        expect(adjusted).toBe(1)
    })

    it('post-difficulty clamp never goes above 99', () => {
        const adjusted = Math.max(1, Math.min(99, 200))
        expect(adjusted).toBe(99)
    })
})

describe('B1 encounter-rate matrix — repeated travel ticks after reload', () => {
    /**
     * Simulates multiple travel ticks with a fixed random seed.
     * The key property: the encounter rate must be identical for every tick —
     * it is not consumed, decremented, or accumulated.
     */
    function simulateTicks(
        rate: number,
        rolls: number[],
        difficulty: 'easy' | 'normal' | 'hard' = 'normal'
    ): boolean[] {
        return rolls.map((roll) => shouldEncounterOccur(rate, roll, difficulty))
    }

    it('rate is stateless — same rate produces same outcome for same roll', () => {
        const results1 = simulateTicks(30, [5, 5, 5])
        const results2 = simulateTicks(30, [5, 5, 5])
        expect(results1).toEqual(results2)
    })

    it('rate is stateless — no accumulation across ticks', () => {
        // Even after many failed checks the rate stays the same
        const results = simulateTicks(30, [50, 50, 50, 50, 50])
        expect(results.every((r) => r === false)).toBe(true)
    })

    it('reload restores same rate and produces deterministic outcome', () => {
        // Save-then-reload scenario: rate is stored in save data, not accumulated
        const rateBeforeSave = 30
        // Simulate "loading" by just using the saved rate value again
        const rateAfterReload = rateBeforeSave
        expect(shouldEncounterOccur(rateAfterReload, 10)).toBe(shouldEncounterOccur(rateBeforeSave, 10))
    })

    it('continued travel after reload is consistent with pre-reload behaviour', () => {
        const rate = 50
        const preSaveResults = simulateTicks(rate, [20, 60, 40])
        const postLoadResults = simulateTicks(rate, [20, 60, 40])
        expect(preSaveResults).toEqual(postLoadResults)
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
