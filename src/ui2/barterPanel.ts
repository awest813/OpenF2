/**
 * BarterPanel — WebGL-rendered barter interface.
 *
 * Replaces the legacy DOM-based uiBarterMode / uiEndBarterMode with a ui2
 * panel rendered entirely via the OffscreenCanvas pipeline.
 *
 * Layout:
 *   Left column  — player's working inventory | player's barter table
 *   Right column — merchant's barter table | merchant's working inventory
 *   Bottom row   — total value indicators, OFFER button, TALK button
 *
 * Item movement is done by clicking an item to select it, then clicking the
 * destination column.  The EventBus event 'barter:offerAccepted' is emitted
 * when the offer succeeds (player value >= merchant value), and
 * 'barter:talkRequested' is emitted when the TALK button is clicked.
 *
 * MIGRATION NOTE: openWithLive() (the production path, used by the bridged
 * uiBarterMode) mutates the real Obj[] inventories in lockstep with the
 * display snapshots and commits accepted offers across sides itself — the
 * same pattern as LootPanel.openWithLive. plain openWith() remains for
 * callers that only have {name, amount, value} snapshots.
 *
 * Panel name: 'barter'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, FALLOUT_RED, FALLOUT_HOVER, fillRect, strokeRect, clampListOffset, drawUIFontText } from './uiPanel.js'
import { EventBus } from '../eventBus.js'
import globalState from '../globalState.js'
import type { Obj } from '../object.js'
import {
    resolveTownIdFromMapName,
    getTownRepValue,
    townRepTier,
    barterPriceMultiplierForTier,
} from '../quest/townReputation.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 560
const PANEL_HEIGHT = 380
const COL_W        = 120
const COL_H        = 140
const COL_PAD      = 10
const ITEM_ROW_H   = 20
/** Rows that actually fit in a column (shared by draw + hit-test). */
const VISIBLE_ROWS = Math.floor((COL_H - 8) / ITEM_ROW_H)  // = 6
const MAX_ITEM_NAME_LEN = 11
const BTN_W        = 70
const BTN_H        = 22

// Column X positions (relative to panel origin)
const LEFT_INV_X  = COL_PAD
const LEFT_TBL_X  = COL_PAD + COL_W + 14
const RIGHT_TBL_X = PANEL_WIDTH - 2 * COL_W - 28
const RIGHT_INV_X = PANEL_WIDTH - COL_W - COL_PAD

const COL_Y = 38

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BarterItem {
    name: string
    amount: number
    /** Monetary value per unit (used for offer calculation). */
    value: number
}

type ColumnId = 'leftInv' | 'leftTbl' | 'rightTbl' | 'rightInv'

interface SelectedItem {
    col: ColumnId
    index: number
}

// ---------------------------------------------------------------------------
// BarterPanel
// ---------------------------------------------------------------------------

export class BarterPanel extends UIPanel {
    /** Working copy of the player's inventory. */
    playerInventory: BarterItem[] = []
    /** Working copy of the merchant's inventory. */
    merchantInventory: BarterItem[] = []
    /** Items the player has put on the table. */
    playerTable: BarterItem[] = []
    /** Items the merchant has put on the table. */
    merchantTable: BarterItem[] = []

    private _selected: SelectedItem | null = null
    /** True while the most recent offer attempt was refused (cleared on next successful offer or openWith). */
    private _offerRefused = false
    /** Currently hovered column + row, for visual feedback. */
    private _hovered: SelectedItem | null = null
    /** Per-column scroll offsets for lists longer than VISIBLE_ROWS. */
    private _scrolls: Record<ColumnId, number> = { leftInv: 0, leftTbl: 0, rightTbl: 0, rightInv: 0 }
    /** Live inventory arrays (openWithLive) — mutated in lockstep with the
     *  display snapshots. The table arrays are panel-owned for the session. */
    private _livePlayerInv: Obj[] | null = null
    private _liveMerchantInv: Obj[] | null = null
    private _livePlayerTbl: Obj[] = []
    private _liveMerchantTbl: Obj[] = []

    constructor(screenWidth: number, screenHeight: number) {
        super('barter', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 30
    }

    /** Load inventories and show the panel. */
    openWith(playerInventory: BarterItem[], merchantInventory: BarterItem[]): void {
        this.playerInventory = playerInventory.map(i => ({ ...i }))
        this.merchantInventory = merchantInventory.map(i => ({ ...i }))
        this.playerTable = []
        this.merchantTable = []
        this._resetInteractionState()
        this.show()
    }

    /**
     * Open against the real Critter inventories (the live production path).
     * Moves mutate the real Obj[] arrays in lockstep with the display
     * snapshots; an accepted offer commits the table items across sides —
     * mirroring legacy uiBarterMode without any lossy name-keyed apply-back.
     */
    openWithLive(playerInventory: Obj[], merchantInventory: Obj[]): void {
        this._livePlayerInv = playerInventory
        this._liveMerchantInv = merchantInventory
        this._livePlayerTbl = []
        this._liveMerchantTbl = []
        this.playerInventory = playerInventory.map(snapshotBarterItem)
        this.merchantInventory = merchantInventory.map(snapshotBarterItem)
        this.playerTable = []
        this.merchantTable = []
        this._resetInteractionState()
        this.show()
    }

    private _resetInteractionState(): void {
        this._selected = null
        this._hovered = null
        this._offerRefused = false
        this._scrolls = { leftInv: 0, leftTbl: 0, rightTbl: 0, rightInv: 0 }
    }

    protected override onHide(): void {
        this._selected = null
        this._hovered = null
        this._livePlayerInv = null
        this._liveMerchantInv = null
        this._livePlayerTbl = []
        this._liveMerchantTbl = []
    }

    /** Clamp every column's scroll offset after list mutations. */
    private _clampAllScrolls(): void {
        for (const col of ['leftInv', 'leftTbl', 'rightTbl', 'rightInv'] as ColumnId[]) {
            const list = this._getList(col)
            const maxOffset = Math.max(0, list.length - VISIBLE_ROWS)
            let offset = Math.min(this._scrolls[col], maxOffset)
            if (this._selected?.col === col) {
                offset = clampListOffset(this._selected.index, offset, VISIBLE_ROWS)
            }
            this._scrolls[col] = offset
        }
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title
        drawUIFontText(ctx, 'BARTER', width / 2, 18, FALLOUT_GREEN, 12, { align: 'center', bold: true })

        // Column headers
        drawHeader(ctx, 'YOUR INV',   LEFT_INV_X,  COL_Y - 14)
        drawHeader(ctx, 'YOUR TABLE', LEFT_TBL_X,  COL_Y - 14)
        drawHeader(ctx, 'THEIR TBL',  RIGHT_TBL_X, COL_Y - 14)
        drawHeader(ctx, 'THEIR INV',  RIGHT_INV_X, COL_Y - 14)

        // Columns
        this._drawColumn(ctx, LEFT_INV_X,  COL_Y, this.playerInventory,  'leftInv')
        this._drawColumn(ctx, LEFT_TBL_X,  COL_Y, this.playerTable,      'leftTbl')
        this._drawColumn(ctx, RIGHT_TBL_X, COL_Y, this.merchantTable,    'rightTbl')
        this._drawColumn(ctx, RIGHT_INV_X, COL_Y, this.merchantInventory,'rightInv')

        // Value totals
        const playerVal   = totalValue(this.playerTable)
        const merchantVal = merchantAskValue(this.merchantTable)
        const btnY = height - 40

        drawUIFontText(ctx, `YOUR: $${playerVal}`, LEFT_INV_X, btnY - 4,
            playerVal >= merchantVal ? FALLOUT_GREEN : FALLOUT_RED, 10)
        drawUIFontText(ctx, `THEIR: $${merchantVal}`, RIGHT_INV_X, btnY - 4, FALLOUT_AMBER, 10)

        // Offer-refused feedback banner — rendered one line above the value labels
        // so it does not overlap them.
        if (this._offerRefused) {
            drawUIFontText(ctx, 'OFFER REFUSED — add more to your table', width / 2, btnY - 18, FALLOUT_RED, 10, { align: 'center' })
        }

        // OFFER button
        const offerX = width / 2 - BTN_W - 6
        fillRect(ctx, offerX, btnY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, offerX, btnY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, 'OFFER', offerX + BTN_W / 2, btnY + 15, FALLOUT_GREEN, 11, { align: 'center' })

        // TALK button
        const talkX = width / 2 + 6
        fillRect(ctx, talkX, btnY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, talkX, btnY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, 'TALK', talkX + BTN_W / 2, btnY + 15, FALLOUT_GREEN, 11)
    }

    private _drawColumn(
        ctx: OffscreenCanvasRenderingContext2D,
        x: number, y: number,
        items: BarterItem[],
        colId: ColumnId,
    ): void {
        strokeRect(ctx, x, y, COL_W, COL_H, FALLOUT_DARK_GRAY, 1)
        const offset = this._scrolls[colId]
        const visibleCount = Math.min(items.length - offset, VISIBLE_ROWS)
        for (let i = 0; i < visibleCount; i++) {
            const item = items[offset + i]
            const absIdx = offset + i
            const iy = y + 4 + i * ITEM_ROW_H
            const isSelected = this._selected?.col === colId && this._selected?.index === absIdx
            const isHovered  = this._hovered?.col  === colId && this._hovered?.index  === absIdx
            if (isSelected) {
                fillRect(ctx, x + 2, iy - 2, COL_W - 4, ITEM_ROW_H, FALLOUT_DARK_GRAY)
            } else if (isHovered) {
                fillRect(ctx, x + 2, iy - 2, COL_W - 4, ITEM_ROW_H, FALLOUT_HOVER)
            }
            const label = item.name.length > MAX_ITEM_NAME_LEN
                ? item.name.slice(0, MAX_ITEM_NAME_LEN - 1) + '…'
                : item.name
            drawUIFontText(ctx, `${label} x${item.amount}`, x + 4, iy + 11,
                isSelected ? FALLOUT_AMBER : FALLOUT_GREEN, 9)
        }
        // Overflow indicators so long inventories are discoverable.
        const hidden = items.length - offset - VISIBLE_ROWS
        if (hidden > 0) {
            drawUIFontText(ctx, `+${hidden} more ↓`, x + 4, y + COL_H - 4, FALLOUT_AMBER, 8)
        } else if (offset > 0) {
            drawUIFontText(ctx, `↑ ${offset} above`, x + 4, y + COL_H - 4, FALLOUT_AMBER, 8)
        }
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { height } = this.bounds
        const btnY = height - 40

        // OFFER button
        const offerX = this.bounds.width / 2 - BTN_W - 6
        if (x >= offerX && x < offerX + BTN_W && y >= btnY && y < btnY + BTN_H) {
            this._tryOffer()
            return true
        }

        // TALK button
        const talkX = this.bounds.width / 2 + 6
        if (x >= talkX && x < talkX + BTN_W && y >= btnY && y < btnY + BTN_H) {
            EventBus.emit('barter:talkRequested', {})
            this.hide()
            return true
        }

        // Column clicks — item selection + movement
        const cols: Array<{ x: number; id: ColumnId; items: BarterItem[] }> = [
            { x: LEFT_INV_X,  id: 'leftInv',  items: this.playerInventory },
            { x: LEFT_TBL_X,  id: 'leftTbl',  items: this.playerTable },
            { x: RIGHT_TBL_X, id: 'rightTbl', items: this.merchantTable },
            { x: RIGHT_INV_X, id: 'rightInv', items: this.merchantInventory },
        ]
        for (const col of cols) {
            if (x >= col.x && x < col.x + COL_W && y >= COL_Y && y < COL_Y + COL_H) {
                const relY = y - COL_Y - 4
                const row = Math.floor(relY / ITEM_ROW_H)
                const offset = this._scrolls[col.id]
                if (row >= 0 && row < VISIBLE_ROWS && offset + row < col.items.length) {
                    const idx = offset + row
                    if (this._selected && this._selected.col === col.id) {
                        // Clicking another row of the same column switches the
                        // selection directly (mirrors the loot panel).
                        this._selected = { col: col.id, index: idx }
                    } else if (this._selected) {
                        this._moveItem(this._selected, col.id)
                        this._selected = null
                        this._hovered = null
                        this._clampAllScrolls()
                    } else {
                        this._selected = { col: col.id, index: idx }
                    }
                } else if (row >= VISIBLE_ROWS && col.items.length - offset > VISIBLE_ROWS) {
                    // Click on the "+N more ↓" strip scrolls one page.
                    this._scrolls[col.id] = Math.min(
                        col.items.length - VISIBLE_ROWS,
                        offset + VISIBLE_ROWS,
                    )
                } else if (this._selected) {
                    this._moveItem(this._selected, col.id)
                    this._selected = null
                    this._hovered = null
                    this._clampAllScrolls()
                }
                return true
            }
        }

        this._selected = null
        return true
    }

    override onMouseMove(x: number, y: number): void {
        const cols: Array<{ x: number; id: ColumnId; items: BarterItem[] }> = [
            { x: LEFT_INV_X,  id: 'leftInv',  items: this.playerInventory },
            { x: LEFT_TBL_X,  id: 'leftTbl',  items: this.playerTable },
            { x: RIGHT_TBL_X, id: 'rightTbl', items: this.merchantTable },
            { x: RIGHT_INV_X, id: 'rightInv', items: this.merchantInventory },
        ]
        for (const col of cols) {
            if (x >= col.x && x < col.x + COL_W && y >= COL_Y && y < COL_Y + COL_H) {
                const relY = y - COL_Y - 4
                const row = Math.floor(relY / ITEM_ROW_H)
                if (row >= 0 && row < VISIBLE_ROWS) {
                    const idx = this._scrolls[col.id] + row
                    if (idx < col.items.length) {
                        this._hovered = { col: col.id, index: idx }
                        return
                    }
                }
            }
        }
        this._hovered = null
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape') {
            EventBus.emit('barter:talkRequested', {})
            this.hide()
            return true
        }
        if (key === 'o' || key === 'O') {
            this._tryOffer()
            return true
        }
        // Tab cycles selection through the four columns in left-to-right order.
        if (key === 'Tab') {
            const order: ColumnId[] = ['leftInv', 'leftTbl', 'rightTbl', 'rightInv']
            const startIdx = this._selected ? order.indexOf(this._selected.col) : -1
            for (let step = 1; step <= order.length; step++) {
                const nextCol = order[(startIdx + step + order.length) % order.length]
                const list = this._getList(nextCol)
                if (list.length > 0) {
                    this._selected = { col: nextCol, index: 0 }
                    return true
                }
            }
            return true
        }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
            if (!this._selected) {return true}
            const list = this._getList(this._selected.col)
            if (list.length === 0) {return true}
            const delta = key === 'ArrowDown' ? 1 : -1
            const next = Math.max(0, Math.min(list.length - 1, this._selected.index + delta))
            this._selected = { col: this._selected.col, index: next }
            // Auto-scroll so the selection stays inside the visible window.
            this._clampAllScrolls()
            return true
        }
        // PageUp/PageDown scroll the selected column.
        if (key === 'PageUp' || key === 'PageDown') {
            if (!this._selected) {return true}
            const list = this._getList(this._selected.col)
            const maxOffset = Math.max(0, list.length - VISIBLE_ROWS)
            const delta = key === 'PageDown' ? VISIBLE_ROWS : -VISIBLE_ROWS
            this._scrolls[this._selected.col] = Math.max(0, Math.min(maxOffset, this._scrolls[this._selected.col] + delta))
            return true
        }
        // Enter moves the selected item across (inv ↔ table).
        if (key === 'Enter') {
            if (this._selected) {
                const dest: ColumnId =
                    this._selected.col === 'leftInv'  ? 'leftTbl'  :
                        this._selected.col === 'leftTbl'  ? 'leftInv'  :
                            this._selected.col === 'rightInv' ? 'rightTbl' : 'rightInv'
                this._moveItem(this._selected, dest)
                this._selected = null
                this._hovered = null
                this._clampAllScrolls()
            }
            return true
        }
        return false
    }

    private _getList(id: ColumnId): BarterItem[] {
        switch (id) {
            case 'leftInv':  return this.playerInventory
            case 'leftTbl':  return this.playerTable
            case 'rightTbl': return this.merchantTable
            case 'rightInv': return this.merchantInventory
        }
    }

    private _moveItem(sel: SelectedItem, destId: ColumnId): void {
        // Enforce ownership rules:
        //  player items (leftInv/leftTbl) can only move between leftInv <-> leftTbl
        //  merchant items (rightInv/rightTbl) can only move between rightInv <-> rightTbl
        const playerSide = sel.col === 'leftInv' || sel.col === 'leftTbl'
        const destPlayerSide = destId === 'leftInv' || destId === 'leftTbl'
        if (playerSide !== destPlayerSide) {return}
        if (sel.col === destId) {return}

        const from = this._getList(sel.col)
        const to   = this._getList(destId)
        const item = from[sel.index]
        if (!item) {return}

        from.splice(sel.index, 1)
        // Merge with existing stack if possible
        const existing = to.find(i => i.name === item.name)
        if (existing) {
            existing.amount += item.amount
        } else {
            to.push({ ...item })
        }

        // Live mode: apply the same move to the real Obj[] arrays.
        this._liveTransfer(this._liveArrayFor(sel.col), this._liveArrayFor(destId), item)
    }

    /** Live array for a column, or null in snapshot mode / for tables pre-open. */
    private _liveArrayFor(col: ColumnId): Obj[] | null {
        switch (col) {
            case 'leftInv':  return this._livePlayerInv
            case 'leftTbl':  return this._livePlayerTbl
            case 'rightTbl': return this._liveMerchantTbl
            case 'rightInv': return this._liveMerchantInv
        }
    }

    /** Mirror a snapshot move onto the live Obj[] arrays (stack-splitting). */
    private _liveTransfer(from: Obj[] | null, to: Obj[] | null, item: BarterItem): void {
        if (!from || !to) {return}
        const idx = from.findIndex((o) => o.name === item.name)
        if (idx < 0) {return}
        const obj = from[idx]
        const stack = obj.amount ?? 1
        if (stack > item.amount) {
            // Split: leave the remainder in the source, move a partial clone.
            obj.amount = stack - item.amount
            const moved = Object.assign({}, obj, { amount: item.amount }) as Obj
            const existing = to.find((o) => o.name === item.name)
            if (existing) {existing.amount = (existing.amount ?? 1) + item.amount}
            else {to.push(moved)}
        } else {
            from.splice(idx, 1)
            const existing = to.find((o) => o.name === item.name)
            if (existing) {existing.amount = (existing.amount ?? 1) + stack}
            else {to.push(obj)}
        }
    }

    private _tryOffer(): void {
        const playerVal   = totalValue(this.playerTable)
        const merchantVal = merchantAskValue(this.merchantTable)
        if (playerVal >= merchantVal) {
            this._offerRefused = false
            if (this._livePlayerInv && this._liveMerchantInv) {
                // Live mode: swap table items across the real inventories,
                // then re-snapshot the working displays (legacy re-clone).
                for (const obj of this._liveMerchantTbl) {this._mergeLiveObj(this._livePlayerInv, obj)}
                for (const obj of this._livePlayerTbl)  {this._mergeLiveObj(this._liveMerchantInv, obj)}
                this._livePlayerTbl = []
                this._liveMerchantTbl = []
                this.playerInventory = this._livePlayerInv.map(snapshotBarterItem)
                this.merchantInventory = this._liveMerchantInv.map(snapshotBarterItem)
            } else {
                // Snapshot mode: commit the exchange in-panel so repeated
                // barter rounds keep accurate ownership state.
                this._mergeItemsInto(this.playerInventory, this.merchantTable)
                this._mergeItemsInto(this.merchantInventory, this.playerTable)
            }

            EventBus.emit('barter:offerAccepted', {
                playerTable:   this.playerTable.slice(),
                merchantTable: this.merchantTable.slice(),
            })
            this.playerTable   = []
            this.merchantTable = []
            this._selected = null
            this._hovered  = null
            this._clampAllScrolls()
        } else {
            this._offerRefused = true
            EventBus.emit('barter:offerRefused', { playerVal, merchantVal })
        }
    }

    /** Merge a live Obj into a real inventory array (stacking by name). */
    private _mergeLiveObj(dest: Obj[], obj: Obj): void {
        const existing = obj.name !== undefined
            ? dest.find((o) => o.name === obj.name)
            : undefined
        if (existing) {existing.amount = (existing.amount ?? 1) + (obj.amount ?? 1)}
        else {dest.push(obj)}
    }

    private _mergeItemsInto(dest: BarterItem[], items: BarterItem[]): void {
        for (const item of items) {
            const existing = dest.find(i => i.name === item.name && i.value === item.value)
            if (existing) {existing.amount += item.amount}
            else {dest.push({ ...item })}
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Display/value snapshot of a real inventory Obj for the barter columns.
 *  Value mirrors legacy totalAmount(): pro.extra.cost per unit. */
function snapshotBarterItem(obj: Obj): BarterItem {
    return {
        name: obj.name ?? (typeof obj.pid === 'number' ? `pid:${obj.pid}` : '?'),
        amount: typeof obj.amount === 'number' ? obj.amount : 1,
        value: (obj as any).pro?.extra?.cost ?? 0,
    }
}

function totalValue(items: BarterItem[]): number {
    return items.reduce((sum, i) => sum + i.value * i.amount, 0)
}

/** Merchant ask total adjusted by current town reputation (P1-7). */
function merchantAskValue(items: BarterItem[]): number {
    const base = totalValue(items)
    const rep = globalState.reputation
    const mapName = (globalState.gMap as any)?.name as string | undefined
    const townId = resolveTownIdFromMapName(mapName)
    if (!rep || !townId) {return base}
    const mult = barterPriceMultiplierForTier(townRepTier(getTownRepValue(rep, townId)))
    return Math.round(base * mult)
}

function drawHeader(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
): void {
    drawUIFontText(ctx, text, x, y + 10, FALLOUT_DARK_GRAY, 9)
}
