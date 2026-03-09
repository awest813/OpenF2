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

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, UIColor } from './uiPanel.js'
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
    }

    /** Append a player-response option. */
    addOption(text: string, optionID: number): void {
        this._options.push({ text, optionID })
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title bar
        ctx.font = 'bold 12px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('DIALOGUE', width / 2, 18)
        ctx.textAlign = 'left'

        // Reply area
        strokeRect(ctx, PADDING, 26, width - PADDING * 2, REPLY_HEIGHT, FALLOUT_DARK_GRAY, 1)
        ctx.font = '11px monospace'
        ctx.fillStyle = cssColor(FALLOUT_AMBER)

        // Build wrapped lines using ctx.measureText for accurate wrapping.
        const replyMaxW = width - PADDING * 2 - 12
        this._replyLines = buildLines(ctx, this._reply, replyMaxW)

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
            ctx.fillText(visibleLines[i], PADDING + 6, REPLY_CONTENT_TOP + i * REPLY_LINE_H)
        }

        // Scroll indicator arrows when reply text overflows the box.
        if (this._replyScrollLine > 0) {
            ctx.font = '9px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText('▲', width - PADDING - 10, REPLY_CONTENT_TOP)
        }
        if (this._replyScrollLine + REPLY_VISIBLE_LINES < this._replyLines.length) {
            ctx.font = '9px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText('▼', width - PADDING - 10, REPLY_CONTENT_TOP + (REPLY_VISIBLE_LINES - 1) * REPLY_LINE_H)
        }

        // Divider — draw as a thin stroke rect (1px height)
        ctx.strokeStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.lineWidth = 1
        ctx.strokeRect(PADDING + 0.5, 26 + REPLY_HEIGHT + 6 + 0.5, this.bounds.width - PADDING * 2 - 1, 0)

        // Options list
        const optY0 = 26 + REPLY_HEIGHT + 14
        for (let i = 0; i < this._options.length; i++) {
            const opt = this._options[i]
            const oy = optY0 + i * OPTION_ROW_H
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            ctx.fillText(`${i + 1}. ${opt.text}`, PADDING + 4, oy + 16)
        }

        if (this._options.length === 0) {
            ctx.font = '10px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.textAlign = 'center'
            ctx.fillText('[No options]', width / 2, optY0 + 16)
            ctx.textAlign = 'left'
        }
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const optY0 = 26 + REPLY_HEIGHT + 14
        for (let i = 0; i < this._options.length; i++) {
            const oy = optY0 + i * OPTION_ROW_H
            if (y >= oy && y < oy + OPTION_ROW_H && x >= PADDING && x < this.bounds.width - PADDING) {
                EventBus.emit('dialogue:optionSelected', { optionID: this._options[i].optionID })
                return true
            }
        }
        return true // consume all clicks within the panel
    }

    override onKeyDown(key: string): boolean {
        // Number keys 1-9 select options directly.
        const digit = parseInt(key)
        if (!isNaN(digit) && digit >= 1 && digit <= this._options.length) {
            EventBus.emit('dialogue:optionSelected', { optionID: this._options[digit - 1].optionID })
            return true
        }
        // Arrow keys scroll the reply text.
        if (key === 'ArrowUp') {
            if (this._replyScrollLine > 0) this._replyScrollLine--
            return true
        }
        if (key === 'ArrowDown') {
            if (this._replyScrollLine + REPLY_VISIBLE_LINES < this._replyLines.length) {
                this._replyScrollLine++
            }
            return true
        }
        if (key === 'Escape') {
            this.hide()
            return true
        }
        return false
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function cssColor(c: UIColor): string {
    return `rgba(${c.r},${c.g},${c.b},${c.a / 255})`
}

function fillRect(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    color: UIColor,
): void {
    ctx.fillStyle = cssColor(color)
    ctx.fillRect(x, y, w, h)
}

function strokeRect(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    color: UIColor,
    lineWidth: number = 1,
): void {
    ctx.strokeStyle = cssColor(color)
    ctx.lineWidth = lineWidth
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

/**
 * Split `text` into wrapped lines that each fit within `maxWidth` pixels.
 * Uses `ctx.measureText` for accurate glyph-width measurement.
 */
function buildLines(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string[] {
    const words = text.split(' ')
    const lines: string[] = []
    let line = ''
    for (const word of words) {
        const test = line ? line + ' ' + word : word
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line)
            line = word
        } else {
            line = test
        }
    }
    if (line) lines.push(line)
    return lines
}
