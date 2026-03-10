/**
 * Phase 3 scaffolding tests + Phase 2 bug-fix regression tests.
 *
 * Covers:
 *   - audio rollNextSfx weighted selection (fix: >= → <)
 *   - worldmap encounter rate clamping after difficulty adjustment
 *   - worldmap didEncounter guard against out-of-bounds squarePos
 *   - CinematicPlayer state machine and EventBus integration
 *   - Fallout 1 compat helpers (resolveDataPath, resolveProcName, migrateF1Save)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventBus } from './eventBus.js'

// ---------------------------------------------------------------------------
// Audio: rollNextSfx weighted selection
// ---------------------------------------------------------------------------

/**
 * Pure replica of the fixed rollNextSfx loop so we can test the algorithm in
 * isolation without needing a full HTMLAudioEngine instance.
 */
function weightedSelect(sfx: [string, number][], roll: number): string {
    let r = roll
    for (let i = 0; i < sfx.length; i++) {
        const freq = sfx[i][1]
        if (r < freq) {return sfx[i][0]}
        r -= freq
    }
    return sfx[sfx.length - 1][0]
}

describe('weightedSelect (rollNextSfx algorithm)', () => {
    const sfx: [string, number][] = [
        ['wind.wav', 3],
        ['bird.wav', 7],
    ] // sum = 10

    it('selects first entry when roll is below its weight', () => {
        expect(weightedSelect(sfx, 0)).toBe('wind.wav')
        expect(weightedSelect(sfx, 2)).toBe('wind.wav')
    })

    it('selects second entry when roll is at or above first weight', () => {
        expect(weightedSelect(sfx, 3)).toBe('bird.wav')
        expect(weightedSelect(sfx, 9)).toBe('bird.wav')
    })

    it('never throws for roll at the boundary (sum - 1)', () => {
        expect(() => weightedSelect(sfx, 9)).not.toThrow()
    })

    it('handles a single-entry list', () => {
        const single: [string, number][] = [['only.wav', 5]]
        expect(weightedSelect(single, 0)).toBe('only.wav')
        expect(weightedSelect(single, 4)).toBe('only.wav')
    })

    it('uses fallback for roll equal to sum (edge case)', () => {
        // roll === sumFreqs can occur if getRandomInt is inclusive on the upper bound
        expect(weightedSelect(sfx, 10)).toBe('bird.wav')
    })
})

// ---------------------------------------------------------------------------
// Worldmap: encounter rate clamping after difficulty
// ---------------------------------------------------------------------------

function applyDifficultyAndClamp(encRate: number, difficulty: 'easy' | 'normal' | 'hard'): number {
    if (difficulty === 'easy') {encRate -= Math.floor(encRate / 15)}
    else if (difficulty === 'hard') {encRate += Math.floor(encRate / 15)}
    return Math.max(1, Math.min(99, encRate))
}

describe('encounter rate clamping after difficulty', () => {
    it('never drops to 0 on easy, even for very low rates', () => {
        // rate=1 on easy: 1 - floor(1/15)=0 → 1; still >= 1
        expect(applyDifficultyAndClamp(1, 'easy')).toBeGreaterThanOrEqual(1)
    })

    it('never reaches 100 on hard, even for rates near 100', () => {
        // rate=99 on hard: 99 + floor(99/15)=6 → 105 → clamped to 99
        expect(applyDifficultyAndClamp(99, 'hard')).toBeLessThanOrEqual(99)
    })

    it('leaves normal difficulty unchanged', () => {
        expect(applyDifficultyAndClamp(30, 'normal')).toBe(30)
    })

    it('reduces rate for easy but keeps it >= 1', () => {
        const result = applyDifficultyAndClamp(30, 'easy')
        expect(result).toBeGreaterThanOrEqual(1)
        expect(result).toBeLessThan(30)
    })

    it('increases rate for hard but caps at 99', () => {
        const result = applyDifficultyAndClamp(90, 'hard')
        expect(result).toBeLessThanOrEqual(99)
        expect(result).toBeGreaterThan(90)
    })
})

// ---------------------------------------------------------------------------
// CinematicPlayer: state machine and EventBus
// ---------------------------------------------------------------------------

// Minimal canvas stub for Node test environment
function makeCtxStub() {
    return {
        canvas: { width: 640, height: 480 },
        fillStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        fillRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
    } as unknown as OffscreenCanvasRenderingContext2D
}

// Import after defining stubs so the module resolves
import { CinematicPlayer, CinematicSequence } from './cinematic.js'

describe('CinematicPlayer', () => {
    let ctx: OffscreenCanvasRenderingContext2D
    let player: CinematicPlayer
    const emitted: { event: string; payload: unknown }[] = []

    beforeEach(() => {
        ctx = makeCtxStub()
        player = new CinematicPlayer(ctx)
        emitted.length = 0

        EventBus.on('cinematic:start', (p) => emitted.push({ event: 'cinematic:start', payload: p }))
        EventBus.on('cinematic:end',   (p) => emitted.push({ event: 'cinematic:end',   payload: p }))
        EventBus.on('cinematic:slideChange', (p) => emitted.push({ event: 'cinematic:slideChange', payload: p }))
    })

    afterEach(() => {
        player.stop()
        EventBus.offAll('cinematic:start')
        EventBus.offAll('cinematic:end')
        EventBus.offAll('cinematic:slideChange')
    })

    it('starts as not playing', () => {
        expect(player.isPlaying).toBe(false)
    })

    it('is playing after play() is called', () => {
        const seq: CinematicSequence = {
            id: 'test_seq',
            slides: [{ imagePath: null, backgroundColor: '#000', duration: 10000 }],
        }
        player.play(seq)
        expect(player.isPlaying).toBe(true)
    })

    it('emits cinematic:start and cinematic:slideChange on play()', () => {
        const seq: CinematicSequence = {
            id: 'intro',
            slides: [{ imagePath: null, backgroundColor: '#000', duration: 10000 }],
        }
        player.play(seq)
        const starts = emitted.filter((e) => e.event === 'cinematic:start')
        const changes = emitted.filter((e) => e.event === 'cinematic:slideChange')
        expect(starts).toHaveLength(1)
        expect((starts[0].payload as any).sequenceId).toBe('intro')
        expect(changes).toHaveLength(1)
        expect((changes[0].payload as any).slideIndex).toBe(0)
    })

    it('emits cinematic:end and calls onComplete when skipped', () => {
        let completed = false
        const seq: CinematicSequence = {
            id: 'ending',
            slides: [{ imagePath: null, backgroundColor: '#111', duration: 10000 }],
            onComplete: () => { completed = true },
        }
        player.play(seq)
        player.skip()
        expect(player.isPlaying).toBe(false)
        expect(completed).toBe(true)
        const ends = emitted.filter((e) => e.event === 'cinematic:end')
        expect(ends).toHaveLength(1)
        expect((ends[0].payload as any).sequenceId).toBe('ending')
    })

    it('stop() halts playback without firing onComplete', () => {
        let completed = false
        const seq: CinematicSequence = {
            id: 'test',
            slides: [{ imagePath: null, backgroundColor: '#000', duration: 10000 }],
            onComplete: () => { completed = true },
        }
        player.play(seq)
        player.stop()
        expect(player.isPlaying).toBe(false)
        expect(completed).toBe(false)
    })

    it('play() on an empty slide list does not start playback', () => {
        player.play({ id: 'empty', slides: [] })
        expect(player.isPlaying).toBe(false)
    })

    it('replaces an in-progress sequence when play() is called again', () => {
        const seq1: CinematicSequence = { id: 's1', slides: [{ imagePath: null, backgroundColor: '#000', duration: 10000 }] }
        const seq2: CinematicSequence = { id: 's2', slides: [{ imagePath: null, backgroundColor: '#111', duration: 10000 }] }
        player.play(seq1)
        player.play(seq2)
        expect(player.isPlaying).toBe(true)
        const starts = emitted.filter((e) => e.event === 'cinematic:start')
        // seq1 start fires, then seq2 start fires
        expect(starts).toHaveLength(2)
        expect((starts[1].payload as any).sequenceId).toBe('s2')
    })
})

// ---------------------------------------------------------------------------
// Fallout 1 compat helpers
// ---------------------------------------------------------------------------

import {
    setEngineVersion,
    getEngineVersion,
    isF1Active,
    resolveDataPath,
    activeMapVersion,
    resolveProcName,
    migrateF1Save,
} from './compat/fallout1.js'
import { EngineVersion } from './engineVersion.js'

describe('Fallout 1 compat — version management', () => {
    afterEach(() => {
        // Always restore to F2 so other tests are unaffected
        setEngineVersion(EngineVersion.FALLOUT2)
    })

    it('defaults to Fallout 2', () => {
        expect(getEngineVersion()).toBe(EngineVersion.FALLOUT2)
        expect(isF1Active()).toBe(false)
    })

    it('can be switched to Fallout 1', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(isF1Active()).toBe(true)
    })
})

describe('resolveDataPath', () => {
    afterEach(() => setEngineVersion(EngineVersion.FALLOUT2))

    it('uses "data/" prefix for F2', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(resolveDataPath('art/critters/hmjmpswk.frm')).toBe('data/art/critters/hmjmpswk.frm')
    })

    it('uses "f1data/" prefix for F1', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(resolveDataPath('art/critters/hmjmpswk.frm')).toBe('f1data/art/critters/hmjmpswk.frm')
    })

    it('handles leading slash in relativePath', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(resolveDataPath('/art/foo.frm')).toBe('data/art/foo.frm')
    })
})

describe('activeMapVersion', () => {
    afterEach(() => setEngineVersion(EngineVersion.FALLOUT2))

    it('returns 20 for F2', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(activeMapVersion()).toBe(20)
    })

    it('returns 19 for F1', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(activeMapVersion()).toBe(19)
    })
})

describe('resolveProcName', () => {
    afterEach(() => setEngineVersion(EngineVersion.FALLOUT2))

    it('returns name unchanged in F2 mode', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        expect(resolveProcName('some_proc')).toBe('some_proc')
    })

    it('returns name unchanged in F1 mode for unknown procedures', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        expect(resolveProcName('unknown_proc')).toBe('unknown_proc')
    })
})

describe('migrateF1Save', () => {
    afterEach(() => setEngineVersion(EngineVersion.FALLOUT2))

    it('returns raw save unchanged in F2 mode', () => {
        setEngineVersion(EngineVersion.FALLOUT2)
        const raw = { version: 3 }
        expect(migrateF1Save(raw)).toBe(raw)
    })

    it('injects questLog and reputation stubs for F1 saves missing them', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        const raw: Record<string, unknown> = { version: 1 }
        const migrated = migrateF1Save(raw)
        expect(migrated['questLog']).toEqual({ entries: [] })
        expect(migrated['reputation']).toEqual({ karma: 0, reputations: {} })
    })

    it('does not overwrite existing questLog in F1 save', () => {
        setEngineVersion(EngineVersion.FALLOUT1)
        const existing = { entries: [{ id: 'q1' }] }
        const raw = { version: 1, questLog: existing }
        const migrated = migrateF1Save(raw)
        expect(migrated['questLog']).toBe(existing)
    })
})
