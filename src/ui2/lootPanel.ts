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

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, FALLOUT_HOVER, fillRect, strokeRect, clampListOffset, drawUIFontText } from './uiPanel.js'
import { EventBus } from '../eventBus.js'
import type { Obj } from '../object.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 460
const PANEL_HEIGHT = 320
const COL_W        = 160
const COL_H        = 220
const ITEM_ROW_H   = 20
/** Rows that actually fit in a column (shared by draw + hit-test). */
const MAX_VISIBLE_ROWS = Math.floor((COL_H - 8) / ITEM_ROW_H)  // = 10
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
    private _hoveredSide: 'player' | 'container' | null = null
    private _hoveredIndex = -1
    /** Per-column scroll offset for lists longer than MAX_VISIBLE_ROWS. */
    private _scrollPlayer = 0
    private _scrollContainer = 0
    /** Live Critter inventories (companion trade) — mutated in lockstep with snapshots. */
    private _livePlayer: Obj[] | null = null
    private _liveContainer: Obj[] | null = null

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
        this._livePlayer = null
        this._liveContainer = null
        this.playerInventory    = playerInventory.map(i => ({ ...i }))
        this.containerInventory = containerInventory.map(i => ({ ...i }))
        this._resetInteractionState()
        this.show()
    }

    /**
     * Open against live Critter inventory arrays (companion trade / corpse loot).
     * Moves mutate the underlying Obj[] as well as the display snapshots.
     */
    openWithLive(playerInventory: Obj[], containerInventory: Obj[]): void {
        this._livePlayer = playerInventory
        this._liveContainer = containerInventory
        this.playerInventory = snapshotLoot(playerInventory)
        this.containerInventory = snapshotLoot(containerInventory)
        this._resetInteractionState()
        this.show()
    }

    private _resetInteractionState(): void {
        this._selectedSide  = null
        this._selectedIndex = -1
        this._hoveredSide   = null
        this._hoveredIndex  = -1
        this._scrollPlayer    = 0
        this._scrollContainer = 0
    }

    /** All close paths funnel here so the loot:closed event fires exactly once. */
    protected override onHide(): void {
        EventBus.emit('loot:closed', {
            playerInventory:    this.playerInventory.slice(),
            containerInventory: this.containerInventory.slice(),
        })
        this._livePlayer = null
        this._liveContainer = null
    }

    private _scrollOffsetFor(side: 'player' | 'container'): number {
        return side === 'player' ? this._scrollPlayer : this._scrollContainer
    }

    /** Clamp a column's scroll offset so the selection stays in view. */
    private _clampScroll(side: 'player' | 'container'): void {
        const items = side === 'player' ? this.playerInventory : this.containerInventory
        const maxOffset = Math.max(0, items.length - MAX_VISIBLE_ROWS)
        const offset = Math.min(this._scrollOffsetFor(side), maxOffset)
        if (side === 'player') {
            this._scrollPlayer = offset
            if (this._selectedSide === 'player') {
                this._scrollPlayer = clampListOffset(this._selectedIndex, offset, MAX_VISIBLE_ROWS)
            }
        } else {
            this._scrollContainer = offset
            if (this._selectedSide === 'container') {
                this._scrollContainer = clampListOffset(this._selectedIndex, offset, MAX_VISIBLE_ROWS)
            }
        }
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title
        drawUIFontText(ctx, this._liveContainer ? 'TRADE' : 'LOOT', width / 2, 18, FALLOUT_GREEN, 12, { align: 'center', bold: true })

        // Column headers
        const playerX    = COL_PAD
        const containerX = width - COL_PAD - COL_W
        drawUIFontText(ctx, 'YOUR INVENTORY', playerX, COL_Y - 6, FALLOUT_DARK_GRAY, 9)
        drawUIFontText(ctx, this._liveContainer ? 'COMPANION' : 'CONTAINER', containerX, COL_Y - 6, FALLOUT_DARK_GRAY, 9)

        // Draw inventory columns
        this._drawColumn(ctx, playerX,    COL_Y, this.playerInventory,    'player')
        this._drawColumn(ctx, containerX, COL_Y, this.containerInventory, 'container')

        // Arrow hint
        drawUIFontText(ctx, '←  →', width / 2, COL_Y + COL_H / 2, FALLOUT_AMBER, 14, { align: 'center' })

        // TAKE ALL button
        const takeAllX = width / 2 - BTN_W - 4
        const btnY = height - 36
        fillRect(ctx, takeAllX, btnY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, takeAllX, btnY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, 'TAKE ALL', takeAllX + BTN_W / 2, btnY + 15, FALLOUT_GREEN, 10, { align: 'center' })

        // CLOSE button
        const closeX = width / 2 + 4
        fillRect(ctx, closeX, btnY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, closeX, btnY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, 'CLOSE', closeX + BTN_W / 2, btnY + 15, FALLOUT_GREEN, 10)
    }

    private _drawColumn(
        ctx: OffscreenCanvasRenderingContext2D,
        x: number, y: number,
        items: LootItem[],
        side: 'player' | 'container',
    ): void {
        strokeRect(ctx, x, y, COL_W, COL_H, FALLOUT_DARK_GRAY, 1)
        const offset = this._scrollOffsetFor(side)
        const visibleCount = Math.min(items.length - offset, MAX_VISIBLE_ROWS)
        for (let i = 0; i < visibleCount; i++) {
            const item = items[offset + i]
            const absIdx = offset + i
            const iy = y + 4 + i * ITEM_ROW_H
            const isSelected = this._selectedSide === side && this._selectedIndex === absIdx
            const isHovered  = this._hoveredSide  === side && this._hoveredIndex  === absIdx
            if (isSelected) {
                fillRect(ctx, x + 2, iy - 2, COL_W - 4, ITEM_ROW_H, FALLOUT_DARK_GRAY)
            } else if (isHovered) {
                fillRect(ctx, x + 2, iy - 2, COL_W - 4, ITEM_ROW_H, FALLOUT_HOVER)
            }
            const label = item.name.length > MAX_ITEM_NAME_LEN
                ? item.name.slice(0, MAX_ITEM_NAME_LEN - 1) + '…'
                : item.name
            drawUIFontText(ctx, `${label} x${item.amount}`, x + 4, iy + 11,
                isSelected || isHovered ? FALLOUT_AMBER : FALLOUT_GREEN, 9)
        }
        // Overflow indicator: show how many items are hidden below the fold.
        const hiddenCount = items.length - offset - MAX_VISIBLE_ROWS
        if (hiddenCount > 0) {
            drawUIFontText(ctx, `+${hiddenCount} more  ↓`, x + 4, y + COL_H - 4, FALLOUT_AMBER, 8)
        } else if (offset > 0) {
            drawUIFontText(ctx, `↑ ${offset} above`, x + 4, y + COL_H - 4, FALLOUT_AMBER, 8)
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
            if (this._selectedSide === 'container') {
                // Move selected container item to player
                this._moveItem('container', this._selectedIndex, 'player')
                this._selectedSide  = null
                this._selectedIndex = -1
                this._clampScroll('container')
                this._clampScroll('player')
            } else {
                const idx = this._clickColumnRow(y, 'player')
                if (idx !== null) {
                    if (this._selectedSide === 'player' && this._selectedIndex === idx) {
                        this._selectedSide  = null
                        this._selectedIndex = -1
                    } else {
                        this._selectedSide  = 'player'
                        this._selectedIndex = idx
                    }
                }
            }
            return true
        }

        // Container column click
        if (x >= containerX && x < containerX + COL_W && y >= COL_Y && y < COL_Y + COL_H) {
            if (this._selectedSide === 'player') {
                // Move selected player item to container
                this._moveItem('player', this._selectedIndex, 'container')
                this._selectedSide  = null
                this._selectedIndex = -1
                this._clampScroll('player')
                this._clampScroll('container')
            } else {
                const idx = this._clickColumnRow(y, 'container')
                if (idx !== null) {
                    if (this._selectedSide === 'container' && this._selectedIndex === idx) {
                        this._selectedSide  = null
                        this._selectedIndex = -1
                    } else {
                        this._selectedSide  = 'container'
                        this._selectedIndex = idx
                    }
                }
            }
            return true
        }

        // Clicked outside columns and buttons — clear selection
        this._selectedSide = null
        this._selectedIndex = -1
        return true
    }

    /**
     * Map a column-local click y to the absolute item index, or null when the
     * click is on empty space / the overflow strip. Clicking the overflow
     * strip scrolls the column instead of selecting anything.
     */
    private _clickColumnRow(y: number, side: 'player' | 'container'): number | null {
        const items = side === 'player' ? this.playerInventory : this.containerInventory
        const offset = this._scrollOffsetFor(side)
        const row = Math.floor((y - COL_Y - 4) / ITEM_ROW_H)
        if (row >= 0 && row < MAX_VISIBLE_ROWS) {
            const absIdx = offset + row
            return absIdx < items.length ? absIdx : null
        }
        // Bottom strip (where "+N more ↓" is drawn) scrolls one page.
        if (items.length - offset > MAX_VISIBLE_ROWS) {
            this._scrollColumn(side, MAX_VISIBLE_ROWS)
        }
        return null
    }

    private _scrollColumn(side: 'player' | 'container', delta: number): void {
        const items = side === 'player' ? this.playerInventory : this.containerInventory
        const maxOffset = Math.max(0, items.length - MAX_VISIBLE_ROWS)
        const next = Math.max(0, Math.min(maxOffset, this._scrollOffsetFor(side) + delta))
        if (side === 'player') {this._scrollPlayer = next}
        else {this._scrollContainer = next}
    }

    override onMouseMove(x: number, y: number): void {
        const { width } = this.bounds
        const playerX    = COL_PAD
        const containerX = width - COL_PAD - COL_W

        // Player column hover
        if (x >= playerX && x < playerX + COL_W && y >= COL_Y && y < COL_Y + COL_H) {
            const row = Math.floor((y - COL_Y - 4) / ITEM_ROW_H)
            if (row >= 0 && row < MAX_VISIBLE_ROWS) {
                const idx = this._scrollPlayer + row
                if (idx < this.playerInventory.length) {
                    this._hoveredSide  = 'player'
                    this._hoveredIndex = idx
                    return
                }
            }
        }
        // Container column hover
        if (x >= containerX && x < containerX + COL_W && y >= COL_Y && y < COL_Y + COL_H) {
            const row = Math.floor((y - COL_Y - 4) / ITEM_ROW_H)
            if (row >= 0 && row < MAX_VISIBLE_ROWS) {
                const idx = this._scrollContainer + row
                if (idx < this.containerInventory.length) {
                    this._hoveredSide  = 'container'
                    this._hoveredIndex = idx
                    return
                }
            }
        }
        this._hoveredSide  = null
        this._hoveredIndex = -1
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
            // Auto-scroll so the selection stays inside the visible window.
            this._clampScroll(side)
            return true
        }
        // PageUp/PageDown scroll the focused column.
        if (key === 'PageUp' || key === 'PageDown') {
            const side = this._selectedSide ?? 'container'
            this._scrollColumn(side, key === 'PageDown' ? MAX_VISIBLE_ROWS : -MAX_VISIBLE_ROWS)
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
                this._clampScroll('player')
                this._clampScroll('container')
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

        if (this._livePlayer && this._liveContainer) {
            liveTransfer(
                fromSide === 'player' ? this._livePlayer : this._liveContainer,
                toSide === 'player' ? this._livePlayer : this._liveContainer,
                item.name,
                item.amount,
            )
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
        this._clampScroll('player')
        this._clampScroll('container')

        if (this._livePlayer && this._liveContainer) {
            while (this._liveContainer.length > 0) {
                const obj = this._liveContainer.shift()!
                const key = lootItemKey(obj)
                const existing = this._livePlayer.find((o) => lootItemKey(o) === key)
                if (existing) {
                    existing.amount = (existing.amount ?? 1) + (obj.amount ?? 1)
                } else {
                    this._livePlayer.push(obj)
                }
            }
        }
    }

    private _close(): void {
        // onHide emits loot:closed and drops the live refs for every close path.
        this.hide()
    }
}

function lootItemKey(obj: { name?: string; pid?: number }): string {
    if (obj.name) {return String(obj.name)}
    if (typeof obj.pid === 'number') {return `pid:${obj.pid}`}
    return '?'
}

function snapshotLoot(inv: Obj[]): LootItem[] {
    return inv.map((i) => ({
        name: lootItemKey(i),
        amount: typeof i.amount === 'number' ? i.amount : 1,
    }))
}

function liveTransfer(from: Obj[], to: Obj[], name: string, amount: number): void {
    const idx = from.findIndex((o) => lootItemKey(o) === name)
    if (idx < 0) {return}
    const obj = from[idx]
    const stack = obj.amount ?? 1
    if (stack > amount) {
        obj.amount = stack - amount
        const clone = Object.assign({}, obj, { amount }) as Obj
        const existing = to.find((o) => lootItemKey(o) === name)
        if (existing) {existing.amount = (existing.amount ?? 1) + amount}
        else {to.push(clone)}
    } else {
        from.splice(idx, 1)
        const existing = to.find((o) => lootItemKey(o) === name)
        if (existing) {existing.amount = (existing.amount ?? 1) + stack}
        else {to.push(obj)}
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// (cssColor / fillRect / strokeRect now live in uiPanel.ts)
