/**
 * Phase 28 regression tests.
 *
 * Focus: world-map reliability helpers (saved-position restore + bounds clamp)
 * that guard travel continuity across save/load.
 */

import { describe, it, expect } from 'vitest'
import { Worldmap } from './worldmap.js'
import { worldGridConfig } from './compat/fallout1.js'

describe('Phase 28-A — world-map saved-position normalization', () => {
    it('uses fallback position when no saved world position exists', () => {
        const fallback = { x: 123, y: 456 }
        const resolved = Worldmap.normalizeWorldPositionForWorldmap(undefined, fallback)
        expect(resolved).toEqual(fallback)
    })

    it('uses saved position when present and in bounds', () => {
        const saved = { x: 321, y: 654 }
        const fallback = { x: 0, y: 0 }
        const resolved = Worldmap.normalizeWorldPositionForWorldmap(saved, fallback)
        expect(resolved).toEqual(saved)
    })

    it('clamps out-of-bounds saved position to world grid limits', () => {
        const grid = worldGridConfig()
        const maxX = grid.columns * grid.cellSize - 1
        const maxY = grid.rows * grid.cellSize - 1

        const saved = { x: maxX + 5000, y: maxY + 5000 }
        const resolved = Worldmap.normalizeWorldPositionForWorldmap(saved, { x: 0, y: 0 })
        expect(resolved).toEqual({ x: maxX, y: maxY })
    })

    it('falls back when saved position is invalid (NaN/Infinity)', () => {
        const fallback = { x: 77, y: 88 }
        const resolved = Worldmap.normalizeWorldPositionForWorldmap({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, fallback)
        expect(resolved).toEqual(fallback)
    })
})
