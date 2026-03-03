/**
 * Tests for geometry utility functions (Phase 4 — pathfinding/LOS improvements).
 *
 * Covers:
 *   - hexDistance: basic correctness
 *   - hexLine: cube-coordinate lerp produces straight, correct-length paths
 *   - hexesInRadius: ring algorithm returns correct counts and stays in bounds
 */

import { describe, it, expect } from 'vitest'
import { hexDistance, hexLine, hexesInRadius, HEX_GRID_SIZE } from './geometry.js'

// ---------------------------------------------------------------------------
// hexDistance
// ---------------------------------------------------------------------------

describe('hexDistance', () => {
    it('distance from a hex to itself is 0', () => {
        expect(hexDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0)
    })

    it('adjacent hex has distance 1', () => {
        // Column 4 is even: one neighbor is (5, 5)
        expect(hexDistance({ x: 4, y: 5 }, { x: 5, y: 5 })).toBe(1)
    })

    it('distance is symmetric', () => {
        const a = { x: 10, y: 20 }
        const b = { x: 15, y: 18 }
        expect(hexDistance(a, b)).toBe(hexDistance(b, a))
    })

    it('distance satisfies triangle inequality', () => {
        const a = { x: 10, y: 10 }
        const b = { x: 14, y: 12 }
        const c = { x: 18, y: 10 }
        expect(hexDistance(a, c)).toBeLessThanOrEqual(hexDistance(a, b) + hexDistance(b, c))
    })
})

// ---------------------------------------------------------------------------
// hexLine (cube-coordinate lerp)
// ---------------------------------------------------------------------------

describe('hexLine', () => {
    it('line from a hex to itself returns just that hex', () => {
        const result = hexLine({ x: 5, y: 5 }, { x: 5, y: 5 })
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({ x: 5, y: 5 })
    })

    it('line between adjacent hexes returns exactly 2 points', () => {
        const a = { x: 4, y: 5 }
        const b = { x: 5, y: 5 }
        const result = hexLine(a, b)
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual(a)
        expect(result[1]).toEqual(b)
    })

    it('first point is always a and last point is always b', () => {
        const a = { x: 10, y: 10 }
        const b = { x: 18, y: 12 }
        const result = hexLine(a, b)
        expect(result[0]).toEqual(a)
        expect(result[result.length - 1]).toEqual(b)
    })

    it('line length equals hexDistance(a,b)+1', () => {
        const a = { x: 10, y: 10 }
        const b = { x: 18, y: 14 }
        const d = hexDistance(a, b)
        const result = hexLine(a, b)
        expect(result).toHaveLength(d + 1)
    })

    it('every consecutive pair in the line is adjacent (distance 1)', () => {
        const a = { x: 10, y: 10 }
        const b = { x: 20, y: 15 }
        const result = hexLine(a, b)
        for (let i = 0; i < result.length - 1; i++) {
            expect(hexDistance(result[i], result[i + 1])).toBe(1)
        }
    })

    it('line is correct for a long horizontal path', () => {
        // Even columns only — moving in the x direction
        const a = { x: 0, y: 50 }
        const b = { x: 10, y: 50 }
        const result = hexLine(a, b)
        expect(result).toHaveLength(hexDistance(a, b) + 1)
        expect(result[0]).toEqual(a)
        expect(result[result.length - 1]).toEqual(b)
        for (let i = 0; i < result.length - 1; i++) {
            expect(hexDistance(result[i], result[i + 1])).toBe(1)
        }
    })

    it('line in reverse direction has same length', () => {
        const a = { x: 10, y: 10 }
        const b = { x: 18, y: 14 }
        expect(hexLine(a, b)).toHaveLength(hexLine(b, a).length)
    })
})

// ---------------------------------------------------------------------------
// hexesInRadius (ring algorithm)
// ---------------------------------------------------------------------------

describe('hexesInRadius', () => {
    it('radius 0 returns empty array (center excluded)', () => {
        expect(hexesInRadius({ x: 100, y: 100 }, 0)).toHaveLength(0)
    })

    it('radius 1 around a center hex returns 6 neighbors', () => {
        const result = hexesInRadius({ x: 100, y: 100 }, 1)
        expect(result).toHaveLength(6)
    })

    it('radius 2 returns 18 hexes (6 + 12)', () => {
        const result = hexesInRadius({ x: 100, y: 100 }, 2)
        expect(result).toHaveLength(18)
    })

    it('radius 3 returns 36 hexes (6 + 12 + 18)', () => {
        const result = hexesInRadius({ x: 100, y: 100 }, 3)
        expect(result).toHaveLength(36)
    })

    it('all returned hexes are within the specified radius', () => {
        const center = { x: 50, y: 50 }
        const radius = 4
        const result = hexesInRadius(center, radius)
        for (const hex of result) {
            expect(hexDistance(center, hex)).toBeLessThanOrEqual(radius)
        }
    })

    it('all returned hexes are within grid bounds', () => {
        // Test near grid edges where clipping should occur
        const center = { x: 1, y: 1 }
        const result = hexesInRadius(center, 5)
        for (const hex of result) {
            expect(hex.x).toBeGreaterThanOrEqual(0)
            expect(hex.x).toBeLessThan(HEX_GRID_SIZE)
            expect(hex.y).toBeGreaterThanOrEqual(0)
            expect(hex.y).toBeLessThan(HEX_GRID_SIZE)
        }
    })

    it('center hex is never included in the result', () => {
        const center = { x: 50, y: 50 }
        const result = hexesInRadius(center, 3)
        for (const hex of result) {
            expect(hex).not.toEqual(center)
        }
    })

    it('no duplicate hexes are returned', () => {
        const center = { x: 80, y: 80 }
        const result = hexesInRadius(center, 4)
        const seen = new Set<string>()
        for (const hex of result) {
            const key = `${hex.x},${hex.y}`
            expect(seen.has(key)).toBe(false)
            seen.add(key)
        }
    })

    it('radius 1 hexes all have distance exactly 1 from center', () => {
        const center = { x: 100, y: 100 }
        const result = hexesInRadius(center, 1)
        for (const hex of result) {
            expect(hexDistance(center, hex)).toBe(1)
        }
    })
})
