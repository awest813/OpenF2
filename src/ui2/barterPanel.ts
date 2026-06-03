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
 * Panel name: 'barter'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, FALLOUT_RED, cssColor, fillRect, strokeRect } from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 560
const PANEL_HEIGHT = 380
const COL_W        = 120
const COL_H        = 140
const COL_PAD      = 10
const ITEM_ROW_H   = 20
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
        this._selected = null
        this._hovered = null
        this._offerRefused = false
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
        ctx.fillText('BARTER', width / 2, 18)
        ctx.textAlign = 'left'

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
        const merchantVal = totalValue(this.merchantTable)
        const btnY = height - 40

        ctx.font = '10px monospace'
        ctx.fillStyle = cssColor(playerVal >= merchantVal ? FALLOUT_GREEN : FALLOUT_RED)
        ctx.fillText(`YOUR: $${playerVal}`, LEFT_INV_X, btnY - 4)
        ctx.fillStyle = cssColor(FALLOUT_AMBER)
        ctx.fillText(`THEIR: $${merchantVal}`, RIGHT_INV_X, btnY - 4)

        // Offer-refused feedback banner — rendered one line above the value labels
        // so it does not overlap them.
        if (this._offerRefused) {
            ctx.font = '10px monospace'
            ctx.fillStyle = cssColor(FALLOUT_RED)
            ctx.textAlign = 'center'
            ctx.fillText('OFFER REFUSED — add more to your table', width / 2, btnY - 18)
            ctx.textAlign = 'left'
        }

        // OFFER button
        const offerX = width / 2 - BTN_W - 6
        fillRect(ctx, offerX, btnY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, offerX, btnY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        ctx.font = '11px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('OFFER', offerX + BTN_W / 2, btnY + 15)

        // TALK button
        const talkX = width / 2 + 6
        fillRect(ctx, talkX, btnY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, talkX, btnY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        ctx.fillText('TALK', talkX + BTN_W / 2, btnY + 15)
        ctx.textAlign = 'left'
    }

    private _drawColumn(
        ctx: OffscreenCanvasRenderingContext2D,
        x: number, y: number,
        items: BarterItem[],
        colId: ColumnId,
    ): void {
        strokeRect(ctx, x, y, COL_W, COL_H, FALLOUT_DARK_GRAY, 1)
        for (let i = 0; i < items.length && i * ITEM_ROW_H < COL_H - 4; i++) {
            const item = items[i]
            const iy = y + 4 + i * ITEM_ROW_H
            const isSelected = this._selected?.col === colId && this._selected?.index === i
            const isHovered  = this._hovered?.col  === colId && this._hovered?.index  === i
            if (isSelected) {
                fillRect(ctx, x + 2, iy - 2, COL_W - 4, ITEM_ROW_H, FALLOUT_GREEN)
            } else if (isHovered) {
                fillRect(ctx, x + 2, iy - 2, COL_W - 4, ITEM_ROW_H, FALLOUT_DARK_GRAY)
            }
            ctx.font = '9px monospace'
            ctx.fillStyle = cssColor(isSelected ? FALLOUT_BLACK : isHovered ? FALLOUT_AMBER : FALLOUT_GREEN)
            const label = item.name.length > MAX_ITEM_NAME_LEN ? item.name.slice(0, MAX_ITEM_NAME_LEN) : item.name
            ctx.fillText(`${label} x${item.amount}`, x + 4, iy + 11)
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
                const idx = Math.floor(relY / ITEM_ROW_H)
                if (idx >= 0 && idx < col.items.length) {
                    if (this._selected) {
                        this._moveItem(this._selected, col.id)
                        this._selected = null
                    } else {
                        this._selected = { col: col.id, index: idx }
                    }
                } else {
                    if (this._selected) {
                        this._moveItem(this._selected, col.id)
                        this._selected = null
                    }
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
                const idx = Math.floor(relY / ITEM_ROW_H)
                if (idx >= 0 && idx < col.items.length) {
                    this._hovered = { col: col.id, index: idx }
                    return
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
    }

    private _tryOffer(): void {
        const playerVal   = totalValue(this.playerTable)
        const merchantVal = totalValue(this.merchantTable)
        if (playerVal >= merchantVal) {
            this._offerRefused = false
            // Commit the exchange in-panel so repeated barter rounds keep
            // accurate ownership state without requiring an immediate panel
            // rebuild from external event consumers.
            this._mergeItemsInto(this.playerInventory, this.merchantTable)
            this._mergeItemsInto(this.merchantInventory, this.playerTable)

            EventBus.emit('barter:offerAccepted', {
                playerTable:   this.playerTable.slice(),
                merchantTable: this.merchantTable.slice(),
            })
            this.playerTable   = []
            this.merchantTable = []
            this._selected = null
        } else {
            this._offerRefused = true
            EventBus.emit('barter:offerRefused', { playerVal, merchantVal })
        }
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

function totalValue(items: BarterItem[]): number {
    return items.reduce((sum, i) => sum + i.value * i.amount, 0)
}

function drawHeader(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
): void {
    ctx.font = '9px monospace'
    ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
    ctx.fillText(text, x, y + 10)
}
