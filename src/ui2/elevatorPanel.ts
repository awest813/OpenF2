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

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, fillRect, strokeRect, drawUIFontText } from './uiPanel.js'
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
    /** Vertical stride between floor buttons and the CANCEL row top,
     *  recomputed by openWith() from the button count. */
    private _cancelY = PANEL_HEIGHT - 34

    constructor(screenWidth: number, screenHeight: number) {
        super('elevator', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 35
        this._screenHeight = screenHeight
    }

    private _screenHeight: number

    /** Load elevator buttons and show the panel. */
    openWith(buttons: ElevatorButton[]): void {
        this.buttons = buttons.slice()
        this._hoveredIndex = -1
        this._relayout()
        this.show()
    }

    /**
     * Grow the panel so every floor button fits above CANCEL. With more than
     * 5 buttons the fixed 300px height makes button 6 overlap CANCEL and
     * button 7 spill outside the panel entirely.
     */
    private _relayout(): void {
        const needed = BTNS_START_Y +
            this.buttons.length * (BTN_H + BTN_GAP) - BTN_GAP +
            8 +   // gap above cancel
            22 +   // cancel height
            12     // bottom margin
        const height = Math.max(PANEL_HEIGHT, needed)
        this._cancelY = height - 34
        this.bounds = {
            x: this.bounds.x,
            y: Math.max(0, Math.floor((this._screenHeight - height) / 2)),
            width: PANEL_WIDTH,
            height,
        }
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title
        drawUIFontText(ctx, 'ELEVATOR', width / 2, 24, FALLOUT_GREEN, 12, { align: 'center', bold: true })

        drawUIFontText(ctx, 'Select floor', width / 2, 38, FALLOUT_DARK_GRAY, 9, { align: 'center' })

        // Floor buttons
        for (let i = 0; i < this.buttons.length; i++) {
            const btn = this.buttons[i]
            const bx = BTNS_CENTER_X_OFFSET
            const by = BTNS_START_Y + i * (BTN_H + BTN_GAP)
            const isHovered = i === this._hoveredIndex
            fillRect(ctx, bx, by, BTN_W, BTN_H, isHovered ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
            strokeRect(ctx, bx, by, BTN_W, BTN_H, FALLOUT_GREEN, 1)
            // Show number hint so player knows keyboard shortcut
            drawUIFontText(ctx, `${i + 1}. ${btn.label}`, bx + BTN_W / 2, by + 18,
                isHovered ? FALLOUT_BLACK : FALLOUT_AMBER, 11, { align: 'center', bold: true })
        }

        // Close / Cancel
        const cancelY = this._cancelY
        const cancelX = (width - BTN_W) / 2
        fillRect(ctx, cancelX, cancelY, BTN_W, 22, FALLOUT_DARK_GRAY)
        strokeRect(ctx, cancelX, cancelY, BTN_W, 22, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, 'CANCEL', cancelX + BTN_W / 2, cancelY + 15, FALLOUT_GREEN, 11, { align: 'center' })
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width } = this.bounds

        // Cancel button
        const cancelX = (width - BTN_W) / 2
        const cancelY = this._cancelY
        if (x >= cancelX && x < cancelX + BTN_W && y >= cancelY && y < cancelY + 22) {
            this._close()
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
            this._close()
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

    /** Close and notify listeners (parity with worldMap:closed). */
    private _close(): void {
        EventBus.emit('elevator:closed', {})
        this.hide()
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// (cssColor / fillRect / strokeRect now live in uiPanel.ts)
