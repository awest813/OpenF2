/**
 * SaveLoadPanel — WebGL-rendered save/load dialog.
 *
 * Replaces the legacy DOM-based uiSaveLoad() with a ui2 panel that fits
 * into the OffscreenCanvas pipeline.  Displays a list of numbered save
 * slots and allows the player to select one.  The actual save/load I/O
 * is delegated to the engine via EventBus events.
 *
 * Panel name: 'saveLoad' (matches the HUD_BUTTONS entry in gamePanel.ts).
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor } from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 320
const PANEL_HEIGHT = 280
const SLOT_COUNT = 5
const SLOT_H = 28
const SLOT_START_Y = 60
const SLOT_PAD_X = 14

const CLOSE_BTN_W = 60
const CLOSE_BTN_H = 22

// ---------------------------------------------------------------------------
// SaveLoadPanel
// ---------------------------------------------------------------------------

export class SaveLoadPanel extends UIPanel {
    /** True when the panel is in "save" mode; false for "load". */
    isSave = true
    /** Currently highlighted slot index (-1 = none). */
    selectedSlot = -1

    constructor(screenWidth: number, screenHeight: number) {
        super('saveLoad', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 25
    }

    /** Open the panel in save or load mode. */
    openAs(mode: 'save' | 'load'): void {
        this.isSave = mode === 'save'
        this.selectedSlot = -1
        this.show()
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
        ctx.fillText(this.isSave ? 'SAVE GAME' : 'LOAD GAME', width / 2, 22)

        // Subtitle
        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('Select a slot', width / 2, 40)
        ctx.textAlign = 'left'

        // Slot list
        for (let i = 0; i < SLOT_COUNT; i++) {
            const y = SLOT_START_Y + i * SLOT_H
            const isSelected = i === this.selectedSlot

            fillRect(ctx, SLOT_PAD_X, y, width - SLOT_PAD_X * 2, SLOT_H - 4, isSelected ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
            strokeRect(ctx, SLOT_PAD_X, y, width - SLOT_PAD_X * 2, SLOT_H - 4, FALLOUT_GREEN, 1)

            ctx.font = '12px monospace'
            ctx.fillStyle = isSelected ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
            ctx.fillText(`Slot ${i + 1}`, SLOT_PAD_X + 10, y + 17)
        }

        // Action button (confirm)
        const actionLabel = this.isSave ? 'SAVE' : 'LOAD'
        const actionBtnX = width / 2 - 70
        const actionBtnY = height - 36
        const canAct = this.selectedSlot >= 0
        fillRect(ctx, actionBtnX, actionBtnY, 60, CLOSE_BTN_H, canAct ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
        strokeRect(ctx, actionBtnX, actionBtnY, 60, CLOSE_BTN_H, FALLOUT_GREEN, 1)
        ctx.font = '11px monospace'
        ctx.fillStyle = canAct ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText(actionLabel, actionBtnX + 30, actionBtnY + 15)

        // Close button
        const closeBtnX = width / 2 + 10
        const closeBtnY = height - 36
        fillRect(ctx, closeBtnX, closeBtnY, CLOSE_BTN_W, CLOSE_BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, closeBtnX, closeBtnY, CLOSE_BTN_W, CLOSE_BTN_H, FALLOUT_GREEN, 1)
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText('CLOSE', closeBtnX + CLOSE_BTN_W / 2, closeBtnY + 15)
        ctx.textAlign = 'left'
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width, height } = this.bounds

        // Slot clicks
        for (let i = 0; i < SLOT_COUNT; i++) {
            const sy = SLOT_START_Y + i * SLOT_H
            if (x >= SLOT_PAD_X && x < width - SLOT_PAD_X && y >= sy && y < sy + SLOT_H - 4) {
                this.selectedSlot = i
                return true
            }
        }

        // Action button
        const actionBtnX = width / 2 - 70
        const actionBtnY = height - 36
        if (this.selectedSlot >= 0 &&
            x >= actionBtnX && x < actionBtnX + 60 &&
            y >= actionBtnY && y < actionBtnY + CLOSE_BTN_H) {
            this._confirmAction()
            return true
        }

        // Close button
        const closeBtnX = width / 2 + 10
        const closeBtnY = height - 36
        if (x >= closeBtnX && x < closeBtnX + CLOSE_BTN_W &&
            y >= closeBtnY && y < closeBtnY + CLOSE_BTN_H) {
            this.hide()
            return true
        }

        return true // consume all clicks
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape') {
            this.hide()
            return true
        }
        if (key === 'ArrowDown') {
            this.selectedSlot = Math.min(this.selectedSlot + 1, SLOT_COUNT - 1)
            return true
        }
        if (key === 'ArrowUp') {
            if (this.selectedSlot > 0) {
                this.selectedSlot--
            }
            return true
        }
        if (key === 'Enter' && this.selectedSlot >= 0) {
            this._confirmAction()
            return true
        }
        return false
    }

    private _confirmAction(): void {
        const slot = this.selectedSlot
        EventBus.emit('audio:playSound', { soundId: 'ui_click' })
        this.hide()
        // Emit dedicated save/load events for engine code to subscribe to.
        if (this.isSave) {
            EventBus.emit('game:saveToSlot', { slot })
        } else {
            EventBus.emit('game:loadFromSlot', { slot })
        }
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
