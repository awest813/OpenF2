/**
 * InventoryPanel — WebGL-rendered inventory screen.
 *
 * Replaces the legacy DOM-based uiInventoryScreen with a ui2 panel rendered
 * entirely via the OffscreenCanvas pipeline.
 *
 * Displays the player's inventory as a scrollable list and shows the two
 * hand slots at the top.  Clicking an item opens a small context row with
 * USE / DROP / CANCEL actions.
 *
 * EventBus events emitted:
 *   'inventory:useItem'  — { index } — player clicked USE on inventory item
 *   'inventory:dropItem' — { index } — player clicked DROP on inventory item
 *
 * Panel name: 'inventory'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, FALLOUT_HOVER, UIColor, fillRect, strokeRect, drawUIFontText } from './uiPanel.js'
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
    /** Prototype PID of the source item (used by engine consumers of
     *  'inventory:useItem' to resolve the live inventory entry). */
    pid?: number
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
    private _hoveredIndex = -1   // -1 = none

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
        this._hoveredIndex  = -1
        this._scrollOffset  = 0
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title
        drawUIFontText(ctx, 'INVENTORY', width / 2, 18, FALLOUT_GREEN, 12, { align: 'center', bold: true })

        // Hand slots
        drawSlot(ctx, 'LEFT HAND',  16,          30, SLOT_W, SLOT_H, this.leftHand)
        drawSlot(ctx, 'RIGHT HAND', 16 + SLOT_W + 8, 30, SLOT_W, SLOT_H, this.rightHand)

        // Item list header
        drawUIFontText(ctx, 'ITEMS', LIST_X, LIST_Y - 4, FALLOUT_DARK_GRAY, 9)

        strokeRect(ctx, LIST_X, LIST_Y, LIST_W, MAX_ROWS * ITEM_ROW_H, FALLOUT_DARK_GRAY, 1)

        // Items
        const visibleItems = this.items.slice(this._scrollOffset, this._scrollOffset + MAX_ROWS)
        for (let i = 0; i < visibleItems.length; i++) {
            const item = visibleItems[i]
            const absIdx = i + this._scrollOffset
            const iy = LIST_Y + i * ITEM_ROW_H
            const isSelected = absIdx === this._selectedIndex
            const isHovered  = absIdx === this._hoveredIndex
            if (isSelected) {
                fillRect(ctx, LIST_X + 2, iy + 2, LIST_W - 4, ITEM_ROW_H - 2, FALLOUT_DARK_GRAY)
            } else if (isHovered) {
                fillRect(ctx, LIST_X + 2, iy + 2, LIST_W - 4, ITEM_ROW_H - 2, FALLOUT_HOVER)
            }
            const textColor: UIColor = isSelected ? FALLOUT_AMBER : FALLOUT_GREEN
            const label = item.name.length > MAX_ITEM_NAME_LEN
                ? item.name.slice(0, MAX_ITEM_NAME_LEN - 1) + '…'
                : item.name
            drawUIFontText(ctx, `${label}  x${item.amount}`, LIST_X + 6, iy + 14, textColor, 10)
        }

        // Context buttons when item is selected
        if (this._selectedIndex >= 0 && this._selectedIndex < this.items.length) {
            const item = this.items[this._selectedIndex]
            const ctxX = LIST_X + LIST_W + 8
            const ctxY = LIST_Y

            drawUIFontText(ctx, 'ACTION', ctxX, ctxY - 4, FALLOUT_DARK_GRAY, 9)

            if (item.canUse) {
                drawCtxBtn(ctx, 'USE',  ctxX, ctxY,      BTN_W, BTN_H)
            }
            drawCtxBtn(ctx, 'DROP', ctxX, ctxY + 28, BTN_W, BTN_H)
            drawCtxBtn(ctx, 'X',   ctxX, ctxY + 56, BTN_H, BTN_H)
        }

        // Scroll hint
        if (this.items.length > MAX_ROWS) {
            drawUIFontText(ctx, `↑↓ scroll (${this._scrollOffset + 1}-${Math.min(this._scrollOffset + MAX_ROWS, this.items.length)}/${this.items.length})`,
                LIST_X, LIST_Y + MAX_ROWS * ITEM_ROW_H + 12, FALLOUT_DARK_GRAY, 9)
        }

        // Close button
        const closeBtnX = width / 2 - CLOSE_BTN_W / 2
        const closeBtnY = height - 34
        fillRect(ctx, closeBtnX, closeBtnY, CLOSE_BTN_W, CLOSE_BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, closeBtnX, closeBtnY, CLOSE_BTN_W, CLOSE_BTN_H, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, 'CLOSE', width / 2, closeBtnY + 15, FALLOUT_GREEN, 11, { align: 'center' })
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
                    this._afterListMutation()
                    return true
                }
                if (y >= ctxY + 28 && y < ctxY + 28 + BTN_H) {
                    EventBus.emit('inventory:dropItem', { index: this._selectedIndex })
                    this.items.splice(this._selectedIndex, 1)
                    this._selectedIndex = -1
                    this._afterListMutation()
                    return true
                }
            }
            // The X (cancel) button is square (BTN_H wide) — hit-test only
            // what is actually drawn.
            if (x >= ctxX && x < ctxX + BTN_H && y >= ctxY + 56 && y < ctxY + 56 + BTN_H) {
                this._selectedIndex = -1
                return true
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

        // Clicked outside list and buttons — clear selection
        this._selectedIndex = -1
        return true
    }

    override onMouseMove(x: number, y: number): void {
        if (x >= LIST_X && x < LIST_X + LIST_W && y >= LIST_Y && y < LIST_Y + MAX_ROWS * ITEM_ROW_H) {
            const row = Math.floor((y - LIST_Y) / ITEM_ROW_H)
            const absIdx = row + this._scrollOffset
            if (absIdx >= 0 && absIdx < this.items.length) {
                this._hoveredIndex = absIdx
                return
            }
        }
        this._hoveredIndex = -1
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape' || key === 'i' || key === 'I') {
            this.hide()
            return true
        }
        if (key === 'ArrowDown') {
            if (this.items.length === 0) {return true}
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
            if (this.items.length === 0) {return true}
            // Move selection up; initialise to last item when nothing is
            // selected (symmetric with ArrowDown initialising to first).
            const next = this._selectedIndex < 0
                ? this.items.length - 1
                : Math.max(this._selectedIndex - 1, 0)
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
                    this._afterListMutation()
                }
            }
            return true
        }
        // Delete key drops the selected item (keyboard alternative to clicking DROP).
        // NOTE: mirrors mouse-click DROP which also splices items immediately after emitting
        // the event, keeping panel state consistent regardless of engine acknowledgement.
        if (key === 'Delete') {
            if (this._selectedIndex >= 0 && this._selectedIndex < this.items.length) {
                EventBus.emit('inventory:dropItem', { index: this._selectedIndex })
                this.items.splice(this._selectedIndex, 1)
                this._selectedIndex = Math.min(this._selectedIndex, this.items.length - 1)
                this._afterListMutation()
            }
            return true
        }
        return false
    }

    /** Re-clamp selection/scroll after the item list may have changed. */
    private _afterListMutation(): void {
        this._selectedIndex = Math.min(this._selectedIndex, this.items.length - 1)
        this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, Math.max(0, this.items.length - MAX_ROWS)))
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// (cssColor / fillRect / strokeRect now live in uiPanel.ts)

function drawSlot(
    ctx: OffscreenCanvasRenderingContext2D,
    label: string,
    x: number, y: number, w: number, h: number,
    item: InventoryItem | null,
): void {
    strokeRect(ctx, x, y, w, h, FALLOUT_DARK_GRAY, 1)
    drawUIFontText(ctx, label, x + 4, y + 10, FALLOUT_DARK_GRAY, 8)
    if (item) {
        const name = item.name.length > 12 ? item.name.slice(0, 11) + '…' : item.name
        drawUIFontText(ctx, name, x + 4, y + 26, FALLOUT_GREEN, 9)
    } else {
        drawUIFontText(ctx, '[empty]', x + 4, y + 26, FALLOUT_DARK_GRAY, 8)
    }
}

function drawCtxBtn(
    ctx: OffscreenCanvasRenderingContext2D,
    label: string,
    x: number, y: number, w: number, h: number,
): void {
    fillRect(ctx, x, y, w, h, FALLOUT_DARK_GRAY)
    strokeRect(ctx, x, y, w, h, FALLOUT_GREEN, 1)
    drawUIFontText(ctx, label, x + w / 2, y + 13, FALLOUT_GREEN, 10, { align: 'center' })
}
