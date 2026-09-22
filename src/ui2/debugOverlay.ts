/**
 * DebugOverlayPanel — in-browser debug information overlay.
 *
 * Displays live engine state useful during development:
 *   - Current player HP/AP
 *   - Entity count
 *   - Rendering frame counter
 *   - Current map name (if provided)
 *
 * Toggled globally with F3 (main.ts) or initially via Config.ui.showDebugOverlay.
 * The overlay is input-transparent: it observes the game without stealing
 * clicks or keys from it.  Panel name: 'debug'.
 *
 * Usage:
 *   const dbg = new DebugOverlayPanel(screenWidth, screenHeight)
 *   uiManager.register(dbg)
 *   dbg.show()  // or driven by Config.ui.showDebugOverlay / F3
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_RED, UIColor, cssColor, drawUIFontText } from './uiPanel.js'
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
        // Observer overlay: must never block game input or open a modal state.
        this.inputTransparent = true
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

        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        const combat = EntityManager.get<'combat'>(this.playerEntityId, 'combat')
        let entityCount = 0
        for (const _id of EntityManager.allIds()) {entityCount++}

        const runtime = this._scriptRuntimeProvider?.()
        const recentLog = runtime && runtime.recentLog.length > 0
            ? runtime.recentLog[runtime.recentLog.length - 1]
            : undefined

        const lines: Array<[string, UIColor]> = [
            ['DEBUG OVERLAY (F3)', FALLOUT_GREEN],
            [`HP: ${stats ? `${stats.currentHp}/${stats.maxHp}` : 'n/a'}`, stats ? hpColor(stats.currentHp, stats.maxHp) : FALLOUT_DARK_GRAY],
            [`AP: ${combat ? `${combat.combatAP}/${stats?.maxAP ?? '?'}` : 'n/a'}`, FALLOUT_AMBER],
            [`Entities: ${entityCount}`, FALLOUT_GREEN],
            [`Frame: ${this._frameCount}`, FALLOUT_GREEN],
            [`Map: ${truncate(this.mapName ?? 'none', 22)}`, FALLOUT_GREEN],
            [`Proc: ${truncate(runtime?.currentProcedure ?? 'none', 22)}`, FALLOUT_AMBER],
            [`ScriptLog: ${truncate(recentLog ?? '(no messages)', 22)}`, FALLOUT_DARK_GRAY],
        ]

        for (let i = 0; i < lines.length; i++) {
            const [text, color] = lines[i]
            drawUIFontText(ctx, text, PAD, PAD + (i + 1) * LINE_H, color, 9)
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// (cssColor now lives in uiPanel.ts)

function hpColor(current: number, max: number): UIColor {
    const ratio = max > 0 ? current / max : 0
    if (ratio > 0.66) {return FALLOUT_GREEN}
    if (ratio > 0.33) {return FALLOUT_AMBER}
    return FALLOUT_RED
}

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) {return text}
    return `${text.slice(0, Math.max(0, maxLen - 3))}...`
}
