/**
 * Screen fade state (parity P2-2).
 *
 * Scripts call gfade_out / gfade_in; map transitions and endgame also fade.
 * Tracks logical fade level (0 = fully visible, 1 = black) and emits EventBus
 * events. Browser CSS opacity is applied when a document canvas is present.
 */

import { EventBus } from './eventBus.js'

export type FadeDirection = 'in' | 'out'

let fadeLevel = 0
let fadeBusy = false

export function getFadeLevel(): number {
    return fadeLevel
}

export function isFading(): boolean {
    return fadeBusy
}

function applyCssOpacity(opacity: number, durationMs: number): void {
    if (typeof document === 'undefined') return
    const cnv = document.getElementById('cnv')
    if (!cnv) return
    const ms = Math.max(0, durationMs | 0)
    cnv.style.transition = ms > 0 ? `opacity ${ms}ms ease-in-out` : 'none'
    cnv.style.opacity = String(Math.max(0, Math.min(1, opacity)))
}

/**
 * Convert FO2 fade "time" ticks (~0.1s each) to milliseconds for CSS.
 * Clamped so scripts that pass 0 still get a short visible transition.
 */
export function fadeTicksToMs(ticks: number): number {
    if (typeof ticks !== 'number' || !Number.isFinite(ticks) || ticks <= 0) return 200
    return Math.max(50, Math.min(5000, Math.floor(ticks * 100)))
}

export function fadeOut(ticksOrMs: number = 5, opts: { asMs?: boolean } = {}): void {
    const ms = opts.asMs ? Math.max(0, ticksOrMs | 0) : fadeTicksToMs(ticksOrMs)
    fadeBusy = true
    fadeLevel = 1
    EventBus.emit('screen:fadeOut', { durationMs: ms })
    applyCssOpacity(0, ms)
    fadeBusy = false
}

export function fadeIn(ticksOrMs: number = 5, opts: { asMs?: boolean } = {}): void {
    const ms = opts.asMs ? Math.max(0, ticksOrMs | 0) : fadeTicksToMs(ticksOrMs)
    fadeBusy = true
    fadeLevel = 0
    EventBus.emit('screen:fadeIn', { durationMs: ms })
    applyCssOpacity(1, ms)
    fadeBusy = false
}

/** Instantly set fade without transition (tests / hard cuts). */
export function setFadeLevelImmediate(level: number): void {
    fadeLevel = Math.max(0, Math.min(1, level))
    applyCssOpacity(1 - fadeLevel, 0)
}
