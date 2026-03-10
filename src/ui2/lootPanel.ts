/**
 * LootPanel — WebGL-rendered loot container interface.
 *
 * Replaces the legacy DOM-based uiLoot / uiEndLoot with a ui2 panel
 * rendered entirely via the OffscreenCanvas pipeline.
 *
 * Displays the container's inventory on the right and the player's inventory
 * on the left.  Items can be moved between sides by clicking.  A TAKE ALL
 * button moves the entire container inventory into the player's inventory at
 * once.  Closing the panel fires EventBus event 'loot:closed'.
 *
 * Panel name: 'loot'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, UIColor } from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 460
const PANEL_HEIGHT = 320
const COL_W        = 160
const COL_H        = 220
const ITEM_ROW_H   = 20
const MAX_ITEM_NAME_LEN = 16
const COL_PAD      = 16
const BTN_W        = 80
const BTN_H        = 22
const COL_Y        = 42

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LootItem {
    name: string
    amount: number
}

// ---------------------------------------------------------------------------
// LootPanel
// ---------------------------------------------------------------------------

export class LootPanel extends UIPanel {
    /** Working copy of the player's inventory during looting. */
    playerInventory: LootItem[] = []
    /** Working copy of the container's inventory. */
    containerInventory: LootItem[] = []

    private _selectedSide: 'player' | 'container' | null = null
    private _selectedIndex = -1

    constructor(screenWidth: number, screenHeight: number) {
        super('loot', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 30
    }

    /** Populate inventories and show the panel. */
    openWith(playerInventory: LootItem[], containerInventory: LootItem[]): void {
        this.playerInventory    = playerInventory.map(i => ({ ...i }))
        this.containerInventory = containerInventory.map(i => ({ ...i }))
        this._selectedSide  = null
        this._selectedIndex = -1
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
        ctx.fillText('LOOT', width / 2, 18)
        ctx.textAlign = 'left'

        // Column headers
        const playerX    = COL_PAD
        const containerX = width - COL_PAD - COL_W
        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('YOUR INVENTORY',  playerX,    COL_Y - 6)
        ctx.fillText('CONTAINER',        containerX, COL_Y - 6)

        // Draw inventory columns
        this._drawColumn(ctx, playerX,    COL_Y, this.playerInventory,    'player')
        this._drawColumn(ctx, containerX, COL_Y, this.containerInventory, 'container')

        // Arrow hint
        ctx.font = '14px monospace'
        ctx.fillStyle = cssColor(FALLOUT_AMBER)
        ctx.textAlign = 'center'
        ctx.fillText('←  →', width / 2, COL_Y + COL_H / 2)
        ctx.textAlign = 'left'

        // TAKE ALL button
        const takeAllX = width / 2 - BTN_W - 4
        const btnY = height - 36
        fillRect(ctx, takeAllX, btnY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, takeAllX, btnY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        ctx.font = '10px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('TAKE ALL', takeAllX + BTN_W / 2, btnY + 15)

        // CLOSE button
        const closeX = width / 2 + 4
        fillRect(ctx, closeX, btnY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, closeX, btnY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        ctx.fillText('CLOSE', closeX + BTN_W / 2, btnY + 15)
        ctx.textAlign = 'left'
    }

    private _drawColumn(
        ctx: OffscreenCanvasRenderingContext2D,
        x: number, y: number,
        items: LootItem[],
        side: 'player' | 'container',
    ): void {
        const maxVisible = Math.floor((COL_H - 8) / ITEM_ROW_H)
        strokeRect(ctx, x, y, COL_W, COL_H, FALLOUT_DARK_GRAY, 1)
        const visibleCount = Math.min(items.length, maxVisible)
        for (let i = 0; i < visibleCount; i++) {
            const item = items[i]
            const iy = y + 4 + i * ITEM_ROW_H
            const isSelected = this._selectedSide === side && this._selectedIndex === i
            if (isSelected) {
                fillRect(ctx, x + 2, iy - 2, COL_W - 4, ITEM_ROW_H, FALLOUT_DARK_GRAY)
            }
            ctx.font = '9px monospace'
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            const label = item.name.length > MAX_ITEM_NAME_LEN ? item.name.slice(0, MAX_ITEM_NAME_LEN) : item.name
            ctx.fillText(`${label} x${item.amount}`, x + 4, iy + 11)
        }
        // Overflow indicator: show how many items are hidden below the fold.
        if (items.length > maxVisible) {
            const hiddenCount = items.length - maxVisible
            ctx.font = '8px monospace'
            ctx.fillStyle = cssColor(FALLOUT_AMBER)
            ctx.fillText(`+${hiddenCount} more`, x + 4, y + COL_H - 4)
        }
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width, height } = this.bounds
        const playerX    = COL_PAD
        const containerX = width - COL_PAD - COL_W
        const btnY = height - 36

        // TAKE ALL
        const takeAllX = width / 2 - BTN_W - 4
        if (x >= takeAllX && x < takeAllX + BTN_W && y >= btnY && y < btnY + BTN_H) {
            this._takeAll()
            return true
        }

        // CLOSE
        const closeX = width / 2 + 4
        if (x >= closeX && x < closeX + BTN_W && y >= btnY && y < btnY + BTN_H) {
            this._close()
            return true
        }

        // Player column click
        if (x >= playerX && x < playerX + COL_W && y >= COL_Y && y < COL_Y + COL_H) {
            const idx = Math.floor((y - COL_Y - 4) / ITEM_ROW_H)
            if (idx >= 0 && idx < this.playerInventory.length) {
                if (this._selectedSide === 'player' && this._selectedIndex === idx) {
                    this._selectedSide  = null
                    this._selectedIndex = -1
                } else if (this._selectedSide === 'container') {
                    // Move selected container item to player
                    this._moveItem('container', this._selectedIndex, 'player')
                    this._selectedSide  = null
                    this._selectedIndex = -1
                } else {
                    this._selectedSide  = 'player'
                    this._selectedIndex = idx
                }
            }
            return true
        }

        // Container column click
        if (x >= containerX && x < containerX + COL_W && y >= COL_Y && y < COL_Y + COL_H) {
            const idx = Math.floor((y - COL_Y - 4) / ITEM_ROW_H)
            if (idx >= 0 && idx < this.containerInventory.length) {
                if (this._selectedSide === 'container' && this._selectedIndex === idx) {
                    this._selectedSide  = null
                    this._selectedIndex = -1
                } else if (this._selectedSide === 'player') {
                    // Move selected player item to container
                    this._moveItem('player', this._selectedIndex, 'container')
                    this._selectedSide  = null
                    this._selectedIndex = -1
                } else {
                    this._selectedSide  = 'container'
                    this._selectedIndex = idx
                }
            }
            return true
        }

        return true
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape') {
            this._close()
            return true
        }
        // Tab switches the active column (container → player or player → container).
        if (key === 'Tab') {
            if (this._selectedSide === 'container') {
                this._selectedSide  = 'player'
                this._selectedIndex = this.playerInventory.length > 0 ? 0 : -1
            } else {
                this._selectedSide  = 'container'
                this._selectedIndex = this.containerInventory.length > 0 ? 0 : -1
            }
            return true
        }
        // Arrow keys navigate within the focused column.
        if (key === 'ArrowDown' || key === 'ArrowUp') {
            const side = this._selectedSide ?? 'container'
            const items = side === 'player' ? this.playerInventory : this.containerInventory
            if (items.length === 0) {return true}
            const delta = key === 'ArrowDown' ? 1 : -1
            const next  = this._selectedIndex < 0
                ? (delta > 0 ? 0 : items.length - 1)
                : Math.max(0, Math.min(items.length - 1, this._selectedIndex + delta))
            this._selectedSide  = side
            this._selectedIndex = next
            return true
        }
        // Enter transfers the selected item to the other column.
        if (key === 'Enter') {
            if (this._selectedSide && this._selectedIndex >= 0) {
                const dest: 'player' | 'container' = this._selectedSide === 'player' ? 'container' : 'player'
                this._moveItem(this._selectedSide, this._selectedIndex, dest)
                // Keep selection within the (now shorter) source list.
                const remaining = this._selectedSide === 'player' ? this.playerInventory : this.containerInventory
                this._selectedIndex = Math.min(this._selectedIndex, remaining.length - 1)
                if (this._selectedIndex < 0) {this._selectedSide = null}
            }
            return true
        }
        return false
    }

    private _moveItem(
        fromSide: 'player' | 'container',
        fromIdx: number,
        toSide: 'player' | 'container',
    ): void {
        const from = fromSide === 'player' ? this.playerInventory : this.containerInventory
        const to   = toSide   === 'player' ? this.playerInventory : this.containerInventory
        const item = from[fromIdx]
        if (!item) {return}

        from.splice(fromIdx, 1)
        const existing = to.find(i => i.name === item.name)
        if (existing) {
            existing.amount += item.amount
        } else {
            to.push({ ...item })
        }
    }

    private _takeAll(): void {
        for (const item of this.containerInventory) {
            const existing = this.playerInventory.find(i => i.name === item.name)
            if (existing) {
                existing.amount += item.amount
            } else {
                this.playerInventory.push({ ...item })
            }
        }
        this.containerInventory = []
    }

    private _close(): void {
        EventBus.emit('loot:closed', {
            playerInventory:    this.playerInventory.slice(),
            containerInventory: this.containerInventory.slice(),
        })
        this.hide()
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
