/**
 * Phase 32 regression tests.
 *
 * Focus: cinematic playback timing safety for ending/slide pipelines.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { CinematicPlayer } from './cinematic.js'

function makeMockCtx() {
    return {
        canvas: { width: 640, height: 480 },
        fillStyle: '#000',
        font: '12px monospace',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        fillRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
    } as any
}

describe('Phase 32-A — cinematic timing guards', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('falls back to default duration when slide duration is negative', () => {
        vi.useFakeTimers()
        const onComplete = vi.fn()
        const player = new CinematicPlayer(makeMockCtx())

        player.play({
            id: 'ending-negative-duration',
            slides: [{ imagePath: null, backgroundColor: '#000', caption: 'End', duration: -50 }],
            onComplete,
        })

        vi.advanceTimersByTime(3999)
        expect(player.isPlaying).toBe(true)
        expect(onComplete).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(player.isPlaying).toBe(false)
        expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('falls back to default duration when slide duration is NaN', () => {
        vi.useFakeTimers()
        const onComplete = vi.fn()
        const player = new CinematicPlayer(makeMockCtx())

        player.play({
            id: 'ending-nan-duration',
            slides: [{ imagePath: null, backgroundColor: '#000', duration: Number.NaN }],
            onComplete,
        })

        vi.advanceTimersByTime(3999)
        expect(player.isPlaying).toBe(true)
        expect(onComplete).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(player.isPlaying).toBe(false)
        expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('respects explicit positive durations for slide progression', () => {
        vi.useFakeTimers()
        const onComplete = vi.fn()
        const player = new CinematicPlayer(makeMockCtx())

        player.play({
            id: 'ending-short-duration',
            slides: [{ imagePath: null, backgroundColor: '#000', duration: 5 }],
            onComplete,
        })

        vi.advanceTimersByTime(4)
        expect(player.isPlaying).toBe(true)
        expect(onComplete).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(player.isPlaying).toBe(false)
        expect(onComplete).toHaveBeenCalledTimes(1)
    })
})
