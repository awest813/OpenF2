/**
 * InventoryPanel — WebGL-rendered inventory screen.
 *
 * Replaces the legacy DOM-based uiInventoryScreen with a ui2 panel rendered
 * entirely via the OffscreenCanvas pipeline.
 *
 * Displays the player's inventory as a scrollable list and shows the two
 * hand slots at the top.  Clicking an item opens a small context row with
 * USE / DROP / CANCEL actions.  Items in hand slots can also be dropped.
 *
 * EventBus events emitted:
 *   'inventory:useItem'  — { index } — player clicked USE on inventory item
 *   'inventory:dropItem' — { index } — player clicked DROP on inventory item
 *
 * Panel name: 'inventory'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, FALLOUT_RED, UIColor } from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 400
const PANEL_HEIGHT = 360
const LIST_X       = 16
const LIST_Y       = 80
const LIST_W       = 260
const ITEM_ROW_H   = 22
const MAX_ROWS     = 10
const MAX_ITEM_NAME_LEN = 24
const BTN_W        = 52
const BTN_H        = 20
const CLOSE_BTN_W  = 60
const CLOSE_BTN_H  = 22
const SLOT_W       = 120
const SLOT_H       = 40

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InventoryItem {
    name: string
    amount: number
    canUse: boolean
}

// ---------------------------------------------------------------------------
// InventoryPanel
// ---------------------------------------------------------------------------

export class InventoryPanel extends UIPanel {
    items: InventoryItem[] = []
    /** Item in the left hand slot (null = empty). */
    leftHand: InventoryItem | null = null
    /** Item in the right hand slot (null = empty). */
    rightHand: InventoryItem | null = null

    private _scrollOffset = 0
    private _selectedIndex = -1  // -1 = none

    constructor(screenWidth: number, screenHeight: number) {
        super('inventory', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 20
    }

    protected override onShow(): void {
        this._selectedIndex = -1
        this._scrollOffset  = 0
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
        ctx.fillText('INVENTORY', width / 2, 18)
        ctx.textAlign = 'left'

        // Hand slots
        drawSlot(ctx, 'LEFT HAND',  16,          30, SLOT_W, SLOT_H, this.leftHand)
        drawSlot(ctx, 'RIGHT HAND', 16 + SLOT_W + 8, 30, SLOT_W, SLOT_H, this.rightHand)

        // Item list header
        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('ITEMS', LIST_X, LIST_Y - 4)

        strokeRect(ctx, LIST_X, LIST_Y, LIST_W, MAX_ROWS * ITEM_ROW_H, FALLOUT_DARK_GRAY, 1)

        // Items
        const visibleItems = this.items.slice(this._scrollOffset, this._scrollOffset + MAX_ROWS)
        for (let i = 0; i < visibleItems.length; i++) {
            const item = visibleItems[i]
            const absIdx = i + this._scrollOffset
            const iy = LIST_Y + i * ITEM_ROW_H
            const isSelected = absIdx === this._selectedIndex
            if (isSelected) {
                fillRect(ctx, LIST_X + 2, iy + 2, LIST_W - 4, ITEM_ROW_H - 2, FALLOUT_DARK_GRAY)
            }
            ctx.font = '10px monospace'
            ctx.fillStyle = cssColor(isSelected ? FALLOUT_AMBER : FALLOUT_GREEN)
            const label = item.name.length > MAX_ITEM_NAME_LEN ? item.name.slice(0, MAX_ITEM_NAME_LEN) : item.name
            ctx.fillText(`${label}  x${item.amount}`, LIST_X + 6, iy + 14)
        }

        // Context buttons when item is selected
        if (this._selectedIndex >= 0 && this._selectedIndex < this.items.length) {
            const item = this.items[this._selectedIndex]
            const ctxX = LIST_X + LIST_W + 8
            const ctxY = LIST_Y

            ctx.font = '9px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText('ACTION', ctxX, ctxY - 4)

            if (item.canUse) {
                drawCtxBtn(ctx, 'USE',  ctxX, ctxY,      BTN_W, BTN_H)
            }
            drawCtxBtn(ctx, 'DROP', ctxX, ctxY + 28, BTN_W, BTN_H)
            drawCtxBtn(ctx, 'X',   ctxX, ctxY + 56, BTN_H, BTN_H)
        }

        // Scroll hint
        if (this.items.length > MAX_ROWS) {
            ctx.font = '9px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText(`↑↓ scroll (${this._scrollOffset + 1}-${Math.min(this._scrollOffset + MAX_ROWS, this.items.length)}/${this.items.length})`,
                LIST_X, LIST_Y + MAX_ROWS * ITEM_ROW_H + 12)
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

        // Close button
        const closeBtnX = width / 2 - CLOSE_BTN_W / 2
        const closeBtnY = height - 34
        if (x >= closeBtnX && x < closeBtnX + CLOSE_BTN_W && y >= closeBtnY && y < closeBtnY + CLOSE_BTN_H) {
            this.hide()
            return true
        }

        // Context buttons (when an item is selected)
        if (this._selectedIndex >= 0 && this._selectedIndex < this.items.length) {
            const item = this.items[this._selectedIndex]
            const ctxX = LIST_X + LIST_W + 8
            const ctxY = LIST_Y
            if (x >= ctxX && x < ctxX + BTN_W) {
                if (item.canUse && y >= ctxY && y < ctxY + BTN_H) {
                    EventBus.emit('inventory:useItem', { index: this._selectedIndex })
                    this._selectedIndex = -1
                    return true
                }
                if (y >= ctxY + 28 && y < ctxY + 28 + BTN_H) {
                    EventBus.emit('inventory:dropItem', { index: this._selectedIndex })
                    this.items.splice(this._selectedIndex, 1)
                    this._selectedIndex = -1
                    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, this.items.length - MAX_ROWS))
                    return true
                }
                if (y >= ctxY + 56 && y < ctxY + 56 + BTN_H) {
                    this._selectedIndex = -1
                    return true
                }
            }
        }

        // Item list
        if (x >= LIST_X && x < LIST_X + LIST_W && y >= LIST_Y && y < LIST_Y + MAX_ROWS * ITEM_ROW_H) {
            const row = Math.floor((y - LIST_Y) / ITEM_ROW_H)
            const absIdx = row + this._scrollOffset
            if (absIdx >= 0 && absIdx < this.items.length) {
                this._selectedIndex = (this._selectedIndex === absIdx) ? -1 : absIdx
            }
            return true
        }

        return true
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape' || key === 'i' || key === 'I') {
            this.hide()
            return true
        }
        if (key === 'ArrowDown') {
            if (this.items.length === 0) return true
            // Move selection down; initialise to first item when nothing is selected.
            const next = this._selectedIndex < 0 ? 0 : Math.min(this._selectedIndex + 1, this.items.length - 1)
            this._selectedIndex = next
            // Auto-scroll so the selected item stays visible.
            if (this._selectedIndex >= this._scrollOffset + MAX_ROWS) {
                this._scrollOffset = this._selectedIndex - MAX_ROWS + 1
            }
            return true
        }
        if (key === 'ArrowUp') {
            if (this.items.length === 0) return true
            if (this._selectedIndex < 0) return true
            const next = Math.max(this._selectedIndex - 1, 0)
            this._selectedIndex = next
            // Auto-scroll so the selected item stays visible.
            if (this._selectedIndex < this._scrollOffset) {
                this._scrollOffset = this._selectedIndex
            }
            return true
        }
        // Enter triggers the primary action on the selected item (USE if available).
        if (key === 'Enter') {
            if (this._selectedIndex >= 0 && this._selectedIndex < this.items.length) {
                const item = this.items[this._selectedIndex]
                if (item.canUse) {
                    EventBus.emit('inventory:useItem', { index: this._selectedIndex })
                    // Keep selection clamped to the list so multiple uses in sequence work without re-selecting.
                    this._selectedIndex = Math.min(this._selectedIndex, this.items.length - 1)
                }
            }
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

function drawSlot(
    ctx: OffscreenCanvasRenderingContext2D,
    label: string,
    x: number, y: number, w: number, h: number,
    item: InventoryItem | null,
): void {
    strokeRect(ctx, x, y, w, h, FALLOUT_DARK_GRAY, 1)
    ctx.font = '8px monospace'
    ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
    ctx.fillText(label, x + 4, y + 10)
    if (item) {
        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        const name = item.name.length > 12 ? item.name.slice(0, 12) : item.name
        ctx.fillText(name, x + 4, y + 26)
    } else {
        ctx.font = '8px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('[empty]', x + 4, y + 26)
    }
}

function drawCtxBtn(
    ctx: OffscreenCanvasRenderingContext2D,
    label: string,
    x: number, y: number, w: number, h: number,
): void {
    fillRect(ctx, x, y, w, h, FALLOUT_DARK_GRAY)
    strokeRect(ctx, x, y, w, h, FALLOUT_GREEN, 1)
    ctx.font = '10px monospace'
    ctx.fillStyle = cssColor(FALLOUT_GREEN)
    ctx.textAlign = 'center'
    ctx.fillText(label, x + w / 2, y + 13)
    ctx.textAlign = 'left'
}
