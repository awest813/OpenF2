/**
 * GamePanel — the bottom HUD bar rendered via WebGL offscreen canvas.
 *
 * Displays:
 *  - Current HP / Max HP
 *  - Current AP bar (filled squares)
 *  - Equipped weapon name and ammo count
 *  - Player name
 *  - Action buttons (Inv, PipBoy, Char, Map, Options, Save)
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_RED, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor } from './uiPanel.js'
import { EntityManager } from '../ecs/entityManager.js'
import { StatsComponent } from '../ecs/components.js'

const PANEL_HEIGHT = 99

/** Button layout: label, EventBus panelName (or null for non-panel actions). */
const HUD_BUTTONS: Array<{ label: string; panel: string | null }> = [
    { label: 'INV',  panel: 'inventory' },
    { label: 'PIPBOY', panel: 'pipboy' },
    { label: 'CHAR', panel: 'characterScreen' },
    { label: 'MAP',  panel: 'worldMap' },
    { label: 'OPT',  panel: 'options' },
    { label: 'SAVE', panel: 'saveLoad' },
]

const BTN_W = 44
const BTN_H = 28
const BTN_GAP = 4

export class GamePanel extends UIPanel {
    private playerEntityId: number
    private playerName: string

    constructor(screenWidth: number, screenHeight: number, playerEntityId: number, playerName = 'VAULT DWELLER') {
        super('gamePanel', {
            x: 0,
            y: screenHeight - PANEL_HEIGHT,
            width: screenWidth,
            height: PANEL_HEIGHT,
        })
        this.playerEntityId = playerEntityId
        this.playerName = playerName
        this.zOrder = 0
        this.visible = true  // always visible
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background panel
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_DARK_GRAY)

        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        const inv = EntityManager.get<'inventory'>(this.playerEntityId, 'inventory')
        if (!stats) return

        // --- Player name ---
        drawLabel(ctx, 'NAME', 20, 14, FALLOUT_DARK_GRAY)
        drawValue(ctx, this.playerName, 20, 30, FALLOUT_GREEN)

        // --- HP display ---
        const hpColor = hpColorFor(stats)
        drawLabel(ctx, 'HP', 20, 50, FALLOUT_DARK_GRAY)
        drawValue(ctx, `${stats.currentHp}/${stats.maxHp}`, 20, 66, hpColor)

        // --- AP bar ---
        const maxAP = stats.maxAP
        const currentAP = EntityManager.get<'combat'>(this.playerEntityId, 'combat')?.combatAP ?? maxAP
        drawLabel(ctx, 'AP', 140, 14, FALLOUT_DARK_GRAY)
        drawAPBar(ctx, 140, 22, currentAP, maxAP)
        // Numeric AP value below the bar so players know the exact count.
        drawValue(ctx, `${currentAP}/${maxAP}`, 140, 50, FALLOUT_AMBER)

        // --- Equipped weapon ---
        const weaponPid = inv?.equippedWeaponPrimary
        const weaponLabel = weaponPid != null ? `PID:${weaponPid}` : 'None'
        drawLabel(ctx, 'WEAPON', 260, 14, FALLOUT_DARK_GRAY)
        drawValue(ctx, weaponLabel, 260, 30, FALLOUT_AMBER)

        // --- Action buttons ---
        const totalBtnW = HUD_BUTTONS.length * (BTN_W + BTN_GAP) - BTN_GAP
        const btnStartX = width - totalBtnW - 8
        for (let i = 0; i < HUD_BUTTONS.length; i++) {
            const bx = btnStartX + i * (BTN_W + BTN_GAP)
            drawButton(ctx, HUD_BUTTONS[i].label, bx, 60, BTN_W, BTN_H)
        }
    }

    override onMouseDown(x: number, y: number, button: 'l' | 'r'): boolean {
        if (y < 50) return false  // click in the status area, pass through

        // Action buttons region
        const { width } = this.bounds
        const totalBtnW = HUD_BUTTONS.length * (BTN_W + BTN_GAP) - BTN_GAP
        const btnStartX = width - totalBtnW - 8
        for (let i = 0; i < HUD_BUTTONS.length; i++) {
            const bx = btnStartX + i * (BTN_W + BTN_GAP)
            if (x >= bx && x < bx + BTN_W && y >= 60 && y < 60 + BTN_H) {
                this._onButtonClick(HUD_BUTTONS[i])
                return true
            }
        }
        return false
    }

    private _onButtonClick(btn: { label: string; panel: string | null }): void {
        if (!btn.panel) return
        const panelName = btn.panel
        import('../eventBus.js').then(({ EventBus }) => {
            EventBus.emit('audio:playSound', { soundId: 'ui_click' })
            EventBus.emit('ui:openPanel', { panelName })
        })
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
): void {
    ctx.strokeStyle = cssColor(color)
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

function drawLabel(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string, x: number, y: number,
    color: UIColor,
): void {
    ctx.font = '9px monospace'
    ctx.fillStyle = cssColor(color)
    ctx.fillText(text, x, y)
}

function drawValue(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string, x: number, y: number,
    color: UIColor,
): void {
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = cssColor(color)
    ctx.fillText(text, x, y)
}

function drawAPBar(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number, y: number,
    current: number, max: number,
): void {
    const squareSize = 7
    const gap = 2
    for (let i = 0; i < max; i++) {
        const sx = x + i * (squareSize + gap)
        const filled = i < current
        fillRect(ctx, sx, y, squareSize, squareSize, filled ? FALLOUT_AMBER : FALLOUT_DARK_GRAY)
        strokeRect(ctx, sx, y, squareSize, squareSize, FALLOUT_DARK_GRAY)
    }
}

function drawButton(
    ctx: OffscreenCanvasRenderingContext2D,
    label: string,
    x: number, y: number, w: number, h: number,
): void {
    fillRect(ctx, x, y, w, h, FALLOUT_DARK_GRAY)
    strokeRect(ctx, x, y, w, h, FALLOUT_GREEN)
    ctx.font = '10px monospace'
    ctx.fillStyle = cssColor(FALLOUT_GREEN)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
}

function hpColorFor(stats: StatsComponent): UIColor {
    const ratio = stats.currentHp / stats.maxHp
    if (ratio > 0.66) return FALLOUT_GREEN
    if (ratio > 0.33) return FALLOUT_AMBER
    return FALLOUT_RED
}
