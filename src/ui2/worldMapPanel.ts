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
import globalState from '../globalState.js'
import { loadAreas } from '../data.js'

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
const LIST_BOTTOM_MARGIN = 56
const BTN_W        = 60
const BTN_H        = 22
const WORLD_VISIBLE_ROWS = Math.floor((PANEL_HEIGHT - LIST_Y - LIST_BOTTOM_MARGIN) / AREA_ROW_H)
const ENTRANCE_VISIBLE_ROWS = Math.floor((PANEL_HEIGHT - LIST_Y - LIST_BOTTOM_MARGIN) / ENTRANCE_ROW_H)

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
    /** Index of the keyboard-highlighted entrance row in area view (-1 = none). */
    private _keyboardSelectedEntranceIndex = -1

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
        this._keyboardSelectedEntranceIndex = -1

        if (!globalState.mapAreas) {
            try {
                globalState.mapAreas = loadAreas()
            } catch (e) {
                console.warn('worldMapPanel: loadAreas failed, skipping dynamic area population.')
            }
        }

        if (globalState.mapAreas) {
            // Apply save-loaded discovery overrides (if any)
            if (globalState.mapAreaStates) {
                for (const areaID in globalState.mapAreaStates) {
                    if (globalState.mapAreas[areaID]) {
                        globalState.mapAreas[areaID].state = globalState.mapAreaStates[areaID] === true
                    }
                }
            }

            this.areas = []
            for (const areaID in globalState.mapAreas) {
                const area = globalState.mapAreas[areaID]
                if (area.state === true) {
                    this.areas.push(area)
                }
            }
        }
    }

    /** Switch to area view for the given area. */
    showArea(area: WorldMapArea): void {
        this._currentArea  = area
        this.currentView   = 'area'
        this._scrollOffset = 0
        this._isTransitionLocked = false
        this._keyboardSelectedEntranceIndex = -1
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

        const worldRows = Math.min(this.areas.length, WORLD_VISIBLE_ROWS)
        strokeRect(ctx, LIST_X, LIST_Y, LIST_W, worldRows * AREA_ROW_H + 8, FALLOUT_DARK_GRAY, 1)

        const visibleAreas = this.areas.slice(this._scrollOffset, this._scrollOffset + WORLD_VISIBLE_ROWS)
        for (let i = 0; i < visibleAreas.length; i++) {
            const area = visibleAreas[i]
            const absIdx = this._scrollOffset + i
            const ry = LIST_Y + 4 + i * AREA_ROW_H
            const isKeySelected = absIdx === this._keyboardSelectedIndex
            // Highlight the keyboard-selected row.
            if (isKeySelected) {
                fillRect(ctx, LIST_X + 2, ry - 2, LIST_W - 4, AREA_ROW_H, FALLOUT_DARK_GRAY)
            }
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(isKeySelected ? FALLOUT_GREEN : FALLOUT_AMBER)
            ctx.fillText('▶ ' + area.name, LIST_X + 8, ry + 15)
        }

        drawScrollIndicator(ctx, this._scrollOffset, this.areas.length, WORLD_VISIBLE_ROWS)
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

        if (!area) {return}

        // Back button
        fillRect(ctx, LIST_X, LIST_Y - 26, 50, 18, FALLOUT_DARK_GRAY)
        strokeRect(ctx, LIST_X, LIST_Y - 26, 50, 18, FALLOUT_GREEN, 1)
        ctx.font = '10px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText('← BACK', LIST_X + 4, LIST_Y - 12)

        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('Entrances:', LIST_X, LIST_Y - 4)

        const entranceRows = Math.min(area.entrances.length, ENTRANCE_VISIBLE_ROWS)
        strokeRect(ctx, LIST_X, LIST_Y, LIST_W, entranceRows * ENTRANCE_ROW_H + 8, FALLOUT_DARK_GRAY, 1)

        const visibleEntrances = area.entrances.slice(this._scrollOffset, this._scrollOffset + ENTRANCE_VISIBLE_ROWS)
        for (let i = 0; i < visibleEntrances.length; i++) {
            const entrance = visibleEntrances[i]
            const absIdx = this._scrollOffset + i
            const ey = LIST_Y + i * ENTRANCE_ROW_H
            const isSelected = absIdx === this._keyboardSelectedEntranceIndex
            if (isSelected) {
                fillRect(ctx, LIST_X + 2, ey + 2, LIST_W - 4, ENTRANCE_ROW_H - 2, FALLOUT_DARK_GRAY)
            }
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(isSelected ? FALLOUT_AMBER : FALLOUT_GREEN)
            ctx.fillText(`▶ ${entrance.mapLookupName}`, LIST_X + 8, ey + 15)
        }

        if (area.entrances.length === 0) {
            ctx.font = '10px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText('[No entrances]', LIST_X, LIST_Y + 20)
        }

        drawScrollIndicator(ctx, this._scrollOffset, area.entrances.length, ENTRANCE_VISIBLE_ROWS)
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        if (this._isTransitionLocked) {return true}
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
            if (x >= LIST_X && x < LIST_X + LIST_W && y >= LIST_Y && y < LIST_Y + WORLD_VISIBLE_ROWS * AREA_ROW_H) {
                const idx = Math.floor((y - LIST_Y - 4) / AREA_ROW_H)
                const absIdx = idx + this._scrollOffset
                if (idx >= 0 && absIdx < this.areas.length) {
                    this._keyboardSelectedIndex = absIdx
                    this.showArea(this.areas[absIdx])
                }
            }
        } else {
            const area = this._currentArea
            if (!area) {return true}

            // Back button
            if (x >= LIST_X && x < LIST_X + 50 && y >= LIST_Y - 26 && y < LIST_Y - 8) {
                this.currentView   = 'world'
                this._currentArea  = null
                this._keyboardSelectedIndex = -1
                this._keyboardSelectedEntranceIndex = -1
                this._scrollOffset = 0
                return true
            }

            // Entrance clicks
            for (let i = 0; i < Math.min(area.entrances.length, ENTRANCE_VISIBLE_ROWS); i++) {
                const ey = LIST_Y + i * ENTRANCE_ROW_H
                if (y >= ey && y < ey + ENTRANCE_ROW_H && x >= LIST_X && x < LIST_X + LIST_W) {
                    const absIdx = this._scrollOffset + i
                    this._keyboardSelectedEntranceIndex = absIdx
                    EventBus.emit('worldMap:travelTo', { mapLookupName: area.entrances[absIdx].mapLookupName })
                    this.hide()
                    return true
                }
            }
        }

        return true
    }

    override onKeyDown(key: string): boolean {
        if (this._isTransitionLocked) {return true}
        if (key === 'Escape') {
            if (this.currentView === 'area') {
                this.currentView  = 'world'
                this._currentArea = null
                this._keyboardSelectedIndex = -1
                this._keyboardSelectedEntranceIndex = -1
                this._scrollOffset = 0
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
                    this._scrollOffset = clampListOffset(this._keyboardSelectedIndex, this._scrollOffset, WORLD_VISIBLE_ROWS)
                }
                return true
            }
            if (key === 'ArrowUp') {
                if (this._keyboardSelectedIndex > 0) {
                    this._keyboardSelectedIndex--
                    this._scrollOffset = clampListOffset(this._keyboardSelectedIndex, this._scrollOffset, WORLD_VISIBLE_ROWS)
                }
                return true
            }
            if (key === 'Enter' && this._keyboardSelectedIndex >= 0 && this._keyboardSelectedIndex < this.areas.length) {
                this.showArea(this.areas[this._keyboardSelectedIndex])
                return true
            }
        } else {
            const area = this._currentArea
            if (!area) {return true}
            if (key === 'ArrowDown') {
                if (area.entrances.length > 0) {
                    this._keyboardSelectedEntranceIndex = this._keyboardSelectedEntranceIndex < 0
                        ? 0
                        : Math.min(this._keyboardSelectedEntranceIndex + 1, area.entrances.length - 1)
                    this._scrollOffset = clampListOffset(
                        this._keyboardSelectedEntranceIndex,
                        this._scrollOffset,
                        ENTRANCE_VISIBLE_ROWS,
                    )
                }
                return true
            }
            if (key === 'ArrowUp') {
                if (this._keyboardSelectedEntranceIndex > 0) {
                    this._keyboardSelectedEntranceIndex--
                    this._scrollOffset = clampListOffset(
                        this._keyboardSelectedEntranceIndex,
                        this._scrollOffset,
                        ENTRANCE_VISIBLE_ROWS,
                    )
                }
                return true
            }
            if (
                key === 'Enter' &&
                this._keyboardSelectedEntranceIndex >= 0 &&
                this._keyboardSelectedEntranceIndex < area.entrances.length
            ) {
                EventBus.emit('worldMap:travelTo', {
                    mapLookupName: area.entrances[this._keyboardSelectedEntranceIndex].mapLookupName,
                })
                this.hide()
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
    lineWidth = 1,
): void {
    ctx.strokeStyle = cssColor(color)
    ctx.lineWidth = lineWidth
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

function clampListOffset(selectedIndex: number, currentOffset: number, visibleRows: number): number {
    if (selectedIndex < currentOffset) {return selectedIndex}
    if (selectedIndex >= currentOffset + visibleRows) {return selectedIndex - visibleRows + 1}
    return currentOffset
}

function drawScrollIndicator(
    ctx: OffscreenCanvasRenderingContext2D,
    scrollOffset: number,
    totalRows: number,
    visibleRows: number,
): void {
    if (totalRows <= visibleRows || visibleRows <= 0) {return}
    ctx.font = '9px monospace'
    ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
    ctx.fillText(
        `↑↓ ${scrollOffset + 1}-${Math.min(scrollOffset + visibleRows, totalRows)}/${totalRows}`,
        LIST_X,
        LIST_Y + visibleRows * AREA_ROW_H + 12,
    )
}
