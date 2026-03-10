/**
 * OptionsPanel — simple options menu with toggle buttons for common Config flags.
 *
 * Opened via the OPT HUD button (panel name 'options').  Provides toggles for
 * hex-grid overlay, object/roof/floor visibility, and audio.  Close with the
 * CLOSE button or Escape.
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor } from './uiPanel.js'
import { Config } from '../config.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 300
const PANEL_HEIGHT = 200

const ROW_H = 22
const START_Y = 38
const BTN_W = 44
const BTN_H = 18
const BTN_X_OFFSET = 60   // from right edge

const CLOSE_BTN_W = 60
const CLOSE_BTN_H = 22

interface ToggleEntry {
    label: string
    get: () => boolean
    set: (v: boolean) => void
}

const TOGGLES: ToggleEntry[] = [
    { label: 'Show Hex Grid', get: () => Config.ui.showHexOverlay,  set: (v) => { Config.ui.showHexOverlay = v } },
    { label: 'Show Objects',  get: () => Config.ui.showObjects,     set: (v) => { Config.ui.showObjects = v } },
    { label: 'Show Roof',     get: () => Config.ui.showRoof,        set: (v) => { Config.ui.showRoof = v } },
    { label: 'Show Floor',    get: () => Config.ui.showFloor,       set: (v) => { Config.ui.showFloor = v } },
    { label: 'Audio',         get: () => Config.engine.doAudio,     set: (v) => { Config.engine.doAudio = v } },
]

// ---------------------------------------------------------------------------
// OptionsPanel
// ---------------------------------------------------------------------------

export class OptionsPanel extends UIPanel {
    constructor(screenWidth: number, screenHeight: number) {
        super('options', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 15
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title
        ctx.font = 'bold 14px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('OPTIONS', width / 2, 22)
        ctx.textAlign = 'left'

        // Toggle rows
        for (let i = 0; i < TOGGLES.length; i++) {
            const t = TOGGLES[i]
            const y = START_Y + i * ROW_H
            const on = t.get()
            const btnX = width - BTN_X_OFFSET

            // Label
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            ctx.fillText(t.label, 14, y + 14)

            // Toggle button
            fillRect(ctx, btnX, y, BTN_W, BTN_H, on ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
            strokeRect(ctx, btnX, y, BTN_W, BTN_H, FALLOUT_GREEN, 1)
            ctx.font = '10px monospace'
            ctx.fillStyle = on ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
            ctx.textAlign = 'center'
            ctx.fillText(on ? 'ON' : 'OFF', btnX + BTN_W / 2, y + 13)
            ctx.textAlign = 'left'
        }

        // Close button
        const closeBtnX = width / 2 - CLOSE_BTN_W / 2
        const closeBtnY = height - 34
        fillRect(ctx, closeBtnX, closeBtnY, CLOSE_BTN_W, CLOSE_BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, closeBtnX, closeBtnY, CLOSE_BTN_W, CLOSE_BTN_H, FALLOUT_GREEN, 1)
        ctx.font = '11px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('CLOSE', width / 2, closeBtnY + 15)
        ctx.textAlign = 'left'
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width, height } = this.bounds

        // Toggle button hits
        const btnX = width - BTN_X_OFFSET
        for (let i = 0; i < TOGGLES.length; i++) {
            const y0 = START_Y + i * ROW_H
            if (x >= btnX && x < btnX + BTN_W && y >= y0 && y < y0 + BTN_H) {
                const t = TOGGLES[i]
                t.set(!t.get())
                return true
            }
        }

        // Close button
        const closeBtnX = width / 2 - CLOSE_BTN_W / 2
        const closeBtnY = height - 34
        if (x >= closeBtnX && x < closeBtnX + CLOSE_BTN_W && y >= closeBtnY && y < closeBtnY + CLOSE_BTN_H) {
            this.hide()
            return true
        }

        return true // consume all clicks within the panel
    }

    override onKeyDown(key: string): boolean {
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
    lineWidth = 1,
): void {
    ctx.strokeStyle = cssColor(color)
    ctx.lineWidth = lineWidth
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}
