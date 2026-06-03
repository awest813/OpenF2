/**
 * ElevatorPanel — WebGL-rendered elevator selector.
 *
 * Replaces the legacy DOM-based uiElevator / uiElevatorDone with a ui2 panel
 * rendered entirely via the OffscreenCanvas pipeline.
 *
 * Displays a column of floor buttons (up to the maximum supported by the
 * elevator type).  Pressing a button fires the EventBus event
 * 'elevator:buttonPressed' with the button's mapID, level, and tileNum so
 * the engine can teleport the player.
 *
 * Panel name: 'elevator'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, cssColor, fillRect, strokeRect } from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 220
const PANEL_HEIGHT = 300
const BTN_W        = 140
const BTN_H        = 28
const BTN_GAP      = 10
const BTNS_START_Y = 50
const BTNS_CENTER_X_OFFSET = (PANEL_WIDTH - BTN_W) / 2

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ElevatorButton {
    /** Floor label shown on the button (e.g. "L1", "Level 2"). */
    label: string
    mapID: number
    level: number
    tileNum: number
}

// ---------------------------------------------------------------------------
// ElevatorPanel
// ---------------------------------------------------------------------------

export class ElevatorPanel extends UIPanel {
    buttons: ElevatorButton[] = []
    private _hoveredIndex = -1

    constructor(screenWidth: number, screenHeight: number) {
        super('elevator', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 35
    }

    /** Load elevator buttons and show the panel. */
    openWith(buttons: ElevatorButton[]): void {
        this.buttons = buttons.slice()
        this._hoveredIndex = -1
        this.show()
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title
        ctx.font = 'bold 12px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('ELEVATOR', width / 2, 24)
        ctx.textAlign = 'left'

        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.textAlign = 'center'
        ctx.fillText('Select floor', width / 2, 38)
        ctx.textAlign = 'left'

        // Floor buttons
        for (let i = 0; i < this.buttons.length; i++) {
            const btn = this.buttons[i]
            const bx = BTNS_CENTER_X_OFFSET
            const by = BTNS_START_Y + i * (BTN_H + BTN_GAP)
            const isHovered = i === this._hoveredIndex
            fillRect(ctx, bx, by, BTN_W, BTN_H, isHovered ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
            strokeRect(ctx, bx, by, BTN_W, BTN_H, FALLOUT_GREEN, 1)
            ctx.font = 'bold 11px monospace'
            ctx.fillStyle = cssColor(isHovered ? FALLOUT_BLACK : FALLOUT_AMBER)
            ctx.textAlign = 'center'
            // Show number hint so player knows keyboard shortcut
            ctx.fillText(`${i + 1}. ${btn.label}`, bx + BTN_W / 2, by + 18)
            ctx.textAlign = 'left'
        }

        // Close / Cancel
        const cancelY = height - 34
        const cancelX = (width - BTN_W) / 2
        fillRect(ctx, cancelX, cancelY, BTN_W, 22, FALLOUT_DARK_GRAY)
        strokeRect(ctx, cancelX, cancelY, BTN_W, 22, FALLOUT_GREEN, 1)
        ctx.font = '11px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('CANCEL', cancelX + BTN_W / 2, cancelY + 15)
        ctx.textAlign = 'left'
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width, height } = this.bounds

        // Cancel button
        const cancelX = (width - BTN_W) / 2
        const cancelY = height - 34
        if (x >= cancelX && x < cancelX + BTN_W && y >= cancelY && y < cancelY + 22) {
            this.hide()
            return true
        }

        // Floor buttons
        for (let i = 0; i < this.buttons.length; i++) {
            const bx = BTNS_CENTER_X_OFFSET
            const by = BTNS_START_Y + i * (BTN_H + BTN_GAP)
            if (x >= bx && x < bx + BTN_W && y >= by && y < by + BTN_H) {
                const btn = this.buttons[i]
                EventBus.emit('elevator:buttonPressed', {
                    mapID:   btn.mapID,
                    level:   btn.level,
                    tileNum: btn.tileNum,
                })
                this.hide()
                return true
            }
        }

        return true
    }

    override onMouseMove(x: number, y: number): void {
        for (let i = 0; i < this.buttons.length; i++) {
            const bx = BTNS_CENTER_X_OFFSET
            const by = BTNS_START_Y + i * (BTN_H + BTN_GAP)
            if (x >= bx && x < bx + BTN_W && y >= by && y < by + BTN_H) {
                this._hoveredIndex = i
                return
            }
        }
        this._hoveredIndex = -1
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape') {
            this.hide()
            return true
        }
        // Number keys 1–9 select a floor button directly
        const digit = parseInt(key)
        if (!isNaN(digit) && digit >= 1 && digit <= this.buttons.length) {
            const btn = this.buttons[digit - 1]
            EventBus.emit('elevator:buttonPressed', {
                mapID:   btn.mapID,
                level:   btn.level,
                tileNum: btn.tileNum,
            })
            this.hide()
            return true
        }
        return false
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// (cssColor / fillRect / strokeRect now live in uiPanel.ts)
