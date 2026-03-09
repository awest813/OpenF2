/**
 * WorldMapPanel — WebGL-rendered world map overlay.
 *
 * Replaces the legacy DOM-based uiWorldMap / uiCloseWorldMap / uiWorldMapShowArea
 * with a ui2 panel rendered entirely via the OffscreenCanvas pipeline.
 *
 * Supports two sub-views:
 *   'world' — shows a list of discovered areas with clickable name labels
 *   'area'  — shows the area's entrance points as selectable hotspots
 *
 * EventBus events emitted:
 *   'worldMap:travelTo' — { mapLookupName } — player selected a map entrance
 *   'worldMap:closed'   — {} — player dismissed the panel
 *
 * Panel name: 'worldMap'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, UIColor } from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 500
const PANEL_HEIGHT = 400
const AREA_ROW_H   = 24
const ENTRANCE_ROW_H = 24
const LIST_X       = 16
const LIST_Y       = 48
const LIST_W       = 200
const BTN_W        = 60
const BTN_H        = 22

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorldMapEntrance {
    mapLookupName: string
    x: number
    y: number
}

export interface WorldMapArea {
    name: string
    id: number | string
    entrances: WorldMapEntrance[]
}

// ---------------------------------------------------------------------------
// WorldMapPanel
// ---------------------------------------------------------------------------

export class WorldMapPanel extends UIPanel {
    areas: WorldMapArea[] = []
    currentView: 'world' | 'area' = 'world'
    private _currentArea: WorldMapArea | null = null
    private _scrollOffset = 0
    private _isTransitionLocked = false
    /** Index of the keyboard-highlighted area row (-1 = none). */
    private _keyboardSelectedIndex = -1

    constructor(screenWidth: number, screenHeight: number) {
        super('worldMap', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 25
    }

    protected override onShow(): void {
        this.currentView  = 'world'
        this._currentArea  = null
        this._scrollOffset = 0
        this._isTransitionLocked = false
        this._keyboardSelectedIndex = -1
    }

    /** Switch to area view for the given area. */
    showArea(area: WorldMapArea): void {
        this._currentArea  = area
        this.currentView   = 'area'
        this._scrollOffset = 0
        this._isTransitionLocked = false
        this._keyboardSelectedIndex = -1
    }


    setTransitionLocked(locked: boolean): void {
        this._isTransitionLocked = locked
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        if (this.currentView === 'world') {
            this._renderWorldView(ctx, width, height)
        } else {
            this._renderAreaView(ctx, width, height)
        }

        // Close button
        const closeBtnX = width / 2 - BTN_W / 2
        const closeBtnY = height - 34
        fillRect(ctx, closeBtnX, closeBtnY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, closeBtnX, closeBtnY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        ctx.font = '11px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('CLOSE', width / 2, closeBtnY + 15)
        ctx.textAlign = 'left'
    }

    private _renderWorldView(
        ctx: OffscreenCanvasRenderingContext2D,
        width: number,
        _height: number,
    ): void {
        ctx.font = 'bold 13px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('WORLD MAP', width / 2, 22)
        ctx.textAlign = 'left'

        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('Select a destination:', LIST_X, LIST_Y - 6)

        strokeRect(ctx, LIST_X, LIST_Y, LIST_W, this.areas.length * AREA_ROW_H + 8, FALLOUT_DARK_GRAY, 1)

        for (let i = 0; i < this.areas.length; i++) {
            const area = this.areas[i]
            const ry = LIST_Y + 4 + i * AREA_ROW_H
            const isKeySelected = i === this._keyboardSelectedIndex
            // Highlight the keyboard-selected row.
            if (isKeySelected) {
                fillRect(ctx, LIST_X + 2, ry - 2, LIST_W - 4, AREA_ROW_H, FALLOUT_DARK_GRAY)
            }
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(isKeySelected ? FALLOUT_GREEN : FALLOUT_AMBER)
            ctx.fillText('▶ ' + area.name, LIST_X + 8, ry + 15)
        }
    }

    private _renderAreaView(
        ctx: OffscreenCanvasRenderingContext2D,
        width: number,
        _height: number,
    ): void {
        const area = this._currentArea
        ctx.font = 'bold 13px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText(area ? area.name.toUpperCase() : 'AREA MAP', width / 2, 22)
        ctx.textAlign = 'left'

        if (!area) return

        // Back button
        fillRect(ctx, LIST_X, LIST_Y - 26, 50, 18, FALLOUT_DARK_GRAY)
        strokeRect(ctx, LIST_X, LIST_Y - 26, 50, 18, FALLOUT_GREEN, 1)
        ctx.font = '10px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText('← BACK', LIST_X + 4, LIST_Y - 12)

        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('Entrances:', LIST_X, LIST_Y - 4)

        for (let i = 0; i < area.entrances.length; i++) {
            const entrance = area.entrances[i]
            const ey = LIST_Y + i * ENTRANCE_ROW_H
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            ctx.fillText(`▶ ${entrance.mapLookupName}`, LIST_X + 8, ey + 15)
        }

        if (area.entrances.length === 0) {
            ctx.font = '10px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText('[No entrances]', LIST_X, LIST_Y + 20)
        }
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        if (this._isTransitionLocked) return true
        const { width, height } = this.bounds

        // Close button
        const closeBtnX = width / 2 - BTN_W / 2
        const closeBtnY = height - 34
        if (x >= closeBtnX && x < closeBtnX + BTN_W && y >= closeBtnY && y < closeBtnY + BTN_H) {
            EventBus.emit('worldMap:closed', {})
            this.hide()
            return true
        }

        if (this.currentView === 'world') {
            // Area list clicks
            if (x >= LIST_X && x < LIST_X + LIST_W && y >= LIST_Y) {
                const idx = Math.floor((y - LIST_Y - 4) / AREA_ROW_H)
                if (idx >= 0 && idx < this.areas.length) {
                    this.showArea(this.areas[idx])
                }
            }
        } else {
            const area = this._currentArea
            if (!area) return true

            // Back button
            if (x >= LIST_X && x < LIST_X + 50 && y >= LIST_Y - 26 && y < LIST_Y - 8) {
                this.currentView   = 'world'
                this._currentArea  = null
                return true
            }

            // Entrance clicks
            for (let i = 0; i < area.entrances.length; i++) {
                const ey = LIST_Y + i * ENTRANCE_ROW_H
                if (y >= ey && y < ey + ENTRANCE_ROW_H && x >= LIST_X && x < LIST_X + LIST_W) {
                    EventBus.emit('worldMap:travelTo', { mapLookupName: area.entrances[i].mapLookupName })
                    this.hide()
                    return true
                }
            }
        }

        return true
    }

    override onKeyDown(key: string): boolean {
        if (this._isTransitionLocked) return true
        if (key === 'Escape') {
            if (this.currentView === 'area') {
                this.currentView  = 'world'
                this._currentArea = null
                this._keyboardSelectedIndex = -1
            } else {
                EventBus.emit('worldMap:closed', {})
                this.hide()
            }
            return true
        }
        // Keyboard navigation in the world-view area list.
        if (this.currentView === 'world') {
            if (key === 'ArrowDown') {
                if (this.areas.length > 0) {
                    this._keyboardSelectedIndex = this._keyboardSelectedIndex < 0
                        ? 0
                        : Math.min(this._keyboardSelectedIndex + 1, this.areas.length - 1)
                }
                return true
            }
            if (key === 'ArrowUp') {
                if (this._keyboardSelectedIndex > 0) {
                    this._keyboardSelectedIndex--
                }
                return true
            }
            if (key === 'Enter' && this._keyboardSelectedIndex >= 0 && this._keyboardSelectedIndex < this.areas.length) {
                this.showArea(this.areas[this._keyboardSelectedIndex])
                return true
            }
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
