/**
 * PrototypeInspectorPanel — in-browser PRO data viewer.
 *
 * Displays prototype data (PID, type, subtype, flags, and key stat values)
 * for an object that the engine has selected for inspection.  Intended for
 * use during map authoring or script debugging so modders can verify that
 * prototype attributes are correct without leaving the browser.
 *
 * Toggle with F7.  Panel name: 'protoInspector'.
 * Z-order 53.
 *
 * Usage:
 *   const panel = new PrototypeInspectorPanel(screenWidth, screenHeight)
 *   uiManager.register(panel)
 *   panel.setProto({ pid: 0x2000001, type: 'critter', subtype: null,
 *                    name: 'Raider', flags: 0, stats: { HP: 30, STR: 6 } })
 *   panel.show()
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor } from './uiPanel.js'

const PANEL_WIDTH  = 230
const PANEL_HEIGHT = 180
const PAD = 8
const LINE_H = 16
const MAX_STATS = 6

// ---------------------------------------------------------------------------
// ProtoSnapshot — engine-provided data for the currently selected object
// ---------------------------------------------------------------------------

export interface ProtoSnapshot {
    pid: number
    type: string
    subtype: string | null
    name: string
    /** Object flags bitmask (from PRO). */
    flags: number
    /** Arbitrary key→value stat pairs (up to MAX_STATS shown). */
    stats: { [key: string]: number | string }
}

// ---------------------------------------------------------------------------
// PrototypeInspectorPanel
// ---------------------------------------------------------------------------

export class PrototypeInspectorPanel extends UIPanel {
    private _proto: ProtoSnapshot | null = null

    constructor(screenWidth: number, screenHeight: number) {
        super('protoInspector', {
            x: screenWidth - PANEL_WIDTH - 4,
            y: screenHeight - PANEL_HEIGHT - 4,
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 53
    }

    /** Replace the currently displayed prototype snapshot. */
    setProto(proto: ProtoSnapshot | null): void {
        this._proto = proto
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
            ['PROTO INSPECTOR', FALLOUT_GREEN],
        ]

        if (this._proto) {
            const p = this._proto
            const pidHex = `0x${p.pid.toString(16).toUpperCase().padStart(8, '0')}`
            lines.push([`Name:    ${p.name}`, FALLOUT_AMBER])
            lines.push([`PID:     ${pidHex}`, FALLOUT_AMBER])
            lines.push([`Type:    ${p.type}${p.subtype ? `/${p.subtype}` : ''}`, FALLOUT_GREEN])
            lines.push([`Flags:   0x${p.flags.toString(16).toUpperCase()}`, FALLOUT_GREEN])
            const statEntries = Object.entries(p.stats).slice(0, MAX_STATS)
            for (const [key, val] of statEntries) {
                lines.push([`  ${key}: ${val}`, FALLOUT_GREEN])
            }
        } else {
            lines.push(['(no object selected)', FALLOUT_DARK_GRAY])
        }

        for (let i = 0; i < lines.length; i++) {
            const [text, color] = lines[i]
            ctx.fillStyle = cssColor(color)
            ctx.fillText(text, PAD, PAD + (i + 1) * LINE_H)
        }
    }

    override onKeyDown(key: string): boolean {
        if (key === 'F7') {
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
