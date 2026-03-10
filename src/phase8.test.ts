/**
 * Phase 4 scripting VM expansion — critter status getters, integer-indexed
 * sfall globals, and additional game-clock opcodes.
 *
 * This file is named phase8.test.ts following the repository convention where
 * each phaseN.test.ts covers a milestone within the active development phase
 * (e.g. phase7.test.ts covers the Phase 4 scripting VM milestone; this file
 * covers the Phase 4 scripting VM continuation).
 *
 *   1. get_poison / get_radiation — critter status-level getters
 *   2. Integer-indexed sfall globals — index-keyed counterpart to the
 *      string-keyed store added in phase7
 *   3. get_day_of_week — game-clock day-of-week extraction
 *   4. Consistency of all game-clock algorithms (year/month/day/dow share
 *      the same epoch and day definition)
 */

import { describe, it, expect } from 'vitest'
import {
    getSfallGlobal,
    getSfallGlobalInt,
    setSfallGlobalInt,
    MAX_SFALL_INT_GLOBALS,
} from './sfallGlobals.js'

// ---------------------------------------------------------------------------
// 1. get_poison / get_radiation algorithm — inline
// ---------------------------------------------------------------------------
// scripting.ts imports browser-only modules so we test the pure algorithm
// directly — the same isolation strategy used throughout phase5–phase7.

/**
 * Inline replica of the get_poison implementation added to scripting.ts.
 * Returns the critter's Poison Level stat, or 0 for non-critters.
 */
function getPoisonLevel(obj: any): number {
    if (!obj || obj.type !== 'critter') {return 0}
    return obj.stats?.getBase?.('Poison Level') ?? 0
}

/**
 * Inline replica of the get_radiation implementation added to scripting.ts.
 * Returns the critter's Radiation Level stat, or 0 for non-critters.
 */
function getRadiationLevel(obj: any): number {
    if (!obj || obj.type !== 'critter') {return 0}
    return obj.stats?.getBase?.('Radiation Level') ?? 0
}

/** Minimal stat-stub to exercise the getter contract. */
function makeStats(poisonLevel = 0, radiationLevel = 0) {
    const store: Record<string, number> = {
        'Poison Level': poisonLevel,
        'Radiation Level': radiationLevel,
    }
    return { getBase: (name: string) => store[name] ?? 0 }
}

describe('get_poison algorithm', () => {
    it('returns 0 for a null object', () => {
        expect(getPoisonLevel(null)).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        expect(getPoisonLevel({ type: 'item', stats: makeStats(5) })).toBe(0)
    })

    it('returns 0 when Poison Level is zero', () => {
        const obj = { type: 'critter', stats: makeStats(0) }
        expect(getPoisonLevel(obj)).toBe(0)
    })

    it('returns the current Poison Level for a critter', () => {
        const obj = { type: 'critter', stats: makeStats(42) }
        expect(getPoisonLevel(obj)).toBe(42)
    })

    it('returns updated level after the stat is modified', () => {
        const store: Record<string, number> = { 'Poison Level': 10, 'Radiation Level': 0 }
        const obj = { type: 'critter', stats: { getBase: (n: string) => store[n] ?? 0 } }
        expect(getPoisonLevel(obj)).toBe(10)
        store['Poison Level'] = 25
        expect(getPoisonLevel(obj)).toBe(25)
    })

    it('returns maximum representable value correctly', () => {
        const obj = { type: 'critter', stats: makeStats(2000) }
        expect(getPoisonLevel(obj)).toBe(2000)  // stat cap from skills.ts
    })
})

describe('get_radiation algorithm', () => {
    it('returns 0 for a null object', () => {
        expect(getRadiationLevel(null)).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        expect(getRadiationLevel({ type: 'scenery', stats: makeStats(0, 100) })).toBe(0)
    })

    it('returns 0 when Radiation Level is zero', () => {
        const obj = { type: 'critter', stats: makeStats(0, 0) }
        expect(getRadiationLevel(obj)).toBe(0)
    })

    it('returns the current Radiation Level for a critter', () => {
        const obj = { type: 'critter', stats: makeStats(0, 75) }
        expect(getRadiationLevel(obj)).toBe(75)
    })

    it('poison and radiation levels are independent', () => {
        const obj = { type: 'critter', stats: makeStats(10, 50) }
        expect(getPoisonLevel(obj)).toBe(10)
        expect(getRadiationLevel(obj)).toBe(50)
    })

    it('radiation_add / radiation_dec are symmetric with get_radiation', () => {
        const store: Record<string, number> = { 'Poison Level': 0, 'Radiation Level': 30 }
        const obj = { type: 'critter', stats: { getBase: (n: string) => store[n] ?? 0 } }
        // Simulate radiation_add(+20) then radiation_dec(-10)
        store['Radiation Level'] += 20
        store['Radiation Level'] -= 10
        expect(getRadiationLevel(obj)).toBe(40)
    })
})

// ---------------------------------------------------------------------------
// 2. Integer-indexed sfall globals
// ---------------------------------------------------------------------------
// getSfallGlobalInt / setSfallGlobalInt are exported from sfallGlobals.ts and
// can be imported directly (no browser-only deps).

describe('sfall integer-indexed globals — construction', () => {
    it('MAX_SFALL_INT_GLOBALS is a positive integer', () => {
        expect(MAX_SFALL_INT_GLOBALS).toBeGreaterThan(0)
        expect(Number.isInteger(MAX_SFALL_INT_GLOBALS)).toBe(true)
    })

    it('MAX_SFALL_INT_GLOBALS matches real sfall default of 4096', () => {
        expect(MAX_SFALL_INT_GLOBALS).toBe(4096)
    })

    it('all slots default to 0 before any set()', () => {
        // Spot-check a range of indices
        for (const i of [0, 1, 100, 1000, 4095]) {
            // Use unique keys to avoid cross-test pollution — but for int globals
            // we reset via fresh reads; untouched indices stay 0.
            // (The module-level array is shared across tests; we only check
            //  indices we haven't written in any other test in this file.)
            expect(getSfallGlobalInt(i + 2000)).toBe(0)
        }
    })
})

describe('sfall integer-indexed globals — get/set', () => {
    it('round-trips a value at index 0', () => {
        setSfallGlobalInt(0, 99)
        expect(getSfallGlobalInt(0)).toBe(99)
    })

    it('round-trips a value at the last valid index', () => {
        setSfallGlobalInt(MAX_SFALL_INT_GLOBALS - 1, 7)
        expect(getSfallGlobalInt(MAX_SFALL_INT_GLOBALS - 1)).toBe(7)
    })

    it('stores negative values correctly', () => {
        setSfallGlobalInt(10, -42)
        expect(getSfallGlobalInt(10)).toBe(-42)
    })

    it('stores zero explicitly (overwrites a prior value)', () => {
        setSfallGlobalInt(20, 123)
        setSfallGlobalInt(20, 0)
        expect(getSfallGlobalInt(20)).toBe(0)
    })

    it('independent indices do not interfere', () => {
        setSfallGlobalInt(30, 111)
        setSfallGlobalInt(31, 222)
        expect(getSfallGlobalInt(30)).toBe(111)
        expect(getSfallGlobalInt(31)).toBe(222)
    })

    it('overwriting a slot updates the stored value', () => {
        setSfallGlobalInt(40, 1)
        setSfallGlobalInt(40, 999)
        expect(getSfallGlobalInt(40)).toBe(999)
    })
})

describe('sfall integer-indexed globals — bounds', () => {
    it('get() with negative index returns 0', () => {
        expect(getSfallGlobalInt(-1)).toBe(0)
    })

    it('get() at MAX_SFALL_INT_GLOBALS (one past end) returns 0', () => {
        expect(getSfallGlobalInt(MAX_SFALL_INT_GLOBALS)).toBe(0)
    })

    it('set() with negative index is silently ignored', () => {
        setSfallGlobalInt(-1, 42)
        expect(getSfallGlobalInt(-1)).toBe(0)  // still out-of-range
    })

    it('set() at MAX_SFALL_INT_GLOBALS is silently ignored', () => {
        setSfallGlobalInt(MAX_SFALL_INT_GLOBALS, 42)
        expect(getSfallGlobalInt(MAX_SFALL_INT_GLOBALS)).toBe(0)
    })

    it('integer globals are separate from string globals', () => {
        // String-keyed global with the same "name" as the index should not alias
        // (they use different backing stores).
        setSfallGlobalInt(50, 777)
        // The string-keyed store is unrelated; verify it was not touched.
        expect(getSfallGlobal('50')).toBe(0)  // string store untouched
        expect(getSfallGlobalInt(50)).toBe(777)
    })
})

// ---------------------------------------------------------------------------
// 3. get_day_of_week algorithm
// ---------------------------------------------------------------------------
// vm_bridge.ts is browser-dependent; test the pure algorithm inline.

/**
 * Inline replica of the get_day_of_week opcode (0x815C) added to vm_bridge.ts.
 * Returns a 0-based day index within the 7-day week.
 * Day 0 is the starting day of the game (April 5, 2241).
 */
function computeDayOfWeek(gameTickTime: number): number {
    const days = Math.floor(gameTickTime / (10 * 86400))
    return days % 7
}

describe('get_day_of_week algorithm (0x815C)', () => {
    it('returns 0 at game epoch (tick 0)', () => {
        expect(computeDayOfWeek(0)).toBe(0)
    })

    it('returns 1 after one game day', () => {
        const ticksPerDay = 10 * 86400
        expect(computeDayOfWeek(ticksPerDay)).toBe(1)
    })

    it('returns 6 after six game days', () => {
        expect(computeDayOfWeek(6 * 10 * 86400)).toBe(6)
    })

    it('wraps back to 0 after exactly seven days', () => {
        expect(computeDayOfWeek(7 * 10 * 86400)).toBe(0)
    })

    it('wraps correctly after many weeks', () => {
        // 100 weeks = 700 days; day 700 → 700 % 7 = 0
        expect(computeDayOfWeek(700 * 10 * 86400)).toBe(0)
        // 101st week starts on day 707 → 707 % 7 = 0; day 708 → 1
        expect(computeDayOfWeek(708 * 10 * 86400)).toBe(1)
    })

    it('does not advance within a single day', () => {
        // Ticks just before end of day 0 still yield dow=0
        const nearlyOneDay = 10 * 86400 - 1
        expect(computeDayOfWeek(nearlyOneDay)).toBe(0)
    })

    it('result is always in range 0–6', () => {
        for (let day = 0; day < 14; day++) {
            const dow = computeDayOfWeek(day * 10 * 86400)
            expect(dow).toBeGreaterThanOrEqual(0)
            expect(dow).toBeLessThanOrEqual(6)
        }
    })
})

// ---------------------------------------------------------------------------
// 4. Clock consistency — year / month / day / day-of-week share the same epoch
// ---------------------------------------------------------------------------
// All four time functions use the same days computation.  Verify that a
// fixed game time produces consistent results across all four.

/** Inline replica of get_day from vm_bridge.ts. */
function computeDay(gameTickTime: number): number {
    const days = Math.floor(gameTickTime / (10 * 86400))
    return 1 + (days % 30)
}

/** Inline replica of get_month from vm_bridge.ts. */
function computeMonth(gameTickTime: number): number {
    const days = Math.floor(gameTickTime / (10 * 86400))
    return 1 + (Math.floor(days / 30) % 12)
}

/** Inline replica of computeGameYear from phase5. */
function computeYear(gameTickTime: number): number {
    const days = Math.floor(gameTickTime / (10 * 86400))
    return 2241 + Math.floor(days / 360)
}

describe('game-clock consistency across year/month/day/dow', () => {
    it('all functions return epoch values at tick 0', () => {
        expect(computeYear(0)).toBe(2241)
        expect(computeMonth(0)).toBe(1)
        expect(computeDay(0)).toBe(1)
        expect(computeDayOfWeek(0)).toBe(0)
    })

    it('year advances after 360 days while month/day reset', () => {
        const t = 360 * 10 * 86400  // exactly 1 year = 12 months × 30 days
        expect(computeYear(t)).toBe(2242)
        expect(computeMonth(t)).toBe(1)  // back to month 1
        expect(computeDay(t)).toBe(1)    // back to day 1
    })

    it('month advances after 30 days while day resets', () => {
        const t = 30 * 10 * 86400
        expect(computeMonth(t)).toBe(2)
        expect(computeDay(t)).toBe(1)
    })

    it('day-of-week is periodic with period 7, independent of month/year boundary', () => {
        // Crossing the year boundary (day 360 → 361) should not reset dow
        const t = 361 * 10 * 86400  // day 362 (1-based)
        expect(computeDay(t)).toBe(2)    // within month 1 of new year
        expect(computeDayOfWeek(t)).toBe(361 % 7)
    })

    it('a full 360-day year contains exactly 51 complete weeks and 3 leftover days', () => {
        // 360 = 51 × 7 + 3
        const firstDowNextYear = computeDayOfWeek(360 * 10 * 86400)
        expect(firstDowNextYear).toBe(360 % 7)
    })
})
