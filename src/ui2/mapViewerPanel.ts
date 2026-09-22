/**
 * MapViewerPanel — in-browser hex/tile map authoring aid.
 *
 * Displays the hex and tile coordinates under the cursor together with a list
 * of the nearest visible objects on the current map. Useful when authoring
 * map scripts or placing objects without leaving the browser.
 *
 * Toggled globally with F5 (main.ts).  Panel name: 'mapViewer'.
 * Input-transparent observer: never blocks game input.
 *
 * Usage:
 *   const panel = new MapViewerPanel(screenWidth, screenHeight)
 *   uiManager.register(panel)
 *   panel.show()
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor, cssColor, drawUIFontText } from './uiPanel.js'
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
        // Observer overlay: must never block game input or open a modal state.
        this.inputTransparent = true
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

        // Cap the line count so the content cannot spill below the panel
        // (UIManager.render does not clip panels).
        const maxLines = Math.floor((height - 2 * PAD) / LINE_H)
        for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
            const [text, color] = lines[i]
            drawUIFontText(ctx, truncate(text, 26), PAD, PAD + (i + 1) * LINE_H, color, 9)
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// (cssColor now lives in uiPanel.ts)

function basename(path: string): string {
    const idx = path.lastIndexOf('/')
    return idx === -1 ? path : path.slice(idx + 1)
}

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) {return text}
    return `${text.slice(0, Math.max(0, maxLen - 3))}...`
}
