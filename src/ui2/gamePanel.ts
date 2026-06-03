/**
 * GamePanel — the bottom HUD bar rendered via WebGL offscreen canvas.
 *
 * Displays:
 *  - Current HP / Max HP
 *  - Current AP bar (filled squares)
 *  - Equipped weapon name (resolved via prototype lookup) and ammo count
 *  - Player name
 *  - Action buttons (Inv, PipBoy, Char, Map, Options, Save)
 *  - END TURN button when in combat
 *  - Optional scrollable combat message log overlay (toggle with L)
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_RED, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor, cssColor, fillRect, strokeRect } from './uiPanel.js'
import { EntityManager } from '../ecs/entityManager.js'
import { StatsComponent } from '../ecs/components.js'
import { EventBus } from '../eventBus.js'
import { getMessage } from '../util.js'
import { loadPRO } from '../pro.js'
import globalState from '../globalState.js'

const PANEL_HEIGHT = 99
const LOG_PANEL_HEIGHT = 200
const MAX_LOG_LINES = 50
const LOG_VISIBLE_ROWS = 14

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
const END_TURN_W = 64
const END_TURN_H = 28

/**
 * Resolve a prototype ID to a human-readable item name. Falls back to a
 * formatted `PID:0xHEX` string when the prototype data is unavailable
 * (e.g. in tests, or for an unknown PID). Mirrors the lookup used by
 * `Obj.fromPID_` so the HUD shows the same name as the inventory.
 */
function getItemName(pid: number | null | undefined): string {
    if (pid == null) {return 'None'}
    const pidID = pid & 0xffff
    const pro: any = loadPRO(pid, pidID)
    if (pro != null && typeof pro.textID === 'number') {
        const name = getMessage('pro_item', pro.textID)
        if (name) {return name}
    }
    return `PID:0x${pid.toString(16).toUpperCase().padStart(8, '0')}`
}

export class GamePanel extends UIPanel {
    private playerEntityId: number
    private playerName: string
    private _originalBounds: { x: number; y: number; width: number; height: number }
    private _logVisible = false
    private _logScrollOffset = 0
    private _combatLog: string[] = []
    /** True when the engine has indicated we are inside a combat encounter. */
    private _isInCombat = false
    /** True when it is the player's turn (controls END TURN availability). */
    private _isPlayerTurn = false

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
        this._originalBounds = { ...this.bounds }
        this._subscribeCombatEvents()
    }

    private _subscribeCombatEvents(): void {
        EventBus.on('combat:start', () => {
            this._isInCombat = true
            this._combatLog.push('-- combat started --')
            this._truncateLog()
        })
        EventBus.on('combat:end', () => {
            this._combatLog.push('-- combat ended --')
            this._truncateLog()
            this._isInCombat = false
            this._isPlayerTurn = false
            this._logScrollOffset = 0
        })
        EventBus.on('combat:turnStart', (payload) => {
            this._isPlayerTurn = payload.isPlayer
            const who = payload.isPlayer ? 'You' : `Entity#${payload.entityId}`
            this._combatLog.push(`> ${who}'s turn`)
            this._truncateLog()
        })
        EventBus.on('combat:turnEnd', (payload) => {
            const who = payload.entityId === this.playerEntityId ? 'You' : `Entity#${payload.entityId}`
            this._combatLog.push(`  ${who} ends turn`)
            this._truncateLog()
        })
        EventBus.on('combat:hit', (payload) => {
            this._combatLog.push(`* hit for ${payload.damage} ${payload.damageType} dmg`)
            this._truncateLog()
        })
        EventBus.on('combat:miss', () => {
            this._combatLog.push('* miss')
            this._truncateLog()
        })
        EventBus.on('combat:death', () => {
            this._combatLog.push('X death')
            this._truncateLog()
        })
    }

    private _truncateLog(): void {
        if (this._combatLog.length > MAX_LOG_LINES) {
            this._combatLog = this._combatLog.slice(-MAX_LOG_LINES)
            // Keep the scroll offset valid after truncation.
            const maxOffset = Math.max(0, this._combatLog.length - LOG_VISIBLE_ROWS)
            if (this._logScrollOffset > maxOffset) {this._logScrollOffset = maxOffset}
        }
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        if (this._logVisible) {
            this._renderLog(ctx)
            return
        }
        this._renderHud(ctx)
    }

    private _renderHud(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background panel
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_DARK_GRAY)

        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        const inv = EntityManager.get<'inventory'>(this.playerEntityId, 'inventory')
        if (!stats) {return}

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

        // --- Equipped weapon (resolved prototype name) ---
        const weaponPid = inv?.equippedWeaponPrimary
        const weaponName = getItemName(weaponPid)
        const weaponTrunc = weaponName.length > 22 ? weaponName.slice(0, 22) : weaponName
        drawLabel(ctx, 'WEAPON', 260, 14, FALLOUT_DARK_GRAY)
        drawValue(ctx, weaponTrunc, 260, 30, FALLOUT_AMBER)

        // --- END TURN button (combat only) ---
        // Positioned just left of the HUD buttons so the layout still fits.
        const totalBtnW = HUD_BUTTONS.length * (BTN_W + BTN_GAP) - BTN_GAP
        const btnStartX = width - totalBtnW - 8
        if (this._isInCombat) {
            const endTurnX = btnStartX - END_TURN_W - BTN_GAP
            const canEndTurn = this._isPlayerTurn
            drawButton(
                ctx, canEndTurn ? 'END TURN' : '...',
                endTurnX, 60, END_TURN_W, END_TURN_H,
                canEndTurn ? FALLOUT_AMBER : FALLOUT_DARK_GRAY,
                FALLOUT_AMBER,
            )
            this._endTurnButtonRect = { x: endTurnX, y: 60, w: END_TURN_W, h: END_TURN_H }
        } else {
            this._endTurnButtonRect = null
        }

        // --- Action buttons ---
        for (let i = 0; i < HUD_BUTTONS.length; i++) {
            const bx = btnStartX + i * (BTN_W + BTN_GAP)
            drawButton(ctx, HUD_BUTTONS[i].label, bx, 60, BTN_W, BTN_H, FALLOUT_DARK_GRAY, FALLOUT_GREEN)
        }
    }

    private _renderLog(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_DARK_GRAY)

        // Title
        drawLabel(ctx, 'COMBAT LOG  (L to close, \u2191\u2193 to scroll)', 12, 14, FALLOUT_GREEN)

        // Visible rows
        const startY = 32
        const rowH = 12
        const visibleCount = Math.min(LOG_VISIBLE_ROWS, this._combatLog.length)
        for (let i = 0; i < visibleCount; i++) {
            const msgIdx = this._logScrollOffset + i
            const msg = this._combatLog[msgIdx]
            if (!msg) {continue}
            const color = msg.startsWith('X')
                ? FALLOUT_RED
                : msg.startsWith('*')
                    ? FALLOUT_AMBER
                    : msg.startsWith('>')
                        ? FALLOUT_GREEN
                        : FALLOUT_DARK_GRAY
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(color)
            ctx.fillText(msg, 12, startY + i * rowH)
        }

        // Scroll indicator
        if (this._combatLog.length > LOG_VISIBLE_ROWS) {
            const from = this._logScrollOffset + 1
            const to   = Math.min(this._logScrollOffset + LOG_VISIBLE_ROWS, this._combatLog.length)
            ctx.font = '9px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText(
                `${from}-${to} / ${this._combatLog.length}`,
                width - 80, height - 6,
            )
        }

        // End turn button (also visible from log)
        const canEndTurn = this._isInCombat && this._isPlayerTurn
        const endTurnX = width - END_TURN_W - 8
        const endTurnY = 8
        drawButton(
            ctx, canEndTurn ? 'END TURN' : '...',
            endTurnX, endTurnY, END_TURN_W, END_TURN_H,
            canEndTurn ? FALLOUT_AMBER : FALLOUT_DARK_GRAY,
            FALLOUT_AMBER,
        )
        this._endTurnButtonRect = { x: endTurnX, y: endTurnY, w: END_TURN_W, h: END_TURN_H }
    }

    private _endTurnButtonRect: { x: number; y: number; w: number; h: number } | null = null

    override onMouseDown(x: number, y: number, button: 'l' | 'r'): boolean {
        // END TURN click — only meaningful during the player's combat turn.
        if (this._endTurnButtonRect) {
            const r = this._endTurnButtonRect
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
                if (this._isInCombat && this._isPlayerTurn) {
                    this._endPlayerTurn()
                }
                return true
            }
        }

        if (this._logVisible) {
            // Clicks in the log area don't open other panels; consume to keep
            // the player inside the log overlay.
            return true
        }

        if (y < 50) {return false}  // click in the status area, pass through

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

    override onKeyDown(key: string): boolean {
        if (key === 'l' || key === 'L') {
            this._toggleLog()
            return true
        }
        if (this._logVisible) {
            if (key === 'ArrowUp') {
                this._logScrollOffset = Math.max(0, this._logScrollOffset - 1)
                return true
            }
            if (key === 'ArrowDown') {
                const maxOffset = Math.max(0, this._combatLog.length - LOG_VISIBLE_ROWS)
                this._logScrollOffset = Math.min(maxOffset, this._logScrollOffset + 1)
                return true
            }
            if (key === 'PageUp') {
                this._logScrollOffset = Math.max(0, this._logScrollOffset - LOG_VISIBLE_ROWS)
                return true
            }
            if (key === 'PageDown') {
                const maxOffset = Math.max(0, this._combatLog.length - LOG_VISIBLE_ROWS)
                this._logScrollOffset = Math.min(maxOffset, this._logScrollOffset + LOG_VISIBLE_ROWS)
                return true
            }
            if (key === 'End') {
                this._logScrollOffset = Math.max(0, this._combatLog.length - LOG_VISIBLE_ROWS)
                return true
            }
            if (key === 'Home') {
                this._logScrollOffset = 0
                return true
            }
        }
        if (key === 'e' || key === 'E') {
            if (this._isInCombat && this._isPlayerTurn) {
                this._endPlayerTurn()
                return true
            }
        }
        return false
    }

    private _toggleLog(): void {
        this._logVisible = !this._logVisible
        if (this._logVisible) {
            // Grow the panel upward to accommodate the log overlay.
            const screenBottom = this._originalBounds.y + this._originalBounds.height
            this.bounds = {
                x: this._originalBounds.x,
                y: screenBottom - LOG_PANEL_HEIGHT,
                width: this._originalBounds.width,
                height: LOG_PANEL_HEIGHT,
            }
            // Snap scroll to the most recent log entries.
            this._logScrollOffset = Math.max(0, this._combatLog.length - LOG_VISIBLE_ROWS)
        } else {
            this.bounds = { ...this._originalBounds }
        }
    }

    private _endPlayerTurn(): void {
        if (globalState.combat && globalState.combat.inPlayerTurn) {
            EventBus.emit('audio:playSound', { soundId: 'ui_click' })
            globalState.combat.nextTurn()
        }
    }

    /** Append a message to the combat log (exposed for tests). */
    pushLogMessage(msg: string): void {
        this._combatLog.push(msg)
        this._truncateLog()
    }

    /** Test/debug inspection: current combat log. */
    getCombatLog(): readonly string[] {
        return this._combatLog
    }

    /** Test/debug inspection: log visibility. */
    isLogVisible(): boolean {
        return this._logVisible
    }

    /** Test/debug inspection: log scroll offset. */
    getLogScrollOffset(): number {
        return this._logScrollOffset
    }

    private _onButtonClick(btn: { label: string; panel: string | null }): void {
        if (!btn.panel) {return}
        const panelName = btn.panel
        EventBus.emit('audio:playSound', { soundId: 'ui_click' })
        EventBus.emit('ui:openPanel', { panelName })
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// (cssColor / fillRect / strokeRect now live in uiPanel.ts)

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
    bg: UIColor, border: UIColor,
): void {
    fillRect(ctx, x, y, w, h, bg)
    strokeRect(ctx, x, y, w, h, border)
    ctx.font = '10px monospace'
    ctx.fillStyle = cssColor(border)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
}

function hpColorFor(stats: StatsComponent): UIColor {
    const ratio = stats.currentHp / stats.maxHp
    if (ratio > 0.66) {return FALLOUT_GREEN}
    if (ratio > 0.33) {return FALLOUT_AMBER}
    return FALLOUT_RED
}
