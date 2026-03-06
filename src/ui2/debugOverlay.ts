/**
 * DebugOverlayPanel — in-browser debug information overlay.
 *
 * Displays live engine state useful during development:
 *   - Current player HP/AP
 *   - Entity count
 *   - Rendering frame counter
 *   - Current map name (if provided)
 *
 * Toggled by Config.ui.showDebugOverlay. Panel name: 'debug'.
 * Z-order 50 so it renders on top of all other panels.
 *
 * Usage:
 *   const dbg = new DebugOverlayPanel(screenWidth, screenHeight)
 *   uiManager.register(dbg)
 *   dbg.show()  // or driven by Config.ui.showDebugOverlay
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor } from './uiPanel.js'
import { EntityManager } from '../ecs/entityManager.js'

const PANEL_WIDTH  = 200
const PANEL_HEIGHT = 170
const PAD = 8
const LINE_H = 16

// ---------------------------------------------------------------------------
// DebugOverlayPanel
// ---------------------------------------------------------------------------

export class DebugOverlayPanel extends UIPanel {
    private playerEntityId: number
    private _frameCount = 0
    /** Optional map name set by the engine when a new map loads. */
    mapName: string | null = null
    private _scriptRuntimeProvider: (() => { currentProcedure: string | null, recentLog: readonly string[] }) | null = null

    constructor(screenWidth: number, screenHeight: number, playerEntityId: number) {
        super('debug', {
            x: screenWidth - PANEL_WIDTH - 4,
            y: 4,
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.playerEntityId = playerEntityId
        this.zOrder = 50
    }

    setScriptRuntimeProvider(provider: (() => { currentProcedure: string | null, recentLog: readonly string[] }) | null): void {
        this._scriptRuntimeProvider = provider
    }

    override render(ctx: OffscreenCanvasRenderingContext2D): void {
        this._frameCount++
        const { width, height } = this.bounds

        // Semi-transparent background
        ctx.globalAlpha = 0.75
        ctx.fillStyle = cssColor(FALLOUT_BLACK)
        ctx.fillRect(0, 0, width, height)
        ctx.globalAlpha = 1.0

        ctx.strokeStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.lineWidth = 1
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1)

        ctx.font = '9px monospace'

        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        const combat = EntityManager.get<'combat'>(this.playerEntityId, 'combat')
        let entityCount = 0
        for (const _id of EntityManager.allIds()) entityCount++

        const runtime = this._scriptRuntimeProvider?.()
        const recentLog = runtime && runtime.recentLog.length > 0
            ? runtime.recentLog[runtime.recentLog.length - 1]
            : undefined

        const lines: Array<[string, UIColor]> = [
            ['DEBUG OVERLAY', FALLOUT_GREEN],
            [`HP: ${stats ? `${stats.currentHp}/${stats.maxHp}` : 'n/a'}`, stats ? hpColor(stats.currentHp, stats.maxHp) : FALLOUT_DARK_GRAY],
            [`AP: ${combat ? `${combat.combatAP}/${stats?.maxAP ?? '?'}` : 'n/a'}`, FALLOUT_AMBER],
            [`Entities: ${entityCount}`, FALLOUT_GREEN],
            [`Frame: ${this._frameCount}`, FALLOUT_GREEN],
            [`Map: ${this.mapName ?? 'none'}`, FALLOUT_GREEN],
            [`Proc: ${runtime?.currentProcedure ?? 'none'}`, FALLOUT_AMBER],
            [`ScriptLog: ${truncate(recentLog ?? '(no messages)', 26)}`, FALLOUT_DARK_GRAY],
        ]

        for (let i = 0; i < lines.length; i++) {
            const [text, color] = lines[i]
            ctx.fillStyle = cssColor(color)
            ctx.fillText(text, PAD, PAD + (i + 1) * LINE_H)
        }
    }

    override onKeyDown(key: string): boolean {
        if (key === '`' || key === 'F3') {
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

function hpColor(current: number, max: number): UIColor {
    const ratio = max > 0 ? current / max : 0
    if (ratio > 0.66) return FALLOUT_GREEN
    if (ratio > 0.33) return FALLOUT_AMBER
    return { r: 195, g: 0, b: 0, a: 255 }
}

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return `${text.slice(0, Math.max(0, maxLen - 3))}...`
}
