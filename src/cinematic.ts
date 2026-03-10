/**
 * Cinematic / cutscene pipeline for Phase 2 ending and intro sequences.
 *
 * A CinematicSequence is a list of slides, each consisting of a background
 * image (or colour fill) and an optional caption.  The CinematicPlayer
 * advances slides on a timer and emits EventBus events so the rest of the
 * engine can react (pause game loop, restore game loop, etc.).
 *
 * This is intentionally thin in Phase 2 — it covers the structural
 * requirements (event wiring, slide timing, skip support) so that
 * asset-specific content (intro/ending art, audio cues) can be layered on
 * top during Phase 3 / 4 without architectural rewrites.
 *
 * Usage:
 *   const player = new CinematicPlayer(canvas2dCtx)
 *   player.play({ id: 'ending_good', slides: [...] })
 *
 *   // To skip from the outside:
 *   player.skip()
 *
 *   // When playback ends the player emits 'cinematic:end' on the EventBus.
 */

import { EventBus } from './eventBus.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CinematicSlide {
    /** Path to a background image, or null for a solid colour fill. */
    imagePath: string | null
    /** Background fill colour used when imagePath is null or while image loads. */
    backgroundColor: string
    /** Optional caption rendered at the bottom of the slide. */
    caption?: string
    /** How long (ms) to hold this slide before advancing. Default 4000 ms. */
    duration?: number
}

export interface CinematicSequence {
    /** Unique identifier used in EventBus payloads. */
    id: string
    slides: CinematicSlide[]
    /** Called when the full sequence finishes (either normally or via skip). */
    onComplete?: () => void
}

// ---------------------------------------------------------------------------
// CinematicPlayer
// ---------------------------------------------------------------------------

export class CinematicPlayer {
    private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
    private sequence: CinematicSequence | null = null
    private slideIndex = 0
    private timerId: ReturnType<typeof setTimeout> | null = null
    private _isPlaying = false

    /**
     * @param ctx  The 2D canvas context to render into.
     *             For UI integration, this should be the UIManager's offscreen
     *             canvas context (or a dedicated overlay canvas).
     */
    constructor(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) {
        this.ctx = ctx
    }

    get isPlaying(): boolean {
        return this._isPlaying
    }

    /**
     * Begin playing a cinematic sequence.  If a sequence is already playing,
     * it is stopped first.
     */
    play(sequence: CinematicSequence): void {
        this.stop()

        if (!sequence.slides.length) {return}

        this.sequence = sequence
        this.slideIndex = 0
        this._isPlaying = true

        EventBus.emit('cinematic:start', { sequenceId: sequence.id })
        this._showSlide()
    }

    /** Skip immediately to the end of the current sequence. */
    skip(): void {
        if (!this._isPlaying) {return}
        this._finish()
    }

    /** Stop playback without completing; does NOT fire onComplete. */
    stop(): void {
        if (this.timerId !== null) {
            clearTimeout(this.timerId)
            this.timerId = null
        }
        this._isPlaying = false
        this.sequence = null
        this.slideIndex = 0
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    private _showSlide(): void {
        if (!this.sequence) {return}

        const slide = this.sequence.slides[this.slideIndex]
        const total = this.sequence.slides.length

        EventBus.emit('cinematic:slideChange', {
            sequenceId: this.sequence.id,
            slideIndex: this.slideIndex,
            total,
        })

        this._renderSlide(slide)

        const rawDuration = slide.duration ?? 4000
        const duration =
            Number.isFinite(rawDuration) && rawDuration > 0
                ? rawDuration
                : 4000
        this.timerId = setTimeout(() => {
            this.slideIndex++
            if (this.slideIndex >= total) {
                this._finish()
            } else {
                this._showSlide()
            }
        }, duration)
    }

    private _renderSlide(slide: CinematicSlide): void {
        const { width, height } = this.ctx.canvas

        // Background
        this.ctx.fillStyle = slide.backgroundColor
        this.ctx.fillRect(0, 0, width, height)

        if (slide.imagePath) {
            // In a browser context, load and draw the image.
            // In test / Node context, img loading is a no-op.
            if (typeof Image !== 'undefined') {
                const img = new Image()
                img.onload = () => {
                    if (!this._isPlaying) {return}
                    this.ctx.drawImage(img, 0, 0, width, height)
                    if (slide.caption) {this._renderCaption(slide.caption)}
                }
                img.src = slide.imagePath
            }
        }

        if (slide.caption) {this._renderCaption(slide.caption)}
    }

    private _renderCaption(text: string): void {
        const { width, height } = this.ctx.canvas
        const padding = 20
        const lineHeight = 22

        // Measure and word-wrap
        this.ctx.font = '16px monospace'
        this.ctx.fillStyle = 'rgba(0,0,0,0.6)'
        this.ctx.fillRect(0, height - lineHeight * 2 - padding, width, lineHeight * 2 + padding)

        this.ctx.fillStyle = '#c8c89c'
        this.ctx.textAlign = 'center'
        this.ctx.textBaseline = 'bottom'
        this.ctx.fillText(text, width / 2, height - padding, width - padding * 2)
        this.ctx.textAlign = 'left'
        this.ctx.textBaseline = 'alphabetic'
    }

    private _finish(): void {
        if (this.timerId !== null) {
            clearTimeout(this.timerId)
            this.timerId = null
        }
        this._isPlaying = false

        const seq = this.sequence
        this.sequence = null
        this.slideIndex = 0

        if (seq) {
            EventBus.emit('cinematic:end', { sequenceId: seq.id })
            seq.onComplete?.()
        }
    }
}
