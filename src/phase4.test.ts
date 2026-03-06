/**
 * Phase 4 scaffolding tests + Phase 3 completion regression tests.
 *
 * Covers:
 *   - Fallout 1 world-map grid configuration (worldGridConfig)
 *   - F1 vs F2 encounter rate tables (encounterRateForFrequency)
 *   - F1 cinematic sequence factories (buildF1CinematicSequence)
 *   - Phase 4: ModRegistry — registration, priority, override resolution
 */

import { describe, it, expect, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Phase 3: Fallout 1 world-map grid configuration
// ---------------------------------------------------------------------------

import {
    setEngineVersion,
    worldGridConfig,
    encounterRateForFrequency,
    buildF1CinematicSequence,
} from './compat/fallout1.js'
import { EngineVersion } from './engineVersion.js'

describe('worldGridConfig', () => {
    afterEach(() => setEngineVersion(EngineVersion.FALLOUT2))

    it('returns F2 grid (28×30, 51 px) when engine is F2', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        const cfg = worldGridConfig()
        expect(cfg.columns).toBe(28)
        expect(cfg.rows).toBe(30)
        expect(cfg.cellSize).toBe(51)
    })

    it('returns F1 grid (20×16, 50 px) when engine is F1', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        const cfg = worldGridConfig()
        expect(cfg.columns).toBe(20)
        expect(cfg.rows).toBe(16)
        expect(cfg.cellSize).toBe(50)
    })

    it('F1 grid has fewer cells than F2 grid', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        const f1 = worldGridConfig()
        setEngineVersion(EngineVersion.FALLOUT2)
        const f2 = worldGridConfig()
        expect(f1.columns * f1.rows).toBeLessThan(f2.columns * f2.rows)
    })
})

// ---------------------------------------------------------------------------
// Phase 3: encounter rate table (F1 vs F2)
// ---------------------------------------------------------------------------

describe('encounterRateForFrequency — F2 mode', () => {
    afterEach(() => setEngineVersion(EngineVersion.FALLOUT2))

    it('forced → 100', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(encounterRateForFrequency('forced')).toBe(100)
    })

    it('frequent → 50', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(encounterRateForFrequency('frequent')).toBe(50)
    })

    it('common → 30', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(encounterRateForFrequency('common')).toBe(30)
    })

    it('uncommon → 10', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(encounterRateForFrequency('uncommon')).toBe(10)
    })

    it('rare → 3', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(encounterRateForFrequency('rare')).toBe(3)
    })

    it('unknown token → 0', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(encounterRateForFrequency('none')).toBe(0)
        expect(encounterRateForFrequency('')).toBe(0)
    })
})

describe('encounterRateForFrequency — F1 mode', () => {
    afterEach(() => setEngineVersion(EngineVersion.FALLOUT2))

    it('forced → 100', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(encounterRateForFrequency('forced')).toBe(100)
    })

    it('frequent → 60 (higher than F2)', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(encounterRateForFrequency('frequent')).toBe(60)
    })

    it('common → 40 (higher than F2)', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(encounterRateForFrequency('common')).toBe(40)
    })

    it('uncommon → 20 (higher than F2)', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(encounterRateForFrequency('uncommon')).toBe(20)
    })

    it('rare → 5 (higher than F2)', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(encounterRateForFrequency('rare')).toBe(5)
    })

    it('unknown token → 0', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(encounterRateForFrequency('none')).toBe(0)
    })

    it('F1 frequent rate exceeds F2 frequent rate', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        const f1 = encounterRateForFrequency('frequent')
        setEngineVersion(EngineVersion.FALLOUT2)
        const f2 = encounterRateForFrequency('frequent')
        expect(f1).toBeGreaterThan(f2)
    })
})

// ---------------------------------------------------------------------------
// Phase 3: F1 cinematic sequence factories
// ---------------------------------------------------------------------------

describe('buildF1CinematicSequence', () => {
    afterEach(() => setEngineVersion(EngineVersion.FALLOUT2))

    it('intro sequence has id "f1_intro" and at least one slide', () => {
        const seq = buildF1CinematicSequence('intro')
        expect(seq.id).toBe('f1_intro')
        expect(seq.slides.length).toBeGreaterThan(0)
    })

    it('intro first slide has the "War never changes" caption', () => {
        const seq = buildF1CinematicSequence('intro')
        expect(seq.slides[0].caption).toContain('War')
    })

    it('endingGood sequence has id "f1_ending_good"', () => {
        const seq = buildF1CinematicSequence('endingGood')
        expect(seq.id).toBe('f1_ending_good')
        expect(seq.slides.length).toBeGreaterThan(0)
    })

    it('endingBad sequence has id "f1_ending_bad"', () => {
        const seq = buildF1CinematicSequence('endingBad')
        expect(seq.id).toBe('f1_ending_bad')
        expect(seq.slides.length).toBeGreaterThan(0)
    })

    it('onComplete callback is wired into the sequence', () => {
        let called = false
        const seq = buildF1CinematicSequence('intro', () => { called = true })
        seq.onComplete?.()
        expect(called).toBe(true)
    })

    it('all slides use null imagePath (asset-agnostic)', () => {
        for (const type of ['intro', 'endingGood', 'endingBad'] as const) {
            const seq = buildF1CinematicSequence(type)
            for (const slide of seq.slides) {
                expect(slide.imagePath).toBeNull()
            }
        }
    })

    it('all slides have a non-empty backgroundColor', () => {
        for (const type of ['intro', 'endingGood', 'endingBad'] as const) {
            const seq = buildF1CinematicSequence(type)
            for (const slide of seq.slides) {
                expect(slide.backgroundColor.length).toBeGreaterThan(0)
            }
        }
    })
})

// ---------------------------------------------------------------------------
// Phase 4: ModRegistry — DAT override stacking
// ---------------------------------------------------------------------------

import { ModRegistry, ModManifest } from './mods.js'

describe('ModRegistry — basic registration', () => {
    it('starts empty', () => {
        const reg = new ModRegistry()
        expect(reg.getAll()).toHaveLength(0)
    })

    it('registers a mod and returns it via getAll()', () => {
        const reg = new ModRegistry()
        const mod: ModManifest = { id: 'test_mod', name: 'Test Mod', version: '1.0.0' }
        reg.register(mod)
        expect(reg.getAll()).toHaveLength(1)
        expect(reg.getAll()[0].id).toBe('test_mod')
    })

    it('replacing a mod with the same id preserves load order', () => {
        const reg = new ModRegistry()
        reg.register({ id: 'a', name: 'A', version: '1.0.0' })
        reg.register({ id: 'b', name: 'B', version: '1.0.0' })
        reg.register({ id: 'a', name: 'A v2', version: '2.0.0' })
        const all = reg.getAll()
        expect(all).toHaveLength(2)
        // 'a' was at index 0, should remain at index 0 after update
        expect(all[0].id).toBe('a')
        expect(all[0].version).toBe('2.0.0')
        expect(all[1].id).toBe('b')
    })

    it('unregister removes a mod by id', () => {
        const reg = new ModRegistry()
        reg.register({ id: 'mod1', name: 'M1', version: '1.0.0' })
        reg.register({ id: 'mod2', name: 'M2', version: '1.0.0' })
        reg.unregister('mod1')
        expect(reg.getAll()).toHaveLength(1)
        expect(reg.getAll()[0].id).toBe('mod2')
    })

    it('unregister is a no-op for unknown ids', () => {
        const reg = new ModRegistry()
        reg.register({ id: 'mod1', name: 'M1', version: '1.0.0' })
        reg.unregister('nonexistent')
        expect(reg.getAll()).toHaveLength(1)
    })

    it('clear() removes all mods', () => {
        const reg = new ModRegistry()
        reg.register({ id: 'a', name: 'A', version: '1.0.0' })
        reg.register({ id: 'b', name: 'B', version: '1.0.0' })
        reg.clear()
        expect(reg.getAll()).toHaveLength(0)
    })
})

describe('ModRegistry — asset path resolution', () => {
    it('returns canonical path when no mods are registered', () => {
        const reg = new ModRegistry()
        expect(reg.resolveAsset('data/art/foo.frm')).toBe('data/art/foo.frm')
    })

    it('returns canonical path when registered mod has no overrides', () => {
        const reg = new ModRegistry()
        reg.register({ id: 'empty_mod', name: 'Empty', version: '1.0.0' })
        expect(reg.resolveAsset('data/art/foo.frm')).toBe('data/art/foo.frm')
    })

    it('returns override when a mod covers the path', () => {
        const reg = new ModRegistry()
        reg.register({
            id: 'hi_res',
            name: 'Hi-Res Pack',
            version: '1.0.0',
            overrides: { 'data/art/foo.frm': 'mods/hi_res/art/foo.frm' },
        })
        expect(reg.resolveAsset('data/art/foo.frm')).toBe('mods/hi_res/art/foo.frm')
    })

    it('higher-priority (later-registered) mod wins override conflict', () => {
        const reg = new ModRegistry()
        reg.register({
            id: 'mod_low',
            name: 'Low Priority',
            version: '1.0.0',
            overrides: { 'data/art/foo.frm': 'mods/low/foo.frm' },
        })
        reg.register({
            id: 'mod_high',
            name: 'High Priority',
            version: '1.0.0',
            overrides: { 'data/art/foo.frm': 'mods/high/foo.frm' },
        })
        expect(reg.resolveAsset('data/art/foo.frm')).toBe('mods/high/foo.frm')
    })

    it('lower-priority mod still overrides base game for uncontested paths', () => {
        const reg = new ModRegistry()
        reg.register({
            id: 'mod_low',
            name: 'Low Priority',
            version: '1.0.0',
            overrides: { 'data/art/bar.frm': 'mods/low/bar.frm' },
        })
        reg.register({
            id: 'mod_high',
            name: 'High Priority',
            version: '1.0.0',
            overrides: { 'data/art/foo.frm': 'mods/high/foo.frm' },
        })
        // bar.frm is only overridden by the low-priority mod
        expect(reg.resolveAsset('data/art/bar.frm')).toBe('mods/low/bar.frm')
        // foo.frm is only overridden by the high-priority mod
        expect(reg.resolveAsset('data/art/foo.frm')).toBe('mods/high/foo.frm')
        // baz.frm is not overridden by anyone
        expect(reg.resolveAsset('data/art/baz.frm')).toBe('data/art/baz.frm')
    })

    it('after unregister, the overriding mod no longer wins', () => {
        const reg = new ModRegistry()
        reg.register({
            id: 'hi_res',
            name: 'Hi-Res',
            version: '1.0.0',
            overrides: { 'data/art/foo.frm': 'mods/hi_res/foo.frm' },
        })
        reg.unregister('hi_res')
        expect(reg.resolveAsset('data/art/foo.frm')).toBe('data/art/foo.frm')
    })

    it('getActiveByPriority returns mods highest-priority first', () => {
        const reg = new ModRegistry()
        reg.register({ id: 'low', name: 'Low', version: '1.0.0' })
        reg.register({ id: 'high', name: 'High', version: '1.0.0' })

        expect(reg.getActiveByPriority().map((m) => m.id)).toEqual(['high', 'low'])
    })

    it('getResolvedOverrides reports winner and overridden mod ids', () => {
        const reg = new ModRegistry()
        reg.register({
            id: 'low',
            name: 'Low',
            version: '1.0.0',
            overrides: { 'data/art/foo.frm': 'mods/low/foo.frm' },
        })
        reg.register({
            id: 'high',
            name: 'High',
            version: '1.0.0',
            overrides: { 'data/art/foo.frm': 'mods/high/foo.frm' },
        })

        expect(reg.getResolvedOverrides()).toEqual([
            {
                canonicalPath: 'data/art/foo.frm',
                resolvedPath: 'mods/high/foo.frm',
                winnerModId: 'high',
                overriddenModIds: ['low'],
            },
        ])
    })

    it('getResolvedOverrides supports limit parameter', () => {
        const reg = new ModRegistry()
        reg.register({
            id: 'm',
            name: 'M',
            version: '1.0.0',
            overrides: {
                'data/art/a.frm': 'mods/m/a.frm',
                'data/art/b.frm': 'mods/m/b.frm',
            },
        })

        expect(reg.getResolvedOverrides(1)).toHaveLength(1)
    })
})
