/**
 * DialoguePanel — WebGL-rendered dialogue interface.
 *
 * Replaces the legacy DOM-based uiStartDialogue / uiEndDialogue with a ui2
 * panel rendered entirely via the OffscreenCanvas pipeline.
 *
 * Displays the NPC's reply text in an upper scrollable area and a list of
 * clickable response options below it.  Selecting an option fires the
 * EventBus event 'dialogue:optionSelected' with the chosen optionID so that
 * the scripting engine can continue the conversation.
 *
 * Panel name: 'dialogue'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, cssColor, fillRect, strokeRect, wrapText, fitText, drawUIFontText } from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 500
const PANEL_HEIGHT = 320
const REPLY_HEIGHT = 120
const REPLY_LINE_H = 14
const REPLY_CONTENT_TOP = 42     // y of the first reply text line
const REPLY_VISIBLE_LINES = Math.floor((REPLY_HEIGHT - (REPLY_CONTENT_TOP - 26)) / REPLY_LINE_H)  // = 7
const OPTION_ROW_H = 26
const OPTIONS_TOP  = 26 + REPLY_HEIGHT + 14
/** Rows that fit between the options list top and the panel bottom margin. */
const OPTION_VISIBLE_ROWS = Math.floor((PANEL_HEIGHT - OPTIONS_TOP - 8) / OPTION_ROW_H)  // = 5
const PADDING      = 14

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DialogueOption {
    text: string
    optionID: number
}

// ---------------------------------------------------------------------------
// DialoguePanel
// ---------------------------------------------------------------------------

export class DialoguePanel extends UIPanel {
    private _reply = ''
    private _options: DialogueOption[] = []
    /** Current top line shown in the reply box (0 = start of text). */
    private _replyScrollLine = 0
    /**
     * Wrapped lines built from `_reply` during the most recent `render()` call.
     * Used by `onKeyDown` to enforce scroll bounds without re-measuring.
     */
    private _replyLines: string[] = []
    /** Index of the currently hovered option (-1 = none). */
    private _hoveredIndex = -1
    /** First visible option row when the list overflows. */
    private _optionScrollOffset = 0

    constructor(screenWidth: number, screenHeight: number) {
        super('dialogue', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 30
    }

    /** Set the NPC's reply text (replaces previous reply). */
    setReply(text: string): void {
        this._reply = text
        this._options = []
        this._replyScrollLine = 0
        this._replyLines = []
        this._hoveredIndex = -1
        this._optionScrollOffset = 0
    }

    /** Append a player-response option. */
    addOption(text: string, optionID: number): void {
        this._options.push({ text, optionID })
    }

    protected override onHide(): void {
        // Hover state must not survive a hide/show cycle.
        this._hoveredIndex = -1
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title bar
        drawUIFontText(ctx, 'DIALOGUE', width / 2, 18, FALLOUT_GREEN, 12, { align: 'center', bold: true })

        // Reply area
        strokeRect(ctx, PADDING, 26, width - PADDING * 2, REPLY_HEIGHT, FALLOUT_DARK_GRAY, 1)
        // System font stays set for wrapText's ctx.measureText width pass.
        ctx.font = '11px monospace'

        // Build wrapped lines using ctx.measureText for accurate wrapping.
        // Keep 12px clear of the ▲/▼ scroll arrows in the top-right corner.
        const replyMaxW = width - PADDING * 2 - 12 - 12
        this._replyLines = wrapText(ctx, this._reply, replyMaxW)

        // Clamp scroll offset in case text changed since last keypress.
        this._replyScrollLine = Math.max(0, Math.min(
            this._replyScrollLine,
            Math.max(0, this._replyLines.length - REPLY_VISIBLE_LINES),
        ))

        const visibleLines = this._replyLines.slice(
            this._replyScrollLine,
            this._replyScrollLine + REPLY_VISIBLE_LINES,
        )
        for (let i = 0; i < visibleLines.length; i++) {
            drawUIFontText(ctx, visibleLines[i], PADDING + 6, REPLY_CONTENT_TOP + i * REPLY_LINE_H, FALLOUT_AMBER, 11)
        }

        // Scroll indicator arrows when reply text overflows the box.
        if (this._replyScrollLine > 0) {
            drawUIFontText(ctx, '▲', width - PADDING - 10, REPLY_CONTENT_TOP, FALLOUT_GREEN, 9)
        }
        if (this._replyScrollLine + REPLY_VISIBLE_LINES < this._replyLines.length) {
            drawUIFontText(ctx, '▼', width - PADDING - 10, REPLY_CONTENT_TOP + (REPLY_VISIBLE_LINES - 1) * REPLY_LINE_H, FALLOUT_GREEN, 9)
        }

        // Divider — draw as a thin stroke rect (1px height)
        ctx.strokeStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.lineWidth = 1
        ctx.strokeRect(PADDING + 0.5, 26 + REPLY_HEIGHT + 6 + 0.5, this.bounds.width - PADDING * 2 - 1, 0)

        // Options list — only as many rows as fit inside the panel; the rest
        // scroll into view via the arrow keys (or shrink as options resolve).
        this._optionScrollOffset = Math.max(0, Math.min(
            this._optionScrollOffset,
            Math.max(0, this._options.length - OPTION_VISIBLE_ROWS),
        ))
        const visibleOptions = Math.min(this._options.length, OPTION_VISIBLE_ROWS)
        for (let row = 0; row < visibleOptions; row++) {
            const i = this._optionScrollOffset + row
            const opt = this._options[i]
            const oy = OPTIONS_TOP + row * OPTION_ROW_H
            // Hover highlight
            if (i === this._hoveredIndex) {
                fillRect(ctx, PADDING, oy, width - PADDING * 2, OPTION_ROW_H, FALLOUT_DARK_GRAY)
            }
            ctx.font = '11px monospace'
            const label = fitText(ctx, `${i + 1}. ${opt.text}`, width - PADDING * 2 - 8)
            drawUIFontText(ctx, label, PADDING + 4, oy + 16,
                i === this._hoveredIndex ? FALLOUT_AMBER : FALLOUT_GREEN, 11)
        }

        // Scroll indicator when more options exist below the fold.
        if (this._options.length > OPTION_VISIBLE_ROWS) {
            drawUIFontText(
                ctx,
                `${this._optionScrollOffset + 1}–${this._optionScrollOffset + visibleOptions} / ${this._options.length}`,
                width - PADDING - 4, height - 8,
                FALLOUT_AMBER, 9, { align: 'right' },
            )
        }

        if (this._options.length === 0) {
            drawUIFontText(ctx, '[No options]', width / 2, OPTIONS_TOP + 16, FALLOUT_DARK_GRAY, 10, { align: 'center' })
        }
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const visibleOptions = Math.min(this._options.length, OPTION_VISIBLE_ROWS)
        for (let row = 0; row < visibleOptions; row++) {
            const i = this._optionScrollOffset + row
            const oy = OPTIONS_TOP + row * OPTION_ROW_H
            if (y >= oy && y < oy + OPTION_ROW_H && x >= PADDING && x < this.bounds.width - PADDING) {
                EventBus.emit('dialogue:optionSelected', { optionID: this._options[i].optionID })
                return true
            }
        }
        return true // consume all clicks within the panel
    }

    override onMouseMove(x: number, y: number): void {
        const visibleOptions = Math.min(this._options.length, OPTION_VISIBLE_ROWS)
        for (let row = 0; row < visibleOptions; row++) {
            const i = this._optionScrollOffset + row
            const oy = OPTIONS_TOP + row * OPTION_ROW_H
            if (y >= oy && y < oy + OPTION_ROW_H && x >= PADDING && x < this.bounds.width - PADDING) {
                this._hoveredIndex = i
                return
            }
        }
        this._hoveredIndex = -1
    }

    override onKeyDown(key: string): boolean {
        // Number keys 1-9 select options directly.
        const digit = parseInt(key)
        if (!isNaN(digit) && digit >= 1 && digit <= this._options.length) {
            EventBus.emit('dialogue:optionSelected', { optionID: this._options[digit - 1].optionID })
            return true
        }
        const optionsOverflow = this._options.length > OPTION_VISIBLE_ROWS
        // Arrow keys scroll whichever area overflows: the option list when
        // it is too long, otherwise the reply text.
        if (key === 'ArrowUp') {
            if (optionsOverflow && this._optionScrollOffset > 0) {
                this._optionScrollOffset--
            } else if (this._replyScrollLine > 0) {
                this._replyScrollLine--
            }
            return true
        }
        if (key === 'ArrowDown') {
            if (optionsOverflow &&
                this._optionScrollOffset + OPTION_VISIBLE_ROWS < this._options.length) {
                this._optionScrollOffset++
            } else if (this._replyScrollLine + REPLY_VISIBLE_LINES < this._replyLines.length) {
                this._replyScrollLine++
            }
            return true
        }
        // PageUp/PageDown always scroll the reply text.
        if (key === 'PageUp') {
            this._replyScrollLine = Math.max(0, this._replyScrollLine - REPLY_VISIBLE_LINES)
            return true
        }
        if (key === 'PageDown') {
            this._replyScrollLine = Math.min(
                Math.max(0, this._replyLines.length - REPLY_VISIBLE_LINES),
                this._replyScrollLine + REPLY_VISIBLE_LINES,
            )
            return true
        }
        if (key === 'Escape') {
            // Tell the scripting layer the player walked away so it can end
            // the session instead of leaving the NPC stuck in dialogue state.
            EventBus.emit('dialogue:closed', {})
            this.hide()
            return true
        }
        return false
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// (cssColor / fillRect / strokeRect / wrapText now live in uiPanel.ts)
