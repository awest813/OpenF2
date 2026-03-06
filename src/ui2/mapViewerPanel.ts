/**
 * MapViewerPanel — in-browser hex/tile map authoring aid.
 *
 * Displays the hex and tile coordinates under the cursor together with a list
 * of the nearest visible objects on the current map. Useful when authoring
 * map scripts or placing objects without leaving the browser.
 *
 * Toggle with F5.  Panel name: 'mapViewer'.
 * Z-order 51 so it renders on top of the debug overlay.
 *
 * Usage:
 *   const panel = new MapViewerPanel(screenWidth, screenHeight)
 *   uiManager.register(panel)
 *   panel.show()
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor } from './uiPanel.js'
import { modRegistry } from '../mods.js'

const PANEL_WIDTH  = 220
const PANEL_HEIGHT = 240
const PAD = 8
const LINE_H = 16
const MAX_NEARBY = 5
const MAX_MODS = 3
const MAX_RESOLVED_OVERRIDES = 3

export interface MapViewerCursorInfo {
    /** Hex grid coordinates under the cursor. */
    hexX: number
    hexY: number
    /** Tile grid coordinates under the cursor. */
    tileX: number
    tileY: number
    /** PID or name strings for nearby objects (closest first). */
    nearbyObjects: string[]
    /** Current elevation shown on screen. */
    elevation: number
}

// ---------------------------------------------------------------------------
// MapViewerPanel
// ---------------------------------------------------------------------------

export class MapViewerPanel extends UIPanel {
    /** Live cursor info updated by the engine each frame. */
    cursorInfo: MapViewerCursorInfo | null = null

    constructor(screenWidth: number, screenHeight: number) {
        super('mapViewer', {
            x: 4,
            y: screenHeight - PANEL_HEIGHT - 4,
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 51
    }

    override render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        ctx.globalAlpha = 0.80
        ctx.fillStyle = cssColor(FALLOUT_BLACK)
        ctx.fillRect(0, 0, width, height)
        ctx.globalAlpha = 1.0

        ctx.strokeStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.lineWidth = 1
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1)

        ctx.font = '9px monospace'

        const lines: Array<[string, UIColor]> = [
            ['MAP VIEWER', FALLOUT_GREEN],
        ]

        if (this.cursorInfo) {
            const ci = this.cursorInfo
            lines.push([`Hex:  (${ci.hexX}, ${ci.hexY})`, FALLOUT_AMBER])
            lines.push([`Tile: (${ci.tileX}, ${ci.tileY})`, FALLOUT_AMBER])
            lines.push([`Elev: ${ci.elevation}`, FALLOUT_GREEN])
            lines.push([`Nearby (${ci.nearbyObjects.length}):`, FALLOUT_GREEN])
            const shown = ci.nearbyObjects.slice(0, MAX_NEARBY)
            for (const name of shown) {
                lines.push([`  ${name}`, FALLOUT_DARK_GRAY])
            }
        } else {
            lines.push(['no cursor data', FALLOUT_DARK_GRAY])
        }

        const modsByPriority = modRegistry.getActiveByPriority().slice(0, MAX_MODS)
        lines.push(['Mods (high→low):', FALLOUT_GREEN])
        if (modsByPriority.length === 0) {
            lines.push(['  (none)', FALLOUT_DARK_GRAY])
        } else {
            for (const mod of modsByPriority) {
                lines.push([`  ${mod.id}@${mod.version}`, FALLOUT_AMBER])
            }
        }

        const resolvedOverrides = modRegistry.getResolvedOverrides(MAX_RESOLVED_OVERRIDES)
        lines.push(['Overrides:', FALLOUT_GREEN])
        if (resolvedOverrides.length === 0) {
            lines.push(['  (none)', FALLOUT_DARK_GRAY])
        } else {
            for (const o of resolvedOverrides) {
                const conflictSuffix = o.overriddenModIds.length > 0 ? ` [>${o.overriddenModIds.join(',')}]` : ''
                lines.push([`  ${basename(o.canonicalPath)}→${o.winnerModId}${conflictSuffix}`, FALLOUT_DARK_GRAY])
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const [text, color] = lines[i]
            ctx.fillStyle = cssColor(color)
            ctx.fillText(text, PAD, PAD + (i + 1) * LINE_H)
        }
    }

    override onKeyDown(key: string): boolean {
        if (key === 'F5') {
            this.toggle()
            return true
        }
        return false
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cssColor(c: UIColor): string {
    return `rgba(${c.r},${c.g},${c.b},${c.a / 255})`
}

function basename(path: string): string {
    const idx = path.lastIndexOf('/')
    return idx === -1 ? path : path.slice(idx + 1)
}
